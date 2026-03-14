import Phaser from 'phaser';
import { COLOR_TERMINAL_IDLE, COLOR_TERMINAL_DONE, INTERACT_RADIUS } from '../constants';
import type { TerminalId, Vec2 } from '../types';

interface TerminalObj {
  rect: Phaser.GameObjects.Rectangle;
  bar:  Phaser.GameObjects.Rectangle;
}

export class TerminalManager {
  // marcador do portao
  gateMarker: Phaser.GameObjects.Rectangle | null = null;

  private scene:     Phaser.Scene;
  private objects:   Partial<Record<TerminalId, TerminalObj>> = {};
  private positions: Partial<Record<TerminalId, Vec2>>        = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  sync(terminals: Record<string, number>, positions: Record<string, Vec2>) {
    // salva posicao dos terminais pra usar na interacao
    this.positions = positions as Record<TerminalId, Vec2>;

    (Object.keys(terminals) as TerminalId[]).forEach((id) => {
      const pos = this.positions[id];
      if (!pos) return;

      if (!this.objects[id]) {
        // cria terminal + barrinha + nome
        const rect = this.scene.add
          .rectangle(pos.x, pos.y, 20, 20, COLOR_TERMINAL_IDLE)
          .setDepth(2);
        const bar = this.scene.add
          .rectangle(pos.x - 10, pos.y + 14, 0, 4, 0x00e676)
          .setDepth(3)
          .setOrigin(0, 0.5);
        this.scene.add
          .text(pos.x, pos.y - 16, id, { fontSize: '10px', color: '#ccc' })
          .setOrigin(0.5)
          .setDepth(3);
        this.objects[id] = { rect, bar };
      }

      this.setProgress(id, terminals[id]);
    });

    if (!this.gateMarker) {
      // cria o marcador da saida so uma vez
      this.gateMarker = this.scene.add
        .rectangle(740, 560, 24, 24, 0x888888)
        .setDepth(2);
      this.scene.add
        .text(740, 542, 'SAÍDA', { fontSize: '10px', color: '#ccc' })
        .setOrigin(0.5)
        .setDepth(3);
    }
  }

  setProgress(id: TerminalId | string, progress: number) {
    const t = this.objects[id as TerminalId];
    if (!t) return;
    t.bar.width = (progress / 100) * 20;
    if (progress >= 100) t.rect.setFillStyle(COLOR_TERMINAL_DONE);
  }

  nearest(x: number, y: number): TerminalId | null {
    let best: TerminalId | null = null;
    let bestDist = Infinity;
    (Object.keys(this.objects) as TerminalId[]).forEach((id) => {
      const pos = this.positions[id];
      if (!pos) return;
      const d = Phaser.Math.Distance.Between(x, y, pos.x, pos.y);
      if (d < INTERACT_RADIUS && d < bestDist) { best = id; bestDist = d; }
    });
    return best;
  }

  flashAlert(id: string, tweens: Phaser.Tweens.TweenManager) {
    const t = this.objects[id as TerminalId];
    // pisca quando da alerta de firewall
    if (t) tweens.add({ targets: t.rect, alpha: 0, yoyo: true, repeat: 3, duration: 120 });
  }

  unlockGate() {
    this.gateMarker?.setFillStyle(0x00e676);
  }
}
