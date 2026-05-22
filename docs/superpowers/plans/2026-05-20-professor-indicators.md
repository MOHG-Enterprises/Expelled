# Professor Indicators & Loud Noise Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the professor a permanent glow + screen-edge arrows showing all incomplete terminals, and a prominent notification bubble + temporary arrow whenever a survivor fails a skill check.

**Architecture:** Extend `TerminalManager` with an aura overlay and read-only position/completed getters; extend `HUD` with screen-edge arrow rendering and a loud-noise notification widget; wire both into `GameScene`'s role-assignment handler and update loop.

**Tech Stack:** Phaser 3, TypeScript, Socket.io (client-side only changes)

---

## File map

| File | What changes |
|------|-------------|
| `src/game/TerminalManager.ts` | Add `auraGraphics`, `setAuraMode()`, `getPositions()`, `getCompleted()` |
| `src/game/HUD.ts` | Add `arrowGraphics`, `loudNoiseArrows`, `updateTerminalArrows()`, `showLoudNoiseAlert()` |
| `src/scenes/GameScene.ts` | Call `setAuraMode(true)` on professor role; call `updateTerminalArrows()` in `update()`; replace `hud.flash` in `firewallAlert` with `showLoudNoiseAlert()` |

---

## Task 1: TerminalManager — aura glow + getters

**Files:**
- Modify: `src/game/TerminalManager.ts`

### Step 1.1 — Add private fields for aura

In `src/game/TerminalManager.ts`, add two new private fields right after the `regressingTerminals` declaration (line 28):

```typescript
  private auraGraphics: Phaser.GameObjects.Graphics | null = null;
  private auraTween:    Phaser.Tweens.Tween | null = null;
  private auraActive   = false;
```

### Step 1.2 — Add `setAuraMode()` method

Add this method after `flashAlert()` (before `unlockGate()`):

```typescript
  setAuraMode(active: boolean) {
    this.auraActive = active;
    if (!active) {
      this.auraTween?.stop();
      this.auraTween = null;
      this.auraGraphics?.destroy();
      this.auraGraphics = null;
      return;
    }
    if (!this.auraGraphics) {
      this.auraGraphics = this.scene.add.graphics().setDepth(1);
    }
    this._redrawAura();
    this.auraTween?.stop();
    this.auraTween = this.scene.tweens.add({
      targets:     this.auraGraphics,
      alpha:       0.4,
      duration:    900,
      yoyo:        true,
      repeat:      -1,
      ease:        'Sine.easeInOut',
    });
  }

  private _redrawAura() {
    if (!this.auraGraphics) return;
    this.auraGraphics.clear();
    this.auraGraphics.lineStyle(3, 0xff8800, 1);
    (Object.keys(this.positions) as TerminalId[]).forEach((id) => {
      if (this.completed.has(id)) return;
      const pos = this.positions[id];
      if (!pos) return;
      this.auraGraphics!.strokeCircle(pos.x, pos.y, 22);
    });
  }
```

### Step 1.3 — Redraw aura when a terminal completes

In `setProgress()`, inside the `if (progress >= 100)` branch (after `t.sprite.setTint(COLOR_TERMINAL_DONE)`), add:

```typescript
      if (this.auraActive) this._redrawAura();
```

### Step 1.4 — Add read-only getters

Add these two getters after `getCount()`:

```typescript
  getPositions(): Partial<Record<TerminalId, Vec2>> {
    return this.positions;
  }

  getCompleted(): Set<TerminalId> {
    return this.completed;
  }
```

### Step 1.5 — Typecheck

```bash
npm run typecheck
```

Expected: no errors.

### Step 1.6 — Commit

```bash
git add src/game/TerminalManager.ts
git commit -m "feat: add aura glow and position getters to TerminalManager"
```

---

## Task 2: HUD — screen-edge arrows + loud noise notification

**Files:**
- Modify: `src/game/HUD.ts`

### Step 2.1 — Add private fields

In `src/game/HUD.ts`, add these fields after the `chaseIndicatorText` declaration (around line 59):

```typescript
  private arrowGraphics!:  Phaser.GameObjects.Graphics;
  private loudNoiseArrows: Array<{ terminalId: string; expiresAt: number }> = [];
  private lastLoudNoiseTime = 0;
```

