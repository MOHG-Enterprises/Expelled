# Design: Integração com a Feira de Jogos

## Contexto

A Feira de Jogos é uma plataforma de jogos que recompensa jogadores com "tijolinhos" ao terminar partidas. A autenticação é via Google OAuth 2.0 (Google One Tap), e o crédito é enviado via `POST /api/v2/credit` com um Bearer token.

## Arquitetura

A integração vive inteiramente no cliente, na `PostGameScene`. Nenhuma mudança no servidor é necessária.

Novas dependências: `axios` (chamada HTTP à Feira) e `@types/google.accounts` como devDependency (tipos para o SDK do Google).
Nova constante em `src/constants.ts`: `FEIRA_PRODUCT_ID` (ID do jogo cadastrado na Feira — **preencher após cadastro**).

Nova função pura em `src/game/rewards.ts`: recebe `PlayerStatSnapshot` + `winner` e retorna um breakdown itemizado com o total de tijolinhos. Isolada da UI — testável independentemente.

## Fórmula de Recompensa

### Survivors

| Critério | Valor |
|---|---|
| Participou (base) | 15 |
| Fugiu (`escaped`) | +45 |
| Não foi expulso (`downed`) | +15 |
| Foi expulso (`expelled`) | +5 |
| Hack contribuído | +0.3 × % (arredondado) |
| Curas dadas | +5 × n (sem cap) |

**Máximo teórico** (fugiu + 100% hack + 4 curas): ~110 tijolinhos

### Professor

| Critério | Valor |
|---|---|
| Participou (base) | 15 |
| Venceu | +80 |
| Perdeu | +10 |
| Expulsões | +15 × n |
| Derrubadas | +5 × n |
| Ataques acertados | +1 × n |

**Máximo teórico** (venceu + 3 expulsões + 5 derrubadas + 10 hits): ~180 tijolinhos

O professor intencionalmente tem teto mais alto por ser papel assimétrico (1 vs N).

## Fluxo na PostGameScene

1. `create()` renderiza o resultado e stats normalmente (comportamento atual preservado).
2. Logo abaixo das caixas de stats, renderiza o **breakdown de tijolinhos** calculado por `rewards.ts`. Apenas linhas com valor > 0 são exibidas.
3. `google.accounts.id.initialize()` é chamado com callback que executa o POST.
4. `google.accounts.id.prompt()` exibe o Google One Tap.
5. Enquanto aguarda autenticação e resposta da API, exibe "Enviando crédito..." inline.
6. Sucesso: exibe "✓ +N tijolinhos adicionados!"; Erro: exibe mensagem de erro. Sem `alert()`.
7. Botão "Jogar de Novo" permanece disponível independente do estado da chamada.

## UI

```
[ resultado: FUGIU! / Ditador da Sala / etc ]

[ TERMINAIS: 73% ]  [ DERRUBADO: 1x ]  [ CURAS: 2 ]

──────────────────────────────────
  Terminais hackeados   +21 🧱
  Fugiu                 +45 🧱
  Participação          +15 🧱
  Curas dadas           +10 🧱
  ──────────────────────────────
  Total                 +91 🧱
──────────────────────────────────

  [ Google One Tap ]

  ● Enviando crédito...  →  ✓ +91 tijolinhos adicionados!

[ JOGAR DE NOVO ]
```

## Tratamento de Erros

- Sem microfone/câmera: não afeta — integração não depende de VoIP.
- Usuário recusa o One Tap: nenhuma ação, botão "Jogar de Novo" continua disponível.
- Erro na chamada à API: exibe mensagem inline, não bloqueia o jogador.
- `my` ausente (jogador sem stats): breakdown não renderiza, mas a cena funciona normalmente (comportamento atual preservado).

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `index.html` | Adicionar `<script src="https://accounts.google.com/gsi/client">` |
| `tsconfig.json` | Adicionar `"types": ["google.accounts"]` |
| `src/constants.ts` | Adicionar `FEIRA_PRODUCT_ID` |
| `src/game/rewards.ts` | Novo — fórmula de recompensa isolada |
| `src/scenes/PostGameScene.ts` | Renderizar breakdown + integração OAuth/API |
| `package.json` | Adicionar `axios` e `@types/google.accounts` (devDep) |
