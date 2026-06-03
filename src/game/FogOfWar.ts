import Phaser from 'phaser';
import {
  FOV_PROFESSOR,
  FOV_SURVIVOR,
  FOV_PROFESSOR_CONE_DEG,
  FOV_BLOCKING_LAYERS,
  TILE_WORLD_SIZE,
} from '../constants';
import type { Role } from '../types';

const EPS = 0.0001;
const ARC_STEP = Phaser.Math.DegToRad(3);

const EDGE_FADE_KEY = '__fov_edge_fade__';

export class FogOfWar {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private maskGraphics: Phaser.GameObjects.Graphics | null = null;
  private edgeFade: Phaser.GameObjects.Image | null = null;
  private role: Role = 'survivor';
  private fovRadius = FOV_SURVIVOR;

  private solidGrid = new Uint8Array(0);
  private mapWidth = 0;
  private mapHeight = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setup(role: Role, map: Phaser.Tilemaps.Tilemap) {
    this.role = role;
    this.fovRadius = role === 'professor' ? FOV_PROFESSOR : FOV_SURVIVOR;

    this.overlay?.destroy();
    this.maskGraphics?.destroy();

    this.overlay = this.scene.add
      .rectangle(0, 0, 8000, 8000, 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25);

    this.maskGraphics = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(24)
      .setVisible(false);

    const mask = this.maskGraphics.createGeometryMask();
    mask.invertAlpha = true;
    this.overlay.setMask(mask);

    this.buildSolidGrid(map);
  }

  rebuildGrid(map: Phaser.Tilemaps.Tilemap) {
    this.buildSolidGrid(map);
  }

  setFullReveal(enabled: boolean) {
    this.overlay?.setVisible(!enabled);
  }

  private buildSolidGrid(map: Phaser.Tilemaps.Tilemap) {
    this.mapWidth = map.width;
    this.mapHeight = map.height;
    this.solidGrid = new Uint8Array(this.mapWidth * this.mapHeight);

    let layerIdx = 1;
    for (const layerName of FOV_BLOCKING_LAYERS) {
      const layerData = map.getLayer(layerName);
      if (!layerData) { layerIdx++; continue; }
      for (let y = 0; y < this.mapHeight; y++) {
        for (let x = 0; x < this.mapWidth; x++) {
          const tile = layerData.data[y][x];
          if (tile && tile.index >= 0) {
            this.solidGrid[y * this.mapWidth + x] = layerIdx;
          }
        }
      }
      layerIdx++;
    }
  }

  private normAround(a: number, center: number): number {
    while (a - center > Math.PI) a -= Math.PI * 2;
    while (a - center < -Math.PI) a += Math.PI * 2;
    return a;
  }

  private gatherAngles(playerX: number, playerY: number, lookAngle: number): number[] {
    const isProfessor = this.role === 'professor';
    const halfCone = isProfessor ? Phaser.Math.DegToRad(FOV_PROFESSOR_CONE_DEG) / 2 : Math.PI;
    const center = isProfessor ? lookAngle : 0;
    const angleMin = center - halfCone;
    const angleMax = center + halfCone;

    const raw: number[] = [];

    for (let a = angleMin; a < angleMax; a += ARC_STEP) raw.push(a);
    raw.push(angleMax);

    const tileCX = Math.floor(playerX / TILE_WORLD_SIZE);
    const tileCY = Math.floor(playerY / TILE_WORLD_SIZE);
    const tileR = Math.ceil(this.fovRadius / TILE_WORLD_SIZE) + 1;
    const rSq = this.fovRadius * this.fovRadius;
    const seen = new Set<number>();

    for (let ty = tileCY - tileR; ty <= tileCY + tileR; ty++) {
      for (let tx = tileCX - tileR; tx <= tileCX + tileR; tx++) {
        if (tx < 0 || tx >= this.mapWidth || ty < 0 || ty >= this.mapHeight) continue;
        if (!this.solidGrid[ty * this.mapWidth + tx]) continue;

        for (let cy = ty; cy <= ty + 1; cy++) {
          for (let cx = tx; cx <= tx + 1; cx++) {
            const key = cy * (this.mapWidth + 1) + cx;
            if (seen.has(key)) continue;
            seen.add(key);

            const wx = cx * TILE_WORLD_SIZE;
            const wy = cy * TILE_WORLD_SIZE;
            const ddx = wx - playerX;
            const ddy = wy - playerY;
            if (ddx * ddx + ddy * ddy > rSq) continue;

            const rawA = Math.atan2(ddy, ddx);
            const a = isProfessor ? this.normAround(rawA, lookAngle) : rawA;
            if (a < angleMin - 0.05 || a > angleMax + 0.05) continue;

            raw.push(a - EPS, a, a + EPS);
          }
        }
      }
    }

    raw.sort((x, y) => x - y);

    const result: number[] = [];
    for (const a of raw) {
      const ca = Math.max(angleMin, Math.min(angleMax, a));
      if (result.length === 0 || ca - result[result.length - 1] > EPS / 2) {
        result.push(ca);
      }
    }

    return result;
  }

