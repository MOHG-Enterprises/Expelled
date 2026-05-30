import Phaser from 'phaser';
import { io } from '../socketClient';
import type { Socket } from '../socketClient';
import {
  ON_HIT_SPRINT_MS,
  SCRATCH_MARKS_SELF_VISIBLE,
  HACK_FAIL_LOCK_MS,
  BLEED_OUT_MS,
  MOVE_EMIT_RATE_MS,
  WORLD_WIDTH, WORLD_HEIGHT, MAP_SCALE,
  TERROR_RADIUS,
  ENDGAME_DURATION_MS,
} from '../constants';
import type { Role, GamePhase, GameState, TerminalId, GateId } from '../types';
import { buildTilemap, preloadMapAssets, COLLISION_LAYERS } from '../mapConfig';
import { InputManager }    from '../game/InputManager';
import { MovementSystem }  from '../game/MovementSystem';
import { CombatSystem }    from '../game/CombatSystem';
import { HackingSystem }   from '../game/HackingSystem';
import { SkillCheck }      from '../game/SkillCheck';
import { FogOfWar }        from '../game/FogOfWar';
import { HUD }             from '../game/HUD';
import { TerminalManager } from '../game/TerminalManager';
import { PlayerManager }   from '../game/PlayerManager';
import { ScratchMarkManager } from '../game/ScratchMarkManager';
import { VoiceManager }       from '../game/VoiceManager';
import { ExitGateManager }    from '../game/ExitGateManager';
import { InteractionPromptManager } from '../game/InteractionPromptManager';
import {
  applySkinToSprite,
  applySkinByIdToSprite,
  applyDownedFrameById,
  ensurePlayerSkinAnimations,
  getSkinById,
  getSkinForRole,
  type MoveDirection,
  playRoleAnimation,
  playSkinAnimation,
  playHurtFallById,
  preloadPlayerSkins,
} from '../game/playerSkins';

