# Design: Downed Player Arrows + HUD Card Status Bars

**Date:** 2026-05-23
**Status:** Approved

---

## Overview

Two features:
1. Survivors see directional arrows pointing to downed teammates (same arrow system the professor uses for terminals). A downed survivor sees arrows to ALL other survivors so they know where to run after revival.
2. Each survivor's HUD card gains a bleed-out bar (visible to all) and a heal-progress bar (visible to survivors only, hidden from professor).

No server changes required.

---

## Feature 1 — Downed Player Arrows

### Visibility rules

| Viewer state | Arrow targets |
|---|---|
| Standing survivor | All downed, non-expelled, non-escaped remote survivors |
| Downed survivor | All non-expelled, non-escaped remote survivors (downed or standing) |
| Professor | No change — only sees terminal arrows |

Arrows do not appear for the local player (can't point at yourself).

### HUD changes (`src/game/HUD.ts`)

Add method:

```ts
updateDownedArrows(
  positions: Record<string, { x: number; y: number }>,
  camX: number, camY: number,
  screenW: number, screenH: number,
): void
```

Implementation mirrors the terminal-arrow loop inside `updateTerminalArrows()`:
- Reuses `this.arrowGraphics` (same Graphics object, same `clear()` cadence)
- Color: `0xff6600` (orange — distinct from terminal yellow `0xffcc00` and heal-alert red `0xff2222`)
- Triangle size: 12 (same as terminals)
- No circle overlay (no "loud noise" concept)
- No expiry — arrows persist as long as the position is in the map

`updateTerminalArrows()` and `updateDownedArrows()` both write into `arrowGraphics`. The existing call already does `arrowGraphics.clear()` at the start of `updateTerminalArrows()`. Since only one role calls each method in a given frame, there is no double-clear conflict. If both need to coexist in the same frame (they don't — professor and survivor are mutually exclusive roles), they can share the same frame safely by calling them back-to-back.

### GameScene changes (`src/scenes/GameScene.ts`)

In `update()`, inside the survivor branch (after fog/movement, where professor already calls `updateTerminalArrows`):

```ts
if (this.myRole === 'survivor') {
  const cam = this.cameras.main;
  const downedPositions: Record<string, { x: number; y: number }> = {};
  for (const [id, info] of this.survivorInfo) {
    if (id === this.socket.id) continue;
    if (info.expelled || info.escaped) continue;
    if (!this.downed && !info.downed) continue; // standing → only downed targets
    const pos = this.players.getPosition(id);
    if (pos) downedPositions[id] = pos;
  }
  this.hud.updateDownedArrows(downedPositions, cam.scrollX, cam.scrollY, cam.width, cam.height);
}
```

This call must happen both inside the `inputFrozen` early-return block (downed players have frozen input) and in the normal update path. The survivor branch currently has no arrow call in either path — add to both.

---

## Feature 2 — HUD Card Status Bars

### Data flow

**New field in `SurvivorStatus`** (`src/game/HUD.ts`):
```ts
bleedMs: number;   // ms elapsed in current downed state (0 if not downed)
```
`healPct` already exists on `SurvivorStatus`.

**New field in `GameScene`:**
```ts
private survivorBleedMs = new Map<string, number>();
```

Lifecycle:
- `playerDowned(id)` → `survivorBleedMs.set(id, 0)`
- `downCountUpdated(id)` → `survivorBleedMs.set(id, 0)`
- `playerRevived(id)` → `survivorBleedMs.delete(id)`
- `playerExpelled(id)` / `playerLeft(id)` → `survivorBleedMs.delete(id)`
- `gameState` sync → for each player with `downed === true`, `survivorBleedMs.set(id, 0)` if not already set (initial sync happens at game start when bleed is 0)
- `update()` → for each id in `survivorBleedMs`, increment by `delta` capped at `BLEED_OUT_MS`

`refreshSurvivorHUD()` passes `bleedMs: this.survivorBleedMs.get(id) ?? 0` in the status object.

### HUD changes

**`SurvivorStatus` type** gains `bleedMs: number`.

**`HUD.setSurvivorStatuses()`** passes `showHealPct = this.myRole === 'survivor'` to each card (derived once per call, same for all cards).

**`SurvivorCard.show()`** gains two parameters:
```ts
healPct:     number,
bleedMs:     number,
showHealPct: boolean,
```

### Card layout

Card dimensions: `CARD_W=78, CARD_H=76, PORT_H=44`. Bottom area = 32px.

Current occupants of bottom area:
- Name text at `y + 50` (10px font)
- HP dots centered around `y + 53`, radius 5 (occupy `y+48..y+58`)

New bars added only when `downed === true`:

| Bar | Y position | Height | Color | Formula |
|---|---|---|---|---|
| Bleed-out | `cardY + 63` | 4px | `0xff6600` (orange) | `bleedMs / 70_000` |
| Heal progress | `cardY + 69` | 4px | `0x81c995` (green) | `healPct / 100` |

Bar x: `CARD_X + 4`, width: `CARD_W - 8 = 70px`.

Heal bar only drawn when `showHealPct && healPct > 0`.

Both bars have a dark background (`0x1a1a1a`) at the same position.

When not downed, bars are not drawn (Graphics cleared with card redraw each frame via `show()`).

### Visibility summary

| Element | Survivor | Professor |
|---|---|---|
| Bleed-out bar | ✓ | ✓ |
| Heal progress bar | ✓ (only if `healPct > 0`) | ✗ |

---

## Files changed

| File | Change |
|---|---|
| `src/game/HUD.ts` | Add `bleedMs` to `SurvivorStatus`; add `updateDownedArrows()`; update `setSurvivorStatuses()` signature |
| `src/game/hud/SurvivorCard.ts` | Add `healPct`, `bleedMs`, `showHealPct` to `show()`; draw two mini bars when downed |
| `src/scenes/GameScene.ts` | Add `survivorBleedMs` map; wire lifecycle events; call `updateDownedArrows()` in survivor update paths |

No server changes. No new socket events.
