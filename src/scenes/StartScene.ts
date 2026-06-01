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

    this.load.spritesheet('firstScreen', 'screen/firstScreen.png', {
      frameWidth: 1150,
      frameHeight: 640,
    });

    this.load.spritesheet('botaoPlay', 'screen/botaoPlay.png', {
      frameWidth: 120,
      frameHeight: 50,
    });
  }

  create() {
    const { width, height } = this.scale;

    this.anims.create({
      key: 'firstScreen_play',
      frames: this.anims.generateFrameNumbers('firstScreen', { start: 0, end: 17 }),
      frameRate: 8,
      repeat: 0,
    });

    const sprite = this.add.sprite(width / 2, height / 2, 'firstScreen');
    const scale = Math.max(width / 1150, height / 640);
    sprite.setScale(scale);
    sprite.play('firstScreen_play');

    const button = this.add.image(width / 2, height / 2 + 20, 'botaoPlay', 0);
    button.setScale(1.5);
    button.setVisible(false);
    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setFrame(1));
    button.on('pointerout', () => button.setFrame(0));

    const startGame = () => {
      (this.sound as { context?: AudioContext }).context?.resume();
      this.scene.start('LobbyScene');
    };

    button.on('pointerdown', startGame);

    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      button.setVisible(true);
    });
  }
}
