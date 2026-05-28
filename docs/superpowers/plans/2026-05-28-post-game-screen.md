# Post-Game Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `gameOver` HUD flash with a `PostGameScene` that shows each player's match result and key performance stats.

**Architecture:** The server accumulates per-player stats throughout the match and sends them in the `gameOver` payload. `GameScene` saves the payload to the Phaser registry and transitions to a new `PostGameScene`, which renders the result screen. The "Jogar de novo" button disconnects the old socket and starts `LobbyScene`.

**Tech Stack:** TypeScript, Phaser 3, Socket.io, Node.js/Express

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/types.ts` | Modify | Add 5 stat fields to `PlayerRecord` |
| `server/index.ts` | Modify | Initialize stat fields; accumulate `healsGiven` |
| `server/systems/hacking.ts` | Modify | Accumulate `hackContributed` |
| `server/systems/combat.ts` | Modify | Accumulate `hitsLanded`, `downedCount`, `expelledCount` |
| `server/gameState.ts` | Modify | Add `buildStats`; include stats in `gameOver` payload |
| `src/scenes/GameScene.ts` | Modify | Save registry data + transition to `PostGameScene` on `gameOver` |
| `src/scenes/PostGameScene.ts` | Create | Render result screen |
| `src/main.ts` | Modify | Register `PostGameScene` |

---

### Task 1: Add stat fields to `PlayerRecord` and initialize them

**Files:**
- Modify: `server/types.ts`
- Modify: `server/index.ts:118-136`

- [ ] **Step 1: Add the five stat fields to `PlayerRecord` in `server/types.ts`**

  Add after the `skinId: string;` line (currently the last field):

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
    hackContributed: number;
    healsGiven:      number;
    hitsLanded:      number;
    downedCount:     number;
    expelledCount:   number;
  }
  ```

