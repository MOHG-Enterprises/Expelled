import Phaser from 'phaser';
import { COLOR_TERMINAL_DONE, INTERACT_RADIUS } from '../constants';
import type { TerminalId, Vec2 } from '../types';

interface TerminalObj {
  sprite: Phaser.GameObjects.Sprite;
  bar:    Phaser.GameObjects.Rectangle;
  label:  Phaser.GameObjects.Text;
}

export class TerminalManager {
  private static readonly FRAME_WORK_END = 7;
  private static readonly FRAME_FAIL = 8;
  private static readonly FRAME_DONE = 9;

  private static readonly BAR_COLOR_NORMAL     = 0x00e676;
  private static readonly BAR_COLOR_REGRESSING = 0xff6600;
  private static readonly BAR_COLOR_LOCKED     = 0xffcc00;
  private static readonly AURA_RADIUS          = 22;

  private scene:         Phaser.Scene;
  private objects:       Partial<Record<TerminalId, TerminalObj>> = {};
  private positions:     Partial<Record<TerminalId, Vec2>>        = {};
  private progressCache: Partial<Record<TerminalId, number>>      = {};
  private completed        = new Set<TerminalId>();
  private failingTerminals = new Set<TerminalId>();
  private regressingTerminals = new Set<TerminalId>();
  private hiddenTerminals  = new Set<TerminalId>();

  private auraGraphics: Phaser.GameObjects.Graphics | null = null;
  private auraTween:    Phaser.Tweens.Tween | null = null;
  private auraActive   = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private setTerminalFrame(id: TerminalId, frame: number) {
    this.objects[id]?.sprite.setFrame(frame);
  }

  private frameForProgress(progress: number): number {
    if (progress >= 100) return TerminalManager.FRAME_DONE;
    return Math.min(Math.floor(progress / (100 / 8)), TerminalManager.FRAME_WORK_END);
  }

  setWorking(_id: TerminalId | null) {}

  setRegressing(id: TerminalId | string, isRegressing: boolean) {
    const terminalId = id as TerminalId;
    if (this.completed.has(terminalId)) return;
    const t = this.objects[terminalId];
    if (isRegressing) {
      this.regressingTerminals.add(terminalId);
      this.setTerminalFrame(terminalId, TerminalManager.FRAME_FAIL);
      t?.bar.setFillStyle(TerminalManager.BAR_COLOR_REGRESSING);
    } else {
      this.regressingTerminals.delete(terminalId);
      const progress = this.progressCache[terminalId] ?? 0;
      this.setTerminalFrame(terminalId, this.frameForProgress(progress));
      t?.bar.setFillStyle(TerminalManager.BAR_COLOR_NORMAL);
    }
  }

  setLocked(id: TerminalId | string, durationMs: number) {
    const terminalId = id as TerminalId;
    const t = this.objects[terminalId];
    if (!t || this.completed.has(terminalId)) return;
    t.bar.setFillStyle(TerminalManager.BAR_COLOR_LOCKED);
    this.scene.time.delayedCall(durationMs, () => {
      if (this.completed.has(terminalId)) return;
      const isRegressing = this.regressingTerminals.has(terminalId);
      t.bar.setFillStyle(isRegressing ? TerminalManager.BAR_COLOR_REGRESSING : TerminalManager.BAR_COLOR_NORMAL);
    });
  }

  setFailed(id: TerminalId | string, durationMs = 1100) {
    const terminalId = id as TerminalId;
    if (!this.objects[terminalId] || this.completed.has(terminalId)) return;
    this.failingTerminals.add(terminalId);
    this.setTerminalFrame(terminalId, TerminalManager.FRAME_FAIL);
    this.scene.time.delayedCall(durationMs, () => {
      this.failingTerminals.delete(terminalId);
      if (this.completed.has(terminalId)) return;
      const progress = this.progressCache[terminalId] ?? 0;
      this.setTerminalFrame(terminalId, this.frameForProgress(progress));
    });
  }

  update(_delta: number) {}

  sync(
    terminals: Partial<Record<TerminalId, { progress: number }>>,
    positions: Partial<Record<TerminalId, Vec2>>,
  ) {
    this.positions = positions;

    (Object.keys(terminals) as TerminalId[]).forEach((id) => {
      const pos = this.positions[id];
      const t   = terminals[id];
      if (!pos || !t) return;

      if (!this.objects[id]) {
        const sprite = this.scene.add
          .sprite(pos.x, pos.y, 'computer-terminal-sheet', 0)
          .setScale(2, 2)
          .setDepth(2);
        sprite.setFrame(0);

        const bar = this.scene.add
          .rectangle(pos.x - 16, pos.y + 20, 0, 5, 0x00e676)
          .setDepth(3)
          .setOrigin(0, 0.5);
        const label = this.scene.add
          .text(pos.x, pos.y - 24, id, { fontSize: '10px', color: '#ccc' })
          .setOrigin(0.5)
          .setDepth(3);
        this.objects[id] = { sprite, bar, label };
      }

      this.setProgress(id, t.progress);
    });
  }

