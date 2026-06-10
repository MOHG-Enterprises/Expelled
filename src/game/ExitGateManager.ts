import Phaser from 'phaser';
import { GATE_INTERACT_RADIUS, GATE_POSITIONS, GATE_TILE_RANGES, TILE_WORLD_SIZE } from '../constants';
import type { GateId } from '../types';

interface GateObj {
  switchX:  number;
  switchY:  number;
  progress: number;
  powered:  boolean;
  open:     boolean;
  marker:   Phaser.GameObjects.Sprite;
  barBg:    Phaser.GameObjects.Rectangle;
  bar:      Phaser.GameObjects.Rectangle;
  lights:   Phaser.GameObjects.Rectangle[];
  exitZone: Phaser.Geom.Rectangle;
}

const GATE_IDS: GateId[] = ['g1', 'g2'];
const TOTAL_FRAMES = 18;

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
      .sprite(x, y, 'botaoSaida', 0)
      .setScale(2)
      .setDepth(2);

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

    const range      = GATE_TILE_RANGES[id];
    const gateLeft   = range.col * TILE_WORLD_SIZE;
    const zoneTop    = range.rowStart * TILE_WORLD_SIZE;
    const zoneHeight = (range.rowEnd - range.rowStart + 1) * TILE_WORLD_SIZE;
    const exitZone   = new Phaser.Geom.Rectangle(gateLeft - 96, zoneTop, 96, zoneHeight);

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
  }

  setProgress(id: GateId, pct: number) {
    const g = this.gates[id];
    g.progress = pct;
    g.bar.width = (pct / 100) * 48;
    [25, 50, 75].forEach((threshold, i) => {
      g.lights[i].setFillStyle(pct >= threshold ? 0x00e676 : 0x444444);
    });
    const frame = Math.min(TOTAL_FRAMES - 1, Math.floor((pct / 100) * TOTAL_FRAMES));
    g.marker.setFrame(frame);
  }

  setOpen(id: GateId, map: Phaser.Tilemaps.Tilemap) {
    const g = this.gates[id];
    if (g.open) return;
    g.open = true;
    g.marker.setFrame(TOTAL_FRAMES - 1);
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
    return Phaser.Math.Distance.Between(x, y, g.switchX, g.switchY) < GATE_INTERACT_RADIUS;
  }

  getNearestActiveSwitch(x: number, y: number): { x: number; y: number } | null {
    for (const id of GATE_IDS) {
      const g = this.gates[id];
      if (!g.powered || g.open) continue;
      if (Phaser.Math.Distance.Between(x, y, g.switchX, g.switchY) < GATE_INTERACT_RADIUS) {
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

  setFailed(id: GateId) {
    const g = this.gates[id];
    g.marker.setTint(0xff2222);
    this.scene.time.delayedCall(1100, () => g.marker.clearTint());
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
