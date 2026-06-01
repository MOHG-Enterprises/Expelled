# Room Player Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a hard cap of 5 players per room — the server rejects the join and the client shows a temporary error message.

**Architecture:** Add `MAX_PLAYERS_PER_ROOM = 5` to `shared/gameRules.ts` (server-side source of truth), re-export it through `server/gameState.ts` and `src/constants.ts` (client side). The `joinRoom` handler in `server/index.ts` checks the count before admitting a player; if full, emits `joinRejected { reason: 'full' }` back to that socket only. `LobbyScene` listens for `joinRejected`, resets its state, and shows a 2-second error banner.

**Tech Stack:** TypeScript, Node.js/Express, Socket.io, Phaser 3

---

### Task 1: Add `MAX_PLAYERS_PER_ROOM` constant

**Files:**
- Modify: `shared/gameRules.ts`
- Modify: `server/gameState.ts`
- Modify: `src/constants.ts`

- [ ] **Step 1: Add constant to shared/gameRules.ts**

At the end of `shared/gameRules.ts`, append:

```ts
export const MAX_PLAYERS_PER_ROOM = 5;
```

- [ ] **Step 2: Re-export from server/gameState.ts**

In `server/gameState.ts`, the existing import block from `shared/gameRules.ts` starts around line 2. Add `MAX_PLAYERS_PER_ROOM` to that import and add a re-export line alongside the existing pattern (e.g., `export { HACK_AMOUNT_MAX };` etc.).

Find the block of named re-exports near the bottom of `server/gameState.ts` (the `export { HACK_AMOUNT_MAX };` lines) and add:

```ts
export { MAX_PLAYERS_PER_ROOM };
```

Also add `MAX_PLAYERS_PER_ROOM` to the destructured import from `'../shared/gameRules'` at the top of the file.

- [ ] **Step 3: Re-export from src/constants.ts**

In `src/constants.ts`, the existing re-export block from `shared/gameRules` (around line 4) includes several constants. Add `MAX_PLAYERS_PER_ROOM` to that import and include it in the `export { ... }` block below.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add shared/gameRules.ts server/gameState.ts src/constants.ts
git commit -m "feat: add MAX_PLAYERS_PER_ROOM constant to shared rules"
```

---

### Task 2: Enforce limit in server joinRoom handler

**Files:**
- Modify: `server/index.ts` (lines 109–146)

- [ ] **Step 1: Import MAX_PLAYERS_PER_ROOM**

In `server/index.ts`, find the import from `'./gameState'` (near the top). Add `MAX_PLAYERS_PER_ROOM` to the destructured imports.

- [ ] **Step 2: Add capacity check**

Inside the `joinRoom` handler (currently line 109), after the two existing guard lines:

```ts
if (!(ROOM_NAMES as readonly string[]).includes(roomName)) return;
if (socketToRoom.has(socket.id)) return;
```

Add a third guard immediately after (before `getOrCreateRoom`):

```ts
const existing = rooms[roomName];
if (existing && Object.keys(existing.players).length >= MAX_PLAYERS_PER_ROOM) {
  socket.emit('joinRejected', { reason: 'full' });
  return;
}
```

The full handler block after the change looks like:

```ts
socket.on('joinRoom', ({ roomName }: { roomName: string }) => {
  if (!(ROOM_NAMES as readonly string[]).includes(roomName)) return;
  if (socketToRoom.has(socket.id)) return;

  const existing = rooms[roomName];
  if (existing && Object.keys(existing.players).length >= MAX_PLAYERS_PER_ROOM) {
    socket.emit('joinRejected', { reason: 'full' });
    return;
  }

  const state = getOrCreateRoom(roomName);
  socket.join(roomName);
  // ... rest unchanged
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: reject joinRoom when room is at MAX_PLAYERS_PER_ROOM"
```

---

### Task 3: Handle joinRejected in LobbyScene

**Files:**
- Modify: `src/scenes/LobbyScene.ts`

- [ ] **Step 1: Import MAX_PLAYERS_PER_ROOM**

In `src/scenes/LobbyScene.ts` line 4:

```ts
import { ROOM_NAMES } from '../constants';
```

Change to:

```ts
import { ROOM_NAMES, MAX_PLAYERS_PER_ROOM } from '../constants';
```

- [ ] **Step 2: Add errorText field**

In the class property declarations (around line 30), add:

```ts
private errorText!: Phaser.GameObjects.Text;
```

- [ ] **Step 3: Create errorText in buildInRoomUI (it lives outside inRoomUI so it can show during room selection)**

At the end of `buildInRoomUI()`, after the `this.inRoomUI = [...]` line, add:

```ts
this.errorText = this.add.text(400, 560, '', {
  fontSize: '16px', color: '#e94560', align: 'center',
}).setOrigin(0.5).setVisible(false);
```

- [ ] **Step 4: Listen for joinRejected in create()**

In `create()`, after the existing `this.socket.on('gamePhase', ...)` block (around line 126), add:

```ts
this.socket.on('joinRejected', ({ reason }: { reason: string }) => {
  if (reason === 'full') {
    this.currentRoom = null;
    this.showRoomSelection();
    this.errorText.setText('Sala cheia! Escolha outra.').setVisible(true);
    this.time.delayedCall(2000, () => this.errorText.setVisible(false));
  }
});
```

- [ ] **Step 5: Replace hardcoded 5 with MAX_PLAYERS_PER_ROOM**

In `roomLabel()` (line 424):

```ts
return `${name.toUpperCase()}  —  ${count}/5 jogadores${phaseStr}`;
```

Change to:

```ts
return `${name.toUpperCase()}  —  ${count}/${MAX_PLAYERS_PER_ROOM} jogadores${phaseStr}`;
```

In `gameState` listener (line 116):

```ts
this.countText.setText(`Jogadores na sala: ${this.playerCount} / 5`);
```

Change to:

```ts
this.countText.setText(`Jogadores na sala: ${this.playerCount} / ${MAX_PLAYERS_PER_ROOM}`);
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/LobbyScene.ts
git commit -m "feat: show joinRejected error and replace hardcoded player cap with constant"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open 5 browser tabs and join the same room**

All 5 should join normally and see `5 / 5 jogadores`.

- [ ] **Step 3: Open a 6th tab and try to join the same room**

Expected: the 6th tab stays on the room-selection screen, shows "Sala cheia! Escolha outra." for ~2 seconds, then the message disappears. The room list still shows `5 / 5 jogadores`.

- [ ] **Step 4: Verify the 6th player can join a different room**

Expected: joins normally, receives a role, proceeds to the lobby flow.
