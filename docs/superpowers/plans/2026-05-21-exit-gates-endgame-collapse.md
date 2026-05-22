# Exit Gates & Endgame Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single instant-escape gate marker with two proper Exit Gates (20s hold-to-open interaction, 3 progress lights) and a server-authoritative 2-minute Endgame Collapse timer that starts when a gate opens.

**Architecture:** New `ExitGateManager` client class (mirrors `TerminalManager` pattern) owns both gate visuals and collision-tile removal. Server gains `gateOpenTick` event handler and a per-room `setInterval` for collapse expiry. All shared constants live in `shared/gameRules.ts`.

**Tech Stack:** TypeScript, Phaser 3, Socket.io, Node.js/Express

**Spec:** `docs/superpowers/specs/2026-05-21-exit-gates-endgame-collapse-design.md`

---

## File Map

| Action | File | Change |
|---|---|---|
| Modify | `shared/gameRules.ts` | Add 3 constants |
| Modify | `server/types.ts` | Add `GateId`; update `GameStateRecord` |
| Modify | `server/gameState.ts` | Add gate positions/ranges, update `freshGameState`, re-export new constants |
| Modify | `server/index.ts` | Gate power threshold, `gateOpenTick` handler, endgame interval, block hackProgress during endgame, fix escape guard, clear interval on reset |
| Modify | `src/types.ts` | Add `GateId`; update `GameState` |
| Modify | `src/constants.ts` | Re-export constants + add client-side gate positions/tile ranges |
| Modify | `src/game/TerminalManager.ts` | Remove `gateMarker`/`unlockGate`, add `blockAll` |
| Modify | `src/game/HUD.ts` | Add `setEndgameTimer`, remove `setGateOpen` |
| **Create** | `src/game/ExitGateManager.ts` | Full gate manager implementation |
| Modify | `src/scenes/GameScene.ts` | Wire all new systems, update interaction loop |

---

## Task 1: Shared constants

**Files:**
- Modify: `shared/gameRules.ts`

- [ ] **Step 1: Add three constants at the end of `shared/gameRules.ts`**

```ts
export const GATE_TICK_MS        = 500;
export const GATE_TICK_AMOUNT    = 2.5;
export const ENDGAME_DURATION_MS = 120_000;
```

- [ ] **Step 2: Typecheck**

```
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```
git add shared/gameRules.ts
git commit -m "feat: add GATE_TICK_MS, GATE_TICK_AMOUNT, ENDGAME_DURATION_MS constants"
```

---

## Task 2: GateId type + GameStateRecord

**Files:**
- Modify: `server/types.ts`

- [ ] **Step 1: Add `GateId` and update `GameStateRecord` in `server/types.ts`**

Add `GateId` below the existing type aliases:
```ts
export type GateId = 'g1' | 'g2';
```

In `GameStateRecord`, remove `gateOpen: boolean` and add four new fields:
```ts
// REMOVE:
gateOpen:         boolean;

// ADD (after hackedCount):
gates:            Record<GateId, number>;
gatesOpen:        Record<GateId, boolean>;
gatesPowered:     boolean;
endgameStartedAt: number | null;
```

The final `GameStateRecord` should look like:
```ts
export interface GameStateRecord {
  players:           Record<string, PlayerRecord>;
  terminals:         Record<TerminalId, number>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount:       number;
  gates:             Record<GateId, number>;
  gatesOpen:         Record<GateId, boolean>;
  gatesPowered:      boolean;
  endgameStartedAt:  number | null;
  phase:             GamePhase;
  chase: {
    target:    string | null;
    elapsed:   number;
    tier:      0 | 1 | 2 | 3;
    losLostAt: number | null;
  };
}
```

- [ ] **Step 2: Update `GameState` in `src/types.ts`**

Add `GateId` (duplicated by design — do not import from server):
```ts
export type GateId = 'g1' | 'g2';
```

Replace `gateOpen: boolean` in `GameState` with the four new fields:
```ts
// REMOVE:
gateOpen: boolean;

