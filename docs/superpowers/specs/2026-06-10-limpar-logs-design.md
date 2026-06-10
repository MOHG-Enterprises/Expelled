# Limpar os logs (issue #63)

## Objetivo

Remover os logs de debug do cliente — incluindo a instrumentação de diagnóstico de lag que só existe para alimentá-los — mantendo os logs operacionais e de erro do servidor.

## Remover (cliente)

### `src/scenes/GameScene.ts`

1. **Linha 144** — `console.log(this.player.x, this.player.y)` dentro de `toggleCollisionDebug()`. Só a linha; o toggle continua funcionando.
2. **Método `logCollisionLayer` (linhas 176-182), campo `lastCollisionLogAt` e o callback do collider (linha 294)** — o log `[collision]` dispara em toda colisão mesmo com o debug desligado. O collider físico permanece; apenas o callback de log sai. Sem o callback, o método e o campo viram código morto e saem juntos.
3. **Linhas 348-361** — instrumentação de lag em `create()`: handlers `prerender`/`postrender` com warn `[render-slow]` e `setInterval` de heartbeat com warn `[hb-miss]`. Remover os dois blocos inteiros.
4. **Linha 828** — warn `[spike]` no início de `update()`.
5. **Linhas 829, 980-986** — variáveis `_dbgT0`, `_dbgPreFog`, `_dbgFog`, `_dbgPlayers` e o warn `[slow]`. As chamadas reais (`fog.update`, `players.update`, `scratchMarks.update`) permanecem intactas.
6. **Linhas 1011-1017** — variáveis `_dbgHackT`, `_dbgHackDt` e o warn `[slow:hack]`. A chamada `hacking.updateSelf(...)` permanece intacta.
7. **Linha 578** — log `[hack] terminalUpdate` no handler de `terminalUpdate`.

### `src/game/VoiceManager.ts`

8. **Linhas 29, 60, 168** — logs de timing `[voice]`. Se a linha 168 usar variável de timing (`audioT0`) que só existe para o log, remover junto.

## Manter (servidor)

- `server/index.ts:111, 465, 513` — conectou/desconectou/servidor rodando (logs operacionais).
- `server/index.ts:515` e `server/voiceRouter.ts:41, 151, 184` — `console.error` de falhas reais.
- `server/voiceRouter.ts:44` — pid do worker mediasoup no startup.

## Fora de escopo

- Flag de `DEBUG` para reativar logs (YAGNI — a instrumentação era temporária para diagnóstico de lag).
- O sistema visual de debug de colisão (`toggleCollisionDebug`, Shift+F5) permanece — é a issue #62, separada.

## Verificação

- `npm run typecheck` limpo (pega variáveis `_dbg*` órfãs, pois o projeto não permite unused com `noUnusedLocals` — se não pegar, conferir manualmente que nenhuma variável ficou sem uso).
- `grep -rn "console\." src --include="*.ts"` deve retornar zero ocorrências.
- Jogo abre e roda normalmente (fog, players, hacking seguem chamados no mesmo lugar).
