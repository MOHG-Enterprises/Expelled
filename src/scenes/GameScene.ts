import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import {
  PLAYER_SPEED, PLAYER_SPRINT_SPEED, PROFESSOR_SPEED,
  INTERACT_RADIUS, HACK_PASSIVE_RATE_MS,  HACK_PASSIVE_TICK,HACK_GREAT_BONUS,
   MOVE_EMIT_RATE_MS,  STAMINA_MAX, STAMINA_DRAIN, STAMINA_REGEN, STAMINA_MIN_SPRINT,
  WORLD_WIDTH, WORLD_HEIGHT, MAP_SCALE,
} from '../constants';
import type { Role, GamePhase, GameState, TerminalId } from '../types';
import { SkillCheck }      from '../game/SkillCheck';
import { FogOfWar }        from '../game/FogOfWar';
import { HUD }             from '../game/HUD';
import { TerminalManager } from '../game/TerminalManager';
import { PlayerManager }   from '../game/PlayerManager';
import { StaminaBar }      from '../game/StaminaBar';
import { VoiceManager }   from '../game/VoiceManager';
import {
  applySkinToSprite,
  ensurePlayerSkinAnimations,
  getSkinForRole,
  type MoveDirection,
  playRoleAnimation,
  preloadPlayerSkins,
} from '../game/playerSkins';

type TilesetConfig = {
  name: string;
  key: string;
  image: string;
  tileWidth: number;
  tileHeight: number;
};

const MAP_TILESETS: TilesetConfig[] = [
  { name: '2', key: 'tileset-2', image: '/mapa/Expelled/abc/Dungeon_Tiles.png', tileWidth: 16, tileHeight: 16 },
  { name: '1', key: 'tileset-1', image: '/mapa/Expelled/abc/Interiors_free_32x32.png', tileWidth: 16, tileHeight: 16 },
  { name: '3', key: 'tileset-3', image: '/mapa/Expelled/abc/mainlevbuild.png', tileWidth: 16, tileHeight: 16 },
  { name: 'pingpong', key: 'tileset-pingpong', image: '/mesaDeTenis.png', tileWidth: 16, tileHeight: 16 },
  { name: 'armario', key: 'tileset-armario', image: '/mapa/Expelled/abc/House Interiors – Cozy Farmhouse Bedroom/obj/spr_book_case.png', tileWidth: 16, tileHeight: 16 },
  { name: 'Computer Room Spritesheet 1 (1)', key: 'tileset-computer-room', image: '/Computer Room Spritesheet 1 (1).png', tileWidth: 16, tileHeight: 16 },
  { name: 'AnimatedAutum', key: 'tileset-animated-autum', image: '/mapa/Expelled/abc/AnimatedAutum.png', tileWidth: 16, tileHeight: 16 },
  { name: 'mesaArvor', key: 'tileset-mesaarvor', image: '/mapa/Expelled/abc/mesaArvor.png', tileWidth: 16, tileHeight: 16 },
  { name: 'mapaClosev5', key: 'tileset-mapa-close', image: '/mapa/Expelled/abc/mapaClosev5.png', tileWidth: 16, tileHeight: 16 },
  { name: 'PrincipalV2 (1)', key: 'tileset-principal-v2', image: '/mapa/Expelled/abc/PrincipalV2 (1).png', tileWidth: 16, tileHeight: 16 },
  { name: 'mesas', key: 'tileset-mesas', image: '/mapa/Expelled/abc/mesas.png', tileWidth: 16, tileHeight: 16 },
  { name: 'conundrum', key: 'tileset-conundrum', image: '/mapa/Expelled/abc/titleGame.png', tileWidth: 16, tileHeight: 16 },
];

const PAD_DEADZONE = 0.2;

const COLLISION_LAYERS = new Set([
  'OBSTACULOS',
  'Parede',
  'MESAS',
  'BANCOS',
  'Coisas na parede',
  'PORTAS',
  'PORTAO',
  'ARVORES',
]);


export class GameScene extends Phaser.Scene {
  //  State 
  private socket!: Socket;
  private player!: Phaser.Physics.Arcade.Sprite;

