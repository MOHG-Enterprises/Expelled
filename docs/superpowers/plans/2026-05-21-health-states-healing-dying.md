# Health States, Healing & Dying — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the detention mini-game with a DBD-inspired dying state, down-count bleed-out system, and altruistic healing mechanic that mirrors the terminal hacking flow.

**Architecture:** Server owns all authoritative state (`downCount`, `healPct`, `downBleedMs`, `beingHealed`). Client mirrors the hack interaction pattern exactly for healing (passive tick + random skill check timer). A priority resolver in `_updateSurvivorInteractions` picks downed ally → injured ally → terminal when E is held, enforcing mutual exclusion. The bleed-out tick runs in the existing 500 ms server interval.

**Tech Stack:** TypeScript, Phaser 3, Node.js/Express, Socket.io, tsx (server hot-reload)

**Spec:** `docs/superpowers/specs/2026-05-21-health-states-healing-dying-design.md`

---

## File Map

| File | Change |
|------|--------|
| `shared/gameRules.ts` | Add server-validated heal constants; remove `DETENTION_SKILL_CHECKS_REQUIRED` |
| `server/types.ts` | Add `downCount`, `healPct`, `downBleedMs`, `beingHealed`, `healFailLockUntil`; remove `detentionHits` |
| `src/types.ts` | Add `downCount`, `healPct`, `beingHealed` to `PlayerState` |
| `src/constants.ts` | Add client-only heal constants; remove `DETENTION_SKILL_CHECKS_REQUIRED` re-export |
| `server/gameState.ts` | Re-export new constants; remove `DETENTION_SKILL_CHECKS_REQUIRED` |
| `server/index.ts` | Remove detention handler; add heal handlers; update attack/lungeTick; add bleed-out tick; add `roomHealingMap` |
| `src/scenes/GameScene.ts` | Remove detention; add heal state fields; heal interaction loop; crawl speed; new socket handlers |
| `src/game/PlayerManager.ts` | Add `getPosition(id)` method |
| `src/game/HUD.ts` | Remove HP bar; add down-count dots; add bleed-out/recovery/heal bars; add heal alert arrows |

---

## Task 1: Constants, Types, and Initialization

**Files:**
- Modify: `shared/gameRules.ts`
- Modify: `server/types.ts`
- Modify: `src/types.ts`
- Modify: `src/constants.ts`
- Modify: `server/gameState.ts`
- Modify: `server/index.ts` (joinRoom player init only)

- [ ] **Step 1: Add server-validated heal constants to `shared/gameRules.ts`**

Remove `export const DETENTION_SKILL_CHECKS_REQUIRED = 3;` and add at the bottom:

```ts
export const BLEED_OUT_MS         = 70_000;
export const HEAL_FAIL_REGRESSION = 10;
export const HEAL_FAIL_LOCK_MS    = 3_000;
export const HEAL_AMOUNT_MAX      = 20;
export const HEAL_SELF_CAP        = 95;
```

- [ ] **Step 2: Update `server/types.ts` — remove `detentionHits`, add new fields**

Replace the `PlayerRecord` interface entirely:

```ts
export type Role      = 'professor' | 'survivor';
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5';
export type GamePhase = 'lobby' | 'playing' | 'ended';

export interface Vec2 { x: number; y: number; }

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
  downCount:        0 | 1 | 2;
  healPct:          number;
  downBleedMs:      number;
  beingHealed:      boolean;
  healFailLockUntil: number;
}

export interface GameStateRecord {
  players:           Record<string, PlayerRecord>;
  terminals:         Record<TerminalId, number>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount:       number;
  gates:             Record<string, number>;
  gatesOpen:         Record<string, boolean>;
  gatesPowered:      boolean;
  endgameStartedAt:  number | null;
  phase:             GamePhase;
  chase: {
    target:    string | null;
    elapsed:   number;
    tier:      0 | 1 | 2 | 3;
    losLostAt: number | null;
  };
}
```

- [ ] **Step 3: Update `src/types.ts` — add new fields to `PlayerState`**

```ts
export type Role = 'professor' | 'survivor';
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5';
export type GamePhase = 'lobby' | 'playing' | 'ended';

export interface Vec2 {
  x: number;
  y: number;
}

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
}

export interface GameState {
  players: Record<string, PlayerState>;
  terminals: Record<TerminalId, number>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount: number;
  gateOpen: boolean;
  phase: GamePhase;
}
```

- [ ] **Step 4: Add client-only heal constants to `src/constants.ts`**

Remove the line `DETENTION_SKILL_CHECKS_REQUIRED,` from the re-export block at the top.

Add after the `//Hack` block:

```ts
//  Heal
export const HEAL_PASSIVE_TICK      = 5;    // % per passive tick (altruistic)
export const HEAL_PASSIVE_RATE_MS   = 1_000; // passive tick interval
export const HEAL_GREAT_BONUS       = 10;   // % bonus on great zone (altruistic)
export const HEAL_SELF_RATE_FACTOR  = 0.5;  // self-heal is half speed
export const CRAWL_SPEED_FACTOR     = 0.28; // fraction of PLAYER_SPEED while downed
```

Also add to the shared re-export block at the top:
```ts
  BLEED_OUT_MS,
  HEAL_FAIL_REGRESSION,
  HEAL_FAIL_LOCK_MS,
  HEAL_AMOUNT_MAX,
  HEAL_SELF_CAP,
```

- [ ] **Step 5: Update `server/gameState.ts` — swap constants**

Remove from the import list at the top:
```ts
  DETENTION_SKILL_CHECKS_REQUIRED,
```

Add to the import list:
```ts
  BLEED_OUT_MS,
  HEAL_FAIL_REGRESSION,
  HEAL_FAIL_LOCK_MS,
  HEAL_AMOUNT_MAX,
  HEAL_SELF_CAP,
```

Remove the re-export line:
```ts
export { DETENTION_SKILL_CHECKS_REQUIRED };
```

Add re-export lines:
```ts
export { BLEED_OUT_MS };
export { HEAL_FAIL_REGRESSION };
export { HEAL_FAIL_LOCK_MS };
export { HEAL_AMOUNT_MAX };
export { HEAL_SELF_CAP };
```

- [ ] **Step 6: Update `server/index.ts` — fix joinRoom player initialization**

In the `joinRoom` socket handler, replace the player object literal:

```ts
state.players[socket.id] = {
  x:                isProfessor ? DEFAULT_PROFESSOR_SPAWN.x : DEFAULT_SURVIVOR_SPAWN.x,
  y:                isProfessor ? DEFAULT_PROFESSOR_SPAWN.y : DEFAULT_SURVIVOR_SPAWN.y,
  role:             isProfessor ? 'professor' : 'survivor',
  ready:            false,
  hp:               2,
  downed:           false,
  expelled:         false,
  escaped:          false,
  lastAttackTime:   0,
  lookAngle:        0,
  downCount:        0,
  healPct:          0,
  downBleedMs:      0,
  beingHealed:      false,
  healFailLockUntil: 0,
};
```

