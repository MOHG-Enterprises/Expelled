import Phaser from 'phaser';
import { SKILL_CHECK_WINDOW } from '../constants';

const GREAT_ZONE_RATIO  = 0.20;
const MIN_ZONE_START    = 0.15;
const MAX_ZONE_START    = 1 - 2 * SKILL_CHECK_WINDOW;

export class SkillCheck {
  active = false;
  private scene: Phaser.Scene;
  private startAngle = 0;
  private angle = 0;
  private totalRotation = 0;
  private readonly speed = 0.55;
  private zoneStart = 0;
  private container: Phaser.GameObjects.Container | null = null;
  private graphics: Phaser.GameObjects.Graphics | null = null;
  private onSuccess: ((isGreat: boolean) => void) | null = null;
  private onFail: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(onSuccess: (isGreat: boolean) => void, onFail: () => void) {
    this.active        = true;
    this.startAngle    = 0;
    this.angle         = this.startAngle;
    this.totalRotation = 0;
    this.onSuccess     = onSuccess;
    this.onFail        = onFail;
    this.zoneStart     = MIN_ZONE_START + Math.random() * (MAX_ZONE_START - MIN_ZONE_START);

    if (!this.container) {
      const cx = this.scene.scale.width  / 2;
      const cy = this.scene.scale.height / 2;
      this.container = this.scene.add.container(cx, cy)
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

    const inSuccess =
      this.angle >= this.zoneStart &&
      this.angle <= this.zoneStart + SKILL_CHECK_WINDOW;

    const inGreat =
      this.angle >= this.zoneStart &&
      this.angle <= this.zoneStart + SKILL_CHECK_WINDOW * GREAT_ZONE_RATIO;

    if (inGreat) this.showGreatFeedback();
    this.hide();

    if (inSuccess) this.onSuccess?.(inGreat);
    else           this.onFail?.();
  }

  private showGreatFeedback() {
    const cx = this.scene.scale.width  / 2;
    const cy = this.scene.scale.height / 2;
    const text = this.scene.add
      .text(cx, cy - 35, 'GREAT!', {
        fontSize: '30px',
        fontStyle: 'bold',
        color: '#ffee00',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(45)
      .setScale(0.6);

    this.scene.tweens.add({
      targets: text,
      y: cy - 95,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 750,
      ease: 'Cubic.Out',
      onComplete: () => text.destroy(),
    });

    this.scene.cameras.main.flash(180, 255, 220, 0, true);
  }

  cancel() {
    if (!this.active) return;
    this.hide();
    this.onFail?.();
  }

  update(delta: number) {
    if (!this.active || !this.graphics) return;
    this.container?.setPosition(
      this.scene.scale.width  / 2,
      this.scene.scale.height / 2,
    );
    const step = this.speed * (delta / 1000);
    this.totalRotation += step;

    if (this.totalRotation >= 1.0) {
      this.hide();
      this.onFail?.();
      return;
    }

    this.angle = (this.startAngle + this.totalRotation) % 1;

    const R = 50;
    const g = this.graphics;
    g.clear();

    g.fillStyle(0x000000, 0.6);
    g.fillCircle(0, 0, R + 8);

    g.lineStyle(4, 0x444444, 0.8);
    g.strokeCircle(0, 0, R);

    const startA = this.zoneStart * Math.PI * 2 - Math.PI / 2;
    const endA   = (this.zoneStart + SKILL_CHECK_WINDOW) * Math.PI * 2 - Math.PI / 2;
    g.lineStyle(6, 0x00e676, 1);
    g.beginPath();
    g.arc(0, 0, R, startA, endA, false);
    g.strokePath();

    const greatEndA = (this.zoneStart + SKILL_CHECK_WINDOW * GREAT_ZONE_RATIO) * Math.PI * 2 - Math.PI / 2;
    g.lineStyle(6, 0xffee00, 1);
    g.beginPath();
    g.arc(0, 0, R, startA, greatEndA, false);
    g.strokePath();

    const pA = this.angle * Math.PI * 2 - Math.PI / 2;
    g.lineStyle(3, 0xffffff, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(pA) * (R + 8), Math.sin(pA) * (R + 8));
    g.strokePath();
  }
}