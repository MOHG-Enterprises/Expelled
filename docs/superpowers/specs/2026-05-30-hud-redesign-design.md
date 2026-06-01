# HUD Redesign — Design Spec

**Data:** 2026-05-30  
**Escopo:** Redesign completo do HUD do jogo, suporte a mobile (landscape, touch) e PC (teclado/mouse/gamepad)

---

## Contexto

O HUD atual tem posições fixas hardcodadas para 800×600, texto de hint genérico de uma linha, setas triangulares pequenas para terminais, e nenhum suporte a toque. O objetivo é torná-lo mais informativo, visualmente coeso e jogável em mobile landscape + PC.

---

## Plataformas e Detecção

O jogo usa `Phaser.Scale.FIT` com canvas 800×600 — o scale já cuida de adaptar ao tamanho da tela. A detecção de plataforma é feita em runtime:

- **`isTouchDevice`:** `navigator.maxTouchPoints > 0` avaliado em `GameScene.create()`
- **`isGamepad`:** já existente via `this.usingGamepad` no HUD

`HUD.build(isTouchDevice: boolean)` recebe o flag e monta layouts diferentes.

---

## Seção 1 — Layout & Posicionamento

### Layout Mobile (landscape, touch)

```
┌──────────────────────────────────────────────────────────┐
│ [CARDS compact]  [TERMINAL COUNT]  [ENDGAME TIMER]  [MIC]│  ← top strip
│                                                  [CHASE] │
│                                                          │
│                   área de jogo                           │
│                                                          │
│ [JOYSTICK]   [HACK BAR / HEAL BAR / ♥ TERROR]  [BTNS]  │  ← bottom strip
└──────────────────────────────────────────────────────────┘
```

- **Cards compactos (top-left):** 4 cards empilhados, 60×48px cada, retratos pequenos + borda de estado + nome truncado. Ficam acima do joystick.
- **Terminal count (top-center):** fonte 16px, ícone ⚡ maior.
- **Endgame timer (top-center, abaixo do terminal count):** barra 12px de altura, texto maior.
- **Mic + Chase (top-right):** ícone 🎤 maior, label `ATIVO`/`MUDO`/`SEM MIC`.
- **Joystick virtual (bottom-left):** centro ~(110, 490), base raio 80px, knob raio 32px, zona interativa 200×200px.
- **Botões de ação (bottom-right):** 2 círculos grandes (~52px raio), centralizados em ~(680, 490) e ~(755, 455).
- **Barras de hack/heal + terror heart (bottom-center):** mantêm posição ~(270–530, 470–490), sem sobreposição com joystick/botões.
- **Role badge:** removido.

### Layout PC (teclado/mouse/gamepad)

```
┌──────────────────────────────────────────────────────────┐
│ [CARDS normais]  [TERMINAL COUNT]  [ENDGAME TIMER] [MIC] │
│                                                  [CHASE] │
│                                                          │
│                   área de jogo                           │
│                                                          │
│ [HINT PANEL]          [HACK BAR / ♥]              [ATK] │
└──────────────────────────────────────────────────────────┘
```

- **Cards normais (top-left):** 78×76px, igual ao atual mas com melhorias de labels.
- **Hint panel (bottom-left):** painel com linhas `[tecla] — ação`, muda por role/estado/gamepad.
- Sem controles virtuais.

---

## Seção 2 — Controles Virtuais (TouchControlManager)

### Nova classe: `src/game/TouchControlManager.ts`

Responsável por todo input de toque — joystick e botões. Integra-se ao `InputManager` via objeto de estado compartilhado `TouchInputState`.

```typescript
interface TouchInputState {
  vx: number;
  vy: number;
  analogScale: number;
  actionHeld: boolean;
  actionJust: boolean;
  attackHeld: boolean;
  attackJust: boolean;
  attackJustUp: boolean;
  sprinting: boolean;
}
```

`InputManager.read()` faz merge: se `isTouchDevice && touchState.active`, sobrescreve os campos de movimento e ação com os valores do touch.

### Joystick Virtual

- Base: círculo semi-transparente fixo (raio 80px, alpha 0.3, cor branca)
- Knob: círculo menor (raio 32px, alpha 0.7)
- Knob segue o dedo limitado ao raio da base
- Produz `vx`/`vy` normalizados com deadzone 0.15
- Sprint: arrastar além de 80% do raio → `sprinting = true`
- Multi-touch: o dedo que iniciou o joystick é rastreado pelo `pointerId`

### Botões de Ação

Dois botões circulares com label + ícone desenhados via Graphics + Text.

| Papel | Botão 1 (menor, esq) | Botão 2 (maior, dir) |
|---|---|---|
| Sobrevivente | — | `INTERAGIR` (maps to E — hold) |
| Sobrevivente caído | — | `RESPONDER` (maps to SPACE — tap) |
| Professor | `REFORÇAR` (maps to E — hold) | `ATACAR` (maps to SPACE — hold/lunge) |

- Hold: enquanto dedo pressionado → `actionHeld`/`attackHeld = true` + `actionJust`/`attackJust = true` no primeiro frame
- Tap/release → `attackJustUp = true`
- Labels atualizam via `TouchControlManager.setRole(role, downed)`

### Ciclo de Vida

`TouchControlManager.build()` chamado em `HUD.build()` quando `isTouchDevice = true`.  
`TouchControlManager.destroy()` chamado em `GameScene.shutdown()`.

---

## Seção 3 — Pins de Terminal

Substituição das setas triangulares (`_drawArrowTriangle`) por pins estilo mapa com sprite do terminal.

### Forma do Pin