- [ ] **Step 7: Update imports in `server/index.ts`**

In the destructured import from `'./gameState'`, remove `DETENTION_SKILL_CHECKS_REQUIRED` and add:

```ts
  BLEED_OUT_MS,
  HEAL_FAIL_REGRESSION,
  HEAL_FAIL_LOCK_MS,
  HEAL_AMOUNT_MAX,
  HEAL_SELF_CAP,
```

- [ ] **Step 8: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors (or only pre-existing errors unrelated to this task).

- [ ] **Step 9: Commit**

```bash
git add shared/gameRules.ts server/types.ts src/types.ts src/constants.ts server/gameState.ts server/index.ts
git commit -m "feat: add heal/bleed-out types and constants, remove detention constant"
```

---

## Task 2: Server — Attack Logic with downCount

**Files:**
- Modify: `server/index.ts` (attack and lungeTick handlers)

- [ ] **Step 1: Extract a helper function for dealing damage**

Add this helper function before the `io.on('connection', ...)` block:

```ts
function applyDamage(
  state: GameStateRecord,
  id: string,
  target: import('./types').PlayerRecord,
  roomName: string,
): void {
  target.hp--;
  if (target.hp > 0) {
    io.to(roomName).emit('playerHit', { targetId: id, hp: target.hp });
    return;
  }
  target.hp = 0;
  if (target.downCount >= 2) {
    target.expelled = true;
    io.to(roomName).emit('playerExpelled', id);
    checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
    return;
  }
  target.downCount = (target.downCount + 1) as 0 | 1 | 2;
  target.downed        = true;
  target.healPct       = 0;
  target.downBleedMs   = 0;
  if (target.beingHealed) {
    target.beingHealed = false;
    io.to(roomName).emit('setBeingHealed', { targetId: id, isBeingHealed: false });
  }
  io.to(roomName).emit('playerDowned', { id, downCount: target.downCount });
}
```

- [ ] **Step 2: Update the `attack` handler to use `applyDamage`**

Find the block inside the `attack` handler that does:
```ts
      hitAny = true;
      target.hp--;
      if (target.hp <= 0) {
        target.hp = 0;
        target.downed = true;
        target.detentionHits = 0;
        io.to(roomName).emit('playerDowned', id);
      } else {
        io.to(roomName).emit('playerHit', { targetId: id, hp: target.hp });
      }
```

Replace with:
```ts
      hitAny = true;
      applyDamage(state, id, target, roomName);
```

- [ ] **Step 3: Update the `lungeTick` handler to use `applyDamage`**

Find the block inside `lungeTick` that does:
```ts
      attacker.activeLunge!.hitTargets.add(id);
      target.hp--;
      if (target.hp <= 0) {
        target.hp = 0;
        target.downed = true;
        target.detentionHits = 0;
        io.to(roomName).emit('playerDowned', id);
      } else {
        io.to(roomName).emit('playerHit', { targetId: id, hp: target.hp });
      }
```

Replace with:
```ts
      attacker.activeLunge!.hitTargets.add(id);
      applyDamage(state, id, target, roomName);
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat: handle downCount in attack — expel on third down"
```

---

## Task 3: Server — Bleed-Out Tick

**Files:**
- Modify: `server/index.ts` (500 ms interval)

- [ ] **Step 1: Add bleed-out logic to the existing 500 ms interval**

Inside the `setInterval(() => { ... }, 500)` block, after the existing terminal regression and bloodlust logic, add before the closing `}`:

```ts
    // bleed-out tick — downed survivors lose a "down" every BLEED_OUT_MS
    Object.entries(state.players).forEach(([id, p]) => {
      if (!p.downed || p.expelled) return;
      p.downBleedMs += 500;
      if (p.downBleedMs < BLEED_OUT_MS) return;

      if (p.downCount === 1) {
        p.downCount   = 2;
        p.downBleedMs = 0;
        p.healPct     = 0;
        if (p.beingHealed) {
          p.beingHealed = false;
          io.to(roomName).emit('setBeingHealed', { targetId: id, isBeingHealed: false });
        }
        io.to(roomName).emit('downCountUpdated', { id, downCount: 2 });
      } else if (p.downCount >= 2) {
        p.expelled    = true;
        p.downed      = false;
        if (p.beingHealed) {
          p.beingHealed = false;
          io.to(roomName).emit('setBeingHealed', { targetId: id, isBeingHealed: false });
        }
        io.to(roomName).emit('playerExpelled', id);
        checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
      }
    });
```

- [ ] **Step 2: Commit**

```bash
git add server/index.ts
git commit -m "feat: server bleed-out tick increments downCount after 70s"
```

---

## Task 4: Server — Heal Handlers + Remove Detention

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add `roomHealingMap` declaration near `roomHackingMap`**

After the line `const roomHackingMap = new Map<string, Map<string, Set<string>>>();`, add:

```ts
// room → healerId → targetId
const roomHealingMap = new Map<string, Map<string, string>>();
```

- [ ] **Step 2: Update `clearRoomMeta` to also clear the healing map**

Find:
```ts
function clearRoomMeta(roomName: string) {
  roomTerminalMeta.delete(roomName);
  roomHackingMap.delete(roomName);
}
```

Replace with:
```ts
function clearRoomMeta(roomName: string) {
  roomTerminalMeta.delete(roomName);
  roomHackingMap.delete(roomName);
  roomHealingMap.delete(roomName);
}
```

- [ ] **Step 3: Remove the `detentionAnswer` socket handler entirely**

Delete the entire block:
```ts
  socket.on('detentionAnswer', ({ correct, isGreat }: { correct: boolean; isGreat: boolean }) => {
    ...
  });
```

- [ ] **Step 4: Add the `setHealing` handler**

Add after the `setHacking` handler:

```ts
  socket.on('setHealing', ({ targetId }: { targetId: string | null }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const healer = state.players[socket.id];
    if (!healer || healer.role !== 'survivor' || healer.expelled || healer.escaped) return;

    const roomHealMap = roomHealingMap.get(roomName) ?? new Map<string, string>();
    if (!roomHealingMap.has(roomName)) roomHealingMap.set(roomName, roomHealMap);

    const prevTarget = roomHealMap.get(socket.id);
    if (prevTarget && prevTarget !== targetId) {
      const prev = state.players[prevTarget];
      if (prev && prev.beingHealed) {
        prev.beingHealed = false;
        io.to(roomName).emit('setBeingHealed', { targetId: prevTarget, isBeingHealed: false });
      }
    }

    if (!targetId) {
      roomHealMap.delete(socket.id);
      return;
    }

    const target = state.players[targetId];
    if (!target || target.role !== 'survivor' || target.expelled || target.escaped) return;
    if (target.hp >= 2) return;

    roomHealMap.set(socket.id, targetId);
    if (!target.beingHealed) {
      target.beingHealed = true;
      io.to(roomName).emit('setBeingHealed', { targetId, isBeingHealed: true });
    }
  });
```

