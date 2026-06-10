# Dois terminais extras além dos necessários (issue #16)

## Objetivo

Spawnar 2 terminais a mais do que o necessário para energizar os portões. O limiar de abertura já é dinâmico (`survivors + 1`) e não muda; o número de terminais no mapa passa a ser `survivors + 3` (3 alunos → 6 terminais, 4 alunos → 7).

## Regra

- Terminais no mapa: `survivorCount + 3`, sorteados do pool de 12 posições (issue #15) no momento do `startMatch` — único ponto em que a contagem de alunos é conhecida e estável.
- Limiar para `gatesPowered`: `survivorCount + 1` (inalterado, `server/systems/hacking.ts:84`).
- Recalculo do limiar em caso de disconnect: comportamento atual mantido (fica mais fácil para os survivors).

## Tipos (espelhados, conforme convenção de duplicação)

- `TerminalId` = `'t1' | 't2' | 't3' | 't4' | 't5' | 't6' | 't7'` em `server/types.ts` e `src/types.ts`.
- `terminals` e `terminalPositions` viram `Partial<Record<TerminalId, ...>>` em `GameStateRecord` (server) e `GameState` (client) — nem toda partida usa todas as chaves.

## Servidor

1. `server/gameState.ts`:
   - `freshGameState()` cria `terminals: {}` e `terminalPositions: {}` — sala em lobby não tem terminais.
   - `randomTerminalPositions(count: number)` sorteia `count` posições do pool e mapeia para `t1..tN`.
   - Nova função `rollTerminals(state, count)` (ou equivalente) popula `state.terminals` com `TerminalRecord` zerados e `state.terminalPositions` com o sorteio, para os mesmos ids.
2. `server/index.ts`, handler `startMatch`: após as validações existentes (professor, phase, mínimo de alunos, todos prontos), gera `survivors.length + 3` terminais antes de `state.phase = 'playing'`. O cliente recebe tudo via `gameState` no `requestSync` da `GameScene`.
3. `server/systems/hacking.ts`: os guards `Object.prototype.hasOwnProperty.call(state.terminals, id)` viram `const t = state.terminals[id]; if (!t) return;` — mais simples e resolve o narrowing do `Partial`. `tickTerminalRegression` ganha guard de `undefined` no loop.

## Cliente

- `src/types.ts`: tipos atualizados (acima).
- `src/game/TerminalManager.ts` e handler de `gameState` na `GameScene`: ajustes de narrowing onde indexam o record direto (ex.: `terminals[id].progress` no `sync()`); a iteração por `Object.keys` já funciona com subconjuntos.
- `terminalsNeeded = survivorCount + 1` e o HUD `X/Y` inalterados.

## Fora de escopo

- Mudança no limiar de portões.
- Mudança no recálculo por disconnect.

## Verificação

- `npm run typecheck` limpo.
- `npx tsx -e` chamando a geração com 6 e 7 e conferindo ids `t1..tN` e posições distintas do pool.
- Manual: partida com 3 alunos mostra 6 terminais; portão abre ao completar 4; reset re-sorteia.
