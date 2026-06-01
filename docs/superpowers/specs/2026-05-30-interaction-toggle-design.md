# Interaction Toggle Design

**Date:** 2026-05-30

## Overview

Replace the hold-E interaction mechanic with a toggle. Pressing E once activates the interaction; any movement input deactivates it. The skill check no longer freezes the survivor — moving during a skill check counts as a failure.

## Changes

### 1. `SkillCheck` — new `cancel()` method

Add a public `cancel()` method that calls the stored `onFail` callback and hides the skill check UI. Required so `HackingSystem` can force a failure when the player moves.

### 2. `HackingSystem` — `interactionActive` toggle flag

Add `private interactionActive = false` to the class. Include it in `reset()`.

In `updateSelf`, after computing proximity variables (`healableNearby`, `nearT`, `nearS`) but before the interaction branches:

- If `input.actionJust` AND (`healableNearby || nearT || nearS`) AND `!interactionActive` → set `interactionActive = true`
- If `input.intendedToMove` → set `interactionActive = false`; if `skillCheck.active` → call `skillCheck.cancel()`

Replace all uses of `eHeld` (`input.actionHeld`) with `interactionActive` in the three interaction branches (heal, hack, gate).

### 3. `HackingSystem._runHackSkillCheck` and `_runHealSkillCheck`

Remove all `setInputFrozen(true)` and `setInputFrozen(false)` calls. The survivor is no longer frozen during skill checks.

### 4. `GameScene.update` — skill check hit outside `inputFrozen`

Move the skill check hit handling to before the `inputFrozen` early return, so it runs regardless of freeze state:

```ts
if (this.skillCheck.active && (input.attackJust || input.actionJust)) {
  this.skillCheck.tryHit();
}
```

Remove the equivalent block from inside `if (this.inputFrozen)`.

## Behaviour table

| Situation | Result |
|---|---|
| Press E near terminal/player/gate | `interactionActive = true`, interaction starts |
| Any movement input while interacting | `interactionActive = false`, interaction stops |
| Movement input while skill check is active | `skillCheck.cancel()` → fail + interaction stops |
| SPACE or E while skill check is active | `skillCheck.tryHit()` |
| Skill check needle completes full rotation | Auto-fail — no change from current |
| Press E with nothing nearby | Nothing happens |

## Scope

- Hacking terminals: covered by toggle replacing `eHeld` in hack branch
- Healing downed players: covered by toggle replacing `eHeld` in heal branch
- Opening gates: covered by toggle replacing `eHeld` in gate branch
- Touch and gamepad: `input.actionJust` already maps both — no additional changes

## Out of scope

- Any visual feedback change for the toggle state (e.g., prompt staying visible while active) — existing prompt logic is unchanged
- Server-side changes — none required
