# Chase & Bloodlust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a DBD-inspired chase and bloodlust mechanic where the professor gains progressive speed boosts the longer a chase lasts, with the server as single source of truth.

**Architecture:** A 500 ms server tick (piggybacked on the existing `setInterval`) detects chase state per room, accumulates `chaseElapsed`, derives the bloodlust tier, and emits `bloodlustUpdate` only when the tier or chase-active flag changes. The professor client applies the resulting speed delta and updates the HUD indicator.

**Tech Stack:** TypeScript, Node.js/Socket.io (server), Phaser 3 (client), shared constants in `shared/gameRules.ts`

---

## File Map

| File | Change |
|---|---|
| `shared/gameRules.ts` | Add 6 chase/bloodlust constants |
| `server/types.ts` | Add `lookAngle` to `PlayerRecord`; add `chase` object to `GameStateRecord` |
| `server/gameState.ts` | Init `chase` in `freshGameState()`; re-export 4 new constants |
| `server/index.ts` | Accept `angle` in `move` handler; add chase tick to existing `setInterval`; reset bloodlust on hit |
| `src/constants.ts` | Re-export `BLOODLUST_SPEED_BONUS_PX_S` + 4 chase constants |
| `src/scenes/GameScene.ts` | Listen `bloodlustUpdate`; apply speed bonus; send `angle` in `move` emit |
| `src/game/HUD.ts` | Add `setChaseState(active, tier)` method + two new private fields |

---

## Task 1: Add constants to `shared/gameRules.ts`

**Files:**
- Modify: `shared/gameRules.ts`

- [ ] **Step 1: Add the six new constants at the end of the file**

```ts
// chase & bloodlust
export const CHASE_START_RADIUS_PX     = 384;              // 12 m × 32 px/m
export const CHASE_END_RADIUS_PX       = 576;              // 18 m × 32 px/m
export const CHASE_LOS_TIMEOUT_MS      = 8000;
export const CHASE_FOV_HALF_DEG        = 40;
export const BLOODLUST_TIER_TIMES_MS   = [15000, 25000, 35000] as const;
export const BLOODLUST_SPEED_BONUS_PX_S = [0, 6.4, 12.8, 19.2] as const;
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: no new errors

---

## Task 2: Add types to `server/types.ts`

**Files:**
- Modify: `server/types.ts`

- [ ] **Step 1: Add `lookAngle` to `PlayerRecord`**

In `server/types.ts`, inside `PlayerRecord`, add after `lastAttackTime`:

```ts
lookAngle: number;
```

- [ ] **Step 2: Add `chase` block to `GameStateRecord`**

In `server/types.ts`, inside `GameStateRecord`, add after `phase`:

```ts
chase: {
  target:    string | null;
  elapsed:   number;
  tier:      0 | 1 | 2 | 3;
  losLostAt: number | null;
};
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: errors only about `lookAngle` missing in the `joinRoom` initializer — those will be fixed in Task 3.

---

## Task 3: Init chase state in `server/gameState.ts`

**Files:**
- Modify: `server/gameState.ts`
- Modify: `server/index.ts` (add `lookAngle: 0` to `joinRoom` player initializer)

- [ ] **Step 1: Import the four new constants from `shared/gameRules.ts`**

At the top of `server/gameState.ts`, in the existing import block from `'../shared/gameRules'`, add:

```ts
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  BLOODLUST_SPEED_BONUS_PX_S,
```

- [ ] **Step 2: Re-export the four constants used by `server/index.ts`**

After the existing `export { ATTACK_STAGGER_MISS_MS };` line, add:

```ts
export { CHASE_START_RADIUS_PX };
export { CHASE_END_RADIUS_PX };
export { CHASE_LOS_TIMEOUT_MS };
export { CHASE_FOV_HALF_DEG };
export { BLOODLUST_TIER_TIMES_MS };
export { BLOODLUST_SPEED_BONUS_PX_S };
```

- [ ] **Step 3: Init `chase` and `lookAngle` in `freshGameState` and `joinRoom` initializer**

In `freshGameState()`, add `chase` to the returned object:

```ts
chase: { target: null, elapsed: 0, tier: 0, losLostAt: null },
```

In `server/index.ts` → `joinRoom` handler, the `state.players[socket.id]` initializer must include `lookAngle: 0`. Add it after `lastAttackTime: 0`:

```ts
lookAngle: 0,
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: no errors

---

## Task 4: Server chase tick + move handler + bloodlust reset on hit

**Files:**
- Modify: `server/index.ts`

### 4a — Import new constants

- [ ] **Step 1: Add new imports to the destructured import from `'./gameState'`**

In the existing import block at the top of `server/index.ts`, add:

```ts
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  BLOODLUST_SPEED_BONUS_PX_S,
```

### 4b — Add angle helper function

- [ ] **Step 2: Add a helper before the `setInterval` block (around line 76)**

```ts
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d >  Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
```

### 4c — Add chase tick inside the existing `setInterval`

The existing `setInterval` runs every 500 ms and already iterates over all rooms. Add the chase tick **after** the terminal regression block, still inside the `for` loop.

- [ ] **Step 3: Add chase tick block inside the existing `setInterval` loop**

After the closing `});` of the `(Object.keys(state.terminals) as TerminalId[]).forEach(...)` block (around line 103), and before the closing `}` of the `for` loop, add:

```ts
    // chase & bloodlust tick
    const prof = Object.entries(state.players).find(([, p]) => p.role === 'professor');
    const survivors = Object.entries(state.players).filter(
      ([, p]) => p.role === 'survivor' && !p.expelled && !p.downed,
    );

    const prevTier   = state.chase.tier;
    const wasActive  = state.chase.target !== null;
    const fovHalfRad = (CHASE_FOV_HALF_DEG * Math.PI) / 180;
    const now2       = Date.now();

    if (!prof || survivors.length === 0) {
      if (wasActive) {
        state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
        io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: false });
      }
    } else {
      const [, profData] = prof;

      if (state.chase.target === null) {
        // try to start a chase
        for (const [sid, s] of survivors) {
          const dist  = Math.hypot(s.x - profData.x, s.y - profData.y);
          const angle = Math.abs(angleDiff(Math.atan2(s.y - profData.y, s.x - profData.x), profData.lookAngle));
          if (dist <= CHASE_START_RADIUS_PX && angle <= fovHalfRad) {
            state.chase = { target: sid, elapsed: 0, tier: 0, losLostAt: null };
            io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: true });
            break;
          }
        }
      } else {
        // chase is active — check LoS for current target
        const target = state.players[state.chase.target];
        if (!target || target.expelled || target.downed) {
          // target left the game; try to find another
          state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
          io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: false });
        } else {
          const dist  = Math.hypot(target.x - profData.x, target.y - profData.y);
          const angle = Math.abs(angleDiff(Math.atan2(target.y - profData.y, target.x - profData.x), profData.lookAngle));
          const inView = dist <= CHASE_END_RADIUS_PX && angle <= fovHalfRad;

          if (inView) {
            state.chase.losLostAt = null;
          } else if (state.chase.losLostAt === null) {
            state.chase.losLostAt = now2;
          }

          const losTimeout = state.chase.losLostAt !== null && now2 - state.chase.losLostAt > CHASE_LOS_TIMEOUT_MS;
          const tooFar     = dist > CHASE_END_RADIUS_PX;

          if (losTimeout || tooFar) {
            state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
            io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: false });
          } else {
            state.chase.elapsed += 500;
            const newTier = (
              state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[2] ? 3 :
              state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[1] ? 2 :
              state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[0] ? 1 : 0
            ) as 0 | 1 | 2 | 3;

            if (newTier !== prevTier) {
              state.chase.tier = newTier;
              io.to(roomName).emit('bloodlustUpdate', { tier: newTier, chaseActive: true });
            }
          }
        }
      }
    }
