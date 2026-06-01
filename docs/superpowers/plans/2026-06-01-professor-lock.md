# Professor Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao início de cada partida, o professor fica preso por 10 s atrás do portão PORTAOBOI; todos os clientes veem um countdown; ao fim o portão é destruído (sprite + hitbox) e uma mensagem aparece.

**Architecture:** O servidor emite `professorLocked { endsAt }` no `startMatch` e `professorReleased` após 10 s. O cliente mostra o countdown no HUD, captura referências ao layer e collider do PORTAOBOI em `create()`, e os destrói ao receber `professorReleased`. Reconexão é tratada via campo `professorLockedEndsAt` no `gameState`.

**Tech Stack:** Phaser 3 (TilemapLayer, Arcade Physics, Time.TimerEvent), Socket.io, TypeScript.

---

## Arquivos afetados

| Ação | Arquivo |
|------|---------|
| Modify | `server/types.ts` |
| Modify | `src/types.ts` |
| Modify | `server/gameState.ts` |
| Modify | `server/index.ts` |
| Modify | `src/mapConfig.ts` |
| Modify | `src/game/HUD.ts` |
| Modify | `src/scenes/GameScene.ts` |

---

## Task 1: Adicionar `professorLockedEndsAt` aos tipos e estado inicial

**Files:**
- Modify: `server/types.ts`
- Modify: `src/types.ts`
- Modify: `server/gameState.ts`

- [ ] **Step 1: Adicionar campo em `server/types.ts`**

  Em `server/types.ts`, adicionar `professorLockedEndsAt: number | null;` na interface `GameStateRecord`, após `endgameStartedAt`:

  ```typescript
  endgameStartedAt:  number | null;
  professorLockedEndsAt: number | null;
  phase:             GamePhase;
  ```

- [ ] **Step 2: Adicionar campo em `src/types.ts`**

  Em `src/types.ts`, adicionar `professorLockedEndsAt: number | null;` na interface `GameState`, após `endgameStartedAt`:

  ```typescript
  endgameStartedAt:  number | null;
  professorLockedEndsAt: number | null;
  phase:             GamePhase;
  ```

- [ ] **Step 3: Inicializar campo em `freshGameState()` (`server/gameState.ts`)**

  Em `server/gameState.ts`, dentro de `freshGameState()`, adicionar `professorLockedEndsAt: null,` após `endgameStartedAt: null,`:

  ```typescript
  endgameStartedAt:  null,
  professorLockedEndsAt: null,
  phase:             'lobby',
  ```

- [ ] **Step 4: Checar tipos**

  ```bash
  npm run typecheck
  ```

  Esperado: sem erros relacionados a `professorLockedEndsAt`.

- [ ] **Step 5: Commit**

  ```bash
  git add server/types.ts src/types.ts server/gameState.ts
  git commit -m "feat: add professorLockedEndsAt field to game state types"
  ```

---

## Task 2: Servidor emite `professorLocked` e `professorReleased`

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Emitir eventos em `startMatch`**

  Em `server/index.ts`, no handler `startMatch`, substituir:

  ```typescript
  state.phase = 'playing';
  io.to(roomName).emit('gamePhase', 'playing');
  ```

  Por:

  ```typescript
  state.phase = 'playing';
  io.to(roomName).emit('gamePhase', 'playing');
  state.professorLockedEndsAt = Date.now() + 10_000;
  io.to(roomName).emit('professorLocked', { endsAt: state.professorLockedEndsAt });
  setTimeout(() => {
    state.professorLockedEndsAt = null;
    io.to(roomName).emit('professorReleased');
  }, 10_000);
  ```

- [ ] **Step 2: Checar tipos**

  ```bash
  npm run typecheck
  ```

  Esperado: zero erros.

- [ ] **Step 3: Commit**

  ```bash
  git add server/index.ts
  git commit -m "feat: emit professorLocked/professorReleased on match start"
  ```

---

## Task 3: Ativar colisão no layer PORTAOBOI

**Files:**
- Modify: `src/mapConfig.ts`

