# Start Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `StartScene` that forces a user click before entering the lobby, unlocking the browser AudioContext and providing a loading bar for future sound assets.

**Architecture:** New `StartScene` inserted as the first scene in the Phaser scene list. `preload()` runs Phaser's asset loader (empty now, sounds added here later) while displaying a progress bar. `create()` shows a minimalist click-to-play prompt and transitions to `LobbyScene` on any interaction.

**Tech Stack:** Phaser 3, TypeScript

---

## File Map

| File | Action |
|------|--------|
| `src/scenes/StartScene.ts` | Create — new scene |
| `src/main.ts` | Modify — prepend `StartScene` to scene list |

---

### Task 1: Create StartScene

**Files:**
- Create: `src/scenes/StartScene.ts`

- [ ] **Step 1: Create the file with this exact content**

```typescript
import Phaser from 'phaser';

export class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  preload() {
    const { width, height } = this.scale;
    const barWidth = 320;
    const barX = width / 2 - barWidth / 2;
    const barY = height / 2 - 10;

    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.add.graphics().fillStyle(0x333355, 1).fillRect(barX, barY, barWidth, 20);
    const fill = this.add.graphics();

    this.add.text(width / 2, barY - 20, 'Carregando…', {
      fontSize: '14px',
      color: '#aaaacc',
    }).setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      fill.clear().fillStyle(0xe0e0ff, 1).fillRect(barX, barY, barWidth * value, 20);
    });
  }

  create() {
    this.children.removeAll(true);

    const { width, height } = this.scale;

    this.add.text(width / 2, height / 2 - 40, 'EXPELLED', {
      fontSize: '48px',
      color: '#e0e0ff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, 'CLIQUE PARA JOGAR', {
      fontSize: '14px',
      color: '#888888',
      letterSpacing: 4,
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => this.scene.start('LobbyScene'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('LobbyScene'));
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('LobbyScene'));
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 2: Wire StartScene into main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add the import**

In `src/main.ts`, add after the existing imports:

```typescript
import { StartScene } from './scenes/StartScene';
```

- [ ] **Step 2: Prepend StartScene to the scene list**

Change:
```typescript
scene: [LobbyScene, GameScene],
```
To:
```typescript
scene: [StartScene, LobbyScene, GameScene],
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

```bash
npm run dev
```

1. Open `http://localhost:5173` in the browser
2. Verify the start screen appears with "EXPELLED" title and "CLIQUE PARA JOGAR"
3. Click anywhere — should transition to the lobby
4. Verify SPACE and ENTER also trigger the transition (refresh and try)
5. Open browser DevTools → Console — confirm no errors, no "AudioContext was not allowed to start" warnings after click

- [ ] **Step 5: Commit**

```bash
git add src/scenes/StartScene.ts src/main.ts
git commit -m "feat: add StartScene as audio-unlock entry point before lobby"
```
