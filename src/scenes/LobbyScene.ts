import Phaser from 'phaser';
import { io } from '../socketClient';
import type { Socket } from '../socketClient';
import { ROOM_NAMES, MAX_PLAYERS_PER_ROOM, MIN_SURVIVORS_TO_START } from '../constants';

type LobbyRole = 'professor' | 'survivor';

interface LobbyPlayer {
  role: LobbyRole;
  ready?: boolean;
}

interface LobbyState {
  players: Record<string, LobbyPlayer>;
}

type RoomSummary = Record<string, { playerCount: number; phase: string }>;

const SURVIVOR_SKINS = [
  { skinId: 'arthur',  iconKey: 'arthur-icon',  iconPath: './personagens/survivors/arthur/icons/Arthur_Icon.png',   label: 'Arthur'  },
  { skinId: 'gustavo', iconKey: 'gustavo-icon', iconPath: './personagens/survivors/gustavo/icons/Gustavo_Icon.png', label: 'Gustavo' },
  { skinId: 'giu',     iconKey: 'giu-icon',     iconPath: './personagens/survivors/giu/icons/Giu_Icon.png',         label: 'Giu'     },
  { skinId: 'isabela', iconKey: 'isabela-icon', iconPath: './personagens/survivors/isabela/icons/Isabela_Icon.png', label: 'Isabela' },
  { skinId: 'davi',    iconKey: 'davi-icon',    iconPath: './personagens/survivors/davi/icons/Davi_Icon.png',       label: 'Davi'    },
  { skinId: 'caio',    iconKey: 'caio-icon',    iconPath: './personagens/survivors/caio/icons/Caio_Icon.png',       label: 'Caio'    },
] as const;

const KILLER_SKINS: Array<{ skinId: string; iconKey: string | null; iconPath: string | null; label: string }> = [
  { skinId: 'boi',      iconKey: 'boi-icon',      iconPath: './personagens/killers/professor/icon/Boi_Icon.png',      label: 'Boi'      },
  { skinId: 'clayrton', iconKey: 'clayrton-icon', iconPath: './personagens/killers/clayrton/icon/Clayrton_Icon.png',  label: 'Clayrton' },
  { skinId: 'fernanda', iconKey: 'fernanda-icon', iconPath: './personagens/killers/fernanda/icon/Fernanda_Icon.png',  label: 'Fernanda' },
];

export class LobbyScene extends Phaser.Scene {
  private socket!: Socket;
  private countText!:  Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private actionText!: Phaser.GameObjects.Text;

  private playerCount   = 0;
  private myRole: LobbyRole | null = null;
  private isReady       = false;
  private readySurvivors  = 0;
  private totalSurvivors  = 0;
  private currentRoom: string | null = null;

  private chosenSkinId  = 'arthur';
  private pickerSkinId  = 'arthur';
  private pickerName    = '';
  private pickerUI:     Phaser.GameObjects.GameObject[] = [];
  private nameDisplay!: Phaser.GameObjects.Text;
  private characterBtns: { skinId: string; btn: Phaser.GameObjects.Image }[] = [];
  private killerPickerUI:      Phaser.GameObjects.GameObject[] = [];
  private killerCharacterBtns: { skinId: string; btn: Phaser.GameObjects.Image }[] = [];
  private chosenKillerSkinId   = 'boi';
  private pickerKillerSkinId   = 'boi';
  private kbListener:   ((e: KeyboardEvent) => void) | null = null;
  private cursorTimer?: Phaser.Time.TimerEvent;
  private cursorOn     = false;
  private backToPickerBtn!: Phaser.GameObjects.Text;

  private roomButtons: Phaser.GameObjects.Text[] = [];
  private roomPhases: Record<string, string> = {};
  private roomCountTexts: Phaser.GameObjects.Text[] = [];
  private roomSelectionUI: Phaser.GameObjects.GameObject[] = [];
  private inRoomBgUI: Phaser.GameObjects.GameObject[] = [];
  private inRoomUI: Phaser.GameObjects.GameObject[] = [];
  private errorText!: Phaser.GameObjects.Text;

