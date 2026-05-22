# Attack Hitbox Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the professor's rectangular attack hitbox with a 2D cone, redesign input to press-and-hold = lunge (release fires), and add per-frame hit detection during the lunge dash.

**Architecture:** `shared/gameRules.ts` defines cone constants used by both client and server. The server gains a `lungeTick` socket handler that runs cone checks each frame during the lunge dash, storing already-hit targets in `PlayerRecord.activeLunge` to prevent double-hits. The client tracks hold time on press; release fires quick (<300ms) or lunge (≥300ms) attack.

**Tech Stack:** TypeScript, Phaser 3 (client), Socket.io (events), Node.js (server)

---

## File Map

| File | Change |
|---|---|
| `shared/gameRules.ts` | Remove `ATTACK_HITBOX_WIDTH/DEPTH`; add 6 new cone constants |
| `src/constants.ts` | Update re-exports |
| `server/gameState.ts` | Update imports + re-exports |
| `server/types.ts` | Add `activeLunge?` field to `PlayerRecord` |
| `server/index.ts` | Add `lungeTick` handler; replace rectangle math with cone in `attack` handler |
| `src/scenes/GameScene.ts` | Remove lunge fields; add hold-state fields; redesign input; update hitbox visual |

---

## Task 1: Update shared constants

**Files:**
- Modify: `shared/gameRules.ts`

- [ ] **Step 1: Edit `shared/gameRules.ts`**

Replace lines 11–12 (the two `ATTACK_HITBOX_*` constants) and add the new constants below `ATTACK_STAGGER_MISS_MS`:

```typescript
export const ATTACK_COOLDOWN_MS = 1500;
export const DETENTION_SKILL_CHECKS_REQUIRED = 3;
export const HACK_FAIL_REGRESSION = 10;
export const HACK_FAIL_LOCK_MS = 3000;
export const HACK_AMOUNT_MAX = 25;
export const HACK_EFFICIENCY_PENALTY = 15;
export const HACK_KICK_REGRESSION = 5;
export const HACK_REGRESSION_RATE_PCT_S = 4;
export const HACK_REGRESSION_EVENTS_MAX = 8;

export const ATTACK_STAGGER_HIT_MS  = 2700;
export const ATTACK_STAGGER_MISS_MS = 1500;

export const LUNGE_THRESHOLD_MS         = 300;
export const LUNGE_MAX_HOLD_MS          = 800;
export const QUICK_ATTACK_RADIUS        = 90;
export const QUICK_ATTACK_HALF_ANGLE_RAD = Math.PI * 50 / 180;
export const LUNGE_ATTACK_RADIUS        = 160;
export const LUNGE_ATTACK_HALF_ANGLE_RAD = Math.PI * 40 / 180;

export const CHASE_START_RADIUS_PX = 384;
export const CHASE_END_RADIUS_PX = 576;
export const CHASE_LOS_TIMEOUT_MS = 8000;
export const CHASE_FOV_HALF_DEG = 40;
export const BLOODLUST_TIER_TIMES_MS = [15000, 25000, 35000] as const;
export const BLOODLUST_SPEED_BONUS_PX_S = [0, 6.4, 12.8, 19.2] as const;
```

- [ ] **Step 2: Commit**

```
git add shared/gameRules.ts
git commit -m "feat: replace rectangle hitbox constants with cone constants"
```

---

## Task 2: Update re-exports + server types

**Files:**
- Modify: `src/constants.ts`
- Modify: `server/gameState.ts`
- Modify: `server/types.ts`

- [ ] **Step 1: Update `src/constants.ts` re-exports**

Replace the two old lines:
```typescript
  ATTACK_HITBOX_WIDTH,
  ATTACK_HITBOX_DEPTH,
```
With:
```typescript
  LUNGE_THRESHOLD_MS,
  LUNGE_MAX_HOLD_MS,
  QUICK_ATTACK_RADIUS,
  QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS,
  LUNGE_ATTACK_HALF_ANGLE_RAD,
```

