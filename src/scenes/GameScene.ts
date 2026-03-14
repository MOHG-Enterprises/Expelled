import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import {
  PLAYER_SPEED, PLAYER_SPRINT_SPEED, PROFESSOR_SPEED,
  INTERACT_RADIUS, HACK_TICK, MOVE_EMIT_RATE_MS,
  COLOR_SELF_SURVIVOR, COLOR_SELF_PROF,
  STAMINA_MAX, STAMINA_DRAIN, STAMINA_REGEN, STAMINA_MIN_SPRINT,
  WORLD_WIDTH, WORLD_HEIGHT,
} from '../constants';
import type { Role, GamePhase, GameState, TerminalId } from '../types';
import { SkillCheck }      from '../game/SkillCheck';
import { FogOfWar }        from '../game/FogOfWar';
import { HUD }             from '../game/HUD';
import { TerminalManager } from '../game/TerminalManager';
import { PlayerManager }   from '../game/PlayerManager';
import { StaminaBar }      from '../game/StaminaBar';

export class GameScene extends Phaser.Scene {
  //  State 
  private socket!: Socket;
  private player!: Phaser.GameObjects.Rectangle;

  private myRole:         Role | null = null;
  private myHp           = 2;
  private downed         = false;
  private expelled       = false;
  private escaped        = false;
  private inputFrozen    = false;
  private staggerTimer   = 0;
  private gateOpen       = false;
  private hackingTerminal: TerminalId | null = null;
  private hackHoldTimer  = 0;
  private lastMoveEmit   = 0;
  private lookAngle      = 0;
  private targetLookAngle = 0;
  private gamePhase: GamePhase = 'lobby';

  // stamina pros surv
  private stamina         = STAMINA_MAX;
  private sprinting       = false;

  //  outras classes do jogo
  private skillCheck!:  SkillCheck;
  private fog!:         FogOfWar;
  private hud!:         HUD;
  private terminals!:   TerminalManager;
  private players!:     PlayerManager;
  private staminaBar!:  StaminaBar;

  //  inputs 
  private cursors!:    Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!:       Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey!:   Phaser.Input.Keyboard.Key;
  private eKey!:       Phaser.Input.Keyboard.Key;
  private shiftKey!:   Phaser.Input.Keyboard.Key;

  constructor() { super('GameScene'); }

  //so pra limpar os role que permanece quando volta pro lobby ou daf5
  private resetLocalState() {
    this.myRole = null;
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
    this.gamePhase = 'playing';
    this.stamina = STAMINA_MAX;
    this.sprinting = false;
  }

  create(data?: { socket?: Socket }) {
    //reusa socket q vem do lobby
    this.socket = data?.socket ?? io();
    this.resetLocalState();

    // bounds do mundo
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.player = this.add.rectangle(400, 300, 16, 16, COLOR_SELF_SURVIVOR).setDepth(5);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

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

    this.hud.build();
    this.staminaBar.build();
    // limpa os listener (tava duplicando nao sei se tem outro jieto melhor)
    this.socket.removeAllListeners();
    this.setupSocketEvents();
    this.socket.emit('requestSync');
  }

