import Phaser from 'phaser';
import axios from 'axios';
import type { Socket } from '../socketClient';
import { calculateReward, type RewardBreakdown } from '../game/rewards';
import { FEIRA_PRODUCT_ID, GOOGLE_CLIENT_ID } from '../constants';

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
  socket: Socket;
}

const PROFESSOR_RATINGS: [number, string][] = [
  [3, 'Ditador da Sala'],
  [2, 'Professor Implacável'],
  [1, 'Professor Severo'],
  [0, 'Plano de Aula Ignorado'],
];

const OUTCOME_LABEL: Record<'escaped' | 'expelled' | 'downed', string> = {
  escaped:  'FUGIU!',
  expelled: 'EXPULSO',
  downed:   'DERRUBADO',
};

const OUTCOME_COLOR: Record<'escaped' | 'expelled' | 'downed', string> = {
  escaped:  '#00e676',
  expelled: '#ff4444',
  downed:   '#ffb300',
};

type FeiraStatus = 'idle' | 'pending' | 'done' | 'error';

export class PostGameScene extends Phaser.Scene {
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  private _data: PostGameData | null = null;
  private _feiraStatus: FeiraStatus = 'idle';
  private _feiraMessage = '';
  private _feiraBreakdown: RewardBreakdown | null = null;

  constructor() {
    super('PostGameScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this._data = this.registry.get('postGameData') as PostGameData;
    const data = this._data;
    this._feiraStatus = 'idle';
    this._feiraMessage = '';

    const my = data.stats[data.myId];
    this._feiraBreakdown = my ? calculateReward(my, data.winner) : null;

    this._build(this.scale.width, this.scale.height, data);

    const onResize = (gameSize: Phaser.Structs.Size) => {
      this._clearContent();
      this._build(gameSize.width, gameSize.height, data);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    if (my) this._initFeira(data);
  }

  private _clearContent(): void {
    this.input.keyboard?.off('keydown-ENTER');
    this.input.keyboard?.off('keydown-SPACE');
    this.contentObjects.forEach(o => o.destroy());
    this.contentObjects = [];
  }

  private _build(width: number, height: number, data: PostGameData): void {
    const my = data.stats[data.myId];

    if (!my) {
      this._renderButton(width, height * 0.75, data.socket);
      return;
    }

    const { label, color } = this._getResult(data, my);

    this.contentObjects.push(
      this.add.text(width / 2, height * 0.22, label, {
        fontSize: '48px',
        color,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    this._renderStatBoxes(width, height, my);

    let bottomY = height * 0.62;

    if (this._feiraBreakdown) {
      bottomY = this._renderRewardBreakdown(width, bottomY, this._feiraBreakdown);
      bottomY += 12;
    }

    if (this._feiraStatus !== 'idle') {
      const statusColor =
        this._feiraStatus === 'done'  ? '#00e676' :
        this._feiraStatus === 'error' ? '#ff4444' : '#aaaacc';

      this.contentObjects.push(
        this.add.text(width / 2, bottomY, this._feiraMessage, {
          fontSize: '14px',
          color: statusColor,
          fontFamily: 'monospace',
        }).setOrigin(0.5),
      );
      bottomY += 28;
    }

    this._renderButton(width, bottomY + 8, data.socket);
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

  private _renderStatBoxes(width: number, height: number, my: PlayerStatSnapshot): void {
    const boxes  = this._getStatBoxes(my);
    const boxW   = 150;
    const boxH   = 80;
    const gap    = 20;
    const totalW = boxes.length * boxW + (boxes.length - 1) * gap;
    const startX = (width - totalW) / 2;
    const by     = height * 0.46;

    boxes.forEach(({ label, value }, i) => {
      const bx = startX + i * (boxW + gap);

      this.contentObjects.push(
        this.add.graphics()
          .fillStyle(0x2a2a4e, 1)
          .fillRect(bx, by, boxW, boxH),
      );

      this.contentObjects.push(
        this.add.text(bx + boxW / 2, by + 20, value, {
          fontSize: '26px',
          color: '#e0e0ff',
          fontFamily: 'monospace',
        }).setOrigin(0.5),
      );

      this.contentObjects.push(
        this.add.text(bx + boxW / 2, by + 58, label, {
          fontSize: '11px',
          color: '#666688',
          fontFamily: 'monospace',
          letterSpacing: 2,
        }).setOrigin(0.5),
      );
    });
  }

  private _renderRewardBreakdown(width: number, startY: number, breakdown: RewardBreakdown): number {
    const lineH = 18;
    const col1X = width / 2 - 90;
    const col2X = width / 2 + 90;

    breakdown.lines.forEach((line, i) => {
      const y = startY + i * lineH;
      this.contentObjects.push(
        this.add.text(col1X, y, line.label, {
          fontSize: '13px',
          color: '#888899',
          fontFamily: 'monospace',
        }).setOrigin(0, 0.5),
      );
      this.contentObjects.push(
        this.add.text(col2X, y, `+${line.amount} tj`, {
          fontSize: '13px',
          color: '#e0e0ff',
          fontFamily: 'monospace',
        }).setOrigin(1, 0.5),
      );
    });

    const divY = startY + breakdown.lines.length * lineH + 6;
    this.contentObjects.push(
      this.add.graphics()
        .lineStyle(1, 0x444466, 1)
        .lineBetween(col1X, divY, col2X, divY),
    );

    const totalY = divY + 14;
    this.contentObjects.push(
      this.add.text(col1X, totalY, 'Total', {
        fontSize: '14px',
        color: '#aaaacc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5),
    );
    this.contentObjects.push(
      this.add.text(col2X, totalY, `+${breakdown.total} tj`, {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(1, 0.5),
    );

    return totalY + 10;
  }

  private _renderButton(width: number, y: number, socket: Socket): void {
    const goToLobby = () => {
      socket.disconnect();
      this.scene.start('LobbyScene');
    };

    const btn = this.add.text(width / 2, y, '[ JOGAR DE NOVO ]', {
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

    this.contentObjects.push(btn);
  }

  private _initFeira(data: PostGameData): void {
    const rebuild = () => {
      this._clearContent();
      this._build(this.scale.width, this.scale.height, data);
    };

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (res: google.accounts.id.CredentialResponse) => {
        const breakdown = this._feiraBreakdown;
        if (!breakdown) return;

        this._feiraStatus = 'pending';
        this._feiraMessage = 'Enviando crédito...';
        rebuild();

        axios
          .post(
            'https://feira-de-jogos.dev.br/api/v2/credit',
            { product: FEIRA_PRODUCT_ID, value: breakdown.total },
            { headers: { Authorization: `Bearer ${res.credential}` } },
          )
          .then(() => {
            this._feiraStatus = 'done';
            this._feiraMessage = `✓ +${breakdown.total} tijolinhos adicionados!`;
          })
          .catch(() => {
            this._feiraStatus = 'error';
            this._feiraMessage = 'Erro ao adicionar crédito :(';
          })
          .finally(rebuild);
      },
    });

    google.accounts.id.prompt();
  }
}