- [ ] **Step 2: Update `server/gameState.ts` import block**

Replace the import lines for the old constants:
```typescript
  ATTACK_HITBOX_WIDTH,
  ATTACK_HITBOX_DEPTH,
  ATTACK_STAGGER_HIT_MS,
  ATTACK_STAGGER_MISS_MS,
```
With:
```typescript
  ATTACK_STAGGER_HIT_MS,
  ATTACK_STAGGER_MISS_MS,
  LUNGE_THRESHOLD_MS,
  LUNGE_MAX_HOLD_MS,
  QUICK_ATTACK_RADIUS,
  QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS,
  LUNGE_ATTACK_HALF_ANGLE_RAD,
```

Then replace the old re-export lines:
```typescript
export { ATTACK_HITBOX_WIDTH };
export { ATTACK_HITBOX_DEPTH };
export { ATTACK_STAGGER_HIT_MS };
export { ATTACK_STAGGER_MISS_MS };
```
With:
```typescript
export { ATTACK_STAGGER_HIT_MS };
export { ATTACK_STAGGER_MISS_MS };
export { LUNGE_THRESHOLD_MS };
export { LUNGE_MAX_HOLD_MS };
export { QUICK_ATTACK_RADIUS };
export { QUICK_ATTACK_HALF_ANGLE_RAD };
export { LUNGE_ATTACK_RADIUS };
export { LUNGE_ATTACK_HALF_ANGLE_RAD };
```

- [ ] **Step 3: Add `activeLunge` to `server/types.ts`**

Add the field to `PlayerRecord` after `lastAttackTime`:
```typescript
export interface PlayerRecord {
  x: number;
  y: number;
  role: Role;
  ready: boolean;
  detentionHits: number;
  hp: number;
  downed: boolean;
  expelled: boolean;
  escaped: boolean;
  lastAttackTime: number;
  activeLunge?: { hitTargets: Set<string> };
  lookAngle: number;
}
```

- [ ] **Step 4: Run typecheck**

```
npm run typecheck
```

Expected: no errors (only constants changed, no logic yet).

- [ ] **Step 5: Commit**

```
git add src/constants.ts server/gameState.ts server/types.ts
git commit -m "feat: update re-exports and add activeLunge to PlayerRecord"
```

---

## Task 3: Add `lungeTick` handler to server

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Update imports in `server/index.ts`**

Find the import block that includes `ATTACK_HITBOX_WIDTH` and `ATTACK_HITBOX_DEPTH` (from `server/gameState.ts`) and replace those two lines with:
```typescript
  QUICK_ATTACK_RADIUS,
  QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS,
  LUNGE_ATTACK_HALF_ANGLE_RAD,
```

- [ ] **Step 2: Add `lungeTick` handler**

Add this handler immediately before the `socket.on('attack', ...)` handler:

```typescript
socket.on('lungeTick', ({ x, y, angle }: { x: number; y: number; angle: number }) => {
  const room = getRoomForSocket(socket.id);
  if (!room) return;
  const { roomName, state } = room;
  const attacker = state.players[socket.id];
  if (!attacker || attacker.role !== 'professor') return;
  if (typeof x !== 'number' || typeof y !== 'number') return;
  if (typeof angle !== 'number' || !isFinite(angle)) return;

  const now = Date.now();
  if (now - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;

  if (!attacker.activeLunge) {
    attacker.activeLunge = { hitTargets: new Set() };
  }

  const radius    = LUNGE_ATTACK_RADIUS;
  const halfAngle = LUNGE_ATTACK_HALF_ANGLE_RAD;

  Object.entries(state.players).forEach(([id, target]) => {
    if (target.role !== 'survivor' || target.downed || target.expelled) return;
    if (attacker.activeLunge!.hitTargets.has(id)) return;

    const dx = target.x - x;
    const dy = target.y - y;
    if (dx * dx + dy * dy > radius * radius) return;

    let angleDiff = Math.abs(Math.atan2(dy, dx) - angle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    if (angleDiff > halfAngle) return;

    attacker.activeLunge!.hitTargets.add(id);
    target.hp--;
    if (target.hp <= 0) {
      target.hp = 0;
      target.downed = true;
      target.detentionHits = 0;
      io.to(roomName).emit('playerDowned', id);
    } else {
      io.to(roomName).emit('playerHit', { targetId: id, hp: target.hp });
    }
  });
});
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add server/index.ts
git commit -m "feat: add lungeTick server handler with per-lunge hit tracking"
```