- [ ] **Step 5: Add the `healProgress` handler**

Add after `setHealing`:

```ts
  socket.on('healProgress', ({ targetId, amount }: { targetId: string; amount: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const healer = state.players[socket.id];
    if (!healer || healer.role !== 'survivor' || healer.expelled || healer.escaped) return;

    const target = state.players[targetId];
    if (!target || target.role !== 'survivor' || target.expelled || target.escaped) return;
    if (target.hp >= 2) return;
    if (typeof amount !== 'number' || amount < 0 || amount > HEAL_AMOUNT_MAX) return;
    if (Date.now() < target.healFailLockUntil) return;

    const isSelf = targetId === socket.id;
    if (isSelf && !target.downed) return;
    if (isSelf && target.healPct >= HEAL_SELF_CAP) return;
    if (isSelf && target.beingHealed) return;
    if (!isSelf && target.hp >= 2) return;

    const cap = isSelf ? HEAL_SELF_CAP : 100;
    target.healPct = Math.min(cap, target.healPct + amount);
    io.to(roomName).emit('healUpdate', { targetId, healPct: target.healPct });

    if (target.healPct >= 100) {
      target.healPct     = 0;
      target.beingHealed = false;
      io.to(roomName).emit('setBeingHealed', { targetId, isBeingHealed: false });
      if (target.hp === 0) {
        target.hp     = 1;
        target.downed = false;
        io.to(roomName).emit('playerRevived', { id: targetId, hp: 1 });
      } else {
        target.hp = 2;
        io.to(roomName).emit('playerHealed', { id: targetId, hp: 2 });
      }
    }
  });
```

- [ ] **Step 6: Add the `healSkillCheckFailed` handler**

Add after `healProgress`:

```ts
  socket.on('healSkillCheckFailed', ({ targetId }: { targetId: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor') return;

    const target = state.players[targetId];
    if (!target || target.role !== 'survivor') return;

    target.healFailLockUntil = Date.now() + HEAL_FAIL_LOCK_MS;
    target.healPct = Math.max(0, target.healPct - HEAL_FAIL_REGRESSION);
    io.to(roomName).emit('healUpdate', { targetId, healPct: target.healPct });
    io.to(roomName).emit('healAlert', { targetId, healerId: socket.id });
  });
```

- [ ] **Step 7: Also block `hackProgress` for `beingHealed` survivors**

In the `hackProgress` handler, after the guard `if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;`, add:

```ts
    if (p.beingHealed) return;
```

- [ ] **Step 8: Clear healing on disconnect**

In the `disconnect` handler, after `roomHackingMap.get(roomName)?.forEach((set) => set.delete(socket.id));`, add:

```ts
      const healMap = roomHealingMap.get(roomName);
      if (healMap) {
        const healTarget = healMap.get(socket.id);
        if (healTarget) {
          const t = state.players[healTarget];
          if (t && t.beingHealed) {
            t.beingHealed = false;
            io.to(roomName).emit('setBeingHealed', { targetId: healTarget, isBeingHealed: false });
          }
        }
        healMap.delete(socket.id);
      }
```

- [ ] **Step 9: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add server/index.ts
git commit -m "feat: add heal socket handlers, remove detention handler"
```

---

## Task 5: GameScene — Remove Detention, Add Heal State Fields

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add new private state fields**

After `private hackHoldTimer = 0;` in the class body, add:

```ts
  private healingTarget:        string | null = null;
  private prevHealingEmitted:   string | null = null;
  private healPassiveTimer      = 0;
  private healHoldTimer         = 0;
  private healNextThreshold     = 0;
  private healLockUntil         = 0;
  private beingHealed           = false;
  private myDownCount:          0 | 1 | 2 = 0;
  private myHealPct             = 0;
  private myDownBleedMs         = 0;
```

- [ ] **Step 2: Update `resetLocalState()` to clear new fields**

After `this.hackingTerminal = null;` add:

```ts
    this.healingTarget       = null;
    this.prevHealingEmitted  = null;
    this.healPassiveTimer    = 0;
    this.healHoldTimer       = 0;
    this.healNextThreshold   = 0;
    this.healLockUntil       = 0;
    this.beingHealed         = false;
    this.myDownCount         = 0;
    this.myHealPct           = 0;
    this.myDownBleedMs       = 0;
```

- [ ] **Step 3: Remove `startDetention()` method entirely**

Delete the entire method:
```ts
  private startDetention() {
    this.inputFrozen = true;
    this.skillCheck.show(
      (isGreat) => { ... },
      () => { ... },
    );
  }
```

- [ ] **Step 4: Update `create()` — initialize `healNextThreshold`**

After `this.hackNextThreshold = Phaser.Math.Between(2500, 5000);`, add:

```ts
    this.healNextThreshold = Phaser.Math.Between(2500, 5000);
```

- [ ] **Step 5: Update imports in `GameScene.ts`**

Add to the import from `'../constants'`:
```ts
  HEAL_PASSIVE_TICK, HEAL_PASSIVE_RATE_MS, HEAL_GREAT_BONUS,
  HEAL_SELF_RATE_FACTOR, CRAWL_SPEED_FACTOR,
  HEAL_FAIL_LOCK_MS, HEAL_SELF_CAP,
```

Remove `DETENTION_SKILL_CHECKS_REQUIRED` from the import if it appears there (it's re-exported via constants).

Also remove `HACK_FAIL_LOCK_MS` from the import if it is already imported — it stays since it's still used.

- [ ] **Step 6: Update `survivorInfo` map type and `trackSurvivor`**

Change the `survivorInfo` declaration from:
```ts
  private survivorInfo  = new Map<string, { hp: number; downed: boolean; expelled: boolean; escaped: boolean; hacking: boolean }>();
```
to:
```ts
  private survivorInfo  = new Map<string, { hp: number; downed: boolean; expelled: boolean; escaped: boolean; hacking: boolean; downCount: 0|1|2; healPct: number; beingHealed: boolean }>();
