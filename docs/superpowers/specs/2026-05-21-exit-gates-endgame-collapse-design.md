# Exit Gates & Endgame Collapse — Design Spec

**Date:** 2026-05-21  
**Scope:** Exit Gates (two-gate layout, 20s hold-to-open) + Endgame Collapse (2-minute server-authoritative timer). No hatch mechanic.

---

## 1. Constants

All new constants live in `shared/gameRules.ts` and are re-exported from `server/gameState.ts` and `src/constants.ts`.

| Constant | Value | Meaning |
|---|---|---|
| `GATE_TICK_MS` | 500 | Client emits a gate-open tick every 500 ms while E is held |
| `GATE_TICK_AMOUNT` | 2.5 | % added per tick (40 ticks × 2.5% = 100% = 20 s) |
| `ENDGAME_DURATION_MS` | 120_000 | Endgame Collapse lasts 2 minutes |

`HACK_PASSIVE_RATE_MS` and `HACK_PASSIVE_TICK` are not changed.

---

## 2. Data Model

### 2.1 New type

`server/types.ts` gains:

```ts
export type GateId = 'g1' | 'g2';
```

### 2.2 GameStateRecord changes

Remove `gateOpen: boolean`. Add:

```ts
gates:           Record<GateId, number>;   // opening progress 0-100 per gate
gatesOpen:       Record<GateId, boolean>;  // true once a gate is fully opened (tiles removed)
gatesPowered:    boolean;                  // true when hackedCount >= survivorCount + 1
endgameStartedAt: number | null;           // Date.now() timestamp; null = not started
```

### 2.3 freshGameState update

```ts
gates:            { g1: 0, g2: 0 },
gatesOpen:        { g1: false, g2: false },
gatesPowered:     false,
endgameStartedAt: null,
```

### 2.4 Gate positions (server/gameState.ts)

```ts
export const GATE_POSITIONS: Record<GateId, Vec2> = {
  g1: { x: 464, y: 2222 },
  g2: { x: 464, y: 1722 },
};
```

### 2.5 PORTAO tile ranges to clear on open

```ts
export const GATE_TILE_RANGES: Record<GateId, { col: number; rowStart: number; rowEnd: number }> = {
  g1: { col: 12, rowStart: 70, rowEnd: 74 },
  g2: { col: 12, rowStart: 47, rowEnd: 51 },
};
```

---

## 3. Socket Events

### 3.1 Client → Server

| Event | Payload | When |
|---|---|---|
| `gateOpenTick` | `{ gateId: GateId }` | Survivor holds E at powered, unopened gate switch every `GATE_TICK_MS` |

### 3.2 Server → Client (room broadcast)

| Event | Payload | When |
|---|---|---|
| `gatesPowered` | — | `hackedCount >= survivorCount + 1` for the first time |
| `gateProgress` | `{ gateId: GateId, progress: number }` | Each accepted `gateOpenTick` |
| `gateOpened` | `{ gateId: GateId }` | Gate progress reaches 100 |
| `endgameStarted` | `{ startAt: number }` | First gate fully opened |

The existing `gateUnlocked` event is **removed** (replaced by `gatesPowered`).  
The existing `escape` client→server event and `playerEscaped` broadcast are unchanged.

---

## 4. Server Logic (`server/index.ts`)

### 4.1 Terminal hacking — gate power check

Replace:
```ts
if (state.hackedCount >= survivorCount && !state.gateOpen)
```
With:
```ts
const threshold = survivorCount + 1;
if (state.hackedCount >= threshold && !state.gatesPowered)
```
Emit `gatesPowered` instead of `gateUnlocked`.

### 4.2 gateOpenTick handler

```
on('gateOpenTick', { gateId })
  validate: playing, survivor, not downed, not expelled, gates powered, gate not already open
  increment gates[gateId] by GATE_TICK_AMOUNT, cap at 100
  emit gateProgress { gateId, progress: gates[gateId] }
  if gates[gateId] >= 100:
    gatesOpen[gateId] = true
    emit gateOpened { gateId }
    if endgameStartedAt is null:
      endgameStartedAt = Date.now()
      emit endgameStarted { startAt: endgameStartedAt }
      startEndgameInterval(roomName)
```

