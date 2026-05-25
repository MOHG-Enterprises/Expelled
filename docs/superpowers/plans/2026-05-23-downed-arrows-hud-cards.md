# Downed Arrows + HUD Card Status Bars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Survivors see directional arrows pointing to downed teammates; every survivor card in the HUD gains a bleed-out bar (all roles) and a heal-progress bar (survivors only).

**Architecture:** Pure client-side. No new socket events. Arrow rendering reuses the existing `arrowGraphics` pipeline in `HUD`. Bleed timing is tracked locally in `GameScene` per-survivor, reset on `playerDowned` / `downCountUpdated`, incremented each frame. SurvivorCard gets two new mini Graphics bars drawn only when the survivor is downed.

**Tech Stack:** Phaser 3, TypeScript, Socket.io (client-side only changes)

---

## File map

| File | What changes |
|---|---|
| `src/game/HUD.ts` | Add `bleedMs` to `SurvivorStatus`; new `updateDownedArrows()` method; update `setSurvivorStatuses()` to pass `showHealPct` |
| `src/game/hud/SurvivorCard.ts` | Add `statusBars` Graphics; add `healPct`, `bleedMs`, `showHealPct` params to `show()`; draw two 4 px bars when downed |
| `src/scenes/GameScene.ts` | New `survivorBleedMs` map; wire lifecycle events; call `updateDownedArrows()` in both update paths |

---

### Task 1: Add `updateDownedArrows()` to HUD

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Add the method**

Open `src/game/HUD.ts`. After the closing brace of `updateTerminalArrows()` (line ~448), add:

```ts
updateDownedArrows(
  positions: Record<string, { x: number; y: number }>,
  camX: number,
  camY: number,
  screenW: number,
  screenH: number,
): void {
  this.arrowGraphics.clear();
  const cx     = screenW / 2;
  const cy     = screenH / 2;
  const margin = 18;

  (Object.keys(positions) as string[]).forEach((id) => {
    const pos = positions[id];
    if (!pos) return;
    const sx = pos.x - camX;
    const sy = pos.y - camY;
    const dx = sx - cx;
    const dy = sy - cy;
    if (dx === 0 && dy === 0) return;
    const angle = Math.atan2(dy, dx);
    const maxX  = screenW - margin;
    const maxY  = screenH - margin;
    const tX    = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
    const tY    = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
    const t     = Math.min(Math.abs(tX), Math.abs(tY));
    const ex    = cx + dx * t;
    const ey    = cy + dy * t;
    this._drawArrowTriangle(ex, ey, angle, 0xff6600, 0.85);
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: add updateDownedArrows() to HUD"
```

---

### Task 2: Wire `updateDownedArrows()` in GameScene — both update paths

**Files:**
- Modify: `src/scenes/GameScene.ts`

The `update()` method has two paths where arrows must be drawn:
1. The **inputFrozen early-return block** (~lines 748–756) — this is where a downed survivor lives while frozen.
2. The **normal update path** (~lines 845–858) — where the professor already calls `updateTerminalArrows`.

- [ ] **Step 1: Add helper method for building downed positions**

Before the closing brace of the `GameScene` class, add:

```ts
private _getDownedArrowPositions(): Record<string, { x: number; y: number }> {
  const result: Record<string, { x: number; y: number }> = {};
  for (const [id, info] of this.survivorInfo) {
    if (id === this.socket.id) continue;
    if (info.expelled || info.escaped) continue;
    if (!this.downed && !info.downed) continue;
    const pos = this.players.getPosition(id);
    if (pos) result[id] = pos;
  }
  return result;
}
```

Logic: standing survivor → targets are only downed teammates. Downed survivor → targets are all teammates (downed or standing), so they know where to run after revival.

- [ ] **Step 2: Add call inside the `inputFrozen` early-return block**

Inside the `if (this.inputFrozen)` block, find the existing professor arrow call (around line 748):

```ts
if (this.myRole === 'professor') {
  const cam = this.cameras.main;
  this.hud.updateTerminalArrows(
    this.terminals.getPositions(), this.terminals.getCompleted(),
    cam.scrollX, cam.scrollY, cam.width, cam.height,
  );
}
```