```

Update `trackSurvivor` to accept and store the new fields:
```ts
  private trackSurvivor(id: string, info: { hp: number; downed: boolean; expelled: boolean; escaped: boolean; downCount?: 0|1|2; healPct?: number; beingHealed?: boolean }) {
    if (!this.survivorOrder.includes(id)) this.survivorOrder.push(id);
    const existing = this.survivorInfo.get(id);
    this.survivorInfo.set(id, {
      hacking:     existing?.hacking ?? false,
      downCount:   existing?.downCount ?? 0,
      healPct:     existing?.healPct ?? 0,
      beingHealed: existing?.beingHealed ?? false,
      ...info,
    });
  }
```

Update `refreshSurvivorHUD`:
```ts
  private refreshSurvivorHUD() {
    const statuses = this.survivorOrder.map((id, i) => {
      const info = this.survivorInfo.get(id) ?? {
        hp: 2, downed: false, expelled: false, escaped: false,
        hacking: false, downCount: 0 as const, healPct: 0, beingHealed: false,
      };
      return { label: `A${i + 1}`, skinId: GameScene.SURVIVOR_SKIN_SLOTS[i] ?? 'arthur', ...info };
    });
    this.hud.setSurvivorStatuses(statuses, this.myRole === 'survivor');
  }
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: remove detention, add heal state fields to GameScene"
```

---

## Task 6: GameScene — Socket Handlers (Downed, Revived, Expelled, New Events)

**Files:**
- Modify: `src/scenes/GameScene.ts` (`setupSocketEvents`)

- [ ] **Step 1: Update `playerDowned` handler**

Replace:
```ts
    s.on('playerDowned', (targetId: string) => {
      if (targetId === s.id) {
        this.downed = true;
        this.myHp   = 0;
        this.hud.update(this.myRole, this.myHp, true);
        this.hud.flash('Em DETENÇÃO! Passe no exame!', 0xff4444);
        this.startDetention();
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno detido!', 0xffcc00);
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, hp: 0, downed: true }); this.refreshSurvivorHUD(); }
      if (targetId !== s.id) this.players.setDowned(targetId, true);
    });
```

With:
```ts
    s.on('playerDowned', ({ id, downCount }: { id: string; downCount: 0|1|2 }) => {
      if (id === s.id) {
        this.downed       = true;
        this.myHp         = 0;
        this.myDownCount  = downCount;
        this.myHealPct    = 0;
        this.myDownBleedMs = 0;
        this.beingHealed  = false;
        this.healingTarget = null;
        this.prevHealingEmitted = null;
        this.socket.emit('setHealing', { targetId: null });
        this.hud.update(this.myRole, this.myHp, true, this.myDownCount);
        this.hud.flash('Você foi derrubado!', 0xff4444);
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno derrubado!', 0xffcc00);
      }
      this.trackSurvivor(id, {
        hp: 0, downed: true, expelled: false, escaped: false,
        downCount, healPct: 0,
      });
      this.refreshSurvivorHUD();
      if (id !== s.id) this.players.setDowned(id, true);
    });
```

- [ ] **Step 2: Remove `detentionEscaped` and `detentionProgress` handlers**

Delete both blocks:
```ts
    s.on('detentionEscaped', () => { ... });
    s.on('detentionProgress', (...) => { ... });
```

- [ ] **Step 3: Update `playerRevived` handler**

Replace:
```ts
    s.on('playerRevived', (id: string) => {
      if (this.myRole === 'professor' && id !== s.id)
        this.hud.flash('Aluno escapou da detenção!', 0x4fc3f7);
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, hp: 1, downed: false }); this.refreshSurvivorHUD(); }
      this.players.setDowned(id, false);
    });
```

With:
```ts
    s.on('playerRevived', ({ id, hp }: { id: string; hp: number }) => {
      if (id === s.id) {
        this.downed      = false;
        this.myHp        = hp;
        this.myHealPct   = 0;
        this.beingHealed = false;
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.flash('Revivido! Cuide-se.', 0x4fc3f7);
      } else if (this.myRole === 'professor') {
        this.hud.flash('Aluno se levantou!', 0x4fc3f7);
      }
      this.trackSurvivor(id, {
        hp, downed: false, expelled: false, escaped: false, healPct: 0,
      });
      this.refreshSurvivorHUD();
      this.players.setDowned(id, false);
    });
```

- [ ] **Step 4: Add `playerHealed` handler** (after `playerRevived`)

```ts
    s.on('playerHealed', ({ id, hp }: { id: string; hp: number }) => {
      if (id === s.id) {
        this.myHp      = hp;
        this.myHealPct = 0;
        this.beingHealed = false;
        this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
        this.hud.flash('Totalmente curado!', 0x4caf50);
      }
      this.trackSurvivor(id, {
        hp, downed: false, expelled: false, escaped: false, healPct: 0,
      });
      this.refreshSurvivorHUD();
    });
```

- [ ] **Step 5: Add `healUpdate` handler**

```ts
    s.on('healUpdate', ({ targetId, healPct }: { targetId: string; healPct: number }) => {
      if (targetId === s.id) {
        this.myHealPct = healPct;
        this.hud.setRecoveryProgress(healPct);
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, healPct }); this.refreshSurvivorHUD(); }
    });
```

- [ ] **Step 6: Add `setBeingHealed` handler**

```ts
    s.on('setBeingHealed', ({ targetId, isBeingHealed }: { targetId: string; isBeingHealed: boolean }) => {
      if (targetId === s.id) {
        this.beingHealed = isBeingHealed;
        if (isBeingHealed) {
          this.healPassiveTimer = 0;
          this.healHoldTimer    = 0;
        }
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, beingHealed: isBeingHealed }); this.refreshSurvivorHUD(); }
    });
```

- [ ] **Step 7: Add `downCountUpdated` handler**

```ts
    s.on('downCountUpdated', ({ id, downCount }: { id: string; downCount: 0|1|2 }) => {
      if (id === s.id) {
        this.myDownCount   = downCount;
        this.myDownBleedMs = 0;
        this.myHealPct     = 0;
        this.hud.setDownCount(downCount);
        this.hud.flash('Situação piorou!', 0xff8800, 2000);
      }
      const info = this.survivorInfo.get(id);
      if (info) { this.survivorInfo.set(id, { ...info, downCount }); this.refreshSurvivorHUD(); }
    });
```

- [ ] **Step 8: Add `healAlert` handler** (professor-side large arrow)

```ts
    s.on('healAlert', ({ targetId }: { targetId: string; healerId: string }) => {
      if (this.myRole !== 'professor') return;
      const pos = this.players.getPosition(targetId);
      if (!pos) return;
      const cam = this.cameras.main;
      this.hud.showHealAlert(targetId, pos.x, pos.y, cam.scrollX, cam.scrollY, cam.width, cam.height);
    });