Pin desenhado via `Graphics` a cada frame. Orientado na direção do terminal (rotação via ângulo). Componentes:
- Cabeça circular (raio ~18px) com fundo colorido + borda
- Ponta triangular (12px) apontando na direção do terminal
- Imagem do terminal no centro (frame da spritesheet `computer-terminal-sheet`)

Como `Graphics` não embute imagens, cada terminal tem um `Phaser.GameObjects.Image` criado lazily na primeira vez que aparece na cena (via `terminalPinImages: Map<string, Phaser.GameObjects.Image>`), posicionado a cada frame para coincidir com o centro do pin. A imagem não rotaciona (mantém upright) — só o pin gráfico rotaciona.

### Estados do Pin

| Estado | Pin | Imagem central | Animação |
|---|---|---|---|
| Normal | Amarelo (`0xffcc00`) | Frame 0 (terminal ok) | Estático |
| Firewall alert | Vermelho (`0xff2200`) | Frame 0 | Pisca rápido (250ms) |
| Skill check miss | Vermelho (`0xff2200`) | Frame 8 (erro) | Pisca rápido (250ms) |
| Completo | Invisível | — | — |

### Implementação

- `terminalErrorArrows: Map<string, number>` — novo Map em `HUD` com timestamp de expiração do estado de erro (similar ao `loudNoiseArrows`)
- `terminalPinImages: Map<string, Phaser.GameObjects.Image>` — pool de imagens pré-alocadas
- `_drawTerminalPin(x, y, angle, state)` substitui `_drawArrowTriangle`
- `showLoudNoiseAlert` continua existindo mas agora também ativa `terminalErrorArrows`
- Novo método público `setTerminalError(terminalId, durationMs)` chamado pelo GameScene ao receber `firewallAlert`

### Arrows que permanecem triangulares (mas maiores)

- `updateDownedArrows` — triângulos laranja, size 16px (era 12px)
- `_drawHealAlertArrow` — triângulos vermelhos, size 22px (era 18px)

---

## Seção 4 — Redesign dos Elementos do HUD

### Survivor Cards

**Versão compacta (mobile, 60×48px):**
- Retrato pequeno (36×36px) + borda lateral de estado
- Nome truncado (máx 8 chars), fonte 9px
- Sem HP dots — estado comunicado pela cor da borda

**Versão normal (PC, 78×76px) — melhorias:**
- HP dots → corações: ❤ cheio (vermelho) / ♡ vazio (cinza escuro), mesmo raio 5px
- Label de estado sobre o retrato quando relevante: `DOWNED` (laranja), `EXPELLED` (cinza), `ESCAPED` (azul claro)
- Ícone de hack → mini barra de progresso horizontal (4px altura) na base do retrato, visível só quando hacking

### Hint Panel (PC only, bottom-left)

Painel com fundo semi-transparente, bordas arredondadas, linhas `[TECLA] — ação`:

```
┌──────────────────────┐
│ [E] Hackear / Fugir  │  ← sobrevivente normal
│ [SHIFT] Correr       │
│ [C] Microfone        │
└──────────────────────┘

┌─────────────────────────┐
│ [SPACE] Responder       │  ← sobrevivente caído
└─────────────────────────┘

┌─────────────────────────────────┐
│ [SPACE] Atacar  [E] Reforçar    │  ← professor
│ [SHIFT] Correr  [C] Microfone   │
└─────────────────────────────────┘
```

Labels trocam por gamepad: `[A]`, `[X]`, `[RB]`. Atualizam via `HUD.refreshHint()` existente — refatorado para popular o painel em vez de uma linha de texto.

### Down Count

Dois caracteres ⚠ (`Phaser.GameObjects.Text`) substituem os dots circulares atuais, fonte 12px. Ficam em (8, 32) no PC — acima dos cards normais. No mobile ficam abaixo dos cards compactos (posição ajustada conforme altura total dos 4 cards). Coloridos conforme quedas: 0 = ambos cinza escuro, 1 = um vermelho, 2 = ambos vermelhos.

### Terror Heart

Mantém posição bottom-center. Adiciona label `TERROR` abaixo (fonte 10px, mesma cor do coração). Ajuste de y para não sobrepor barras de hack/heal.

### Terminal Count

Movido para top-center. Fonte 16px (era 11px). Ícone ⚡ separado com cor própria.

### Mic State

Top-right. Ícone maior (14px). Labels: `MIC ATIVO` / `MUDO` / `SEM MIC`.

### Chase Indicator

Mantém top-right, badge 20px maior em ambas as dimensões.

### Endgame Timer

Barra sobe de 8px para 12px de altura. Texto de countdown aumenta de 12px para 15px.

---

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `src/game/HUD.ts` | Recebe `isTouchDevice` no `build()`, remove role badge, refatora hint para painel, adiciona terminal pin logic, ajusta posições e fontes |
| `src/game/hud/SurvivorCard.ts` | Aceita `compact: boolean` no construtor, HP dots → corações, label de estado, mini hack bar |
| `src/game/hud/ProgressBar.ts` | Sem mudanças |
| `src/game/TouchControlManager.ts` | **Novo arquivo** — joystick + botões de ação |
| `src/game/InputManager.ts` | Adiciona `mergeTouchState(state: TouchInputState)` chamado em `read()` |
| `src/scenes/GameScene.ts` | Detecta `isTouchDevice`, passa para `HUD.build()`, chama `TouchControlManager.setRole()` nos eventos de role/downed |

---

## Fora do Escopo

- Orientação portrait (landscape only)
- Mudança no tamanho/aspect ratio do canvas (permanece 800×600)
- Redesign das cenas de Lobby, PostGame ou Start
- Novos assets de sprite (usa frames existentes da `computer-terminal-sheet`)