---

## Task 4: Replace rectangle with cone in server `attack` handler

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Replace the hit-detection block inside `socket.on('attack', ...)`**

Find and replace everything from `const depth = ATTACK_HITBOX_DEPTH;` through the closing `});` of the `forEach` (the block that checks `along`, `perp`). Replace with:

```typescript
const radius    = lunge ? LUNGE_ATTACK_RADIUS    : QUICK_ATTACK_RADIUS;
const halfAngle = lunge ? LUNGE_ATTACK_HALF_ANGLE_RAD : QUICK_ATTACK_HALF_ANGLE_RAD;
const exclude   = lunge ? attacker.activeLunge?.hitTargets : undefined;

let hitAny = false;
Object.entries(state.players).forEach(([id, target]) => {
  if (target.role !== 'survivor' || target.downed || target.expelled) return;
  if (exclude?.has(id)) return;

  const dx = target.x - x;
  const dy = target.y - y;
  if (dx * dx + dy * dy > radius * radius) return;

  let angleDiff = Math.abs(Math.atan2(dy, dx) - angle);
  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
  if (angleDiff > halfAngle) return;

  hitAny = true;
  target.hp--;
  if (target.hp <= 0) {
    target.hp = 0;
    target.downed = true;
    target.detentionHits = 0;
    io.to(roomName).emit('playerDowned', id);
  } else {
    io.to(roomName).emit('playerHit', { targetId: id, hp: target.hp });
  }
});

attacker.activeLunge = undefined;
```

The line `attacker.activeLunge = undefined;` goes immediately after the `forEach` closes, before the bloodlust-reset block.

Note: the `attack` handler already has `const { x, y, angle, lunge } = ...` destructuring. Ensure `lunge` is included in that destructuring; it already was in the original code.

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add server/index.ts
git commit -m "feat: replace rectangle hitbox with cone in server attack handler"
```

---

## Task 5: Client — field cleanup + imports

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Update imports**

On line 9 of `GameScene.ts`, replace:
```typescript
  ATTACK_HITBOX_WIDTH, ATTACK_HITBOX_DEPTH,
```
With:
```typescript
  LUNGE_THRESHOLD_MS, LUNGE_MAX_HOLD_MS,
  QUICK_ATTACK_RADIUS, QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS, LUNGE_ATTACK_HALF_ANGLE_RAD,