### Step 2.2 — Initialize `arrowGraphics` in `build()`

At the end of `build()`, before `this._buildSurvivorCards()`:

```typescript
    this.arrowGraphics = this.scene.add.graphics().setScrollFactor(0).setDepth(32);
```

### Step 2.3 — Add `updateTerminalArrows()` method

Add this method after `setChaseState()`:

```typescript
  updateTerminalArrows(
    positions: Partial<Record<string, { x: number; y: number }>>,
    completed: Set<string>,
    camX: number,
    camY: number,
    screenW: number,
    screenH: number,
  ) {
    this.arrowGraphics.clear();
    const now    = Date.now();
    const cx     = screenW / 2;
    const cy     = screenH / 2;
    const margin = 18;

    (Object.keys(positions) as string[]).forEach((id) => {
      if (completed.has(id)) return;
      const pos = positions[id];
      if (!pos) return;

      const sx = pos.x - camX;
      const sy = pos.y - camY;
      const onScreen = sx >= 0 && sx <= screenW && sy >= 0 && sy <= screenH;

      const isLoud   = this.loudNoiseArrows.some(e => e.terminalId === id && e.expiresAt > now);
      const color    = isLoud ? 0xffcc00 : 0xff8800;
      const alpha    = isLoud ? 1.0 : 0.75;

      if (onScreen) {
        if (isLoud) {
          this.arrowGraphics.lineStyle(3, color, alpha);
          this.arrowGraphics.strokeCircle(sx, sy, 26);
        }
        return;
      }

      const dx    = sx - cx;
      const dy    = sy - cy;
      const angle = Math.atan2(dy, dx);

      const maxX  = screenW - margin;
      const maxY  = screenH - margin;
      const tX    = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
      const tY    = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
      const t     = Math.min(Math.abs(tX), Math.abs(tY));
      const ex    = cx + dx * t;
      const ey    = cy + dy * t;

      this._drawArrowTriangle(ex, ey, angle, color, alpha);
    });

    this.loudNoiseArrows = this.loudNoiseArrows.filter(e => e.expiresAt > now);
  }

  private _drawArrowTriangle(x: number, y: number, angle: number, color: number, alpha: number) {
    const size = 12;
    const cos  = Math.cos(angle);
    const sin  = Math.sin(angle);

    const tip = { x: x + cos * size,       y: y + sin * size };
    const l   = { x: x + cos * -size * 0.5 - sin * size * 0.6,
                  y: y + sin * -size * 0.5 + cos * size * 0.6 };
    const r   = { x: x + cos * -size * 0.5 + sin * size * 0.6,
                  y: y + sin * -size * 0.5 - cos * size * 0.6 };

    this.arrowGraphics.fillStyle(color, alpha);
    this.arrowGraphics.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
  }
```

### Step 2.4 — Add `showLoudNoiseAlert()` method

Add this method after `updateTerminalArrows()`:

```typescript
  showLoudNoiseAlert(
    terminalId: string,
    camX: number,
    camY: number,
    screenW: number,
    screenH: number,
  ) {
    const now = Date.now();
    if (now - this.lastLoudNoiseTime < 1000) return;
    this.lastLoudNoiseTime = now;

    const DURATION = 4000;
    this.loudNoiseArrows.push({ terminalId, expiresAt: now + DURATION });

    const BW = 180;
    const BH = 36;
    const BX = screenW - BW - 8;
    const BY = 50;

    const bg = this.scene.add.graphics().setScrollFactor(0).setDepth(50);
    bg.fillStyle(0x0a0a0a, 0.92);
    bg.fillRoundedRect(BX, BY, BW, BH, 6);
    bg.lineStyle(2, 0xff6600, 1);
    bg.strokeRoundedRect(BX, BY, BW, BH, 6);

    const icon = this.scene.add
      .text(BX + 10, BY + BH / 2, '⚡', { fontSize: '16px', color: '#ff8800' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);

    const label = this.scene.add
      .text(BX + 32, BY + BH / 2, `SKILL CHECK — ${terminalId}`, {
        fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);

    this.scene.time.delayedCall(DURATION, () => {
      bg.destroy();
      icon.destroy();
      label.destroy();
    });
  }
```

### Step 2.5 — Typecheck

