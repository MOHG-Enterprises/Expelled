# Interaction Prompt & Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a pulsing white outline and a key/button prompt above the nearest interactable object when a survivor is within interaction range.

**Architecture:** A new `InteractionPromptManager` owns two Phaser objects (Graphics outline + Text prompt) and exposes `show()`/`hide()`. `HackingSystem` computes the nearest interactable (heal > hack > gate) and calls the manager each frame. `GameScene` instantiates the manager and hides it when `inputFrozen`.

**Tech Stack:** Phaser 3, TypeScript, Socket.io (no server changes)

---

## File Map

| Action | File | Change |
|---|---|---|
| Create | `src/game/InteractionPromptManager.ts` | New class |
| Modify | `src/game/ExitGateManager.ts` | Add `getNearestActiveSwitch()` |
| Modify | `src/game/HackingSystem.ts` | Add manager param, prompt logic in `updateSelf`, `hide()` in `reset()` |
| Modify | `src/scenes/GameScene.ts` | Instantiate manager, pass to HackingSystem, hide on inputFrozen |

---

## Task 1: Create `InteractionPromptManager`

**Files:**
- Create: `src/game/InteractionPromptManager.ts`

- [ ] **Step 1: Create the file**

```ts
import Phaser from 'phaser';

export class InteractionPromptManager {
  private scene:      Phaser.Scene;
  private outline:    Phaser.GameObjects.Graphics;
  private prompt:     Phaser.GameObjects.Text;
  private pulseTween: Phaser.Tweens.Tween | null = null;
  private visible     = false;

  constructor(scene: Phaser.Scene) {
    this.scene   = scene;
    this.outline = scene.add.graphics().setDepth(10).setVisible(false);
    this.prompt  = scene.add
      .text(0, 0, '', {
        fontSize:        '11px',
        color:           '#ffffff',
        backgroundColor: '#00000099',
        padding:         { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(10)
      .setVisible(false);
  }

  show(x: number, y: number, w: number, h: number, label: string, usingGamepad: boolean) {
    const key = usingGamepad ? 'Ⓐ' : '[E]';
    this.prompt.setText(`${key} ${label}`);
    this.prompt.setPosition(x, y - h / 2 - 4);
    this.prompt.setVisible(true);

    this.outline.clear();
    this.outline.lineStyle(2, 0xffffff, 1);
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

  hide() {
    if (!this.visible) return;
    this.outline.setVisible(false);
    this.prompt.setVisible(false);
    this.pulseTween?.stop();
    this.pulseTween = null;
    this.outline.setAlpha(1);
    this.visible = false;
  }

  destroy() {
    this.pulseTween?.stop();
    this.outline.destroy();
    this.prompt.destroy();
  }
}
```

- [ ] **Step 2: Typecheck**

```
npm run typecheck
```

Expected: no errors related to `InteractionPromptManager`.

---

## Task 2: Add `getNearestActiveSwitch()` to `ExitGateManager`

**Files:**
- Modify: `src/game/ExitGateManager.ts`

The HackingSystem needs the world position of the nearest powered, non-open gate switch within `INTERACT_RADIUS`. `ExitGateManager` already has all this data internally (`switchX`, `switchY`, `powered`, `open`).

- [ ] **Step 1: Add the method**

In `src/game/ExitGateManager.ts`, add this method after `isNearSwitch()` (around line 121):

```ts
getNearestActiveSwitch(x: number, y: number): { x: number; y: number } | null {
  for (const id of GATE_IDS) {
    const g = this.gates[id];
    if (!g.powered || g.open) continue;
    if (Phaser.Math.Distance.Between(x, y, g.switchX, g.switchY) < INTERACT_RADIUS) {
      return { x: g.switchX, y: g.switchY };
    }
  }
  return null;
}
```

- [ ] **Step 2: Typecheck**

```
npm run typecheck
```

Expected: no errors.

---

## Task 3: Update `HackingSystem`

**Files:**
- Modify: `src/game/HackingSystem.ts`

Three changes:
1. Import and store `InteractionPromptManager`
2. Add prompt logic at the top of `updateSelf()`
3. Call `hide()` in `reset()`

- [ ] **Step 1: Add import**

At the top of `src/game/HackingSystem.ts`, add after the existing imports:

```ts
import type { InteractionPromptManager } from './InteractionPromptManager';
```

- [ ] **Step 2: Add field and constructor param**

In the class body, add the private field after `setInputFrozen`:

```ts
private promptManager: InteractionPromptManager;
```

Update the constructor signature — add `promptManager: InteractionPromptManager` as the last parameter:

```ts
constructor(
  scene:          Phaser.Scene,
  player:         Phaser.Physics.Arcade.Sprite,
  socket:         Socket,
  terminals:      TerminalManager,
  gates:          ExitGateManager,
  players:        PlayerManager,
  hud:            HUD,
  skillCheck:     SkillCheck,
  setInputFrozen: (frozen: boolean) => void,
  promptManager:  InteractionPromptManager,
) {
  this.scene          = scene;
  this.player         = player;
  this.socket         = socket;
  this.terminals      = terminals;
  this.gates          = gates;
  this.players        = players;
  this.hud            = hud;
  this.skillCheck     = skillCheck;
  this.setInputFrozen = setInputFrozen;
  this.promptManager  = promptManager;
  this.hackNextThreshold = Phaser.Math.Between(20000, 35000);
  this.healNextThreshold = Phaser.Math.Between(2500, 5000);
}
```

