import Phaser from 'phaser';

const ICON_SIZE = 52;
const BAR_W     = 56;
const BAR_H     = 8;

export interface PowerMeterState {
  ratio:  number;   // 0 = recém usado, 1 = recarregado/pronto
  active: boolean;  // poder em uso neste momento
  ready:  boolean;  // pronto para usar
}

// Ícone do super poder + barra de carregamento no canto lateral esquerdo.
export class PowerMeter {
  private scene: Phaser.Scene;
  private icon:  Phaser.GameObjects.Image;
  private barBg: Phaser.GameObjects.Graphics;
  private bar:   Phaser.GameObjects.Graphics;
  private hint:  Phaser.GameObjects.Text;
  private x = 0;
  private y = 0;

  constructor(scene: Phaser.Scene, iconKey: string) {
    this.scene = scene;
    this.icon  = scene.add.image(0, 0, iconKey)
      .setOrigin(0, 0)
      .setDisplaySize(ICON_SIZE, ICON_SIZE)
      .setScrollFactor(0).setDepth(31);
    this.barBg = scene.add.graphics().setScrollFactor(0).setDepth(31);
    this.bar   = scene.add.graphics().setScrollFactor(0).setDepth(32);
    this.hint  = scene.add.text(0, 0, '[E]', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(32);
    this.setVisible(false);
    this.reposition(scene.scale.width, scene.scale.height);
  }

  reposition(_w: number, h: number): void {
    this.x = 16;
    this.y = h / 2 - (ICON_SIZE + BAR_H + 6) / 2;
    this.icon.setPosition(this.x, this.y);
    this.hint.setPosition(this.x + ICON_SIZE + 6, this.y + 2);
  }

  setVisible(v: boolean): void {
    this.icon.setVisible(v);
    this.barBg.setVisible(v);
    this.bar.setVisible(v);
    this.hint.setVisible(v);
  }

  setState(s: PowerMeterState): void {
    const barX = this.x;
    const barY = this.y + ICON_SIZE + 6;
    const r    = BAR_H / 2;

    this.barBg.clear();
    this.barBg.fillStyle(0x000000, 0.7);
    this.barBg.fillRoundedRect(barX, barY, BAR_W, BAR_H, r);
    this.barBg.lineStyle(1, 0x222222, 0.9);
    this.barBg.strokeRoundedRect(barX, barY, BAR_W, BAR_H, r);

    const fillW = Math.max(0, Math.min(1, s.ratio)) * BAR_W;
    const color = s.active ? 0xffaa00 : s.ready ? 0x00e676 : 0xffcc00;
    this.bar.clear();
    if (fillW > 0) {
      this.bar.fillStyle(color, 0.95);
      this.bar.fillRoundedRect(barX, barY, Math.max(fillW, r * 2), BAR_H, r);
    }

    if (s.active) {
      const flash = Math.floor(Date.now() / 150) % 2 === 0;
      this.icon.setTint(0xffd070).setAlpha(flash ? 1 : 0.7);
      this.hint.setText('ATIVO').setColor('#ffaa00').setVisible(true);
    } else if (s.ready) {
      this.icon.clearTint().setAlpha(1);
      this.hint.setText('[E]').setColor('#00e676').setVisible(true);
    } else {
      this.icon.clearTint().setAlpha(0.4);
      this.hint.setVisible(false);
    }
  }

  destroy(): void {
    this.icon.destroy();
    this.barBg.destroy();
    this.bar.destroy();
    this.hint.destroy();
  }
}