// ADD:
gates:             Record<GateId, number>;
gatesOpen:         Record<GateId, boolean>;
gatesPowered:      boolean;
endgameStartedAt:  number | null;
```

Final `GameState`:
```ts
export interface GameState {
  players:          Record<string, PlayerState>;
  terminals:        Record<TerminalId, number>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount:      number;
  gates:            Record<GateId, number>;
  gatesOpen:        Record<GateId, boolean>;
  gatesPowered:     boolean;
  endgameStartedAt: number | null;
  phase:            GamePhase;
}
```

- [ ] **Step 3: Typecheck (expect errors — they are resolved in later tasks)**

```
npm run typecheck
```

Expected: errors about `gateOpen` usages and missing fields in `freshGameState`. That is fine — continue.

- [ ] **Step 4: Commit**

```
git add server/types.ts src/types.ts
git commit -m "feat: add GateId type and update GameStateRecord/GameState for gate system"
```

---

## Task 3: `server/gameState.ts` — gate positions, freshGameState, re-exports

**Files:**
- Modify: `server/gameState.ts`

- [ ] **Step 1: Import `GateId` at the top of `server/gameState.ts`**

Change this import line:
```ts
import type { GameStateRecord, TerminalId, Vec2 } from './types';
```
To:
```ts
import type { GameStateRecord, GateId, TerminalId, Vec2 } from './types';
```

- [ ] **Step 2: Add gate positions and tile ranges after `TERMINAL_POSITIONS`**

```ts
export const GATE_POSITIONS: Record<GateId, Vec2> = {
  g1: { x: 464, y: 2222 },
  g2: { x: 464, y: 1722 },
};

export const GATE_TILE_RANGES: Record<GateId, { col: number; rowStart: number; rowEnd: number }> = {
  g1: { col: 12, rowStart: 70, rowEnd: 74 },
  g2: { col: 12, rowStart: 47, rowEnd: 51 },
};
```

- [ ] **Step 3: Update `freshGameState()` — remove `gateOpen`, add new gate fields**

Replace the entire `freshGameState` function body:
```ts
export function freshGameState(): GameStateRecord {
  return {
    players:           {},
    terminals:         { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 },
    terminalPositions: TERMINAL_POSITIONS,
    hackedCount:       0,
    gates:             { g1: 0, g2: 0 },
    gatesOpen:         { g1: false, g2: false },
    gatesPowered:      false,
    endgameStartedAt:  null,
    phase:             'lobby',
    chase:             { target: null, elapsed: 0, tier: 0, losLostAt: null },
  };
}
```

- [ ] **Step 4: Re-export new constants at the bottom of `server/gameState.ts`**

```ts
export { GATE_TICK_MS, GATE_TICK_AMOUNT, ENDGAME_DURATION_MS } from '../shared/gameRules';
```

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: errors are fewer now; remaining ones are in `server/index.ts` and `src/scenes/GameScene.ts`.

- [ ] **Step 6: Commit**

```
git add server/gameState.ts
git commit -m "feat: add gate positions, tile ranges and update freshGameState for exit gates"
```

---

## Task 4: `src/constants.ts` — re-export constants + client gate positions/ranges

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Re-export shared gate constants and add client-only gate position/range constants**

Add to the top re-export block (with the other shared re-exports):
```ts
export {
  GATE_TICK_MS,
  GATE_TICK_AMOUNT,
  ENDGAME_DURATION_MS,
} from '../shared/gameRules';
```

Add client-only gate constants at the bottom of `src/constants.ts` (import `GateId` from `./types`):
```ts
import type { GateId } from './types';

export const GATE_POSITIONS: Record<GateId, { x: number; y: number }> = {
  g1: { x: 464, y: 2222 },
  g2: { x: 464, y: 1722 },
};

