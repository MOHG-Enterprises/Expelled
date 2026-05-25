# Design: Jogador sendo curado não pode realizar ações

**Data:** 2026-05-23

## Problema

Dois jogadores machucados que pressionam E um em cima do outro ao mesmo tempo conseguem se curar mutuamente. Isso quebra o balanceamento do tempo de cura, pois ambos se beneficiam sem nenhum custo de oportunidade.

**Causa raiz:** O handler `setHealing` no servidor não verifica se o próprio curador está com `beingHealed = true`. O cliente também não usa o parâmetro `beingHealed` para bloquear o caminho de cura em `HackingSystem.updateSelf`.

## Solução

Bloquear ações de cura (curar outros) quando o jogador está sendo curado. O bloqueio é aplicado em dois lugares: servidor (autoritativo) e cliente (UX).

## Mudanças

### `server/index.ts` — handler `setHealing`

Após a validação existente do healer (~linha 255), adicionar:

```ts
if (healer.beingHealed) return;
```

Impede que o jogador sendo curado registre um alvo no `roomHealingMap`.

### `server/index.ts` — handler `healProgress`

Após a validação do healer (~linha 287), adicionar:

```ts
if (!isSelf && healer.beingHealed) return;
```

O guard `!isSelf` preserva a auto-cura passiva do jogador caído (`isSelf = true`), que não deve ser afetada.

### `src/game/HackingSystem.ts` — `updateSelf`, linha 126

Alterar a condição de busca do alvo de cura:

```ts
// antes
const healTarget = eHeld && !downed ? this._nearestHealablePlayer(survivorInfo) : null;

// depois
const healTarget = eHeld && !downed && !beingHealed ? this._nearestHealablePlayer(survivorInfo) : null;
```

O parâmetro `beingHealed` já existe na assinatura do método; apenas não era usado neste caminho.

## Comportamento após a mudança

| Situação | Antes | Depois |
|---|---|---|
| A e B machucados pressionam E mutuamente | Ambos se curam | Apenas o primeiro `setHealing` é aceito; o segundo é rejeitado |
| Jogador sendo curado tenta curar outro | Consegue iniciar cura paralela | Bloqueado no cliente e no servidor |
| Jogador caído se auto-curando passivamente | Funciona | Continua funcionando (guard `!isSelf`) |
| Hacking enquanto sendo curado | Já bloqueado em `server/systems/hacking.ts` | Sem mudança |
| Curador se afasta → `beingHealed` vai a `false` | — | Jogador pode agir normalmente |

## Arquivos modificados

- `server/index.ts` — 2 guards adicionados
- `src/game/HackingSystem.ts` — 1 condição alterada
