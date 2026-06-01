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
  { skinId: 'arthur',  iconKey: 'arthur-icon',  iconPath: './personagens/arthur/icons/Arthur_Icon.png',   label: 'Arthur'  },
  { skinId: 'gustavo', iconKey: 'gustavo-icon', iconPath: './personagens/gustavo/icons/Gustavo_Icon.png', label: 'Gustavo' },
  { skinId: 'giu',     iconKey: 'giu-icon',     iconPath: './personagens/giu/icons/Giu_Icon.png',         label: 'Giu'     },
  { skinId: 'isabela', iconKey: 'isabela-icon', iconPath: './personagens/isabela/icons/Isabela_Icon.png', label: 'Isabela' },
  { skinId: 'davi',    iconKey: 'davi-icon',    iconPath: './personagens/davi/icons/Davi_Icon.png',       label: 'Davi'    },
  { skinId: 'caio',    iconKey: 'caio-icon',    iconPath: './personagens/caio/icons/Caio_Icon.png',       label: 'Caio'    },
] as const;

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
  private skinRings:    { skinId: string; ring: Phaser.GameObjects.Graphics }[] = [];
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
    this.skinRings      = [];
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
  }

  create() {
    this.socket = io({ path: './expelled/socket.io' });

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
          this.showInRoomUI();
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
        this.scene.start('GameScene', { socket: this.socket, roomName: this.currentRoom, skinId: this.chosenSkinId });
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
      this.showPickerUI();
    });

    this.inRoomUI = [this.countText, this.statusText, hint, padHint, this.actionText, controls];

    this.errorText = this.add.text(400, 560, '', {
      fontSize: '16px', color: '#e94560', align: 'center',
    }).setOrigin(0.5).setVisible(false);
  }

  private buildPickerUI() {
    const CENTER_X = 400;

    const title = this.add.text(CENTER_X, 150, 'Escolha seu personagem', {
      fontSize: '20px', color: '#e94560', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    const nameLabelText = this.add.text(CENTER_X, 195, 'Seu nome (max 12 caracteres):', {
      fontSize: '13px', color: '#aaa',
    }).setOrigin(0.5);

    const nameBox = this.add.graphics();
    nameBox.fillStyle(0x111122, 0.9);
    nameBox.fillRoundedRect(CENTER_X - 120, 210, 240, 36, 6);
    nameBox.lineStyle(2, 0x4285f4, 0.8);
    nameBox.strokeRoundedRect(CENTER_X - 120, 210, 240, 36, 6);

    this.nameDisplay = this.add.text(CENTER_X, 228, ' ', {
      fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const iconSize = 64;
    const gap      = 24;
    const totalW   = SURVIVOR_SKINS.length * iconSize + (SURVIVOR_SKINS.length - 1) * gap;
    const startX   = CENTER_X - totalW / 2 + iconSize / 2;
    const skinY    = 320;

    SURVIVOR_SKINS.forEach(({ skinId, iconKey, label }, i) => {
      const bx = startX + i * (iconSize + gap);
      const by = skinY;

      const ring = this.add.graphics();
      this.skinRings.push({ skinId, ring });

      const btn = this.add.image(bx, by, iconKey)
        .setDisplaySize(iconSize, iconSize)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => this.selectSkin(skinId));
      btn.on('pointerover', () => {
        if (skinId !== this.pickerSkinId) {
          ring.clear();
          ring.lineStyle(2, 0x888888, 0.6);
          ring.strokeRect(bx - iconSize / 2, by - iconSize / 2, iconSize, iconSize);
        }
      });
      btn.on('pointerout', () => this.drawSkinRings());

      const nameText = this.add.text(bx, by + iconSize / 2 + 10, label, {
        fontSize: '12px', color: '#cccccc',
      }).setOrigin(0.5, 0);

      this.pickerUI.push(ring, btn, nameText);
    });

    const confirmBtn = this.add.text(CENTER_X, 440, 'Confirmar', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#1565c0',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerdown', () => this.confirmCharacter());
    confirmBtn.on('pointerover', () => confirmBtn.setBackgroundColor('#1976d2'));
    confirmBtn.on('pointerout',  () => confirmBtn.setBackgroundColor('#1565c0'));

    this.pickerUI.push(title, nameLabelText, nameBox, this.nameDisplay, confirmBtn);
    this.pickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.drawSkinRings();
  }

  private drawSkinRings() {
    const iconSize = 64;
    const gap      = 24;
    const totalW   = SURVIVOR_SKINS.length * iconSize + (SURVIVOR_SKINS.length - 1) * gap;
    const startX   = 400 - totalW / 2 + iconSize / 2;

    this.skinRings.forEach(({ skinId, ring }, i) => {
      ring.clear();
      const bx = startX + i * (iconSize + gap);
      const by = 320;
      if (skinId === this.pickerSkinId) {
        ring.lineStyle(3, 0xe94560, 1);
        ring.strokeRect(bx - iconSize / 2 - 2, by - iconSize / 2 - 2, iconSize + 4, iconSize + 4);
      }
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
    this.backToPickerBtn.setVisible(this.myRole === 'survivor');
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
