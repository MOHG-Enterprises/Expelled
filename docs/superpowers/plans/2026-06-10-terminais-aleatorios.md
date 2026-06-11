# Spawns Aleatórios dos Terminais (issue #15) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortear as posições dos 5 terminais a cada partida a partir de um pool de 12 posições válidas do mapa.

**Architecture:** Mudança 100% server-side em `server/gameState.ts`: o `TERMINAL_POSITIONS` fixo vira `TERMINAL_SPAWN_POOL` (12 posições) + `randomTerminalPositions()` (Fisher-Yates, pega 5). `freshGameState()` chama a função, e como ela roda na criação da sala e em cada reset, toda partida ganha sorteio novo. Cliente intocado — posições já fluem via `gameState` → `TerminalManager.sync()`.

**Tech Stack:** TypeScript, Node.js. Verificação via `npm run typecheck` + teste manual.

**Nota:** Sem nenhum comando git (preferência do usuário — ele mesmo comita).

---

### Task 1: Pool e sorteio em `server/gameState.ts`

**Files:**
- Modify: `server/gameState.ts:39-46` (constante) e `:137` (`freshGameState`)

- [ ] **Step 1: Substituir `TERMINAL_POSITIONS` pelo pool**

De:

```ts
// posicao fixa dos terminais no mapa
export const TERMINAL_POSITIONS: Record<TerminalId, Vec2> = {
  t1: { x: 2140, y: 2520 },
  t2: { x: 785,  y: 86  },
  t3: { x: 848,  y: 1830 },
  t4: { x: 780,  y: 3720  },
  t5: { x: 1510,  y: 1430  },
};
```

para:

```ts
// pool de posicoes validas; 5 sao sorteadas por partida
export const TERMINAL_SPAWN_POOL: Vec2[] = [
  { x: 2140, y: 2520 },
  { x: 785,  y: 86   },
  { x: 848,  y: 1830 },
  { x: 780,  y: 3720 },
  { x: 1510, y: 1430 },
  { x: 2960, y: 208  },
  { x: 3376, y: 1680 },
  { x: 2928, y: 2992 },
  { x: 1872, y: 272  },
  { x: 1872, y: 3696 },
  { x: 1136, y: 2800 },
  { x: 2352, y: 1616 },
];

export function randomTerminalPositions(): Record<TerminalId, Vec2> {
  const pool = [...TERMINAL_SPAWN_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { t1: pool[0], t2: pool[1], t3: pool[2], t4: pool[3], t5: pool[4] };
}
```

`TERMINAL_POSITIONS` não tem outros usos no projeto (conferido por grep), então a remoção é segura.

- [ ] **Step 2: Usar o sorteio em `freshGameState()`**

De:

```ts
    terminalPositions: TERMINAL_POSITIONS,
```

para:

```ts
    terminalPositions: randomTerminalPositions(),
```

### Task 2: Verificação

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: sem erros (confirma que nenhuma referência a `TERMINAL_POSITIONS` sobrou).

- [ ] **Step 2: Sanity do sorteio via tsx**

Run: `npx tsx -e "import { randomTerminalPositions } from './server/gameState'; console.log(JSON.stringify(randomTerminalPositions())); console.log(JSON.stringify(randomTerminalPositions()))"`
Expected: dois objetos com chaves `t1`–`t5`, posições do pool, geralmente diferentes entre as duas chamadas.

- [ ] **Step 3: Teste manual em jogo**

Subir `npm run dev`, iniciar partida, observar os terminais; resetar e conferir que as posições mudam e que o hack funciona nos pontos novos.
