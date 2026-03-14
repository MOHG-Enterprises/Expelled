import Phaser from 'phaser';
import { STAMINA_MAX } from '../constants';

// barra de vigor la embaixo da tela (so survivor usa)
export class StaminaBar {
  private scene:  Phaser.Scene;
  private bg:     Phaser.GameObjects.Rectangle | null = null;
  private fill:   Phaser.GameObjects.Rectangle | null = null;
  private label:  Phaser.GameObjects.Text      | null = null;
  private visible = false;

  private static readonly W = 160;
  private static readonly H = 10;
  private static readonly X = 400 - StaminaBar.W / 2; // centralizado na tela
  private static readonly Y = 590;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build() {
    const { X, Y, W, H } = StaminaBar;
    this.bg    = this.scene.add.rectangle(X, Y, W, H, 0x333333).setOrigin(0, 0).setScrollFactor(0).setDepth(31);
    this.fill  = this.scene.add.rectangle(X, Y, W, H, 0x4fc3f7).setOrigin(0, 0).setScrollFactor(0).setDepth(32);
    this.label = this.scene.add.text(X + W / 2, Y - 12, 'VIGOR', { fontSize: '10px', color: '#aaa' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(32);
    this.setVisible(false);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.bg?.setVisible(v);
    this.fill?.setVisible(v);
    this.label?.setVisible(v);
  }

  update(stamina: number) {
    if (!this.fill || !this.visible) return;
    const ratio = Math.max(0, Math.min(1, stamina / STAMINA_MAX));
    this.fill.width = StaminaBar.W * ratio;
    // vai mudando de cor conforme o vigor vai acabando
    const color = ratio > 0.5 ? 0x4fc3f7 : ratio > 0.25 ? 0xffaa00 : 0xff4444;
    this.fill.setFillStyle(color);
  }
}