### 4.3 hackProgress handler — terminal block during endgame

Add early return at top of `hackProgress` handler:
```ts
if (state.endgameStartedAt !== null) return;
```

### 4.4 escape handler

Replace `if (!state.gateOpen)` guard with:
```ts
if (!state.gatesOpen.g1 && !state.gatesOpen.g2) return;
```

### 4.5 Endgame Collapse interval

`startEndgameInterval(roomName)`:
- `setInterval` every 1000 ms
- Check `Date.now() - state.endgameStartedAt >= ENDGAME_DURATION_MS`
- If elapsed: expel all non-escaped, non-expelled survivors, emit `playerExpelled` for each, call `checkWinConditions`, clear interval
- Store interval handle in a `Map<string, NodeJS.Timeout>` keyed by room name
- Clear and delete handle on game reset and on game-over

---

## 5. ExitGateManager (client — new file)

**File:** `src/game/ExitGateManager.ts`

### 5.1 Per-gate state

```ts
interface GateObj {
  switchX: number;
  switchY: number;
  progress: number;
  powered: boolean;
  open: boolean;
  bar: Phaser.GameObjects.Rectangle;        // progress bar fill
  barBg: Phaser.GameObjects.Rectangle;      // background bar
  lights: Phaser.GameObjects.Rectangle[];   // 3 indicator lights
  exitZone: Phaser.Geom.Rectangle;          // invisible zone past gate opening
}
```

### 5.2 Visual layout (per gate, at switchX/switchY)

- Background bar: 48 × 6 px, grey, centered above switch
- Progress fill: 0 × 6 px, green, grows left-to-right
- 3 lights: 6 × 6 px rectangles, 8 px apart, grey → green at 25/50/75%
- Marker rectangle (the switch itself): 16 × 16 px, grey → bright green when powered
- Exit zone: `Phaser.Geom.Rectangle` at `{ x: switchX - 150, y: switchY - 80, width: 50, height: 160 }` (outside the gate, past the tile column; column 12 tiles sit at x=384, so this zone at x≈314–364 is clearly outside)

### 5.3 Public API

| Method | Signature | Purpose |
|---|---|---|
| `setPowered` | `(id: GateId) => void` | Switch marker turns bright green |
| `setProgress` | `(id: GateId, pct: number) => void` | Update bar + lights (lights activate at ≥25/50/75) |
| `setOpen` | `(id: GateId, map: Phaser.Tilemaps.Tilemap) => void` | Remove PORTAO tile collisions, mark gate open |
| `isNearSwitch` | `(id: GateId, x: number, y: number) => boolean` | Distance < `INTERACT_RADIUS` from switch |
| `getOpenGateForExit` | `(x: number, y: number) => GateId \| null` | Returns gate id if player is inside an open gate's exit zone |
| `setAuraMode` | `(on: boolean) => void` | Professor aura: shows gate markers even through fog |

### 5.4 `setOpen` tile removal

```ts
setOpen(id, map) {
  const { col, rowStart, rowEnd } = GATE_TILE_RANGES[id];
  const layer = map.getLayer('PORTAO')?.tilemapLayer;
  if (!layer) return;
  for (let row = rowStart; row <= rowEnd; row++) {
    const tile = map.getTileAt(col, row, false, 'PORTAO');
    tile?.setCollision(false);
  }
  this.gates[id].open = true;
}
```

---

## 6. GameScene Changes

### 6.1 New fields

```ts
private gates!:         ExitGateManager;
private openingGate:    GateId | null = null;
private gateOpenTimer:  number = 0;
private endgameStartAt: number | null = null;
private endgameReceivedAt: number | null = null; // Phaser scene time when endgameStarted was received
private endgameBellsRung = new Set<number>(); // tracks which bell thresholds (90s, 60s, 30s) already fired
```

### 6.2 create()

Instantiate `ExitGateManager` after `TerminalManager`. Wire new socket events:

```ts
s.on('gatesPowered', () => {
  this.gates.setPowered('g1');
  this.gates.setPowered('g2');
  this.hud.flash('Portões de saída disponíveis!', 0x00e676);
});

s.on('gateProgress', ({ gateId, progress }) => {
  this.gates.setProgress(gateId, progress);
});

s.on('gateOpened', ({ gateId }) => {
  this.gates.setOpen(gateId, this.mapRef!);
  this.hud.flash('Portão aberto! Fuja agora!', 0x00e676, 4000);
  // play buzzer sound if audio exists
});

s.on('endgameStarted', ({ startAt }) => {
  this.endgameStartAt = startAt;
  this.endgameBellsRung.clear();
  this.terminals.blockAll(); // dim terminals
});
```

Remove handler for `gateUnlocked`. Replace `gateOpen` flag usage with `ExitGateManager` state.

### 6.3 _updateSurvivorInteractions — gate opening

```
for each GateId ['g1', 'g2']:
  if gates.isNearSwitch(id, player.x, player.y) AND gate powered AND gate not open:
    show "Hold E to open gate" prompt on HUD
    if E held:
      openingGate = id
      gateOpenTimer += delta
      while gateOpenTimer >= GATE_TICK_MS:
        gateOpenTimer -= GATE_TICK_MS
        socket.emit('gateOpenTick', { gateId: id })
    else:
      if openingGate === id: openingGate = null, gateOpenTimer = 0

escape check (existing, now uses getOpenGateForExit):
  const exitGate = gates.getOpenGateForExit(player.x, player.y)
  if exitGate !== null:
    socket.emit('escape')
```

### 6.4 update() — Endgame Collapse timer

```ts
if (this.endgameStartAt !== null) {
  const elapsed = this.time.now - this.endgameStartAt; // client time since received event
  const remaining = Math.max(0, ENDGAME_DURATION_MS - elapsed);
  this.hud.setEndgameTimer(remaining);
  
  // bell thresholds: 90s, 60s, 30s remaining
  for (const threshold of [90_000, 60_000, 30_000]) {
    if (remaining <= threshold && !this.endgameBellsRung.has(threshold)) {
      this.endgameBellsRung.add(threshold);
      // play bell sound if audio exists
    }
  }
}
```

Note: `this.time.now` is Phaser scene time (ms since scene start). `endgameStartAt` from server is `Date.now()`. These clocks differ. Store both `endgameStartAt` (server timestamp) and the local scene time when the event arrived (`endgameReceivedAt = this.time.now`). Use `elapsed = this.time.now - this.endgameReceivedAt`.

### 6.5 resetState()

Clear `openingGate`, `gateOpenTimer`, `endgameStartAt`, `endgameReceivedAt`, `endgameBellsRung`.

---

## 7. HUD Changes

### 7.1 New method: setEndgameTimer

```ts
setEndgameTimer(remainingMs: number | null): void
```

- `null` → hides the timer bar
- Otherwise: renders a red bar at top of screen (fixed to camera), width proportional to `remainingMs / ENDGAME_DURATION_MS`, with a text label showing `MM:SS`

---

## 8. TerminalManager Changes

### 8.1 blockAll

```ts
blockAll(): void
```

Dims all terminal bars and markers. Existing `unlockGate()` method is **removed** (replaced by `ExitGateManager`).

### 8.2 Remove gateMarker

The hardcoded `gateMarker` rectangle at (740, 560) is removed. `ExitGateManager` owns gate visuals.

---

## 9. Removal / Cleanup

| Item | Action |
|---|---|
| `gateOpen: boolean` on `GameStateRecord` | Removed |
| `state.gateOpen = true` in server | Removed |
| `gateUnlocked` socket event | Removed (replaced by `gatesPowered`) |
| `TerminalManager.gateMarker` | Removed |
| `TerminalManager.unlockGate()` | Removed |
| `GameScene.gateOpen` field | Removed |
| `GameScene.isNearGate()` | Removed (replaced by `ExitGateManager.isNearSwitch`) |
| `hud.setGateOpen(...)` call | Removed |
| `HUD.setGateOpen` method | Removed (if it exists) |

---

## 10. Out of Scope

- Hatch mechanic
- Professor gate-open interaction
- Sound assets (bell, buzzer) — code hooks are present but guarded; no crash if assets missing
- Timer slowdown when survivors are downed (DBD feature, not included)