```

- [ ] **Step 9: Update `gameState` handler to pass new fields to `trackSurvivor`**

In the `gameState` socket handler, update the `trackSurvivor` call:
```ts
        if (p.role === 'survivor') this.trackSurvivor(id, {
          hp: p.hp, downed: p.downed, expelled: p.expelled, escaped: p.escaped,
          downCount: p.downCount ?? 0,
          healPct:   p.healPct ?? 0,
          beingHealed: p.beingHealed ?? false,
        });
```

Also sync own state if this is the local player:
```ts
      const myState = s.id ? state.players[s.id] : null;
      if (myState && myState.role === 'survivor') {
        this.myHp          = myState.hp;
        this.downed        = myState.downed;
        this.myDownCount   = myState.downCount ?? 0;
        this.myHealPct     = myState.healPct ?? 0;
        this.beingHealed   = myState.beingHealed ?? false;
      }
```

- [ ] **Step 10: Update `playerHit` handler to also update downCount**

In the `playerHit` handler, change:
```ts
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, hp }); this.refreshSurvivorHUD(); }
```
to:
```ts
      if (targetId === s.id) {
        this.myHp = hp;
        this.hud.update(this.myRole, hp, false, this.myDownCount);
        if (!this.downed) this.onHitSprintTimer = ON_HIT_SPRINT_MS;
      }
      const info = this.survivorInfo.get(targetId);
      if (info) { this.survivorInfo.set(targetId, { ...info, hp }); this.refreshSurvivorHUD(); }
```

(Remove the duplicate `this.myHp = hp` / `this.hud.update` / `this.onHitSprintTimer` lines that were already in the handler above this block — consolidate into the single block shown.)

- [ ] **Step 11: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 12: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: update GameScene socket handlers for new health system"
```

---

## Task 7: GameScene — Crawl Speed + Interaction Priority

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Update speed calculation to support crawl when downed**

Find the speed block in `update()`:
```ts
    } else {
      if (this.onHitSprintTimer > 0) speed = ON_HIT_SPRINT_SPEED;
      else speed = this.sprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
    }
```

Replace with:
```ts
    } else {
      if (this.downed) {
        speed = PLAYER_SPEED * CRAWL_SPEED_FACTOR;
      } else if (this.onHitSprintTimer > 0) {
        speed = ON_HIT_SPRINT_SPEED;
      } else {
        speed = this.sprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
      }
    }
```

- [ ] **Step 2: Add `runHealSkillCheck` method**

Add after `runHackSkillCheck`:

```ts
  private runHealSkillCheck(targetId: string, isSelf: boolean) {
    this.inputFrozen = true;
    this.skillCheck.show(
      (isGreat) => {
        this.inputFrozen = false;
        if (isGreat) {
          const bonus = isSelf
            ? HEAL_GREAT_BONUS * HEAL_SELF_RATE_FACTOR
            : HEAL_GREAT_BONUS;
          this.socket.emit('healProgress', { targetId, amount: bonus });
        }
      },
      () => {
        this.inputFrozen = false;
        this.socket.emit('healSkillCheckFailed', { targetId });
        this.healLockUntil = this.time.now + HEAL_FAIL_LOCK_MS;
      },
    );
  }
```

- [ ] **Step 3: Add `nearestHealablePlayer` method**

Add after `isNearGate`:

```ts
  private nearestHealablePlayer(): string | null {
    let bestId:   string | null = null;
    let bestDist  = INTERACT_RADIUS + 1;
    let bestPriority = 999;

    for (const [id, info] of this.survivorInfo) {
      if (id === this.socket.id) continue;
      if (info.expelled || info.escaped) continue;
      if (info.hp >= 2) continue;

      const pos = this.players.getPosition(id);
      if (!pos) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pos.x, pos.y);
      if (dist > INTERACT_RADIUS) continue;

      // downed & not already being healed by someone else = priority 1
      // injured = priority 2
      const priority = (info.downed && !info.beingHealed) ? 1 : info.downed ? 1 : 2;
      if (priority < bestPriority || (priority === bestPriority && dist < bestDist)) {
        bestId       = id;
        bestDist     = dist;
        bestPriority = priority;
      }
    }
    return bestId;
  }
```

- [ ] **Step 4: Rewrite `_updateSurvivorInteractions` to handle heal priority**

Replace the entire method with:

```ts
  private _updateSurvivorInteractions(delta: number) {
    const eHeld    = this.eKey.isDown || this.padActionHeld;
    const eJustDown = Phaser.Input.Keyboard.JustDown(this.eKey) || this.padActionJust;

    // ── Healing path ──────────────────────────────────────────────────────
    const healTarget = eHeld && !this.downed ? this.nearestHealablePlayer() : null;

    if (healTarget) {
      if (healTarget !== this.healingTarget) {
        if (this.prevHealingEmitted !== null) {
          this.socket.emit('setHealing', { targetId: null });
        }
        this.healingTarget      = healTarget;
        this.prevHealingEmitted = healTarget;
        this.healPassiveTimer   = 0;
        this.healHoldTimer      = 0;
        this.socket.emit('setHealing', { targetId: healTarget });

        if (this.hackingTerminal !== null) {
          this.hackingTerminal       = null;
          this.prevHackingEmitted    = null;
          this.hackPassiveTimer      = 0;
          this.terminals.setWorking(null);
          this.hud.setHackProgress(null);
          this.socket.emit('setHacking', { terminalId: null });
        }
      }

      if (this.time.now >= this.healLockUntil) {
        this.healPassiveTimer += delta;
        if (this.healPassiveTimer >= HEAL_PASSIVE_RATE_MS) {
          this.healPassiveTimer = 0;
          this.socket.emit('healProgress', { targetId: healTarget, amount: HEAL_PASSIVE_TICK });
        }

        this.healHoldTimer += delta;
        if (this.healHoldTimer >= this.healNextThreshold) {
          this.healHoldTimer     = 0;
          this.healNextThreshold = Phaser.Math.Between(2500, 5000);
          this.runHealSkillCheck(healTarget, false);
        }
      }

      this.hud.setHealProgress(this.survivorInfo.get(healTarget)?.healPct ?? 0);
      return;
    }

    if (this.prevHealingEmitted !== null) {
      this.prevHealingEmitted = null;
      this.healingTarget      = null;
      this.healPassiveTimer   = 0;
      this.healHoldTimer      = 0;
      this.socket.emit('setHealing', { targetId: null });
      this.hud.setHealProgress(null);
    }

    // ── Hack path ─────────────────────────────────────────────────────────
    const nearTerminal = this.terminals.nearest(this.player.x, this.player.y);

    if (nearTerminal !== this.hackTimerTerminal) {
      this.hackTimerTerminal = nearTerminal;
      this.hackHoldTimer     = 0;
    }

    if (eHeld && nearTerminal && !this.downed && !this.beingHealed) {
      this.hackingTerminal = nearTerminal;
      if (this.prevHackingEmitted !== nearTerminal) {
        this.prevHackingEmitted = nearTerminal;
        this.socket.emit('setHacking', { terminalId: nearTerminal });
      }
      this.terminals.setWorking(nearTerminal);
      this.hud.setHackProgress(this.terminals.getProgress(nearTerminal));

      this.hackPassiveTimer += delta;
      if (this.hackPassiveTimer >= HACK_PASSIVE_RATE_MS) {
        this.hackPassiveTimer = 0;
        this.socket.emit('hackProgress', { terminalId: nearTerminal, amount: HACK_PASSIVE_TICK });
      }

      this.hackHoldTimer += delta;
      if (this.hackHoldTimer >= this.hackNextThreshold) {
        this.hackHoldTimer     = 0;
        this.hackNextThreshold = Phaser.Math.Between(2500, 5000);
        this.runHackSkillCheck(nearTerminal);
      }
      return;
    }

    if (this.prevHackingEmitted !== null) {
      this.prevHackingEmitted = null;
      this.socket.emit('setHacking', { terminalId: null });
    }
    this.hackingTerminal  = null;
    this.hackPassiveTimer = 0;
    this.terminals.setWorking(null);
    this.hud.setHackProgress(null);

    // ── Gate ─────────────────────────────────────────────────────────────
    if ((eJustDown) && this.gateOpen && this.isNearGate() && !this.downed) {
      this.socket.emit('escape');
    }
  }
```

