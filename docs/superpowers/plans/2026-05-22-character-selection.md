# Character Selection & Name Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a character picker + name input to the lobby (survivor-only), propagate name/skinId through server → client → HUD cards and remote sprites.

**Architecture:** Server-authoritative — name and skinId are stored in `PlayerRecord`, broadcast in every `gameState`, and consumed by `GameScene` for HUD labels and sprite rendering. LobbyScene adds a `CharacterPickerUI` state triggered after `roleAssigned = 'survivor'`.

**Tech Stack:** TypeScript, Phaser 3, Socket.io, Node.js/Express

---

### Task 1: Add `name` and `skinId` to shared types

**Files:**
- Modify: `server/types.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add fields to `PlayerRecord` in `server/types.ts`**

In `server/types.ts`, add two fields to `PlayerRecord` after `beingHealed`:

```ts
export interface PlayerRecord {
  x: number;
  y: number;
  role: Role;
  ready: boolean;
  hp: number;
  downed: boolean;
  expelled: boolean;
  escaped: boolean;
  lastAttackTime: number;
  activeLunge?: { hitTargets: Set<string> };
  lookAngle: number;
  downCount:         0 | 1 | 2;
  healPct:           number;
  downBleedMs:       number;
  beingHealed:       boolean;
  healFailLockUntil: number;
  name:   string;
  skinId: string;
}
```

- [ ] **Step 2: Add fields to `PlayerState` in `src/types.ts`**

In `src/types.ts`, add two fields to `PlayerState` after `beingHealed`:

```ts
export interface PlayerState {
  x: number;
  y: number;
  role: Role;
  hp: number;
  downed: boolean;
  expelled: boolean;
  escaped: boolean;
  downCount:   0 | 1 | 2;
  healPct:     number;
  beingHealed: boolean;
  name:   string;
  skinId: string;
}
```

- [ ] **Step 3: Run typecheck — expect errors (fields not yet initialized)**

```bash
npm run typecheck
```

Expected: errors in `server/index.ts` about missing `name`/`skinId` on player creation. These will be fixed in Task 2.

---

### Task 2: Server — initialize fields + handle `setCharacter`

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Initialize `name` and `skinId` in the `joinRoom` handler**

In `server/index.ts`, inside the `joinRoom` handler, find the `state.players[socket.id] = { ... }` block (around line 115) and add `name: ''` and `skinId: ''`:

```ts
state.players[socket.id] = {
  x:               isProfessor ? DEFAULT_PROFESSOR_SPAWN.x : DEFAULT_SURVIVOR_SPAWN.x,
  y:               isProfessor ? DEFAULT_PROFESSOR_SPAWN.y : DEFAULT_SURVIVOR_SPAWN.y,
  role:            isProfessor ? 'professor' : 'survivor',
  ready:              false,
  hp:                 2,
  downed:             false,
  expelled:           false,
  escaped:            false,
  lastAttackTime:     0,
  lookAngle:          0,
  downCount:          0,
  healPct:            0,
  downBleedMs:        0,
  beingHealed:        false,
  healFailLockUntil:  0,
  name:               '',
  skinId:             '',
};
```

- [ ] **Step 2: Add `setCharacter` handler after `setReady`**

Insert this block after the `setReady` handler in `server/index.ts`:

```ts
const VALID_SURVIVOR_SKINS = new Set(['arthur', 'gustavo', 'giu', 'isabela']);

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

Note: place `VALID_SURVIVOR_SKINS` as a module-level constant before `io.on('connection', ...)`.

- [ ] **Step 3: Run typecheck — expect no errors**

```bash
npm run typecheck
```

Expected: PASS (all PlayerRecord fields now initialized).

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Open browser, join a room, open DevTools console and run:
```js
// find the socket from the Phaser game
const scene = window.game?.scene?.scenes?.[0];
```
Verify the server starts without crash. No functional change visible yet.

---

### Task 3: Add skin-by-id helpers to `playerSkins.ts`

**Files:**
- Modify: `src/game/playerSkins.ts`

- [ ] **Step 1: Add `getSkinById`**

Add after the `getSkinForRole` function (around line 151):

```ts
export function getSkinById(skinId: string): PlayerSkin {
  return PLAYER_SKINS[skinId] ?? PLAYER_SKINS.arthur;
}
```