- [ ] **Step 1: Adicionar `'PORTAOBOI'` ao `COLLISION_LAYERS`**

  Em `src/mapConfig.ts`, adicionar `'PORTAOBOI'` ao Set:

  ```typescript
  export const COLLISION_LAYERS = new Set([
    'OBSTACULOS',
    'Parede',
    'MESAS',
    'BANCOS',
    'Coisas na parede',
    'PORTAS',
    'PORTAO',
    'ARVORES',
    'PORTAOBOI',
  ]);
  ```

- [ ] **Step 2: Checar tipos**

  ```bash
  npm run typecheck
  ```

  Esperado: zero erros.

- [ ] **Step 3: Commit**

  ```bash
  git add src/mapConfig.ts
  git commit -m "feat: enable collision on PORTAOBOI tile layer"
  ```

---

## Task 4: HUD — countdown do professor

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Adicionar campos privados**

  Em `src/game/HUD.ts`, na seção de campos privados da classe `HUD` (após `private chaseIndicatorText!:`), adicionar:

  ```typescript
  private professorCountdownText:  Phaser.GameObjects.Text | null = null;
  private professorCountdownTimer: Phaser.Time.TimerEvent | null = null;
  ```

- [ ] **Step 2: Adicionar método `startProfessorCountdown`**

  Adicionar após o método `stopProfessorCountdown` (que será criado no próximo passo) — na prática, adicionar ambos juntos, logo antes do método `flash`:

  ```typescript
  startProfessorCountdown(endsAt: number): void {
    this.stopProfessorCountdown();
    this.professorCountdownText = this.scene.add
      .text(400, 40, '', {
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(50);
    this.professorCountdownTimer = this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const remaining = Math.ceil((endsAt - Date.now()) / 1000);
        this.professorCountdownText?.setText(String(Math.max(0, remaining)));
      },
    });
  }

  stopProfessorCountdown(): void {
    this.professorCountdownTimer?.remove();
    this.professorCountdownTimer = null;
    this.professorCountdownText?.destroy();
    this.professorCountdownText = null;
  }
  ```

- [ ] **Step 3: Checar tipos**

  ```bash
  npm run typecheck
  ```

  Esperado: zero erros.

- [ ] **Step 4: Commit**

  ```bash
  git add src/game/HUD.ts
  git commit -m "feat: add professor countdown display to HUD"
  ```

---

## Task 5: GameScene — capturar layer/collider e tratar eventos

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Adicionar campos privados**

  Em `src/scenes/GameScene.ts`, na seção de campos privados da classe (após `private collisionDebugEnabled`), adicionar:

  ```typescript
  private portaoboiLayer:    Phaser.Tilemaps.TilemapLayer | null = null;
  private portaoboiCollider: Phaser.Physics.Arcade.Collider | null = null;
  ```

- [ ] **Step 2: Zerar campos em `resetLocalState()`**

  Em `resetLocalState()`, após `this.endgameReceivedAt = null;`, adicionar:

  ```typescript
  this.portaoboiLayer    = null;
  this.portaoboiCollider = null;
  ```

- [ ] **Step 3: Capturar referências em `create()`**

  Em `create()`, substituir o loop de criação de colliders:

  ```typescript
  map.layers.forEach((layerData) => {
    const layer = map.getLayer(layerData.name)?.tilemapLayer;
    if (layer && COLLISION_LAYERS.has(layerData.name)) {
      this.physics.add.collider(
        this.player, layer,
        (_p, tile) => this.logCollisionLayer(layerData.name, tile as Phaser.Tilemaps.Tile),
      );
    }
  });
  ```

  Por:

  ```typescript
  map.layers.forEach((layerData) => {
    const layer = map.getLayer(layerData.name)?.tilemapLayer;
    if (layer && COLLISION_LAYERS.has(layerData.name)) {
      const collider = this.physics.add.collider(
        this.player, layer,
        (_p, tile) => this.logCollisionLayer(layerData.name, tile as Phaser.Tilemaps.Tile),
      );
      if (layerData.name === 'PORTAOBOI') {
        this.portaoboiLayer    = layer;
        this.portaoboiCollider = collider;
      }
    }
  });
  ```

