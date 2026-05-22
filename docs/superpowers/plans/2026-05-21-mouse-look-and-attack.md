# Mouse Look + Mouse Attack para o Professor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Para o professor sem gamepad, a câmera (cone de visão) aponta para o cursor do mouse e o clique esquerdo dispara o ataque.

**Architecture:** Mudança localizada em `GameScene.ts`. Dois grupos de alterações independentes: (1) look angle derivado da posição do mouse no espaço de mundo, substituindo a direção do movimento quando não há gamepad; (2) flags virtuais `mouseAttackJust`/`mouseAttackJustUp` alimentadas por listeners de pointer, consumidas em `_updateProfessorInteractions()`.

**Tech Stack:** Phaser 3, TypeScript — sem dependências novas.

---

## Arquivo modificado

- Modify: `src/scenes/GameScene.ts`

---

### Task 1: Declarar flags de mouse attack e zerá-las no reset

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Adicionar campos privados após `padAttackJustUp`**

Localizar (linha ~94):
```typescript
private padAttackJustUp  = false;
```
Inserir logo abaixo:
```typescript
private mouseAttackJust    = false;
private mouseAttackJustUp  = false;
```

- [ ] **Step 2: Zerar os campos em `resetLocalState()`**

Localizar em `resetLocalState()` (linha ~408):
```typescript
this.attackHoldStart = null;
```
Adicionar após essa linha (pode ser junto com o bloco de resets de ataque existente):
```typescript
this.mouseAttackJust    = false;
this.mouseAttackJustUp  = false;
```

- [ ] **Step 3: Verificar que o TypeScript compila sem erros**

```bash
npm run typecheck
```
Esperado: saída sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: declare mouseAttackJust/Up flags and reset them"
```

---

### Task 2: Registrar listeners de pointer em `create()`

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Adicionar listeners após o bloco de setup de gamepad**

Localizar em `create()` (logo após linha ~484, o bloco `gpPlugin?.on('disconnected', ...)`):
```typescript
    gpPlugin?.on('disconnected', () => {
      this.hud.setGamepadConnected(false);
    });
```
Inserir imediatamente após:
```typescript
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0 && this.myRole === 'professor') {
        this.mouseAttackJust = true;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0 && this.myRole === 'professor') {
        this.mouseAttackJustUp = true;
      }
    });
```

- [ ] **Step 2: Verificar que o TypeScript compila sem erros**

```bash
npm run typecheck
```
Esperado: saída sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: register pointer listeners for mouse attack flags"
```

---

### Task 3: Consumir flags em `_updateProfessorInteractions()` e limpar no frozen path

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Incluir `mouseAttackJust` na condição de início do hold**

Localizar em `_updateProfessorInteractions()` (linha ~829):
```typescript
    if ((Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust) && !this.isSwinging && !this.isKicking) {
      this.attackHoldStart = now;
    }
```
Substituir por:
```typescript
    if ((Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust || this.mouseAttackJust) && !this.isSwinging && !this.isKicking) {
      this.attackHoldStart = now;
    }
```

- [ ] **Step 2: Incluir `mouseAttackJustUp` na condição de disparo**

Localizar logo abaixo (linha ~846):
```typescript
    const spaceJustUp = Phaser.Input.Keyboard.JustUp(this.spaceKey);
    if ((spaceJustUp || this.padAttackJustUp) && this.attackHoldStart !== null && !this.isSwinging) {
      const heldMs = now - this.attackHoldStart;
      this._fireAttack(heldMs >= LUNGE_THRESHOLD_MS);
    }
```
Substituir por:
```typescript
    const spaceJustUp = Phaser.Input.Keyboard.JustUp(this.spaceKey);
    if ((spaceJustUp || this.padAttackJustUp || this.mouseAttackJustUp) && this.attackHoldStart !== null && !this.isSwinging) {
      const heldMs = now - this.attackHoldStart;
      this._fireAttack(heldMs >= LUNGE_THRESHOLD_MS);
    }
```

- [ ] **Step 3: Zerar flags no final de `_updateProfessorInteractions()`**

Ao final do método (antes do `}`), adicionar:
```typescript
    this.mouseAttackJust    = false;
    this.mouseAttackJustUp  = false;
```

- [ ] **Step 4: Zerar flags no bloco `inputFrozen` de `update()`**

Localizar o bloco frozen em `update()` — a linha com o `return` antecipado (linha ~943):
```typescript
      this.players.update(this.time.now);
      return;
```
Inserir imediatamente **antes** do `return`:
```typescript
      this.mouseAttackJust    = false;
      this.mouseAttackJustUp  = false;
```

- [ ] **Step 5: Verificar que o TypeScript compila sem erros**

```bash
npm run typecheck
```
Esperado: saída sem erros.

- [ ] **Step 6: Teste manual — clique esquerdo dispara ataque**

```bash
npm run dev
```
1. Conectar como professor (primeira conexão).
2. Clicar rapidamente (< `LUNGE_THRESHOLD_MS` = ver `src/constants.ts`) → quick attack com hitbox pequeno.
3. Segurar clique por mais tempo → lunge attack com hitbox maior.
4. Confirmar que survivors não conseguem atacar com clique.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: wire mouse attack flags into professor interactions"
```

---

### Task 4: Look angle guiado pelo mouse quando sem gamepad

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Adicionar bloco de mouse look após o bloco de movimento**

Localizar em `update()` (linha ~998, logo após o bloco que define `facingDirection`):
```typescript
    // gamepad stick direito define angulo de visao do professor
    if (this.myRole === 'professor' && pad) {
```
Inserir **imediatamente antes** desse bloco:
```typescript
    // mouse look — professor sem gamepad
    if (this.myRole === 'professor' && pad === null) {
      const pointer = this.input.activePointer;
      this.targetLookAngle = Math.atan2(
        pointer.worldY - this.player.y,
        pointer.worldX - this.player.x,
      );
    }
```

- [ ] **Step 2: Verificar que o TypeScript compila sem erros**

```bash
npm run typecheck
```
Esperado: saída sem erros.

- [ ] **Step 3: Teste manual — câmera segue o mouse**

```bash
npm run dev
```
1. Conectar como professor sem gamepad conectado.
2. Mover o mouse em volta do professor → o cone de visão deve apontar suavemente para o cursor, independente da direção do WASD.
3. Mover na diagonal com WASD enquanto aponta o mouse na direção oposta → o cone deve seguir o mouse.
4. Conectar gamepad → o comportamento deve voltar ao normal (stick esquerdo = movimento, stick direito = câmera).

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: professor flashlight follows mouse when no gamepad connected"
```
