import Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

type LobbyRole = 'professor' | 'survivor';

interface LobbyPlayer {
  role: LobbyRole;
  ready?: boolean;
}

interface LobbyState {
  players: Record<string, LobbyPlayer>;
}


export class LobbyScene extends Phaser.Scene {
  private socket!: Socket;
  private countText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private actionText!: Phaser.GameObjects.Text;
  private playerCount = 1;
  private myRole: LobbyRole | null = null;
  private isReady = false;
  private readySurvivors = 0;
  private totalSurvivors = 0;

  constructor() { super('LobbyScene'); }

  create() {
    this.socket = io();

    // Background
    this.add.rectangle(400, 300, 800, 600, 0x1a1a2e);

    this.add.text(400, 180, 'EXPELLED', {
      fontSize: '48px', color: '#e94560', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(400, 250, 'aguardando jogadores…', {
      fontSize: '16px', color: '#888',
    }).setOrigin(0.5);

    this.countText = this.add.text(400, 300, this.countLabel(), {
      fontSize: '22px', color: '#fff',
    }).setOrigin(0.5);

    this.statusText = this.add.text(400, 340, '', {
      fontSize: '14px', color: '#cfcfcf', align: 'center',
    }).setOrigin(0.5);

    this.add.text(400, 390, 'Alunos: clique para marcar PRONTO.\nProfessor: inicia quando todos estiverem prontos.', {
      fontSize: '12px', color: '#666', align: 'center',
    }).setOrigin(0.5);

    this.actionText = this.add.text(400, 455, 'Aguardando role...', {
      fontSize: '18px', color: '#ffffff', backgroundColor: '#333333',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.add.text(400, 535, 'Controles\nWASD / Setas — mover\nE — hackear / fugir\nSHIFT — correr (alunos)\nSPACE — atacar (professor)', {
      fontSize: '12px', color: '#aaa', align: 'center',
    }).setOrigin(0.5);

    this.actionText.on('pointerdown', () => {
      if (this.myRole === 'survivor') {
        this.isReady = !this.isReady;
        this.socket.emit('setReady', { ready: this.isReady });
      } else if (this.myRole === 'professor' && this.canProfessorStart()) {
        this.socket.emit('startMatch');
      }
    });

    this.socket.on('roleAssigned', (role: LobbyRole) => {
      this.myRole = role;
      this.refreshActionLabel();
    });

    this.socket.on('gameState', (state: LobbyState) => {
      this.playerCount = Object.keys(state.players).length;
      const players = Object.values(state.players);
      const survivors = players.filter((p) => p.role === 'survivor');
      this.totalSurvivors = survivors.length;
      this.readySurvivors = survivors.filter((p) => p.ready).length;
      const socketId = this.socket.id;
      const me = socketId ? state.players[socketId] : undefined;
      if (me?.role === 'survivor') this.isReady = !!me.ready;
      this.countText.setText(this.countLabel());
      this.statusText.setText(`Alunos prontos: ${this.readySurvivors}/${this.totalSurvivors}`);
      this.refreshActionLabel();
    });

    this.socket.on('gamePhase', (phase: string) => {
      if (phase === 'playing') {
        // qnd contar como iniciado, passo o socket pra game scene pra n ter q reconectar
        this.scene.start('GameScene', { socket: this.socket });
      }
    });
  }

  private countLabel(): string {
    return `Jogadores conectados: ${this.playerCount} / 5`;
  }

  private canProfessorStart(): boolean {
    return this.totalSurvivors > 0 && this.readySurvivors === this.totalSurvivors;
  }

  private refreshActionLabel() {
    if (!this.actionText) return;

    // espera os alunos daren ready
    if (this.myRole === 'survivor') {
      this.actionText.setText(this.isReady ? 'Pronto' : 'Marcar como pronto');
      this.actionText.setBackgroundColor(this.isReady ? '#2e7d32' : '#333333');
      return;
    }
    //qnd geral estiver pronto prof pode comecar
  
    if (this.myRole === 'professor') {
      const canStart = this.canProfessorStart();
      this.actionText.setText(canStart ? 'Iniciar partida' : 'Esperando alunos ficarem prontos...');
      this.actionText.setBackgroundColor(canStart ? '#1565c0' : '#333333');
      return;
    }

    this.actionText.setText('Aguardando role...');
    this.actionText.setBackgroundColor('#333333');
  }
}
