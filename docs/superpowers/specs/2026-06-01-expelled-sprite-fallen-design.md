# Spec: Sprite do jogador expulso fica caído com transparência

## Problema

Quando o survivor transita de `downed → expelled`, o evento `playerExpelled` seta `this.downed = false` no cliente. Isso faz o bloco de animação do `inputFrozen` tocar `idle` em vez de manter o frame caído.

## Solução

**Arquivo:** `src/scenes/GameScene.ts`, handler `playerExpelled`, branch `id === s.id`

1. **Remover** `this.downed = false` — mantém `downed = true` para que o bloco de animação do `inputFrozen` (linha ~812) continue exibindo o frame caído via `applyDownedFrameById`.
2. **Adicionar** `this.player.setAlpha(0.25)` — mesma transparência aplicada nos sprites remotos de expelled.

## Comportamento esperado

- Sprite do jogador local expelled: frame caído + alpha 0.25
- Sprite de outros jogadores expelled (visão dos outros): já correto — `players.setAlpha(id, 0.25)` + `isDowned = true` no `PlayerManager` preserva o frame caído

## Efeitos colaterais

Nenhum. Quando `expelled = true && inputFrozen = true`, o `update()` retorna cedo antes de qualquer lógica de interação ou movimento. Manter `downed = true` localmente não afeta o estado do servidor nem outros sistemas.
