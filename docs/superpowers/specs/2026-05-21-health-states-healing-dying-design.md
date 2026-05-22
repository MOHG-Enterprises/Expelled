# Health States, Healing & Dying — Design Spec

Date: 2026-05-21

## Overview

Replaces the detention mini-game with a DBD-inspired dying state, down-count system, and altruistic healing mechanic. Healing mirrors the terminal hacking system exactly. The detention socket events are removed entirely.

---

## 1. Health States

| State    | `hp` | `downed` | Description |
|----------|------|----------|-------------|
| Healthy  | 2    | false    | Default. Full movement. |
| Injured  | 1    | false    | Sprite shows hurt/blood. Full movement speed. |
| Dying    | 0    | true     | Crawl only. Can self-recover up to 95%. Bleed-out timer active. |

Transitions:
- Healthy → Injured: hit by professor
- Injured → Dying: hit by professor
- Dying → Injured: healed by another survivor (`healPct` reaches 100)
- Injured → Healthy: healed by another survivor (`healPct` reaches 100)

---

## 2. Down Count & Expulsion

Each survivor has `downCount: 0 | 1 | 2`.

- On entering Dying state: `downCount++`, `healPct = 0`, `downBleedMs = 0`
- If `downCount` would exceed 2 when triggered: expel immediately (no Dying state entered)
- Bleed-out timer: every 500 ms server tick increments `downBleedMs` for each downed survivor
  - At `downBleedMs >= BLEED_OUT_MS (70 000 ms)`:
    - If `downCount === 1`: `downCount = 2`, reset `downBleedMs = 0`, `healPct = 0`, emit `downCountUpdated { id, downCount: 2 }`
    - If `downCount === 2`: expel, emit `playerExpelled`

`downCount` never resets during a match — it persists through revivals.

---

## 3. New Shared Constants (`shared/gameRules.ts`)

```
BLEED_OUT_MS          = 70_000   // 70s before downCount increments
HEAL_PASSIVE_RATE_MS  = 1_000    // tick interval for healing
HEAL_PASSIVE_TICK     = 5        // % per tick (altruistic)
HEAL_GREAT_BONUS      = 10       // % bonus on great skill check zone
HEAL_FAIL_REGRESSION  = 10       // % lost on skill check fail
HEAL_FAIL_LOCK_MS     = 3_000    // lock duration after fail
HEAL_AMOUNT_MAX       = 20       // server-side cap per event (anti-cheat)
HEAL_SELF_CAP         = 95       // max self-recovery while downed
HEAL_SELF_RATE_FACTOR = 0.5      // self-healing is half speed (→ 40s for 100%)
CRAWL_SPEED_FACTOR    = 0.28     // fraction of PLAYER_SPEED while downed
```

Retired: `DETENTION_SKILL_CHECKS_REQUIRED`

---

## 4. Server State Changes

### `PlayerRecord` new fields (`server/types.ts`)

```ts
downCount:    0 | 1 | 2;
healPct:      number;      // 0–100, progress toward next HP state
downBleedMs:  number;      // ms elapsed in current downed state
beingHealed:  boolean;     // true while another survivor is actively healing this player
```

### `PlayerState` new fields (`src/types.ts`)

```ts
downCount:  0 | 1 | 2;
healPct:    number;
beingHealed: boolean;
```

### Server-side tracking maps

- `roomHealingMap: Map<string, Map<string, string>>` — room → healerId → targetId  
  Mirrors `roomHackingMap`. Used to set/clear `beingHealed` on targets.

---

## 5. Socket Events

### Removed
- `detentionAnswer`
- `detentionProgress` (server → client)
- `detentionEscaped` (server → client)

### New (client → server)

| Event | Payload | Description |
|-------|---------|-------------|
| `healProgress` | `{ targetId, amount }` | Passive tick or great bonus. `targetId` can be self (downed self-recovery) or another survivor. |
| `setHealing` | `{ targetId: string \| null }` | Declares healer is targeting a survivor (or stopped). Server updates `roomHealingMap` and `beingHealed` flag. |
| `healSkillCheckFailed` | `{ targetId }` | Regresses `healPct` by `HEAL_FAIL_REGRESSION`, applies `HEAL_FAIL_LOCK_MS` lock, emits `healAlert` to room. |

### New (server → client)

| Event | Payload | Description |
|-------|---------|-------------|
| `healUpdate` | `{ targetId, healPct }` | Broadcast to room after every valid `healProgress`. |
| `healAlert` | `{ targetId, healerId }` | Broadcast to room on skill check fail. Professor uses this to show large red arrow. |
| `downCountUpdated` | `{ id, downCount }` | Broadcast when bleed-out increments a survivor's down count. |
| `setBeingHealed` | `{ targetId, isBeingHealed }` | Broadcast to the whole room. Target client pauses its own interaction timers; other clients update their view of who is healable (downed survivors already being healed are skipped in priority check). |

### Modified
- `playerDowned`: now includes `downCount` in payload — `{ id, downCount }`
- `playerRevived`: now includes `hp: 1` explicitly (survivor goes to Injured)

---

## 6. Server Validation Rules

**`healProgress` rejected if:**
- Sender is expelled, escaped, or professor
- `targetId` does not exist or is not a survivor
- Target is expelled or escaped
- Target `hp === 2` (already healthy — nothing to heal)
- `amount < 0` or `amount > HEAL_AMOUNT_MAX`
- Heal lock is active (post-fail cooldown)
- `targetId === socket.id` and target is not downed (self-heal only allowed while downed)
- `targetId === socket.id` and `healPct >= HEAL_SELF_CAP` (95 cap reached)
- `targetId === socket.id` and `beingHealed === true` (another survivor is already healing them)