Immediately after that block (still inside `if (this.inputFrozen)`), add:

```ts
if (this.myRole === 'survivor') {
  const cam = this.cameras.main;
  this.hud.updateDownedArrows(
    this._getDownedArrowPositions(),
    cam.scrollX, cam.scrollY, cam.width, cam.height,
  );
}
```

- [ ] **Step 3: Add call in the normal update path**

Find the existing professor arrow call in the normal path (around line 855):

```ts
if (this.myRole === 'professor') {
  // ...
  const cam = this.cameras.main;
  this.hud.updateTerminalArrows(
    this.terminals.getPositions(), this.terminals.getCompleted(),
    cam.scrollX, cam.scrollY, cam.width, cam.height,
  );
}
```

Immediately after that `if (this.myRole === 'professor')` block, add:

```ts
if (this.myRole === 'survivor') {
  const cam = this.cameras.main;
  this.hud.updateDownedArrows(
    this._getDownedArrowPositions(),
    cam.scrollX, cam.scrollY, cam.width, cam.height,
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: wire downed player arrows for survivors in GameScene"
```

---

### Task 3: Add `bleedMs` to `SurvivorStatus` and `statusBars` Graphics to `SurvivorCard`

**Files:**
- Modify: `src/game/HUD.ts`
- Modify: `src/game/hud/SurvivorCard.ts`

- [ ] **Step 1: Add `bleedMs` to `SurvivorStatus`**

In `src/game/HUD.ts`, find the `SurvivorStatus` interface and add the new field:

```ts
export interface SurvivorStatus {
  label:       string;
  skinId:      string;
  hp:          number;
  downed:      boolean;
  expelled:    boolean;
  escaped:     boolean;
  hacking:     boolean;
  downCount:   0 | 1 | 2;
  healPct:     number;
  beingHealed: boolean;
  bleedMs:     number;   // ← add this line
}
```

- [ ] **Step 2: Add `statusBars` Graphics to `SurvivorCard`**

In `src/game/hud/SurvivorCard.ts`, add the field declaration after `private portImg`:

```ts
private statusBars: Phaser.GameObjects.Graphics;
```

In the constructor, after the `this.hackIcon = ...` block, add:

```ts
this.statusBars = scene.add.graphics().setScrollFactor(0).setDepth(33).setAlpha(0);
```

In the `hide()` method, add:

```ts
this.statusBars.setAlpha(0);
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: zero errors (the new `bleedMs` field will cause an error in `refreshSurvivorHUD` — that's fixed in Task 6).

Actually, the `SurvivorStatus` type change will cause an error wherever `SurvivorStatus` objects are constructed without `bleedMs`. The only construction site is `refreshSurvivorHUD()` in `GameScene.ts`. TypeScript will flag it. Run typecheck now to see the error, then note it will be fixed in Task 6.

```bash
npm run typecheck
```

Expected: one error about missing `bleedMs` in `GameScene.ts` — that's expected and will be fixed in Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/game/HUD.ts src/game/hud/SurvivorCard.ts
git commit -m "feat: add bleedMs to SurvivorStatus and statusBars graphics to SurvivorCard"
```

---

### Task 4: Draw status bars in `SurvivorCard.show()`

**Files:**
- Modify: `src/game/hud/SurvivorCard.ts`

Constants needed (already defined at top of file): `CARD_X = 8`, `CARD_W = 78`, `PORT_H = 44`. Add new local constant:

```ts
const BLEED_OUT_MS = 70_000;
```

- [ ] **Step 1: Update `show()` signature and call `_drawStatusBars`**

Replace the existing `show()` method signature and body with:

```ts
show(
  label:        string,
  skinId:       string,
  hp:           number,
  downed:       boolean,
  expelled:     boolean,
  escaped:      boolean,
  hacking:      boolean,
  showActivity: boolean,
  healPct:      number,
  bleedMs:      number,
  showHealPct:  boolean,
) {
  const stateKey = escaped ? 'escaped'
    : expelled            ? 'expelled'
    : downed              ? 'downed'
    : hp <= 1             ? 'injured'
    : 'healthy';

  this._drawBackground(stateKey);
  this._updatePortrait(skinId, hp, downed);
  this._drawHpDots(hp, downed);
  this._drawStatusBars(downed, healPct, bleedMs, showHealPct);

  this.nameText.setText(label).setAlpha(1);
  this.bg.setAlpha(1);
  this.overlay.setAlpha(1);
  this.hpDots.setAlpha(1);
  this.statusBars.setAlpha(1);
  this.hackIcon.setAlpha(showActivity && hacking && !downed && !expelled && !escaped ? 1 : 0);
}
```