```

### 4d — Accept `angle` in the `move` handler

- [ ] **Step 4: Update the `move` handler type signature and store `lookAngle`**

Find the line:
```ts
  socket.on('move', (data: { x: number; y: number }) => {
```
Replace with:
```ts
  socket.on('move', (data: { x: number; y: number; angle?: number }) => {
```

After `p.y = data.y;`, add:
```ts
    if (p.role === 'professor' && typeof data.angle === 'number' && isFinite(data.angle)) {
      p.lookAngle = data.angle;
    }
```

### 4e — Reset bloodlust on hit

- [ ] **Step 5: Reset bloodlust when the professor lands a hit**

Inside the `attack` handler, find where `hitAny` becomes `true` (inside the `Object.entries(state.players).forEach` callback, after the `if (target.hp <= 0)` block). Add a reset right after `hitAny = true;`:

```ts
      // hitAny = true; ← this line already exists; add the reset block immediately after it:
      if (state.chase.elapsed > 0 || state.chase.tier > 0) {
        state.chase.elapsed = 0;
        state.chase.tier    = 0;
        io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: state.chase.target !== null });
      }
```

- [ ] **Step 6: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: no errors

---

## Task 5: Re-export new constants from `src/constants.ts`

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Add `BLOODLUST_SPEED_BONUS_PX_S` and chase constants to the re-export block**

In `src/constants.ts`, in the existing block that re-exports from `'../shared/gameRules'`, add:

```ts
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  BLOODLUST_SPEED_BONUS_PX_S,
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: no errors

---

## Task 6: Update `GameScene.ts` — listener, speed bonus, angle in move emit

**Files:**
- Modify: `src/scenes/GameScene.ts`

### 6a — Import new constant

- [ ] **Step 1: Add `BLOODLUST_SPEED_BONUS_PX_S` to the import from `'../constants'`**

In the existing import block at the top of `GameScene.ts`, add `BLOODLUST_SPEED_BONUS_PX_S` to the named imports from `'../constants'`.

### 6b — Add state fields

- [ ] **Step 2: Add two private fields in the State section of the class**

After `private isHitStagger = false;` (around line 85), add:

```ts
private bloodlustTier:   0 | 1 | 2 | 3 = 0;
private chaseActive      = false;
```

### 6c — Listen to `bloodlustUpdate`

- [ ] **Step 3: Register the `bloodlustUpdate` socket listener**

Find where other socket listeners are registered in `create()` (look for patterns like `this.socket.on('playerHit', ...)`). Add alongside them:

```ts
    this.socket.on('bloodlustUpdate', ({ tier, chaseActive }: { tier: 0 | 1 | 2 | 3; chaseActive: boolean }) => {
      this.bloodlustTier = tier;
      this.chaseActive   = chaseActive;
      this.hud.setChaseState(chaseActive, tier);
    });
```

### 6d — Apply speed bonus for professor

- [ ] **Step 4: Apply bloodlust speed bonus in the movement calculation**

Find the block (around line 940):
```ts
    if (this.myRole === 'professor') {
      speed = PROFESSOR_SPEED;
    } else {
```

Replace with:
```ts
    if (this.myRole === 'professor') {
      speed = PROFESSOR_SPEED + BLOODLUST_SPEED_BONUS_PX_S[this.bloodlustTier];
    } else {
```

### 6e — Send `angle` in `move` emit

- [ ] **Step 5: Include `angle` in the move emit payload**

Find the line (around line 1015):
```ts
      this.socket.emit('move', { x: this.player.x, y: this.player.y });
```

Replace with:
```ts
      this.socket.emit('move', { x: this.player.x, y: this.player.y, angle: this.lookAngle });
```

- [ ] **Step 6: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: no errors

---

## Task 7: Add `setChaseState()` to `HUD.ts`

**Files:**
- Modify: `src/game/HUD.ts`

### 7a — Add private fields

- [ ] **Step 1: Add two new private fields for the chase indicator elements**

After `private currentTerrorLevel = -1;` (around line 57), add:

```ts
private chaseIndicatorBg!:   Phaser.GameObjects.Graphics;
private chaseIndicatorText!: Phaser.GameObjects.Text;
```

### 7b — Create elements in `build()`

- [ ] **Step 2: Create the chase indicator objects at the end of `build()`**, before `this._buildSurvivorCards()`:

```ts
    this.chaseIndicatorBg = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(30)
      .setAlpha(0);

    this.chaseIndicatorText = this.scene.add
      .text(762, 28, '', { fontSize: '12px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(31)
      .setAlpha(0);
```

### 7c — Implement `setChaseState()`

- [ ] **Step 3: Add the `setChaseState` public method at the end of the class (before the closing `}`)**

```ts
  setChaseState(active: boolean, tier: 0 | 1 | 2 | 3): void {
    if (this.currentRole !== 'professor') return;

    this.chaseIndicatorBg.clear();

    if (!active) {
      this.chaseIndicatorBg.setAlpha(0);
      this.chaseIndicatorText.setAlpha(0);
      return;
    }

    const tierColors: Record<number, { bg: number; text: string }> = {
      0: { bg: 0x333333, text: '#cccccc' },
      1: { bg: 0x665500, text: '#ffdd00' },
      2: { bg: 0x663300, text: '#ff8800' },
      3: { bg: 0x660000, text: '#ff2200' },
    };
    const { bg, text } = tierColors[tier];
    const tierLabel = tier === 0 ? 'CHASE' : `CHASE  ${'I'.repeat(tier)}`;

    this.chaseIndicatorBg.fillStyle(bg, 0.85);
    this.chaseIndicatorBg.fillRoundedRect(668, 26, 100, 20, 4);
    this.chaseIndicatorBg.lineStyle(1, 0xffffff, 0.2);
    this.chaseIndicatorBg.strokeRoundedRect(668, 26, 100, 20, 4);
    this.chaseIndicatorBg.setAlpha(1);

    this.chaseIndicatorText.setText(tierLabel).setColor(text).setAlpha(1);
  }
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: no errors

---

## Task 8: Manual smoke test

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Open two browser tabs** pointing to `http://localhost:3000`

- [ ] **Step 3: Join the same room** — first tab becomes professor, second becomes survivor

- [ ] **Step 4: Start the match** — professor clicks Start

- [ ] **Step 5: Professor walks toward survivor** — after ~1s the HUD should show "CHASE" badge (dark grey)

- [ ] **Step 6: Keep walking without hitting** — at 15 s the badge turns yellow "CHASE  I", at 25 s orange "CHASE  II", at 35 s red "CHASE  III"

- [ ] **Step 7: Verify professor speed visibly increases** at each tier transition

- [ ] **Step 8: Professor hits survivor** — badge resets to "CHASE" (grey, tier 0) but remains active since the chase target is still set

- [ ] **Step 9: Survivor moves out of FOV / walks away past ~576 px** — badge disappears after 8 s of LoS loss (or immediately if distance > 576 px)

- [ ] **Step 10: Re-engage** — badge reappears, timer restarts from 0