  private setupSocketEvents() {
    const s = this.socket;

    s.on('roleAssigned', (role: Role) => {
      this.myRole = role;
      this.player.setFillStyle(role === 'professor' ? COLOR_SELF_PROF : COLOR_SELF_SURVIVOR);
      // teppa pro spawn
      // TODO: os aluno tem q spawnar randomizado/separado e tambem fora da visao do prof
    
      const spawnX = role === 'professor' ? 400 : 100;
      const spawnY = role === 'professor' ? 300 : 100;
      this.player.setPosition(spawnX, spawnY);
      //setta outros estados
      (this.player.body as Phaser.Physics.Arcade.Body).reset(spawnX, spawnY);
      this.fog.setup(role);
      this.hud.update(role, this.myHp, this.gamePhase, false);
      this.staminaBar.setVisible(role === 'survivor');
    });

    // recebe o estado completo do jogo (usado no sync inicial e qnd alguem entra)
    s.on('gameState', (state: GameState) => {
      this.terminals.sync(state.terminals, state.terminalPositions);
      Object.entries(state.players).forEach(([id, p]) => {
        if (id !== s.id) this.players.getOrCreate(id, p);
      });
    });

    //mujdanca de cena
    s.on('gamePhase', (phase: GamePhase) => {
      this.gamePhase = phase;
      this.hud.update(this.myRole, this.myHp, phase, this.downed);
    });

    // outros players se movendo
    s.on('playerMoved', (data: { id: string; x: number; y: number }) => {
      this.players.move(data.id, data.x, data.y);
    });

    // player kita
    s.on('playerLeft', (id: string) => {
      this.players.remove(id);
    });
  
    // atualizacao de terminal
    s.on('terminalUpdate', ({ id, progress }: { id: string; progress: number }) => {
      this.terminals.setProgress(id, progress);
    });

    // terminal hackeado
    s.on('terminalHacked', (id: string) => {
      this.terminals.setProgress(id, 100);
      this.hud.flash('Terminal hackeado!', 0x00e676);
    });

    // firewall ativada(aluno errou skillcheck)
    // TODO: talvez seja interessante mandar o id do terminal pra mostrar um alerta visual nele, tipo piscar ou algo assim
    s.on('firewallAlert', ({ terminalId }: { terminalId: string }) => {
      if (this.myRole === 'professor') {
        this.hud.flash(`Firewall: ${terminalId}`, 0xffcc00);
        this.terminals.flashAlert(terminalId, this.tweens);
      }
    });

    // portao desbloqueado
    s.on('gateUnlocked', () => {
      this.gateOpen = true;
      this.terminals.unlockGate();
      this.hud.flash('Portão aberto, fuja!', 0x00e676);
    });

    // player atacado

    s.on('playerHit', ({ targetId, hp }: { targetId: string; hp: number }) => {
      if (targetId === s.id) {
        this.myHp = hp;
        this.hud.update(this.myRole, this.myHp, this.gamePhase, this.downed);
        this.hud.flash('Você foi atingido!', 0xff4444);
      }
    });

    // player detido 
    // TODO: queria q as skill check aqui fossem mais dificeis, nao era pra ta colocando aqui mas lembrei agora
    s.on('playerDowned', (targetId: string) => {
      if (targetId === s.id) {
        this.downed = true;
        this.myHp   = 0;
        this.hud.update(this.myRole, this.myHp, this.gamePhase, true);
        this.hud.flash('Em DETENÇÃO! Passe no exame!', 0xff4444);
        this.startDetention();
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno detido!', 0xffcc00);
      }
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
      this.hud.update(this.myRole, this.myHp, this.gamePhase, false);
      this.hud.flash('Você escapou da detenção!', 0x4fc3f7);
    });

    //progresso do revive
    s.on('detentionProgress', ({ current, required }: { current: number; required: number }) => {
      if (!this.downed) return;
      this.hud.flash(`Detenção: ${current}/${required}`, 0xffcc00, 1200);
      this.startDetention();
    });

    //morto
    s.on('expelled', () => {
      this.expelled    = true;
      this.inputFrozen = true;
      this.hud.update(this.myRole, this.myHp, this.gamePhase, false);
      this.hud.flash('EXPULSO!', 0xff4444, 4000);
    });

    // alerta pra qnd revive aluno
    s.on('playerRevived', (id: string) => {
      if (this.myRole === 'professor' && id !== s.id)
        this.hud.flash('Aluno escapou da detenção!', 0x4fc3f7);
    });

    //alerta pra qnd aluno morre
    s.on('playerExpelled', (id: string) => {
      this.players.setAlpha(id, 0.25);
      if (this.myRole === 'professor' && id !== s.id)
        this.hud.flash('Aluno expulso!', 0x00e676);
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
    });

    s.on('gameOver', ({ winner }: { winner: string }) => {
      this.inputFrozen = true;
      const msg = winner === 'survivors' ? 'ALUNOS VENCERAM!' : 'PROFESSOR VENCEU!';
      const col = winner === 'survivors' ? 0x4fc3f7 : 0xe94560;
      this.hud.flash(msg, col, 8000);
    });

    s.on('gameReset', () => { this.scene.restart(); });
  }

  //detencao
  private startDetention() {
    this.inputFrozen = true;
    this.skillCheck.show(
      () => { this.socket.emit('detentionAnswer', { correct: true }); },
      () => { this.socket.emit('detentionAnswer', { correct: false }); },
    );
  }

  //hack de terminal
  private runHackSkillCheck(terminalId: TerminalId) {
    this.inputFrozen = true;
    this.skillCheck.show(
      () => { this.inputFrozen = false; this.socket.emit('hackProgress',    { terminalId, amount: HACK_TICK }); },
      () => { this.inputFrozen = false; this.socket.emit('skillCheckFailed', { terminalId }); },
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

    if (this.eKey.isDown && nearTerminal && !this.downed) {
      this.hackingTerminal  = nearTerminal;
      this.hackHoldTimer   += delta;
      if (this.hackHoldTimer >= 1000) {
        this.hackHoldTimer = 0;
        this.runHackSkillCheck(nearTerminal);
      }
      return;
    } else {
      this.hackingTerminal = null;
      this.hackHoldTimer   = 0;
    }

    if (Phaser.Input.Keyboard.JustDown(this.eKey) && this.gateOpen && this.isNearGate()) {
      this.socket.emit('escape');
    }
  }

  private _updateProfessorInteractions() {
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      const target = this.players.nearestSurvivor(this.player.x, this.player.y);
      if (target) this.socket.emit('attack', { targetId: target });
    }
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
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

    // se o input ta congelado, n processa nada além do skill check e do timer de stun
    if (this.inputFrozen) {
      if (this.skillCheck.active && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
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
      return;
    }

    // stamina e corrida (só pros alunos)
    if (this.myRole === 'survivor') {
      this.sprinting = this.shiftKey.isDown && this.stamina > STAMINA_MIN_SPRINT;
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

    // suporta tanto setas quanto wasd
    if (this.cursors.left.isDown  || this.wasd['A'].isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd['D'].isDown) vx = 1;
    if (this.cursors.up.isDown    || this.wasd['W'].isDown) vy = -1;
    else if (this.cursors.down.isDown  || this.wasd['S'].isDown) vy = 1;

    // normaliza a velocidade pra n ficar mais rapido na diagonal
    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
      this.targetLookAngle = Math.atan2(vy, vx);
    }
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);

    // emite o movimento p server
    this.lastMoveEmit += delta;
    if ((vx !== 0 || vy !== 0) && this.lastMoveEmit > MOVE_EMIT_RATE_MS) {
      this.lastMoveEmit = 0;
      this.socket.emit('move', { x: this.player.x, y: this.player.y });
    }

    this.smoothLookAngle(delta);
    this.fog.update(this.player, this.lookAngle);

    if (this.myRole === 'survivor')  this._updateSurvivorInteractions(delta);
    else if (this.myRole === 'professor') this._updateProfessorInteractions();
  }
}
