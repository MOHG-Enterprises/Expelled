# Spawns aleatórios dos terminais (issue #15)

## Objetivo

Os 5 terminais devem surgir em posições sorteadas a cada partida, em vez das 5 posições fixas atuais, aumentando rejogabilidade e imprevisibilidade.

## Mecanismo

Mudança 100% server-side em `server/gameState.ts`:

1. **`TERMINAL_SPAWN_POOL: Vec2[]`** substitui o `TERMINAL_POSITIONS: Record<TerminalId, Vec2>` fixo. Pool com 12 posições em coordenadas de mundo:
   - As 5 atuais: `(2140, 2520)`, `(785, 86)`, `(848, 1830)`, `(780, 3720)`, `(1510, 1430)`
   - 7 novas, extraídas por análise do tilemap (tile de chão livre, encostado em parede/mobília, com bloco 2×2 andável adjacente, espalhadas por max-min distance): `(2960, 208)`, `(3376, 1680)`, `(2928, 3760)`, `(1872, 272)`, `(1872, 3696)`, `(1136, 2800)`, `(2480, 1296)`
2. **`randomTerminalPositions(): Record<TerminalId, Vec2>`** — embaralha uma cópia do pool com Fisher-Yates e mapeia os 5 primeiros para `t1`–`t5`. Sem restrição de espaçamento: o pool é esparso por construção (qualquer par fica a ≥ ~800 px), então qualquer subconjunto de 5 já sai espalhado.
3. **`freshGameState()`** passa a usar `terminalPositions: randomTerminalPositions()`. Como `freshGameState()` roda na criação da sala e em cada reset (`server/index.ts:494`), cada partida ganha um sorteio novo.

## Cliente

Zero mudanças. As posições já fluem pelo `gameState` → `TerminalManager.sync(terminals, positions)`, e os sprites são recriados no `create()` da `GameScene`. Os ids `t1`–`t5` continuam os mesmos; só as coordenadas variam.

## Riscos

As 7 posições novas vêm de análise estática do JSON do Tiled. A heurística reproduz o padrão das posições atuais, mas a validação final é visual, em jogo. Posição ruim se corrige trocando a coordenada no pool.

## Fora de escopo

- Issue #16 (dois terminais extras): entraria depois reaproveitando este pool (sortear 7 de 12), com mudança no tipo `TerminalId`.
- Espaçamento mínimo configurável (YAGNI, pool já esparso).
- Posições marcadas no Tiled via object layer (descartado no brainstorm; pool hardcoded é suficiente).

## Verificação

- `npm run typecheck` limpo.
- Iniciar partidas repetidas e observar terminais em posições diferentes a cada reset; HUD e hacking funcionando nos novos pontos.