- [ ] **Step 2: Add `_drawStatusBars()` private method**

Add after `_drawHpDots()`:

```ts
private _drawStatusBars(downed: boolean, healPct: number, bleedMs: number, showHealPct: boolean) {
  this.statusBars.clear();
  if (!downed) return;

  const BLEED_OUT_MS = 70_000;
  const bx  = CARD_X + 4;
  const bw  = CARD_W - 8;   // 70px
  const bh  = 4;

  const bleedY = this.cardY + 63;
  const healY  = this.cardY + 69;

  // bleed-out background + fill
  this.statusBars.fillStyle(0x1a1a1a, 0.9);
  this.statusBars.fillRoundedRect(bx, bleedY, bw, bh, 2);
  const bleedFill = Math.min(1, bleedMs / BLEED_OUT_MS) * bw;
  if (bleedFill > 0) {
    this.statusBars.fillStyle(0xff6600, 0.9);
    this.statusBars.fillRoundedRect(bx, bleedY, bleedFill, bh, 2);
  }

  if (!showHealPct || healPct <= 0) return;

  // heal background + fill
  this.statusBars.fillStyle(0x1a1a1a, 0.9);
  this.statusBars.fillRoundedRect(bx, healY, bw, bh, 2);
  const healFill = Math.min(1, healPct / 100) * bw;
  if (healFill > 0) {
    this.statusBars.fillStyle(0x81c995, 0.9);
    this.statusBars.fillRoundedRect(bx, healY, healFill, bh, 2);
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: error about `show()` call sites not passing the new params — those are in `HUD.setSurvivorStatuses()`, fixed next task.

- [ ] **Step 4: Commit**

```bash
git add src/game/hud/SurvivorCard.ts
git commit -m "feat: draw bleed-out and heal bars in SurvivorCard when downed"
```

---

### Task 5: Update `setSurvivorStatuses()` in HUD

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Update the method signature and body**

Find `setSurvivorStatuses()` in `src/game/HUD.ts` and replace it with:

```ts
setSurvivorStatuses(statuses: SurvivorStatus[], showActivity = false, showHealPct = false) {
  this.survivorCards.forEach((card, i) => {
    const s = statuses[i];
    if (!s) { card.hide(); return; }
    card.show(
      s.label, s.skinId, s.hp, s.downed, s.expelled, s.escaped,
      s.hacking, showActivity,
      s.healPct, s.bleedMs, showHealPct,
    );
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: one remaining error in `GameScene.ts` about `bleedMs` missing from the status object (fixed in Task 6) and about the `setSurvivorStatuses` call not passing `showHealPct` (also fixed in Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: update setSurvivorStatuses to pass healPct/bleedMs/showHealPct to cards"
```

---

### Task 6: Add `survivorBleedMs` tracking in GameScene and wire everything

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add `survivorBleedMs` field**

In `src/scenes/GameScene.ts`, find the class fields near `survivorInfo` (around line 67) and add:

```ts
private survivorBleedMs = new Map<string, number>();
```

- [ ] **Step 2: Reset in `resetLocalState()`**

In `resetLocalState()`, after `this.survivorInfo.clear();`, add:

```ts
this.survivorBleedMs.clear();
```

- [ ] **Step 3: Initialize on `gameState` sync**

In `_bindGameLifecycle`, inside `s.on('gameState', ...)`, after the `Object.entries(state.players).forEach` block (around line 373), add:

```ts
Object.entries(state.players).forEach(([id, p]) => {
  if (p.role === 'survivor' && p.downed && !this.survivorBleedMs.has(id)) {
    this.survivorBleedMs.set(id, 0);
  }
});
```

- [ ] **Step 4: Wire lifecycle events in `_bindPlayerState`**

In `s.on('playerDowned', ...)`, after `this.trackSurvivor(id, ...)`, add:

```ts
this.survivorBleedMs.set(id, 0);
```

In `s.on('downCountUpdated', ...)`, after `this.survivorInfo.set(id, ...)`, add:

```ts
this.survivorBleedMs.set(id, 0);
```

In `s.on('playerRevived', ...)`, after `this.trackSurvivor(id, ...)`, add:

```ts
this.survivorBleedMs.delete(id);
```

In `s.on('playerExpelled', ...)`, after the `if (info)` block, add:

```ts
this.survivorBleedMs.delete(id);
```

In `s.on('playerLeft', ...)`, after `this.survivorOrder = ...`, add:

```ts
this.survivorBleedMs.delete(id);
```

- [ ] **Step 5: Increment bleed timers in `update()`**

In `update()`, find the existing downed-self bleed tracking block (around line 835):

```ts
if (this.downed) {
  this.hacking.updateDownedSelf(delta, this.beingHealed, intendedToMove, this.myHealPct);
  this.myDownBleedMs = Math.min(this.myDownBleedMs + delta, BLEED_OUT_MS);
  this.hud.setBleedOutProgress((this.myDownBleedMs / BLEED_OUT_MS) * 100);
```

After `this.myDownBleedMs = ...`, add the sync for self:

```ts
  this.survivorBleedMs.set(this.socket.id!, this.myDownBleedMs);
```

Then, still inside `if (this.myRole === 'survivor')` but outside the `if (this.downed)` nesting (after it, before `}`), add the loop for other survivors. Find where the survivor `if` block ends and add before it closes:

```ts
for (const [id, info] of this.survivorInfo) {
  if (id === this.socket.id) continue;
  if (!info.downed) { this.survivorBleedMs.delete(id); continue; }
  const current = this.survivorBleedMs.get(id) ?? 0;
  this.survivorBleedMs.set(id, Math.min(current + delta, BLEED_OUT_MS));
}
```

- [ ] **Step 6: Pass `bleedMs` in `refreshSurvivorHUD()` and fix `setSurvivorStatuses` call**

Replace `refreshSurvivorHUD()` with:

```ts
private refreshSurvivorHUD() {
  const statuses = this.survivorOrder.map((id, i) => {
    const info = this.survivorInfo.get(id) ?? {
      hp: 2, downed: false, expelled: false, escaped: false,
      hacking: false, downCount: 0 as const, healPct: 0, beingHealed: false,
    };
    const meta   = this.survivorMeta.get(id);
    const label  = meta?.name   || `A${i + 1}`;
    const skinId = meta?.skinId || (GameScene.SURVIVOR_SKIN_SLOTS[i] ?? 'arthur');
    const bleedMs = this.survivorBleedMs.get(id) ?? 0;
    return { label, skinId, bleedMs, ...info };
  });
  const showHealPct = this.myRole === 'survivor';
  this.hud.setSurvivorStatuses(statuses, showHealPct, showHealPct);
}
```

- [ ] **Step 7: Full typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: track survivorBleedMs per survivor and wire HUD card bars"
```

---

### Task 7: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test Feature 1 — downed arrows**

1. Open two browser tabs connected to the same room
2. Tab A = professor, Tab B = survivor (or open a third tab as second survivor)
3. Have the professor down a survivor
4. On the remaining standing survivor's screen: an orange arrow should appear pointing toward the downed player when they are off-screen
5. On the downed survivor's screen: arrows should appear pointing to all other players (both standing and downed teammates)
6. After the downed survivor is revived: arrows clear

- [ ] **Step 3: Test Feature 2 — HUD card bars**

1. Down a survivor (professor attacks until downed)
2. On any survivor's screen: the downed player's card should show an orange bar filling slowly from left to right (70 s to fill)
3. On any survivor's screen: when another survivor starts healing the downed one, a green bar should appear below the orange bar
4. On the professor's screen: orange bleed bar visible in the downed card; NO green heal bar, even while being healed
5. When `downCount` increments (after 70 s): orange bar resets to empty and starts filling again
6. After revival: both bars disappear from the card

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: manual test corrections for downed arrows and HUD bars"
```