- [ ] **Step 5: Add self-heal logic in the downed path inside `update()`**

Find the block that handles `this.downed` inside `update()`. Currently when downed, `inputFrozen = true` was set (by detention). Now downed survivors are NOT frozen. Add self-heal logic just before the `_updateSurvivorInteractions` call. Find where `_updateSurvivorInteractions(delta)` is called and add before it:

```ts
    // self-heal when downed and still
    if (this.myRole === 'survivor' && this.downed && !this.beingHealed) {
      const moving = vx !== 0 || vy !== 0;
      if (moving) {
        this.healPassiveTimer = 0;
        this.healHoldTimer    = 0;
      } else if (this.myHealPct < HEAL_SELF_CAP && this.time.now >= this.healLockUntil) {
        this.healPassiveTimer += delta;
        if (this.healPassiveTimer >= HEAL_PASSIVE_RATE_MS) {
          this.healPassiveTimer = 0;
          this.socket.emit('healProgress', {
            targetId: this.socket.id,
            amount:   HEAL_PASSIVE_TICK * HEAL_SELF_RATE_FACTOR,
          });
        }
        this.healHoldTimer += delta;
        if (this.healHoldTimer >= this.healNextThreshold) {
          this.healHoldTimer     = 0;
          this.healNextThreshold = Phaser.Math.Between(2500, 5000);
          this.runHealSkillCheck(this.socket.id!, true);
        }
      }
    }
```

Also update the bleed-out display each frame when downed. After the self-heal block above:
```ts
    if (this.myRole === 'survivor' && this.downed) {
      this.myDownBleedMs = Math.min(this.myDownBleedMs + delta, BLEED_OUT_MS);
      this.hud.setBleedOutProgress((this.myDownBleedMs / BLEED_OUT_MS) * 100);
    }
```

- [ ] **Step 6: Fix `inputFrozen` frozen block — allow downed survivors to pass skill checks**

The existing `inputFrozen` block (line ~1024) has:
```ts
      if (this.skillCheck.active && this.hackingTerminal !== null && !this.eKey.isDown && !this.padActionHeld) {
        this.skillCheck.cancel();
      }
```

Update this to also cancel if healing and E released:
```ts
      const activeInteraction = this.hackingTerminal !== null || this.healingTarget !== null || this.downed;
      if (this.skillCheck.active && !activeInteraction) {
        this.skillCheck.cancel();
      }
      if (this.skillCheck.active && this.hackingTerminal !== null && !this.eKey.isDown && !this.padActionHeld) {
        this.skillCheck.cancel();
      }
      if (this.skillCheck.active && this.healingTarget !== null && !this.eKey.isDown && !this.padActionHeld) {
        this.skillCheck.cancel();
      }
```

- [ ] **Step 7: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: crawl speed, heal interaction priority, self-heal in update loop"
```

---

## Task 8: PlayerManager — `getPosition`

**Files:**
- Modify: `src/game/PlayerManager.ts`

- [ ] **Step 1: Add `getPosition` method**

After the `move` method, add:

```ts
  getPosition(id: string): { x: number; y: number } | null {
    const tracked = this.others[id];
    if (!tracked) return null;
    return { x: tracked.sprite.x, y: tracked.sprite.y };
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/game/PlayerManager.ts
git commit -m "feat: PlayerManager.getPosition for heal target lookup"
```

---

## Task 9: HUD — SurvivorStatus + Self-HUD Overhaul

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Update `SurvivorStatus` interface**

Replace:
```ts
export interface SurvivorStatus {
  label:    string;
  skinId:   string;
  hp:       number;
  downed:   boolean;
  expelled: boolean;
  escaped:  boolean;
  hacking:  boolean;
}
```

With:
```ts
export interface SurvivorStatus {
  label:     string;
  skinId:    string;
  hp:        number;
  downed:    boolean;
  expelled:  boolean;
  escaped:   boolean;
  hacking:   boolean;
  downCount: 0 | 1 | 2;
  healPct:   number;
}
```

- [ ] **Step 2: Replace `selfHpBar` with down-count dots + downed bars**

In the class body, replace `private selfHpBar!: Phaser.GameObjects.Graphics;` with:

```ts
  private downCountDots!:  Phaser.GameObjects.Graphics;
  private bleedOutBar!:    Phaser.GameObjects.Graphics;
  private recoveryBar!:    Phaser.GameObjects.Graphics;
  private bleedOutBg!:     Phaser.GameObjects.Graphics;
  private recoveryBg!:     Phaser.GameObjects.Graphics;
```

- [ ] **Step 3: Add heal progress bar fields alongside hack bar fields**

After `private lastHackProg: number | null = null;` add:
```ts
  private healBarGraphic!: Phaser.GameObjects.Graphics;
  private healBarLabel!:   Phaser.GameObjects.Text;
  private healBarPct!:     Phaser.GameObjects.Text;
  private lastHealProg:    number | null = null;
```

Also add after `private currentDowned = false;`:
```ts
  private currentDownCount: 0 | 1 | 2 = 0;
```

- [ ] **Step 4: Update `build()` to create new HUD elements**

In `build()`, remove:
```ts
    this.selfHpBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30);
```

Add in its place:
```ts
    this.downCountDots = this.scene.add.graphics().setScrollFactor(0).setDepth(30);

    this.bleedOutBg  = this.scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.bleedOutBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.recoveryBg  = this.scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.recoveryBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