export const GATE_TILE_RANGES: Record<GateId, { col: number; rowStart: number; rowEnd: number }> = {
  g1: { col: 12, rowStart: 70, rowEnd: 74 },
  g2: { col: 12, rowStart: 47, rowEnd: 51 },
};
```

- [ ] **Step 2: Typecheck**

```
npm run typecheck
```

- [ ] **Step 3: Commit**

```
git add src/constants.ts
git commit -m "feat: re-export gate constants and add client-side gate positions/tile ranges"
```

---

## Task 5: `server/index.ts` — gate power condition

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add new imports to `server/index.ts`**

In the import from `'./gameState'`, add `GATE_TICK_AMOUNT` and `ENDGAME_DURATION_MS`:
```ts
import {
  // ... existing imports ...
  GATE_TICK_AMOUNT,
  ENDGAME_DURATION_MS,
} from './gameState';
```

In the type import from `'./types'`, add `GateId`:
```ts
import type { GameStateRecord, GateId, TerminalId } from './types';
```

- [ ] **Step 2: Replace gate power condition in the `hackProgress` handler**

Find this block (around line 327):
```ts
if (state.hackedCount >= survivorCount && !state.gateOpen) {
  state.gateOpen = true;
  io.to(roomName).emit('gateUnlocked');
}
```

Replace it with:
```ts
const threshold = survivorCount + 1;
if (state.hackedCount >= threshold && !state.gatesPowered) {
  state.gatesPowered = true;
  io.to(roomName).emit('gatesPowered');
}
```

- [ ] **Step 3: Typecheck**

```
npm run typecheck
```

- [ ] **Step 4: Commit**

```
git add server/index.ts
git commit -m "feat: change gate power threshold to survivorCount+1 and emit gatesPowered"
```

---

## Task 6: `server/index.ts` — gateOpenTick handler + endgame interval

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add the endgame interval map and `startEndgameInterval` function**

Add after the existing top-level maps (`socketToRoom`, etc.) and before the `io.on('connection', ...)` block:

```ts
const endgameIntervals = new Map<string, ReturnType<typeof setInterval>>();

