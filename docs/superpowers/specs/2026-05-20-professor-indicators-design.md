# Design: Professor Indicators & Loud Noise Notification

**Date:** 2026-05-20  
**Status:** Approved

---

## Overview

Two features for the professor (killer) role:

1. **Terminal indicators** — The professor always knows where every incomplete terminal is, via a persistent glow aura on each terminal + screen-edge arrows for off-screen ones.
2. **Loud noise notification** — When a survivor fails a skill check, the professor sees a prominent notification bubble + a temporary blinking arrow pointing to the terminal that triggered it.

---

## Approach

Extend existing classes (`TerminalManager` and `HUD`). No new files.

---

## Feature 1: Terminal Indicators

### Glow aura (TerminalManager)

- `TerminalManager` gains an `auraGraphics: Phaser.GameObjects.Graphics` object at depth 1 (below terminal sprites), normal scroll factor (world-space).
- New method: `setAuraMode(active: boolean)` — when `true`, draws an orange (`0xff8800`) ring of radius ~22px around each incomplete terminal and starts a looping alpha tween (`0.4 → 0.9`, 900 ms yoyo).
- When `active` is `false`, the rings and tween are destroyed/cleared.
- `setProgress()` already handles terminal completion — when `progress >= 100`, that terminal's ring is removed from `auraGraphics` and the graphics is redrawn.
- `GameScene` calls `terminals.setAuraMode(true)` after the role is confirmed as `professor` (inside the `roleAssigned` socket handler).

### Screen-edge arrows (HUD)

- `HUD` gains `arrowGraphics: Phaser.GameObjects.Graphics` (scrollFactor 0, depth 31).
- New method: `updateTerminalArrows(positions: Record<string, Vec2>, completed: Set<string>, camX: number, camY: number, screenW: number, screenH: number)`.
- Called every frame from `GameScene.update()` only when `myRole === 'professor'`.
- For each incomplete terminal:
  - Compute screen position: `sx = pos.x - camX`, `sy = pos.y - camY`.
  - If `sx` and `sy` are within `[0, screenW]` × `[0, screenH]`, no arrow drawn.
  - Otherwise, clamp direction vector to screen edge (16 px inset margin) and draw a filled triangle pointing toward the terminal. Color: `0xff8800`, alpha `0.75`.
- Full redraw every frame (clear + redraw all arrows).

---

## Feature 2: Loud Noise Notification

### Trigger

Replaces the current `hud.flash(...)` call inside the `firewallAlert` socket handler in `GameScene` (professor branch). `terminals.flashAlert()` stays as-is.

### Notification bubble (HUD)

- New method: `showLoudNoiseAlert(terminalId: string, worldPos: Vec2, camX: number, camY: number, screenW: number, screenH: number)`.
- Creates a temporary container at screen position `(screenW - 160, 20)` (top-right area):
  - Black rounded rectangle background with a 2px orange/red border.
  - `⚡` icon in orange and text `SKILL CHECK — <terminalId>` in white.
  - Auto-destroys after 4000 ms via `scene.time.delayedCall`.
- A 1-second cooldown between repeated calls prevents spam (tracked by `lastLoudNoiseTime`).

### Temporary blinking arrow (HUD)

- Reuses `arrowGraphics` but distinguishes loud-noise arrows from persistent arrows via a `loudNoiseArrows: Array<{ terminalId: string; expiresAt: number }>` list.
- In `updateTerminalArrows`, for terminals with an active loud-noise entry, draw the arrow in yellow (`0xffcc00`) with a pulsing alpha tween instead of the static orange.
- Entry expires after 4000 ms (same lifetime as the bubble).
- If the terminal is on-screen during a loud noise, draw a yellow ring around it for the same duration instead of an arrow.

---

## Data Flow

```
firewallAlert (server) 
  → GameScene handler (professor branch)
    → terminals.setFailed(id)         // existing
    → terminals.flashAlert(id)        // existing
    → hud.showLoudNoiseAlert(id, pos, cam...)  // NEW (replaces hud.flash)

GameScene.update() [professor only]
  → hud.updateTerminalArrows(terminals.positions, terminals.completed, cam...)  // NEW
```

`TerminalManager` exposes `positions` and `completed` as read-only getters so `GameScene` can pass them to `HUD`.

---

## What changes per file

| File | Change |
|------|--------|
| `src/game/TerminalManager.ts` | Add `auraGraphics`, `setAuraMode()`, expose `getPositions()` and `getCompleted()` getters |
| `src/game/HUD.ts` | Add `arrowGraphics`, `loudNoiseArrows`, `updateTerminalArrows()`, `showLoudNoiseAlert()` |
| `src/scenes/GameScene.ts` | Call `setAuraMode(true)` on role assignment; call `updateTerminalArrows()` in update(); replace `hud.flash` in `firewallAlert` handler with `showLoudNoiseAlert()` |

---

## Out of scope

- Sound effects (no audio assets available).
- Survivor-side indicators.
- Minimap.