```

After the hackBar block in `build()`, add:
```ts
    this.healBarGraphic = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.healBarLabel   = this.scene.add
      .text(400, 465, 'CURANDO', {
        fontSize: '11px', color: '#81c995', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    this.healBarPct = this.scene.add
      .text(400, 480, '', { fontSize: '10px', color: '#b9f6ca' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(32).setAlpha(0);
```

- [ ] **Step 5: Update `update()` signature and implementation**

Replace:
```ts
  update(role: Role | null, hp: number, downed: boolean) {
    this.currentRole   = role;
    this.currentDowned = downed;

    this._drawRoleBadge(role);
    this._drawSelfHp(role, hp, downed);

    this.hudAttack.setVisible(role === 'professor');
    this.refreshHint();
  }
```

With:
```ts
  update(role: Role | null, hp: number, downed: boolean, downCount: 0|1|2 = 0) {
    this.currentRole      = role;
    this.currentDowned    = downed;
    this.currentDownCount = downCount;

    this._drawRoleBadge(role);
    this._drawDownCountDots(role, downCount);

    this.hudAttack.setVisible(role === 'professor');
    this.refreshHint();
  }
```

- [ ] **Step 6: Remove `_drawSelfHp` and add `_drawDownCountDots`**

Delete the `_drawSelfHp` method entirely.

Add a new method:
```ts
  private _drawDownCountDots(role: Role | null, downCount: 0|1|2) {
    this.downCountDots.clear();
    if (role !== 'survivor') return;

    const x   = 8;
    const y   = 32;
    const r   = 5;
    const gap = 4;

    for (let i = 0; i < 2; i++) {
      const used  = i < downCount;
      const color = used ? 0xe53935 : 0x2a2a2a;
      const edge  = used ? 0xff6659 : 0x444444;
      this.downCountDots.fillStyle(color, 0.95);
      this.downCountDots.fillCircle(x + i * (r * 2 + gap) + r, y + r, r);
      this.downCountDots.lineStyle(1, edge, 0.9);
      this.downCountDots.strokeCircle(x + i * (r * 2 + gap) + r, y + r, r);
    }
  }
```

- [ ] **Step 7: Add `setDownCount`, `setBleedOutProgress`, `setRecoveryProgress` methods**

```ts
  setDownCount(downCount: 0|1|2) {
    this.currentDownCount = downCount;
    this._drawDownCountDots(this.currentRole, downCount);
  }

  setBleedOutProgress(pct: number | null) {
    const BAR_X = 8;
    const BAR_Y = 48;
    const BAR_W = 100;
    const BAR_H = 6;

    if (pct === null) {
      this.bleedOutBg.setAlpha(0);
      this.bleedOutBar.setAlpha(0);
      return;
    }
    this.bleedOutBg.setAlpha(1);
    this.bleedOutBar.setAlpha(1);

    this.bleedOutBg.clear();
    this.bleedOutBg.fillStyle(0x222222, 0.85);
    this.bleedOutBg.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 3);

    this.bleedOutBar.clear();
    const fill = Math.min(1, pct / 100) * BAR_W;
    if (fill > 0) {
      this.bleedOutBar.fillStyle(0xff6600, 0.95);
      this.bleedOutBar.fillRoundedRect(BAR_X, BAR_Y, fill, BAR_H, 3);
    }
  }

  setRecoveryProgress(pct: number | null) {
    const BAR_X = 8;
    const BAR_Y = 58;
    const BAR_W = 100;
    const BAR_H = 6;

    if (pct === null) {
      this.recoveryBg.setAlpha(0);
      this.recoveryBar.setAlpha(0);
      return;
    }
    this.recoveryBg.setAlpha(1);
    this.recoveryBar.setAlpha(1);

    this.recoveryBg.clear();
    this.recoveryBg.fillStyle(0x222222, 0.85);
    this.recoveryBg.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 3);

    this.recoveryBar.clear();
    const fill = Math.min(1, pct / 95) * BAR_W;
    if (fill > 0) {
      this.recoveryBar.fillStyle(0x4caf50, 0.95);
      this.recoveryBar.fillRoundedRect(BAR_X, BAR_Y, fill, BAR_H, 3);
    }
  }
```

- [ ] **Step 8: Add `setHealProgress` method (mirrors `setHackProgress`)**

```ts
  setHealProgress(progress: number | null) {
    if (progress === this.lastHealProg) return;
    this.lastHealProg = progress;

    if (progress === null) {
      this.healBarGraphic.setAlpha(0);
      this.healBarLabel.setAlpha(0);
      this.healBarPct.setAlpha(0);
      return;
    }

    this.healBarGraphic.setAlpha(1);
    this.healBarLabel.setAlpha(1);
    this.healBarPct.setAlpha(1);

    const BAR_X = 270;
    const BAR_Y = 500;
    const BAR_W = 260;
    const BAR_H = 14;
    const R     = BAR_H / 2;
    const fill  = Math.min(1, progress / 100) * BAR_W;

    this.healBarGraphic.clear();
    this.healBarGraphic.fillStyle(0x071c0f, 0.90);
    this.healBarGraphic.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, R);
    this.healBarGraphic.lineStyle(1, 0x2a6e3a, 0.85);
    this.healBarGraphic.strokeRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, R);

    if (fill > 0) {
      this.healBarGraphic.fillStyle(0x81c995, 0.95);
      this.healBarGraphic.fillRoundedRect(BAR_X, BAR_Y, Math.max(fill, R * 2), BAR_H, R);
      this.healBarGraphic.fillStyle(0xffffff, 0.18);
      this.healBarGraphic.fillRoundedRect(BAR_X + 2, BAR_Y + 2, Math.max(fill - 4, 0), Math.floor(BAR_H / 2) - 2, R - 1);
    }

    this.healBarPct.setText(`${Math.round(progress)}%`);
  }
```

- [ ] **Step 9: Update `setSurvivorStatuses` to draw down-count dots and bleed-out on cards**

In `setSurvivorStatuses`, after the `_drawHpDots` call, add:
```ts
      this._drawCardDownCount(card, s.downCount);
      this._drawCardBleedOut(card, s.downed, s.healPct);
