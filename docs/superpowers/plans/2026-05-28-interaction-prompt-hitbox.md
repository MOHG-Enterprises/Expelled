# Interaction Prompt Hitbox Fix + Professor Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make interaction outlines match actual object hitboxes for survivors, and add a pulsing orange "[E] Chutar" indicator for the professor when a kickable terminal is nearby.

**Architecture:** Add an optional `color` param to `InteractionPromptManager.show()`. Pass `promptManager` to `CombatSystem` (professor). Fix hardcoded box sizes in `HackingSystem` to match real sprite/body dimensions. Change `combat.update()` to receive terminal position alongside ID so the professor prompt can be drawn at the right coordinates.

**Tech Stack:** Phaser 3, TypeScript, Socket.io

---

## Files Changed

| File | Change |
|------|--------|
| `src/game/InteractionPromptManager.ts` | Add `color` param to `show()` |
| `src/game/HackingSystem.ts` | Fix prompt box sizes for heal/hack |
| `src/game/CombatSystem.ts` | Add `promptManager` dep; show/hide professor prompt |
| `src/scenes/GameScene.ts` | Pass `promptManager` to `CombatSystem`; pass terminal pos to `combat.update()` |

---

### Task 1: Add `color` parameter to `InteractionPromptManager.show()`

**Files:**
- Modify: `src/game/InteractionPromptManager.ts`

- [ ] **Step 1: Add optional color param and use it in lineStyle**

Open `src/game/InteractionPromptManager.ts`. Change the `show` method signature and body:

```ts
show(x: number, y: number, w: number, h: number, label: string, usingGamepad: boolean, color = 0xffffff) {
  const key = usingGamepad ? 'Ⓐ' : '[E]';
  this.prompt.setText(`${key} ${label}`);
  this.prompt.setPosition(x, y - h / 2 - 4);
  this.prompt.setVisible(true);

  this.outline.clear();
  this.outline.lineStyle(2, color, 1);
  this.outline.strokeRect(x - w / 2, y - h / 2, w, h);
  this.outline.setVisible(true);

  if (!this.pulseTween || !this.pulseTween.isPlaying()) {
    this.pulseTween = this.scene.tweens.add({
      targets:  this.outline,
      alpha:    0.4,
      duration: 600,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }
  this.visible = true;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/InteractionPromptManager.ts
git commit -m "feat: add optional color param to InteractionPromptManager.show()"
```

---

### Task 2: Fix survivor hitbox sizes in `HackingSystem`

**Files:**
- Modify: `src/game/HackingSystem.ts:143-152`

Current sizes:
- Player (heal): 24×32 centered at `pos.x, pos.y` — real body is 32×48, center at `pos.x, pos.y + 2`
- Terminal (hack): 32×32 — real visual is 64×64 (32px frame × scale 2)
- Gate switch: 16×16 — matches the 16×16 rectangle marker, leave unchanged

- [ ] **Step 1: Update the three `promptManager.show()` calls in `updateSelf()`**

In `src/game/HackingSystem.ts`, find the interaction prompt section (around line 143) and replace all three calls:

```ts
if (healableNearby) {
  const pos = this.players.getPosition(healableNearby)!;
  this.promptManager.show(pos.x, pos.y + 2, 32, 48, 'Curar', input.usingGamepad);
} else if (nearT) {
  const pos = this.terminals.getPositions()[nearT]!;
  this.promptManager.show(pos.x, pos.y, 64, 64, 'Hackear', input.usingGamepad);
} else if (nearS) {
  this.promptManager.show(nearS.x, nearS.y, 16, 16, 'Abrir Portão', input.usingGamepad);
} else {
  this.promptManager.hide();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/HackingSystem.ts
git commit -m "fix: correct interaction prompt box sizes to match real hitboxes"
```

---

### Task 3: Pass terminal position to `CombatSystem.update()` and wire up the professor prompt

**Files:**
- Modify: `src/game/CombatSystem.ts`
- Modify: `src/scenes/GameScene.ts:862-868`

**Context:**
- `CombatSystem.update()` currently receives `nearestTerminal: TerminalId | null`
- For the prompt, it also needs the terminal's world position
- Change the param to `nearestTerminal: { id: TerminalId; pos: { x: number; y: number } } | null`
- `GameScene` computes this from `this.terminals.nearest()` + `this.terminals.getPositions()`

