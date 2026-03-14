import Phaser from 'phaser';
import { COLOR_OTHER_SURVIVOR, COLOR_OTHER_PROF, INTERACT_RADIUS } from '../constants';
import type { PlayerState } from '../types';

export class PlayerManager {
  private scene:  Phaser.Scene;
  // lista dos outros players (menos o local)
  private others: Record<string, Phaser.GameObjects.Rectangle> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getOrCreate(id: string, data: Partial<PlayerState>): Phaser.GameObjects.Rectangle {
    // cria o boneco remoto se ainda n existir
    if (!this.others[id]) {
      const color = data.role === 'professor' ? COLOR_OTHER_PROF : COLOR_OTHER_SURVIVOR;
      this.others[id] = this.scene.add
        .rectangle(data.x ?? 100, data.y ?? 100, 16, 16, color)
        .setDepth(5);
    }
    return this.others[id];
  }

  move(id: string, x: number, y: number) {
    // garante q existe e move
    this.getOrCreate(id, { x, y }).setPosition(x, y);
  }

  remove(id: string) {
    // remove quando player sai
    this.others[id]?.destroy();
    delete this.others[id];
  }

  setAlpha(id: string, alpha: number) {
    this.others[id]?.setAlpha(alpha);
  }

  setVisible(id: string, visible: boolean) {
    this.others[id]?.setVisible(visible);
  }

  nearestSurvivor(x: number, y: number): string | null {
    // pega o survivor mais perto dentro do range de interacao
    let best: string | null = null;
    let bestDist = Infinity;
    Object.keys(this.others).forEach((id) => {
      const p = this.others[id];
      const d = Phaser.Math.Distance.Between(x, y, p.x, p.y);
      if (d < INTERACT_RADIUS && d < bestDist) { best = id; bestDist = d; }
    });
    return best;
  }
}