function startEndgameInterval(roomName: string): void {
  const handle = setInterval(() => {
    const state = rooms[roomName];
    if (!state?.endgameStartedAt || state.phase !== 'playing') {
      clearInterval(handle);
      endgameIntervals.delete(roomName);
      return;
    }
    if (Date.now() - state.endgameStartedAt < ENDGAME_DURATION_MS) return;

    clearInterval(handle);
    endgameIntervals.delete(roomName);

    const survivors = Object.entries(state.players).filter(
      ([, p]) => p.role === 'survivor' && !p.expelled && !p.escaped,
    );
    for (const [id, p] of survivors) {
      p.expelled = true;
      io.to(roomName).emit('playerExpelled', id);
    }
    checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
  }, 1000);
  endgameIntervals.set(roomName, handle);
}
```

- [ ] **Step 2: Add the `gateOpenTick` handler inside `io.on('connection', socket => { ... })`**

Place it after the `escape` handler:

```ts
socket.on('gateOpenTick', ({ gateId }: { gateId: GateId }) => {
  const room = getRoomForSocket(socket.id);
  if (!room) return;
  const { roomName, state } = room;
  const p = state.players[socket.id];
  if (!p || p.role !== 'survivor' || p.downed || p.expelled || p.escaped) return;
  if (!state.gatesPowered) return;
  if (gateId !== 'g1' && gateId !== 'g2') return;
  if (state.gatesOpen[gateId]) return;

  state.gates[gateId] = Math.min(100, state.gates[gateId] + GATE_TICK_AMOUNT);
  io.to(roomName).emit('gateProgress', { gateId, progress: state.gates[gateId] });

  if (state.gates[gateId] >= 100) {
    state.gatesOpen[gateId] = true;
    io.to(roomName).emit('gateOpened', { gateId });
    if (state.endgameStartedAt === null) {
      state.endgameStartedAt = Date.now();
      io.to(roomName).emit('endgameStarted', { startAt: state.endgameStartedAt });
      startEndgameInterval(roomName);
    }
  }
});
```

- [ ] **Step 3: Typecheck**

```
npm run typecheck
```

- [ ] **Step 4: Commit**

```
git add server/index.ts
git commit -m "feat: add gateOpenTick handler and endgame collapse interval"
```

---

## Task 7: `server/index.ts` — hackProgress block + escape guard

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Block `hackProgress` during endgame**

At the top of the `hackProgress` handler, after the existing guard checks (right after the `failLockUntil` check), add:

```ts
if (state.endgameStartedAt !== null) return;
```

The block should read (find the comment/line where `meta.failLockUntil` is checked and add right after):
```ts
const meta = getTerminalMeta(roomName, terminalId);
if (Date.now() < meta.failLockUntil) return;
if (state.endgameStartedAt !== null) return;  // ← add this
```

- [ ] **Step 2: Fix `escape` handler guard**

Find this line in the `escape` handler:
```ts
if (!state.gateOpen) return;
```

Replace it with:
```ts
if (!state.gatesOpen.g1 && !state.gatesOpen.g2) return;
```

- [ ] **Step 3: Typecheck**

```
npm run typecheck
```

Expected: the `gateOpen` references in `server/index.ts` are now all gone. Server-side typecheck should be clean.

- [ ] **Step 4: Commit**

```
git add server/index.ts
git commit -m "feat: block hackProgress during endgame and fix escape gate guard"
```

---

## Task 8: `TerminalManager` — remove gate marker, add `blockAll`

**Files:**
- Modify: `src/game/TerminalManager.ts`

- [ ] **Step 1: Remove the `gateMarker` field declaration**

Remove this line near the top of the class body:
```ts
gateMarker: Phaser.GameObjects.Rectangle | null = null;
```

- [ ] **Step 2: Remove the gate marker creation block inside `sync()`**

Remove the following block from inside `sync()`:
```ts
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
```

- [ ] **Step 3: Remove `unlockGate()` and add `blockAll()`**

Remove the `unlockGate()` method:
```ts
unlockGate() {
  this.gateMarker?.setFillStyle(0x00e676);
}
```

Add `blockAll()` in its place:
```ts
blockAll() {
  (Object.keys(this.objects) as TerminalId[]).forEach((id) => {
    const t = this.objects[id];
    if (!t || this.completed.has(id)) return;
    t.bar.setFillStyle(0x333333);
    t.sprite.setTint(0x555555);
  });
}
```

- [ ] **Step 4: Typecheck**

```
npm run typecheck
```

- [ ] **Step 5: Commit**

```
git add src/game/TerminalManager.ts
git commit -m "feat: remove gate marker from TerminalManager, add blockAll for endgame"
```

---

## Task 9: `HUD` — add `setEndgameTimer`, remove `setGateOpen`

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Add the import for `ENDGAME_DURATION_MS` at the top of `HUD.ts`**

```ts
import { ENDGAME_DURATION_MS } from '../constants';
```

- [ ] **Step 2: Add three new private fields for the endgame timer**

In the class field declarations (after `hudGate`):
```ts
private endgameTimerBg!:   Phaser.GameObjects.Graphics;
private endgameTimerBar!:  Phaser.GameObjects.Graphics;
private endgameTimerText!: Phaser.GameObjects.Text;
```

- [ ] **Step 3: Create the timer graphics in `build()`**

Add after `this.hudGate = ...` creation:
```ts
this.endgameTimerBg = this.scene.add
  .graphics()
  .setScrollFactor(0)
  .setDepth(35)
  .setAlpha(0);

this.endgameTimerBar = this.scene.add
  .graphics()
  .setScrollFactor(0)
  .setDepth(36)
  .setAlpha(0);

this.endgameTimerText = this.scene.add
  .text(400, 4, '', {
    fontSize: '12px',
    color: '#ff4444',
    fontStyle: 'bold',
    stroke: '#000',
    strokeThickness: 3,
  })
  .setOrigin(0.5, 0)
  .setScrollFactor(0)
  .setDepth(37)
  .setAlpha(0);