  // gamepad nav
  private padUiMode: 'rooms' | 'picker' | 'killerPicker' | 'inRoom' = 'rooms';
  private selectedRoomIdx = 0;
  private padPrevDown  = false;
  private padPrevUp    = false;
  private padPrevLeft  = false;
  private padPrevRight = false;
  private padPrevA     = false;
  private padPrevB     = false;
  private padPrevStart = false;

  private nameInputEl: HTMLInputElement | null = null;

  private pickerPadHint!: Phaser.GameObjects.Text;
  private killerPadHint!: Phaser.GameObjects.Text;
  private inRoomPadHint!: Phaser.GameObjects.Text;

  constructor() { super('LobbyScene'); }

  init() {
    if (this.kbListener) {
      window.removeEventListener('keydown', this.kbListener);
      this.kbListener = null;
    }
    this.cursorTimer?.remove(false);
    this.cursorTimer    = undefined;
    this.cursorOn       = false;
    this.playerCount    = 0;
    this.myRole         = null;
    this.isReady        = false;
    this.readySurvivors = 0;
    this.totalSurvivors = 0;
    this.currentRoom    = null;
    this.chosenSkinId   = 'arthur';
    this.pickerSkinId   = 'arthur';
    this.pickerName     = '';
    this.pickerUI       = [];
    this.characterBtns  = [];
    this.roomButtons      = [];
    this.roomCountTexts   = [];
    this.roomSelectionUI  = [];
    this.inRoomBgUI       = [];
    this.inRoomUI         = [];
    this.killerPickerUI      = [];
    this.killerCharacterBtns = [];
    this.chosenKillerSkinId  = 'boi';
    this.pickerKillerSkinId  = 'boi';
    this.roomButtons    = [];
    this.roomCountTexts = [];
    this.inRoomUI       = [];
    this.padUiMode      = 'rooms';
    this.selectedRoomIdx  = 0;
    this.padPrevDown    = false;
    this.padPrevUp      = false;
    this.padPrevLeft    = false;
    this.padPrevRight   = false;
    this.padPrevA       = false;
    this.padPrevB       = false;
    this.padPrevStart   = false;
    this.closeNameInput();
  }

  preload() {
    SURVIVOR_SKINS.forEach(({ iconKey, iconPath }) => {
      if (!this.textures.exists(iconKey)) {
        this.load.image(iconKey, iconPath);
      }
    });
    KILLER_SKINS.forEach(({ iconKey, iconPath }) => {
      if (iconKey && iconPath && !this.textures.exists(iconKey)) {
        this.load.image(iconKey, iconPath);
      }
    });
    if (!this.textures.exists('characterScreen')) {
      this.load.spritesheet('characterScreen', 'screen/characterScreen.png', { frameWidth: 1150, frameHeight: 640 });
    }
    if (!this.textures.exists('botaoCharacter')) {
      this.load.spritesheet('botaoCharacter', 'screen/botaoCharacter.png', { frameWidth: 74, frameHeight: 77 });
    }
    this.load.audio('buttonClick', './audio/buttonClick.wav');
  }

  private _click() { this.sound.play('buttonClick', { volume: 0.5 }); }

