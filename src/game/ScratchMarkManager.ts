import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import type { MoveDirection } from './playerSkins';

const FRAME_SIZE        = 16;
const DISPLAY_SIZE      = 40;
const SPAWN_DIST        = 22;  // px behind player
const SPAWN_SPREAD      = 11;  // px perpendicular spread between the pair

const FADE_IN_MS        = 1000;
const HOLD_MS           = 3000;
const FADE_OUT_MS       = 1000;
const TOTAL_MS          = FADE_IN_MS + HOLD_MS + FADE_OUT_MS;

// Frame layout (0-indexed): right×2, down×2, left×2, up×2, neutral×1
const DIR_FRAMES: Record<MoveDirection, [number, number]> = {
  right: [0, 1],
  down:  [2, 3],
  left:  [4, 5],
  up:    [6, 7],
};

function pairOffsets(dir: MoveDirection): [{ dx: number; dy: number }, { dx: number; dy: number }] {
  switch (dir) {
    case 'right': return [{ dx: -SPAWN_DIST, dy: -SPAWN_SPREAD }, { dx: -SPAWN_DIST, dy: SPAWN_SPREAD }];
    case 'left':  return [{ dx:  SPAWN_DIST, dy: -SPAWN_SPREAD }, { dx:  SPAWN_DIST, dy: SPAWN_SPREAD }];
    case 'down':  return [{ dx: -SPAWN_SPREAD, dy: -SPAWN_DIST }, { dx: SPAWN_SPREAD, dy: -SPAWN_DIST }];
    case 'up':    return [{ dx: -SPAWN_SPREAD, dy:  SPAWN_DIST }, { dx: SPAWN_SPREAD, dy:  SPAWN_DIST }];
  }
}

interface Mark {
  image: Phaser.GameObjects.Image;
  elapsed: number;
}

export class ScratchMarkManager {
  static readonly TEXTURE_KEY       = 'scratch-marks';
  static readonly SPAWN_INTERVAL_MS = 300;

  private scene: Phaser.Scene;
  private pool: Mark[] = [];
  private spawnTimer = 0;

  static preload(scene: Phaser.Scene) {
    scene.load.spritesheet(ScratchMarkManager.TEXTURE_KEY, './scratchMarks.png', {
      frameWidth:  FRAME_SIZE,
      frameHeight: FRAME_SIZE,
    });
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawn(x: number, y: number, direction: MoveDirection) {
    const frames  = DIR_FRAMES[direction];
    const offsets = pairOffsets(direction);

    offsets.forEach(({ dx, dy }, i) => {
      const img = this.scene.add.image(x + dx, y + dy, ScratchMarkManager.TEXTURE_KEY, frames[i])
        .setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE)
        .setAlpha(0)
        .setDepth(2);
      this.pool.push({ image: img, elapsed: 0 });
    });
  }

  resetTimer() {
    this.spawnTimer = 0;
  }

  tickEmit(
    socket: Socket,
    px: number, py: number,
    facing: MoveDirection,
    delta: number,
    sprinting: boolean,
    intendedToMove: boolean,
    selfVisible: boolean,
  ) {
    if (!sprinting || !intendedToMove) {
      this.spawnTimer = 0;
      return;
    }
    this.spawnTimer += delta;
    if (this.spawnTimer >= ScratchMarkManager.SPAWN_INTERVAL_MS) {
      this.spawnTimer = 0;
      socket.emit('scratchMark', { x: px, y: py, direction: facing });
      if (selfVisible) this.spawn(px, py, facing);
    }
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
