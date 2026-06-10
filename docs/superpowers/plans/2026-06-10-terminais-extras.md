# Dois Terminais Extras (issue #16) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spawnar `survivors + 3` terminais por partida (2 a mais que o limiar `survivors + 1` de abrir o portão), gerados no `startMatch`.

**Architecture:** `TerminalId` cresce para `t1..t7` e os records de terminal viram `Partial<>` nos dois lados (tipos duplicados por design). `freshGameState()` cria records vazios; o `startMatch` chama `rollTerminals(state, survivorCount)` que sorteia posições do pool (issue #15) e cria os `TerminalRecord` zerados. Os guards `hasOwnProperty` do hacking viram checagem de `undefined`, que também satisfaz o narrowing.

**Tech Stack:** TypeScript, Socket.io, Phaser 3. Verificação via `npm run typecheck` + `npx tsx -e` + manual.

**Nota:** Sem nenhum comando git (preferência do usuário — ele mesmo comita).

---

### Task 1: Tipos (server e client)

**Files:**
- Modify: `server/types.ts:2`, `:49-50`
- Modify: `src/types.ts:2`, `:28-29`

- [ ] **Step 1: `server/types.ts`**

De:

```ts
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5';
```

para:

```ts
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7';
```

De:

```ts
  terminals:         Record<TerminalId, TerminalRecord>;
  terminalPositions: Record<TerminalId, Vec2>;
```

para:

```ts
  terminals:         Partial<Record<TerminalId, TerminalRecord>>;
  terminalPositions: Partial<Record<TerminalId, Vec2>>;
```

- [ ] **Step 2: `src/types.ts`** — mesmas duas mudanças:

```ts
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7';
```

```ts
  terminals:         Partial<Record<TerminalId, { progress: number }>>;
  terminalPositions: Partial<Record<TerminalId, Vec2>>;
```

### Task 2: Geração no servidor

**Files:**
- Modify: `server/gameState.ts` (função `randomTerminalPositions` e `freshGameState`)
- Modify: `server/index.ts` (import e handler `startMatch`)

- [ ] **Step 1: Reescrever o sorteio em `server/gameState.ts`**

De:

```ts
export function randomTerminalPositions(): Record<TerminalId, Vec2> {
  const pool = [...TERMINAL_SPAWN_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { t1: pool[0], t2: pool[1], t3: pool[2], t4: pool[3], t5: pool[4] };
}
```

para:

```ts
export const ALL_TERMINAL_IDS: TerminalId[] = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];

export function randomTerminalPositions(count: number): Partial<Record<TerminalId, Vec2>> {
  const pool = [...TERMINAL_SPAWN_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const n = Math.min(count, ALL_TERMINAL_IDS.length, pool.length);
  const result: Partial<Record<TerminalId, Vec2>> = {};
  for (let i = 0; i < n; i++) result[ALL_TERMINAL_IDS[i]] = pool[i];
  return result;
}

export function rollTerminals(state: GameStateRecord, survivorCount: number): void {
  state.terminalPositions = randomTerminalPositions(survivorCount + 3);
  state.terminals = {};
  (Object.keys(state.terminalPositions) as TerminalId[]).forEach((id) => {
    state.terminals[id] = { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 };
  });
}
```

- [ ] **Step 2: Esvaziar `freshGameState()`**

De:

```ts
    terminals: {
      t1: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t2: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t3: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t4: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t5: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
    },
    terminalPositions: randomTerminalPositions(),
```

para:

```ts
    terminals:         {},
    terminalPositions: {},
```

- [ ] **Step 3: Gerar no `startMatch` (`server/index.ts`)**

Adicionar `rollTerminals,` ao import de `'./gameState'` (após `getRoomSummary,`). No handler, de:

```ts
    if (survivors.length < MIN_SURVIVORS_TO_START || !survivors.every((pl) => pl.ready)) return;
    state.phase = 'playing';
```

para:

```ts
    if (survivors.length < MIN_SURVIVORS_TO_START || !survivors.every((pl) => pl.ready)) return;
    rollTerminals(state, survivors.length);
    state.phase = 'playing';
```

### Task 3: Narrowing no hacking (`server/systems/hacking.ts`)

**Files:**
- Modify: `server/systems/hacking.ts:33-34`, `:65-69`, `:131-133`, `:149-151`

- [ ] **Step 1: `tickTerminalRegression`** — de:

```ts
    const t = state.terminals[id];
    if (!t.regressing) return;
```

para:

```ts
    const t = state.terminals[id];
    if (!t || !t.regressing) return;
```

- [ ] **Step 2: `processHackProgress`** — de:

```ts
  if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;
  if (typeof amount !== 'number' || amount < 0 || amount > HACK_AMOUNT_MAX) return;

  const t = state.terminals[terminalId];
  if (t.progress >= 100) return;
```

para:

```ts
  if (typeof amount !== 'number' || amount < 0 || amount > HACK_AMOUNT_MAX) return;

  const t = state.terminals[terminalId];
  if (!t) return;
  if (t.progress >= 100) return;
```

- [ ] **Step 3: `processSkillCheckFailed`** — de:

```ts
  if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;

  const t = state.terminals[terminalId];
  t.failLockUntil = Date.now() + HACK_FAIL_LOCK_MS;
```

para:

```ts
  const t = state.terminals[terminalId];
  if (!t) return;
  t.failLockUntil = Date.now() + HACK_FAIL_LOCK_MS;
```

- [ ] **Step 4: `processReinforceTerminal`** — de:

```ts
  if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;

  const t = state.terminals[terminalId];
  if (t.progress >= 100 || t.progress <= 0) return;
```

para:

```ts
  const t = state.terminals[terminalId];
  if (!t) return;
  if (t.progress >= 100 || t.progress <= 0) return;
```

(`processSetHacking` linha 113 já guarda com `if (t && ...)` — sem mudança.)

### Task 4: Narrowing no cliente (`src/game/TerminalManager.ts`)

**Files:**
- Modify: `src/game/TerminalManager.ts:90-116` (método `sync`)

- [ ] **Step 1: Tipar o `sync` com `Partial` e guardar o acesso** — de:

```ts
  sync(terminals: Record<string, { progress: number }>, positions: Record<string, Vec2>) {
    this.positions = positions as Record<TerminalId, Vec2>;

    (Object.keys(terminals) as TerminalId[]).forEach((id) => {
      const pos = this.positions[id];
      if (!pos) return;
```

para:

```ts
  sync(
    terminals: Partial<Record<TerminalId, { progress: number }>>,
    positions: Partial<Record<TerminalId, Vec2>>,
  ) {
    this.positions = positions;

    (Object.keys(terminals) as TerminalId[]).forEach((id) => {
      const pos = this.positions[id];
      const t   = terminals[id];
      if (!pos || !t) return;
```

E no fim do mesmo loop, de:

```ts
      this.setProgress(id, terminals[id].progress);
```

para:

```ts
      this.setProgress(id, t.progress);
```

### Task 5: Verificação

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: sem erros nos dois tsconfigs.

- [ ] **Step 2: Sanity da geração**

Run: `npx tsx -e "import { freshGameState, rollTerminals } from './server/gameState'; const s = freshGameState(); rollTerminals(s, 3); console.log(Object.keys(s.terminals), Object.keys(s.terminalPositions).length); rollTerminals(s, 4); console.log(Object.keys(s.terminals))"`
Expected: primeiro `['t1'..'t6'] 6`, depois `['t1'..'t7']`.

- [ ] **Step 3: Teste manual**

`npm run dev`, partida com 3 alunos → 6 terminais no mapa, HUD mostra `0/4`, portão energiza ao completar 4; reset re-sorteia posições.
