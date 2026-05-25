import Phaser from 'phaser';
import { INTERACT_RADIUS, GATE_POSITIONS, GATE_TILE_RANGES } from '../constants';
import type { GateId } from '../types';

interface GateObj {
  switchX:  number;
  switchY:  number;
  progress: number;
  powered:  boolean;
  open:     boolean;
  marker:   Phaser.GameObjects.Rectangle;
  barBg:    Phaser.GameObjects.Rectangle;
  bar:      Phaser.GameObjects.Rectangle;
  lights:   Phaser.GameObjects.Rectangle[];
  exitZone: Phaser.Geom.Rectangle;
}

const GATE_IDS: GateId[] = ['g1', 'g2'];

export class ExitGateManager {
  private scene: Phaser.Scene;
  private gates: Record<GateId, GateObj>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gates = {} as Record<GateId, GateObj>;
    GATE_IDS.forEach((id) => this._buildGate(id));
  }

  private _buildGate(id: GateId) {
    const { x, y } = GATE_POSITIONS[id];

    const marker = this.scene.add
      .rectangle(x, y, 16, 16, 0x555555)
      .setDepth(2);

    this.scene.add
      .text(x, y - 20, 'SAÍDA', { fontSize: '10px', color: '#888' })
      .setOrigin(0.5)
      .setDepth(3);

    const barBg = this.scene.add
      .rectangle(x - 24, y - 32, 48, 6, 0x333333)
      .setOrigin(0, 0.5)
      .setDepth(3);

    const bar = this.scene.add
      .rectangle(x - 24, y - 32, 0, 6, 0x00e676)
      .setOrigin(0, 0.5)
      .setDepth(4);

    const lights: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < 3; i++) {
      lights.push(
        this.scene.add
          .rectangle(x - 16 + i * 14, y - 42, 6, 6, 0x444444)
          .setDepth(3),
      );
    }

    const exitZone = new Phaser.Geom.Rectangle(x - 150, y - 80, 50, 160);

    this.gates[id] = {
      switchX: x,
      switchY: y,
      progress: 0,
      powered: false,
      open: false,
      marker,
      barBg,
      bar,
      lights,
      exitZone,
    };
  }

  setPowered(id: GateId) {
    const g = this.gates[id];
    g.powered = true;
    g.marker.setFillStyle(0x00aa44);
  }

  setProgress(id: GateId, pct: number) {
    const g = this.gates[id];
    g.progress = pct;
    g.bar.width = (pct / 100) * 48;
    [25, 50, 75].forEach((threshold, i) => {
      g.lights[i].setFillStyle(pct >= threshold ? 0x00e676 : 0x444444);
    });
  }

  setOpen(id: GateId, map: Phaser.Tilemaps.Tilemap) {
    const g = this.gates[id];
    if (g.open) return;
    g.open = true;
    g.marker.setFillStyle(0x00ff88);
    g.bar.width = 48;
    g.lights.forEach((l) => l.setFillStyle(0x00e676));

    const range = GATE_TILE_RANGES[id];
    for (let row = range.rowStart; row <= range.rowEnd; row++) {
      const tile = map.getTileAt(range.col, row, false, 'PORTAO');
      if (tile) {
        tile.setCollision(false);
        tile.setVisible(false);
      }
    }
  }

  isPowered(id: GateId): boolean {
    return this.gates[id].powered;
  }

  isOpen(id: GateId): boolean {
    return this.gates[id].open;
  }

  isNearSwitch(id: GateId, x: number, y: number): boolean {
    const g = this.gates[id];
    return Phaser.Math.Distance.Between(x, y, g.switchX, g.switchY) < INTERACT_RADIUS;
  }

  getNearestActiveSwitch(x: number, y: number): { x: number; y: number } | null {
    for (const id of GATE_IDS) {
      const g = this.gates[id];
      if (!g.powered || g.open) continue;
      if (Phaser.Math.Distance.Between(x, y, g.switchX, g.switchY) < INTERACT_RADIUS) {
        return { x: g.switchX, y: g.switchY };
      }
    }
    return null;
  }

  getOpenGateForExit(x: number, y: number): GateId | null {
    for (const id of GATE_IDS) {
      const g = this.gates[id];
      if (g.open && Phaser.Geom.Rectangle.Contains(g.exitZone, x, y)) return id;
    }
    return null;
  }

  setAuraMode(on: boolean) {
    for (const id of GATE_IDS) {
      const g = this.gates[id];
      g.marker.setVisible(on || g.powered);
      g.barBg.setVisible(on || g.powered);
      g.bar.setVisible(on || g.powered);
      g.lights.forEach((l) => l.setVisible(on || g.powered));
    }
  }
}
