import Phaser from 'phaser';
import type { Socket } from '../socketClient';

interface PlayerStatSnapshot {
  role: 'survivor' | 'professor';
  outcome?: 'escaped' | 'expelled' | 'downed';
  hackContributed?: number;
  timesDown?: number;
  healsGiven?: number;
  hitsLanded?: number;
  downedCount?: number;
  expelledCount?: number;
}

interface PostGameData {
  winner: string;
  stats:  Record<string, PlayerStatSnapshot>;
  myId:   string;
  myRole: 'survivor' | 'professor';
  socket: Socket;
}

const PROFESSOR_RATINGS: [number, string][] = [
  [3, 'Ditador da Sala'],
  [2, 'Professor Implacável'],
  [1, 'Professor Severo'],
  [0, 'Plano de Aula Ignorado'],
];

const OUTCOME_LABEL: Record<'escaped' | 'expelled' | 'downed', string> = {
  escaped: 'FUGIU!',
  expelled: 'EXPULSO',
  downed: 'DERRUBADO',
};

const OUTCOME_COLOR: Record<'escaped' | 'expelled' | 'downed', string> = {
  escaped: '#00e676',
  expelled: '#ff4444',
  downed: '#ffb300',
};

export class PostGameScene extends Phaser.Scene {
  constructor() {
    super('PostGameScene');
  }

  create() {
    const { width, height } = this.scale;
    const data = this.registry.get('postGameData') as PostGameData;
    const my = data.stats[data.myId];

    this.cameras.main.setBackgroundColor('#1a1a2e');

    const { label, color } = this._getResult(data, my);

    this.add.text(width / 2, height * 0.22, label, {
      fontSize: '48px',
      color,
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this._renderStatBoxes(width, height, my);
    this._renderButton(width, height, data.socket);
  }

  private _getResult(data: PostGameData, my: PlayerStatSnapshot): { label: string; color: string } {
    if (my.role === 'professor') {
      const expelled = my.expelledCount ?? 0;
      const [, lbl] = PROFESSOR_RATINGS.find(([min]) => expelled >= min) ?? [0, 'Plano de Aula Ignorado'];
      return { label: lbl, color: data.winner === 'professor' ? '#4fc3f7' : '#e94560' };
    }
    const outcome = my.outcome ?? 'downed';
    return { label: OUTCOME_LABEL[outcome], color: OUTCOME_COLOR[outcome] };
  }

  private _getStatBoxes(my: PlayerStatSnapshot): { label: string; value: string }[] {
    if (my.role === 'professor') {
      return [
        { label: 'ATAQUES',    value: String(my.hitsLanded   ?? 0) },
        { label: 'DERRUBADOS', value: String(my.downedCount   ?? 0) },
        { label: 'EXPULSOS',   value: String(my.expelledCount ?? 0) },
      ];
    }
    return [
      { label: 'TERMINAIS', value: `${my.hackContributed ?? 0}%` },
      { label: 'DERRUBADO', value: `${my.timesDown ?? 0}x` },
      { label: 'CURAS',     value: String(my.healsGiven ?? 0) },
    ];
  }

  private _renderStatBoxes(width: number, height: number, my: PlayerStatSnapshot) {
    const boxes  = this._getStatBoxes(my);
    const boxW   = 150;
    const boxH   = 80;
    const gap    = 20;
    const totalW = boxes.length * boxW + (boxes.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const by     = height * 0.46;

    boxes.forEach(({ label, value }, i) => {
      const bx = startX + i * (boxW + gap);

      this.add.graphics()
        .fillStyle(0x2a2a4e, 1)
        .fillRect(bx, by, boxW, boxH);

      this.add.text(bx + boxW / 2, by + 20, value, {
        fontSize: '26px',
        color: '#e0e0ff',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.add.text(bx + boxW / 2, by + 58, label, {
        fontSize: '11px',
        color: '#666688',
        fontFamily: 'monospace',
        letterSpacing: 2,
      }).setOrigin(0.5);
    });
  }

  private _renderButton(width: number, height: number, socket: Socket) {
    const goToLobby = () => {
      socket.disconnect();
      this.scene.start('LobbyScene');
    };

    const btn = this.add.text(width / 2, height * 0.75, '[ JOGAR DE NOVO ]', {
      fontSize: '16px',
      color: '#aaaacc',
      fontFamily: 'monospace',
      letterSpacing: 4,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#e0e0ff'));
    btn.on('pointerout',  () => btn.setColor('#aaaacc'));
    btn.on('pointerdown', goToLobby);

    this.input.keyboard?.on('keydown-ENTER', goToLobby);
    this.input.keyboard?.on('keydown-SPACE', goToLobby);
  }
}
