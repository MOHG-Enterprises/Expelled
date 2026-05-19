# Chase & Bloodlust — Design Spec
**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Implement a DBD-inspired chase and bloodlust mechanic for the professor role. While the professor is actively chasing a survivor (survivor inside FOV cone within range), a chase timer accumulates. At 15 s / 25 s / 35 s the professor gains progressive speed boosts (Bloodlust Tier I / II / III). The chase and all bloodlust state reset immediately when the chase ends or when the professor lands a hit.

---

## Approach

**Approach A — Server-authority tick loop.**  
A `setInterval` running at 500 ms per active room evaluates chase conditions and broadcasts `bloodlustUpdate` only when tier or chase-active state changes. The server is the single source of truth; the client applies the resulting speed delta and updates the HUD.

---

## Constants (shared/gameRules.ts)

| Constant | Value | Notes |
|---|---|---|
| `CHASE_START_RADIUS_PX` | 384 | 12 m × 32 px/m |
| `CHASE_END_RADIUS_PX` | 576 | 18 m × 32 px/m |
| `CHASE_LOS_TIMEOUT_MS` | 8000 | ms without LoS before chase ends |
| `CHASE_FOV_HALF_DEG` | 40 | half-angle of professor FOV cone used for chase detection |
| `BLOODLUST_TIER_TIMES_MS` | `[15000, 25000, 35000]` | elapsed ms thresholds for tiers I, II, III |
| `BLOODLUST_SPEED_BONUS_PX_S` | `[0, 6.4, 12.8, 19.2]` | speed bonus per tier (0.2 m/s × 32 px/m per step) |

---

## Server State

### PlayerRecord additions (server/types.ts)
```ts
lookAngle: number;          // radians, updated from move event
```

### GameStateRecord additions (server/types.ts)
```ts
chase: {
  target:     string | null;  // socketId of survivor being chased
  elapsed:    number;         // ms accumulated in current chase
  tier:       0 | 1 | 2 | 3; // current bloodlust tier
  losLostAt:  number | null;  // timestamp when LoS was last lost
};
```

### freshGameState() (server/gameState.ts)
Include `chase: { target: null, elapsed: 0, tier: 0, losLostAt: null }`.

---

## Server Logic (server/index.ts)

### move event update
Add `angle: number` to the move payload. Store it in `PlayerRecord.lookAngle`.

### Chase tick loop

`startChaseLoop(roomName)` creates a `setInterval` at 500 ms. `stopChaseLoop(roomName)` clears it.

- Called on: `startChaseLoop` → when room enters `playing`; `stopChaseLoop` → on `gameOver`.

**Each tick:**

1. Find the professor `p` and all alive survivors (not expelled, not downed) in the room.
2. If no professor or no survivors → end chase if active, return.
3. For each survivor `s`, compute:
   - `dist = Math.hypot(s.x - p.x, s.y - p.y)`
   - `angle = Math.abs(angleDiff(Math.atan2(s.y - p.y, s.x - p.x), p.lookAngle))`
   - `inView = dist <= CHASE_START_RADIUS_PX && angle <= deg2rad(CHASE_FOV_HALF_DEG)`
4. **Chase start:** if `chase.target === null` and any survivor satisfies `inView` → set `chase.target` to that survivor's socketId, `chase.elapsed = 0`, `chase.losLostAt = null`.
5. **Chase active — LoS tracking:** if `chase.target` is set, check if the target survivor currently satisfies the cone+distance condition:
   - Yes → `chase.losLostAt = null`
   - No + `chase.losLostAt === null` → `chase.losLostAt = Date.now()`
6. **Chase end conditions** (check if `chase.target` is set):
   - `dist > CHASE_END_RADIUS_PX`, OR
   - `chase.losLostAt !== null && Date.now() - chase.losLostAt > CHASE_LOS_TIMEOUT_MS`
   → reset: `chase = { target: null, elapsed: 0, tier: 0, losLostAt: null }`
7. **Accumulate:** if still active, `chase.elapsed += 500`.
8. **Recalculate tier:**
   ```ts
   const newTier =
     chase.elapsed >= BLOODLUST_TIER_TIMES_MS[2] ? 3 :
     chase.elapsed >= BLOODLUST_TIER_TIMES_MS[1] ? 2 :
     chase.elapsed >= BLOODLUST_TIER_TIMES_MS[0] ? 1 : 0;
   ```
9. **Emit only on change:** if `newTier !== chase.tier` or chase-active status changed → emit `bloodlustUpdate { tier: newTier, chaseActive: chase.target !== null }` to the room; update `chase.tier`.

### playerHit handler update
When a hit is validated, reset bloodlust:
```ts
state.chase.elapsed = 0;
state.chase.tier    = 0;
// chase.target remains — professor keeps chasing after a hit
```
Emit `bloodlustUpdate { tier: 0, chaseActive: true }` to the room.

---

## Socket Events

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `move` | client→server | `{ x, y, dir, angle }` | `angle` field added |
| `bloodlustUpdate` | server→client (room) | `{ tier: 0\|1\|2\|3, chaseActive: boolean }` | emitted only on change |

---

## Client (GameScene.ts)

- Listen to `bloodlustUpdate`. Store `bloodlustTier` and `chaseActive` in local state.
- In `_updateProfessorInteractions`, apply speed:
  ```ts
  const speed = PROFESSOR_SPEED + BLOODLUST_SPEED_BONUS_PX_S[this.bloodlustTier];
  ```
- Include `angle: this.lookAngle` in every `move` emit.
- Call `this.hud.setChaseState(chaseActive, tier)` on each `bloodlustUpdate`.

---

## HUD (src/game/HUD.ts)

New method: `setChaseState(active: boolean, tier: 0 | 1 | 2 | 3): void`

- Only renders for professor role.
- When `active === false`: hide the indicator.
- When `active === true`: show "CHASE" label + tier badge (blank for 0, "I" / "II" / "III" for 1–3).
- Tier badge colors: Tier I = `0xffdd00` (yellow), Tier II = `0xff8800` (orange), Tier III = `0xff2200` (red).

---

## Files Affected

| File | Change |
|---|---|
| `shared/gameRules.ts` | Add 6 new constants |
| `server/types.ts` | Add `lookAngle` to `PlayerRecord`; add `chase` block to `GameStateRecord` |
| `server/gameState.ts` | Init `chase` in `freshGameState()`; re-export new constants |
| `server/index.ts` | Accept `angle` in `move`; add `startChaseLoop` / `stopChaseLoop`; call them on game start/end; reset bloodlust on hit |
| `src/constants.ts` | Re-export `BLOODLUST_SPEED_BONUS_PX_S` and new chase constants |
| `src/scenes/GameScene.ts` | Listen to `bloodlustUpdate`; apply speed bonus; send `angle` in `move` emit |
| `src/game/HUD.ts` | Add `setChaseState()` method |

---

## Out of Scope

- Bloodlust reset on miss (not requested).
- Bloodlust reset on chase target switch (not requested).
- Gradual bloodlust regression when chase ends (overridden: immediate reset).
- Pallet-break mechanic (no pallets in Expelled).
- Survivor locker-hiding mechanic.
