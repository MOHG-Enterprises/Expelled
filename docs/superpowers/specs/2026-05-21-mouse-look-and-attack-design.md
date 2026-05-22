# Spec: Mouse Look + Mouse Attack para o Professor

**Data:** 2026-05-21  
**Arquivo afetado:** `src/scenes/GameScene.ts` (único)

---

## Contexto

O controle de gamepad já permite que o professor mire a lanterna independente da direção de movimento, usando o analógico direito. Este spec traz o equivalente para mouse+teclado: a câmera (cone de visão) do professor sempre aponta para o cursor do mouse, e o clique esquerdo dispara o ataque.

---

## Mudança 1: Look Angle guiado pelo mouse

### Comportamento atual

`targetLookAngle` é definido pela direção do movimento (WASD/setas). O gamepad pode sobrescrever com o analógico direito.

### Comportamento novo

- Se professor **e** sem gamepad conectado (`pad === null`): `targetLookAngle` é calculado a partir do ângulo entre a posição do player e a posição do mouse no espaço de mundo (`pointer.worldX`, `pointer.worldY`).
- Se gamepad conectado: comportamento atual mantido (stick esquerdo = movimento, stick direito = câmera).
- O `facingDirection` (usado nas animações) continua sendo definido pela direção do movimento — não muda.
- `smoothLookAngle` já suaviza a transição — sem alteração necessária.

### Localização no código

Em `update()`, após o bloco que define `targetLookAngle` pelo movimento (linha ~993) e **antes** do bloco do gamepad right stick (linha ~999):

```typescript
// Mouse look — professor sem gamepad
if (this.myRole === 'professor' && pad === null) {
  const pointer = this.input.activePointer;
  this.targetLookAngle = Math.atan2(
    pointer.worldY - this.player.y,
    pointer.worldX - this.player.x,
  );
}
```

---

## Mudança 2: Ataque com clique esquerdo

### Comportamento novo

Clique esquerdo do mouse replica o comportamento da barra de espaço para o professor:
- Pressionar (mousedown) = iniciar hold (equivalente a `padAttackJust`)
- Soltar (mouseup) = disparar ataque; clique curto = quick attack, segurado ≥ `LUNGE_THRESHOLD_MS` = lunge

### Implementação: flags virtuais

Dois campos booleanos novos (mesma estratégia do gamepad):

```typescript
private mouseAttackJust    = false;
private mouseAttackJustUp  = false;
```

Listeners registrados em `create()` (após o bloco de gamepad):

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

Em `_updateProfessorInteractions()`, as flags entram nas mesmas condições que `padAttackJust` / `padAttackJustUp`:

```typescript
// início do hold
if ((Phaser.Input.Keyboard.JustDown(this.spaceKey) || this.padAttackJust || this.mouseAttackJust) && !this.isSwinging && !this.isKicking) {
  this.attackHoldStart = now;
}

// disparo no release
const spaceJustUp = Phaser.Input.Keyboard.JustUp(this.spaceKey);
if ((spaceJustUp || this.padAttackJustUp || this.mouseAttackJustUp) && this.attackHoldStart !== null && !this.isSwinging) {
  const heldMs = now - this.attackHoldStart;
  this._fireAttack(heldMs >= LUNGE_THRESHOLD_MS);
}
```

Flags zeradas no final de `_updateProfessorInteractions()`:

```typescript
this.mouseAttackJust    = false;
this.mouseAttackJustUp  = false;
```

Também adicionar ao `resetLocalState()`:

```typescript
this.mouseAttackJust    = false;
this.mouseAttackJustUp  = false;
```

**Edge case — inputFrozen:** Eventos de pointer ocorrem antes do `update()`, então se o jogador clicar durante um freeze, a flag fica verdadeira e não é consumida (pois `_updateProfessorInteractions` não roda). Ao descongelar, o próximo frame dispararia um ataque involuntário. Solução: no bloco `inputFrozen` de `update()`, antes do `return`, zerar as flags:

```typescript
this.mouseAttackJust   = false;
this.mouseAttackJustUp = false;
```

---

## Scope

- Sem mudanças em `FogOfWar.ts`, `HUD.ts`, `server/`, ou qualquer outro arquivo.
- Sem novos eventos Socket.io.
- Compatível com o comportamento existente de gamepad.
