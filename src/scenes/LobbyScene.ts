import Phaser from 'phaser';
import { io } from '../socketClient';
import type { Socket } from '../socketClient';
import { ROOM_NAMES, MAX_PLAYERS_PER_ROOM } from '../constants';

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
  { skinId: 'davi',    iconKey: 'davi-icon',    iconPath: './personagens/survivors/dave/icons/Dave_Icon.png',       label: 'Davi'    },
  { skinId: 'caio',    iconKey: 'caio-icon',    iconPath: './personagens/survivors/caio/icons/Caio_Icon.png',       label: 'Caio'    },
] as const;

const KILLER_SKINS: Array<{ skinId: string; iconKey: string | null; iconPath: string | null; label: string }> = [
  { skinId: 'boi',  iconKey: 'boi-icon', iconPath: './personagens/killers/professor/icon/Icon_Boi_Finished.png', label: 'Boi'  },
  { skinId: 'clayrton',   iconKey: null,             iconPath: null, label: 'Clayrton'   },
  { skinId: 'fernanda',   iconKey: null,             iconPath: null, label: 'Fernanda'   },
  { skinId: 'aquarioguy', iconKey: null,             iconPath: null, label: 'AquarioGuy' },
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
  private roomCountTexts: Phaser.GameObjects.Text[] = [];
  private inRoomUI: Phaser.GameObjects.GameObject[] = [];
  private errorText!: Phaser.GameObjects.Text;

  // gamepad nav
  private selectedRoomIdx = 0;
  private padPrevDown  = false;
  private padPrevUp    = false;
  private padPrevA     = false;
  private padPrevStart = false;

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
    this.killerPickerUI      = [];
    this.killerCharacterBtns = [];
    this.chosenKillerSkinId  = 'boi';
    this.pickerKillerSkinId  = 'boi';
    this.roomButtons    = [];
    this.roomCountTexts = [];
    this.inRoomUI       = [];
    this.selectedRoomIdx  = 0;
    this.padPrevDown    = false;
    this.padPrevUp      = false;
    this.padPrevA       = false;
    this.padPrevStart   = false;
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
  }

  create() {
    this.socket = io({ path: '/expelled/socket.io' });

    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.cameras.main.centerOn(400, 300);

    this.add.text(400, 60, 'EXPELLED', {
      fontSize: '48px', color: '#e94560', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(400, 120, 'Escolha uma sala para entrar', {
      fontSize: '16px', color: '#888',
    }).setOrigin(0.5);

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
      if (reason === 'full') {
        this.currentRoom = null;
        this.showRoomSelection();
        this.errorText.setText('Sala cheia! Escolha outra.').setVisible(true);
        this.time.delayedCall(2000, () => this.errorText.setVisible(false));
      }
    });

    this.updateRoomSelection();

    const onResize = () => this.cameras.main.centerOn(400, 300);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  update() {
    const pad = (this.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin)?.pad1 ?? null;
    if (!pad) return;

    const DEAD = 0.5;
    const axisY    = pad.axes[1]?.getValue() ?? 0;
    const downNow  = pad.buttons[13]?.pressed || axisY > DEAD;
    const upNow    = pad.buttons[12]?.pressed || axisY < -DEAD;
    const aNow     = pad.buttons[0]?.pressed ?? false;
    const startNow = pad.buttons[9]?.pressed ?? false;

    if (!this.currentRoom) {
      if (downNow && !this.padPrevDown) {
        this.selectedRoomIdx = (this.selectedRoomIdx + 1) % ROOM_NAMES.length;
        this.updateRoomSelection();
      }
      if (upNow && !this.padPrevUp) {
        this.selectedRoomIdx = (this.selectedRoomIdx - 1 + ROOM_NAMES.length) % ROOM_NAMES.length;
        this.updateRoomSelection();
      }
      if (aNow && !this.padPrevA) {
        this.joinRoom(this.selectedRoomIdx);
      }
    } else {
      if (aNow && !this.padPrevA) {
        this.triggerAction();
      }
      if (startNow && !this.padPrevStart) {
        this.triggerAction();
      }
    }

    this.padPrevDown  = downNow;
    this.padPrevUp    = upNow;
    this.padPrevA     = aNow;
    this.padPrevStart = startNow;
  }

  private joinRoom(idx: number) {
    const name = ROOM_NAMES[idx];
    if (!name || this.currentRoom) return;
    this.currentRoom = name;
    this.socket.emit('joinRoom', { roomName: name });
    this.roomButtons.forEach((b) => b.setVisible(false));
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
    const startY = 190;
    const gap    = 90;

    ROOM_NAMES.forEach((name, i) => {
      const y = startY + i * gap;

      const btn = this.add.text(400, y, this.roomLabel(name, 0, 'lobby'), {
        fontSize: '20px', color: '#ffffff', backgroundColor: '#1e3a5f',
        padding: { x: 20, y: 10 },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => { if (!this.currentRoom) btn.setBackgroundColor('#2a5080'); });
      btn.on('pointerout',  () => { if (!this.currentRoom) this.restoreRoomButtonColor(i); });
      btn.on('pointerdown', () => { this.joinRoom(i); });

      this.roomButtons.push(btn);
      this.roomCountTexts.push(btn);
    });
  }

  private restoreRoomButtonColor(idx: number) {
    const isSelected = idx === this.selectedRoomIdx;
    this.roomButtons[idx]?.setBackgroundColor(isSelected ? '#2a5080' : '#1e3a5f');
  }

  private updateRoomSelection() {
    this.roomButtons.forEach((btn, i) => {
      btn.setBackgroundColor(i === this.selectedRoomIdx ? '#2a5080' : '#1e3a5f');
    });
  }

  private buildInRoomUI() {
    this.countText = this.add.text(400, 300, '', {
      fontSize: '22px', color: '#fff',
    }).setOrigin(0.5);

    this.statusText = this.add.text(400, 340, '', {
      fontSize: '14px', color: '#cfcfcf', align: 'center',
    }).setOrigin(0.5);

    const hint = this.add.text(400, 390, 'Alunos: clique para marcar PRONTO.\nProfessor: inicia quando todos estiverem prontos.', {
      fontSize: '12px', color: '#666', align: 'center',
    }).setOrigin(0.5);

    const padHint = this.add.text(400, 430, 'Controle: A = pronto / iniciar', {
      fontSize: '11px', color: '#444', align: 'center',
    }).setOrigin(0.5);

    this.actionText = this.add.text(400, 470, 'Aguardando role...', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#333333',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const controls = this.add.text(400, 550, 'WASD / Setas — mover  |  E — hackear / fugir  |  SHIFT — correr (alunos)  |  SPACE — atacar (professor)', {
      fontSize: '11px', color: '#aaa', align: 'center',
    }).setOrigin(0.5);

    this.actionText.on('pointerdown', () => this.triggerAction());

    this.backToPickerBtn = this.add.text(400, 510, '← Trocar personagem', {
      fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false);

    this.backToPickerBtn.on('pointerover', () => this.backToPickerBtn.setColor('#ffffff'));
    this.backToPickerBtn.on('pointerout',  () => this.backToPickerBtn.setColor('#aaaaaa'));
    this.backToPickerBtn.on('pointerdown', () => {
      this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
      this.backToPickerBtn.setVisible(false);
      if (this.myRole === 'professor') {
        this.showKillerPickerUI();
      } else {
        this.showPickerUI();
      }
    });

    this.inRoomUI = [this.countText, this.statusText, hint, padHint, this.actionText, controls];

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

    const title = this.add.text(cx, 68, 'ESCOLHA SEU PERSONAGEM', {
      fontSize: '15px', color: '#e94560', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    const nameLabelText = this.add.text(cx, 92, 'Seu nome (max 12 caracteres):', {
      fontSize: '11px', color: '#aaa',
    }).setOrigin(0.5);

    const nameBox = this.add.graphics();
    nameBox.fillStyle(0x111122, 0.9);
    nameBox.fillRoundedRect(cx - 95, 103, 190, 28, 4);
    nameBox.lineStyle(1, 0x4285f4, 0.8);
    nameBox.strokeRoundedRect(cx - 95, 103, 190, 28, 4);

    this.nameDisplay = this.add.text(cx, 117, ' ', {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const COLS = [175, 400, 625];
    const ROWS = [210, 345];
    const BTN_SCALE = 1.05;
    const BTN_H = 77 * BTN_SCALE;
    const ICON_SIZE = 90;

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

      const nameLabel = this.add.text(bx, by + BTN_H / 2 + 3, label, {
        fontSize: '10px', color: '#e0e0e0', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0);

      charBtn.on('pointerover', () => { if (skinId !== this.pickerSkinId) charBtn.setFrame(1); });
      charBtn.on('pointerout',  () => this.drawSkinRings());
      charBtn.on('pointerdown', () => this.selectSkin(skinId));
      icon.on('pointerover',    () => { if (skinId !== this.pickerSkinId) charBtn.setFrame(1); });
      icon.on('pointerout',     () => this.drawSkinRings());
      icon.on('pointerdown',    () => this.selectSkin(skinId));

      this.pickerUI.push(charBtn, icon, nameLabel);
    });

    const confirmBtn = this.add.text(cx, 432, 'Confirmar', {
      fontSize: '15px', color: '#ffffff', backgroundColor: '#1565c0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerdown', () => this.confirmCharacter());
    confirmBtn.on('pointerover', () => confirmBtn.setBackgroundColor('#1976d2'));
    confirmBtn.on('pointerout',  () => confirmBtn.setBackgroundColor('#1565c0'));

    this.pickerUI.push(bg, overlay, title, nameLabelText, nameBox, this.nameDisplay, confirmBtn);
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
      charBtn.on('pointerdown', () => this.selectKillerSkin(skinId));

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
        icon.on('pointerdown',  () => this.selectKillerSkin(skinId));
        this.killerPickerUI.push(icon);
      }
    });

    const confirmBtn = this.add.text(cx, 432, 'Confirmar', {
      fontSize: '15px', color: '#ffffff', backgroundColor: '#1565c0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerdown', () => this.confirmKillerCharacter());
    confirmBtn.on('pointerover', () => confirmBtn.setBackgroundColor('#1976d2'));
    confirmBtn.on('pointerout',  () => confirmBtn.setBackgroundColor('#1565c0'));

    this.killerPickerUI.push(bg, overlay, title, confirmBtn);
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
    this.killerPickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.drawKillerSkinRings();
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
    this.pickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.drawSkinRings();
    this.startKeyboardInput();
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
    this.roomButtons.forEach((b) => b.setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.backToPickerBtn.setVisible(false);
  }

  private showInRoomUI() {
    this.roomButtons.forEach((b) => b.setVisible(false));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(true));
    this.backToPickerBtn.setVisible(this.myRole === 'survivor' || this.myRole === 'professor');
    this.refreshActionLabel();
  }

  private roomLabel(name: string, count: number, phase: string): string {
    const phaseStr = phase === 'playing' ? ' [em jogo]' : phase === 'ended' ? ' [encerrada]' : '';
    return `${name.toUpperCase()}  —  ${count}/${MAX_PLAYERS_PER_ROOM} jogadores${phaseStr}`;
  }

  private updateRoomButtons(summary: RoomSummary) {
    ROOM_NAMES.forEach((name, i) => {
      const info = summary[name] ?? { playerCount: 0, phase: 'lobby' };
      this.roomButtons[i]?.setText(this.roomLabel(name, info.playerCount, info.phase));
    });
  }

  private canProfessorStart(): boolean {
    return this.totalSurvivors > 0 && this.readySurvivors === this.totalSurvivors;
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
      this.actionText.setText(canStart ? 'Iniciar partida  [ A ]' : 'Esperando alunos ficarem prontos...');
      this.actionText.setBackgroundColor(canStart ? '#1565c0' : '#333333');
      return;
    }

    this.actionText.setText('Aguardando role...');
    this.actionText.setBackgroundColor('#333333');
  }
}
