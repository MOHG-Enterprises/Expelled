# Interaction Prompt & Highlight Design

**Date:** 2026-05-25  
**Feature:** Visual feedback when survivor is near an interactable object

## Problem

Players have no visual indication that they are within interaction range of an object (terminal, gate switch, downed player). The key to press is unknown unless already discovered.

## Solution Overview

A new `InteractionPromptManager` class renders:
1. A pulsing white outline around the nearest interactable object
2. A text prompt above that object showing the key/button + action name

Both adapt to keyboard (`[E]`) or gamepad (`Ⓐ`) automatically using the existing `usingGamepad` flag from `InputState`.

## New File: `src/game/InteractionPromptManager.ts`

### Phaser objects (created once, reused each frame)

| Object | Type | Depth |
|---|---|---|
| `outlineGraphics` | `Phaser.GameObjects.Graphics` | 10 |
| `promptText` | `Phaser.GameObjects.Text` | 10 |

### API

```ts
show(x: number, y: number, w: number, h: number, label: string, usingGamepad: boolean): void
hide(): void
destroy(): void
```

- `show()` updates position and text without recreating objects. Starts a looping alpha tween (0.4 → 1.0 → 0.4, 600ms, `Sine.easeInOut`) on `outlineGraphics` if not already running.
- `hide()` sets both objects invisible and stops the tween.
- `destroy()` cleans up Phaser objects.

### Prompt text format

- Keyboard: `[E] {label}` — e.g. `[E] Hackear`
- Gamepad: `Ⓐ {label}` — e.g. `Ⓐ Hackear`

Text positioned at `(x, y - 28)`, origin `(0.5, 1)`, white color, small dark padding background via `setBackgroundColor`.

### Outline dimensions per object type

| Object | Label | Outline w × h |
|---|---|---|
| Terminal sprite | `Hackear` | 32 × 32 |
| Gate switch marker | `Abrir Portão` | 16 × 16 |
| Healable player sprite | `Curar` | 24 × 32 |

Outline drawn with `strokeRect(x - w/2, y - h/2, w, h)`, stroke width 2, color `0xffffff`.

## Integration: `HackingSystem`

Constructor receives `InteractionPromptManager` as a new parameter (after `setInputFrozen`).

At the **end** of `updateSelf()`, after all proximity checks have resolved, a single block determines what to display:

**Priority (highest first):**
1. Healing target found → `show(playerPos, 24, 32, "Curar", usingGamepad)`
2. Near terminal (not completed, not locked) → `show(terminalPos, 32, 32, "Hackear", usingGamepad)`
3. Near powered gate switch (not open) → `show(switchPos, 16, 16, "Abrir Portão", usingGamepad)`
4. None of the above → `hide()`

The prompt shows **whenever the player is in range**, regardless of whether E is currently held — it is an availability indicator, not an active-interaction indicator.

`usingGamepad` is read from `input.usingGamepad` — no new parameter needed, `InputState` already carries it.

`reset()` calls `hide()`.

## Integration: `GameScene`

- `create()`: instantiate `InteractionPromptManager` after the scene is ready; pass it to `HackingSystem` constructor.
- `update()`: when `inputFrozen = true`, call `promptManager.hide()` (skill check is active, no prompt needed).
- `destroy()` / game reset: call `promptManager.destroy()`.

## Scope

- Survivors only. Professor has no `updateSelf()` call and no interactable objects.
- No changes to server code.
- No changes to `TerminalManager`, `ExitGateManager`, or `PlayerManager` internals.
- `HackingSystem` constructor gains one parameter; `GameScene` instantiation site must be updated.