- [ ] **Step 3: Add prompt logic in `updateSelf()`**

`updateSelf()` currently starts with `const eHeld = input.actionHeld;`. Replace that line and the existing heal-target computation with:

```ts
const eHeld = input.actionHeld;

// ── Interaction prompt ────────────────────────────────────────────────────
const healableNearby = !downed && !beingHealed
  ? this._nearestHealablePlayer(survivorInfo)
  : null;
{
  const nearT = !downed ? this.terminals.nearest(this.player.x, this.player.y) : null;
  const nearS = !downed ? this.gates.getNearestActiveSwitch(this.player.x, this.player.y) : null;
  if (healableNearby) {
    const pos = this.players.getPosition(healableNearby)!;
    this.promptManager.show(pos.x, pos.y, 24, 32, 'Curar', input.usingGamepad);
  } else if (nearT) {
    const pos = this.terminals.getPositions()[nearT]!;
    this.promptManager.show(pos.x, pos.y, 32, 32, 'Hackear', input.usingGamepad);
  } else if (nearS) {
    this.promptManager.show(nearS.x, nearS.y, 16, 16, 'Abrir Portão', input.usingGamepad);
  } else {
    this.promptManager.hide();
  }
}

// ── Heal path ────────────────────────────────────────────────────────────
const healTarget = eHeld ? healableNearby : null;
```

Then remove the original `const healTarget = eHeld && !downed && !beingHealed ? this._nearestHealablePlayer(survivorInfo) : null;` line that previously followed (it is now replaced by `const healTarget = eHeld ? healableNearby : null;`).

- [ ] **Step 4: Call `hide()` in `reset()`**

At the end of the `reset()` method body, add:

```ts
this.promptManager.hide();
```

- [ ] **Step 5: Typecheck**

```
npm run typecheck
```

Expected: no errors.

---

## Task 4: Update `GameScene`

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add import**

At the top of `src/scenes/GameScene.ts`, add with the other game imports:

```ts
import { InteractionPromptManager } from '../game/InteractionPromptManager';
```

- [ ] **Step 2: Add field declaration**

In the class body where the other subsystem fields are declared (near `private terminals!: TerminalManager`), add:

```ts
private promptManager!: InteractionPromptManager;
```

- [ ] **Step 3: Instantiate in `create()`**

After line 272 (`this.players = new PlayerManager(this);`), add:

```ts
this.promptManager = new InteractionPromptManager(this);
```

- [ ] **Step 4: Pass to `HackingSystem` constructor**

The current `HackingSystem` instantiation at lines 279–284 is:

```ts
this.hacking = new HackingSystem(
  this, this.player, this.socket,
  this.terminals, this.gates, this.players,
  this.hud, this.skillCheck,
  (frozen) => { this.inputFrozen = frozen; },
);
```

Add `this.promptManager` as the last argument:

```ts
this.hacking = new HackingSystem(
  this, this.player, this.socket,
  this.terminals, this.gates, this.players,
  this.hud, this.skillCheck,
  (frozen) => { this.inputFrozen = frozen; },
  this.promptManager,
);
```

- [ ] **Step 5: Hide prompt when `inputFrozen`**

In the `update()` method, the `inputFrozen` early-return block starts around line 729:

```ts
if (this.inputFrozen) {
  if (this.skillCheck.active && input.attackJust) {
```

Add `this.promptManager.hide();` as the first line inside this block:

```ts
if (this.inputFrozen) {
  this.promptManager.hide();
  if (this.skillCheck.active && input.attackJust) {
```

- [ ] **Step 6: Typecheck**

```
npm run typecheck
```

Expected: no errors in any file.

---

## Task 5: Manual Verification

- [ ] **Step 1: Start the dev server**

```
npm run dev
```

- [ ] **Step 2: Verify terminal prompt**

Join as survivor. Walk toward a terminal. When within ~48px, confirm:
- White pulsing outline appears around the terminal sprite
- `[E] Hackear` text appears above it
- Outline disappears when walking away

- [ ] **Step 3: Verify gamepad label**

Connect a gamepad. Walk toward a terminal. Confirm prompt shows `Ⓐ Hackear` instead of `[E] Hackear`.

- [ ] **Step 4: Verify gate switch prompt**

After enough terminals are hacked (gate powers up). Walk toward the gate switch. Confirm `[E] Abrir Portão` prompt and outline on the 16×16 switch marker.

- [ ] **Step 5: Verify heal prompt**

Have a second survivor get injured (hp < 2). Walk toward them. Confirm `[E] Curar` prompt with outline on the player sprite. Confirm this takes priority over a terminal if both are nearby.

- [ ] **Step 6: Verify prompt hides during skill check**

While hacking (holding E), wait for skill check to trigger. Confirm prompt disappears while the skill check is active.

- [ ] **Step 7: Verify professor has no prompt**

Join as professor. Confirm no prompts appear anywhere.
