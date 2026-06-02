# Interaction Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o hold-E por um toggle — apertar E uma vez ativa a interação, qualquer input de movimento a cancela; mover durante skill check conta como falha em vez de congelar o survivor.

**Architecture:** Toda a mudança vive em `HackingSystem` (flag `interactionActive`) e `GameScene` (mover o trigger do skill check para fora do bloco `inputFrozen`). `SkillCheck.cancel()` já existe. `setInputFrozen` deixa de ser chamado pelo HackingSystem e pode ser removido.

**Tech Stack:** Phaser 3, TypeScript, Vite

---

## File Map

| Arquivo | O que muda |
|---|---|
| `src/scenes/GameScene.ts` | Move `skillCheck.tryHit()` para fora do bloco `inputFrozen`; remove argumento `setInputFrozen` do construtor do HackingSystem |
| `src/game/HackingSystem.ts` | Remove `setInputFrozen` (campo, parâmetro, chamadas); adiciona `interactionActive`; adiciona lógica de toggle em `updateSelf`; substitui `eHeld` por `interactionActive`; atualiza `reset()` |

---

## Task 1: GameScene — mover skill check hit para fora do freeze

**Files:**
- Modify: `src/scenes/GameScene.ts:791-796`

O bloco atual dentro de `if (this.inputFrozen)` na linha ~792:

```ts
if (this.inputFrozen) {
  this.promptManager.hide();
  if (this.skillCheck.active && (input.attackJust || input.actionJust)) {
    this.skillCheck.tryHit();
  }
```

- [ ] **Step 1: Mover tryHit para antes do bloco inputFrozen**

Em `src/scenes/GameScene.ts`, localizar (logo após `if (input.cJustDown) this.toggleCollisionDebug();`):

```ts
    if (this.inputFrozen) {
      this.promptManager.hide();
      if (this.skillCheck.active && (input.attackJust || input.actionJust)) {
        this.skillCheck.tryHit();
      }
```

Substituir por:

```ts
    if (this.skillCheck.active && (input.attackJust || input.actionJust)) {
      this.skillCheck.tryHit();
    }

    if (this.inputFrozen) {
      this.promptManager.hide();
```

- [ ] **Step 2: Verificar typecheck**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 3: Verificar comportamento no browser**

```bash
npm run dev
```

Abrir o jogo, hackear um terminal, deixar o skill check aparecer e pressionar SPACE — deve acertar normalmente. Pressionar E durante o skill check — também deve acertar. Comportamento idêntico ao anterior para este caso.

---

## Task 2: HackingSystem — remover setInputFrozen

**Files:**
- Modify: `src/game/HackingSystem.ts`
- Modify: `src/scenes/GameScene.ts:300-307`

`setInputFrozen` é passado do GameScene para o HackingSystem e chamado nos dois métodos de skill check. Com o survivor não sendo mais congelado durante skill checks, esse mecanismo pode ser removido por completo.

- [ ] **Step 1: Remover campo e parâmetro em HackingSystem**

Em `src/game/HackingSystem.ts`, remover a linha do campo:

```ts
  private setInputFrozen: (frozen: boolean) => void;
```

Remover o parâmetro do construtor:

```ts
  constructor(
    scene:          Phaser.Scene,
    player:         Phaser.Physics.Arcade.Sprite,
    socket:         Socket,
    terminals:      TerminalManager,
    gates:          ExitGateManager,
    players:        PlayerManager,
    hud:            HUD,
    skillCheck:     SkillCheck,
    setInputFrozen: (frozen: boolean) => void,
    promptManager:  InteractionPromptManager,
  ) {
```

Ficará:

```ts
  constructor(
    scene:          Phaser.Scene,
    player:         Phaser.Physics.Arcade.Sprite,
    socket:         Socket,
    terminals:      TerminalManager,
    gates:          ExitGateManager,
    players:        PlayerManager,
    hud:            HUD,
    skillCheck:     SkillCheck,
    promptManager:  InteractionPromptManager,
  ) {
```

Remover também a atribuição dentro do construtor:

```ts
    this.setInputFrozen = setInputFrozen;
```

- [ ] **Step 2: Remover chamadas de setInputFrozen em _runHackSkillCheck**

```ts
  private _runHackSkillCheck(terminalId: TerminalId) {
    this.setInputFrozen(true);
    this.skillCheck.show(
      (isGreat) => {
        this.setInputFrozen(false);
        if (isGreat) this.socket.emit('hackProgress', { terminalId, amount: HACK_GREAT_BONUS });
      },
      () => {
        this.setInputFrozen(false);
        this.socket.emit('skillCheckFailed', { terminalId });
      },
    );
  }
```

Substituir por:

```ts
  private _runHackSkillCheck(terminalId: TerminalId) {
    this.skillCheck.show(
      (isGreat) => {
        if (isGreat) this.socket.emit('hackProgress', { terminalId, amount: HACK_GREAT_BONUS });
      },
      () => {
        this.socket.emit('skillCheckFailed', { terminalId });
      },
    );
  }
```

- [ ] **Step 3: Remover chamadas de setInputFrozen em _runHealSkillCheck**

