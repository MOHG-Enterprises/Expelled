import Phaser from 'phaser';
import type { MoveDirection } from './playerSkins';

const FRAME_SIZE   = 16;
const DISPLAY_SIZE = 32;

const FADE_IN_MS   = 2000;
const HOLD_MS      = 8000;
const FADE_OUT_MS  = 2000;
const TOTAL_MS     = FADE_IN_MS + HOLD_MS + FADE_OUT_MS; // 30s

// Frame groups (4×3 spritesheet, left-to-right top-to-bottom)
// Row 0: 0=down-a  1=down-b  2=lr-a   3=lr-b
// Row 1: 4=up-a    5=up-b    6=big-TL 7=big-TR
// Row 2: 8=big-BL  9=big-BR  10=sm-a  11=sm-b

const DROP_FRAMES: Record<MoveDirection, [number, number]> = {
  down:  [0, 1],
  left:  [2, 3],
  right: [2, 3],
  up:    [4, 5],
};
const SMALL_POOL_FRAMES = [10, 11] as const;

// Big pool quadrant offsets — each tile is DISPLAY_SIZE px; the 4 tiles form a 2×2 grid centered on player
const BIG_POOL_HALF = DISPLAY_SIZE / 2;
const BIG_POOL_QUADS: { frame: number; dx: number; dy: number }[] = [
  { frame: 6, dx: -BIG_POOL_HALF, dy: -BIG_POOL_HALF }, // TL
  { frame: 7, dx:  BIG_POOL_HALF, dy: -BIG_POOL_HALF }, // TR
  { frame: 8, dx: -BIG_POOL_HALF, dy:  BIG_POOL_HALF }, // BL
  { frame: 9, dx:  BIG_POOL_HALF, dy:  BIG_POOL_HALF }, // BR
];

interface Mark {
  image: Phaser.GameObjects.Image;
  elapsed: number;
}

export class BloodPoolManager {
  static readonly TEXTURE_KEY      = 'blood-marks';
  static readonly DROP_INTERVAL_MS = 500;

  private scene: Phaser.Scene;
  private pool: Mark[] = [];

  static preload(scene: Phaser.Scene) {
    scene.load.spritesheet(BloodPoolManager.TEXTURE_KEY, '/blood.png', {
      frameWidth:  FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
  }

  static dropFrameFor(dir: MoveDirection): number {
    const pair = DROP_FRAMES[dir];
    return pair[Math.random() < 0.5 ? 0 : 1];
  }

  static smallPoolFrame(): number {
    return SMALL_POOL_FRAMES[Math.random() < 0.5 ? 0 : 1];
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private addMark(x: number, y: number, frame: number) {
    const img = this.scene.add.image(x, y, BloodPoolManager.TEXTURE_KEY, frame)
      .setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE)
      .setAlpha(0)
      .setDepth(2);
    this.pool.push({ image: img, elapsed: 0 });
  }

  spawn(x: number, y: number, frame: number) {
    this.addMark(x, y, frame);
  }

  spawnBigPool(x: number, y: number) {
    BIG_POOL_QUADS.forEach(({ frame, dx, dy }) => this.addMark(x + dx, y + dy, frame));
  }

  update(delta: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const m = this.pool[i];
      m.elapsed += delta;

      if (m.elapsed >= TOTAL_MS) {
        m.image.destroy();
        this.pool.splice(i, 1);
        continue;
      }

      if (m.elapsed < FADE_IN_MS) {
        m.image.setAlpha(m.elapsed / FADE_IN_MS);
      } else if (m.elapsed < FADE_IN_MS + HOLD_MS) {
        m.image.setAlpha(1);
      } else {
        m.image.setAlpha((TOTAL_MS - m.elapsed) / FADE_OUT_MS);
      }
    }
  }

  clear() {
    this.pool.forEach(m => m.image.destroy());
    this.pool = [];
  }
}
