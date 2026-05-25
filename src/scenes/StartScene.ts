import Phaser from 'phaser';

export class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  preload() {
    const { width, height } = this.scale;
    const barWidth = 320;
    const barX = width / 2 - barWidth / 2;
    const barY = height / 2 - 10;

    this.cameras.main.setBackgroundColor('#1a1a2e');

    const track = this.add.graphics().fillStyle(0x333355, 1).fillRect(barX, barY, barWidth, 20);
    const fill = this.add.graphics();
    const loadingText = this.add.text(width / 2, barY - 20, 'Carregando…', {
      fontSize: '14px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      fill.clear().fillStyle(0xe0e0ff, 1).fillRect(barX, barY, barWidth * value, 20);
    });

    this.load.once('complete', () => {
      this.load.off('progress');
      track.destroy();
      fill.destroy();
      loadingText.destroy();
    });
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.add.text(width / 2, height / 2 - 40, 'EXPELLED', {
      fontSize: '48px',
      color: '#e0e0ff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, 'CLIQUE PARA JOGAR', {
      fontSize: '14px',
      color: '#888888',
      letterSpacing: 4,
    }).setOrigin(0.5);

    const kb = this.input.keyboard;

    const startGame = () => {
      (this.sound as { context?: AudioContext }).context?.resume();
      this.input.off('pointerdown', startGame);
      if (kb) {
        kb.off('keydown-SPACE', startGame);
        kb.off('keydown-ENTER', startGame);
      }
      this.scene.start('LobbyScene');
    };

    this.input.on('pointerdown', startGame);
    if (kb) {
      kb.on('keydown-SPACE', startGame);
      kb.on('keydown-ENTER', startGame);
    }
  }
}