```

- [ ] **Step 4: Add `setEndgameTimer()` method**

Add after `setTerminalCount()`:
```ts
setEndgameTimer(remainingMs: number | null) {
  if (remainingMs === null) {
    this.endgameTimerBg.setAlpha(0);
    this.endgameTimerBar.setAlpha(0);
    this.endgameTimerText.setAlpha(0);
    return;
  }

  this.endgameTimerBg.setAlpha(1);
  this.endgameTimerBar.setAlpha(1);
  this.endgameTimerText.setAlpha(1);

  const BAR_W = 400;
  const BAR_H = 8;
  const BAR_X = (800 - BAR_W) / 2;
  const BAR_Y = 0;
  const fill  = Math.min(1, remainingMs / ENDGAME_DURATION_MS) * BAR_W;

  this.endgameTimerBg.clear();
  this.endgameTimerBg.fillStyle(0x1a0000, 0.9);
  this.endgameTimerBg.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);

  this.endgameTimerBar.clear();
  if (fill > 0) {
    this.endgameTimerBar.fillStyle(0xff2222, 0.95);
    this.endgameTimerBar.fillRect(BAR_X, BAR_Y, fill, BAR_H);
  }

  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  this.endgameTimerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
}
```

- [ ] **Step 5: Remove `setGateOpen()` method**

Delete the entire method:
```ts
setGateOpen(open: boolean) {
  this.hudGate.setText(open ? '▶ PORTAO ABERTO — va para a saida!' : '');
}
```

The `hudGate` field and its construction in `build()` can remain (it will be reused for "gate powered" messaging if desired in future), or delete both. For now, just delete the method — TypeScript errors on call sites will guide the remaining removals in GameScene.

- [ ] **Step 6: Typecheck**

```
npm run typecheck
```

- [ ] **Step 7: Commit**

```
git add src/game/HUD.ts
git commit -m "feat: add HUD endgame collapse timer, remove setGateOpen"
```

---

## Task 10: Create `ExitGateManager`

**Files:**
- Create: `src/game/ExitGateManager.ts`

- [ ] **Step 1: Create the file with full implementation**

```ts
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

    // Exit zone is to the left of the gate (x < tile column 12 at x≈384)
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
      if (tile) tile.setCollision(false);
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
```

- [ ] **Step 2: Typecheck**

```
npm run typecheck
```

Expected: `ExitGateManager` is clean. Remaining errors are all in `GameScene.ts`.

- [ ] **Step 3: Commit**

```
git add src/game/ExitGateManager.ts
git commit -m "feat: add ExitGateManager with two gates, progress lights, and exit zone detection"
```

---

## Task 11: `GameScene.ts` — wire ExitGateManager

**Files:**
- Modify: `src/scenes/GameScene.ts`

This task has many small edits. Work through them in order.

- [ ] **Step 1: Update imports at the top of `GameScene.ts`**

Add to the existing import from `'../constants'`:
```ts
GATE_TICK_MS, GATE_TICK_AMOUNT, ENDGAME_DURATION_MS,
```

Add to the existing import from `'../types'`:
```ts
GateId,
```

Add a new import line after the other game class imports:
```ts
import { ExitGateManager } from '../game/ExitGateManager';
```

- [ ] **Step 2: Replace `gateOpen` field with new gate fields**

Remove:
```ts
private gateOpen       = false;
```

Add in its place:
```ts
private gates!:             ExitGateManager;
private openingGate:        GateId | null = null;
private gateOpenTimer:      number = 0;
private endgameReceivedAt:  number | null = null;
private endgameBellsRung =  new Set<number>();
```

- [ ] **Step 3: Update `resetLocalState()` — remove `gateOpen`, add new resets**

Remove:
```ts
this.gateOpen = false;
```

Add these four lines in its place:
```ts
this.openingGate       = null;
this.gateOpenTimer     = 0;
this.endgameReceivedAt = null;
this.endgameBellsRung.clear();
```

- [ ] **Step 4: Instantiate `ExitGateManager` in `create()`**

In `create()`, after `this.terminals = new TerminalManager(this);`, add:
```ts
this.gates = new ExitGateManager(this);
```

- [ ] **Step 5: Update the `gameState` sync handler**

Find the `s.on('gameState', ...)` handler. Inside it:

Remove this line:
```ts
this.hud.setGateOpen(state.gateOpen);
```

Add these lines in its place (after `refreshSurvivorHUD()`):
```ts
if (state.gatesPowered) {
  this.gates.setPowered('g1');
  this.gates.setPowered('g2');
}
for (const id of ['g1', 'g2'] as GateId[]) {
  if (state.gates[id] > 0) this.gates.setProgress(id, state.gates[id]);
  if (state.gatesOpen[id] && this.mapRef) this.gates.setOpen(id, this.mapRef);
}
if (state.endgameStartedAt !== null) {
  const elapsed = Date.now() - state.endgameStartedAt;
  this.endgameReceivedAt = this.time.now - elapsed;
  this.endgameBellsRung.clear();
  this.terminals.blockAll();
  this.hud.setEndgameTimer(Math.max(0, ENDGAME_DURATION_MS - elapsed));
}
```

- [ ] **Step 6: Replace `gateUnlocked` handler with new gate socket events**

Find and remove the `gateUnlocked` handler:
```ts
s.on('gateUnlocked', () => {
  this.gateOpen = true;
  this.terminals.unlockGate();
  this.hud.setGateOpen(true);
  this.hud.flash('Portão aberto, fuja!', 0x00e676);
});
```

Add three new handlers after the `terminalHacked` handler:
```ts
s.on('gatesPowered', () => {
  this.gates.setPowered('g1');
  this.gates.setPowered('g2');
  this.hud.flash('Portões de saída disponíveis!', 0x00e676);
});

