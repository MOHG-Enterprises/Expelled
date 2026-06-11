# Tutorial mínimo (Aluno + Professor)

**Data:** 2026-06-11

## Objetivo

Dar ao jogador novo uma explicação mínima das mecânicas antes de entrar no lobby, sem atrasar quem já conhece o jogo.

## Fluxo

`StartScene` → **`TutorialScene`** (nova) → `LobbyScene`.

A `TutorialScene` abre numa tela de pergunta:

> **Já jogou Expelled antes?**
> - **Sim, ir pro lobby** → `scene.start('LobbyScene')` imediatamente
> - **Não, ver o tutorial** → entra na página 1

Sem persistência (localStorage): a pergunta aparece toda sessão — é um clique só.

## Páginas

Navegação por botões **◀ / ▶** e botão **"Pular tutorial"** sempre visível (vai pro lobby). Na última página, **▶** vira **"Jogar"** → `LobbyScene`.

### Página 1 — Aluno: objetivo e controles

- Imagens: ícone do personagem aluno + sprite do terminal (`computer-terminal-sheet`, asset existente em `public/`).
- Texto:
  - Objetivo: hackear os terminais segurando **E** e fugir pelo portão.
  - **WASD / Setas** — mover; **SHIFT** — correr (gasta estamina).
  - Se for derrubado e levado à detenção: acerte **3 skill checks** para escapar.

### Página 2 — Aluno: skill check de demonstração

- Instância real de `SkillCheck` (`src/game/SkillCheck.ts` — construtor recebe só a cena, é reutilizável) rodando em loop.
- Jogador aperta **SPACE** quando a agulha estiver na zona.
- Feedback textual: "Ótimo! (+bônus de progresso)" / "Acertou" / "Errou — o terminal regrediria 15%".
- Após ~1 s do resultado, o skill check reinicia. Treino ilimitado enquanto o jogador estiver na página; ao sair da página o check é escondido.

### Página 3 — Professor: objetivo e controles

- Imagem: ícone de um killer (ex.: Boi — `boi-icon`, asset já usado no lobby).
- Texto:
  - Objetivo: expulsar todos os alunos antes que fujam.
  - **SPACE** — atacar (tem cooldown).
  - Você enxerga pelo cone da lanterna e ouve as vozes dos alunos dentro dele.

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/scenes/TutorialScene.ts` | **novo** — cena com pergunta inicial + 3 páginas + demo do skill check |
| `src/scenes/StartScene.ts` | `scene.start('LobbyScene')` → `scene.start('TutorialScene')` (1 linha) |
| `src/main.ts` | registrar `TutorialScene` na lista de cenas, entre `StartScene` e `LobbyScene` |

Os assets usados pela cena (ícones de personagem, spritesheet do terminal) são carregados no `preload()` da própria `TutorialScene` — não dá para depender do `preload` de outras cenas, pois a TutorialScene roda antes da GameScene.

Zero mudança no servidor; nenhum evento Socket.io novo.

## Detecção de dispositivo

A cena detecta o modo de input no `create()` e mostra só os controles relevantes em cada página:

- **gamepad** — se `this.input.gamepad.total > 0` (analógico move, **A** interage, **X** ataca, **RB** corre);
- **touch** — se `navigator.maxTouchPoints > 0` (mesma detecção da GameScene; joystick + botões INTERAGIR/ATACAR/CORRER/TAP!);
- **teclado/mouse** — caso contrário.

Como a Gamepad API só expõe o controle após o primeiro botão pressionado, a cena também escuta `gamepad.once('connected')` e atualiza os textos na hora.

A página do professor explica o ataque completo: SPACE / clique esquerdo / X / botão ATACAR; apertar e soltar = ataque curto, segurar = lunge (avança com mais alcance).

A demo do skill check aceita SPACE, clique/toque (fora de botões) e qualquer botão do gamepad — espelhando o jogo, que aceita ataque ou interação durante o check.

## Fora de escopo (YAGNI)

- Persistência da escolha "já joguei" em localStorage.
- Tutorial interativo de movimento/jogável.
- Navegação das páginas por gamepad (os botões continuam por pointer/touch).