  private castRay(worldX: number, worldY: number, angle: number): { x: number; y: number } {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const invDx = dx === 0 ? 1e10 : 1 / Math.abs(dx);
    const invDy = dy === 0 ? 1e10 : 1 / Math.abs(dy);

    const stepX = dx < 0 ? -1 : 1;
    const stepY = dy < 0 ? -1 : 1;

    let mapX = Math.floor(worldX / TILE_WORLD_SIZE);
    let mapY = Math.floor(worldY / TILE_WORLD_SIZE);

    let sideDistX = dx < 0
      ? (worldX / TILE_WORLD_SIZE - mapX) * invDx
      : (mapX + 1 - worldX / TILE_WORLD_SIZE) * invDx;
    let sideDistY = dy < 0
      ? (worldY / TILE_WORLD_SIZE - mapY) * invDy
      : (mapY + 1 - worldY / TILE_WORLD_SIZE) * invDy;

    const maxTileDist = this.fovRadius / TILE_WORLD_SIZE;

    while (true) {
      if (sideDistX < sideDistY) {
        if (sideDistX > maxTileDist) break;
        mapX += stepX;
        sideDistX += invDx;
      } else {
        if (sideDistY > maxTileDist) break;
        mapY += stepY;
        sideDistY += invDy;
      }
      if (mapX < 0 || mapX >= this.mapWidth || mapY < 0 || mapY >= this.mapHeight) break;
      const hitLayer = this.solidGrid[mapY * this.mapWidth + mapX];
      if (hitLayer) {
        while (true) {
          if (sideDistX < sideDistY) {
            const nx = mapX + stepX;
            if (sideDistX > maxTileDist || nx < 0 || nx >= this.mapWidth || this.solidGrid[mapY * this.mapWidth + nx] !== hitLayer) break;
            mapX = nx;
            sideDistX += invDx;
          } else {
            const ny = mapY + stepY;
            if (sideDistY > maxTileDist || ny < 0 || ny >= this.mapHeight || this.solidGrid[ny * this.mapWidth + mapX] !== hitLayer) break;
            mapY = ny;
            sideDistY += invDy;
          }
        }
        const hitDist = Math.min(sideDistX, sideDistY, maxTileDist) * TILE_WORLD_SIZE;
        return { x: worldX + dx * hitDist, y: worldY + dy * hitDist };
      }
    }

    return { x: worldX + dx * this.fovRadius, y: worldY + dy * this.fovRadius };
  }

  update(player: { x: number; y: number }, lookAngle = 0) {
    if (!this.maskGraphics) return;
    const cam = this.scene.cameras.main;
    const sx = (player.x - cam.scrollX) * cam.zoom;
    const sy = (player.y - cam.scrollY) * cam.zoom;
    const g = this.maskGraphics;

    g.clear();
    g.fillStyle(0xffffff, 1);

    const angles = this.gatherAngles(player.x, player.y, lookAngle);
    const points: { x: number; y: number }[] = [];

    if (this.role === 'professor') {
      points.push({ x: sx, y: sy });
    }

    for (const angle of angles) {
      const hit = this.castRay(player.x, player.y, angle);
      points.push({
        x: (hit.x - cam.scrollX) * cam.zoom,
        y: (hit.y - cam.scrollY) * cam.zoom,
      });
    }

    g.fillPoints(points, true);

    if (this.role === 'professor') {
      g.fillCircle(sx, sy, 36);
    }
  }
}
