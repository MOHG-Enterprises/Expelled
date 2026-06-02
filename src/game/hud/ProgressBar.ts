import Phaser from 'phaser';

export interface ProgressBarConfig {
  x:           number;
  y:           number;
  w:           number;
  h:           number;
  depth:       number;
  bgColor:     number;
  borderColor: number;
  fillColor:   number;
  label?:      string;
  labelColor?: string;
  labelY?:     number;
  pctY?:       number;
}

export class ProgressBar {
  private scene: Phaser.Scene;
  private cfg:   ProgressBarConfig;

  private graphic: Phaser.GameObjects.Graphics;
  private labelText: Phaser.GameObjects.Text | null  = null;
  private pctText:   Phaser.GameObjects.Text | null  = null;

  private lastProgress: number | null = null;

  constructor(scene: Phaser.Scene, cfg: ProgressBarConfig) {
    this.scene   = scene;
    this.cfg     = cfg;

    this.graphic = scene.add.graphics().setScrollFactor(0).setDepth(cfg.depth).setAlpha(0);

    if (cfg.label) {
      const labelY = cfg.labelY ?? cfg.y - 18;
      this.labelText = scene.add
        .text(cfg.x + cfg.w / 2, labelY, cfg.label, {
          fontSize: '11px',
          color:    cfg.labelColor ?? '#ffffff',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(cfg.depth + 1)
        .setAlpha(0);

      this.pctText = scene.add
        .text(cfg.x + cfg.w / 2, cfg.pctY ?? cfg.y + cfg.h + 2, '', {
          fontSize: '10px',
          color:    cfg.labelColor ?? '#ffffff',
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(cfg.depth + 2)
        .setAlpha(0);
    }
  }

  setProgress(progress: number | null) {
    if (progress === this.lastProgress) return;
    this.lastProgress = progress;

    if (progress === null) {
      this.graphic.setAlpha(0);
      this.labelText?.setAlpha(0);
      this.pctText?.setAlpha(0);
      return;
    }

    const { x, y, w, h, bgColor, borderColor, fillColor } = this.cfg;
    const r    = h / 2;
    const fill = Math.min(1, progress / 100) * w;

    this.graphic.clear();

    this.graphic.fillStyle(bgColor, 0.90);
    this.graphic.fillRoundedRect(x, y, w, h, r);
    this.graphic.lineStyle(1, borderColor, 0.85);
    this.graphic.strokeRoundedRect(x, y, w, h, r);

    if (fill > 0) {
      this.graphic.fillStyle(fillColor, 0.95);
      this.graphic.fillRoundedRect(x, y, Math.max(fill, r * 2), h, r);
      this.graphic.fillStyle(0xffffff, 0.18);
      this.graphic.fillRoundedRect(x + 2, y + 2, Math.max(fill - 4, 0), Math.floor(h / 2) - 2, r - 1);
    }

    this.graphic.setAlpha(1);
    if (this.labelText) {
      this.labelText.setAlpha(1);
      this.pctText?.setText(`${Math.round(progress)}%`).setAlpha(1);
    }
  }

  reposition(x: number, y: number, labelY?: number, pctY?: number): void {
    this.cfg.x = x;
    this.cfg.y = y;
    if (labelY !== undefined) this.cfg.labelY = labelY;
    if (pctY !== undefined) this.cfg.pctY = pctY;
    this.labelText?.setPosition(x + this.cfg.w / 2, this.cfg.labelY ?? y - 18);
    this.pctText?.setPosition(x + this.cfg.w / 2, this.cfg.pctY ?? y + this.cfg.h + 2);
    if (this.lastProgress !== null) {
      const p = this.lastProgress;
      this.lastProgress = null;
      this.setProgress(p);
    }
  }

  setAlpha(a: number) {
    this.graphic.setAlpha(a);
    this.labelText?.setAlpha(a);
    this.pctText?.setAlpha(a);
    if (a === 0) this.lastProgress = null;
  }
}