```

- [ ] **Step 2: Remove old fields, add new fields**

In the professor-state fields block (around lines 81–86), remove:
```typescript
private isLunging      = false;
private lungeVec:       { x: number; y: number } | null = null;
private lungeSpeed      = 0;
```

And add after `private swingDirection`:
```typescript
private attackHoldStart: number | null = null;
private lastLungeTick   = 0;
private padAttackJustUp = false;
```

- [ ] **Step 3: Add `padAttackJustUp` to gamepad update block**

Find the gamepad block (around line 896). After `this.padAttackJust = padAttackNow && !this.padPrevAttack;` and BEFORE `this.padPrevAttack = padAttackNow;`, add:
```typescript
this.padAttackJustUp = !padAttackNow && this.padPrevAttack;
```

- [ ] **Step 4: Clean up `isLunging` / `lungeVec` / `lungeSpeed` references**

There are several places that reference the removed fields. Replace each:

**In the inputFrozen stagger-reset block** (around line 919–922), remove these two lines:
```typescript
this.isLunging  = false;
this.lungeVec = null;
```
And add after `this.isSwinging = false;`:
```typescript
this.attackHoldStart = null;
```

**In the game reset block** (around line 425–428), remove:
```typescript
this.isLunging = false;
this.lungeVec = null;
```
And add:
```typescript
this.attackHoldStart = null;
```

- [ ] **Step 5: Run typecheck**

```
npm run typecheck
```

Expected: errors on `lungeSpeed` / `lungeVec` / `isLunging` still in `playProfessorSlash` — those will be fixed in Task 6. Ignore those specific errors for now, verify no other new errors.

- [ ] **Step 6: Commit**

```
git add src/scenes/GameScene.ts
git commit -m "refactor: remove lunge state fields, add hold-state fields to GameScene"
```

---

## Task 6: Client — speed multiplier + isSwinging block

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Apply 1.5× speed during attack hold**

Find the speed computation block (around line 966):
```typescript
if (this.myRole === 'professor') {
  speed = PROFESSOR_SPEED + BLOODLUST_SPEED_BONUS_PX_S[this.bloodlustTier];
} else {
```

Replace with:
```typescript
if (this.myRole === 'professor') {
  speed = PROFESSOR_SPEED + BLOODLUST_SPEED_BONUS_PX_S[this.bloodlustTier];
  if (this.attackHoldStart !== null && !this.isSwinging) speed *= 1.5;
} else {
```

- [ ] **Step 2: Simplify `isSwinging` velocity block**

Find the block around line 1013:
```typescript
if (this.isSwinging) {
  const swingBody = this.player.body as Phaser.Physics.Arcade.Body;
  if (this.isLunging && this.lungeVec) {
    swingBody.setVelocity(this.lungeVec.x * this.lungeSpeed, this.lungeVec.y * this.lungeSpeed);
  } else {
    swingBody.setVelocity(0, 0);
  }
  this.slashSprite?.setPosition(this.player.x, this.player.y);
}
```

Replace with:
```typescript
if (this.isSwinging) {
  (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  this.slashSprite?.setPosition(this.player.x, this.player.y);
}
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
```

Expected: errors only inside `playProfessorSlash` (the old method still references removed fields). Next task removes it.

- [ ] **Step 4: Commit**

```
git add src/scenes/GameScene.ts
git commit -m "feat: apply 1.5x speed during attack hold, simplify swing velocity block"
```

---

## Task 7: Client — redesign attack input + fire logic

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Replace `playProfessorSlash` with `_playProfessorSlash` + `_fireAttack`**

Delete the entire existing `playProfessorSlash()` method (from `private playProfessorSlash()` through its closing `}`). Replace it with the two methods below:

```typescript
private _fireAttack(isLunge: boolean) {
  this.attackHoldStart = null;
  if (this.isSwinging || this.isKicking) return;
  this._playProfessorSlash(isLunge);
}

private _playProfessorSlash(isLunge: boolean) {
  this.isSwinging     = true;
  this.swingDirection = this.facingDirection;

  this.player.setVisible(false);
  const slash = this.add.sprite(this.player.x, this.player.y, 'professor-slash')
    .setDepth(6)
    .setDisplaySize(128, 128);
  this.slashSprite = slash;
  slash.play(`professor-slash:${this.swingDirection}`);

  const angle = this.lookAngle;
  this.showAttackHitbox(this.player.x, this.player.y, angle, isLunge);
  this.socket.emit('attack', { x: this.player.x, y: this.player.y, angle, lunge: isLunge });

  slash.once('animationcomplete', () => {
    slash.destroy();
    this.slashSprite    = null;
    this.isSwinging     = false;
    this.swingDirection = null;
    this.player.setVisible(true);
  });
}
```

- [ ] **Step 2: Redesign `_updateProfessorInteractions`**

Replace the entire method body with:

```typescript
private _updateProfessorInteractions() {
  const now = this.time.now;

  if ((Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust) && !this.isSwinging && !this.isKicking) {
    this.attackHoldStart = now;
  }

  if (this.attackHoldStart !== null && !this.isSwinging && (now - this.attackHoldStart) >= LUNGE_MAX_HOLD_MS) {
    this._fireAttack(true);
  }

  if (this.attackHoldStart !== null && !this.isSwinging) {
    const heldMs = now - this.attackHoldStart;
    if (heldMs >= LUNGE_THRESHOLD_MS && (now - this.lastLungeTick) > 50) {
      this.lastLungeTick = now;
      this.socket.emit('lungeTick', { x: this.player.x, y: this.player.y, angle: this.lookAngle });
    }
  }

  const spaceJustUp = Phaser.Input.Keyboard.JustUp(this.spaceKey);
  if ((spaceJustUp || this.padAttackJustUp) && this.attackHoldStart !== null && !this.isSwinging) {
    const heldMs = now - this.attackHoldStart;
    this._fireAttack(heldMs >= LUNGE_THRESHOLD_MS);
  }

  if (Phaser.Input.Keyboard.JustDown(this.eKey) || this.padActionJust) {
    const t = this.terminals.nearest(this.player.x, this.player.y);
    if (t) this.playProfessorKick(t);
  }
}
```

- [ ] **Step 3: Run typecheck**

```
npm run typecheck
```

Expected: no errors (all removed fields are gone, new methods are in place).

- [ ] **Step 4: Commit**

```
git add src/scenes/GameScene.ts
git commit -m "feat: redesign professor attack input to press-hold-release with quick/lunge split"
```

---

## Task 8: Client — cone hitbox visual

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Replace `showAttackHitbox` with cone version**

Find `private showAttackHitbox(x: number, y: number, angle: number)` and replace the entire method with:

```typescript
private showAttackHitbox(x: number, y: number, angle: number, isLunge: boolean) {
  const radius    = isLunge ? LUNGE_ATTACK_RADIUS    : QUICK_ATTACK_RADIUS;
  const halfAngle = isLunge ? LUNGE_ATTACK_HALF_ANGLE_RAD : QUICK_ATTACK_HALF_ANGLE_RAD;

  const g = this.add.graphics().setDepth(30);
  g.lineStyle(2, 0xff2222, 1);
  g.fillStyle(0xff2222, 0.25);

  const steps = 16;
  const pts: { x: number; y: number }[] = [{ x, y }];
  for (let i = 0; i <= steps; i++) {
    const a = angle - halfAngle + (2 * halfAngle * i / steps);
    pts.push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius });
  }
  pts.push({ x, y });

  g.strokePoints(pts, false);
  g.fillPoints(pts, true, false);
  this.time.delayedCall(500, () => g.destroy());
}
```

- [ ] **Step 2: Run typecheck (final)**

```
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Manual test**

