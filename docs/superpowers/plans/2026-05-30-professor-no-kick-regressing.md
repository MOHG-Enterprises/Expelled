# Professor Cannot Kick Regressing Terminals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the professor from kicking (regressing) terminals that are already in the regressing state — same behavior as terminals at 0% progress.

**Architecture:** Expose `isRegressing()` on `TerminalManager`, then exclude regressing terminals from `nearTermInfo` in `GameScene` before it reaches `CombatSystem`. The server-side guard in `hacking.ts` remains unchanged as a safety net.

**Tech Stack:** TypeScript, Phaser 3. No automated tests — verify manually by running `npm run dev`.

---

### Task 1: Expose `isRegressing()` on `TerminalManager`

**Files:**
- Modify: `src/game/TerminalManager.ts` (after the `getCompleted()` method, around line 158)

- [ ] **Step 1: Add the public method**

Open `src/game/TerminalManager.ts` and add after the `getCompleted()` method:

```ts
isRegressing(id: TerminalId): boolean {
  return this.regressingTerminals.has(id);
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/TerminalManager.ts
git commit -m "feat: expose isRegressing() on TerminalManager"
```

---

### Task 2: Exclude regressing terminals from professor interaction

**Files:**
- Modify: `src/scenes/GameScene.ts` (around line 931–934)

- [ ] **Step 1: Update `nearTermInfo` condition**

Find this block in `src/scenes/GameScene.ts`:

```ts
const nearTermId = this.terminals.nearest(this.player.x, this.player.y) as TerminalId | null;
const nearTermInfo = nearTermId && this.terminals.getProgress(nearTermId) > 0
  ? { id: nearTermId, pos: this.terminals.getPositions()[nearTermId]! }
  : null;
```

Replace with:

```ts
const nearTermId = this.terminals.nearest(this.player.x, this.player.y) as TerminalId | null;
const nearTermInfo = nearTermId && this.terminals.getProgress(nearTermId) > 0 && !this.terminals.isRegressing(nearTermId)
  ? { id: nearTermId, pos: this.terminals.getPositions()[nearTermId]! }
  : null;
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```

1. Open two browser tabs (survivor + professor).
2. As survivor, hack a terminal to ~50%.
3. As professor, kick the terminal — it should start regressing (orange bar).
4. While the terminal is regressing, move professor close to it.
5. Confirm: the "Chutar" prompt does **not** appear and pressing the action button does nothing.
6. Wait for regression to finish — the prompt should reappear.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: professor cannot kick terminals already regressing"
```
