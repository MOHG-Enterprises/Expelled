# Mínimo de jogadores para iniciar partida (issue #74)

## Objetivo

Impedir que uma partida comece com menos de 3 alunos (survivors). Total mínimo: 4 jogadores (1 professor + 3 alunos). Hoje o servidor aceita iniciar com apenas 1 aluno pronto.

## Regra

Uma partida só pode iniciar quando:

- Há pelo menos `MIN_SURVIVORS_TO_START = 3` survivors na sala, **e**
- Todos os survivors estão prontos (regra existente, inalterada).

## Mudanças

### 1. `shared/gameRules.ts`

Nova constante `MIN_SURVIVORS_TO_START = 3`. É fonte de verdade — o servidor precisa dela (regra do projeto: constantes usadas pelo servidor vivem em `shared/`).

### 2. `server/gameState.ts`

Re-exporta `MIN_SURVIVORS_TO_START` (padrão existente para as demais constantes compartilhadas).

### 3. `server/index.ts` — handler `startMatch`

A validação `survivors.length < 1` passa a ser `survivors.length < MIN_SURVIVORS_TO_START`. O servidor continua sendo autoridade: cliente adulterado não consegue iniciar com menos jogadores.

### 4. `src/constants.ts`

Re-exporta `MIN_SURVIVORS_TO_START` de `shared/gameRules.ts` para o cliente.

### 5. `src/scenes/LobbyScene.ts`

- `canProfessorStart()` passa a exigir `totalSurvivors >= MIN_SURVIVORS_TO_START` (além da regra atual de todos prontos).
- O label de ação do professor diferencia os dois estados bloqueados:
  - Faltam alunos: `Esperando alunos... (X/3)` onde X = survivors na sala.
  - Alunos suficientes mas nem todos prontos: mantém `Esperando alunos ficarem prontos...`.
- O contador existente `Alunos prontos: X/Y` não muda.

## Fora de escopo

- Mínimo configurável por sala ou via env (YAGNI).
- Mudanças de protocolo Socket.io — nenhum evento novo; só validação e texto de UI.

## Verificação

- `npm run typecheck` limpo.
- Manual (não há testes automatizados no projeto): com menos de 3 alunos prontos o botão do professor fica desabilitado mostrando `Esperando alunos... (X/3)`; emitir `startMatch` direto via socket com 1–2 alunos não inicia a partida; com 3 alunos prontos a partida inicia normalmente.

## Observação de desenvolvimento

Testar localmente passa a exigir 4 clientes. Se atrapalhar o dev, baixar a constante temporariamente em `shared/gameRules.ts` durante o teste.