- [ ] **Step 2: Add `applySkinByIdToSprite`**

Add after `applySkinToSprite`:

```ts
export function applySkinByIdToSprite(sprite: Phaser.GameObjects.Sprite, skinId: string): void {
  const skin = getSkinById(skinId);
  sprite.setTexture(skin.idle.key);
  sprite.setDisplaySize(skin.displayWidth, skin.displayHeight);
}
```

- [ ] **Step 3: Add `playSkinAnimation`**

Add after `playRoleAnimation`:

```ts
export function playSkinAnimation(
  sprite:    Phaser.GameObjects.Sprite,
  skinId:    string,
  state:     AnimationState,
  direction: MoveDirection,
): void {
  const skin = getSkinById(skinId);
  sprite.play(animationKey(skin, state, direction), true);
}
```

- [ ] **Step 4: Add `applyDownedFrameById`**

Add after `applyDownedFrame`:

```ts
export function applyDownedFrameById(
  sprite:    Phaser.GameObjects.Sprite,
  skinId:    string,
  direction: MoveDirection,
): boolean {
  const skin = getSkinById(skinId);
  if (!skin.hurt || !sprite.scene.textures.exists(skin.hurt.key)) return false;
  sprite.stop();
  sprite.setTexture(skin.hurt.key, DOWNED_DIRECTION_FRAMES[direction]);
  return true;
}
```

- [ ] **Step 5: Add `playHurtFallById`**

Add after `playHurtFallAnimation`:

```ts
export function playHurtFallById(
  sprite:    Phaser.GameObjects.Sprite,
  skinId:    string,
  direction: MoveDirection,
): void {
  const skin = getSkinById(skinId);
  if (!skin.hurt || !sprite.scene.textures.exists(skin.hurt.key)) {
    applyDownedFrameById(sprite, skinId, direction);
    return;
  }
  const key = `${skin.id}:hurt-fall`;
  if (!sprite.scene.anims.exists(key)) {
    sprite.scene.anims.create({
      key,
      frames: sprite.scene.anims.generateFrameNumbers(skin.hurt.key, { start: 0, end: 5 }),
      frameRate: 12,
      repeat: 0,
    });
  }
  sprite.once(`animationcomplete-${key}`, () => {
    if (sprite.active) applyDownedFrameById(sprite, skinId, direction);
  });
  sprite.play(key);
}
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

---

### Task 4: MovementSystem — add `skinId` to context and animation

**Files:**
- Modify: `src/game/MovementSystem.ts`

- [ ] **Step 1: Add `skinId` to `MovementContext` and update imports**

Replace the existing `MovementContext` interface and import block:

```ts
import {
  applyDownedFrameById, playCombatAnimation, playRoleAnimation, getSkinById,
  playSkinAnimation,
  type MoveDirection,
} from './playerSkins';

