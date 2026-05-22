import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import {
  PLAYER_SPEED, PLAYER_SPRINT_SPEED, PROFESSOR_SPEED, ON_HIT_SPRINT_SPEED, ON_HIT_SPRINT_MS,
  SCRATCH_MARKS_SELF_VISIBLE, BLOOD_SELF_VISIBLE,
  INTERACT_RADIUS, HACK_PASSIVE_RATE_MS, HACK_PASSIVE_TICK, HACK_GREAT_BONUS,
  HACK_FAIL_LOCK_MS,
  HEAL_PASSIVE_TICK, HEAL_PASSIVE_RATE_MS, HEAL_GREAT_BONUS,
  HEAL_SELF_RATE_FACTOR, CRAWL_SPEED_FACTOR,
  HEAL_FAIL_LOCK_MS, HEAL_SELF_CAP, BLEED_OUT_MS,
  MOVE_EMIT_RATE_MS,
  WORLD_WIDTH, WORLD_HEIGHT, MAP_SCALE,
  LUNGE_THRESHOLD_MS, LUNGE_MAX_HOLD_MS,
  QUICK_ATTACK_RADIUS, QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS, LUNGE_ATTACK_HALF_ANGLE_RAD,
  TERROR_RADIUS,
  BLOODLUST_SPEED_BONUS_PX_S,
  GATE_TICK_MS, GATE_TICK_AMOUNT, ENDGAME_DURATION_MS,
} from '../constants';
import type { Role, GamePhase, GameState, TerminalId, GateId } from '../types';
import { SkillCheck }      from '../game/SkillCheck';
import { FogOfWar }        from '../game/FogOfWar';
import { HUD }             from '../game/HUD';
import { TerminalManager } from '../game/TerminalManager';
import { PlayerManager }      from '../game/PlayerManager';
import { ScratchMarkManager } from '../game/ScratchMarkManager';
import { BloodPoolManager }   from '../game/BloodPoolManager';
import { VoiceManager }       from '../game/VoiceManager';
import { ExitGateManager }   from '../game/ExitGateManager';
import {
  applySkinToSprite,
  applyDownedFrame,
  ensurePlayerSkinAnimations,
  getSkinForRole,
  type MoveDirection,
  playRoleAnimation,
  playCombatAnimation,
  playHurtFallAnimation,
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
  private gates!:             ExitGateManager;
  private openingGate:        GateId | null = null;
  private gateOpenTimer:      number = 0;
  private endgameReceivedAt:  number | null = null;
  private endgameBellsRung =  new Set<number>();
  private isSwinging       = false;
  private swingDirection:  MoveDirection | null = null;
  private attackHoldStart: number | null = null;
  private lastLungeTick    = 0;
  private padAttackJustUp  = false;
  private mouseAttackJust    = false;
  private mouseAttackJustUp  = false;
  private isHitStagger     = false;
  private bloodlustTier:  0 | 1 | 2 | 3 = 0;
  private chaseActive     = false;
  private slashSprite:   Phaser.GameObjects.Sprite | null = null;
  private isKicking      = false;
  private kickSprite:    Phaser.GameObjects.Sprite | null = null;
  private wasCharging    = false;

  private survivorOrder: string[] = [];
  private survivorInfo  = new Map<string, { hp: number; downed: boolean; expelled: boolean; escaped: boolean; hacking: boolean; downCount: 0|1|2; healPct: number; beingHealed: boolean }>();
  private hackingTerminal:    TerminalId | null = null;
  private prevHackingEmitted: TerminalId | null = null;
  private hackHoldTimer    = 0;
  private hackTimerTerminal: TerminalId | null = null;
  private lastMoveEmit   = 0;
  private lookAngle      = 0;
  private targetLookAngle = 0;
  private facingDirection: MoveDirection = 'down';
  private _slidAxis: 'x' | 'y' | null = null;
  private _slidHysteresis = 0;

  private mapWorldWidth = WORLD_WIDTH;
  private mapWorldHeight = WORLD_HEIGHT;
  private mapRef: Phaser.Tilemaps.Tilemap | null = null;
  private collisionDebugGraphics: Phaser.GameObjects.Graphics | null = null;
  private playerBodyDebugGraphics: Phaser.GameObjects.Graphics | null = null;
  private collisionDebugEnabled = false;
  private lastCollisionLogAt: Record<string, number> = {};

  private sprinting              = false;
  private onHitSprintTimer       = 0;
  private scratchMarkTimer       = 0;
  private bloodDropTimer         = 0;
  private bloodStationaryTimer   = 0;
  private bloodBigPoolSpawned    = false;

  //  outras classes do jogo
  private skillCheck!:  SkillCheck;
  private hackNextThreshold = 0;
  private hackPassiveTimer = 0;
  private healingTarget:       string | null = null;
  private prevHealingEmitted:  string | null = null;
  private healPassiveTimer     = 0;
  private healHoldTimer        = 0;
  private healNextThreshold    = 0;
  private healLockUntil        = 0;
  private beingHealed          = false;
  private myDownCount:         0 | 1 | 2 = 0;
  private myHealPct            = 0;
  private myDownBleedMs        = 0;
  private fog!:         FogOfWar;
  private hud!:         HUD;
  private terminals!:     TerminalManager;
  private players!:       PlayerManager;
  private scratchMarks!:  ScratchMarkManager;
  private bloodPools!:    BloodPoolManager;
  private voiceManager:   VoiceManager | null = null;

  //  inputs
  private cursors!:    Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:       Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!:   Phaser.Input.Keyboard.Key;
  private eKey!:       Phaser.Input.Keyboard.Key;
  private shiftKey!:   Phaser.Input.Keyboard.Key;
  private cKey!:       Phaser.Input.Keyboard.Key;

  // gamepad — flags virtuais atualizadas a cada frame
  private padActionHeld  = false;
  private padAttackHeld  = false;
  private padSprintHeld  = false;
  private padActionJust  = false;
  private padAttackJust  = false;
  private padPrevAction  = false;
  private padPrevAttack  = false;

  
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

  private playProfessorHurtAnimation(ms: number) {
    if (!this.textures.exists('professor-hurt')) return;
    if (this.anims.exists('professor:hurt')) this.anims.remove('professor:hurt');
    this.anims.create({
      key: 'professor:hurt',
      frames: [
        { key: 'professor-hurt', frame: 0 },
        { key: 'professor-hurt', frame: 1 },
        { key: 'professor-hurt', frame: 2 },
        { key: 'professor-hurt', frame: 2 },
        { key: 'professor-hurt', frame: 1 },
        { key: 'professor-hurt', frame: 0 },
      ],
      duration: ms,
      repeat: 0,
    });
    this.player.play('professor:hurt');
  }

  private createProfessorSlashAnimations() {
    const dirs: [MoveDirection, number][] = [['up', 0], ['left', 1], ['down', 2], ['right', 3]];
    dirs.forEach(([dir, row]) => {
      const slashKey = `professor-slash:${dir}`;
      if (!this.anims.exists(slashKey)) {
        this.anims.create({
          key: slashKey,
          frames: this.anims.generateFrameNumbers('professor-slash', { start: row * 6, end: row * 6 + 5 }),
          frameRate: 12,
          repeat: 0,
        });
      }
      const kickKey = `professor-kick:${dir}`;
      if (!this.anims.exists(kickKey)) {
        this.anims.create({
          key: kickKey,
          frames: this.anims.generateFrameNumbers('professor-slash', { start: row * 6, end: row * 6 + 5 }),
          frameRate: 5,
          repeat: 1,
        });
      }
    });
  }

  private showAttackHitbox(x: number, y: number, angle: number, isLunge: boolean) {
    const radius    = isLunge ? LUNGE_ATTACK_RADIUS    : QUICK_ATTACK_RADIUS;
    const halfAngle = isLunge ? LUNGE_ATTACK_HALF_ANGLE_RAD : QUICK_ATTACK_HALF_ANGLE_RAD;

    const g = this.add.graphics().setDepth(30);
    g.lineStyle(2, 0xff2222, 1);
    g.fillStyle(0xff2222, 0.25);

    const steps = 16;
    const pts: { x: number; y: number }[] = [{ x, y }];
    for (let i = 0; i <= steps; i++) {
      const a = angle - halfAngle + (2 * halfAngle * i / steps);
      pts.push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius });
    }
    pts.push({ x, y });

    g.strokePoints(pts, false);
    g.fillPoints(pts, true, false);
    this.time.delayedCall(500, () => g.destroy());
  }

  private playProfessorKick(terminalId: TerminalId) {
    if (this.isKicking || this.isSwinging) return;
    this.isKicking = true;
    this.socket.emit('kick', { x: this.player.x, y: this.player.y, dir: this.facingDirection });
    this.player.setVisible(false);

    const kick = this.add.sprite(this.player.x, this.player.y, 'professor-slash')
      .setDepth(6)
      .setDisplaySize(128, 128);
    this.kickSprite = kick;
    kick.play(`professor-kick:${this.facingDirection}`);

    kick.once('animationcomplete', () => {
      kick.destroy();
      this.kickSprite = null;
      this.player.setVisible(true);
      this.isKicking = false;
      this.socket.emit('reinforceTerminal', { terminalId });
    });
  }

  private _fireAttack(isLunge: boolean) {
    this.attackHoldStart = null;
    if (this.isSwinging || this.isKicking) return;
    this._playProfessorSlash(isLunge);
  }

  private _playProfessorSlash(isLunge: boolean) {
    this.isSwinging     = true;
    this.swingDirection = this.facingDirection;

    this.player.setVisible(false);
    const slash = this.add.sprite(this.player.x, this.player.y, 'professor-slash')
      .setDepth(6)
      .setDisplaySize(128, 128);
    this.slashSprite = slash;
    slash.play(`professor-slash:${this.swingDirection}`);

    const angle = this.lookAngle;
    this.showAttackHitbox(this.player.x, this.player.y, angle, isLunge);
    this.socket.emit('attack', { x: this.player.x, y: this.player.y, angle, lunge: isLunge, dir: this.facingDirection });

    slash.once('animationcomplete', () => {
      slash.destroy();
      this.slashSprite    = null;
      this.swingDirection = null;
      this.player.setVisible(true);
      this.isSwinging     = false;
    });
  }

  preload() {
    this.load.tilemapTiledJSON('school-map', '/maps/mapa.phaser.json');
    this.load.spritesheet('computer-terminal-sheet', '/Computer Room Spritesheet 1 (1).png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.spritesheet('professor-slash', '/personagens/professor/slash_128.png', {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.spritesheet('professor-hurt', '/personagens/professor/hurt.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
    MAP_TILESETS.forEach((tileset) => {
      this.load.image(tileset.key, encodeURI(tileset.image));
    });
    preloadPlayerSkins(this);
    ScratchMarkManager.preload(this);
    BloodPoolManager.preload(this);
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

  private static readonly SURVIVOR_SKIN_SLOTS = ['arthur', 'gustavo', 'giu', 'isabela'] as const;

  private refreshSurvivorHUD() {
    const statuses = this.survivorOrder.map((id, i) => {
      const info = this.survivorInfo.get(id) ?? {
        hp: 2, downed: false, expelled: false, escaped: false,
        hacking: false, downCount: 0 as const, healPct: 0, beingHealed: false,
      };
      return { label: `A${i + 1}`, skinId: GameScene.SURVIVOR_SKIN_SLOTS[i] ?? 'arthur', ...info };
    });
    this.hud.setSurvivorStatuses(statuses, this.myRole === 'survivor');
  }

  private refreshTerminalHUD() {
    const { done, total } = this.terminals.getCount();
    this.hud.setTerminalCount(done, total);
  }

  private trackSurvivor(id: string, info: { hp: number; downed: boolean; expelled: boolean; escaped: boolean; downCount?: 0|1|2; healPct?: number; beingHealed?: boolean }) {
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
    this.openingGate       = null;
    this.gateOpenTimer     = 0;
    this.endgameReceivedAt = null;
    this.endgameBellsRung.clear();
    this.isSwinging      = false;
    this.swingDirection  = null;
    this.attackHoldStart = null;
    this.mouseAttackJust    = false;
    this.mouseAttackJustUp  = false;
    this.isHitStagger    = false;
    this.isKicking = false;
    this.hackingTerminal       = null;
    this.hackTimerTerminal     = null;
    this.hackHoldTimer         = 0;
    this.healingTarget         = null;
    this.prevHealingEmitted    = null;
    this.healPassiveTimer      = 0;
    this.healHoldTimer         = 0;
    this.healNextThreshold     = 0;
    this.healLockUntil         = 0;
    this.beingHealed           = false;
    this.myDownCount           = 0;
    this.myHealPct             = 0;
    this.myDownBleedMs         = 0;
    this.lastMoveEmit = 0;
    this.lookAngle = 0;
    this.targetLookAngle = 0;
    this.facingDirection = 'down';
    this._slidAxis = null;
    this._slidHysteresis = 0;

    this.sprinting = false;
    this.onHitSprintTimer = 0;
    this.scratchMarkTimer = 0;
    this.bloodDropTimer = 0;
    this.bloodStationaryTimer = 0;
    this.bloodBigPoolSpawned = false;
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
    this.player = this.physics.add.sprite(400, 300, defaultSkin.idle.key).setDepth(5);
    this.player.setDisplaySize(defaultSkin.displayWidth, defaultSkin.displayHeight);
    this.player.setCollideWorldBounds(true);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(32, 48, false);
    playerBody.setOffset(defaultSkin.bodyOffset.x, defaultSkin.bodyOffset.y);
    ensurePlayerSkinAnimations(this);
    this.createProfessorSlashAnimations();

    playRoleAnimation(this.player, 'survivor', 'idle', this.facingDirection);
    this.hackNextThreshold = Phaser.Math.Between(2500, 5000);
    this.healNextThreshold = Phaser.Math.Between(2500, 5000);

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
    this.gates       = new ExitGateManager(this);
    this.players      = new PlayerManager(this);
    this.scratchMarks = new ScratchMarkManager(this);
    this.bloodPools   = new BloodPoolManager(this);

    //setta as bind
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.wasd     = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.eKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.cKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    this.hud.build();
    this.hud.flash('Colisao ativa em TODOS os layers (edite COLLISION_LAYERS). C = debug', 0xffcc00, 2600);

    const gpPlugin = this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin;
    gpPlugin?.on('connected', (gamepad: Phaser.Input.Gamepad.Gamepad) => {
      this.hud.setGamepadConnected(true);
      this.hud.flash(`Controle detectado: ${gamepad.id.slice(0, 30)}`, 0x00ff88, 2500);
    });
    gpPlugin?.on('disconnected', () => {
      this.hud.setGamepadConnected(false);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0 && this.myRole === 'professor') {
        this.mouseAttackJust = true;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0 && this.myRole === 'professor') {
        this.mouseAttackJustUp = true;
      }
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
      this.fog.setup(role, this.mapRef!);
      this.hud.update(role, this.myHp, false);
      if (role === 'professor') {
        this.terminals.setAuraMode(true);
        this.gates.setAuraMode(true);
      }
      if (role === 'survivor') {
        this.trackSurvivor(s.id!, { hp: this.myHp, downed: false, expelled: false, escaped: false });
        this.refreshSurvivorHUD();
      }
    });

    // recebe o estado completo do jogo (usado no sync inicial e qnd alguem entra)
    s.on('gameState', (state: GameState) => {
      this.terminals.sync(state.terminals, state.terminalPositions);
      Object.entries(state.players).forEach(([id, p]) => {
        if (id !== s.id) {
          this.players.getOrCreate(id, p);
          if (p.role === 'survivor' && p.downed) this.players.setDowned(id, true);
        }
        if (p.role === 'survivor') this.trackSurvivor(id, {
          hp: p.hp, downed: p.downed, expelled: p.expelled, escaped: p.escaped,
          downCount: p.downCount ?? 0, healPct: p.healPct ?? 0, beingHealed: p.beingHealed ?? false,
        });
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
      this.hud.setTerminalCount(state.hackedCount, Object.keys(state.terminals).length);
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

    //mujdanca de cena
    s.on('gamePhase', (_phase: GamePhase) => {
      this.hud.update(this.myRole, this.myHp, this.downed);
    });

    // outros players se movendo
    s.on('playerMoved', (data: { id: string; x: number; y: number; sprinting?: boolean; dir?: MoveDirection }) => {
      this.players.move(data.id, data.x, data.y, data.sprinting, data.dir);
    });

    s.on('scratchMark', ({ x, y, direction }: { x: number; y: number; direction: MoveDirection }) => {
      this.scratchMarks.spawn(x, y, direction);
    });

    s.on('bloodMark', ({ x, y, frame }: { x: number; y: number; frame: number }) => {
      this.bloodPools.spawn(x, y, frame);
    });

    s.on('bloodBigPool', ({ x, y }: { x: number; y: number }) => {
      this.bloodPools.spawnBigPool(x, y);
    });

    s.on('professorAttacked', (data: { id: string; x: number; y: number; dir: string }) => {
      this.players.playAttack(data.id, data.x, data.y, data.dir as import('../game/playerSkins').MoveDirection);
    });

    s.on('professorKicked', (data: { id: string; x: number; y: number; dir: string }) => {
      this.players.playKick(data.id, data.x, data.y, data.dir as import('../game/playerSkins').MoveDirection);
    });

    s.on('professorCharge', (data: { id: string; charging: boolean }) => {
      this.players.setCharging(data.id, data.charging);
    });

    s.on('professorStaggered', (data: { id: string; ms: number }) => {
      this.players.playStagger(data.id, data.ms);
    });

    // player kita
    s.on('playerLeft', (id: string) => {
      this.players.remove(id);
      this.survivorInfo.delete(id);
      this.survivorOrder = this.survivorOrder.filter((sid) => sid !== id);
      this.refreshSurvivorHUD();
    });

    s.on('survivorActivity', ({ socketId, terminalId }: { socketId: string; terminalId: string | null }) => {
      const info = this.survivorInfo.get(socketId);
      if (!info) return;
      this.survivorInfo.set(socketId, { ...info, hacking: terminalId !== null });
      this.refreshSurvivorHUD();
    });

    // atualizacao de terminal
    s.on('terminalUpdate', ({ id, progress }: { id: string; progress: number }) => {
      this.terminals.setProgress(id, progress);
      this.refreshTerminalHUD();
      if (this.hackingTerminal === id) {
        this.hud.setHackProgress(progress);
      }
    });

    // terminal hackeado
    s.on('terminalHacked', (id: string) => {
      this.terminals.setProgress(id, 100);
      this.refreshTerminalHUD();
      this.hud.flash('Terminal hackeado!', 0x00e676);
    });

    s.on('firewallAlert', ({ terminalId }: { terminalId: string }) => {
      this.terminals.setFailed(terminalId, HACK_FAIL_LOCK_MS);
      this.terminals.setLocked(terminalId, HACK_FAIL_LOCK_MS);
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

    s.on('endgameStarted', () => {
      this.endgameReceivedAt = this.time.now;
      this.endgameBellsRung.clear();
      this.terminals.blockAll();
      this.hud.flash('COLAPSO FINAL!', 0xff2222, 3000);
    });

    // player atacado
    s.on('playerHit', ({ targetId, hp }: { targetId: string; hp: number }) => {
      if (targetId === s.id) {
        this.myHp = hp;
        this.hud.update(this.myRole, this.myHp, this.downed, this.myDownCount);
        this.hud.flash('Você foi atingido!', 0xff4444);
        if (!this.downed) this.onHitSprintTimer = ON_HIT_SPRINT_MS;
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, hp }); this.refreshSurvivorHUD(); }
    });

    s.on('playerDowned', ({ id, downCount }: { id: string; downCount: 0|1|2 }) => {
      if (id === s.id) {
        this.downed             = true;
        this.myHp               = 0;
        this.myDownCount        = downCount;
        this.myHealPct          = 0;
        this.myDownBleedMs      = 0;
        this.beingHealed        = false;
        this.healingTarget      = null;
        this.prevHealingEmitted = null;
        this.socket.emit('setHealing', { targetId: null });
        this.hud.update(this.myRole, this.myHp, true, this.myDownCount);
        this.hud.flash('Você foi derrubado!', 0xff4444);
        playHurtFallAnimation(this.player, 'survivor', this.facingDirection);
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno derrubado!', 0xffcc00);
      }
      this.trackSurvivor(id, { hp: 0, downed: true, expelled: false, escaped: false, downCount, healPct: 0 });
      this.refreshSurvivorHUD();
      if (id !== s.id) this.players.setDowned(id, true);
    });

    // stun q o killer toma por hittar
    s.on('attackStagger', (ms: number) => {
      this.inputFrozen  = true;
      this.staggerTimer = ms;
      if (this.myRole === 'professor') {
        this.isHitStagger = true;
        this.playProfessorHurtAnimation(ms);
      }
    });

    //morto
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
        this.hud.flash('Revivido! Cuide-se.', 0x4fc3f7);
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno se levantou!', 0x4fc3f7);
      }
      this.trackSurvivor(id, { hp, downed: false, expelled: false, escaped: false, healPct: 0 });
      this.refreshSurvivorHUD();
      this.players.setDowned(id, false);
    });

    s.on('playerHealed', ({ id, hp }: { id: string; hp: number }) => {
      if (id === s.id) {
        this.myHp        = hp;
        this.myHealPct   = 0;
        this.beingHealed = false;
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.flash('Totalmente curado!', 0x4caf50);
      }
      this.trackSurvivor(id, { hp, downed: false, expelled: false, escaped: false, healPct: 0 });
      this.refreshSurvivorHUD();
    });

    s.on('healUpdate', ({ targetId, healPct }: { targetId: string; healPct: number }) => {
      if (targetId === s.id) {
        this.myHealPct = healPct;
        this.hud.setRecoveryProgress(healPct);
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, healPct }); this.refreshSurvivorHUD(); }
    });

    s.on('setBeingHealed', ({ targetId, isBeingHealed }: { targetId: string; isBeingHealed: boolean }) => {
      if (targetId === s.id) {
        this.beingHealed = isBeingHealed;
        if (isBeingHealed) {
          this.healPassiveTimer = 0;
          this.healHoldTimer    = 0;
        }
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, beingHealed: isBeingHealed }); this.refreshSurvivorHUD(); }
    });

    s.on('downCountUpdated', ({ id, downCount }: { id: string; downCount: 0|1|2 }) => {
      if (id === s.id) {
        this.myDownCount   = downCount;
        this.myDownBleedMs = 0;
        this.myHealPct     = 0;
        this.hud.setDownCount(downCount);
        this.hud.flash('Situação piorou!', 0xff8800, 2000);
      }
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, downCount }); this.refreshSurvivorHUD(); }
    });

    s.on('healAlert', ({ targetId }: { targetId: string; healerId: string }) => {
      if (this.myRole !== 'professor') return;
      const pos = this.players.getPosition(targetId);
      if (!pos) return;
      const cam = this.cameras.main;
      this.hud.showHealAlert(targetId, pos.x, pos.y, cam.scrollX, cam.scrollY, cam.width, cam.height);
    });

    //alerta pra qnd aluno morre
    s.on('playerExpelled', (id: string) => {
      if (id === s.id) {
        this.expelled    = true;
        this.downed      = false;
        this.inputFrozen = true;
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.flash('Você foi expulso!', 0xff1744, 4000);
      } else {
        this.players.setAlpha(id, 0.25);
        if (this.myRole === 'professor')
          this.hud.flash('Aluno expulso!', 0x00e676);
      }
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

    s.on('bloodlustUpdate', ({ tier, chaseActive }: { tier: 0 | 1 | 2 | 3; chaseActive: boolean }) => {
      this.bloodlustTier = tier;
      this.chaseActive   = chaseActive;
      this.hud.setChaseState(chaseActive, tier);
    });

    s.on('gameReset', () => {
      this.scratchMarks?.clear();
      this.bloodPools?.clear();
      this.voiceManager?.destroy();
      this.voiceManager = null;
      this.hud.setMicState('off');
      this.scene.restart();
    });
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

  private runHealSkillCheck(targetId: string, isSelf: boolean) {
    this.inputFrozen = true;
    this.skillCheck.show(
      (isGreat) => {
        this.inputFrozen = false;
        if (isGreat) {
          const bonus = isSelf
            ? HEAL_GREAT_BONUS * HEAL_SELF_RATE_FACTOR
            : HEAL_GREAT_BONUS;
          this.socket.emit('healProgress', { targetId, amount: bonus });
        }
      },
      () => {
        this.inputFrozen = false;
        this.socket.emit('healSkillCheckFailed', { targetId });
        this.healLockUntil = this.time.now + HEAL_FAIL_LOCK_MS;
      },
    );
  }

  private nearestHealablePlayer(): string | null {
    let bestId:       string | null = null;
    let bestDist      = INTERACT_RADIUS + 1;
    let bestPriority  = 999;

    for (const [id, info] of this.survivorInfo) {
      if (id === this.socket.id) continue;
      if (info.expelled || info.escaped) continue;
      if (info.hp >= 2 && !info.downed) continue;

      const pos = this.players.getPosition(id);
      if (!pos) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pos.x, pos.y);
      if (dist > INTERACT_RADIUS) continue;

      const priority = info.downed ? 1 : 2;
      if (priority < bestPriority || (priority === bestPriority && dist < bestDist)) {
        bestId       = id;
        bestDist     = dist;
        bestPriority = priority;
      }
    }
    return bestId;
  }

  private _updateBloodMarks(delta: number, intendedToMove: boolean) {
    const SMALL_POOL_THRESHOLD_MS = 300;
    const BIG_POOL_THRESHOLD_MS = 10000;

    const emitDrop = (x: number, y: number, frame: number) => {
      this.socket.emit('bloodMark', { x, y, frame });
      if (BLOOD_SELF_VISIBLE) this.bloodPools.spawn(x, y, frame);
    };

    const emitBigPool = (x: number, y: number) => {
      this.socket.emit('bloodBigPool', { x, y });
      if (BLOOD_SELF_VISIBLE) this.bloodPools.spawnBigPool(x, y);
    };

    if (intendedToMove) {
      this.bloodStationaryTimer  = 0;
      this.bloodBigPoolSpawned   = false;
      this.bloodDropTimer       += delta;
      if (this.bloodDropTimer >= BloodPoolManager.DROP_INTERVAL_MS) {
        this.bloodDropTimer = 0;
        const frame = BloodPoolManager.dropFrameFor(this.facingDirection);
        const jx = Phaser.Math.Between(-3, 3);
        const jy = Phaser.Math.Between(-3, 3);
        emitDrop(this.player.x + jx, this.player.y + jy, frame);
      }
    } else {
      this.bloodDropTimer = 0;
      const prev = this.bloodStationaryTimer;
      this.bloodStationaryTimer += delta;
      const curr = this.bloodStationaryTimer;

      // Spawn small pool once when first stopping
      if (prev < SMALL_POOL_THRESHOLD_MS && curr >= SMALL_POOL_THRESHOLD_MS) {
        emitDrop(this.player.x, this.player.y, BloodPoolManager.smallPoolFrame());
      }

      // Spawn big pool once after threshold
      if (!this.bloodBigPoolSpawned && curr >= BIG_POOL_THRESHOLD_MS) {
        this.bloodBigPoolSpawned = true;
        emitBigPool(this.player.x, this.player.y);
      }
    }
  }

  private _updateSurvivorInteractions(delta: number) {
    const eHeld    = this.eKey.isDown || this.padActionHeld;

    // ── Heal path ────────────────────────────────────────────────────────────
    const healTarget = eHeld && !this.downed ? this.nearestHealablePlayer() : null;

    if (healTarget) {
      if (healTarget !== this.healingTarget) {
        if (this.prevHealingEmitted !== null) {
          this.socket.emit('setHealing', { targetId: null });
        }
        this.healingTarget      = healTarget;
        this.prevHealingEmitted = healTarget;
        this.healPassiveTimer   = 0;
        this.healHoldTimer      = 0;
        this.socket.emit('setHealing', { targetId: healTarget });

        if (this.hackingTerminal !== null) {
          this.hackingTerminal    = null;
          this.prevHackingEmitted = null;
          this.hackPassiveTimer   = 0;
          this.terminals.setWorking(null);
          this.hud.setHackProgress(null);
          this.socket.emit('setHacking', { terminalId: null });
        }
      }

      if (this.time.now >= this.healLockUntil) {
        this.healPassiveTimer += delta;
        if (this.healPassiveTimer >= HEAL_PASSIVE_RATE_MS) {
          this.healPassiveTimer = 0;
          this.socket.emit('healProgress', { targetId: healTarget, amount: HEAL_PASSIVE_TICK });
        }

        this.healHoldTimer += delta;
        if (this.healHoldTimer >= this.healNextThreshold) {
          this.healHoldTimer     = 0;
          this.healNextThreshold = Phaser.Math.Between(2500, 5000);
          this.runHealSkillCheck(healTarget, false);
        }
      }

      this.hud.setHealProgress(this.survivorInfo.get(healTarget)?.healPct ?? 0);
      return;
    }

    if (this.prevHealingEmitted !== null) {
      this.prevHealingEmitted = null;
      this.healingTarget      = null;
      this.healPassiveTimer   = 0;
      this.healHoldTimer      = 0;
      this.socket.emit('setHealing', { targetId: null });
      this.hud.setHealProgress(null);
    }

    // ── Hack path ─────────────────────────────────────────────────────────────
    const nearTerminal = this.terminals.nearest(this.player.x, this.player.y);

    if (nearTerminal !== this.hackTimerTerminal) {
      this.hackTimerTerminal = nearTerminal;
      this.hackHoldTimer     = 0;
    }

    if (eHeld && nearTerminal && !this.downed && !this.beingHealed) {
      this.hackingTerminal = nearTerminal;
      if (this.prevHackingEmitted !== nearTerminal) {
        this.prevHackingEmitted = nearTerminal;
        this.socket.emit('setHacking', { terminalId: nearTerminal });
      }
      this.terminals.setWorking(nearTerminal);
      this.hud.setHackProgress(this.terminals.getProgress(nearTerminal));

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

    if (this.prevHackingEmitted !== null) {
      this.prevHackingEmitted = null;
      this.socket.emit('setHacking', { terminalId: null });
    }
    this.hackingTerminal  = null;
    this.hackPassiveTimer = 0;
    this.terminals.setWorking(null);
    this.hud.setHackProgress(null);

    // ── Gate ─────────────────────────────────────────────────────────────────
    let nearAnyGate = false;
    for (const id of ['g1', 'g2'] as GateId[]) {
      if (!this.gates.isPowered(id) || this.gates.isOpen(id)) continue;
      if (!this.gates.isNearSwitch(id, this.player.x, this.player.y)) continue;
      nearAnyGate = true;

      if (this.openingGate !== id) {
        this.openingGate   = id;
        this.gateOpenTimer = 0;
      }

      if (eHeld) {
        this.gateOpenTimer += delta;
        while (this.gateOpenTimer >= GATE_TICK_MS) {
          this.gateOpenTimer -= GATE_TICK_MS;
          this.socket.emit('gateOpenTick', { gateId: id });
        }
      } else {
        this.gateOpenTimer = 0;
      }
      break;
    }

    if (!nearAnyGate && this.openingGate !== null) {
      this.openingGate   = null;
      this.gateOpenTimer = 0;
    }

    const exitGate = this.gates.getOpenGateForExit(this.player.x, this.player.y);
    if (exitGate !== null && !this.escaped) {
      this.socket.emit('escape');
    }
  }

  private _updateTerrorRadius() {
    if (this.myRole !== 'survivor') {
      this.hud.setTerrorLevel(0);
      return;
    }
    const profPos = this.players.getProfessorPosition();
    if (!profPos) {
      this.hud.setTerrorLevel(0);
      return;
    }
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, profPos.x, profPos.y);
    let level: 0 | 1 | 2 | 3 = 0;
    if (dist <= TERROR_RADIUS) {
      const t = dist / TERROR_RADIUS;
      level = t > 2 / 3 ? 1 : t > 1 / 3 ? 2 : 3;
    }
    this.hud.setTerrorLevel(level);
  }

  private _updateProfessorInteractions() {
    const now = this.time.now;

    if ((Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust || this.mouseAttackJust) && !this.isSwinging && !this.isKicking) {
      this.attackHoldStart = now;
    }

    if (this.attackHoldStart !== null && !this.isSwinging && (now - this.attackHoldStart) >= LUNGE_MAX_HOLD_MS) {
      this._fireAttack(true);
    }

    if (this.attackHoldStart !== null && !this.isSwinging) {
      const heldMs = now - this.attackHoldStart;
      if (heldMs >= LUNGE_THRESHOLD_MS && (now - this.lastLungeTick) > 50) {
        this.lastLungeTick = now;
        this.socket.emit('lungeTick', { x: this.player.x, y: this.player.y, angle: this.lookAngle });
      }
    }

    const spaceJustUp = Phaser.Input.Keyboard.JustUp(this.spaceKey);
    if ((spaceJustUp || this.padAttackJustUp || this.mouseAttackJustUp) && this.attackHoldStart !== null && !this.isSwinging) {
      const heldMs = now - this.attackHoldStart;
      this._fireAttack(heldMs >= LUNGE_THRESHOLD_MS);
    }

    if (Phaser.Input.Keyboard.JustDown(this.eKey) || this.padActionJust) {
      const t = this.terminals.nearest(this.player.x, this.player.y);
      if (t) this.playProfessorKick(t);
    }

    const nowCharging = this.attackHoldStart !== null && !this.isSwinging;
    if (nowCharging !== this.wasCharging) {
      this.wasCharging = nowCharging;
      this.socket.emit('professorCharge', { charging: nowCharging });
    }

    this.mouseAttackJust    = false;
    this.mouseAttackJustUp  = false;
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
    this._updateTerrorRadius();

    if (this.onHitSprintTimer > 0) this.onHitSprintTimer = Math.max(0, this.onHitSprintTimer - delta);

    // gamepad — lê estado do pad1 e detecta "just pressed" para este frame
    const pad = (this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin)?.pad1 ?? null;
    this.hud.setGamepadConnected(pad !== null);
    const DEADZONE = PAD_DEADZONE;
    const padActionNow = pad?.buttons[0].pressed ?? false; // A — ação (E)
    const padAttackNow = pad?.buttons[2].pressed ?? false; // X — ataque/skill check (SPACE)
    this.padActionHeld = padActionNow;
    this.padAttackHeld = padAttackNow;
    this.padSprintHeld = pad?.buttons[5].pressed ?? false;
    this.padActionJust = padActionNow && !this.padPrevAction;
    this.padAttackJust   = padAttackNow && !this.padPrevAttack;
    this.padAttackJustUp = !padAttackNow && this.padPrevAttack;
    this.padPrevAction   = padActionNow;
    this.padPrevAttack   = padAttackNow;

    if (Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.toggleCollisionDebug();
    }

    // se o input ta congelado, n processa nada além do skill check e do timer de stun
    if (this.inputFrozen) {
      if (this.skillCheck.active && (Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust)) {
        this.skillCheck.tryHit();
      }
      if (this.skillCheck.active && this.hackingTerminal !== null && !this.eKey.isDown && !this.padActionHeld) {
        this.skillCheck.cancel();
      }
      if (this.staggerTimer > 0) {
        this.staggerTimer -= delta;
        if (this.staggerTimer <= 0) {
          this.staggerTimer = 0;
          if (!this.expelled && !this.escaped) {
            this.inputFrozen     = false;
            this.isHitStagger    = false;
            this.isSwinging      = false;
            this.swingDirection  = null;
            this.attackHoldStart = null;
            if (this.slashSprite) { this.slashSprite.destroy(); this.slashSprite = null; }
            this.isKicking = false;
            if (this.kickSprite) { this.kickSprite.destroy(); this.kickSprite = null; }
            this.player.setVisible(true);
          }
        }
      }
      this.smoothLookAngle(delta);
      this.fog.update(this.player, this.lookAngle);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      if (this.myRole && !this.isHitStagger) {
        if (this.downed && this.myRole === 'survivor') {
          const skin = getSkinForRole('survivor');
          const hurtFallKey = `${skin.id}:hurt-fall`;
          const hurtFallPlaying = this.player.anims.currentAnim?.key === hurtFallKey && this.player.anims.isPlaying;
          if (!hurtFallPlaying) {
            applyDownedFrame(this.player, 'survivor', this.facingDirection);
          }
        } else {
          playRoleAnimation(this.player, this.myRole, 'idle', this.facingDirection);
        }
      }
      if (this.myRole === 'professor') {
        const cam = this.cameras.main;
        this.hud.updateTerminalArrows(
          this.terminals.getPositions(),
          this.terminals.getCompleted(),
          cam.scrollX,
          cam.scrollY,
          cam.width,
          cam.height,
        );
      }
      this.mouseAttackJust    = false;
      this.mouseAttackJustUp  = false;
      this.players.update(this.time.now);
      return;
    }


    if (this.myRole === 'survivor') {
      this.sprinting = this.shiftKey.isDown || this.padSprintHeld;
    }

    //  Movimento
    let speed: number;
    if (this.myRole === 'professor') {
      speed = PROFESSOR_SPEED + BLOODLUST_SPEED_BONUS_PX_S[this.bloodlustTier];
      if (this.attackHoldStart !== null && !this.isSwinging) speed *= 1.5;
    } else {
      if (this.downed) {
        speed = PLAYER_SPEED * CRAWL_SPEED_FACTOR;
      } else if (this.onHitSprintTimer > 0) {
        speed = ON_HIT_SPRINT_SPEED;
      } else {
        speed = this.sprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
      }
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

    const intendedToMove = vx !== 0 || vy !== 0;

    const slideBody = this.player.body as Phaser.Physics.Arcade.Body;
    const slidX = (slideBody.blocked.left && vx < 0) || (slideBody.blocked.right && vx > 0);
    const slidY = (slideBody.blocked.up   && vy < 0) || (slideBody.blocked.down  && vy > 0);
    if (slidX) vx = 0;
    if (slidY) vy = 0;
    if      (slidX && !slidY) { this._slidAxis = 'x'; this._slidHysteresis = 4; }
    else if (slidY && !slidX) { this._slidAxis = 'y'; this._slidHysteresis = 4; }
    else if (!slidX && !slidY) {
      if (this._slidHysteresis > 0) this._slidHysteresis--;
      else this._slidAxis = null;
    }

    // normaliza a velocidade pra n ficar mais rapido na diagonal; escala pela magnitude do analogico
    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed * analogScale;
      vy = (vy / len) * speed * analogScale;
      this.targetLookAngle = Math.atan2(vy, vx);
      if      (this._slidAxis === 'y' && vx !== 0) this.facingDirection = vx > 0 ? 'right' : 'left';
      else if (this._slidAxis === 'x' && vy !== 0) this.facingDirection = vy > 0 ? 'down' : 'up';
      else if (Math.abs(vx) > Math.abs(vy))        this.facingDirection = vx > 0 ? 'right' : 'left';
      else                                          this.facingDirection = vy > 0 ? 'down' : 'up';
    }

    // mouse look — professor sem gamepad
    if (this.myRole === 'professor' && pad === null) {
      const pointer = this.input.activePointer;
      this.targetLookAngle = Math.atan2(
        pointer.worldY - this.player.y,
        pointer.worldX - this.player.x,
      );
      const dx = pointer.worldX - this.player.x;
      const dy = pointer.worldY - this.player.y;
      if (Math.abs(dx) >= Math.abs(dy)) this.facingDirection = dx > 0 ? 'right' : 'left';
      else this.facingDirection = dy > 0 ? 'down' : 'up';
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

    if (this.isSwinging) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.slashSprite?.setPosition(this.player.x, this.player.y);
    }

    if (this.isKicking) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.kickSprite?.setPosition(this.player.x, this.player.y);
    }

    if (this.myRole) {
      if (this.downed && this.myRole === 'survivor') {
        const skin = getSkinForRole('survivor');
        const hurtFallKey = `${skin.id}:hurt-fall`;
        const hurtFallPlaying = this.player.anims.currentAnim?.key === hurtFallKey && this.player.anims.isPlaying;
        if (!hurtFallPlaying) {
          applyDownedFrame(this.player, 'survivor', this.facingDirection);
        }
      } else {
        const inCombatStance = this.myRole === 'professor' && this.attackHoldStart !== null && !this.isSwinging;
        if (inCombatStance) {
          if (!playCombatAnimation(this.player, this.myRole, this.facingDirection)) {
            playRoleAnimation(this.player, this.myRole, intendedToMove ? 'walk' : 'idle', this.facingDirection);
          }
        } else if (intendedToMove) {
          const moveAnim = (this.myRole === 'survivor' && (this.sprinting || this.onHitSprintTimer > 0)) ? 'run' : 'walk';
          playRoleAnimation(this.player, this.myRole, moveAnim, this.facingDirection);
        } else {
          playRoleAnimation(this.player, this.myRole, 'idle', this.facingDirection);
        }
      }
    }

    // emite o movimento p server
    this.lastMoveEmit += delta;
    if ((vx !== 0 || vy !== 0) && this.lastMoveEmit > MOVE_EMIT_RATE_MS) {
      this.lastMoveEmit = 0;
      this.socket.emit('move', { x: this.player.x, y: this.player.y, angle: this.lookAngle, sprinting: this.sprinting, dir: this.facingDirection });
    }

    // scratch marks
    if (this.myRole === 'survivor' && this.sprinting && intendedToMove) {
      this.scratchMarkTimer += delta;
      if (this.scratchMarkTimer >= ScratchMarkManager.SPAWN_INTERVAL_MS) {
        this.scratchMarkTimer = 0;
        this.socket.emit('scratchMark', { x: this.player.x, y: this.player.y, direction: this.facingDirection });
        if (SCRATCH_MARKS_SELF_VISIBLE) this.scratchMarks.spawn(this.player.x, this.player.y, this.facingDirection);
      }
    } else if (this.myRole === 'survivor') {
      this.scratchMarkTimer = 0;
    }
    this.scratchMarks.update(delta);

    // blood pools — only when injured (hp === 1) and not downed
    if (this.myRole === 'survivor' && this.myHp === 1 && !this.downed) {
      this._updateBloodMarks(delta, intendedToMove);
    } else if (this.myRole === 'survivor') {
      this.bloodDropTimer = 0;
      this.bloodStationaryTimer = 0;
      this.bloodBigPoolSpawned = false;
    }
    this.bloodPools.update(delta);

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

    if (this.myRole === 'survivor' && this.downed && !this.beingHealed) {
      const moving = vx !== 0 || vy !== 0;
      if (moving) {
        this.healPassiveTimer = 0;
        this.healHoldTimer    = 0;
      } else if (this.myHealPct < HEAL_SELF_CAP && this.time.now >= this.healLockUntil) {
        this.healPassiveTimer += delta;
        if (this.healPassiveTimer >= HEAL_PASSIVE_RATE_MS) {
          this.healPassiveTimer = 0;
          this.socket.emit('healProgress', {
            targetId: this.socket.id,
            amount:   HEAL_PASSIVE_TICK * HEAL_SELF_RATE_FACTOR,
          });
        }
        this.healHoldTimer += delta;
        if (this.healHoldTimer >= this.healNextThreshold) {
          this.healHoldTimer     = 0;
          this.healNextThreshold = Phaser.Math.Between(2500, 5000);
          this.runHealSkillCheck(this.socket.id!, true);
        }
      }
    }

    if (this.myRole === 'survivor' && this.downed) {
      this.myDownBleedMs = Math.min(this.myDownBleedMs + delta, BLEED_OUT_MS);
      this.hud.setBleedOutProgress((this.myDownBleedMs / BLEED_OUT_MS) * 100);
    }

    if (this.myRole === 'survivor')  this._updateSurvivorInteractions(delta);
    else if (this.myRole === 'professor') {
      this._updateProfessorInteractions();
      this.hud.setAttackCooldown(this.staggerTimer);
    }

    if (this.endgameReceivedAt !== null) {
      const elapsed    = this.time.now - this.endgameReceivedAt;
      const remaining  = Math.max(0, ENDGAME_DURATION_MS - elapsed);
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

    if (this.myRole === 'professor') {
      const cam = this.cameras.main;
      this.hud.updateTerminalArrows(
        this.terminals.getPositions(),
        this.terminals.getCompleted(),
        cam.scrollX,
        cam.scrollY,
        cam.width,
        cam.height,
      );
    }
  }
}
