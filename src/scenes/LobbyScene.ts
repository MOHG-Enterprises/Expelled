import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';
import { ROOM_NAMES } from '../constants';

type LobbyRole = 'professor' | 'survivor';

interface LobbyPlayer {
  role: LobbyRole;
  ready?: boolean;
}

interface LobbyState {
  players: Record<string, LobbyPlayer>;
}

type RoomSummary = Record<string, { playerCount: number; phase: string }>;

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

  private roomButtons: Phaser.GameObjects.Text[] = [];
  private roomCountTexts: Phaser.GameObjects.Text[] = [];
  private inRoomUI: Phaser.GameObjects.GameObject[] = [];

  // gamepad nav
  private selectedRoomIdx = 0;
  private padPrevDown  = false;
  private padPrevUp    = false;
  private padPrevA     = false;
  private padPrevStart = false;

  constructor() { super('LobbyScene'); }

  create() {
    this.socket = io({ path: '/expelled/socket.io' });

    this.add.rectangle(400, 300, 800, 600, 0x1a1a2e);

    this.add.text(400, 60, 'EXPELLED', {
      fontSize: '48px', color: '#e94560', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(400, 120, 'Escolha uma sala para entrar', {
      fontSize: '16px', color: '#888',
    }).setOrigin(0.5);

    this.buildRoomButtons();
    this.buildInRoomUI();
    this.showRoomSelection();

    this.socket.on('roomList', (summary: RoomSummary) => {
      this.updateRoomButtons(summary);
    });

    this.socket.on('roleAssigned', (role: LobbyRole) => {
      this.myRole = role;
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
      this.countText.setText(`Jogadores na sala: ${this.playerCount} / 5`);
      this.statusText.setText(`Alunos prontos: ${this.readySurvivors}/${this.totalSurvivors}`);
      this.refreshActionLabel();
    });

    this.socket.on('gamePhase', (phase: string) => {
      if (phase === 'playing') {
        this.scene.start('GameScene', { socket: this.socket, roomName: this.currentRoom });
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
    this.showInRoomUI();
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

    this.inRoomUI = [this.countText, this.statusText, hint, padHint, this.actionText, controls];
  }

  private showRoomSelection() {
    this.roomButtons.forEach((b) => b.setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
  }

  private showInRoomUI() {
    this.roomButtons.forEach((b) => b.setVisible(false));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(true));
    this.refreshActionLabel();
  }

  private roomLabel(name: string, count: number, phase: string): string {
    const phaseStr = phase === 'playing' ? ' [em jogo]' : phase === 'ended' ? ' [encerrada]' : '';
    return `${name.toUpperCase()}  —  ${count}/5 jogadores${phaseStr}`;
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