- [ ] **Step 1: Import `InteractionPromptManager` and `Vec2` in `CombatSystem`, add field and constructor param**

In `src/game/CombatSystem.ts`, add imports at the top:

```ts
import type { InteractionPromptManager } from './InteractionPromptManager';
import type { Vec2 } from '../types';
```

Add field after `_kickSprite`:

```ts
private promptManager: InteractionPromptManager;
```

Add `promptManager` as the last constructor param and assign it:

```ts
constructor(
  scene:          Phaser.Scene,
  player:         Phaser.Physics.Arcade.Sprite,
  socket:         Socket,
  promptManager:  InteractionPromptManager,
) {
  this.scene         = scene;
  this.player        = player;
  this.socket        = socket;
  this.promptManager = promptManager;
}
```

- [ ] **Step 2: Change `update()` signature and add prompt logic**

Change the `nearestTerminal` param type in `update()`:

```ts
update(
  input:           InputState,
  facingDirection: MoveDirection,
  lookAngle:       number,
  nearestTerminal: { id: TerminalId; pos: Vec2 } | null,
) {
```

At the **top** of `update()`, before the `now` line, add prompt logic (hide during active kick/swing so the outline doesn't overlap the animation):

```ts
if (nearestTerminal && !this._isKicking && !this._isSwinging) {
  this.promptManager.show(nearestTerminal.pos.x, nearestTerminal.pos.y, 64, 64, 'Chutar', input.usingGamepad, 0xff6600);
} else {
  this.promptManager.hide();
}
```

Update the kick call to use the id field:

```ts
if (input.actionJust && nearestTerminal) {
  this._playKick(nearestTerminal.id, facingDirection);
}
```

Update the lunge tick (still checks `_attackHoldStart !== null`, no terminal needed — leave as is).

- [ ] **Step 3: Add `promptManager.hide()` to `cancelAll()` and `reset()`**

In `cancelAll()` add at the end:

```ts
this.promptManager.hide();
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: error about `CombatSystem` constructor call in `GameScene.ts` missing the new param (will fix next step).

---

### Task 4: Update `GameScene` to pass `promptManager` and terminal position to `CombatSystem`

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Pass `promptManager` to the `CombatSystem` constructor**

In `GameScene.ts`, find where `CombatSystem` is instantiated (look for `new CombatSystem(`). Add `this.promptManager` as the last argument:

```ts
this.combat = new CombatSystem(this, this.player, this.socket, this.promptManager);
```

- [ ] **Step 2: Update the `combat.update()` call to pass terminal info**

In the professor update block (~line 862), replace:

```ts
this.combat.update(
  input,
  this.movement.facingDirection,
  this.movement.lookAngle,
  this.terminals.nearest(this.player.x, this.player.y) as TerminalId | null,
);
```

With:

```ts
const nearTermId = this.terminals.nearest(this.player.x, this.player.y) as TerminalId | null;
const nearTermInfo = nearTermId
  ? { id: nearTermId, pos: this.terminals.getPositions()[nearTermId]! }
  : null;
this.combat.update(
  input,
  this.movement.facingDirection,
  this.movement.lookAngle,
  nearTermInfo,
);
```

- [ ] **Step 3: Remove the `TerminalId` cast import if no longer needed** (skip if still used elsewhere in the file)

Check if `TerminalId` is still used elsewhere in `GameScene.ts`:

```bash
grep -n "TerminalId" src/scenes/GameScene.ts
```

If the only remaining use is in type imports and it's still used (e.g., socket handlers), leave the import as-is.

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/CombatSystem.ts src/scenes/GameScene.ts
git commit -m "feat: add professor interaction prompt for kickable terminals"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test survivor interactions**

Open two browser tabs. As a survivor:
- Walk near a terminal → expect 64×64 white pulsing outline with "[E] Hackear"
- Walk near a downed/low-HP survivor → expect 32×48 white pulsing outline centered ~2px below sprite with "[E] Curar"
- Walk near a powered gate switch → expect 16×16 white pulsing outline with "[E] Abrir Portão"
- Press C to toggle hitbox debug → healing outline should closely match the player body rect

- [ ] **Step 3: Test professor interactions**

As professor:
- Walk near a terminal → expect 64×64 **orange** pulsing outline with "[E] Chutar"
- Walk away → indicator disappears
- Press E near terminal → kick animation plays, outline disappears during kick
