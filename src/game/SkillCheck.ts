import Phaser from 'phaser';
import { SKILL_CHECK_WINDOW } from '../constants';

export class SkillCheck {
  active = false;

  private scene: Phaser.Scene;
  private angle = 0;
  private readonly speed = 0.55; // giro por segundo
  private zoneStart = 0;
  private container: Phaser.GameObjects.Container | null = null;
  private graphics: Phaser.GameObjects.Graphics | null = null;
  private onSuccess: (() => void) | null = null;
  private onFail: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(onSuccess: () => void, onFail: () => void) {
    this.active     = true;
    this.angle      = 0;
    this.onSuccess  = onSuccess;
    this.onFail     = onFail;
    this.zoneStart  = Math.random() * (1 - SKILL_CHECK_WINDOW);

    if (!this.container) {
      this.container = this.scene.add.container(400, 300)
        .setDepth(40)
        .setScrollFactor(0);

      this.graphics = this.scene.add.graphics();
      this.container.add(this.graphics);

      const label = this.scene.add
        .text(0, -70, 'SPACE !', { fontSize: '14px', color: '#fff', align: 'center' })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.container.add(label);
    }

    this.container.setVisible(true);
  }

  hide() {
    this.active = false;
    this.container?.setVisible(false);
  }

  tryHit() {
    if (!this.active) return;
    const hit =
      this.angle >= this.zoneStart &&
      this.angle <= this.zoneStart + SKILL_CHECK_WINDOW;
    this.hide();
    if (hit) this.onSuccess?.();
    else     this.onFail?.();
  }

  update(delta: number) {
    if (!this.active || !this.graphics) return;

    this.angle = (this.angle + this.speed * (delta / 1000)) % 1;

    const R = 50;
    const g = this.graphics;
    g.clear();

    // circulo base do minigame
    g.lineStyle(4, 0x444444, 0.8);
    g.strokeCircle(0, 0, R);

    // area verde q conta como hit
    const startA = this.zoneStart * Math.PI * 2 - Math.PI / 2;
    const endA   = (this.zoneStart + SKILL_CHECK_WINDOW) * Math.PI * 2 - Math.PI / 2;
    g.lineStyle(6, 0x00e676, 1);
    g.beginPath();
    g.arc(0, 0, R, startA, endA, false);
    g.strokePath();

    // ponteiro girando no tempo
    const pA = this.angle * Math.PI * 2 - Math.PI / 2;
    g.lineStyle(3, 0xffffff, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(pA) * (R + 8), Math.sin(pA) * (R + 8));
    g.strokePath();
  }
}
