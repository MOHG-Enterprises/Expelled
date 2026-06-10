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
  FOV_PROFESSOR,
  FOV_PROFESSOR_CONE_DEG,
  SURVIVOR_SPAWN_POINTS,
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
import { TouchControlManager } from '../game/TouchControlManager';
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
  private ghost         = false;
  private corpseSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private escaped      = false;
  private inputFrozen  = false;
  private staggerTimer = 0;
  private isHitStagger = false;

  private bloodlustTier: 0 | 1 | 2 | 3 = 0;
  private afkTimer         = 0;
  private afkHeart:  Phaser.GameObjects.Text | null = null;
  private afkTween:  Phaser.Tweens.Tween   | null = null;
  private sprinting        = false;
  private onHitSprintTimer = 0;
  private tpCooldown  = 0;
  private tpLastDest: 'A' | 'B' | null = null;
  private tp2Cooldown = 0;
  private tp2LastDest: 'C' | 'D' | null = null;

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

  private portaoboiLayer:    Phaser.Tilemaps.TilemapLayer | null = null;
  private portaoboiCollider: Phaser.Physics.Arcade.Collider | null = null;

  private endgameReceivedAt: number | null = null;
  private endgameBellsRung = new Set<number>();

  private skillCheck!:  SkillCheck;
  private fog!:         FogOfWar;
  private hud!:         HUD;
  private terminals!:   TerminalManager;
  private players!:     PlayerManager;
  private gates!:       ExitGateManager;
  private scratchMarks!: ScratchMarkManager;
  private voiceManager:   VoiceManager | null = null;
  private touchControls:  TouchControlManager | null = null;
  private isTouchDevice   = false;

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
    this.ghost           = false;
    this.corpseSprites.clear();
    this.escaped         = false;
    this.inputFrozen     = false;
    this.staggerTimer    = 0;
    this.isHitStagger    = false;
    this.bloodlustTier   = 0;
    this.afkTimer        = 0;
    this._hideAfkHeart();
    this.sprinting       = false;
    this.onHitSprintTimer = 0;
    this.beingHealed     = false;
    this.myDownCount     = 0;
    this.myHealPct       = 0;
    this.myDownBleedMs   = 0;
    this.lastMoveEmit    = 0;
    this.endgameReceivedAt = null;
    this.portaoboiLayer    = null;
    this.portaoboiCollider = null;
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
    this.load.spritesheet('botaoSaida', './botaoSaida.png', { frameWidth: 16, frameHeight: 16 });
    preloadMapAssets(this);
    preloadPlayerSkins(this);
    ScratchMarkManager.preload(this);
  }

  create(data?: { socket?: Socket; skinId?: string; roomName?: string }) {
    this.socket   = data?.socket ?? io({ path: '/expelled/socket.io' });
    this.mySkinId = data?.skinId ?? '';
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
        const collider = this.physics.add.collider(this.player, layer);
        if (layerData.name === 'PORTAOBOI') {
          this.portaoboiLayer    = layer;
          this.portaoboiCollider = collider;
        }
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

    this.promptManager  = new InteractionPromptManager(this);
    this.isTouchDevice  = navigator.maxTouchPoints > 0;
    this.inputManager   = new InputManager(this, this.isTouchDevice);
    this.movement      = new MovementSystem(this.player);
    this.combat        = new CombatSystem(this, this.player, this.socket, this.promptManager, this.mySkinId);
    this.hacking       = new HackingSystem(
      this, this.player, this.socket,
      this.terminals, this.gates, this.players,
      this.hud, this.skillCheck,
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

    if (this.isTouchDevice) {
      this.touchControls = new TouchControlManager(this);
      this.touchControls.build();
    }
    this.hud.build(this.isTouchDevice);
    this.hud.flash('Colisao ativa em TODOS os layers (edite COLLISION_LAYERS). Shift+F5 = debug', 0xffcc00, 2600);

    this.socket.removeAllListeners();
    this.setupSocketEvents();
    this.socket.emit('requestSync');

    // TEMP: desabilitado para diagnóstico de lag
    // this.voiceManager = new VoiceManager();
    // this.voiceManager.init(this.socket)
    //   .then(() => { this.hud.setMicState('active'); })
    //   .catch(() => {
    //     this.hud.flash('Microfone nao detectado — sem voz', 0xff8800, 3000);
    //     this.hud.setMicState('error');
    //   });
  }

  shutdown() {
    this.voiceManager?.destroy();
    this.voiceManager = null;
    this.touchControls?.destroy();
    this.touchControls = null;
  }

  private getSpawnPoint(role: Role): { x: number; y: number } {
    if (role === 'professor') return { x: 1847, y: 2556 };
    return Phaser.Math.RND.pick(SURVIVOR_SPAWN_POINTS as Array<{ x: number; y: number }>);
  }

  private _releaseProfessor(silent = false): void {
    this.portaoboiCollider?.destroy();
    this.portaoboiLayer?.destroy();
    this.portaoboiCollider = null;
    this.portaoboiLayer    = null;
    this.hud.stopProfessorCountdown();
    if (!silent) this.hud.flash('O professor foi liberado!', 0xff4444, 3000);
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
      if (this.mySkinId) {
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
      this.hud.build(this.isTouchDevice);
      this.hud.update(role, this.myHp, this.downed);
      this.touchControls?.setRole(role, this.downed);
      if (role === 'professor') {
        this.terminals.setAuraMode(true);
        this.gates.setAuraMode(true);
      }
      if (role === 'survivor') {
        this.trackSurvivor(s.id!, { hp: this.myHp, downed: false, expelled: false, escaped: false });
        this.refreshSurvivorHUD();
      }
    });

    s.on('professorLocked', ({ endsAt }: { endsAt: number }) => {
      this.hud.startProfessorCountdown(endsAt);
    });

    s.on('professorReleased', () => {
      this._releaseProfessor();
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
      if (state.professorLockedEndsAt !== null) {
        if (state.professorLockedEndsAt > Date.now()) {
          this.hud.startProfessorCountdown(state.professorLockedEndsAt);
        } else {
          this._releaseProfessor(true);
        }
      }
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
      const msg   = payload.winner === 'survivors' ? 'ALUNOS ESCAPARAM!' : 'PROFESSOR VENCEU!';
      const color = payload.winner === 'survivors' ? 0x00e676 : 0xff1744;
      this.hud.flash(msg, color, 4500);
      this.time.delayedCall(5000, () => this.scene.start('EndScreenScene'));
    });

    s.on('gameReset', () => {
      if (!this.scene.isActive()) return;
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
      this.terminals.setProgress(id, progress);
      this.refreshTerminalHUD();
      if (this.hacking.activeHackingTerminal === id) {
        this.hud.setHackProgress(progress);
      }
    });

    s.on('terminalHacked', (id: string) => {
      this.terminals.setProgress(id, 100);
      this.refreshTerminalHUD();
      this.hud.setTerminalCompleted(id, 3000);
      this.hud.flash('Terminal hackeado!', 0x00e676);
    });

    s.on('firewallAlert', ({ terminalId }: { terminalId: string }) => {
      this.terminals.setFailed(terminalId, HACK_FAIL_LOCK_MS);
      this.terminals.setLocked(terminalId, HACK_FAIL_LOCK_MS);
      this.hud.setTerminalError(terminalId, 3000);
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

    s.on('gateFailFlash', ({ gateId }: { gateId: GateId }) => {
      this.gates.setFailed(gateId);
      if (this.hacking.activeOpeningGate === gateId) {
        this.hacking.onGateLockApplied();
      }
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
        this.touchControls?.setRole(this.myRole, true);
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
      this.expelled = true;
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
        this.touchControls?.setRole(this.myRole, false);
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
        this.expelled     = true;
        this.ghost        = true;
        this.downed       = false;
        this.inputFrozen  = false;
        this.player.setAlpha(0.25);
        (this.player.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
        this.fog.setFullReveal(true);
        this._spawnCorpse(id, this.player.x, this.player.y, this.mySkinId, this.movement.facingDirection);
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.flash('Você foi expulso!', 0xff1744, 4000);
        this.hud.setGhostMode(true);
      } else {
        this.players.setAlpha(id, 0.25);
        if (this.myRole === 'professor') this.hud.flash('Aluno expulso!', 0x00e676);
        const pos    = this.players.getPosition(id);
        const dir    = this.players.getFacingDirection(id) ?? 'down';
        const skinId = this.survivorMeta.get(id)?.skinId ?? 'arthur';
        if (pos) this._spawnCorpse(id, pos.x, pos.y, skinId, dir);
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
    this.skillCheck.update(delta);
    this.terminals.update(delta);
    this._updateTerrorRadius();

    if (this.onHitSprintTimer > 0) this.onHitSprintTimer = Math.max(0, this.onHitSprintTimer - delta);

    const pad = (this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin)?.pad1 ?? null;
    this.hud.setGamepadConnected(pad !== null);

    const touchState = this.touchControls?.readAndClear();
    const input      = this.inputManager.read(pad, touchState);

    if (input.cJustDown) this.toggleCollisionDebug();
    
    this.tpCooldown = Math.max(0, this.tpCooldown - delta);
    if (this.tpCooldown === 0) {
      const distA = Phaser.Math.Distance.Between(this.player.x, this.player.y, 700, 375);
      const distB = Phaser.Math.Distance.Between(this.player.x, this.player.y, 1985, 215);
      if (distA >= 40 && distB >= 40) {
        this.tpLastDest = null;
      } else if (distA < 40 && this.tpLastDest !== 'A') {
        this.player.setPosition(1985, 215);
        this.tpLastDest = 'B';
        this.tpCooldown = 5000;
      } else if (distB < 40 && this.tpLastDest !== 'B') {
        this.player.setPosition(700, 375);
        this.tpLastDest = 'A';
        this.tpCooldown = 5000;
      }
    }

    this.tp2Cooldown = Math.max(0, this.tp2Cooldown - delta);
    if (this.tp2Cooldown === 0) {
      const distC = Phaser.Math.Distance.Between(this.player.x, this.player.y, 2565, 2635);
      const distD = Phaser.Math.Distance.Between(this.player.x, this.player.y, 3300, 2450);
      if (distC >= 40 && distD >= 40) {
        this.tp2LastDest = null;
      } else if (distC < 40 && this.tp2LastDest !== 'C') {
        this.player.setPosition(3300, 2450);
        this.tp2LastDest = 'D';
        this.tp2Cooldown = 5000;
      } else if (distD < 40 && this.tp2LastDest !== 'D') {
        this.player.setPosition(2565, 2635);
        this.tp2LastDest = 'C';
        this.tp2Cooldown = 5000;
      }
    }

    if (!this.inputFrozen && this.skillCheck.active && (input.attackJust || input.actionJust)) {
      this.skillCheck.tryHit();
    }
    

    if (this.inputFrozen) {
      this.promptManager.hide();
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
        } else if (this.mySkinId) {
          playSkinAnimation(this.player, this.mySkinId, 'idle', this.movement.facingDirection);
        } else {
          playRoleAnimation(this.player, this.myRole, 'idle', this.movement.facingDirection);
        }
      }

      if (this.myRole === 'professor') {
        const cam = this.cameras.main;
        this.hud.updateTerminalArrows(
          this._terminalPositionsOutsideFov(), this.terminals.getCompleted(),
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
      this.players.update(this.time.now, this._busySurvivorIds());
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
      ghost:            this.ghost,
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

    if (this.myRole === 'survivor' && !this.ghost) {
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

    if (!this.ghost) this.fog.update(this.player, this.movement.lookAngle);
    this.players.update(this.time.now, this._busySurvivorIds());

    if (this.voiceManager && this.myRole) {
      this.voiceManager.updateSpatialAudio(
        { x: this.player.x, y: this.player.y },
        this.myRole,
        this.players.getPositions(),
        this.movement.lookAngle,
      );
    }

    if (this.myRole === 'survivor' && !this.ghost) {
      this._tickAfk(
        intendedToMove || this.inputFrozen || this.downed
        || this.hacking.activeHackingTerminal !== null
        || this.hacking.activeHealingTarget   !== null
        || this.beingHealed,
        delta,
      );
      if (this.downed) {
        this.hacking.updateDownedSelf(delta, this.beingHealed, intendedToMove, this.myHealPct);
        this.myDownBleedMs = Math.min(this.myDownBleedMs + delta, BLEED_OUT_MS);
        this.hud.setBleedOutProgress((this.myDownBleedMs / BLEED_OUT_MS) * 100);
        this.survivorBleedMs.set(this.socket.id!, this.myDownBleedMs);
      } else {
        this.hacking.updateSelf(
          delta, input, this.downed, this.beingHealed,
          this.myHealPct, this.escaped, this.survivorInfo,
        );
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
      const nearTermInfo = nearTermId && this.terminals.getProgress(nearTermId) > 0 && !this.terminals.isRegressing(nearTermId)
        ? { id: nearTermId, pos: this.terminals.getPositions()[nearTermId]! }
        : null;
      this.combat.update(
        input,
        this.movement.facingDirection,
        this.movement.lookAngle,
        nearTermInfo,
      );
const cam = this.cameras.main;
      this.hud.updateTerminalArrows(
        this._terminalPositionsOutsideFov(), this.terminals.getCompleted(),
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

    this.touchControls?.setSkillCheckActive(this.skillCheck.active && this.myRole === 'survivor');
  }

  private _terminalPositionsOutsideFov(): Readonly<Partial<Record<string, { x: number; y: number }>>> {
    const all = this.terminals.getPositions();
    const px = this.player.x;
    const py = this.player.y;
    const angle = this.movement.lookAngle;
    const radiusSq = FOV_PROFESSOR * FOV_PROFESSOR;
    const halfCone = Phaser.Math.DegToRad(FOV_PROFESSOR_CONE_DEG / 2);
    const result: Partial<Record<string, { x: number; y: number }>> = {};
    for (const [id, pos] of Object.entries(all)) {
      if (!pos) continue;
      const dx = pos.x - px;
      const dy = pos.y - py;
      if (dx * dx + dy * dy <= radiusSq) {
        let diff = Math.atan2(dy, dx) - angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= halfCone) continue;
      }
      result[id] = pos;
    }
    return result;
  }

  private _busySurvivorIds(): ReadonlySet<string> {
    const busy = new Set<string>();
    for (const [id, info] of this.survivorInfo) {
      if (info.hacking || info.beingHealed) busy.add(id);
    }
    return busy;
  }

  private _hideAfkHeart() {
    if (!this.afkHeart?.visible) return;
    this.afkTween?.stop();
    this.afkTween = null;
    this.afkHeart.setVisible(false);
  }

  private _tickAfk(isActive: boolean, delta: number) {
    const AFK_MS = 8_000;
    if (isActive) {
      this.afkTimer = 0;
      this._hideAfkHeart();
      return;
    }
    this.afkTimer += delta;
    if (this.afkTimer < AFK_MS) return;

    if (!this.afkHeart) {
      this.afkHeart = this.add
        .text(0, 0, '💗', { fontSize: '20px' })
        .setOrigin(0.5, 1)
        .setDepth(10)
        .setAlpha(0.82);
    }

    if (!this.afkHeart.visible) {
      this.afkHeart.setVisible(true);
      this.afkTween = this.tweens.add({
        targets:  this.afkHeart,
        scale:    1.4,
        duration: 550,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
    }

    this.afkHeart.setPosition(this.player.x, this.player.y - 34);
  }

  private _spawnCorpse(id: string, x: number, y: number, skinId: string, direction: MoveDirection) {
    const effectiveSkin = skinId || 'arthur';
    const skin = getSkinById(effectiveSkin);
    if (!skin.hurt) return;
    const sprite = this.add.sprite(x, y, skin.hurt.key).setDepth(3);
    applyDownedFrameById(sprite, effectiveSkin, direction);
    this.corpseSprites.set(id, sprite);
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