```ts
  private _runHealSkillCheck(targetId: string, isSelf: boolean) {
    this.setInputFrozen(true);
    this.skillCheck.show(
      (isGreat) => {
        this.setInputFrozen(false);
        if (isGreat) {
          const bonus = isSelf ? HEAL_GREAT_BONUS * HEAL_SELF_RATE_FACTOR : HEAL_GREAT_BONUS;
          this.socket.emit('healProgress', { targetId, amount: bonus });
        }
      },
      () => {
        this.setInputFrozen(false);
        this.socket.emit('healSkillCheckFailed', { targetId });
        this.healLockUntil = this.scene.time.now + HEAL_FAIL_LOCK_MS;
      },
    );
  }
```

Substituir por:

```ts
  private _runHealSkillCheck(targetId: string, isSelf: boolean) {
    this.skillCheck.show(
      (isGreat) => {
        if (isGreat) {
          const bonus = isSelf ? HEAL_GREAT_BONUS * HEAL_SELF_RATE_FACTOR : HEAL_GREAT_BONUS;
          this.socket.emit('healProgress', { targetId, amount: bonus });
        }
      },
      () => {
        this.socket.emit('healSkillCheckFailed', { targetId });
        this.healLockUntil = this.scene.time.now + HEAL_FAIL_LOCK_MS;
      },
    );
  }
```

- [ ] **Step 4: Remover argumento do construtor em GameScene**

Em `src/scenes/GameScene.ts`, localizar a criação do HackingSystem:

```ts
    this.hacking       = new HackingSystem(
      this, this.player, this.socket,
      this.terminals, this.gates, this.players,
      this.hud, this.skillCheck,
      (frozen) => { this.inputFrozen = frozen; },
      this.promptManager,
    );
```

Substituir por:

```ts
    this.hacking       = new HackingSystem(
      this, this.player, this.socket,
      this.terminals, this.gates, this.players,
      this.hud, this.skillCheck,
      this.promptManager,
    );
```

- [ ] **Step 5: Verificar typecheck**

```bash
npm run typecheck
```

Esperado: sem erros.

---

## Task 3: HackingSystem — adicionar flag interactionActive e toggle

**Files:**
- Modify: `src/game/HackingSystem.ts`

- [ ] **Step 1: Adicionar campo interactionActive à classe**

Logo após os campos existentes de hacking (após `private hackLockUntil = 0;`), adicionar:

```ts
  private interactionActive = false;
```

- [ ] **Step 2: Resetar interactionActive no método reset()**

Dentro de `reset()`, após `this.hackLockUntil = 0;`, adicionar:

```ts
    this.interactionActive     = false;
```

- [ ] **Step 3: Remover eHeld e adicionar lógica de toggle em updateSelf**

Em `updateSelf`, remover a primeira linha:

```ts
    const eHeld = input.actionHeld;
```

Em seguida, localizar o bloco que termina com a declaração de `nearS`:

```ts
    const nearS = !downed ? this.gates.getNearestActiveSwitch(this.player.x, this.player.y) : null;
```

Inserir o bloco de toggle **imediatamente após** essa linha (antes do bloco de prompt `if (healableNearby) {`):

```ts
    if (input.actionJust && (healableNearby || nearT || nearS) && !this.interactionActive) {
      this.interactionActive = true;
    }
    if (input.intendedToMove) {
      if (this.interactionActive && this.skillCheck.active) this.skillCheck.cancel();
      this.interactionActive = false;
    }
```

- [ ] **Step 4: Substituir eHeld por interactionActive na heal path**

Localizar:

```ts
    const healTarget = eHeld ? healableNearby : null;
```

Substituir por:

```ts
    const healTarget = this.interactionActive ? healableNearby : null;
```

- [ ] **Step 5: Substituir eHeld na condição de entrada do hack**

Localizar:

```ts
    if (eHeld && nearTerminal && !downed) {
```

Substituir por:

```ts
    if (this.interactionActive && nearTerminal && !downed) {
```

- [ ] **Step 6: Substituir eHeld na gate path**

Localizar dentro do loop de gates:

```ts
      if (eHeld) {
```

Substituir por:

```ts
      if (this.interactionActive) {
```

- [ ] **Step 7: Verificar typecheck**

```bash
npm run typecheck
```

Esperado: sem erros. Se houver erro referenciando `eHeld`, procurar qualquer uso restante com `grep -n "eHeld" src/game/HackingSystem.ts`.

- [ ] **Step 8: Testar no browser**

```bash
npm run dev
```

Verificar:

1. Survivor perto de terminal → apertar E uma vez → hacking começa (barra de progresso aparece)
2. Com hacking ativo → pressionar WASD → hacking para imediatamente (barra some)
3. Com hacking ativo → NÃO mover → hacking continua sem precisar segurar E
4. Skill check aparece → andar → skill check some + firewall alert (falha)
5. Skill check aparece → pressionar SPACE → acerta normalmente
6. Skill check aparece → pressionar E → também acerta (útil para mobile/gamepad)
7. Apertar E longe de terminal → nada acontece