s.on('gateProgress', ({ gateId, progress }: { gateId: GateId; progress: number }) => {
  this.gates.setProgress(gateId, progress);
});

s.on('gateOpened', ({ gateId }: { gateId: GateId }) => {
  if (this.mapRef) this.gates.setOpen(gateId, this.mapRef);
  this.hud.flash('Portão aberto! Fuja agora!', 0x00e676, 4000);
});

s.on('endgameStarted', () => {
  this.endgameReceivedAt = this.time.now;
  this.endgameBellsRung.clear();
  this.terminals.blockAll();
  this.hud.flash('COLAPSO FINAL!', 0xff2222, 3000);
});
```

- [ ] **Step 7: Remove `isNearGate()` method**

Find and delete the entire method:
```ts
private isNearGate(): boolean {
  const gm = this.terminals.gateMarker;
  if (!gm) return false;
  return Phaser.Math.Distance.Between(this.player.x, this.player.y, gm.x, gm.y) < INTERACT_RADIUS;
}
```

- [ ] **Step 8: Replace gate interaction in `_updateSurvivorInteractions`**

Find and remove the old gate interaction at the end of `_updateSurvivorInteractions`:
```ts
if ((Phaser.Input.Keyboard.JustDown(this.eKey) || this.padActionJust) && this.gateOpen && this.isNearGate()) {
  this.socket.emit('escape');
}
```

Add the new gate interaction block in its place (still inside `_updateSurvivorInteractions`, at the very end):
```ts
// Gate opening interaction
let nearAnyGate = false;
for (const id of ['g1', 'g2'] as GateId[]) {
  if (!this.gates.isPowered(id) || this.gates.isOpen(id)) continue;
  if (!this.gates.isNearSwitch(id, this.player.x, this.player.y)) continue;
  nearAnyGate = true;

  if (this.openingGate !== id) {
    this.openingGate   = id;
    this.gateOpenTimer = 0;
  }

  if (this.eKey.isDown || this.padActionHeld) {
    this.gateOpenTimer += delta;
    while (this.gateOpenTimer >= GATE_TICK_MS) {
      this.gateOpenTimer -= GATE_TICK_MS;
      this.socket.emit('gateOpenTick', { gateId: id });
    }
  } else {
    this.gateOpenTimer = 0;
  }
  break;
}

if (!nearAnyGate && this.openingGate !== null) {
  this.openingGate   = null;
  this.gateOpenTimer = 0;
}

