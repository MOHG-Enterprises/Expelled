# Damage Vignette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir cantos vermelhos piscando na tela quando o sobrevivente leva dano, com intensidade persistente baseada no HP.

**Architecture:** Um `Phaser.GameObjects.Graphics` fixo na tela (scrollFactor 0) com quatro triângulos vermelhos nos cantos é adicionado ao `HUD`. Dois métodos públicos controlam o estado: `setDamageVignette` atualiza o alpha base conforme HP/downed, `flashDamageVignette` dispara um tween de pulso de impacto. `GameScene` chama ambos nos eventos `playerHit` e `playerDowned`, e `setDamageVignette` sozinho em `playerRevived` e `playerHealed`.

**Tech Stack:** Phaser 3 Graphics, Phaser 3 Tweens, TypeScript

---

### Task 1: Adicionar vinheta ao HUD

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Adicionar campos privados à classe HUD**

Em `src/game/HUD.ts`, dentro da classe `HUD`, após a linha `private chaseIndicatorText!: Phaser.GameObjects.Text;` (linha ~51), adicionar:

```ts
private damageVignette!: Phaser.GameObjects.Graphics;
private vignetteTween:   Phaser.Tweens.Tween | null = null;
private vignetteAlpha    = 0;
```

- [ ] **Step 2: Criar a vinheta no método `build()`**

Ao final do método `build()`, antes da chamada `this._buildSurvivorCards()` (linha ~135), adicionar:

```ts
this.damageVignette = this.scene.add.graphics().setScrollFactor(0).setDepth(45).setAlpha(0);
this.damageVignette.fillStyle(0xff0000, 1);
this.damageVignette.fillTriangle(0, 0, 200, 0, 0, 200);
this.damageVignette.fillTriangle(800, 0, 600, 0, 800, 200);
this.damageVignette.fillTriangle(0, 600, 200, 600, 0, 400);
this.damageVignette.fillTriangle(800, 600, 600, 600, 800, 400);
```

- [ ] **Step 3: Implementar `setDamageVignette`**

Após o método `flash()` (linha ~352), adicionar:

```ts
setDamageVignette(hp: number, downed: boolean): void {
  this.vignetteTween?.stop();
  this.vignetteTween = null;
  if (downed)    this.vignetteAlpha = 0.55;
  else if (hp <= 1) this.vignetteAlpha = 0.38;
  else           this.vignetteAlpha = 0;
  this.damageVignette.setAlpha(this.vignetteAlpha);
}
```

- [ ] **Step 4: Implementar `flashDamageVignette`**

Logo após `setDamageVignette`, adicionar:

```ts
flashDamageVignette(): void {
  this.vignetteTween?.stop();
  const peak = Math.min(1, this.vignetteAlpha + 0.45);
  this.damageVignette.setAlpha(peak);
  this.vignetteTween = this.scene.tweens.add({
    targets:  this.damageVignette,
    alpha:    this.vignetteAlpha,
    duration: 430,
    ease:     'Quad.easeOut',
    onComplete: () => { this.vignetteTween = null; },
  });
}
```

- [ ] **Step 5: Verificar tipagem**

```bash
npm run typecheck
```

Esperado: zero erros relacionados a HUD.

---

### Task 2: Integrar no GameScene

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Adicionar chamadas no handler `playerHit`**

Em `src/scenes/GameScene.ts`, no handler `s.on('playerHit', ...)` (linha ~544), dentro do bloco `if (targetId === s.id)`, após a linha `this.hud.flash('Você foi atingido!', 0xff4444);`, adicionar:

```ts
this.hud.setDamageVignette(hp, false);
this.hud.flashDamageVignette();
```

O bloco completo deve ficar:

```ts
s.on('playerHit', ({ targetId, hp }: { targetId: string; hp: number }) => {
  if (targetId === s.id) {
    this.myHp = hp;
    this.hud.update(this.myRole, this.myHp, this.downed, this.myDownCount);
    this.hud.flash('Você foi atingido!', 0xff4444);
    this.hud.setDamageVignette(hp, false);
    this.hud.flashDamageVignette();
    if (!this.downed) this.onHitSprintTimer = ON_HIT_SPRINT_MS;
  }
```

- [ ] **Step 2: Adicionar chamadas no handler `playerDowned`**

No handler `s.on('playerDowned', ...)` (linha ~555), dentro do bloco `if (id === s.id)`, após a linha `this.hud.flash('Você foi derrubado!', 0xff4444);`, adicionar:

```ts
this.hud.setDamageVignette(0, true);
this.hud.flashDamageVignette();
```

- [ ] **Step 3: Limpar vinheta em `playerRevived`**

No handler `s.on('playerRevived', ...)` (linha ~593), dentro do bloco `if (id === s.id)`, após a linha `this.hud.flash('Revivido! Cuide-se.', 0x4fc3f7);`, adicionar:

```ts
this.hud.setDamageVignette(hp, false);
```

- [ ] **Step 4: Limpar vinheta em `playerHealed`**

No handler `s.on('playerHealed', ...)` (linha ~611), dentro do bloco `if (id === s.id)`, após a linha `this.hud.flash('Totalmente curado!', 0x4caf50);`, adicionar:

```ts
this.hud.setDamageVignette(hp, false);
```

- [ ] **Step 5: Verificar tipagem completa**

```bash
npm run typecheck
```

Esperado: zero erros.

- [ ] **Step 6: Testar manualmente**

```bash
npm run dev
```

1. Abrir dois navegadores/abas, entrar na mesma sala
2. Como sobrevivente, ser atingido pelo professor → cantos vermelhos piscam + persistem levemente se HP = 1
3. Ser atingido novamente (HP = 0, downed) → cantos mais intensos + flash
4. Ser revivido por outro jogador → cantos desaparecem
5. Ser curado completamente → cantos somem imediatamente sem flash