export interface MovementContext {
  role:             Role | null;
  downed:           boolean;
  sprinting:        boolean;
  onHitSprintTimer: number;
  bloodlustTier:    0 | 1 | 2 | 3;
  attackHoldActive: boolean;
  isSwinging:       boolean;
  skinId:           string;
}
```

- [ ] **Step 2: Update `applyAnimation` to use skin-by-id for survivors**

Replace the entire `applyAnimation` method:

```ts
applyAnimation(ctx: MovementContext, intendedToMove: boolean) {
  const { role, downed, skinId } = ctx;
  if (!role) return;

  if (downed && role === 'survivor') {
    const effectiveSkinId = skinId || 'arthur';
    const skin = getSkinById(effectiveSkinId);
    const hurtFallKey = `${skin.id}:hurt-fall`;
    const hurtFallPlaying = this.player.anims.currentAnim?.key === hurtFallKey && this.player.anims.isPlaying;
    if (!hurtFallPlaying) applyDownedFrameById(this.player, effectiveSkinId, this.facingDirection);
    return;
  }

  if (role === 'professor') {
    const inCombatStance = ctx.attackHoldActive && !ctx.isSwinging;
    if (inCombatStance) {
      if (!playCombatAnimation(this.player, role, this.facingDirection)) {
        playRoleAnimation(this.player, role, intendedToMove ? 'walk' : 'idle', this.facingDirection);
      }
    } else if (intendedToMove) {
      playRoleAnimation(this.player, role, 'walk', this.facingDirection);
    } else {
      playRoleAnimation(this.player, role, 'idle', this.facingDirection);
    }
    return;
  }

  const effectiveSkinId = skinId || 'arthur';
  if (intendedToMove) {
    const moveAnim = (ctx.sprinting || ctx.onHitSprintTimer > 0) ? 'run' : 'walk';
    playSkinAnimation(this.player, effectiveSkinId, moveAnim, this.facingDirection);
  } else {
    playSkinAnimation(this.player, effectiveSkinId, 'idle', this.facingDirection);
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: error in `GameScene.ts` about missing `skinId` in the `movCtx` object — this will be fixed in Task 6.

---

### Task 5: PlayerManager — use `skinId` from `PlayerState`

**Files:**
- Modify: `src/game/PlayerManager.ts`

- [ ] **Step 1: Update imports and `RemotePlayer` interface**

Replace the import block at the top:

```ts
import {
  applySkinByIdToSprite,
  applyDownedFrameById,
  getSkinById,
  getSkinForRole,
  playSkinAnimation,
  playCombatAnimation,
  playHurtFallById,
  type MoveDirection,
} from './playerSkins';
```

Replace the `RemotePlayer` interface:

```ts
interface RemotePlayer {
  sprite:          Phaser.GameObjects.Sprite;
  role:            Role;
  skinId:          string;
  facingDirection: MoveDirection;
  lastMoveAt:      number;
  isCharging:      boolean;
  isDowned:        boolean;
  pendingStagger:  boolean;
  staggerMs:       number;
  isPlayingHurt:   boolean;
}
```

- [ ] **Step 2: Update `getOrCreate` to use skinId**

Replace the `getOrCreate` method:

```ts
getOrCreate(id: string, data: Partial<PlayerState>): Phaser.GameObjects.Sprite {
  if (!this.others[id]) {
    const role: Role  = data.role ?? 'survivor';
    const skinId      = role === 'professor' ? 'professor' : (data.skinId || 'arthur');
    const skin        = getSkinById(skinId);
    const sprite      = this.scene.add.sprite(data.x ?? 100, data.y ?? 100, skin.idle.key).setDepth(5);
    applySkinByIdToSprite(sprite, skinId);
    this.others[id] = {
      sprite,
      role,
      skinId,
      facingDirection: 'down',
      lastMoveAt: 0,
      isCharging: false,
      isDowned: false,
      pendingStagger: false,
      staggerMs: 0,
      isPlayingHurt: false,
    };
    playSkinAnimation(sprite, skinId, 'idle', 'down');
  }

  const tracked = this.others[id];

  if (data.role && tracked.role !== data.role) {
    tracked.role   = data.role;
    tracked.skinId = data.role === 'professor' ? 'professor' : (data.skinId || 'arthur');
    applySkinByIdToSprite(tracked.sprite, tracked.skinId);
    playSkinAnimation(tracked.sprite, tracked.skinId, 'idle', tracked.facingDirection);
  } else if (data.skinId && data.skinId !== tracked.skinId && tracked.role !== 'professor') {
    tracked.skinId = data.skinId;
    applySkinByIdToSprite(tracked.sprite, tracked.skinId);
    playSkinAnimation(tracked.sprite, tracked.skinId, 'idle', tracked.facingDirection);
  }

  return tracked.sprite;
}
```

- [ ] **Step 3: Update all remaining skin calls in PlayerManager to use `tracked.skinId`**

Find every call to `applySkinToSprite`, `playRoleAnimation`, `getSkinForRole`, `applyDownedFrame`, `playHurtFallAnimation` that uses `p.role` or `tracked.role`, and replace with the skinId-based equivalents.

The pattern to follow for each substitution:

| Old call | New call |
|----------|----------|
| `applySkinToSprite(p.sprite, p.role)` | `applySkinByIdToSprite(p.sprite, p.skinId)` |
| `playRoleAnimation(p.sprite, p.role, anim, dir)` | `playSkinAnimation(p.sprite, p.skinId, anim, dir)` |
| `getSkinForRole(tracked.role)` | `getSkinById(tracked.skinId)` |
| `applyDownedFrame(p.sprite, p.role, dir)` | `applyDownedFrameById(p.sprite, p.skinId, dir)` |
| `playHurtFallAnimation(p.sprite, p.role, dir)` | `playHurtFallById(p.sprite, p.skinId, dir)` |

The `playCombatAnimation(p.sprite, p.role, dir)` call stays as-is (professor only, role-based is correct).

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: errors in `GameScene.ts` only (missing `skinId` in movCtx — fixed in Task 6).

---

### Task 6: GameScene — `mySkinId`, `survivorMeta`, skin calls

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add new fields and update imports**

In `GameScene`, add to the class fields (near `private myRole`):

```ts
private mySkinId     = '';
private survivorMeta = new Map<string, { name: string; skinId: string }>();
```

Update the import from `../game/playerSkins` to include the new helpers:

```ts
import {
  applySkinToSprite,
  applySkinByIdToSprite,
  applyDownedFrame,
  applyDownedFrameById,
  ensurePlayerSkinAnimations,
  getSkinById,
  getSkinForRole,
  type MoveDirection,
  playRoleAnimation,
  playSkinAnimation,
  playHurtFallAnimation,
  playHurtFallById,
  preloadPlayerSkins,
} from '../game/playerSkins';
```

- [ ] **Step 2: Read `skinId` from scene data in `create()`**

Change the `create` signature and add `mySkinId` initialization:

```ts
create(data?: { socket?: Socket; skinId?: string; roomName?: string }) {
  this.socket   = data?.socket ?? io();
  this.mySkinId = (data?.skinId && data.skinId !== 'professor') ? data.skinId : '';
  this.resetLocalState();
  ...
```

- [ ] **Step 3: Update `resetLocalState` to clear `survivorMeta`**

In the `resetLocalState` method, add:

```ts
this.survivorMeta.clear();
```

- [ ] **Step 4: Update `roleAssigned` handler to use `mySkinId`**

Find the `roleAssigned` handler in `_bindGameLifecycle` (around line 324) and replace:

```ts
s.on('roleAssigned', (role: Role) => {
  this.myRole = role;
  if (role === 'survivor' && this.mySkinId) {
    applySkinByIdToSprite(this.player, this.mySkinId);
    playSkinAnimation(this.player, this.mySkinId, 'idle', this.movement.facingDirection);
  } else {
    applySkinToSprite(this.player, role);
    playRoleAnimation(this.player, role, 'idle', this.movement.facingDirection);
  }
  const spawn = this.getSpawnPoint(role);
  this.player.setPosition(spawn.x, spawn.y);
  this.hud.build();
  this.hud.update(role, this.myHp, this.downed);
});
```

- [ ] **Step 5: Update `playHurtFallAnimation` call for local player**

Find the `playerDowned` socket handler (around line 536). Replace:

```ts
playHurtFallAnimation(this.player, 'survivor', this.movement.facingDirection);
```

With:

```ts
playHurtFallById(this.player, this.mySkinId || 'arthur', this.movement.facingDirection);
```

- [ ] **Step 6: Update the frozen-state animation block in `update()`**

Find the block around line 713:

```ts
if (this.myRole && !this.isHitStagger) {
  if (this.downed && this.myRole === 'survivor') {
    const skin = getSkinForRole('survivor');
    const hurtFallKey = `${skin.id}:hurt-fall`;
    const hurtFallPlaying = this.player.anims.currentAnim?.key === hurtFallKey && this.player.anims.isPlaying;
    if (!hurtFallPlaying) applyDownedFrame(this.player, 'survivor', this.movement.facingDirection);
  } else {
    playRoleAnimation(this.player, this.myRole, 'idle', this.movement.facingDirection);
  }
}
```

Replace with:

```ts
if (this.myRole && !this.isHitStagger) {
  if (this.downed && this.myRole === 'survivor') {
    const effectiveSkinId = this.mySkinId || 'arthur';
    const skin = getSkinById(effectiveSkinId);
    const hurtFallKey = `${skin.id}:hurt-fall`;
    const hurtFallPlaying = this.player.anims.currentAnim?.key === hurtFallKey && this.player.anims.isPlaying;
    if (!hurtFallPlaying) applyDownedFrameById(this.player, effectiveSkinId, this.movement.facingDirection);
  } else if (this.myRole === 'survivor' && this.mySkinId) {
    playSkinAnimation(this.player, this.mySkinId, 'idle', this.movement.facingDirection);
  } else {
    playRoleAnimation(this.player, this.myRole, 'idle', this.movement.facingDirection);
  }
}
```

- [ ] **Step 7: Add `skinId` to `movCtx`**

Find the `movCtx` object in the `update()` method and add `skinId`:

```ts
const movCtx = {
  role:             this.myRole,
  downed:           this.downed,
  sprinting:        this.sprinting,
  onHitSprintTimer: this.onHitSprintTimer,
  bloodlustTier:    this.bloodlustTier,
  attackHoldActive: this.combat.isAttackHeld(),
  isSwinging:       this.combat.isSwinging(),
  skinId:           this.mySkinId,
};
```

- [ ] **Step 8: Populate `survivorMeta` from `gameState` event**

Inside the `gameState` handler, in the `Object.entries(state.players).forEach` loop, add after `this.trackSurvivor(...)`:

```ts
if (p.role === 'survivor') {
  this.survivorMeta.set(id, { name: p.name || '', skinId: p.skinId || '' });
}
```

- [ ] **Step 9: Update `refreshSurvivorHUD` to use `survivorMeta`**

Replace the existing `refreshSurvivorHUD` method:

```ts
private refreshSurvivorHUD() {
  const statuses = this.survivorOrder.map((id, i) => {
    const info = this.survivorInfo.get(id) ?? {
      hp: 2, downed: false, expelled: false, escaped: false,
      hacking: false, downCount: 0 as const, healPct: 0, beingHealed: false,
    };
    const meta   = this.survivorMeta.get(id);
    const label  = meta?.name   || `A${i + 1}`;
    const skinId = meta?.skinId || GameScene.SURVIVOR_SKIN_SLOTS[i] ?? 'arthur';
    return { label, skinId, ...info };
  });
  this.hud.setSurvivorStatuses(statuses, this.myRole === 'survivor');
}
```

- [ ] **Step 10: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

---

### Task 7: LobbyScene — CharacterPickerUI

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Add survivor skin icon data constant**

Add at the top of `LobbyScene.ts`, after the imports:

```ts
const SURVIVOR_SKINS = [
  { skinId: 'arthur',   iconKey: 'arthur-icon',   iconPath: '/personagens/arthur/icons/Arthur_Icon.png',     label: 'Arthur'  },
  { skinId: 'gustavo',  iconKey: 'gustavo-icon',  iconPath: '/personagens/gustavo/icons/Gustavo_Icon.png',   label: 'Gustavo' },
  { skinId: 'giu',      iconKey: 'giu-icon',      iconPath: '/personagens/giu/icons/Giu_Icon.png',           label: 'Giu'     },
  { skinId: 'isabela',  iconKey: 'isabela-icon',  iconPath: '/personagens/isabela/icons/Isabela_Icon.png',   label: 'Isabela' },
] as const;
```

- [ ] **Step 2: Add new class fields**

Add to the class body, after `private currentRoom`:

```ts
private chosenSkinId   = 'arthur';
private pickerSkinId   = 'arthur';
private pickerName     = '';
private pickerUI:      Phaser.GameObjects.GameObject[] = [];
private nameDisplay!:  Phaser.GameObjects.Text;
private skinRings:     { skinId: string; ring: Phaser.GameObjects.Graphics }[] = [];
private cursorBlink    = 0;
private kbListener:    ((e: KeyboardEvent) => void) | null = null;
```

- [ ] **Step 3: Add `preload()` method**

Add before `create()`:

```ts
preload() {
  SURVIVOR_SKINS.forEach(({ iconKey, iconPath }) => {
    if (!this.textures.exists(iconKey)) {
      this.load.image(iconKey, iconPath);
    }
  });
}
```

- [ ] **Step 4: Refactor `joinRoom` — don't show UI yet**

Replace the `joinRoom` method:

```ts
private joinRoom(idx: number) {
  const name = ROOM_NAMES[idx];
  if (!name || this.currentRoom) return;
  this.currentRoom = name;
  this.socket.emit('joinRoom', { roomName: name });
  this.roomButtons.forEach((b) => b.setVisible(false));
}
```

- [ ] **Step 5: Update `roleAssigned` socket handler to branch on role**

Find the `socket.on('roleAssigned', ...)` in `create()` and replace:

```ts
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

- [ ] **Step 6: Build the picker UI elements in `buildPickerUI()`**

Add this method to the class:

```ts
private buildPickerUI() {
  const CENTER_X = 400;

  const title = this.add.text(CENTER_X, 150, 'Escolha seu personagem', {
    fontSize: '20px', color: '#e94560', stroke: '#000', strokeThickness: 4,
  }).setOrigin(0.5);

  const nameLabelText = this.add.text(CENTER_X, 195, 'Seu nome (max 12 caracteres):', {
    fontSize: '13px', color: '#aaa',
  }).setOrigin(0.5);

  const nameBox = this.add.graphics();
  nameBox.fillStyle(0x111122, 0.9);
  nameBox.fillRoundedRect(CENTER_X - 120, 210, 240, 36, 6);
  nameBox.lineStyle(2, 0x4285f4, 0.8);
  nameBox.strokeRoundedRect(CENTER_X - 120, 210, 240, 36, 6);

  this.nameDisplay = this.add.text(CENTER_X, 228, '_', {
    fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5);

  const skinY    = 320;
  const iconSize = 64;
  const gap      = 24;
  const totalW   = SURVIVOR_SKINS.length * iconSize + (SURVIVOR_SKINS.length - 1) * gap;
  const startX   = CENTER_X - totalW / 2 + iconSize / 2;

  SURVIVOR_SKINS.forEach(({ skinId, iconKey, label }, i) => {
    const bx = startX + i * (iconSize + gap);
    const by = skinY;

    const ring = this.add.graphics();
    this.skinRings.push({ skinId, ring });

    const btn = this.add.image(bx, by, iconKey)
      .setDisplaySize(iconSize, iconSize)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => this.selectSkin(skinId));
    btn.on('pointerover', () => { if (skinId !== this.pickerSkinId) ring.lineStyle(2, 0x888888, 0.6).strokeRect(bx - iconSize / 2, by - iconSize / 2, iconSize, iconSize); });
    btn.on('pointerout',  () => this.drawSkinRings());

    const nameText = this.add.text(bx, by + iconSize / 2 + 10, label, {
      fontSize: '12px', color: '#cccccc',
    }).setOrigin(0.5, 0);

    this.pickerUI.push(ring, btn, nameText);
  });

  const confirmBtn = this.add.text(CENTER_X, 440, 'Confirmar', {
    fontSize: '18px', color: '#ffffff', backgroundColor: '#1565c0',
    padding: { x: 20, y: 10 },
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  confirmBtn.on('pointerdown', () => this.confirmCharacter());
  confirmBtn.on('pointerover', () => confirmBtn.setBackgroundColor('#1976d2'));
  confirmBtn.on('pointerout',  () => confirmBtn.setBackgroundColor('#1565c0'));

  this.pickerUI.push(title, nameLabelText, nameBox, this.nameDisplay, confirmBtn);

  this.pickerUI.forEach((o) => (o as Phaser.GameObjects.Components.Visible).setVisible(false));
  this.drawSkinRings();
}
```

- [ ] **Step 7: Add `drawSkinRings` helper**

```ts
private drawSkinRings() {
  const iconSize = 64;
  const gap      = 24;
  const totalW   = SURVIVOR_SKINS.length * iconSize + (SURVIVOR_SKINS.length - 1) * gap;
  const startX   = 400 - totalW / 2 + iconSize / 2;

  this.skinRings.forEach(({ skinId, ring }, i) => {
    ring.clear();
    const bx = startX + i * (iconSize + gap);
    const by = 320;
    if (skinId === this.pickerSkinId) {
      ring.lineStyle(3, 0xe94560, 1);
      ring.strokeRect(bx - iconSize / 2 - 2, by - iconSize / 2 - 2, iconSize + 4, iconSize + 4);
    }
  });
}
```

- [ ] **Step 8: Add `selectSkin` helper**

```ts
private selectSkin(skinId: string) {
  this.pickerSkinId = skinId;
  this.drawSkinRings();
}
```

- [ ] **Step 9: Add `showPickerUI` and `hidePickerUI`**

```ts
private showPickerUI() {
  this.pickerUI.forEach((o) => (o as Phaser.GameObjects.Components.Visible).setVisible(true));
  this.inRoomUI.forEach((o) => (o as Phaser.GameObjects.Text).setVisible(false));
  this.drawSkinRings();
  this.startKeyboardInput();
}

private hidePickerUI() {
  this.pickerUI.forEach((o) => (o as Phaser.GameObjects.Components.Visible).setVisible(false));
  this.stopKeyboardInput();
}
```

- [ ] **Step 10: Add keyboard input methods**

```ts
private startKeyboardInput() {
  this.kbListener = (e: KeyboardEvent) => {
    if (e.key === 'Backspace') {
      this.pickerName = this.pickerName.slice(0, -1);
    } else if (e.key.length === 1 && this.pickerName.length < 12) {
      this.pickerName += e.key;
    }
    this.nameDisplay.setText(this.pickerName || '_');
  };
  window.addEventListener('keydown', this.kbListener);
}

private stopKeyboardInput() {
  if (this.kbListener) {
    window.removeEventListener('keydown', this.kbListener);
    this.kbListener = null;
  }
}
```

- [ ] **Step 11: Add `confirmCharacter`**

```ts
private confirmCharacter() {
  const name = this.pickerName.trim();
  if (!name) return;
  this.chosenSkinId = this.pickerSkinId;
  this.socket.emit('setCharacter', { name, skinId: this.pickerSkinId });
  this.hidePickerUI();
  this.showInRoomUI();
}
```

- [ ] **Step 12: Call `buildPickerUI()` in `create()` and pass skinId in scene transition**

In `create()`, after `buildInRoomUI()`:

```ts
this.buildRoomButtons();
this.buildInRoomUI();
this.buildPickerUI();   // ← add this
this.showRoomSelection();
```

Update the `gamePhase` socket listener to pass `skinId`:

```ts
this.socket.on('gamePhase', (phase: string) => {
  if (phase === 'playing') {
    this.stopKeyboardInput();
    this.scene.start('GameScene', { socket: this.socket, roomName: this.currentRoom, skinId: this.chosenSkinId });
  }
});
```

- [ ] **Step 13: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 14: Manual end-to-end test**

```bash
npm run dev
```

Open two browser tabs (or windows) both at `http://localhost:5173`.

**Tab 1 (professor):**
1. Click a room → should go directly to waiting room UI (no picker shown)

**Tab 2 (survivor):**
1. Click the same room → character picker should appear
2. Type a name (up to 12 chars) using keyboard
3. Click a character icon — red border should appear around the selected one
4. Click "Confirmar" → waiting room UI appears

**Tab 1:**
5. See the `Alunos prontos: 0/1` counter update

**Tab 2:**
6. Click "Marcar como pronto"

**Tab 1:**
7. Click "Iniciar partida"

**In game (Tab 2):**
8. HUD survivor cards should show the typed name instead of "A1"
9. The sprite in the game world should use the chosen character's animations

**In game (Tab 1 — professor):**
10. HUD survivor cards should show Tab 2's name and chosen character icon

---

## Self-Review Notes

- **Spec coverage:** All 8 files from the spec are covered across Tasks 1–7. CharacterPickerUI flow matches spec (after room join, survivor only, name+skin, confirm). Server validates skinId against valid set. Name trimmed to 12 chars server-side.
- **Fallbacks:** `label || A${i+1}` and `skinId || SURVIVOR_SKIN_SLOTS[i]` preserved in `refreshSurvivorHUD`. Professor always falls through to role-based animation.
- **Type consistency:** `getSkinById`, `applySkinByIdToSprite`, `playSkinAnimation`, `applyDownedFrameById`, `playHurtFallById` are defined in Task 3 and consumed in Tasks 4–6. `survivorMeta` defined in Task 6 Step 1, populated in Step 8, read in Step 9. `MovementContext.skinId` defined in Task 4, provided in Task 6 Step 7.
- **Known limitation:** Gamepad navigation not supported in the character picker (keyboard + mouse only). This is acceptable since the player must type a name anyway.
