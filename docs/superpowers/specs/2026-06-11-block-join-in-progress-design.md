# Bloquear entrada em salas já em jogo

## Problema

O handler `joinRoom` no servidor só rejeita entrada por lotação (`MAX_PLAYERS_PER_ROOM`). Um jogador pode entrar numa sala cuja `phase` é `'playing'` ou `'ended'`, caindo num estado quebrado (partida em andamento ou tela de pós-jogo).

## Design

Validação autoritativa no servidor, com reforço visual no cliente.

### Servidor (`server/index.ts`, handler `joinRoom`)

Antes da checagem de lotação: se a sala existe, `phase !== 'lobby'` e ainda há jogadores nela, emitir `joinRejected { reason: 'inProgress' }` e retornar. A condição de "ainda há jogadores" preserva o comportamento do `getOrCreateRoom`, que recria salas `'ended'` esvaziadas como lobby novo.

### Cliente (`src/scenes/LobbyScene.ts`)

1. Guardar as phases recebidas via `roomList` em `roomPhases: Record<string, string>`.
2. `joinRoom(idx)` recusa localmente salas não-joináveis (cobre mouse e gamepad) mostrando a mensagem de erro, sem emitir nada.
3. Handler `joinRejected` passa a tratar `reason: 'inProgress'` com a mensagem "Sala em andamento! Escolha outra." — mesmo fluxo de reset do caso `'full'`.
4. Botões de salas não-joináveis ficam escurecidos (fundo cinza + alpha reduzido) e sem highlight de hover. O label já mostra `[em jogo]` / `[encerrada]`.

A autoridade é sempre do servidor; o bloqueio no cliente é só UX (a phase local pode estar defasada entre broadcasts de `roomList`).