```

Add the two new private methods:
```ts
  private _drawCardDownCount(card: SurvivorCard, downCount: 0|1|2) {
    const r   = 4;
    const gap = 3;
    const x   = CARD_X + CARD_W - 8 - (2 * r * 2 + gap);
    const y   = card.cardY + PORT_H + 22;

    card.hpDots.lineStyle(1, 0x555555, 0.9);
    for (let i = 0; i < 2; i++) {
      const used  = i < downCount;
      card.hpDots.fillStyle(used ? 0xe53935 : 0x2a2a2a, 0.95);
      card.hpDots.fillCircle(x + i * (r * 2 + gap) + r, y, r);
      card.hpDots.strokeCircle(x + i * (r * 2 + gap) + r, y, r);
    }
  }

  private _drawCardBleedOut(card: SurvivorCard, downed: boolean, healPct: number) {
    if (!downed) return;
    const x = CARD_X + 4;
    const y = card.cardY + CARD_H - 7;
    const w = CARD_W - 8;
    const h = 4;

    card.hpDots.fillStyle(0x222222, 0.9);
    card.hpDots.fillRoundedRect(x, y, w, h, 2);
    const fill = Math.min(1, healPct / 95) * w;
    if (fill > 0) {
      card.hpDots.fillStyle(0x4caf50, 0.95);
      card.hpDots.fillRoundedRect(x, y, fill, h, 2);
    }
  }
```

- [ ] **Step 10: Update `refreshHint` — add healing hint**

In `refreshHint()`, add to the survivor hints:
```ts
    } else if (this.currentRole === 'survivor') {
      this.hudHint.setText(gp
        ? 'A (segurar) = hackear/curar  |  A na saida = fugir'
        : 'E (segurar) = hackear/curar  |  E na saida = fugir');
```

- [ ] **Step 11: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 12: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: HUD overhaul — down-count dots, bleed-out bar, heal progress bar"
```

---

## Task 10: HUD — Professor Heal Alert Arrows

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Add `healAlertArrows` field to class**

After `private loudNoiseArrows: Map<string, number> = new Map();`, add:
```ts
  private healAlertArrows: Map<string, { x: number; y: number; expiresAt: number }> = new Map();
```

- [ ] **Step 2: Add `showHealAlert` method**

```ts
  showHealAlert(
    targetId: string,
    worldX: number,
    worldY: number,
    camX: number,
    camY: number,
    screenW: number,
    screenH: number,
  ) {
    this.healAlertArrows.set(targetId, { x: worldX, y: worldY, expiresAt: Date.now() + 3_000 });
  }
```

- [ ] **Step 3: Draw heal alert arrows in `updateTerminalArrows`**

Add at the end of `updateTerminalArrows`, before the method closes:

```ts
    const nowMs = Date.now();
    this.healAlertArrows.forEach((entry, id) => {
      if (entry.expiresAt <= nowMs) { this.healAlertArrows.delete(id); return; }

      const sx    = entry.x - camX;
      const sy    = entry.y - camY;
      const dx    = sx - cx;
      const dy    = sy - cy;
      if (dx === 0 && dy === 0) return;
      const angle = Math.atan2(dy, dx);
      const maxX  = screenW - margin;
      const maxY  = screenH - margin;
      const tX    = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
      const tY    = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
      const t     = Math.min(Math.abs(tX), Math.abs(tY));
      const ex    = cx + dx * t;
      const ey    = cy + dy * t;

      const flash = Math.floor(nowMs / 200) % 2 === 0;
      this._drawHealAlertArrow(ex, ey, angle, flash ? 1.0 : 0.3);
    });
```

- [ ] **Step 4: Add `_drawHealAlertArrow` method**

```ts
  private _drawHealAlertArrow(x: number, y: number, angle: number, alpha: number) {
    const size = 18; // 1.5× normal arrow size
    const cos  = Math.cos(angle);
    const sin  = Math.sin(angle);

    const tipX = x + cos * size;
    const tipY = y + sin * size;
    const lX   = x + cos * -size * 0.5 - sin * size * 0.6;
    const lY   = y + sin * -size * 0.5 + cos * size * 0.6;
    const rX   = x + cos * -size * 0.5 + sin * size * 0.6;
    const rY   = y + sin * -size * 0.5 - cos * size * 0.6;

    this.arrowGraphics.fillStyle(0xff2222, alpha);
    this.arrowGraphics.fillTriangle(tipX, tipY, lX, lY, rX, rY);
    this.arrowGraphics.lineStyle(2, 0xffffff, alpha * 0.6);
    this.arrowGraphics.strokeTriangle(tipX, tipY, lX, lY, rX, rY);
  }
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: professor heal alert arrows on survivor skill check fail"
```

---

## Task 11: Integration Verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: both server (tsx) and client (Vite) start without errors. Browser at `http://localhost:5173`.

- [ ] **Step 2: Verify healthy → injured → downed flow**

Open two browser tabs. Tab 1 = professor, Tab 2 = survivor.

- Professor hits survivor twice → survivor enters Dying state (slow crawl, not frozen)
- Bleed-out bar appears in survivor HUD, recovery bar at 0%
- Down-count dot 1 filled in survivor HUD and in professor's survivor card
- Professor's HUD shows the survivor card with downed indicator

- [ ] **Step 3: Verify crawl + self-recovery**

- While downed: move with WASD → survivor crawls slowly
- While still: recovery bar fills slowly (up to 95%, then stops)
- Skill check pops up periodically during self-recovery
- Missing skill check: recovery bar regresses by 10%, brief lock
- Recovery bar on professor's survivor card reflects progress

- [ ] **Step 4: Verify bleed-out → downCount increment**

- Let survivor stay downed for 70 seconds without healing
- Down-count dot 2 fills in survivor HUD and card
- `downCountUpdated` flash message appears
- Bleed-out bar resets to 0 and starts again

- [ ] **Step 5: Verify altruistic healing**

- Bring a second survivor tab
- Downed survivor recovers to 95%, then stops
- Live survivor holds E near downed survivor → CURANDO bar appears
- Skill checks pop up; great hit gives bonus; fail regresses and alerts professor (large red arrow on professor HUD)
- Completion → survivor revives to Injured (hp=1), card updates

- [ ] **Step 6: Verify interaction conflict resolution**

- Stand a live survivor next to both a terminal and a downed ally
- Hold E → heals the downed ally (not the terminal)
- Move away from downed ally → hacking the terminal resumes

- [ ] **Step 7: Verify being-healed lock**

- While a survivor is being healed by an ally, check that the survivor being healed cannot start hacking a terminal (server rejects the event)
- Also confirm: self-recovery pauses when someone else starts healing you

- [ ] **Step 8: Verify injured → healthy healing**

- Survivor at hp=1 (injured), hold E near them with another survivor → CURANDO bar, heals to hp=2

- [ ] **Step 9: Verify third-down expulsion**

- Get a survivor downed twice (two bleed-outs or one hit + one bleed-out)
- Hit them again (or wait for second bleed-out) → expelled immediately, no downed state
- Professor HUD shows card as expelled

- [ ] **Step 10: Run typecheck one final time**

```bash
npm run typecheck
```

Expected: no errors.
