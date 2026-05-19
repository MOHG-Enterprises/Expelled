# FOV Raycasting com Oclusão de Paredes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o FOV geométrico simples por um polígono de visibilidade calculado via DDA raycasting contra os tiles de colisão do mapa.

**Architecture:** `FogOfWar.ts` constrói uma grade `Uint8Array` de tiles sólidos a partir de `FOV_BLOCKING_LAYERS` (configurável em `src/constants.ts`), e a cada frame dispara raios DDA para montar um polígono de visibilidade que substitui o `fillCircle`/`arc` atual. O resto do sistema de máscara (overlay + geometry mask + invertAlpha) permanece intacto.

**Tech Stack:** Phaser 3, TypeScript, Phaser.Tilemaps API, sem dependências externas novas.

---

## Files

| Arquivo | Mudança |
|---------|---------|
| `src/constants.ts` | Adicionar `FOV_BLOCKING_LAYERS` (Set) e `TILE_WORLD_SIZE` (número) |
| `src/game/FogOfWar.ts` | Reescrever: aceitar `map` no `setup()`, adicionar grade sólida, `castRay()` DDA, reescrever `update()` com `fillPoints` |
| `src/scenes/GameScene.ts` | Passar `this.mapRef!` no `fog.setup(role, this.mapRef!)` (linha 539) |

---

## Task 1: Adicionar constantes em `src/constants.ts`

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Abrir `src/constants.ts` e adicionar após as constantes de FOV existentes (linhas 43–46)**

```typescript
export const TILE_WORLD_SIZE = 32; // 16px tile × MAP_SCALE 2

export const FOV_BLOCKING_LAYERS = new Set([
  'Parede',
  'OBSTACULOS',
  'PORTAO',
]);
```

`TILE_WORLD_SIZE` é o tamanho de um tile no mundo (`16 * MAP_SCALE`). `FOV_BLOCKING_LAYERS` é independente de `COLLISION_LAYERS` — edite aqui enquanto o mapa evoluir.

- [ ] **Step 2: Commit**

```bash
git add src/constants.ts
git commit -m "feat(fov): add FOV_BLOCKING_LAYERS and TILE_WORLD_SIZE constants"
```

---

## Task 2: Reescrever `src/game/FogOfWar.ts`

**Files:**
- Modify: `src/game/FogOfWar.ts`

- [ ] **Step 1: Substituir todo o conteúdo do arquivo pelo seguinte**

```typescript
import Phaser from 'phaser';
import {
  FOV_PROFESSOR,
  FOV_SURVIVOR,
  FOV_PROFESSOR_CONE_DEG,
  FOV_BLOCKING_LAYERS,
  TILE_WORLD_SIZE,
} from '../constants';
import type { Role } from '../types';

export class FogOfWar {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private maskGraphics: Phaser.GameObjects.Graphics | null = null;
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
      .rectangle(0, 0, 800, 600, 0x000000)
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

  private buildSolidGrid(map: Phaser.Tilemaps.Tilemap) {
    this.mapWidth = map.width;
    this.mapHeight = map.height;
    this.solidGrid = new Uint8Array(this.mapWidth * this.mapHeight);

    for (const layerName of FOV_BLOCKING_LAYERS) {
      const layerData = map.getLayer(layerName);
      if (!layerData) continue;
      for (let y = 0; y < this.mapHeight; y++) {
        for (let x = 0; x < this.mapWidth; x++) {
          const tile = layerData.data[y][x];
          if (tile && tile.index >= 0) {
            this.solidGrid[y * this.mapWidth + x] = 1;
          }
        }
      }
    }
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
      let dist: number;
      if (sideDistX < sideDistY) {
        dist = sideDistX;
        if (dist > maxTileDist) break;
        mapX += stepX;
        sideDistX += invDx;
      } else {
        dist = sideDistY;
        if (dist > maxTileDist) break;
        mapY += stepY;
        sideDistY += invDy;
      }
      if (mapX < 0 || mapX >= this.mapWidth || mapY < 0 || mapY >= this.mapHeight) break;
      if (this.solidGrid[mapY * this.mapWidth + mapX]) {
        const hitDist = dist * TILE_WORLD_SIZE;
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

    const points: { x: number; y: number }[] = [];

    if (this.role === 'professor') {
      const halfCone = Phaser.Math.DegToRad(FOV_PROFESSOR_CONE_DEG) / 2;
      const numRays = 120;
      const step = (halfCone * 2) / numRays;
      points.push({ x: sx, y: sy });
      for (let i = 0; i <= numRays; i++) {
        const angle = (lookAngle - halfCone) + i * step;
        const hit = this.castRay(player.x, player.y, angle);
        points.push({
          x: (hit.x - cam.scrollX) * cam.zoom,
          y: (hit.y - cam.scrollY) * cam.zoom,
        });
      }
      g.fillPoints(points, true);
      g.fillCircle(sx, sy, 36);
      return;
    }

    const numRays = 360;
    const step = (Math.PI * 2) / numRays;
    for (let i = 0; i < numRays; i++) {
      const angle = i * step;
      const hit = this.castRay(player.x, player.y, angle);
      points.push({
        x: (hit.x - cam.scrollX) * cam.zoom,
        y: (hit.y - cam.scrollY) * cam.zoom,
      });
    }
    g.fillPoints(points, true);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/game/FogOfWar.ts
git commit -m "feat(fov): implement DDA raycasting with wall occlusion"
```

---

## Task 3: Passar o mapa para `fog.setup()` em `GameScene.ts`

**Files:**
- Modify: `src/scenes/GameScene.ts:539`

- [ ] **Step 1: Encontrar a linha 539 e trocar a chamada**

Antes:
```typescript
this.fog.setup(role);
```

Depois:
```typescript
this.fog.setup(role, this.mapRef!);
```

`this.mapRef` é atribuído na linha 448 dentro de `create()`, antes do evento `roleAssigned` disparar — está sempre disponível quando `setup` é chamado.

- [ ] **Step 2: Rodar typecheck para garantir que não há erros**

```bash
npm run typecheck
```

Esperado: nenhum erro de tipo. Se aparecer erro em `FogOfWar.setup`, verifique se a assinatura do método bate com `setup(role: Role, map: Phaser.Tilemaps.Tilemap)`.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat(fov): pass tilemap reference to FogOfWar.setup"
```

---

## Task 4: Teste manual

- [ ] **Step 1: Subir o servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Abrir dois browsers, um como professor e um como survivor**

Verificar:
- Survivor: círculo de visão parado nas paredes (não atravessa `Parede`, `OBSTACULOS`, `PORTAO`)
- Professor: cone de 80° travado nas paredes
- Movimento suavizado do cone do professor continua funcionando
- Sem erros de console relacionados ao FOV

- [ ] **Step 3: Ajustar `FOV_BLOCKING_LAYERS` se necessário**

Se quiser adicionar ou remover layers que bloqueiam visão, edite `src/constants.ts`:

```typescript
export const FOV_BLOCKING_LAYERS = new Set([
  'Parede',
  'OBSTACULOS',
  'PORTAO',
  // 'MESAS',      // descomente para mesas bloquearem visão
  // 'BANCOS',     // descomente para bancos bloquearem visão
  // 'ARVORES',    // descomente para árvores bloquearem visão
]);
```

Após editar, chame `fog.rebuildGrid(this.mapRef!)` se precisar reconstruir em runtime sem reiniciar. No fluxo normal, `setup()` já reconstrói ao entrar no jogo.