**`healProgress` completion:**
- When `healPct >= 100`:
  - If `hp === 0`: `hp = 1`, `downed = false`, `healPct = 0`, emit `playerRevived { id, hp: 1 }`
  - If `hp === 1`: `hp = 2`, `healPct = 0`, emit `playerHealed { id, hp: 2 }`

**`hackProgress` rejected if:**
- Sender's `beingHealed === true`

---

## 7. Client Interaction System

### Priority order (checked every frame when E is held)

```
1. Nearest downed survivor within INTERACT_RADIUS (and not already being healed by someone else)
2. Nearest injured survivor within INTERACT_RADIUS
3. Nearest unhacked terminal within INTERACT_RADIUS
```

Mutual exclusion:
- Switching to heal → clears `hackingTerminal`, emits `setHacking(null)`, emits `setHealing({ targetId })`
- Switching to hack → clears `healingTarget`, emits `setHealing(null)`, emits `setHacking({ terminalId })`
- Only one of `hackingTerminal` or `healingTarget` is non-null at any time

### Self-recovery (downed survivor, not being healed)

- **If moving (any directional input):** `healPassiveTimer` and `healHoldTimer` reset. No ticks. Crawl movement at `PLAYER_SPEED * CRAWL_SPEED_FACTOR`.
- **If still:** `healPassiveTimer` fires every `HEAL_PASSIVE_RATE_MS`. Emits `healProgress { targetId: self.id, amount: HEAL_PASSIVE_TICK * HEAL_SELF_RATE_FACTOR }`.
- Periodic skill check fires via `healHoldTimer` (same 2500–5000 ms random pattern as hacking).
- Skill check outcomes (self): great → `healProgress { amount: HEAL_GREAT_BONUS * HEAL_SELF_RATE_FACTOR }`, normal → no extra emit, fail → `healSkillCheckFailed { targetId: self.id }`.
- Self-recovery pauses immediately when `beingHealed` becomes true (timers cleared on `setBeingHealed` event).

### Altruistic healing (live survivor heals another)

- Mirrors `_updateSurvivorInteractions` hack timers exactly, replacing terminal target with player target.
- Passive tick: `HEAL_PASSIVE_TICK` (full rate, not halved).
- Skill check outcomes: great → `healProgress { amount: HEAL_GREAT_BONUS }`, normal → no extra emit, fail → `healSkillCheckFailed { targetId }`.
- On release or walk away: `setHealing(null)` emitted.

### New client state fields in `GameScene`

```ts
private healingTarget:       string | null = null;   // socketId being healed
private healPassiveTimer:    number = 0;
private healHoldTimer:       number = 0;
private healNextThreshold:   number = 0;
private healLockUntil:       number = 0;
private beingHealed:         boolean = false;        // set by server event
```

---

## 8. HUD Changes

### Survivor self-HUD

- **Remove** the 2-segment HP bar (`selfHpBar`).
- **Add** 2 down-count dots below the role badge. Empty = down available, filled red = down used.
  - 0 filled: fresh survivor
  - 1 filled: one down spent
  - 2 filled: next hit or bleed-out = expelled
- **When downed:** show two bars below the down-count dots:
  - Orange bleed-out bar (fills left→right over 70 s)
  - Green recovery bar (fills left→right, caps at 95%)
- **When healing another:** show a `CURANDO` bar at the same position as `HACKEANDO`.

### Survivor cards (professor + other survivors)

- Down-count dots added to each card below the HP dots. Same visual as self-HUD.
- Bleed-out bar visible on card when that survivor is downed.

### Professor HUD — heal alert arrow

- On `healAlert` event: a large red arrow (1.5× normal size) appears at the screen edge pointing toward the survivor's world position.
- Flashes for 3 000 ms then fades. No notification box. No circle on the survivor sprite.
- Tracked in a separate `healAlertArrows: Map<string, number>` in `HUD` (targetId → expiry timestamp).
- Drawn in `updateTerminalArrows` call or a new `updateHealAlertArrows` call in `GameScene.update()`.

---

## 9. Files Changed

| File | Change |
|------|--------|
| `shared/gameRules.ts` | Add heal/bleed-out constants, remove `DETENTION_SKILL_CHECKS_REQUIRED` |
| `server/types.ts` | Add `downCount`, `healPct`, `downBleedMs`, `beingHealed` to `PlayerRecord` |
| `src/types.ts` | Add `downCount`, `healPct`, `beingHealed` to `PlayerState` |
| `server/gameState.ts` | Re-export new constants; update `freshGameState` defaults |
| `server/index.ts` | Remove detention handlers; add heal handlers; update bleed-out tick; update attack logic; add `roomHealingMap` |
| `src/scenes/GameScene.ts` | Remove detention logic; add heal interaction loop; add crawl movement; handle new socket events |
| `src/game/HUD.ts` | Remove HP bar; add down-count dots; add bleed-out/recovery bars; add heal-alert arrow logic |
| `src/game/PlayerManager.ts` | Pass `downCount`/`healPct` to card rendering |

---

## 10. Out of Scope

- Healing animations (uses existing skill check UI)
- Sound effects
- Professor picking up downed survivors
- Any perk/modifier system