// Escape via open gate exit zone
const exitGate = this.gates.getOpenGateForExit(this.player.x, this.player.y);
if (exitGate !== null && !this.escaped) {
  this.socket.emit('escape');
}
```

- [ ] **Step 9: Add endgame timer update to `update()`**

In the `update()` method, near the end (after the role-specific interaction calls), add:

```ts
if (this.endgameReceivedAt !== null) {
  const elapsed    = this.time.now - this.endgameReceivedAt;
  const remaining  = Math.max(0, ENDGAME_DURATION_MS - elapsed);
  this.hud.setEndgameTimer(remaining);

  for (const threshold of [90_000, 60_000, 30_000]) {
    if (remaining <= threshold && !this.endgameBellsRung.has(threshold)) {
      this.endgameBellsRung.add(threshold);
      this.hud.flash(`${threshold / 1000}s restantes!`, 0xff6600, 2000);
    }
  }
}
```

- [ ] **Step 10: Update professor aura mode — two places**

**a) In `s.on('gameState', ...)`**, find:
```ts
if (myState?.role === 'professor') this.terminals.setAuraMode(true);
```
Replace with:
```ts
if (myState?.role === 'professor') {
  this.terminals.setAuraMode(true);
  this.gates.setAuraMode(true);
}
```

**b) In `s.on('assignRole', ...)`** (the handler that assigns `this.myRole`), find:
```ts
if (role === 'professor') {
  this.terminals.setAuraMode(true);
}
```
Replace with:
```ts
if (role === 'professor') {
  this.terminals.setAuraMode(true);
  this.gates.setAuraMode(true);
}
```

- [ ] **Step 11: Typecheck — expect clean build**

```
npm run typecheck
```

Expected: 0 errors. If any remain, they will be about removed method calls (`setGateOpen`, `unlockGate`, `gateOpen`, `isNearGate`) — track them down via the error output and remove them.

- [ ] **Step 12: Commit**

```
git add src/scenes/GameScene.ts
git commit -m "feat: wire ExitGateManager into GameScene — gate opening, endgame timer, escape zone"
```

---

## Task 12: Manual smoke test

- [ ] **Step 1: Start the dev server**

```
npm run dev
```

- [ ] **Step 2: Test gate powering**

Open two browser tabs. In the lobby, pick the same room. One player is professor, one is survivor. Start the match. Have the survivor hack terminals until `survivorCount + 1` are complete (with 1 survivor: 2 terminals). Both gate markers should turn green and the HUD should flash "Portões de saída disponíveis!".

- [ ] **Step 3: Test gate opening**

Survivor walks to gate 1 (world position 464, 2222). Hold E. The progress bar above the gate switch should fill over 20 seconds. The three lights should turn green at 25%, 50%, and 75%. At 100%, the PORTAO tiles at column 12 rows 70–74 should lose collision (survivor can walk through them).

- [ ] **Step 4: Test Endgame Collapse**

When the gate fully opens, the red countdown bar should appear at the top center of the screen with a 2:00 timer counting down. HUD flashes "COLAPSO FINAL!". Flash messages appear at 90s, 60s, 30s remaining.

- [ ] **Step 5: Test timer expiry**

Wait for the 2-minute timer to expire (or temporarily set `ENDGAME_DURATION_MS = 10_000` in `shared/gameRules.ts` for a quick test). Any survivor still in the map should be auto-expelled and the game should declare professor wins.

- [ ] **Step 6: Test escape via gate**

After a gate is opened, walk the survivor left through the former PORTAO tile column (past x ≈ 384). The exit zone at `x: 314–364, y: switchY ± 80` should trigger the `escape` emit. "FUGIU! Parabéns!" should flash and the survivor card should update to escaped state.

- [ ] **Step 7: Restore ENDGAME_DURATION_MS if changed**

If you set `ENDGAME_DURATION_MS = 10_000` for testing, restore it to `120_000`.

- [ ] **Step 8: Final commit**

```
git add shared/gameRules.ts
git commit -m "test: restore ENDGAME_DURATION_MS to 120_000 after smoke test"
```

_(Skip this step if you did not change the value.)_