```bash
npm run typecheck
```

Expected: no errors.

### Step 2.6 — Commit

```bash
git add src/game/HUD.ts
git commit -m "feat: add terminal arrows and loud noise notification to HUD"
```

---

## Task 3: GameScene — wire everything up

**Files:**
- Modify: `src/scenes/GameScene.ts`

### Step 3.1 — Enable aura mode on professor role

In the `roleAssigned` socket handler (around line 531), after `this.hud.update(role, this.myHp, false)`, add:

```typescript
      if (role === 'professor') {
        this.terminals.setAuraMode(true);
      }
```

### Step 3.2 — Call `updateTerminalArrows()` in the update loop

In `update()`, find the end of the early-return block that handles `inputFrozen` (around line 932, just before the `return`). Add a call right before that `return`, and also unconditionally **after** the entire update body for the professor path.

The cleanest place is at the very end of `update()`, after all role-branching. Find the end of the `update()` method and add this block just before the closing brace:

```typescript
    if (this.myRole === 'professor') {
      const cam = this.cameras.main;
      this.hud.updateTerminalArrows(
        this.terminals.getPositions(),
        this.terminals.getCompleted(),
        cam.scrollX,
        cam.scrollY,
        cam.width,
        cam.height,
      );
    }
```

> Note: also add the same call inside the `inputFrozen` early-return block, right before `return`, so arrows stay visible while the professor is frozen (e.g., after attacking):
>
> ```typescript
>     if (this.myRole === 'professor') {
>       const cam = this.cameras.main;
>       this.hud.updateTerminalArrows(
>         this.terminals.getPositions(),
>         this.terminals.getCompleted(),
>         cam.scrollX,
>         cam.scrollY,
>         cam.width,
>         cam.height,
>       );
>     }
>     this.players.update(this.time.now);
>     return;
> ```

### Step 3.3 — Replace `hud.flash` in `firewallAlert` with `showLoudNoiseAlert`

Find the `firewallAlert` handler (around line 604). Replace the `professor` branch:

**Before:**
```typescript
      if (this.myRole === 'professor') {
        this.hud.flash(`Firewall: ${terminalId}`, 0xffcc00);
        this.terminals.flashAlert(terminalId, this.tweens);
      }
```

**After:**
```typescript
      if (this.myRole === 'professor') {
        const cam = this.cameras.main;
        this.hud.showLoudNoiseAlert(terminalId, cam.scrollX, cam.scrollY, cam.width, cam.height);
        this.terminals.flashAlert(terminalId, this.tweens);
      }
```

### Step 3.4 — Typecheck

```bash
npm run typecheck
```

Expected: no errors.

### Step 3.5 — Manual test

Run the dev server:

```bash
npm run dev
```

Open two browser tabs, join the same room. First tab gets professor role (first connection), second gets survivor.

**Checklist:**
- [ ] As professor: orange rings are visible around all incomplete terminals
- [ ] As professor: orange arrows appear at screen edges for off-screen terminals
- [ ] As professor: arrows disappear for completed terminals after a survivor hacks one to 100%
- [ ] As survivor: fail a skill check (let the needle go past the zone). As professor: a `⚡ SKILL CHECK — t1` bubble appears top-right for ~4 seconds
- [ ] The bubble arrow turns yellow and points at the failing terminal for ~4 seconds, then reverts to orange
- [ ] If the terminal is on-screen when the skill check fails, a yellow circle pulses around it instead of an off-screen arrow
- [ ] As survivor: no arrows or bubbles visible

### Step 3.6 — Commit

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: wire professor terminal indicators and loud noise alert into GameScene"
```

---

## Self-review notes

- `setAuraMode(false)` is not explicitly called on role change back to survivor or game reset. If the game resets via `gameReset` event, the scene is likely re-created so this is safe. If needed, add `terminals.setAuraMode(false)` inside `resetLocalState()`.
- `loudNoiseArrows` array is cleaned up inside `updateTerminalArrows` — no leak.
- `showLoudNoiseAlert` uses `scene.time.delayedCall` for cleanup — consistent with existing patterns in `setFailed()` and `setLocked()`.
- The 1-second spam cooldown in `showLoudNoiseAlert` matches the DBD spec ("1 second buffer between repeated notifications").