interface PostGameStats {
  [socketId: string]: {
    role: 'survivor' | 'professor';
    outcome?: 'escaped' | 'expelled' | 'downed';
    hackContributed?: number;
    timesDown?: number;
    healsGiven?: number;
    hitsLanded?: number;
    downedCount?: number;
    expelledCount?: number;
  };
}

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private player!: Phaser.Physics.Arcade.Sprite;

  private myRole:       Role | null = null;
  private mySkinId     = '';
  private survivorMeta = new Map<string, { name: string; skinId: string }>();
  private myHp         = 2;
  private downed       = false;
  private expelled     = false;
  private escaped      = false;
  private inputFrozen  = false;
  private staggerTimer = 0;
  private isHitStagger = false;

  private bloodlustTier: 0 | 1 | 2 | 3 = 0;
  private sprinting        = false;
  private onHitSprintTimer = 0;

  private beingHealed    = false;
  private myDownCount:   0 | 1 | 2 = 0;
  private myHealPct      = 0;
  private myDownBleedMs  = 0;

  private terminalsNeeded = 5;

  private survivorOrder: string[] = [];
  private survivorInfo = new Map<string, {
    hp: number; downed: boolean; expelled: boolean; escaped: boolean;
    hacking: boolean; downCount: 0|1|2; healPct: number; beingHealed: boolean;
  }>();
  private survivorBleedMs = new Map<string, number>();

  private lastMoveEmit   = 0;
  private lastEmittedDir: MoveDirection = 'down';

  private mapWorldWidth  = WORLD_WIDTH;
  private mapWorldHeight = WORLD_HEIGHT;
  private mapRef: Phaser.Tilemaps.Tilemap | null = null;
  private collisionDebugGraphics:   Phaser.GameObjects.Graphics | null = null;
  private playerBodyDebugGraphics:  Phaser.GameObjects.Graphics | null = null;
  private collisionDebugEnabled     = false;
  private lastCollisionLogAt: Record<string, number> = {};

  private endgameReceivedAt: number | null = null;
  private endgameBellsRung = new Set<number>();

  private skillCheck!:  SkillCheck;
  private fog!:         FogOfWar;
  private hud!:         HUD;
  private terminals!:   TerminalManager;
  private players!:     PlayerManager;
  private gates!:       ExitGateManager;
  private scratchMarks!: ScratchMarkManager;
  private voiceManager:  VoiceManager | null = null;

  private inputManager!:   InputManager;
  private movement!:       MovementSystem;
  private combat!:         CombatSystem;
  private hacking!:        HackingSystem;
  private promptManager!:  InteractionPromptManager;

  constructor() { super('GameScene'); }

  private static readonly SURVIVOR_SKIN_SLOTS = ['arthur', 'gustavo', 'giu', 'isabela'] as const;

  // ── Debug helpers ──────────────────────────────────────────────────────────

  private toggleCollisionDebug() {
    if (!this.mapRef) return;
    console.log(this.player.x, this.player.y);
    this.collisionDebugEnabled = !this.collisionDebugEnabled;
    if (this.collisionDebugEnabled) {
      if (!this.collisionDebugGraphics) {
        this.collisionDebugGraphics = this.add.graphics().setDepth(20);
      }
      this.collisionDebugGraphics.clear();
      this.mapRef.layers.forEach((layerData) => {
        if (!COLLISION_LAYERS.has(layerData.name)) return;
        const layer = this.mapRef!.getLayer(layerData.name)?.tilemapLayer;
        if (!layer) return;
        layer.forEachTile((tile) => {
          if (!tile.collides) return;
          this.collisionDebugGraphics!.fillStyle(0xff5050, 0.35);
          this.collisionDebugGraphics!.fillRect(
            tile.pixelX * MAP_SCALE, tile.pixelY * MAP_SCALE,
            tile.width * MAP_SCALE, tile.height * MAP_SCALE,
          );
        });
      });
      if (!this.playerBodyDebugGraphics) {
        this.playerBodyDebugGraphics = this.add.graphics().setDepth(25);
      }
      this.playerBodyDebugGraphics.setVisible(true);
      this.hud.flash('Debug colisao: ON', 0xffcc00, 900);
      return;
    }
    this.collisionDebugGraphics?.clear();
    this.playerBodyDebugGraphics?.setVisible(false);
    this.hud.flash('Debug colisao: OFF', 0xffcc00, 900);
  }

  private logCollisionLayer(layerName: string, tile: Phaser.Tilemaps.Tile) {
    const now  = this.time.now;
    const last = this.lastCollisionLogAt[layerName] ?? -Infinity;
    if (now - last < 350) return;
    this.lastCollisionLogAt[layerName] = now;
    console.log(`[collision] layer=${layerName} tile=(${tile.x},${tile.y}) index=${tile.index}`);
  }

  // ── HUD helpers ────────────────────────────────────────────────────────────

  private refreshSurvivorHUD() {
    const statuses = this.survivorOrder.map((id, i) => {
      const info = this.survivorInfo.get(id) ?? {
        hp: 2, downed: false, expelled: false, escaped: false,
        hacking: false, downCount: 0 as const, healPct: 0, beingHealed: false,
      };
      const meta    = this.survivorMeta.get(id);
      const label   = meta?.name   || `A${i + 1}`;
      const skinId  = meta?.skinId || (GameScene.SURVIVOR_SKIN_SLOTS[i] ?? 'arthur');
      const bleedMs = this.survivorBleedMs.get(id) ?? 0;
      return { label, skinId, bleedMs, ...info };
    });
    const showHealPct = this.myRole === 'survivor';
    this.hud.setSurvivorStatuses(statuses, showHealPct, showHealPct);
  }

  private refreshTerminalHUD() {
    const { done } = this.terminals.getCount();
    this.hud.setTerminalCount(done, this.terminalsNeeded);
  }

  private trackSurvivor(id: string, info: {
    hp: number; downed: boolean; expelled: boolean; escaped: boolean;
    downCount?: 0|1|2; healPct?: number; beingHealed?: boolean;
  }) {
    if (!this.survivorOrder.includes(id)) this.survivorOrder.push(id);
    const existing = this.survivorInfo.get(id);
    this.survivorInfo.set(id, {
      hacking:     existing?.hacking     ?? false,
      downCount:   existing?.downCount   ?? 0,
      healPct:     existing?.healPct     ?? 0,
      beingHealed: existing?.beingHealed ?? false,
      ...info,
    });
  }

  // ── State reset ────────────────────────────────────────────────────────────

  private resetLocalState() {
    this.myRole          = null;
    this.myHp            = 2;
    this.downed          = false;
    this.expelled        = false;
    this.escaped         = false;
    this.inputFrozen     = false;
    this.staggerTimer    = 0;
    this.isHitStagger    = false;
    this.bloodlustTier   = 0;
    this.sprinting       = false;
    this.onHitSprintTimer = 0;
    this.beingHealed     = false;
    this.myDownCount     = 0;
    this.myHealPct       = 0;
    this.myDownBleedMs   = 0;
    this.lastMoveEmit    = 0;
    this.endgameReceivedAt = null;
    this.endgameBellsRung.clear();
    this.survivorOrder = [];
    this.survivorInfo.clear();
    this.survivorMeta.clear();
    this.survivorBleedMs.clear();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  preload() {
    this.load.tilemapTiledJSON('school-map', './maps/mapa.phaser.json');
    this.load.spritesheet('computer-terminal-sheet', './Computer Room Spritesheet 1 (1).png', {
      frameWidth: 32, frameHeight: 32,
    });
    this.load.spritesheet('professor-slash', './personagens/professor/slash_128.png', {
      frameWidth: 128, frameHeight: 128,
    });
    this.load.spritesheet('professor-hurt', './personagens/professor/hurt.png', {
      frameWidth: 64, frameHeight: 64,
    });
    preloadMapAssets(this);
    preloadPlayerSkins(this);
    ScratchMarkManager.preload(this);
  }

  create(data?: { socket?: Socket; skinId?: string; roomName?: string }) {
    this.socket   = data?.socket ?? io({ path: '/expelled/socket.io' });
    this.mySkinId = (data?.skinId && data.skinId !== 'professor') ? data.skinId : '';
    this.resetLocalState();

    const map = buildTilemap(this);
    this.mapRef = map;
    this.mapWorldWidth  = map.widthInPixels  * MAP_SCALE;
    this.mapWorldHeight = map.heightInPixels * MAP_SCALE;
    this.physics.world.setBounds(0, 0, this.mapWorldWidth, this.mapWorldHeight);
    this.cameras.main.setBounds(0, 0, this.mapWorldWidth, this.mapWorldHeight);

    const defaultSkin = getSkinForRole('survivor');
    this.player = this.physics.add.sprite(400, 300, defaultSkin.idle.key).setDepth(5);
    this.player.setDisplaySize(defaultSkin.displayWidth, defaultSkin.displayHeight);
    this.player.setCollideWorldBounds(true);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(32, 48, false);
    playerBody.setOffset(defaultSkin.bodyOffset.x, defaultSkin.bodyOffset.y);
    ensurePlayerSkinAnimations(this);

    map.layers.forEach((layerData) => {
      const layer = map.getLayer(layerData.name)?.tilemapLayer;
      if (layer && COLLISION_LAYERS.has(layerData.name)) {
        this.physics.add.collider(
          this.player, layer,
          (_p, tile) => this.logCollisionLayer(layerData.name, tile as Phaser.Tilemaps.Tile),
        );
      }
    });

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.skillCheck  = new SkillCheck(this);
    this.fog         = new FogOfWar(this);
    this.hud         = new HUD(this);
    this.terminals   = new TerminalManager(this);
    this.gates       = new ExitGateManager(this);
    this.players     = new PlayerManager(this);
    this.scratchMarks = new ScratchMarkManager(this);

    this.promptManager = new InteractionPromptManager(this);
    this.inputManager  = new InputManager(this);
    this.movement      = new MovementSystem(this.player);
    this.combat        = new CombatSystem(this, this.player, this.socket, this.promptManager);
    this.hacking       = new HackingSystem(
      this, this.player, this.socket,
      this.terminals, this.gates, this.players,
      this.hud, this.skillCheck,
      (frozen) => { this.inputFrozen = frozen; },
      this.promptManager,
    );

    this.combat.createSlashAnimations();
    playRoleAnimation(this.player, 'survivor', 'idle', this.movement.facingDirection);

    const gpPlugin = this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin;
    gpPlugin?.on('connected', (gamepad: Phaser.Input.Gamepad.Gamepad) => {
      this.hud.setGamepadConnected(true);
      this.hud.flash(`Controle detectado: ${gamepad.id.slice(0, 30)}`, 0x00ff88, 2500);
    });
    gpPlugin?.on('disconnected', () => {
      this.hud.setGamepadConnected(false);
    });

    this.hud.build();
    this.hud.flash('Colisao ativa em TODOS os layers (edite COLLISION_LAYERS). C = debug', 0xffcc00, 2600);

    this.socket.removeAllListeners();
    this.setupSocketEvents();
    this.socket.emit('requestSync');

    this.voiceManager = new VoiceManager();
    this.voiceManager.init(this.socket)
      .then(() => { this.hud.setMicState('active'); })
      .catch(() => {
        this.hud.flash('Microfone nao detectado — sem voz', 0xff8800, 3000);
        this.hud.setMicState('error');
      });
  }

  shutdown() {
    this.voiceManager?.destroy();
    this.voiceManager = null;
  }

  private getSpawnPoint(role: Role): { x: number; y: number } {
    const centerX = this.mapWorldWidth * 0.5;
    const centerY = this.mapWorldHeight * 0.55;
    if (role === 'professor') return { x: centerX, y: centerY };

    const angle  = Phaser.Math.FloatBetween(Math.PI * 0.5, Math.PI * 1.5);
    const radius = 180;
    return {
      x: Phaser.Math.Clamp(centerX + Math.cos(angle) * radius, 64, this.mapWorldWidth - 64),
      y: Phaser.Math.Clamp(centerY + Math.sin(angle) * radius, 64, this.mapWorldHeight - 64),
    };
  }

  // ── Socket event setup ─────────────────────────────────────────────────────

  private setupSocketEvents() {
    const s = this.socket;
    this._bindGameLifecycle(s);
    this._bindFxEvents(s);
    this._bindWorldState(s);
    this._bindPlayerState(s);
  }

  private _bindGameLifecycle(s: Socket) {
    s.on('roleAssigned', (role: Role) => {
      this.myRole = role;
      if (role === 'survivor' && this.mySkinId) {
        applySkinByIdToSprite(this.player, this.mySkinId);
        playSkinAnimation(this.player, this.mySkinId, 'idle', this.movement.facingDirection);
      } else {
        applySkinToSprite(this.player, role);
        playRoleAnimation(this.player, role, 'idle', this.movement.facingDirection);
      }
      const spawn = this.getSpawnPoint(role);
      this.player.setPosition(spawn.x, spawn.y);
      (this.player.body as Phaser.Physics.Arcade.Body).reset(spawn.x, spawn.y);
      this.fog.setup(role, this.mapRef!);
      this.hud.build();
      this.hud.update(role, this.myHp, this.downed);
      if (role === 'professor') {
        this.terminals.setAuraMode(true);
        this.gates.setAuraMode(true);
      }
      if (role === 'survivor') {
        this.trackSurvivor(s.id!, { hp: this.myHp, downed: false, expelled: false, escaped: false });
        this.refreshSurvivorHUD();
      }
    });

    s.on('gameState', (state: GameState) => {
      this.terminals.sync(state.terminals, state.terminalPositions);
      Object.entries(state.players).forEach(([id, p]) => {
        if (id !== s.id) {
          this.players.getOrCreate(id, p);
          if (p.role === 'survivor' && p.downed) this.players.setDowned(id, true);
        }
        if (p.role === 'survivor') {
          this.trackSurvivor(id, {
            hp: p.hp, downed: p.downed, expelled: p.expelled, escaped: p.escaped,
            downCount: p.downCount ?? 0, healPct: p.healPct ?? 0, beingHealed: p.beingHealed ?? false,
          });
          this.survivorMeta.set(id, { name: p.name || '', skinId: p.skinId || '' });
        }
      });
      Object.entries(state.players).forEach(([id, p]) => {
        if (p.role === 'survivor' && p.downed && !this.survivorBleedMs.has(id)) {
          this.survivorBleedMs.set(id, 0);
        }
      });
      const myState = s.id ? state.players[s.id] : null;
      if (myState && myState.role === 'survivor') {
        this.myHp        = myState.hp;
        this.downed      = myState.downed;
        this.myDownCount = myState.downCount ?? 0;
        this.myHealPct   = myState.healPct ?? 0;
        this.beingHealed = myState.beingHealed ?? false;
      }
      if (myState?.role === 'professor') {
        this.terminals.setAuraMode(true);
        this.gates.setAuraMode(true);
      }
      const survivorCount = Object.values(state.players).filter(p => p.role === 'survivor').length;
      this.terminalsNeeded = survivorCount + 1;
      this.hud.setTerminalCount(state.hackedCount, this.terminalsNeeded);
      if (state.gatesPowered) {
        this.gates.setPowered('g1');
        this.gates.setPowered('g2');
      }
      for (const id of ['g1', 'g2'] as GateId[]) {
        if (state.gates[id] > 0) this.gates.setProgress(id, state.gates[id]);
        if (state.gatesOpen[id] && this.mapRef) this.gates.setOpen(id, this.mapRef);
      }
      if (state.endgameStartedAt !== null) {
        const elapsed = Date.now() - state.endgameStartedAt;
        this.endgameReceivedAt = this.time.now - elapsed;
        this.endgameBellsRung.clear();
        this.terminals.blockAll();
        this.hud.setEndgameTimer(Math.max(0, ENDGAME_DURATION_MS - elapsed));
      }
      this.refreshSurvivorHUD();
    });

    s.on('gamePhase', (_phase: GamePhase) => {
      this.hud.update(this.myRole, this.myHp, this.downed);
    });

    s.on('bloodlustUpdate', ({ tier, chaseActive }: { tier: 0|1|2|3; chaseActive: boolean }) => {
      this.bloodlustTier = tier;
      this.hud.setChaseState(chaseActive, tier);
    });

    s.on('endgameStarted', () => {
      this.endgameReceivedAt = this.time.now;
      this.endgameBellsRung.clear();
      this.terminals.blockAll();
      this.hud.flash('COLAPSO FINAL!', 0xff2222, 3000);
    });

    s.on('gameOver', (payload: { winner: string; stats: PostGameStats }) => {
      this.inputFrozen = true;
      this.registry.set('postGameData', {
        winner: payload.winner,
        stats:  payload.stats,
        myId:   s.id!,
        socket: s,
      });
      this.time.delayedCall(600, () => this.scene.start('PostGameScene'));
    });

    s.on('gameReset', () => {
      this.scratchMarks?.clear();
      this.voiceManager?.destroy();
      this.voiceManager = null;
      this.hud.setMicState('off');
      this.scene.restart();
    });
  }

  private _bindFxEvents(s: Socket) {
    s.on('playerMoved', (data: { id: string; x: number; y: number; sprinting?: boolean; dir?: MoveDirection }) => {
      this.players.move(data.id, data.x, data.y, data.sprinting, data.dir);
    });

    s.on('scratchMark', ({ x, y, direction }: { x: number; y: number; direction: MoveDirection }) => {
      this.scratchMarks.spawn(x, y, direction);
    });

    s.on('professorAttacked', (data: { id: string; x: number; y: number; dir: string }) => {
      this.players.playAttack(data.id, data.x, data.y, data.dir as MoveDirection);
    });

    s.on('professorKicked', (data: { id: string; x: number; y: number; dir: string }) => {
      this.players.playKick(data.id, data.x, data.y, data.dir as MoveDirection);
    });

    s.on('professorCharge', (data: { id: string; charging: boolean }) => {
      this.players.setCharging(data.id, data.charging);
    });

    s.on('professorStaggered', (data: { id: string; ms: number }) => {
      this.players.playStagger(data.id, data.ms);
    });

    s.on('playerFacing', (data: { id: string; dir: MoveDirection }) => {
      this.players.updateFacing(data.id, data.dir);
    });

    s.on('survivorActivity', ({ socketId, terminalId }: { socketId: string; terminalId: string | null }) => {
      const info = this.survivorInfo.get(socketId);
      if (!info) return;
      this.survivorInfo.set(socketId, { ...info, hacking: terminalId !== null });
      this.refreshSurvivorHUD();
    });
  }

  private _bindWorldState(s: Socket) {
    s.on('terminalUpdate', ({ id, progress }: { id: string; progress: number }) => {
      console.log(`[hack] terminalUpdate id=${id} progress=${progress.toFixed(2)} @ ${performance.now().toFixed(0)}ms`);
      this.terminals.setProgress(id, progress);
      this.refreshTerminalHUD();
      if (this.hacking.activeHackingTerminal === id) {
        this.hud.setHackProgress(progress);
      }
    });

    s.on('terminalHacked', (id: string) => {
      this.terminals.setProgress(id, 100);
      this.refreshTerminalHUD();
      this.hud.flash('Terminal hackeado!', 0x00e676);
    });

    s.on('firewallAlert', ({ terminalId }: { terminalId: string }) => {
      this.terminals.setFailed(terminalId, HACK_FAIL_LOCK_MS);
      this.terminals.setLocked(terminalId, HACK_FAIL_LOCK_MS);
      if (this.hacking.activeHackingTerminal === terminalId) {
        this.hacking.onHackLockApplied();
      }
      if (this.myRole === 'professor') {
        const cam = this.cameras.main;
        this.hud.showLoudNoiseAlert(terminalId, cam.scrollX, cam.scrollY, cam.width, cam.height);
        this.terminals.flashAlert(terminalId, this.tweens);
      }
    });

    s.on('terminalRegressing', ({ terminalId, isRegressing }: { terminalId: string; isRegressing: boolean }) => {
      this.terminals.setRegressing(terminalId, isRegressing);
      if (this.myRole === 'professor' && isRegressing) {
        this.hud.flash(`Terminal ${terminalId} regredindo!`, 0xff6600, 2000);
      }
    });

    s.on('gatesPowered', () => {
      this.gates.setPowered('g1');
      this.gates.setPowered('g2');
      this.hud.flash('Portões de saída disponíveis!', 0x00e676);
    });

    s.on('gateProgress', ({ gateId, progress }: { gateId: GateId; progress: number }) => {
      this.gates.setProgress(gateId, progress);
    });

    s.on('gateOpened', ({ gateId }: { gateId: GateId }) => {
      if (this.mapRef) this.gates.setOpen(gateId, this.mapRef);
      this.hud.flash('Portão aberto! Fuja agora!', 0x00e676, 4000);
    });
  }

  private _bindPlayerState(s: Socket) {
    s.on('playerHit', ({ targetId, hp }: { targetId: string; hp: number }) => {
      if (targetId === s.id) {
        this.myHp = hp;
        this.hud.update(this.myRole, this.myHp, this.downed, this.myDownCount);
        this.hud.flash('Você foi atingido!', 0xff4444);
        this.hud.setDamageVignette(hp, false);
        this.hud.flashDamageVignette();
        if (!this.downed) this.onHitSprintTimer = ON_HIT_SPRINT_MS;
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, hp }); this.refreshSurvivorHUD(); }
    });

    s.on('playerDowned', ({ id, downCount }: { id: string; downCount: 0|1|2 }) => {
      if (id === s.id) {
        this.downed          = true;
        this.myHp            = 0;
        this.myDownCount     = downCount;
        this.myHealPct       = 0;
        this.myDownBleedMs   = 0;
        this.beingHealed     = false;
        this.hacking.clearHealingState();
        this.promptManager.hide();
        this.socket.emit('setHealing', { targetId: null });
        this.hud.update(this.myRole, this.myHp, true, this.myDownCount);
        this.hud.flash('Você foi derrubado!', 0xff4444);
        this.hud.setDamageVignette(0, true);
        this.hud.flashDamageVignette();
        playHurtFallById(this.player, this.mySkinId || 'arthur', this.movement.facingDirection);
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno derrubado!', 0xffcc00);
      }
      this.trackSurvivor(id, { hp: 0, downed: true, expelled: false, escaped: false, downCount, healPct: 0 });
      this.survivorBleedMs.set(id, 0);
      this.refreshSurvivorHUD();
      if (id !== s.id) this.players.setDowned(id, true);
    });

    s.on('attackStagger', (ms: number) => {
      this.inputFrozen  = true;
      this.staggerTimer = ms;
      if (this.myRole === 'professor') {
        this.isHitStagger = true;
        this.combat.playHurtAnimation(ms);
      }
    });

    s.on('expelled', () => {
      this.expelled    = true;
      this.inputFrozen = true;
      this.hud.update(this.myRole, this.myHp, false);
      this.hud.flash('EXPULSO!', 0xff4444, 4000);
    });

    s.on('playerRevived', ({ id, hp }: { id: string; hp: number }) => {
      if (id === s.id) {
        this.downed      = false;
        this.myHp        = hp;
        this.myHealPct   = 0;
        this.beingHealed = false;
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.setHealProgress(null);
        this.hud.flash('Revivido! Cuide-se.', 0x4fc3f7);
        this.hud.setDamageVignette(hp, false);
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno se levantou!', 0x4fc3f7);
      }
      this.trackSurvivor(id, { hp, downed: false, expelled: false, escaped: false, healPct: 0 });
      this.survivorBleedMs.delete(id);
      this.refreshSurvivorHUD();
      this.players.setDowned(id, false);
    });

    s.on('playerHealed', ({ id, hp }: { id: string; hp: number }) => {
      if (id === s.id) {
        this.myHp        = hp;
        this.myHealPct   = 0;
        this.beingHealed = false;
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.setHealProgress(null);
        this.hud.flash('Totalmente curado!', 0x4caf50);
        this.hud.setDamageVignette(hp, false);
      }
      this.trackSurvivor(id, { hp, downed: false, expelled: false, escaped: false, healPct: 0 });
      this.refreshSurvivorHUD();
    });

    s.on('healUpdate', ({ targetId, healPct }: { targetId: string; healPct: number }) => {
      if (targetId === s.id) {
        this.myHealPct = healPct;
        this.hud.setRecoveryProgress(healPct);
        this.hud.setHealProgress(healPct);
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, healPct }); this.refreshSurvivorHUD(); }
    });

    s.on('setBeingHealed', ({ targetId, isBeingHealed }: { targetId: string; isBeingHealed: boolean }) => {
      if (targetId === s.id) {
        this.beingHealed = isBeingHealed;
        if (isBeingHealed) this.hacking.onBeingHealedStart();
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, beingHealed: isBeingHealed }); this.refreshSurvivorHUD(); }
    });

    s.on('downCountUpdated', ({ id, downCount }: { id: string; downCount: 0|1|2 }) => {
      if (id === s.id) {
        this.myDownCount   = downCount;
        this.myDownBleedMs = 0;
        this.hud.setDownCount(downCount);
        this.hud.flash('Situação piorou!', 0xff8800, 2000);
      }
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, downCount }); this.refreshSurvivorHUD(); }
      this.survivorBleedMs.set(id, 0);
    });

    s.on('healAlert', ({ targetId }: { targetId: string; healerId: string }) => {
      if (this.myRole !== 'professor') return;
      const pos = this.players.getPosition(targetId);
      if (!pos) return;
      const cam = this.cameras.main;
      this.hud.showHealAlert(targetId, pos.x, pos.y, cam.scrollX, cam.scrollY, cam.width, cam.height);
    });

    s.on('playerExpelled', (id: string) => {
      if (id === s.id) {
        this.expelled    = true;
        this.downed      = false;
        this.inputFrozen = true;
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.flash('Você foi expulso!', 0xff1744, 4000);
      } else {
        this.players.setAlpha(id, 0.25);
        if (this.myRole === 'professor') this.hud.flash('Aluno expulso!', 0x00e676);
      }
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, expelled: true }); this.refreshSurvivorHUD(); }
      this.survivorBleedMs.delete(id);
    });

    s.on('playerEscaped', (id: string) => {
      if (id === s.id) {
        this.escaped     = true;
        this.inputFrozen = true;
        this.hud.flash('FUGIU! Parabéns!', 0x00e676, 4000);
      } else {
        this.players.setVisible(id, false);
      }
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, escaped: true }); this.refreshSurvivorHUD(); }
    });

    s.on('playerLeft', (id: string) => {
      this.players.remove(id);
      this.survivorInfo.delete(id);
      this.survivorOrder = this.survivorOrder.filter((sid) => sid !== id);
      this.survivorBleedMs.delete(id);
      this.refreshSurvivorHUD();
    });
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  private _updateTerrorRadius() {
    if (this.myRole !== 'survivor') { this.hud.setTerrorLevel(0); return; }
    const profPos = this.players.getProfessorPosition();
    if (!profPos) { this.hud.setTerrorLevel(0); return; }
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, profPos.x, profPos.y);
    let level: 0 | 1 | 2 | 3 = 0;
    if (dist <= TERROR_RADIUS) {
      const t = dist / TERROR_RADIUS;
      level = t > 2/3 ? 1 : t > 1/3 ? 2 : 3;
    }
    this.hud.setTerrorLevel(level);
  }

  update(_time: number, delta: number) {
    if (delta > 200) console.warn(`[spike] frame=${Math.round(delta)}ms @ t=${Math.round(_time)}ms`);
    const _dbgT0 = performance.now();
    this.skillCheck.update(delta);
    this.terminals.update(delta);
    this._updateTerrorRadius();

    if (this.onHitSprintTimer > 0) this.onHitSprintTimer = Math.max(0, this.onHitSprintTimer - delta);

    const pad = (this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin)?.pad1 ?? null;
    this.hud.setGamepadConnected(pad !== null);

    const input = this.inputManager.read(pad);

    if (input.cJustDown) this.toggleCollisionDebug();

    if (this.inputFrozen) {
      this.promptManager.hide();
      if (this.skillCheck.active && input.attackJust) {
        this.skillCheck.tryHit();
      }
      if (this.skillCheck.active && this.hacking.activeHackingTerminal !== null && !input.actionHeld) {
        this.skillCheck.cancel();
      }
      if (this.staggerTimer > 0) {
        this.staggerTimer -= delta;
        if (this.staggerTimer <= 0) {
          this.staggerTimer = 0;
          if (!this.expelled && !this.escaped) {
            this.inputFrozen  = false;
            this.isHitStagger = false;
            this.combat.cancelAll();
          }
        }
      }

      this.fog.update(this.player, this.movement.lookAngle);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

      if (this.myRole && !this.isHitStagger) {
        if (this.downed && this.myRole === 'survivor') {
          const effectiveSkinId = this.mySkinId || 'arthur';
          const skin = getSkinById(effectiveSkinId);
          const hurtFallKey = `${skin.id}:hurt-fall`;
          const hurtFallPlaying = this.player.anims.currentAnim?.key === hurtFallKey && this.player.anims.isPlaying;
          if (!hurtFallPlaying) applyDownedFrameById(this.player, effectiveSkinId, this.movement.facingDirection);
        } else if (this.myRole === 'survivor' && this.mySkinId) {
          playSkinAnimation(this.player, this.mySkinId, 'idle', this.movement.facingDirection);
        } else {
          playRoleAnimation(this.player, this.myRole, 'idle', this.movement.facingDirection);
        }
      }

      if (this.myRole === 'professor') {
        const cam = this.cameras.main;
        this.hud.updateTerminalArrows(
          this.terminals.getPositions(), this.terminals.getCompleted(),
          cam.scrollX, cam.scrollY, cam.width, cam.height,
        );
      }
      if (this.myRole === 'survivor') {
        const cam = this.cameras.main;
        this.hud.updateDownedArrows(
          this._getDownedArrowPositions(),
          cam.scrollX, cam.scrollY, cam.width, cam.height,
        );
      }
      this.players.update(this.time.now);
      return;
    }

    if (this.myRole === 'survivor') {
      this.sprinting = input.sprinting;
    }

    const movCtx = {
      role:             this.myRole,
      downed:           this.downed,
      sprinting:        this.sprinting,
      onHitSprintTimer: this.onHitSprintTimer,
      bloodlustTier:    this.bloodlustTier,
      attackHoldActive: this.combat.attackHoldActive,
      isSwinging:       this.combat.isSwinging,
      skinId:           this.mySkinId,
    };

    const { vx, vy, intendedToMove } = this.movement.update(input, movCtx, pad, delta);
    this.movement.applyVelocity(vx, vy);
    this.movement.applyAnimation(movCtx, intendedToMove);

    this.lastMoveEmit += delta;
    if ((vx !== 0 || vy !== 0) && this.lastMoveEmit > MOVE_EMIT_RATE_MS) {
      this.lastMoveEmit = 0;
      this.lastEmittedDir = this.movement.facingDirection;
      this.socket.emit('move', {
        x: this.player.x, y: this.player.y,
        angle: this.movement.lookAngle,
        sprinting: this.sprinting,
        dir: this.movement.facingDirection,
      });
    } else if (vx === 0 && vy === 0 && this.movement.facingDirection !== this.lastEmittedDir) {
      this.lastEmittedDir = this.movement.facingDirection;
      this.socket.emit('facing', { dir: this.movement.facingDirection });
    }

    if (this.myRole === 'survivor') {
      this.scratchMarks.tickEmit(
        this.socket,
        this.player.x, this.player.y,
        this.movement.facingDirection,
        delta,
        this.sprinting,
        intendedToMove,
        SCRATCH_MARKS_SELF_VISIBLE,
      );
    }
    this.scratchMarks.update(delta);

    const _dbgPreFog = performance.now() - _dbgT0;
    this.fog.update(this.player, this.movement.lookAngle);
    const _dbgFog = performance.now() - _dbgT0 - _dbgPreFog;
    this.players.update(this.time.now);
    const _dbgPlayers = performance.now() - _dbgT0 - _dbgPreFog - _dbgFog;
    if (_dbgPreFog > 8 || _dbgFog > 8 || _dbgPlayers > 4)
      console.warn(`[slow] preFog=${_dbgPreFog.toFixed(1)} fog=${_dbgFog.toFixed(1)} players=${_dbgPlayers.toFixed(1)}`);

    if (this.voiceManager && this.myRole) {
      this.voiceManager.updateSpatialAudio(
        { x: this.player.x, y: this.player.y },
        this.myRole,
        this.players.getPositions(),
        this.movement.lookAngle,
      );
    }

    if (this.myRole === 'survivor') {
      if (this.downed) {
        this.hacking.updateDownedSelf(delta, this.beingHealed, intendedToMove, this.myHealPct);
        this.myDownBleedMs = Math.min(this.myDownBleedMs + delta, BLEED_OUT_MS);
        this.hud.setBleedOutProgress((this.myDownBleedMs / BLEED_OUT_MS) * 100);
        this.survivorBleedMs.set(this.socket.id!, this.myDownBleedMs);
      } else {
        const _dbgHackT = performance.now();
        this.hacking.updateSelf(
          delta, input, this.downed, this.beingHealed,
          this.myHealPct, this.escaped, this.survivorInfo,
        );
        const _dbgHackDt = performance.now() - _dbgHackT;
        if (_dbgHackDt > 4) console.warn(`[slow:hack] ${_dbgHackDt.toFixed(1)}ms`);
      }
      for (const [id, info] of this.survivorInfo) {
        if (id === this.socket.id) continue;
        if (!info.downed) { this.survivorBleedMs.delete(id); continue; }
        const current = this.survivorBleedMs.get(id) ?? 0;
        this.survivorBleedMs.set(id, Math.min(current + delta, BLEED_OUT_MS));
      }
    }

    if (this.myRole === 'professor') {
      const nearTermId = this.terminals.nearest(this.player.x, this.player.y) as TerminalId | null;
      const nearTermInfo = nearTermId && this.terminals.getProgress(nearTermId) > 0
        ? { id: nearTermId, pos: this.terminals.getPositions()[nearTermId]! }
        : null;
      this.combat.update(
        input,
        this.movement.facingDirection,
        this.movement.lookAngle,
        nearTermInfo,
      );
      this.hud.setAttackCooldown(this.staggerTimer);

      const cam = this.cameras.main;
      this.hud.updateTerminalArrows(
        this.terminals.getPositions(), this.terminals.getCompleted(),
        cam.scrollX, cam.scrollY, cam.width, cam.height,
      );
    }

    if (this.myRole === 'survivor') {
      const cam = this.cameras.main;
      this.hud.updateDownedArrows(
        this._getDownedArrowPositions(),
        cam.scrollX, cam.scrollY, cam.width, cam.height,
      );
    }

    if (this.endgameReceivedAt !== null) {
      const elapsed   = this.time.now - this.endgameReceivedAt;
      const remaining = Math.max(0, ENDGAME_DURATION_MS - elapsed);
      this.hud.setEndgameTimer(remaining);
      for (const threshold of [90_000, 60_000, 30_000]) {
        if (remaining <= threshold && !this.endgameBellsRung.has(threshold)) {
          this.endgameBellsRung.add(threshold);
          this.hud.flash(`${threshold / 1000}s restantes!`, 0xff6600, 2000);
        }
      }
    }

    if (this.collisionDebugEnabled && this.playerBodyDebugGraphics) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      this.playerBodyDebugGraphics.clear();
      this.playerBodyDebugGraphics.lineStyle(2, 0x00ff00, 1);
      this.playerBodyDebugGraphics.strokeRect(body.left, body.top, body.width, body.height);
    }
  }

  private _getDownedArrowPositions(): Record<string, { x: number; y: number }> {
    const result: Record<string, { x: number; y: number }> = {};
    for (const [id, info] of this.survivorInfo) {
      if (id === this.socket.id) continue;
      if (info.expelled || info.escaped) continue;
      if (!this.downed && !info.downed) continue;
      const pos = this.players.getPosition(id);
      if (pos) result[id] = pos;
    }
    return result;
  }
}
