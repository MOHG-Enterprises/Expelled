import Phaser from 'phaser';

export class InteractionPromptManager {
  private scene:      Phaser.Scene;
  private outline:    Phaser.GameObjects.Graphics;
  private prompt:     Phaser.GameObjects.Text;
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private visible     = false;

  constructor(scene: Phaser.Scene) {
    this.scene   = scene;
    this.outline = scene.add.graphics().setDepth(10).setVisible(false);
    this.prompt  = scene.add
      .text(0, 0, '', {
        fontSize:        '11px',
        color:           '#ffffff',
        backgroundColor: '#00000099',
        padding:         { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(10)
      .setVisible(false);
  }

  show(x: number, y: number, w: number, h: number, label: string, usingGamepad: boolean, color = 0xffffff) {
    const key = usingGamepad ? 'Ⓐ' : '[E]';
    this.prompt.setText(`${key} ${label}`);
    this.prompt.setPosition(x, y - h / 2 - 4);
    this.prompt.setVisible(true);

    this.outline.clear();
    this.outline.lineStyle(2, color, 1);
    this.outline.strokeRect(x - w / 2, y - h / 2, w, h);
    this.outline.setVisible(true);

    if (!this.pulseTween || !this.pulseTween.isPlaying()) {
      this.pulseTween = this.scene.tweens.add({
        targets:  this.outline,
        alpha:    0.4,
        duration: 600,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
    }
    this.visible = true;
  }

  hide() {
    if (!this.visible) return;
    this.outline.setVisible(false);
    this.prompt.setVisible(false);
    this.pulseTween?.stop();
    this.pulseTween = null;
    this.outline.setAlpha(1);
    this.visible = false;
  }

  destroy() {
    this.pulseTween?.stop();
    this.outline.destroy();
    this.prompt.destroy();
  }
}