  setProgress(id: TerminalId | string, progress: number) {
    const terminalId = id as TerminalId;
    const t = this.objects[terminalId];
    if (!t) return;
    this.progressCache[terminalId] = progress;
    t.bar.width = (progress / 100) * 32;
    if (progress >= 100) {
      this.completed.add(terminalId);
      this.regressingTerminals.delete(terminalId);
      this.setTerminalFrame(terminalId, TerminalManager.FRAME_DONE);
      t.sprite.setTint(COLOR_TERMINAL_DONE);
      if (this.auraActive) this._redrawAura();
    } else {
      this.completed.delete(terminalId);
      t.sprite.clearTint();
      if (!this.failingTerminals.has(terminalId) && !this.regressingTerminals.has(terminalId)) {
        this.setTerminalFrame(terminalId, this.frameForProgress(progress));
      }
      t.bar.setFillStyle(
        this.regressingTerminals.has(terminalId)
          ? TerminalManager.BAR_COLOR_REGRESSING
          : TerminalManager.BAR_COLOR_NORMAL,
      );
      if (this.auraActive) this._redrawAura();
    }
  }

  getProgress(id: TerminalId): number {
    return this.progressCache[id] ?? 0;
  }

  getCount(): { done: number; total: number } {
    const total = (Object.keys(this.objects) as TerminalId[])
      .filter((id) => !this.hiddenTerminals.has(id)).length;
    return { done: this.completed.size, total };
  }

  getPositions(): Readonly<Partial<Record<TerminalId, Vec2>>> {
    if (this.hiddenTerminals.size === 0) return this.positions;
    const out: Partial<Record<TerminalId, Vec2>> = {};
    (Object.keys(this.positions) as TerminalId[]).forEach((id) => {
      if (!this.hiddenTerminals.has(id)) out[id] = this.positions[id];
    });
    return out;
  }

  getCompleted(): ReadonlySet<TerminalId> {
    return this.completed;
  }

  isRegressing(id: TerminalId): boolean {
    return this.regressingTerminals.has(id);
  }

  nearest(x: number, y: number): TerminalId | null {
    let best: TerminalId | null = null;
    let bestDist = Infinity;
    (Object.keys(this.objects) as TerminalId[]).forEach((id) => {
      if (this.completed.has(id) || this.hiddenTerminals.has(id)) return;
      const pos = this.positions[id];
      if (!pos) return;
      const d = Phaser.Math.Distance.Between(x, y, pos.x, pos.y);
      if (d < INTERACT_RADIUS && d < bestDist) { best = id; bestDist = d; }
    });
    return best;
  }

  setAuraMode(active: boolean) {
    this.auraActive = active;
    if (!active) {
      this.auraTween?.stop();
      this.auraTween = null;
      this.auraGraphics?.destroy();
      this.auraGraphics = null;
      return;
    }
    if (!this.auraGraphics) {
      this.auraGraphics = this.scene.add.graphics().setDepth(1);
    }
    this._redrawAura();
    this.auraGraphics.setAlpha(1);
    this.auraTween?.stop();
    this.auraTween = this.scene.tweens.add({
      targets:  this.auraGraphics,
      alpha:    0.4,
      duration: 900,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }

  private _redrawAura() {
    if (!this.auraGraphics) return;
    this.auraGraphics.clear();
    this.auraGraphics.lineStyle(3, 0xffcc00, 1);
    (Object.keys(this.positions) as TerminalId[]).forEach((id) => {
      if (this.completed.has(id) || this.hiddenTerminals.has(id)) return;
      const pos = this.positions[id];
      if (!pos) return;
      this.auraGraphics!.strokeCircle(pos.x, pos.y, TerminalManager.AURA_RADIUS);
    });
  }

  flashAlert(id: string, tweens: Phaser.Tweens.TweenManager) {
    const terminalId = id as TerminalId;
    const t = this.objects[terminalId];
    // pisca quando da alerta de firewall
    if (t) tweens.add({ targets: t.sprite, alpha: 0, yoyo: true, repeat: 3, duration: 120 });
  }

  blockAll() {
    (Object.keys(this.objects) as TerminalId[]).forEach((id) => {
      const t = this.objects[id];
      if (!t || this.completed.has(id)) return;
      t.bar.setFillStyle(0x333333);
      t.sprite.setTint(0x555555);
    });
  }

  hideIncomplete() {
    (Object.keys(this.objects) as TerminalId[]).forEach((id) => {
      const t = this.objects[id];
      if (!t || this.completed.has(id)) return;
      this.hiddenTerminals.add(id);
      t.sprite.setVisible(false);
      t.bar.setVisible(false);
      t.label.setVisible(false);
    });
    if (this.auraActive) this._redrawAura();
  }
}