  private myRole:         Role | null = null;
  private myHp           = 2;
  private downed         = false;
  private expelled       = false;
  private escaped        = false;
  private inputFrozen    = false;
  private staggerTimer   = 0;
  private gateOpen       = false;

  private survivorOrder: string[] = [];
  private survivorInfo  = new Map<string, { hp: number; downed: boolean; expelled: boolean; escaped: boolean }>();
  private hackingTerminal: TerminalId | null = null;
  private hackHoldTimer  = 0;
  private lastMoveEmit   = 0;
  private lookAngle      = 0;
  private targetLookAngle = 0;
  private facingDirection: MoveDirection = 'down';
  private gamePhase: GamePhase = 'lobby';
  private mapWorldWidth = WORLD_WIDTH;
  private mapWorldHeight = WORLD_HEIGHT;
  private mapRef: Phaser.Tilemaps.Tilemap | null = null;
  private collisionDebugGraphics: Phaser.GameObjects.Graphics | null = null;
  private playerBodyDebugGraphics: Phaser.GameObjects.Graphics | null = null;
  private collisionDebugEnabled = false;
  private lastCollisionLogAt: Record<string, number> = {};

  // stamina pros surv
  private stamina         = STAMINA_MAX;
  private sprinting       = false;

  //  outras classes do jogo
  private skillCheck!:  SkillCheck;
  private hackNextThreshold = 0;
  private hackPassiveTimer = 0;
  private fog!:         FogOfWar;
  private hud!:         HUD;
  private terminals!:   TerminalManager;
  private players!:     PlayerManager;
  private staminaBar!:  StaminaBar;
  private voiceManager: VoiceManager | null = null;

  //  inputs
  private cursors!:    Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:       Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!:   Phaser.Input.Keyboard.Key;
  private eKey!:       Phaser.Input.Keyboard.Key;
  private shiftKey!:   Phaser.Input.Keyboard.Key;
  private cKey!:       Phaser.Input.Keyboard.Key;

  // gamepad — flags virtuais atualizadas a cada frame
  private padActionHeld  = false;
  private padSprintHeld  = false;
  private padActionJust  = false;
  private padAttackJust  = false;
  private padPrevAction  = false;
  private padPrevAttack  = false;

  
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
            tile.pixelX * MAP_SCALE,
            tile.pixelY * MAP_SCALE,
            tile.width * MAP_SCALE,
            tile.height * MAP_SCALE,
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
    const now = this.time.now;
    const last = this.lastCollisionLogAt[layerName] ?? -Infinity;
    if (now - last < 350) return;

