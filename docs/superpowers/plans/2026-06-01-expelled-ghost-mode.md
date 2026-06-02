# Expelled Ghost Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a survivor is expelled, they become a ghost that roams freely with 25% opacity, passes through walls, sees the full map, and has a special HUD — while a static corpse sprite remains at the expelled position visible to all.

**Architecture:** Ghost mode activates on `playerExpelled` for self: sets `ghost = true`, clears `inputFrozen`, disables physics collision via `checkCollision.none`, reveals full map via `FogOfWar.setFullReveal(true)`, and spawns a static corpse sprite. The server is changed to forward `move` events from expelled players. Other clients spawn a corpse at the last known position and already render the expelled player at 25% alpha via existing code.

**Tech Stack:** Phaser 3 (Arcade Physics, GameObjects.Sprite), Socket.io, TypeScript

**Spec:** `docs/superpowers/specs/2026-06-01-expelled-ghost-mode-design.md`

---

## Files

| File | Change |
|---|---|
| `src/constants.ts` | Add `GHOST_SPEED_FACTOR` |
| `src/game/FogOfWar.ts` | Add `setFullReveal(enabled)` |
| `src/game/MovementSystem.ts` | Add `ghost` to `MovementContext`; ghost speed; skip downed animation |
| `src/game/PlayerManager.ts` | Add `getFacingDirection(id)` getter |
| `src/game/HUD.ts` | Add `ghostLabel`; implement `setGhostMode(enabled)` |
| `src/scenes/GameScene.ts` | Add `ghost` flag, `corpseSprites` map, `_spawnCorpse()`; update expelled handlers; update `update()` loop; update `resetLocalState()` |
| `server/index.ts` | Remove `p.expelled` guard from `move` handler |

---

### Task 1: Add GHOST_SPEED_FACTOR constant

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Add constant**

In `src/constants.ts`, on the line after `export const CRAWL_SPEED_FACTOR    = 0.28;`, add:

```ts
export const GHOST_SPEED_FACTOR    = 1.8;
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/constants.ts
git commit -m "feat: add GHOST_SPEED_FACTOR constant"
```

---

### Task 2: Add FogOfWar.setFullReveal

**Files:**
- Modify: `src/game/FogOfWar.ts`

- [ ] **Step 1: Add method**

In `src/game/FogOfWar.ts`, insert after `rebuildGrid()` (around line 60):

```ts
setFullReveal(enabled: boolean) {
  this.overlay?.setVisible(!enabled);
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/FogOfWar.ts
git commit -m "feat: add FogOfWar.setFullReveal for ghost vision"
```

---

### Task 3: Update MovementSystem for ghost speed and animation

**Files:**
- Modify: `src/game/MovementSystem.ts`

- [ ] **Step 1: Import GHOST_SPEED_FACTOR**

Replace the import from `../constants` with:

```ts
import {
  PLAYER_SPEED, PLAYER_SPRINT_SPEED, PROFESSOR_SPEED,
  ON_HIT_SPRINT_SPEED, CRAWL_SPEED_FACTOR, GHOST_SPEED_FACTOR,
  BLOODLUST_SPEED_BONUS_PX_S,
} from '../constants';
```

- [ ] **Step 2: Add ghost to MovementContext**

Replace the `MovementContext` interface with:

```ts
export interface MovementContext {
  role:              Role | null;
  downed:            boolean;
  sprinting:         boolean;
  onHitSprintTimer:  number;
  bloodlustTier:     0 | 1 | 2 | 3;
  attackHoldActive:  boolean;
  isSwinging:        boolean;
  skinId:            string;
  ghost:             boolean;
}
```

- [ ] **Step 3: Use ghost speed in update()**

In `MovementSystem.update()`, the speed block for survivors currently reads:

```ts
if (ctx.downed) {
  speed = PLAYER_SPEED * CRAWL_SPEED_FACTOR;
} else if (ctx.onHitSprintTimer > 0) {
  speed = ON_HIT_SPRINT_SPEED;
} else {
  speed = ctx.sprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
}
```

Replace it with:

```ts
if (ctx.ghost) {
  speed = PLAYER_SPEED * GHOST_SPEED_FACTOR;
} else if (ctx.downed) {
  speed = PLAYER_SPEED * CRAWL_SPEED_FACTOR;
} else if (ctx.onHitSprintTimer > 0) {
  speed = ON_HIT_SPRINT_SPEED;
} else {
  speed = ctx.sprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
}
```

- [ ] **Step 4: Skip downed animation when ghost in applyAnimation()**

In `MovementSystem.applyAnimation()`, the first two lines currently are:

```ts
const { role, downed, skinId } = ctx;
if (!role) return;

if (downed && role === 'survivor') {
```

Change to:

```ts
const { role, downed, skinId, ghost } = ctx;
if (!role) return;

if (downed && !ghost && role === 'survivor') {
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: errors about missing `ghost` in `movCtx` literals in `GameScene.ts` — normal, fixed in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/game/MovementSystem.ts
git commit -m "feat: ghost speed and animation support in MovementSystem"
```

---

### Task 4: Add getFacingDirection to PlayerManager

**Files:**
- Modify: `src/game/PlayerManager.ts`

- [ ] **Step 1: Add getter after getPosition()**

`getPosition()` is around line 264. Add after it:

```ts
getFacingDirection(id: string): MoveDirection | null {
  const p = this.others[id];
  return p ? p.facingDirection : null;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/PlayerManager.ts
git commit -m "feat: expose getFacingDirection on PlayerManager"
```

---

### Task 5: Add setGhostMode to HUD

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Declare ghostLabel field**

In the private fields block at the top of the class (around line 24–65), add:

```ts
private ghostLabel!: Phaser.GameObjects.Text;
```

- [ ] **Step 2: Create ghostLabel in build()**

At the end of `build()`, just before the two lines that reposition `downWarn1` and `downWarn2` by `downWarnY`, add:

```ts
this.ghostLabel = this.scene.add
  .text(400, 284, '💀 FANTASMA 💀', {
    fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    stroke: '#000', strokeThickness: 4,
  })
  .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(31).setAlpha(0);
```

- [ ] **Step 3: Add setGhostMode() method**

Add after `setHealProgress()` (around line 267):

```ts
setGhostMode(enabled = true) {
  this.ghostLabel.setAlpha(enabled ? 0.6 : 0);
  if (enabled) {
    this.downWarn1.setAlpha(0);
    this.downWarn2.setAlpha(0);
    this.setBleedOutProgress(null);
    this.setRecoveryProgress(null);
    this.setHackProgress(null);
    this.setHealProgress(null);
    this.damageVignette.setAlpha(0);
  }
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: add ghost mode HUD label"
```

---

### Task 6: Add ghost field, corpseSprites map, and _spawnCorpse helper to GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add class fields**

In the `GameScene` class fields (around line 67–68, after `private expelled = false;`), add:

```ts
private ghost         = false;
private corpseSprites = new Map<string, Phaser.GameObjects.Sprite>();
```

- [ ] **Step 2: Reset ghost state in resetLocalState()**

In `resetLocalState()`, after `this.expelled = false;`, add:

```ts
this.ghost = false;
this.corpseSprites.clear();
```

- [ ] **Step 3: Add _spawnCorpse() helper**

Add as a private method near the end of the class (before or after `_getDownedArrowPositions` or similar helpers):

```ts
private _spawnCorpse(id: string, x: number, y: number, skinId: string, direction: MoveDirection) {
  const effectiveSkin = skinId || 'arthur';
  const skin = getSkinById(effectiveSkin);
  if (!skin.hurt) return;
  const sprite = this.add.sprite(x, y, skin.hurt.key).setDepth(3);
  applyDownedFrameById(sprite, effectiveSkin, direction);
  this.corpseSprites.set(id, sprite);
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors (ghost missing from movCtx still expected from Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: add ghost field, corpseSprites, and _spawnCorpse to GameScene"
```

---

### Task 7: Update expelled socket handlers

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Remove inputFrozen from 'expelled' handler**

Find `s.on('expelled', ...)` (around line 641). Change:

```ts
s.on('expelled', () => {
  this.expelled    = true;
  this.inputFrozen = true;
  this.hud.update(this.myRole, this.myHp, false);
  this.hud.flash('EXPULSO!', 0xff4444, 4000);
});
```

To:

```ts
s.on('expelled', () => {
  this.expelled = true;
  this.hud.update(this.myRole, this.myHp, false);
  this.hud.flash('EXPULSO!', 0xff4444, 4000);
});
```

- [ ] **Step 2: Replace playerExpelled self-branch with ghost setup**

Find `s.on('playerExpelled', ...)` (around line 721). Replace the `if (id === s.id)` branch:

Before:
```ts
if (id === s.id) {
  this.expelled    = true;
  this.inputFrozen = true;
  this.player.setAlpha(0.25);
  this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
  this.hud.flash('Você foi expulso!', 0xff1744, 4000);
}
```

