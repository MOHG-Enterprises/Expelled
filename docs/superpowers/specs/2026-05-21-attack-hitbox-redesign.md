# Attack Hitbox Redesign

## Problem

Normal attack and lunge attack use a rectangular hitbox directly in front of the professor. Two issues:

1. Rectangle feels unnatural — a swing should be a cone/arc, not a box.
2. Lunge fires hitbox only after 230ms of dash; if a survivor is very close, the professor passes through them before the check fires.

## Goals

- Hitbox shape becomes a 2D cone (circular sector) for both attack types.
- Input redesign matches DBD: tap = Quick Attack, hold + release = Lunge Attack.
- Lunge: professor has full maneuverability during hold at 1.5× speed.
- Pass-through fix: continuous hit detection every frame during the lunge dash.

---

## Section 1 — Input Redesign

| Action | Result |
|---|---|
| Press attack button | Start `holdTimer`; movement speed → 1.5× immediately |
| Release < `LUNGE_THRESHOLD_MS` (300 ms) | **Quick Attack** fires |
| Release ≥ 300 ms | **Lunge Attack** fires |
| Hold until `LUNGE_MAX_HOLD_MS` (800 ms) | Auto-fires Lunge Attack |

- Swing animation plays on **release**, not on press.
- `playProfessorSlash()` removed; replaced by `onAttackPress()` / `onAttackRelease()` driven from `update()`.
- Speed resets to normal on release.

---

## Section 2 — Hitbox Shape (Cone)

Server-side check per target:

```
distSq = dx² + dy²
pass 1: distSq ≤ radius²
pass 2: |normalize(atan2(dy, dx) − attackAngle)| ≤ halfAngle
```

| Type | Radius | Half-angle | Feel |
|---|---|---|---|
| Quick Attack | 90 px | 50° | Short, wide, reliable at close range |
| Lunge Attack | 160 px | 40° | Long, slightly narrower |

Client debug visual (`showAttackHitbox`): arc + two lines (Phaser sector) instead of rectangle.

Constants removed: `ATTACK_HITBOX_WIDTH`, `ATTACK_HITBOX_DEPTH`.

Constants added (all in `shared/gameRules.ts`):

| Constant | Value |
|---|---|
| `LUNGE_THRESHOLD_MS` | 300 |
| `LUNGE_MAX_HOLD_MS` | 800 |
| `QUICK_ATTACK_RADIUS` | 90 |
| `QUICK_ATTACK_HALF_ANGLE_RAD` | `Math.PI * 50 / 180` |
| `LUNGE_ATTACK_RADIUS` | 160 |
| `LUNGE_ATTACK_HALF_ANGLE_RAD` | `Math.PI * 40 / 180` |

---

## Section 3 — Continuous Hit Detection During Lunge (lungeTick)

**Client:**
- After `LUNGE_THRESHOLD_MS` elapses during hold, every frame emits `lungeTick { x, y, angle }`.
- Rate-limited to one emit per 50 ms to avoid spam.

**Server — lungeTick handler:**
- First tick: creates `activeLunge: { hitTargets: Set<string> }` on the professor's `PlayerRecord`.
- Each tick: checks lunge cone against all survivors not in `hitTargets`; on hit, adds target to set and processes damage normally (`playerHit` / `playerDowned`).

**Server — attack handler (release):**
- If `lunge: true`: runs one final cone check (same logic), then clears `activeLunge`.
- If `lunge: false` (Quick Attack): runs single cone check with quick-attack dimensions, no `activeLunge` involved.

**Cleanup:** `activeLunge` is cleared on attackStagger, gameReset, and player disconnect.

---

## Section 4 — File Changes

| File | Change |
|---|---|
| `shared/gameRules.ts` | Remove `ATTACK_HITBOX_WIDTH/DEPTH`; add 6 new constants above |
| `src/constants.ts` | Re-export new constants |
| `server/types.ts` | Add `activeLunge?: { hitTargets: Set<string> }` to `PlayerRecord` |
| `server/gameState.ts` | Re-export new constants |
| `server/index.ts` | Add `lungeTick` handler; update `attack` handler to cone math; clean `activeLunge` on stagger/reset |
| `src/scenes/GameScene.ts` | Remove `playProfessorSlash`; add press/release logic in `update()`; emit `lungeTick`; update `showAttackHitbox` to cone visual |

No new files created. Server remains authoritative — client sends position + angle only, never decides if a hit landed.
