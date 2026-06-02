---
name: professor-no-kick-regressing
description: Professor cannot kick/regress terminals that are already regressing — same treatment as 0% progress terminals
metadata:
  type: project
---

## Context

The server already blocks double-regression via `if (t.regressing) return;` in `processReinforceTerminal` (`server/systems/hacking.ts:154`). However, the client still shows the "Chutar" prompt and plays the kick animation for regressing terminals, emitting a `reinforceTerminal` event that gets silently ignored.

## Goal

Regressing terminals should be invisible to professor interaction — no prompt, no animation, no event — identical to how terminals at 0% progress are excluded from `nearTermInfo`.

## Design

### `src/game/TerminalManager.ts`

Add a public method that exposes the internal `regressingTerminals` state:

```ts
isRegressing(id: TerminalId): boolean {
  return this.regressingTerminals.has(id);
}
```

### `src/scenes/GameScene.ts`

Extend the `nearTermInfo` condition (line ~932) to also exclude regressing terminals:

```ts
// Before
const nearTermInfo = nearTermId && this.terminals.getProgress(nearTermId) > 0
  ? { id: nearTermId, pos: this.terminals.getPositions()[nearTermId]! }
  : null;

// After
const nearTermInfo = nearTermId && this.terminals.getProgress(nearTermId) > 0 && !this.terminals.isRegressing(nearTermId)
  ? { id: nearTermId, pos: this.terminals.getPositions()[nearTermId]! }
  : null;
```

## Invariants

- No change to server logic — the existing guard in `hacking.ts` remains as a safety net.
- No change to `CombatSystem` signature or logic.
- The "Chutar" prompt disappears while the terminal is regressing and reappears when regression ends (i.e., when `terminalRegressing { isRegressing: false }` is received).