After:
```ts
if (id === s.id) {
  this.expelled     = true;
  this.ghost        = true;
  this.downed       = false;
  this.inputFrozen  = false;
  this.player.setAlpha(0.25);
  (this.player.body as Phaser.Physics.Arcade.Body).checkCollision.none = true;
  this.fog.setFullReveal(true);
  this._spawnCorpse(id, this.player.x, this.player.y, this.mySkinId, this.movement.facingDirection);
  this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
  this.hud.flash('Você foi expulso!', 0xff1744, 4000);
  this.hud.setGhostMode(true);
}
```

- [ ] **Step 3: Spawn corpse for other players**

In the `else` branch of the same handler, after the existing lines, add corpse spawn:

Before:
```ts
} else {
  this.players.setAlpha(id, 0.25);
  if (this.myRole === 'professor') this.hud.flash('Aluno expulso!', 0x00e676);
}
```

After:
```ts
} else {
  this.players.setAlpha(id, 0.25);
  if (this.myRole === 'professor') this.hud.flash('Aluno expulso!', 0x00e676);
  const pos    = this.players.getPosition(id);
  const dir    = this.players.getFacingDirection(id) ?? 'down';
  const skinId = this.survivorMeta.get(id)?.skinId ?? 'arthur';
  if (pos) this._spawnCorpse(id, pos.x, pos.y, skinId, dir);
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: error about missing `ghost` in `movCtx` — fixed in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: activate ghost mode and spawn corpses on expulsion"
```

---

### Task 8: Update update() loop for ghost path

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add ghost to movCtx**

Find the `movCtx` object literal in `update()` (around line 851). Add `ghost`:

```ts
const movCtx = {
  role:             this.myRole,
  downed:           this.downed,
  sprinting:        this.sprinting,
  onHitSprintTimer: this.onHitSprintTimer,
  bloodlustTier:    this.bloodlustTier,
  attackHoldActive: this.combat.attackHoldActive,
  isSwinging:       this.combat.isSwinging,
  skinId:           this.mySkinId,
  ghost:            this.ghost,
};
```

- [ ] **Step 2: Skip fog.update for ghost**

Find the line `this.fog.update(this.player, this.movement.lookAngle);` in the non-frozen path (around line 895). Replace with:

```ts
if (!this.ghost) this.fog.update(this.player, this.movement.lookAngle);
```

- [ ] **Step 3: Skip scratchMark emission for ghost**

Find:

```ts
if (this.myRole === 'survivor') {
  this.scratchMarks.tickEmit(
```

Change the condition to:

```ts
if (this.myRole === 'survivor' && !this.ghost) {
  this.scratchMarks.tickEmit(
```

- [ ] **Step 4: Skip survivor interaction code for ghost**

Find the survivor block starting with `if (this.myRole === 'survivor') {` that contains the downed/hacking logic (around line 911). Change the condition to:

```ts
if (this.myRole === 'survivor' && !this.ghost) {
```

This skips bleed-out tracking, `hacking.updateDownedSelf`, `hacking.updateSelf`, and bleed-out timer updates for other survivors — all irrelevant for the ghost.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: update game loop for ghost movement path"
```

---

### Task 9: Server — allow ghost movement

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Remove p.expelled from move guard**

Find the `move` event handler (around line 204). Change line ~209:

Before:
```ts
if (!p || p.expelled || p.escaped) return;
```

After:
```ts
if (!p || p.escaped) return;
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: forward ghost move events from expelled players"
```

---

### Task 10: Manual test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open two browser windows to `http://localhost:5173`.

- [ ] **Step 2: Verify ghost activation**

  - Join the same room with both windows; one becomes professor, one survivor.
  - Survivor: get caught by professor, then fail all 3 detention skill checks.
  - Expected on survivor's screen: corpse sprite appears at expelled position; survivor sprite continues moving (at increased speed, 25% alpha); full map visible (no fog of war); HUD shows `💀 FANTASMA 💀` centered on screen.

- [ ] **Step 3: Verify ghost visibility for other players**

  - From professor's window: the ghost (expelled survivor) should be visible as a semi-transparent sprite moving around the map, subject to the professor's cone of vision like any other player.
  - Expected: ghost visible at 25% alpha when in professor's FoV, invisible outside it.

- [ ] **Step 4: Verify corpse on other clients**

  - From professor's window: a static fallen sprite should appear at the location where the survivor was expelled.

- [ ] **Step 5: Verify ghost passes through walls**

  - Move the ghost into a wall tile.
  - Expected: ghost moves through it freely.

- [ ] **Step 6: Verify ghost cannot interact**

  - Move ghost near a terminal, press E.
  - Expected: no hack progress, no interaction prompt.

- [ ] **Step 7: Verify game reset is clean**

  - End the game (all survivors expelled or escaped, or professor wins).
  - Expected: scene restarts, no leftover corpse sprites, ghost state cleared.