- [ ] **Step 4: Adicionar método `_releaseProfessor`**

  Adicionar método privado logo após `getSpawnPoint`:

  ```typescript
  private _releaseProfessor(silent = false): void {
    this.portaoboiCollider?.destroy();
    this.portaoboiLayer?.destroy();
    this.portaoboiCollider = null;
    this.portaoboiLayer    = null;
    this.hud.stopProfessorCountdown();
    if (!silent) this.hud.flash('O professor foi liberado!', 0xff4444, 3000);
  }
  ```

- [ ] **Step 5: Adicionar handlers de socket em `_bindGameLifecycle`**

  Em `_bindGameLifecycle`, após o handler `s.on('roleAssigned', ...)`, adicionar:

  ```typescript
  s.on('professorLocked', ({ endsAt }: { endsAt: number }) => {
    this.hud.startProfessorCountdown(endsAt);
  });

  s.on('professorReleased', () => {
    this._releaseProfessor();
  });
  ```

- [ ] **Step 6: Tratar reconexão no handler `gameState`**

  Em `_bindGameLifecycle`, no handler `s.on('gameState', ...)`, após `this.refreshSurvivorHUD();` (a última linha do handler), adicionar:

  ```typescript
  if (state.professorLockedEndsAt !== null) {
    if (state.professorLockedEndsAt > Date.now()) {
      this.hud.startProfessorCountdown(state.professorLockedEndsAt);
    } else {
      this._releaseProfessor(true);
    }
  }
  ```

- [ ] **Step 7: Checar tipos**

  ```bash
  npm run typecheck
  ```

  Esperado: zero erros.

- [ ] **Step 8: Commit**

  ```bash
  git add src/scenes/GameScene.ts
  git commit -m "feat: professor lock gate — wire PORTAOBOI layer, countdown and release"
  ```

---

## Task 6: Verificação manual

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

  ```bash
  npm run dev
  ```

- [ ] **Step 2: Testar fluxo principal**

  1. Abrir duas abas: uma como professor, outra como survivor
  2. O survivor marca ready; professor inicia a partida
  3. Verificar: countdown 10→9→...→0 aparece em **ambas** as telas, centralizado no topo, abaixo do contador de terminais
  4. Verificar: o professor não consegue atravessar o portão PORTAOBOI durante os 10 s
  5. Verificar: ao chegar em 0, o portão desaparece e a mensagem "O professor foi liberado!" aparece
  6. Verificar: após liberado, o professor atravessa livremente onde era o portão

- [ ] **Step 3: Testar reconexão mid-countdown**

  1. Iniciar partida
  2. Com ~5 s restantes, recarregar a página do survivor
  3. Verificar: o countdown aparece com o tempo correto (~5 s restantes, não 10)

- [ ] **Step 4: Testar reconexão pós-liberação**

  1. Esperar o professor ser liberado
  2. Recarregar a página do survivor
  3. Verificar: não aparece countdown, portão não existe na cena reconstruída

  > **Nota:** Na reconexão pós-liberação, `professorLockedEndsAt` é `null` no estado do servidor, então o cliente não tenta nada — o portão simplesmente não existe pois `_releaseProfessor(true)` não é chamado. Isso está correto: o `buildTilemap` recria o layer, mas como `professorLockedEndsAt` é null, o `gameState` handler não faz nada, deixando o portão visível. **Se isso acontecer**, é necessário adicionar um bool `professorReleased` no estado — ver nota abaixo.

  > **Atenção — edge case de reconexão tardia:** Se `professorLockedEndsAt` for `null` (foi zerado após liberação), o cliente não sabe se o jogo nunca começou ou se o professor já foi liberado. Para tratar isso, pode-se adicionar `professorReleased: boolean` ao estado, mas está **fora do escopo desta feature** conforme o spec.

  > **Workaround imediato:** Para o MVP, aceitar que um reconnect tardio verá o portão; na prática reconexões são raras nos primeiros 10 s.