    this.lastCollisionLogAt[layerName] = now;
    console.log(`[collision] layer=${layerName} tile=(${tile.x},${tile.y}) index=${tile.index}`);
  }

  constructor() { super('GameScene'); }

  preload() {
    this.load.tilemapTiledJSON('school-map', '/maps/mapa.phaser.json');
    this.load.spritesheet('computer-terminal-sheet', '/Computer Room Spritesheet 1 (1).png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    MAP_TILESETS.forEach((tileset) => {
      this.load.image(tileset.key, encodeURI(tileset.image));
    });
    preloadPlayerSkins(this);
  }

  private buildTilemap() {
    const map = this.make.tilemap({ key: 'school-map' });
    const tilesets = MAP_TILESETS
      .map((tileset) => map.addTilesetImage(tileset.name, tileset.key, tileset.tileWidth, tileset.tileHeight))
      .filter((t): t is Phaser.Tilemaps.Tileset => !!t);

    map.layers.forEach((layerData) => {
      const layer = map.createLayer(layerData.name, tilesets, 0, 0);
      if (!layer) return;

      layer.setScale(MAP_SCALE);
      layer.setDepth(1);
      if (COLLISION_LAYERS.has(layerData.name)) {
        layer.setCollisionByExclusion([-1], true);
      }
    });

    return map;
  }


  private getSpawnPoint(role: Role): { x: number; y: number } {
    const centerX = this.mapWorldWidth * 0.5;
    const centerY = this.mapWorldHeight * 0.55;

    if (role === 'professor') {
      return { x: centerX, y: centerY };
    }

    const angle = Phaser.Math.FloatBetween(Math.PI * 0.5, Math.PI * 1.5);
    const radius = 180;
    const x = Phaser.Math.Clamp(centerX + Math.cos(angle) * radius, 64, this.mapWorldWidth - 64);
    const y = Phaser.Math.Clamp(centerY + Math.sin(angle) * radius, 64, this.mapWorldHeight - 64);
    return { x, y };
  }

  private refreshSurvivorHUD() {
    const statuses = this.survivorOrder.map((id, i) => {
      const info = this.survivorInfo.get(id) ?? { hp: 2, downed: false, expelled: false, escaped: false };
      return { label: `A${i + 1}`, ...info };
    });
    this.hud.setSurvivorStatuses(statuses);
  }

  private refreshTerminalHUD() {
    const { done, total } = this.terminals.getCount();
    this.hud.setTerminalCount(done, total);
  }

  private trackSurvivor(id: string, info: { hp: number; downed: boolean; expelled: boolean; escaped: boolean }) {
    if (!this.survivorOrder.includes(id)) this.survivorOrder.push(id);
    this.survivorInfo.set(id, info);
  }

  //so pra limpar os role que permanece quando volta pro lobby ou daf5
  private resetLocalState() {
    this.myRole = null;
    this.hackPassiveTimer = 0;
    this.myHp = 2;
    this.downed = false;
    this.expelled = false;
    this.escaped = false;
    this.inputFrozen = false;
    this.staggerTimer = 0;
    this.gateOpen = false;
    this.hackingTerminal = null;
    this.hackHoldTimer = 0;
    this.lastMoveEmit = 0;
    this.lookAngle = 0;
    this.targetLookAngle = 0;
    this.facingDirection = 'down';
    this.gamePhase = 'playing';
    this.stamina = STAMINA_MAX;
    this.sprinting = false;
    this.survivorOrder = [];
    this.survivorInfo.clear();
  }

  create(data?: { socket?: Socket }) {
    //reusa socket q vem do lobby
    this.socket = data?.socket ?? io();
    this.resetLocalState();

    const map = this.buildTilemap();
    this.mapRef = map;
    this.mapWorldWidth = map.widthInPixels * MAP_SCALE;
    this.mapWorldHeight = map.heightInPixels * MAP_SCALE;
    this.physics.world.setBounds(0, 0, this.mapWorldWidth, this.mapWorldHeight);
    this.cameras.main.setBounds(0, 0, this.mapWorldWidth, this.mapWorldHeight);

    const defaultSkin = getSkinForRole('survivor');
    this.player = this.physics.add.sprite(400, 300, defaultSkin.textureKey).setDepth(5);
    this.player.setDisplaySize(defaultSkin.displayWidth, defaultSkin.displayHeight);
    this.player.setCollideWorldBounds(true);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(32, 48, false);
    playerBody.setOffset(defaultSkin.bodyOffset.x, defaultSkin.bodyOffset.y);
    ensurePlayerSkinAnimations(this);
    playRoleAnimation(this.player, 'survivor', 'idle', this.facingDirection);
    this.hackNextThreshold = Phaser.Math.Between(2500, 5000);

    map.layers.forEach((layerData) => {
      const layer = map.getLayer(layerData.name)?.tilemapLayer;
      if (layer && COLLISION_LAYERS.has(layerData.name)) {
        this.physics.add.collider(
          this.player,
          layer,
          (_playerObj, tile) => this.logCollisionLayer(layerData.name, tile as Phaser.Tilemaps.Tile),
        );
      }
    });

    // camera segue o player com um lagzinho pra ficar mais fluido
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.skillCheck  = new SkillCheck(this);
    this.fog         = new FogOfWar(this);

    this.hud         = new HUD(this);
    this.terminals   = new TerminalManager(this);
    this.players     = new PlayerManager(this);
    this.staminaBar  = new StaminaBar(this);

    //setta as bind
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.wasd     = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.eKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.cKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    this.hud.build();
    this.staminaBar.build();
    this.hud.flash('Colisao ativa em TODOS os layers (edite COLLISION_LAYERS). C = debug', 0xffcc00, 2600);

    const gpPlugin = this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin;
    gpPlugin?.on('connected', (gamepad: Phaser.Input.Gamepad.Gamepad) => {
      this.hud.setGamepadConnected(true);
      this.hud.flash(`Controle detectado: ${gamepad.id.slice(0, 30)}`, 0x00ff88, 2500);
    });
    gpPlugin?.on('disconnected', () => {
      this.hud.setGamepadConnected(false);
    });

    // limpa os listener (tava duplicando nao sei se tem outro jieto melhor)
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

  private setupSocketEvents() {
    const s = this.socket;

    s.on('roleAssigned', (role: Role) => {
      this.myRole = role;
      applySkinToSprite(this.player, role);
      playRoleAnimation(this.player, role, 'idle', this.facingDirection);
      // teppa pro spawn
      // TODO: os aluno tem q spawnar randomizado/separado e tambem fora da visao do prof
    
      const spawn = this.getSpawnPoint(role);
      this.player.setPosition(spawn.x, spawn.y);
      //setta outros estados
      (this.player.body as Phaser.Physics.Arcade.Body).reset(spawn.x, spawn.y);
      this.fog.setup(role);
      this.hud.update(role, this.myHp, false);
      this.staminaBar.setVisible(role === 'survivor');
      if (role === 'survivor') {
        this.trackSurvivor(s.id!, { hp: this.myHp, downed: false, expelled: false, escaped: false });
        this.refreshSurvivorHUD();
      }
    });

    // recebe o estado completo do jogo (usado no sync inicial e qnd alguem entra)
    s.on('gameState', (state: GameState) => {
      this.terminals.sync(state.terminals, state.terminalPositions);
      Object.entries(state.players).forEach(([id, p]) => {
        if (id !== s.id) this.players.getOrCreate(id, p);
        if (p.role === 'survivor') this.trackSurvivor(id, { hp: p.hp, downed: p.downed, expelled: p.expelled, escaped: p.escaped });
      });
      this.hud.setTerminalCount(state.hackedCount, Object.keys(state.terminals).length);
      this.hud.setGateOpen(state.gateOpen);
      this.refreshSurvivorHUD();
    });

    //mujdanca de cena
    s.on('gamePhase', (phase: GamePhase) => {
      this.gamePhase = phase;
      this.hud.update(this.myRole, this.myHp, this.downed);
    });

    // outros players se movendo
    s.on('playerMoved', (data: { id: string; x: number; y: number }) => {
      this.players.move(data.id, data.x, data.y);
    });

    // player kita
    s.on('playerLeft', (id: string) => {
      this.players.remove(id);
      this.survivorInfo.delete(id);
      this.survivorOrder = this.survivorOrder.filter((sid) => sid !== id);
      this.refreshSurvivorHUD();
    });

    // atualizacao de terminal
    s.on('terminalUpdate', ({ id, progress }: { id: string; progress: number }) => {
      this.terminals.setProgress(id, progress);
      this.refreshTerminalHUD();
    });

    // terminal hackeado
    s.on('terminalHacked', (id: string) => {
      this.terminals.setProgress(id, 100);
      this.refreshTerminalHUD();
      this.hud.flash('Terminal hackeado!', 0x00e676);
    });

    // firewall ativada(aluno errou skillcheck)
    // TODO: talvez seja interessante mandar o id do terminal pra mostrar um alerta visual nele, tipo piscar ou algo assim
    s.on('firewallAlert', ({ terminalId }: { terminalId: string }) => {
      this.terminals.setFailed(terminalId);
      if (this.myRole === 'professor') {
        this.hud.flash(`Firewall: ${terminalId}`, 0xffcc00);
        this.terminals.flashAlert(terminalId, this.tweens);
      }
    });

    // portao desbloqueado
    s.on('gateUnlocked', () => {
      this.gateOpen = true;
      this.terminals.unlockGate();
      this.hud.setGateOpen(true);
      this.hud.flash('Portão aberto, fuja!', 0x00e676);
    });

    // player atacado
    s.on('playerHit', ({ targetId, hp }: { targetId: string; hp: number }) => {
      if (targetId === s.id) {
        this.myHp = hp;
        this.hud.update(this.myRole, this.myHp, this.downed);
        this.hud.flash('Você foi atingido!', 0xff4444);
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, hp }); this.refreshSurvivorHUD(); }
    });

    // player detido
    // TODO: queria q as skill check aqui fossem mais dificeis, nao era pra ta colocando aqui mas lembrei agora
    s.on('playerDowned', (targetId: string) => {
      if (targetId === s.id) {
        this.downed = true;
        this.myHp   = 0;
        this.hud.update(this.myRole, this.myHp, true);
        this.hud.flash('Em DETENÇÃO! Passe no exame!', 0xff4444);
        this.startDetention();
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno detido!', 0xffcc00);
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, hp: 0, downed: true }); this.refreshSurvivorHUD(); }
    });

    // stun q o killer toma por hittar
    s.on('attackStagger', (ms: number) => {
      this.inputFrozen  = true;
      this.staggerTimer = ms;
    });

    // reviveu
    s.on('detentionEscaped', () => {
      this.downed = false;
      this.myHp   = 1;
      this.inputFrozen = false;
      this.hud.update(this.myRole, this.myHp, false);
      this.hud.flash('Você escapou da detenção!', 0x4fc3f7);
      const info = this.survivorInfo.get(s.id!);
      if (info) { this.survivorInfo.set(s.id!, { ...info, hp: 1, downed: false }); this.refreshSurvivorHUD(); }
    });

    //progresso do revive
    s.on('detentionProgress', ({ current, required }: { current: number; required: number }) => {
      if (!this.downed) return;
      this.hud.flash(`Detenção: ${current}/${required}`, 0xffcc00, 1200);
    });

    //morto
    s.on('expelled', () => {
      this.expelled    = true;
      this.inputFrozen = true;
      this.hud.update(this.myRole, this.myHp, false);
      this.hud.flash('EXPULSO!', 0xff4444, 4000);
    });

    // alerta pra qnd revive aluno
    s.on('playerRevived', (id: string) => {
      if (this.myRole === 'professor' && id !== s.id)
        this.hud.flash('Aluno escapou da detenção!', 0x4fc3f7);
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, hp: 1, downed: false }); this.refreshSurvivorHUD(); }
    });

    //alerta pra qnd aluno morre
    s.on('playerExpelled', (id: string) => {
      this.players.setAlpha(id, 0.25);
      if (this.myRole === 'professor' && id !== s.id)
        this.hud.flash('Aluno expulso!', 0x00e676);
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, expelled: true }); this.refreshSurvivorHUD(); }
    });

    //yay escapou
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

    s.on('gameOver', ({ winner }: { winner: string }) => {
      this.inputFrozen = true;
      const msg = winner === 'survivors' ? 'ALUNOS VENCERAM!' : 'PROFESSOR VENCEU!';
      const col = winner === 'survivors' ? 0x4fc3f7 : 0xe94560;
      this.hud.flash(msg, col, 8000);
    });

    s.on('gameReset', () => {
      this.voiceManager?.destroy();
      this.voiceManager = null;
      this.hud.setMicState('off');
      this.scene.restart();
    });
  }

  //detencao
  private startDetention() {
    this.inputFrozen = true;
    this.skillCheck.show(
      (isGreat) => {
        this.socket.emit('detentionAnswer', { correct: true, isGreat });
        if (this.downed) this.time.delayedCall(Phaser.Math.Between(2000, 4000), () => {
          if (this.downed) this.startDetention();
        });
      },
      () => {
        this.socket.emit('detentionAnswer', { correct: false, isGreat: false });
        if (this.downed) this.time.delayedCall(Phaser.Math.Between(2000, 4000), () => {
          if (this.downed) this.startDetention();
        });
      },
    );
  }

  private runHackSkillCheck(terminalId: TerminalId) {
    this.inputFrozen = true;
    this.skillCheck.show(
      (isGreat) => {
        this.inputFrozen = false;
        if (isGreat) this.socket.emit('hackProgress', { terminalId, amount: HACK_GREAT_BONUS });
      },
      () => {
        this.inputFrozen = false;
        this.socket.emit('skillCheckFailed', { terminalId });
      },
    );
  }

  //  interacao com o portao (survivor tem q ta perto e clicar no e pra escapar)
  // TODO: devia mostrar as teclas perto do que vc pode apertar, tipo portao e terminal[] 
  private isNearGate(): boolean {
    const gm = this.terminals.gateMarker;
    if (!gm) return false;
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, gm.x, gm.y) < INTERACT_RADIUS;
  }

  private _updateSurvivorInteractions(delta: number) {
    const nearTerminal = this.terminals.nearest(this.player.x, this.player.y);

    if ((this.eKey.isDown || this.padActionHeld) && nearTerminal && !this.downed) {
      this.hackingTerminal = nearTerminal;
      this.terminals.setWorking(nearTerminal);

      this.hackPassiveTimer += delta;
      if (this.hackPassiveTimer >= HACK_PASSIVE_RATE_MS) {
        this.hackPassiveTimer = 0;
        this.socket.emit('hackProgress', { terminalId: nearTerminal, amount: HACK_PASSIVE_TICK });
      }

      this.hackHoldTimer += delta;
      if (this.hackHoldTimer >= this.hackNextThreshold) {
        this.hackHoldTimer     = 0;
        this.hackNextThreshold = Phaser.Math.Between(2500, 5000);
        this.runHackSkillCheck(nearTerminal);
      }
      return;
    }

    this.hackingTerminal  = null;
    this.hackPassiveTimer = 0;
    this.hackHoldTimer    = 0;
    this.terminals.setWorking(null);

    if ((Phaser.Input.Keyboard.JustDown(this.eKey) || this.padActionJust) && this.gateOpen && this.isNearGate()) {
      this.socket.emit('escape');
    }
  }

  private _updateProfessorInteractions() {
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust) {
      const target = this.players.nearestSurvivor(this.player.x, this.player.y);
      if (target) this.socket.emit('attack', { targetId: target });
    }
    if (Phaser.Input.Keyboard.JustDown(this.eKey) || this.padActionJust) {
      const t = this.terminals.nearest(this.player.x, this.player.y);
      if (t) this.socket.emit('reinforceTerminal', { terminalId: t });
    }
  }

  //  normaliza um angulo pra ficar entre -PI e PI, pra facilitar os calculo 
  private normalizeAngle(angle: number): number {
    const fullTurn = Math.PI * 2;
    let normalized = angle;
    while (normalized > Math.PI) normalized -= fullTurn;
    while (normalized < -Math.PI) normalized += fullTurn;
    return normalized;
  }

  // suaviza a rotacao da luz pra n ficar travada no angulo do input, o que deixa mais fluido e fácil de mirar
  //ficou mt irado btw
  private smoothLookAngle(delta: number) {
    const diff = this.normalizeAngle(this.targetLookAngle - this.lookAngle);
    const smoothing = 1 - Math.pow(0.005, delta / 1000);
    this.lookAngle = this.normalizeAngle(this.lookAngle + diff * smoothing);
  }

  //  loop principal do jogo, 60 ticks/s
  update(_time: number, delta: number) {
    this.skillCheck.update(delta);
    this.terminals.update(delta);

    // gamepad — lê estado do pad1 e detecta "just pressed" para este frame
    const pad = (this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin)?.pad1 ?? null;
    this.hud.setGamepadConnected(pad !== null);
    const DEADZONE = PAD_DEADZONE;
    const padActionNow = pad?.buttons[0].pressed ?? false; // A — ação (E)
    const padAttackNow = pad?.buttons[2].pressed ?? false; // X — ataque/skill check (SPACE)
    this.padActionHeld = padActionNow;
    this.padSprintHeld = pad?.buttons[5].pressed ?? false; // R1 — sprint
    this.padActionJust = padActionNow && !this.padPrevAction;
    this.padAttackJust = padAttackNow && !this.padPrevAttack;
    this.padPrevAction = padActionNow;
    this.padPrevAttack = padAttackNow;

    if (Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.toggleCollisionDebug();
    }

    // se o input ta congelado, n processa nada além do skill check e do timer de stun
    if (this.inputFrozen) {
      if (this.skillCheck.active && (Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust)) {
        this.skillCheck.tryHit();
      }
      if (this.staggerTimer > 0) {
        this.staggerTimer -= delta;
        if (this.staggerTimer <= 0) {
          this.staggerTimer = 0;
          if (!this.expelled && !this.escaped) this.inputFrozen = false;
        }
      }
      this.smoothLookAngle(delta);
      this.fog.update(this.player, this.lookAngle);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      if (this.myRole) playRoleAnimation(this.player, this.myRole, 'idle', this.facingDirection);
      this.players.update(this.time.now);
      return;
    }

    // stamina e corrida (só pros alunos)
    if (this.myRole === 'survivor') {
      this.sprinting = (this.shiftKey.isDown || this.padSprintHeld) && this.stamina > STAMINA_MIN_SPRINT;
      if (this.sprinting) {
        this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * (delta / 1000));
        if (this.stamina === 0) this.sprinting = false;
      } else {
        this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * (delta / 1000));
      }
      this.staminaBar.update(this.stamina);
    }

    //  Movimento
    let speed: number;
    if (this.myRole === 'professor') {
      speed = PROFESSOR_SPEED;
    } else {
      speed = this.sprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
    }

    let vx = 0, vy = 0;
    let analogScale = 1;

    // suporta tanto setas quanto wasd
    if (this.cursors.left.isDown  || this.wasd['A'].isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd['D'].isDown) vx = 1;
    if (this.cursors.up.isDown    || this.wasd['W'].isDown) vy = -1;
    else if (this.cursors.down.isDown  || this.wasd['S'].isDown) vy = 1;

    // gamepad stick esquerdo sobrepoe teclado se alem da deadzone
    if (pad) {
      const sx = pad.leftStick.x;
      const sy = pad.leftStick.y;
      const magnitude = Math.hypot(sx, sy);
      if (magnitude > DEADZONE) {
        vx = sx;
        vy = sy;
        analogScale = Math.min(magnitude, 1);
      }
    }

    // normaliza a velocidade pra n ficar mais rapido na diagonal; escala pela magnitude do analogico
    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed * analogScale;
      vy = (vy / len) * speed * analogScale;
      this.targetLookAngle = Math.atan2(vy, vx);
      if (Math.abs(vx) > Math.abs(vy)) this.facingDirection = vx > 0 ? 'right' : 'left';
      else this.facingDirection = vy > 0 ? 'down' : 'up';
    }

    // gamepad stick direito define angulo de visao do professor
    if (this.myRole === 'professor' && pad) {
      const rx = pad.rightStick.x;
      const ry = pad.rightStick.y;
      if (Math.abs(rx) > DEADZONE || Math.abs(ry) > DEADZONE) {
        this.targetLookAngle = Math.atan2(ry, rx);
      }
    }
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);

    if (this.myRole) {
      if (vx !== 0 || vy !== 0) playRoleAnimation(this.player, this.myRole, 'walk', this.facingDirection);
      else playRoleAnimation(this.player, this.myRole, 'idle', this.facingDirection);
    }

    // emite o movimento p server
    this.lastMoveEmit += delta;
    if ((vx !== 0 || vy !== 0) && this.lastMoveEmit > MOVE_EMIT_RATE_MS) {
      this.lastMoveEmit = 0;
      this.socket.emit('move', { x: this.player.x, y: this.player.y });
    }

    this.smoothLookAngle(delta);
    this.fog.update(this.player, this.lookAngle);
    this.players.update(this.time.now);

    if (this.voiceManager && this.myRole) {
      this.voiceManager.updateSpatialAudio(
        { x: this.player.x, y: this.player.y },
        this.myRole,
        this.players.getPositions(),
        this.lookAngle,
      );
    }

    if (this.myRole === 'survivor')  this._updateSurvivorInteractions(delta);
    else if (this.myRole === 'professor') {
      this._updateProfessorInteractions();
      this.hud.setAttackCooldown(this.staggerTimer);
    }

    if (this.collisionDebugEnabled && this.playerBodyDebugGraphics) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      this.playerBodyDebugGraphics.clear();
      this.playerBodyDebugGraphics.lineStyle(2, 0x00ff00, 1);
      this.playerBodyDebugGraphics.strokeRect(body.left, body.top, body.width, body.height);
    }
  }
}
