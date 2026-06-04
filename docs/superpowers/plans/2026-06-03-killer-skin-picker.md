# Killer Skin Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a character selection screen for the professor role in the lobby, identical to the survivor picker but without the name input field.

**Architecture:** All changes are in `LobbyScene.ts` (client picker UI) and `server/index.ts` (skin validation). New `KILLER_SKINS` constant drives a parallel `killerPickerUI` flow. The existing `backToPickerBtn` is reused and made role-aware.

**Tech Stack:** Phaser 3, TypeScript, Socket.io

---

## Files

- Modify: `src/scenes/LobbyScene.ts` — add killer picker UI, fix `skinRings` bug
- Modify: `server/index.ts` — add `VALID_KILLER_SKINS`, extend `setCharacter` handler

---

### Task 1: Fix pre-existing `skinRings` TypeScript error

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Fix `init()` bug**

In `src/scenes/LobbyScene.ts`, line 84, change `this.skinRings = []` to `this.characterBtns = []`. The property was renamed but `init()` was never updated.

Old:
```typescript
    this.skinRings      = [];
```

New:
```typescript
    this.characterBtns  = [];
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors (the one existing error about `skinRings` should be gone).

---

### Task 2: Add `KILLER_SKINS` constant and new class properties

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Add `KILLER_SKINS` constant after `SURVIVOR_SKINS`**

In `src/scenes/LobbyScene.ts`, after the `SURVIVOR_SKINS` block (line 26), add:

```typescript
const KILLER_SKINS: Array<{ skinId: string; iconKey: string | null; iconPath: string | null; label: string }> = [
  { skinId: 'professor',  iconKey: 'professor-icon', iconPath: './personagens/killers/professor/icon/Icon_Boi_Finished.png', label: 'Professor'  },
  { skinId: 'clayrton',   iconKey: null,             iconPath: null, label: 'Clayrton'   },
  { skinId: 'fernanda',   iconKey: null,             iconPath: null, label: 'Fernanda'   },
  { skinId: 'aquarioguy', iconKey: null,             iconPath: null, label: 'AquarioGuy' },
];
```

- [ ] **Step 2: Add new class properties**

After the existing `private characterBtns: { skinId: string; btn: Phaser.GameObjects.Image }[] = [];` property declaration, add:

```typescript
  private killerPickerUI:      Phaser.GameObjects.GameObject[] = [];
  private killerCharacterBtns: { skinId: string; btn: Phaser.GameObjects.Image }[] = [];
  private chosenKillerSkinId   = 'professor';
  private pickerKillerSkinId   = 'professor';
```

- [ ] **Step 3: Reset new properties in `init()`**

In `init()`, after `this.characterBtns = []` (fixed in Task 1), add:

```typescript
    this.killerPickerUI      = [];
    this.killerCharacterBtns = [];
    this.chosenKillerSkinId  = 'professor';
    this.pickerKillerSkinId  = 'professor';
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 3: Preload professor icon

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Load professor icon in `preload()`**

The survivor icons are already loaded in `preload()`. Add the professor icon. In the `preload()` method, after the `SURVIVOR_SKINS.forEach` block, add:

```typescript
    KILLER_SKINS.forEach(({ iconKey, iconPath }) => {
      if (iconKey && iconPath && !this.textures.exists(iconKey)) {
        this.load.image(iconKey, iconPath);
      }
    });
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 4: Build `buildKillerPickerUI()` method

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Add `buildKillerPickerUI()` method**

Add this method after `buildPickerUI()`. It reuses the same `characterScreen` background and `botaoCharacter` buttons, but skips all name-input UI elements. Killers without an `iconPath` get a button+label only.

```typescript
  private buildKillerPickerUI() {
    const W = 800, H = 600, cx = W / 2;

    const bg = this.add.sprite(cx, H / 2, 'characterScreen');
    bg.setScale(Math.max(W / 1150, H / 640));
    bg.play('charScreen');

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.35);
    overlay.fillRect(0, 0, W, H);

    const title = this.add.text(cx, 68, 'ESCOLHA SEU PERSONAGEM', {
      fontSize: '15px', color: '#e94560', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    const COLS = [175, 400, 625];
    const ROWS = [210, 345];
    const BTN_SCALE = 1.05;
    const BTN_H = 77 * BTN_SCALE;
    const ICON_SIZE = 90;

    KILLER_SKINS.forEach(({ skinId, iconKey, label }, i) => {
      const bx = COLS[i % 3];
      const by = ROWS[Math.floor(i / 3)];

      const charBtn = this.add.image(bx, by, 'botaoCharacter', 0)
        .setScale(BTN_SCALE)
        .setInteractive({ useHandCursor: true });

      this.killerCharacterBtns.push({ skinId, btn: charBtn });

      charBtn.on('pointerover', () => { if (skinId !== this.pickerKillerSkinId) charBtn.setFrame(1); });
      charBtn.on('pointerout',  () => this.drawKillerSkinRings());
      charBtn.on('pointerdown', () => this.selectKillerSkin(skinId));

      const nameLabel = this.add.text(bx, by + BTN_H / 2 + 3, label, {
        fontSize: '10px', color: '#e0e0e0', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0);

      this.killerPickerUI.push(charBtn, nameLabel);

      if (iconKey) {
        const icon = this.add.image(bx, by - 4, iconKey)
          .setDisplaySize(ICON_SIZE, ICON_SIZE)
          .setInteractive({ useHandCursor: true });
        icon.on('pointerover',  () => { if (skinId !== this.pickerKillerSkinId) charBtn.setFrame(1); });
        icon.on('pointerout',   () => this.drawKillerSkinRings());
        icon.on('pointerdown',  () => this.selectKillerSkin(skinId));
        this.killerPickerUI.push(icon);
      }
    });

    const confirmBtn = this.add.text(cx, 432, 'Confirmar', {
      fontSize: '15px', color: '#ffffff', backgroundColor: '#1565c0',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerdown', () => this.confirmKillerCharacter());
    confirmBtn.on('pointerover', () => confirmBtn.setBackgroundColor('#1976d2'));
    confirmBtn.on('pointerout',  () => confirmBtn.setBackgroundColor('#1565c0'));

    this.killerPickerUI.push(bg, overlay, title, confirmBtn);
    this.killerPickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.drawKillerSkinRings();
  }
```

- [ ] **Step 2: Add helper methods**

Add `drawKillerSkinRings()`, `selectKillerSkin()`, `showKillerPickerUI()`, `hideKillerPickerUI()`, and `confirmKillerCharacter()` after `buildKillerPickerUI()`:

```typescript
  private drawKillerSkinRings() {
    this.killerCharacterBtns.forEach(({ skinId, btn }) => {
      btn.setFrame(skinId === this.pickerKillerSkinId ? 1 : 0);
    });
  }

  private selectKillerSkin(skinId: string) {
    this.pickerKillerSkinId = skinId;
    this.drawKillerSkinRings();
  }

  private showKillerPickerUI() {
    this.killerPickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true));
    this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
    this.drawKillerSkinRings();
  }

  private hideKillerPickerUI() {
    this.killerPickerUI.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
  }

  private confirmKillerCharacter() {
    const skinLabel = KILLER_SKINS.find((s) => s.skinId === this.pickerKillerSkinId)?.label ?? this.pickerKillerSkinId;
    this.chosenKillerSkinId = this.pickerKillerSkinId;
    this.socket.emit('setCharacter', { name: skinLabel, skinId: this.pickerKillerSkinId });
    this.hideKillerPickerUI();
    this.showInRoomUI();
  }
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 5: Wire `buildKillerPickerUI()` into the scene lifecycle

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Call `buildKillerPickerUI()` in `create()`**

In `create()`, after the `this.buildPickerUI()` call, add:

```typescript
    this.buildKillerPickerUI();
```

- [ ] **Step 2: Route professor to killer picker in `roleAssigned`**

Find the `roleAssigned` socket handler in `create()`:

```typescript
    this.socket.on('roleAssigned', (role: LobbyRole) => {
      this.myRole = role;
      if (this.currentRoom) {
        if (role === 'survivor') {
          this.showPickerUI();
        } else {
          this.showInRoomUI();
        }
      }
      this.refreshActionLabel();
    });
```

Change the `else` branch so professor goes to the killer picker:

```typescript
    this.socket.on('roleAssigned', (role: LobbyRole) => {
      this.myRole = role;
      if (this.currentRoom) {
        if (role === 'survivor') {
          this.showPickerUI();
        } else {
          this.showKillerPickerUI();
        }
      }
      this.refreshActionLabel();
    });
```

- [ ] **Step 3: Route `gamePhase` to use `chosenKillerSkinId` for professor**

Find the `gamePhase` socket handler:

```typescript
    this.socket.on('gamePhase', (phase: string) => {
      if (phase === 'playing') {
        this.stopKeyboardInput();
        this.scene.start('GameScene', { socket: this.socket, roomName: this.currentRoom, skinId: this.chosenSkinId });
      }
    });
```

Update it to pass the correct skinId based on role:

```typescript
    this.socket.on('gamePhase', (phase: string) => {
      if (phase === 'playing') {
        this.stopKeyboardInput();
        const skinId = this.myRole === 'professor' ? this.chosenKillerSkinId : this.chosenSkinId;
        this.scene.start('GameScene', { socket: this.socket, roomName: this.currentRoom, skinId });
      }
    });
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 6: Update "Trocar personagem" button to work for both roles

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Update `backToPickerBtn` callback in `buildInRoomUI()`**

Find the `backToPickerBtn` setup in `buildInRoomUI()`:

```typescript
    this.backToPickerBtn.on('pointerdown', () => {
      this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
      this.backToPickerBtn.setVisible(false);
      this.showPickerUI();
    });
```

Update to branch on role:

```typescript
    this.backToPickerBtn.on('pointerdown', () => {
      this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
      this.backToPickerBtn.setVisible(false);
      if (this.myRole === 'professor') {
        this.showKillerPickerUI();
      } else {
        this.showPickerUI();
      }
    });
```

- [ ] **Step 2: Show "Trocar personagem" for professor too in `showInRoomUI()`**

Find:

```typescript
    this.backToPickerBtn.setVisible(this.myRole === 'survivor');
```

Change to:

```typescript
    this.backToPickerBtn.setVisible(this.myRole === 'survivor' || this.myRole === 'professor');
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 7: Update server to accept killer skins

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add `VALID_KILLER_SKINS`**

In `server/index.ts`, after line 51 (`const VALID_SURVIVOR_SKINS = ...`), add:

```typescript
const VALID_KILLER_SKINS = new Set(['professor', 'clayrton', 'fernanda', 'aquarioguy']);
```

- [ ] **Step 2: Update `setCharacter` handler**

Find the handler (around line 167):

```typescript
  socket.on('setCharacter', ({ name, skinId }: { name: string; skinId: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor') return;
    if (typeof name !== 'string' || typeof skinId !== 'string') return;
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) return;
    if (!VALID_SURVIVOR_SKINS.has(skinId)) return;
    p.name   = trimmed;
    p.skinId = skinId;
    io.to(roomName).emit('gameState', state);
  });
```

Replace with:

```typescript
  socket.on('setCharacter', ({ name, skinId }: { name: string; skinId: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p) return;
    if (typeof name !== 'string' || typeof skinId !== 'string') return;
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) return;
    if (p.role === 'survivor') {
      if (!VALID_SURVIVOR_SKINS.has(skinId)) return;
    } else if (p.role === 'professor') {
      if (!VALID_KILLER_SKINS.has(skinId)) return;
    } else {
      return;
    }
    p.name   = trimmed;
    p.skinId = skinId;
    io.to(roomName).emit('gameState', state);
  });
```

- [ ] **Step 3: Final typecheck**

```bash
npm run typecheck
```

Expected: no errors.