- [ ] **Step 2: Initialize the five new fields in `server/index.ts` player creation block**

  The player creation block starts at line 118. Replace it with:

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
    hackContributed:    0,
    healsGiven:         0,
    hitsLanded:         0,
    downedCount:        0,
    expelledCount:      0,
  };
  ```

- [ ] **Step 3: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors related to `PlayerRecord`.

- [ ] **Step 4: Commit**

  ```bash
  git add server/types.ts server/index.ts
  git commit -m "feat: add stat tracking fields to PlayerRecord"
  ```

---

### Task 2: Accumulate `hackContributed` in hacking system

**Files:**
- Modify: `server/systems/hacking.ts:54-88`

- [ ] **Step 1: Increment `hackContributed` after computing `effective` in `processHackProgress`**

  In `server/systems/hacking.ts`, inside `processHackProgress`, add one line after `const effective = ...`:

  ```ts
  export function processHackProgress(
    state: GameStateRecord,
    roomName: string,
    actorId: string,
    terminalId: TerminalId,
    amount: number,
    emit: EmitContext,
  ): void {
    const p = state.players[actorId];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (p.beingHealed) return;
    if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;
    if (typeof amount !== 'number' || amount < 0 || amount > HACK_AMOUNT_MAX) return;

    const t = state.terminals[terminalId];
    if (t.progress >= 100) return;
    if (Date.now() < t.failLockUntil) return;
    if (state.endgameStartedAt !== null) return;

    const repairerCount = getRepairerCount(roomName, terminalId);
    const penaltyFactor = Math.max(0, repairerCount - 1) * (HACK_EFFICIENCY_PENALTY / 100);
    const effective = amount * Math.max(0.1, 1 - penaltyFactor);
    p.hackContributed += effective;

    t.progress = Math.min(100, t.progress + effective);
    // ... rest of function unchanged
  ```

  Only the `p.hackContributed += effective;` line is added. Everything below stays the same.

- [ ] **Step 2: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add server/systems/hacking.ts
  git commit -m "feat: accumulate hackContributed stat per survivor"
  ```

---

### Task 3: Accumulate `healsGiven` in heal handler

**Files:**
- Modify: `server/index.ts:303-315`

- [ ] **Step 1: Increment `healsGiven` on the healer when an altruistic heal completes**

  In `server/index.ts`, inside the `healProgress` handler, the block at line 303 is:

  ```ts
  if (!isSelf && target.healPct >= 100) {
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
  ```

  Replace it with:

  ```ts
  if (!isSelf && target.healPct >= 100) {
    target.healPct     = 0;
    target.beingHealed = false;
    healer.healsGiven++;
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
  ```

  Only `healer.healsGiven++;` is added.

- [ ] **Step 2: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add server/index.ts
  git commit -m "feat: accumulate healsGiven stat per survivor"
  ```

---

### Task 4: Accumulate professor combat stats

**Files:**
- Modify: `server/systems/combat.ts:14-44`

- [ ] **Step 1: Replace `applyDamage` to track `hitsLanded`, `downedCount`, and `expelledCount`**

  Replace the entire `applyDamage` function (lines 14–45) with:

  ```ts
  function applyDamage(
    state: GameStateRecord,
    id: string,
    target: PlayerRecord,
    emit: EmitContext,
  ): void {
    const prof = Object.values(state.players).find((p) => p.role === 'professor');
    if (prof) prof.hitsLanded++;

    target.hp--;
    if (target.hp > 0) {
      emit.all('playerHit', { targetId: id, hp: target.hp });
      return;
    }
    target.hp = 0;
    if (target.downCount >= 2) {
      target.expelled = true;
      if (prof) prof.expelledCount++;
      if (target.beingHealed) {
        target.beingHealed = false;
        emit.all('setBeingHealed', { targetId: id, isBeingHealed: false });
      }
      emit.all('playerExpelled', id);
      checkWinConditions(state, (e, d) => emit.all(e, d));
      return;
    }
    target.downCount = (target.downCount + 1) as 0 | 1 | 2;
    target.downed      = true;
    if (prof) prof.downedCount++;
    target.healPct     = 0;
    target.downBleedMs = 0;
    if (target.beingHealed) {
      target.beingHealed = false;
      emit.all('setBeingHealed', { targetId: id, isBeingHealed: false });
    }
    emit.all('playerDowned', { id, downCount: target.downCount });
  }
  ```

- [ ] **Step 2: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add server/systems/combat.ts
  git commit -m "feat: accumulate hitsLanded, downedCount, expelledCount for professor"
  ```

---

### Task 5: Add `buildStats` and extend `gameOver` payload

**Files:**
- Modify: `server/gameState.ts`

- [ ] **Step 1: Add `PlayerStatSnapshot` type and `buildStats` function to `server/gameState.ts`**

  Add before the `freshGameState` function (after line 53, before line 86):

  ```ts
  export interface PlayerStatSnapshot {
    role: 'survivor' | 'professor';
    outcome?: 'escaped' | 'expelled' | 'downed';
    hackContributed?: number;
    timesDown?: number;
    healsGiven?: number;
    hitsLanded?: number;
    downedCount?: number;
    expelledCount?: number;
  }

  export function buildStats(state: GameStateRecord): Record<string, PlayerStatSnapshot> {
    const result: Record<string, PlayerStatSnapshot> = {};
    for (const [id, p] of Object.entries(state.players)) {
      if (p.role === 'survivor') {
        const outcome: 'escaped' | 'expelled' | 'downed' =
          p.escaped ? 'escaped' : p.expelled ? 'expelled' : 'downed';
        result[id] = {
          role: 'survivor',
          outcome,
          hackContributed: Math.round(p.hackContributed),
          timesDown: p.downCount,
          healsGiven: p.healsGiven,
        };
      } else {
        result[id] = {
          role: 'professor',
          hitsLanded: p.hitsLanded,
          downedCount: p.downedCount,
          expelledCount: p.expelledCount,
        };
      }
    }
    return result;
  }
  ```

- [ ] **Step 2: Update both `emit('gameOver', ...)` calls in `checkWinConditions` to include stats**

  In `checkWinConditions` (lines 130–150), change both emit calls:

  ```ts
  export function checkWinConditions(state: GameStateRecord, emit: EmitFn): boolean {
    if (state.phase !== 'playing') return false;

    const allSurvivors = Object.values(state.players).filter((p) => p.role === 'survivor');
    const active       = allSurvivors.filter((p) => !p.expelled);
    const escaped      = active.filter((p) => p.escaped);

    if (active.length > 0 && escaped.length === active.length) {
      state.phase = 'ended';
      emit('gameOver', { winner: 'survivors', stats: buildStats(state) });
      return true;
    }

    if (allSurvivors.length > 0 && allSurvivors.every((p) => p.expelled)) {
      state.phase = 'ended';
      emit('gameOver', { winner: 'professor', stats: buildStats(state) });
      return true;
    }

    return false;
  }
  ```

- [ ] **Step 3: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add server/gameState.ts
  git commit -m "feat: include per-player stats in gameOver payload"
  ```

---

### Task 6: Update `GameScene` to transition to `PostGameScene`

**Files:**
- Modify: `src/scenes/GameScene.ts:430-435`

- [ ] **Step 1: Add `PostGameStats` interface near the top of `GameScene.ts`**

  Find the existing type declarations near the top of the file (around the private field declarations). Add this interface after the imports:

  ```ts
  interface PostGameStats {
    [socketId: string]: {
      role: 'survivor' | 'professor';
      outcome?: 'escaped' | 'expelled' | 'downed';
      hackContributed?: number;
      timesDown?: number;
      healsGiven?: number;
      hitsLanded?: number;
      downedCount?: number;
      expelledCount?: number;
    };
  }
  ```

- [ ] **Step 2: Replace the `gameOver` handler in `_bindSocketEvents`**

  Find the current handler (around line 430):

  ```ts
  s.on('gameOver', ({ winner }: { winner: string }) => {
    this.inputFrozen = true;
    const msg = winner === 'survivors' ? 'ALUNOS VENCERAM!' : 'PROFESSOR VENCEU!';
    const col = winner === 'survivors' ? 0x4fc3f7 : 0xe94560;
    this.hud.flash(msg, col, 8000);
  });
  ```

  Replace with:

  ```ts
  s.on('gameOver', (payload: { winner: string; stats: PostGameStats }) => {
    this.inputFrozen = true;
    this.registry.set('postGameData', {
      winner: payload.winner,
      stats:  payload.stats,
      myId:   s.id!,
      myRole: this.myRole,
      socket: s,
    });
    this.time.delayedCall(600, () => this.scene.start('PostGameScene'));
  });
  ```

- [ ] **Step 3: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/scenes/GameScene.ts
  git commit -m "feat: transition to PostGameScene on gameOver"
  ```

---

### Task 7: Create `PostGameScene`

**Files:**
- Create: `src/scenes/PostGameScene.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create `src/scenes/PostGameScene.ts`**

  ```ts
  import Phaser from 'phaser';
  import type { Socket } from 'socket.io-client';

  interface PlayerStatSnapshot {
    role: 'survivor' | 'professor';
    outcome?: 'escaped' | 'expelled' | 'downed';
    hackContributed?: number;
    timesDown?: number;
    healsGiven?: number;
    hitsLanded?: number;
    downedCount?: number;
    expelledCount?: number;
  }

  interface PostGameData {
    winner: string;
    stats:  Record<string, PlayerStatSnapshot>;
    myId:   string;
    myRole: 'survivor' | 'professor';
    socket: Socket;
  }

  const PROFESSOR_RATINGS: [number, string][] = [
    [3, 'Ditador da Sala'],
    [2, 'Professor Implacável'],
    [1, 'Professor Severo'],
    [0, 'Plano de Aula Ignorado'],
  ];

  const OUTCOME_LABEL: Record<'escaped' | 'expelled' | 'downed', string> = {
    escaped: 'FUGIU!',
    expelled: 'EXPULSO',
    downed: 'DERRUBADO',
  };

  const OUTCOME_COLOR: Record<'escaped' | 'expelled' | 'downed', string> = {
    escaped: '#00e676',
    expelled: '#ff4444',
    downed: '#ffb300',
  };

  export class PostGameScene extends Phaser.Scene {
    constructor() {
      super('PostGameScene');
    }

    create() {
      const { width, height } = this.scale;
      const data = this.registry.get('postGameData') as PostGameData;
      const my = data.stats[data.myId];

      this.cameras.main.setBackgroundColor('#1a1a2e');

      const { label, color } = this._getResult(data, my);

      this.add.text(width / 2, height * 0.22, label, {
        fontSize: '48px',
        color,
        fontFamily: 'monospace',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this._renderStatBoxes(width, height, my);
      this._renderButton(width, height, data.socket);
    }

    private _getResult(data: PostGameData, my: PlayerStatSnapshot): { label: string; color: string } {
      if (my.role === 'professor') {
        const expelled = my.expelledCount ?? 0;
        const [, lbl] = PROFESSOR_RATINGS.find(([min]) => expelled >= min) ?? [0, 'Plano de Aula Ignorado'];
        return { label: lbl, color: data.winner === 'professor' ? '#4fc3f7' : '#e94560' };
      }
      const outcome = my.outcome ?? 'downed';
      return { label: OUTCOME_LABEL[outcome], color: OUTCOME_COLOR[outcome] };
    }

    private _getStatBoxes(my: PlayerStatSnapshot): { label: string; value: string }[] {
      if (my.role === 'professor') {
        return [
          { label: 'ATAQUES',    value: String(my.hitsLanded  ?? 0) },
          { label: 'DERRUBADOS', value: String(my.downedCount  ?? 0) },
          { label: 'EXPULSOS',   value: String(my.expelledCount ?? 0) },
        ];
      }
      return [
        { label: 'TERMINAIS', value: `${my.hackContributed ?? 0}%` },
        { label: 'DERRUBADO', value: `${my.timesDown ?? 0}x` },
        { label: 'CURAS',     value: String(my.healsGiven ?? 0) },
      ];
    }

    private _renderStatBoxes(width: number, height: number, my: PlayerStatSnapshot) {
      const boxes  = this._getStatBoxes(my);
      const boxW   = 150;
      const boxH   = 80;
      const gap    = 20;
      const totalW = boxes.length * boxW + (boxes.length - 1) * gap;
      const startX = (width - totalW) / 2;
      const by     = height * 0.46;

      boxes.forEach(({ label, value }, i) => {
        const bx = startX + i * (boxW + gap);

        this.add.graphics()
          .fillStyle(0x2a2a4e, 1)
          .fillRect(bx, by, boxW, boxH);

        this.add.text(bx + boxW / 2, by + 20, value, {
          fontSize: '26px',
          color: '#e0e0ff',
          fontFamily: 'monospace',
        }).setOrigin(0.5);

        this.add.text(bx + boxW / 2, by + 58, label, {
          fontSize: '11px',
          color: '#666688',
          fontFamily: 'monospace',
          letterSpacing: 2,
        }).setOrigin(0.5);
      });
    }

    private _renderButton(width: number, height: number, socket: Socket) {
      const goToLobby = () => {
        socket.disconnect();
        this.scene.start('LobbyScene');
      };

      const btn = this.add.text(width / 2, height * 0.75, '[ JOGAR DE NOVO ]', {
        fontSize: '16px',
        color: '#aaaacc',
        fontFamily: 'monospace',
        letterSpacing: 4,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => btn.setColor('#e0e0ff'));
      btn.on('pointerout',  () => btn.setColor('#aaaacc'));
      btn.on('pointerdown', goToLobby);

      this.input.keyboard?.on('keydown-ENTER', goToLobby);
      this.input.keyboard?.on('keydown-SPACE', goToLobby);
    }
  }
  ```

- [ ] **Step 2: Register `PostGameScene` in `src/main.ts`**

  Replace the contents of `src/main.ts` with:

  ```ts
  import Phaser from 'phaser';
  import { StartScene }    from './scenes/StartScene';
  import { LobbyScene }    from './scenes/LobbyScene';
  import { GameScene }     from './scenes/GameScene';
  import { PostGameScene } from './scenes/PostGameScene';

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    physics: { default: 'arcade', arcade: { debug: false } },
    input: { gamepad: true },
    scene: [StartScene, LobbyScene, GameScene, PostGameScene],
  };

  new Phaser.Game(config);
  ```

- [ ] **Step 3: Run typecheck**

  ```bash
  npm run typecheck
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/scenes/PostGameScene.ts src/main.ts
  git commit -m "feat: add PostGameScene with result label and stat boxes"
  ```

---

## Manual Test Checklist

After all tasks are complete, start the dev server (`npm run dev`) and verify:

- [ ] Play a full match as survivor until escaping — `PostGameScene` appears with "FUGIU!" in green
- [ ] Play a full match as survivor until getting expelled — `PostGameScene` appears with "EXPULSO" in red
- [ ] Play a full match as professor — `PostGameScene` appears with the correct rating label based on how many students were expelled
- [ ] Stat boxes show non-zero numbers (hack progress contributed, times downed, heals given, hits landed)
- [ ] "Jogar de novo" button returns to `LobbyScene` and a new match can be started normally
- [ ] ENTER and SPACE keys also trigger "Jogar de novo"