  create() {
    this.socket = io({ path: '/expelled/socket.io' });

    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.cameras.main.centerOn(400, 300);

    this.buildRoomButtons();
    this.buildInRoomUI();
    this.buildPickerUI();
    this.buildKillerPickerUI();
    this.showRoomSelection();

    this.socket.on('roomList', (summary: RoomSummary) => {
      this.updateRoomButtons(summary);
    });

    this.socket.on('roleAssigned', (role: LobbyRole) => {
      this.myRole = role;
      if (this.currentRoom) {
        if (role === 'survivor') {
          this.showPickerUI();
        } else {
          this.showKillerPickerUI();
        }
      }
      this.refreshActionLabel();
    });

    this.socket.on('gameState', (state: LobbyState) => {
      this.playerCount = Object.keys(state.players).length;
      const players   = Object.values(state.players);
      const survivors = players.filter((p) => p.role === 'survivor');
      this.totalSurvivors = survivors.length;
      this.readySurvivors = survivors.filter((p) => p.ready).length;
      const me = this.socket.id ? state.players[this.socket.id] : undefined;
      if (me?.role === 'survivor') this.isReady = !!me.ready;
      this.countText.setText(`Jogadores na sala: ${this.playerCount} / ${MAX_PLAYERS_PER_ROOM}`);
      this.statusText.setText(`Alunos prontos: ${this.readySurvivors}/${this.totalSurvivors}`);
      this.refreshActionLabel();
    });

    this.socket.on('gamePhase', (phase: string) => {
      if (phase === 'playing') {
        this.stopKeyboardInput();
        const skinId = this.myRole === 'professor' ? this.chosenKillerSkinId : this.chosenSkinId;
        this.scene.start('GameScene', { socket: this.socket, roomName: this.currentRoom, skinId });
      }
    });

    this.socket.on('joinRejected', ({ reason }: { reason: string }) => {
      this.currentRoom = null;
      this.showRoomSelection();
      this.showJoinError(reason === 'inProgress' ? 'Sala em andamento! Escolha outra.' : 'Sala cheia! Escolha outra.');
    });

    this.updateRoomSelection();

    const gpPlugin = this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin;
    gpPlugin?.on('connected',    () => this.syncPadHints());
    gpPlugin?.on('disconnected', () => this.syncPadHints());

    const onResize = () => this.cameras.main.centerOn(400, 300);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  update() {
    const pad = (this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin)?.pad1 ?? null;
    if (!pad) return;

    const DEAD = 0.5;
    const axisX    = pad.axes[0]?.getValue() ?? 0;
    const axisY    = pad.axes[1]?.getValue() ?? 0;
    const downNow  = pad.buttons[13]?.pressed || axisY > DEAD;
    const upNow    = pad.buttons[12]?.pressed || axisY < -DEAD;
    const leftNow  = pad.buttons[14]?.pressed || axisX < -DEAD;
    const rightNow = pad.buttons[15]?.pressed || axisX > DEAD;
    const aNow     = pad.buttons[0]?.pressed ?? false;
    const bNow     = pad.buttons[1]?.pressed ?? false;
    const startNow = pad.buttons[9]?.pressed ?? false;

    const downJust  = downNow && !this.padPrevDown;
    const upJust    = upNow && !this.padPrevUp;
    const leftJust  = leftNow && !this.padPrevLeft;
    const rightJust = rightNow && !this.padPrevRight;
    const aJust     = aNow && !this.padPrevA;
    const bJust     = bNow && !this.padPrevB;
    const startJust = startNow && !this.padPrevStart;

    this.padPrevDown  = downNow;
    this.padPrevUp    = upNow;
    this.padPrevLeft  = leftNow;
    this.padPrevRight = rightNow;
    this.padPrevA     = aNow;
    this.padPrevB     = bNow;
    this.padPrevStart = startNow;

    if (this.padUiMode === 'rooms') {
      if (downJust) {
        this.selectedRoomIdx = (this.selectedRoomIdx + 1) % ROOM_NAMES.length;
        this.updateRoomSelection();
      }
      if (upJust) {
        this.selectedRoomIdx = (this.selectedRoomIdx - 1 + ROOM_NAMES.length) % ROOM_NAMES.length;
        this.updateRoomSelection();
      }
      if (aJust) this.joinRoom(this.selectedRoomIdx);
      return;
    }

    if (this.padUiMode === 'picker') {
      const ids: string[] = SURVIVOR_SKINS.map((s) => s.skinId);
      const cur = Math.max(0, ids.indexOf(this.pickerSkinId));
      if (rightJust) this.selectSkin(ids[(cur + 1) % ids.length]);
      if (leftJust)  this.selectSkin(ids[(cur - 1 + ids.length) % ids.length]);
      if (aJust || startJust) this.confirmCharacter();
      return;
    }

    if (this.padUiMode === 'killerPicker') {
      const ids = KILLER_SKINS.map((s) => s.skinId);
      const cur = Math.max(0, ids.indexOf(this.pickerKillerSkinId));
      if (rightJust) this.selectKillerSkin(ids[(cur + 1) % ids.length]);
      if (leftJust)  this.selectKillerSkin(ids[(cur - 1 + ids.length) % ids.length]);
      if (aJust || startJust) this.confirmKillerCharacter();
      return;
    }

    if (aJust || startJust) this.triggerAction();
    if (bJust && (this.myRole === 'survivor' || this.myRole === 'professor')) this.goBackToPicker();
  }

  private hasGamepad(): boolean {
    return ((this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin)?.total ?? 0) > 0;
  }

  private syncPadHints() {
    const has = this.hasGamepad();
    this.pickerPadHint.setVisible(has && this.padUiMode === 'picker');
    this.killerPadHint.setVisible(has && this.padUiMode === 'killerPicker');
    this.inRoomPadHint.setVisible(has && this.padUiMode === 'inRoom');
  }

  private goBackToPicker() {
    this.inRoomBgUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.backToPickerBtn.setVisible(false);
    if (this.myRole === 'professor') {
      this.showKillerPickerUI();
    } else {
      this.showPickerUI();
    }
  }

  private joinRoom(idx: number) {
    const name = ROOM_NAMES[idx];
    if (!name || this.currentRoom) return;
    if (!this.isRoomJoinable(name)) {
      this.showJoinError('Sala em andamento! Escolha outra.');
      return;
    }
    this.padUiMode   = 'inRoom';
    this.currentRoom = name;
    this.socket.emit('joinRoom', { roomName: name });
    this.roomSelectionUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
  }

  private triggerAction() {
    if (this.myRole === 'survivor') {
      this.isReady = !this.isReady;
      this.socket.emit('setReady', { ready: this.isReady });
    } else if (this.myRole === 'professor' && this.canProfessorStart()) {
      this.socket.emit('startMatch');
    }
  }

  private buildRoomButtons() {
    const W = 800, H = 600, cx = W / 2;

    if (!this.anims.exists('charScreen')) {
      this.anims.create({
        key: 'charScreen',
        frames: this.anims.generateFrameNumbers('characterScreen', { start: 0, end: 15 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    const bg = this.add.sprite(cx, H / 2, 'characterScreen');
    bg.setScale(Math.max(W / 1150, H / 640));
    bg.play('charScreen');

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.35);
    overlay.fillRect(0, 0, W, H);

    const headerBar = this.add.graphics();
    headerBar.fillStyle(0x000000, 0.72);
    headerBar.fillRect(cx - 140, 105, 280, 52);

    const title = this.add.text(cx, 134, 'EXPELLED', {
      fontSize: '48px', color: '#e94560', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.roomSelectionUI.push(bg, overlay, headerBar, title);

    const COLS = [220, 580];
    const ROWS = [215, 305];

    ROOM_NAMES.forEach((name, i) => {
      const x = COLS[i % 2];
      const y = ROWS[Math.floor(i / 2)];

      const btn = this.add.text(x, y, this.roomLabel(name, 0, 'lobby'), {
        fontSize: '16px', color: '#ffffff', backgroundColor: '#1e3a5f',
        padding: { x: 14, y: 10 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => { if (!this.currentRoom && this.isRoomJoinable(name)) btn.setBackgroundColor('#2a5080'); });
      btn.on('pointerout',  () => { if (!this.currentRoom) this.restoreRoomButtonColor(i); });
      btn.on('pointerdown', () => { this._click(); this.joinRoom(i); });

      this.roomButtons.push(btn);
      this.roomCountTexts.push(btn);
      this.roomSelectionUI.push(btn);
    });
  }

  private restoreRoomButtonColor(idx: number) {
    const btn = this.roomButtons[idx];
    if (!btn) return;
    const name = ROOM_NAMES[idx];
    if (name && !this.isRoomJoinable(name)) {
      btn.setBackgroundColor('#3a3a4a').setAlpha(0.55);
      return;
    }
    btn.setAlpha(1);
    btn.setBackgroundColor(idx === this.selectedRoomIdx ? '#2a5080' : '#1e3a5f');
  }

  private updateRoomSelection() {
    this.roomButtons.forEach((_, i) => this.restoreRoomButtonColor(i));
  }

  private buildInRoomUI() {
    const W = 800, H = 600, cx = W / 2;

    const bg = this.add.sprite(cx, H / 2, 'characterScreen');
    bg.setScale(Math.max(W / 1150, H / 640));
    bg.play('charScreen');

    this.inRoomBgUI.push(bg);

    this.countText = this.add.text(400, 150, '', {
      fontSize: '22px', color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 12, y: 6 },
    }).setOrigin(0.5);

    this.statusText = this.add.text(400, 190, '', {
      fontSize: '14px', color: '#cfcfcf', align: 'center',
      backgroundColor: 'rgba(0,0,0,0.52)', padding: { x: 10, y: 4 },
    }).setOrigin(0.5);

    const hint = this.add.text(400, 240, 'Alunos: clique para marcar PRONTO.\nProfessor: inicia quando todos estiverem prontos.', {
      fontSize: '12px', color: '#aaa', align: 'center',
      backgroundColor: 'rgba(0,0,0,0.52)', padding: { x: 10, y: 5 },
    }).setOrigin(0.5);

    this.inRoomPadHint = this.add.text(400, 280, 'Controle: A = pronto / iniciar', {
      fontSize: '11px', color: '#888', align: 'center',
      backgroundColor: 'rgba(0,0,0,0.52)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5);

    this.actionText = this.add.text(400, 340, 'Aguardando role...', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#333333',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const controls = this.add.text(400, 380, 'WASD / Setas — mover  |  E — hackear / fugir  |  SHIFT — correr (alunos)  |  SPACE — atacar (professor)', {
      fontSize: '11px', color: '#aaa', align: 'center',
      backgroundColor: 'rgba(0,0,0,0.52)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5);

    this.actionText.on('pointerdown', () => { this._click(); this.triggerAction(); });

    this.backToPickerBtn = this.add.text(400, 430, '← Trocar personagem', {
      fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false);

    this.backToPickerBtn.on('pointerover', () => this.backToPickerBtn.setColor('#ffffff'));
    this.backToPickerBtn.on('pointerout',  () => this.backToPickerBtn.setColor('#aaaaaa'));
    this.backToPickerBtn.on('pointerdown', () => { this._click(); this.goBackToPicker(); });

    this.inRoomUI = [this.countText, this.statusText, hint, this.inRoomPadHint, this.actionText, controls];
    this.inRoomBgUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));

    this.errorText = this.add.text(400, 560, '', {
      fontSize: '16px', color: '#e94560', align: 'center',
    }).setOrigin(0.5).setVisible(false);
  }

  private buildPickerUI() {
    const W = 800, H = 600, cx = W / 2;

    if (!this.anims.exists('charScreen')) {
      this.anims.create({
        key: 'charScreen',
        frames: this.anims.generateFrameNumbers('characterScreen', { start: 0, end: 15 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    const bg = this.add.sprite(cx, H / 2, 'characterScreen');
    bg.setScale(Math.max(W / 1150, H / 640));
    bg.play('charScreen');

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.35);
    overlay.fillRect(0, 0, W, H);

    const headerBar = this.add.graphics();
    headerBar.fillStyle(0x000000, 0.72);
    headerBar.fillRect(cx - 130, 54, 260, 84);

    const title = this.add.text(cx, 68, 'ESCOLHA SEU PERSONAGEM', {
      fontSize: '15px', color: '#e94560', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    const nameLabelText = this.add.text(cx, 92, 'Seu nome (max 12) — toque na caixa para digitar:', {
      fontSize: '11px', color: '#aaa', fontStyle: 'bold',
    }).setOrigin(0.5);

    const nameBox = this.add.graphics();
    nameBox.fillStyle(0x111122, 0.9);
    nameBox.fillRoundedRect(cx - 95, 103, 190, 28, 4);
    nameBox.lineStyle(1, 0x4285f4, 0.8);
    nameBox.strokeRoundedRect(cx - 95, 103, 190, 28, 4);

    this.nameDisplay = this.add.text(cx, 117, ' ', {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const nameZone = this.add.zone(cx, 117, 190, 28)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    nameZone.on('pointerup', () => {
      if (this.nameDisplay.visible) { this._click(); this.openNameInput(); }
    });

    const COLS = [175, 400, 625];
    const ROWS = [210, 345];
    const BTN_SCALE = 1.12;
    const BTN_H = 77 * BTN_SCALE;
    const ICON_SIZE = 92;

    SURVIVOR_SKINS.forEach(({ skinId, iconKey, label }, i) => {
      const bx = COLS[i % 3];
      const by = ROWS[Math.floor(i / 3)];

      const charBtn = this.add.image(bx, by, 'botaoCharacter', 0)
        .setScale(BTN_SCALE)
        .setInteractive({ useHandCursor: true });

      this.characterBtns.push({ skinId, btn: charBtn });

      const icon = this.add.image(bx, by - 4, iconKey)
        .setDisplaySize(ICON_SIZE, ICON_SIZE)
        .setInteractive({ useHandCursor: true });

      const labelY = by + BTN_H / 2 + 2;
      const nameHeaderBar = this.add.graphics();
      nameHeaderBar.fillStyle(0x000000, 0.72);
      nameHeaderBar.fillRect(bx - 35, labelY, 70, 15);

      const nameLabel = this.add.text(bx, labelY + 1, label, {
        fontSize: '10px', color: '#e0e0e0', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0);

      charBtn.on('pointerover', () => { if (skinId !== this.pickerSkinId) charBtn.setFrame(1); });
      charBtn.on('pointerout',  () => this.drawSkinRings());
      charBtn.on('pointerdown', () => { this._click(); this.selectSkin(skinId); });
      icon.on('pointerover',    () => { if (skinId !== this.pickerSkinId) charBtn.setFrame(1); });
      icon.on('pointerout',     () => this.drawSkinRings());
      icon.on('pointerdown',    () => { this._click(); this.selectSkin(skinId); });

      this.pickerUI.push(charBtn, icon, nameHeaderBar, nameLabel);
    });

    const confirmBtn = this.add.text(cx, 432, 'Confirmar', {
      fontSize: '15px', color: '#ffffff', backgroundColor: '#1565c0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerdown', () => { this._click(); this.confirmCharacter(); });
    confirmBtn.on('pointerover', () => confirmBtn.setBackgroundColor('#1976d2'));
    confirmBtn.on('pointerout',  () => confirmBtn.setBackgroundColor('#1565c0'));

    this.pickerPadHint = this.add.text(cx, 468, 'Controle: ◀/▶ — escolher  ·  A — confirmar', {
      fontSize: '11px', color: '#888',
      backgroundColor: 'rgba(0,0,0,0.52)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5);

    this.pickerUI.push(bg, overlay, headerBar, title, nameLabelText, nameBox, this.nameDisplay, nameZone, confirmBtn, this.pickerPadHint);
    this.pickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.drawSkinRings();
  }

  private buildKillerPickerUI() {
    const W = 800, H = 600, cx = W / 2;

    const bg = this.add.sprite(cx, H / 2, 'characterScreen');
    bg.setScale(Math.max(W / 1150, H / 640));
    bg.play('charScreen');

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.35);
    overlay.fillRect(0, 0, W, H);

    const title = this.add.text(cx, 68, 'ESCOLHA SEU PERSONAGEM', {
      fontSize: '15px', color: '#e94560', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    const COLS = [175, 400, 625];
    const ROWS = [210, 345];
    const BTN_SCALE = 1.05;
    const BTN_H = 77 * BTN_SCALE;
    const ICON_SIZE = 90;

    KILLER_SKINS.forEach(({ skinId, iconKey, label }, i) => {
      const bx = COLS[i % 3];
      const by = ROWS[Math.floor(i / 3)];

      const charBtn = this.add.image(bx, by, 'botaoCharacter', 0)
        .setScale(BTN_SCALE)
        .setInteractive({ useHandCursor: true });

      this.killerCharacterBtns.push({ skinId, btn: charBtn });

      charBtn.on('pointerover', () => { if (skinId !== this.pickerKillerSkinId) charBtn.setFrame(1); });
      charBtn.on('pointerout',  () => this.drawKillerSkinRings());
      charBtn.on('pointerdown', () => { this._click(); this.selectKillerSkin(skinId); });

      const nameLabel = this.add.text(bx, by + BTN_H / 2 + 3, label, {
        fontSize: '10px', color: '#e0e0e0', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0);

      this.killerPickerUI.push(charBtn, nameLabel);

      if (iconKey) {
        const icon = this.add.image(bx, by - 4, iconKey)
          .setDisplaySize(ICON_SIZE, ICON_SIZE)
          .setInteractive({ useHandCursor: true });
        icon.on('pointerover',  () => { if (skinId !== this.pickerKillerSkinId) charBtn.setFrame(1); });
        icon.on('pointerout',   () => this.drawKillerSkinRings());
        icon.on('pointerdown',  () => { this._click(); this.selectKillerSkin(skinId); });
        this.killerPickerUI.push(icon);
      }
    });

    const confirmBtn = this.add.text(cx, 432, 'Confirmar', {
      fontSize: '15px', color: '#ffffff', backgroundColor: '#1565c0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerdown', () => { this._click(); this.confirmKillerCharacter(); });
    confirmBtn.on('pointerover', () => confirmBtn.setBackgroundColor('#1976d2'));
    confirmBtn.on('pointerout',  () => confirmBtn.setBackgroundColor('#1565c0'));

    this.killerPadHint = this.add.text(cx, 468, 'Controle: ◀/▶ — escolher  ·  A — confirmar', {
      fontSize: '11px', color: '#888',
      backgroundColor: 'rgba(0,0,0,0.52)', padding: { x: 8, y: 4 },
    }).setOrigin(0.5);

    this.killerPickerUI.push(bg, overlay, title, confirmBtn, this.killerPadHint);
    this.killerPickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.drawKillerSkinRings();
  }

  private drawKillerSkinRings() {
    this.killerCharacterBtns.forEach(({ skinId, btn }) => {
      btn.setFrame(skinId === this.pickerKillerSkinId ? 1 : 0);
    });
  }

  private selectKillerSkin(skinId: string) {
    this.pickerKillerSkinId = skinId;
    this.drawKillerSkinRings();
  }

  private showKillerPickerUI() {
    this.padUiMode = 'killerPicker';
    this.killerPickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.drawKillerSkinRings();
    this.syncPadHints();
  }

  private hideKillerPickerUI() {
    this.killerPickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
  }

  private confirmKillerCharacter() {
    const skinLabel = KILLER_SKINS.find((s) => s.skinId === this.pickerKillerSkinId)?.label ?? this.pickerKillerSkinId;
    this.chosenKillerSkinId = this.pickerKillerSkinId;
    this.socket.emit('setCharacter', { name: skinLabel, skinId: this.pickerKillerSkinId });
    this.hideKillerPickerUI();
    this.showInRoomUI();
  }

  private drawSkinRings() {
    this.characterBtns.forEach(({ skinId, btn }) => {
      btn.setFrame(skinId === this.pickerSkinId ? 1 : 0);
    });
  }

  private selectSkin(skinId: string) {
    this.pickerSkinId = skinId;
    this.drawSkinRings();
  }

  private showPickerUI() {
    this.padUiMode = 'picker';
    this.pickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.drawSkinRings();
    this.startKeyboardInput();
    this.syncPadHints();
  }

  private hidePickerUI() {
    this.pickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.stopKeyboardInput();
  }

  private refreshNameDisplay() {
    const cursor = this.cursorOn ? '|' : ' ';
    this.nameDisplay.setText(this.pickerName ? this.pickerName + cursor : cursor);
  }

  private startKeyboardInput() {
    this.cursorOn = true;
    this.cursorTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.cursorOn = !this.cursorOn;
        this.refreshNameDisplay();
      },
    });
    this.kbListener = (e: KeyboardEvent) => {
      if (this.nameInputEl) return;
      if (e.key === 'Backspace') {
        this.pickerName = this.pickerName.slice(0, -1);
      } else if (e.key.length === 1 && this.pickerName.length < 12) {
        this.pickerName += e.key;
      }
      this.refreshNameDisplay();
    };
    window.addEventListener('keydown', this.kbListener);
    this.refreshNameDisplay();
  }

  private stopKeyboardInput() {
    this.cursorTimer?.remove(false);
    this.cursorTimer = undefined;
    if (this.kbListener) {
      window.removeEventListener('keydown', this.kbListener);
      this.kbListener = null;
    }
    this.closeNameInput();
  }

  private openNameInput() {
    if (this.nameInputEl) {
      this.nameInputEl.focus();
      return;
    }
    const el = document.createElement('input');
    el.type        = 'text';
    el.maxLength   = 12;
    el.value       = this.pickerName;
    el.placeholder = 'Seu nome';
    el.style.cssText = [
      'position: fixed', 'top: 18%', 'left: 50%', 'transform: translateX(-50%)',
      'z-index: 1000', 'width: 200px', 'padding: 8px 12px',
      'font-size: 16px', 'font-weight: bold', 'text-align: center',
      'color: #ffffff', 'background: #111122', 'border: 1px solid #4285f4',
      'border-radius: 4px', 'outline: none',
    ].join(';');
    const parent = (document.fullscreenElement as HTMLElement | null) ?? document.body;
    parent.appendChild(el);
    this.nameInputEl = el;

    el.addEventListener('input', () => {
      this.pickerName = el.value.slice(0, 12);
      this.refreshNameDisplay();
    });
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') el.blur();
    });
    el.addEventListener('blur', () => this.closeNameInput());
    el.focus();
  }

  private closeNameInput() {
    if (!this.nameInputEl) return;
    const el = this.nameInputEl;
    this.nameInputEl = null;
    el.remove();
  }

  private confirmCharacter() {
    const skinLabel = SURVIVOR_SKINS.find((s) => s.skinId === this.pickerSkinId)?.label ?? this.pickerSkinId;
    const name = this.pickerName.trim() || skinLabel;
    this.chosenSkinId = this.pickerSkinId;
    this.socket.emit('setCharacter', { name, skinId: this.pickerSkinId });
    this.hidePickerUI();
    this.showInRoomUI();
  }

  private showRoomSelection() {
    this.padUiMode = 'rooms';
    this.roomSelectionUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.inRoomBgUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.backToPickerBtn.setVisible(false);
  }

  private showInRoomUI() {
    this.padUiMode = 'inRoom';
    this.roomSelectionUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.inRoomBgUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(true));
    this.backToPickerBtn.setVisible(this.myRole === 'survivor' || this.myRole === 'professor');
    this.refreshActionLabel();
    this.syncPadHints();
  }

  private roomLabel(name: string, count: number, phase: string): string {
    const phaseStr = phase === 'playing' ? ' [em jogo]' : phase === 'ended' ? ' [encerrada]' : '';
    return `${name.toUpperCase()}  —  ${count}/${MAX_PLAYERS_PER_ROOM} jogadores${phaseStr}`;
  }

  private updateRoomButtons(summary: RoomSummary) {
    ROOM_NAMES.forEach((name, i) => {
      const info = summary[name] ?? { playerCount: 0, phase: 'lobby' };
      this.roomPhases[name] = info.phase;
      this.roomButtons[i]?.setText(this.roomLabel(name, info.playerCount, info.phase));
      this.restoreRoomButtonColor(i);
    });
  }

  private isRoomJoinable(name: string): boolean {
    return (this.roomPhases[name] ?? 'lobby') === 'lobby';
  }

  private showJoinError(msg: string) {
    this.errorText.setText(msg).setVisible(true);
    this.time.delayedCall(2000, () => this.errorText.setVisible(false));
  }

  private canProfessorStart(): boolean {
    return this.totalSurvivors >= MIN_SURVIVORS_TO_START && this.readySurvivors === this.totalSurvivors;
  }

  private refreshActionLabel() {
    if (!this.actionText) return;

    if (this.myRole === 'survivor') {
      this.actionText.setText(this.isReady ? 'Pronto  [ A ]' : 'Marcar como pronto  [ A ]');
      this.actionText.setBackgroundColor(this.isReady ? '#2e7d32' : '#333333');
      return;
    }

    if (this.myRole === 'professor') {
      const canStart = this.canProfessorStart();
      const waitingLabel = this.totalSurvivors < MIN_SURVIVORS_TO_START
        ? `Esperando alunos... (${this.totalSurvivors}/${MIN_SURVIVORS_TO_START})`
        : 'Esperando alunos ficarem prontos...';
      this.actionText.setText(canStart ? 'Iniciar partida  [ A ]' : waitingLabel);
      this.actionText.setBackgroundColor(canStart ? '#1565c0' : '#333333');
      return;
    }

    this.actionText.setText('Aguardando role...');
    this.actionText.setBackgroundColor('#333333');
  }
}