Run `npm run dev`, open the game as professor:

1. **Quick attack:** tap attack button quickly — short wide cone visible, no speed boost felt
2. **Lunge attack:** hold 300ms+ then release — longer narrower cone, speed boost during hold
3. **Auto-fire:** hold until 800ms — lunge fires automatically
4. **Pass-through fix:** stand very close to a survivor, initiate lunge — survivor gets hit before professor passes them
5. **No double-hit:** lunge through a survivor — they get hit only once

- [ ] **Step 4: Commit**

```
git add src/scenes/GameScene.ts
git commit -m "feat: replace rectangle hitbox visual with cone arc in showAttackHitbox"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Cone hitbox (both types) | Task 1 constants, Task 4 server, Task 8 client |
| Quick attack = tap, short range wide | Task 1 constants, Task 7 input |
| Lunge = hold + release, longer range | Task 1 constants, Task 7 input |
| Full maneuverability during lunge hold | Task 6 speed multiplier |
| 1.5× speed during hold | Task 6 speed multiplier |
| Max hold auto-fires | Task 7 input |
| Continuous hit detection during dash | Task 3 lungeTick handler |
| No double-hit per lunge | Task 3 `activeLunge.hitTargets` |
| `activeLunge` cleared on attack | Task 4 |
| Cone visual debug | Task 8 |

All requirements covered. No TBDs. No placeholders.
