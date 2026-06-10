# Mínimo de Jogadores (issue #74) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir no mínimo 3 survivors (4 jogadores no total, com o professor) para iniciar uma partida, com validação no servidor e feedback no lobby.

**Architecture:** Nova constante compartilhada `MIN_SURVIVORS_TO_START` em `shared/gameRules.ts` (fonte de verdade), re-exportada por `server/gameState.ts` e `src/constants.ts` conforme o padrão do projeto. O servidor valida em `startMatch`; o cliente espelha a regra em `canProfessorStart()` e mostra o motivo no label do professor.

**Tech Stack:** TypeScript, Socket.io, Phaser 3. Sem testes automatizados no projeto — verificação via `npm run typecheck` e teste manual.

**Nota:** Não fazer commits intermediários (preferência do usuário — commit só quando pedido).

---

### Task 1: Constante compartilhada e re-exports

**Files:**
- Modify: `shared/gameRules.ts:39`
- Modify: `server/gameState.ts` (bloco de re-export, ~linha 122)
- Modify: `src/constants.ts` (bloco de re-export, linhas 4–30)

- [ ] **Step 1: Adicionar a constante em `shared/gameRules.ts`**

Após a linha `export const MAX_PLAYERS_PER_ROOM = 5;`:

```ts
export const MIN_SURVIVORS_TO_START = 3;
```

- [ ] **Step 2: Re-exportar em `server/gameState.ts`**

No bloco de import de `'../shared/gameRules'` (linhas 2–33), adicionar `MIN_SURVIVORS_TO_START,` após `MAX_PLAYERS_PER_ROOM,`. No bloco de re-exports (após `export { MAX_PLAYERS_PER_ROOM };`):

```ts
export { MIN_SURVIVORS_TO_START };
```

- [ ] **Step 3: Re-exportar em `src/constants.ts`**

No bloco `export { ... } from '../shared/gameRules';` (linhas 4–30), adicionar `MIN_SURVIVORS_TO_START,` após `MAX_PLAYERS_PER_ROOM,`.

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

### Task 2: Validação no servidor

**Files:**
- Modify: `server/index.ts:5-22` (import) e `server/index.ts:197` (handler `startMatch`)

- [ ] **Step 1: Importar a constante**

No bloco de import de `'./gameState'`, adicionar `MIN_SURVIVORS_TO_START,` após `MAX_PLAYERS_PER_ROOM,`:

```ts
  MAX_PLAYERS_PER_ROOM,
  MIN_SURVIVORS_TO_START,
  PROFESSOR_LOCK_DURATION_MS,
```

- [ ] **Step 2: Trocar a validação no handler `startMatch`**

Linha 197, de:

```ts
    if (survivors.length < 1 || !survivors.every((pl) => pl.ready)) return;
```

para:

```ts
    if (survivors.length < MIN_SURVIVORS_TO_START || !survivors.every((pl) => pl.ready)) return;
```

- [ ] **Step 3: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

### Task 3: Feedback no lobby (cliente)

**Files:**
- Modify: `src/scenes/LobbyScene.ts:4` (import), `:669-671` (`canProfessorStart`), `:682-687` (`refreshActionLabel`)

- [ ] **Step 1: Importar a constante**

Linha 4, de:

```ts
import { ROOM_NAMES, MAX_PLAYERS_PER_ROOM } from '../constants';
```

para:

```ts
import { ROOM_NAMES, MAX_PLAYERS_PER_ROOM, MIN_SURVIVORS_TO_START } from '../constants';
```

- [ ] **Step 2: Exigir o mínimo em `canProfessorStart()`**

De:

```ts
  private canProfessorStart(): boolean {
    return this.totalSurvivors > 0 && this.readySurvivors === this.totalSurvivors;
  }
```

para:

```ts
  private canProfessorStart(): boolean {
    return this.totalSurvivors >= MIN_SURVIVORS_TO_START && this.readySurvivors === this.totalSurvivors;
  }
```

- [ ] **Step 3: Diferenciar os estados bloqueados em `refreshActionLabel()`**

No ramo `this.myRole === 'professor'`, de:

```ts
    if (this.myRole === 'professor') {
      const canStart = this.canProfessorStart();
      this.actionText.setText(canStart ? 'Iniciar partida  [ A ]' : 'Esperando alunos ficarem prontos...');
      this.actionText.setBackgroundColor(canStart ? '#1565c0' : '#333333');
      return;
    }
```

para:

```ts
    if (this.myRole === 'professor') {
      const canStart = this.canProfessorStart();
      const waitingLabel = this.totalSurvivors < MIN_SURVIVORS_TO_START
        ? `Esperando alunos... (${this.totalSurvivors}/${MIN_SURVIVORS_TO_START})`
        : 'Esperando alunos ficarem prontos...';
      this.actionText.setText(canStart ? 'Iniciar partida  [ A ]' : waitingLabel);
      this.actionText.setBackgroundColor(canStart ? '#1565c0' : '#333333');
      return;
    }
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run typecheck`
Expected: sem erros.

### Task 4: Verificação manual

- [ ] **Step 1: Subir o jogo**

Run: `npm run dev`

- [ ] **Step 2: Cenário bloqueado**

Abrir 2 abas (1 professor + 1 aluno pronto). O label do professor deve mostrar `Esperando alunos... (1/3)` e o clique/tecla A não deve iniciar. Emitir `startMatch` manualmente pelo console (`socket.emit('startMatch')`) também não deve iniciar — o servidor rejeita.

- [ ] **Step 3: Cenário liberado**

Abrir 4 abas (1 professor + 3 alunos, todos prontos). O label deve virar `Iniciar partida  [ A ]` e a partida deve começar normalmente.
