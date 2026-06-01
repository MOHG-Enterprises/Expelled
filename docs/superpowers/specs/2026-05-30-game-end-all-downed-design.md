# Game End When All Survivors Downed or Expelled

**Date:** 2026-05-30

## Problem

The professor win condition only triggers when every survivor is `expelled`. A survivor becomes expelled only after the 70-second bleed-out timer expires. When all survivors are `downed`, the game idles for up to 70 s per player before ending.

## Goal

End the game immediately when no survivor can act — i.e., when every non-escaped survivor is either `expelled` or `downed`.

## Design

### Win condition change (`server/gameState.ts`)

Replace the professor win check:

```typescript
// before
allSurvivors.every((p) => p.expelled)

// after
allSurvivors.filter(p => !p.escaped).every(p => p.expelled || p.downed)
```

Escaped survivors are excluded because they are already out of the game. Survivors win is checked first, so "all escaped" is already handled before this line executes.

### Trigger win check on down (`server/systems/combat.ts`)

In `applyDamage`, after setting `target.downed = true`, call `checkWinConditions` — the same way it is called today after `target.expelled = true`. This ensures the game ends the moment the last standing survivor falls.

## Edge case matrix

| State | Outcome |
|---|---|
| All downed, none expelled | Professor wins immediately on last down |
| Mix of expelled + downed | Professor wins when last standing survivor falls |
| Some escaped, rest downed | Professor wins (remaining players have no one to revive them) |
| All escaped | Survivors win (checked first, unchanged) |

## Files changed

- `server/gameState.ts` — one-line condition change in `checkWinConditions`
- `server/systems/combat.ts` — add `checkWinConditions` call in `applyDamage` after the downed branch
