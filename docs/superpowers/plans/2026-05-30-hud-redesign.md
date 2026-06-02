# HUD Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign completo do HUD com suporte a mobile (joystick virtual + botões), terminal pins com sprite, hint panel contextual, e atualizações visuais gerais — compatível com PC (teclado/gamepad) e mobile landscape (touch).

**Architecture:** Detecção de touch em `GameScene.create()` via `navigator.maxTouchPoints > 0`. HUD mantém dois layouts (mobile/PC) a partir do flag `isTouchDevice`. `TouchControlManager` (nova classe) gerencia joystick virtual e botões, expõe `readAndClear()` que `GameScene.update()` passa para `InputManager.read()`.

**Tech Stack:** Phaser 3, TypeScript, canvas 800×600 (FIT scaling), sem testes automatizados — verificação via `npm run typecheck` e teste manual com `npm run dev`.

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/game/InputManager.ts` | Modificar | Exportar `TouchInputState`, aceitar `isTouchDevice` no constructor, aceitar `touchState?` em `read()` |
| `src/game/TouchControlManager.ts` | **Criar** | Joystick virtual + botões de ação para touch |
| `src/game/hud/SurvivorCard.ts` | Modificar | Compact mode, corações, label de estado, indicador de hack |
| `src/game/HUD.ts` | Modificar | `build(isTouchDevice)`, terminal pins, hint panel, atualizações de elementos, remove role badge |
| `src/scenes/GameScene.ts` | Modificar | Detectar touch, instanciar `TouchControlManager`, atualizar calls de `build()` e `read()`, `setTerminalError` em firewallAlert |

---

## Task 1: TouchInputState + InputManager

**Files:**
- Modify: `src/game/InputManager.ts`

- [ ] **Step 1: Adicionar `TouchInputState` interface e atualizar constructor**

Substituir o início de `src/game/InputManager.ts` para adicionar a interface exportada e o param `isTouchDevice` no constructor:

```typescript
import Phaser from 'phaser';

export interface InputState {
  vx:              number;
  vy:              number;
  analogScale:     number;
  intendedToMove:  boolean;
  sprinting:       boolean;
  actionHeld:      boolean;
  attackHeld:      boolean;
  actionJust:      boolean;
  attackJust:      boolean;
  attackJustUp:    boolean;
  spaceJustDown:   boolean;
  spaceJustUp:     boolean;
  eJustDown:       boolean;
  cJustDown:       boolean;
  usingGamepad:    boolean;
}

export interface TouchInputState {
  active:       boolean;
  vx:           number;
  vy:           number;
  analogScale:  number;
  sprinting:    boolean;
  actionHeld:   boolean;
  actionJust:   boolean;
  attackHeld:   boolean;
  attackJust:   boolean;
  attackJustUp: boolean;
}
```

No constructor, trocar a assinatura e envolver os listeners de mouse num `if (!isTouchDevice)`:

```typescript
constructor(scene: Phaser.Scene, isTouchDevice = false) {
  this.cursors  = scene.input.keyboard!.createCursorKeys();
  this.wasd     = scene.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
  this.spaceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  this.eKey     = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  this.shiftKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  this.cKey     = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

  if (!isTouchDevice) {
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.mouseAttackJust = true;
    });
    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.mouseAttackJustUp = true;
    });
  }
}
```

- [ ] **Step 2: Atualizar `read()` para aceitar e mesclar `touchState`**

Trocar a assinatura de `read()` e adicionar o bloco de merge no final, antes do `return`:

```typescript
read(pad: Phaser.Input.Gamepad.Gamepad | null, touchState?: TouchInputState): InputState {
  // ... todo o código existente de leitura de pad e teclado permanece igual ...

  // --- novo bloco de merge de touch (adicionar antes do return existente) ---
  if (touchState?.active) {
    return {
      vx:             touchState.vx,
      vy:             touchState.vy,
      analogScale:    touchState.analogScale,
      intendedToMove: touchState.vx !== 0 || touchState.vy !== 0,
      sprinting:      touchState.sprinting,
      actionHeld:     touchState.actionHeld,
      attackHeld:     touchState.attackHeld,
      actionJust:     touchState.actionJust,
      attackJust:     touchState.attackJust,
      attackJustUp:   touchState.attackJustUp,
      spaceJustDown:  touchState.attackJust,
      spaceJustUp:    touchState.attackJustUp,
      eJustDown:      touchState.actionJust,
      cJustDown:      false,
      usingGamepad:   false,
    };
  }

  return {
    vx,
    vy,
    analogScale,
    intendedToMove: vx !== 0 || vy !== 0,
    sprinting:      this.shiftKey.isDown || sprintHeld,
    actionHeld:     this.eKey.isDown || actionHeld,
    attackHeld,
    actionJust:     eJustDown || actionJust,
    attackJust:     spaceJustDown || attackJust || mouseAJ,
    attackJustUp:   spaceJustUp || attackJustUp || mouseAJU,
    spaceJustDown,
    spaceJustUp,
    eJustDown,
    cJustDown,
    usingGamepad:   pad !== null,
  };
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/game/InputManager.ts
git commit -m "feat: export TouchInputState, accept isTouchDevice and touchState in InputManager"
```

---

## Task 2: TouchControlManager

**Files:**
- Create: `src/game/TouchControlManager.ts`

- [ ] **Step 1: Criar o arquivo com joystick + botões**

Criar `src/game/TouchControlManager.ts` com o conteúdo completo abaixo:

```typescript
import Phaser from 'phaser';
import type { Role } from '../types';
import type { TouchInputState } from './InputManager';

const BASE_CENTER = { x: 110, y: 490 };
const BASE_RADIUS = 80;
const KNOB_RADIUS = 32;
const BTN2_CENTER = { x: 740, y: 488 };
const BTN1_CENTER = { x: 668, y: 452 };
const BTN_RADIUS  = 44;

export class TouchControlManager {
  private scene: Phaser.Scene;

  private baseGfx!:  Phaser.GameObjects.Graphics;
  private knobGfx!:  Phaser.GameObjects.Graphics;
  private btn1Gfx!:  Phaser.GameObjects.Graphics;
  private btn2Gfx!:  Phaser.GameObjects.Graphics;
  private btn1Label!: Phaser.GameObjects.Text;
  private btn2Label!: Phaser.GameObjects.Text;

  private joystickPointerId: number | null = null;
  private btn1PointerId:     number | null = null;
  private btn2PointerId:     number | null = null;

  private currentRole:    Role | null = null;
  private currentDowned:  boolean     = false;

  private state: TouchInputState = {
    active: false, vx: 0, vy: 0, analogScale: 1, sprinting: false,
    actionHeld: false, actionJust: false,
    attackHeld: false, attackJust: false, attackJustUp: false,
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build(): void {
    this.scene.input.addPointer(2);

    this.baseGfx  = this.scene.add.graphics().setScrollFactor(0).setDepth(40);
    this.knobGfx  = this.scene.add.graphics().setScrollFactor(0).setDepth(41);
    this.btn1Gfx  = this.scene.add.graphics().setScrollFactor(0).setDepth(40);
    this.btn2Gfx  = this.scene.add.graphics().setScrollFactor(0).setDepth(40);

    this.btn1Label = this.scene.add
      .text(BTN1_CENTER.x, BTN1_CENTER.y, '', {
        fontSize: '11px', color: '#fff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2, align: 'center',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(41);

    this.btn2Label = this.scene.add
      .text(BTN2_CENTER.x, BTN2_CENTER.y, '', {
        fontSize: '11px', color: '#fff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2, align: 'center',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(41);

    this._drawBase();
    this._drawKnob(0, 0);
    this._drawButtons();
    this._registerEvents();
  }

  setRole(role: Role | null, downed: boolean): void {
    this.currentRole   = role;
    this.currentDowned = downed;
    this._drawButtons();
  }

  readAndClear(): TouchInputState {
    const snap = { ...this.state };
    this.state.actionJust   = false;
    this.state.attackJust   = false;
    this.state.attackJustUp = false;
    return snap;
  }

  destroy(): void {
    this.baseGfx.destroy();
    this.knobGfx.destroy();
    this.btn1Gfx.destroy();
    this.btn2Gfx.destroy();
    this.btn1Label.destroy();
    this.btn2Label.destroy();
  }

  private _drawBase(): void {
    this.baseGfx.clear();
    this.baseGfx.fillStyle(0xffffff, 0.08);
    this.baseGfx.fillCircle(BASE_CENTER.x, BASE_CENTER.y, BASE_RADIUS);
    this.baseGfx.lineStyle(2, 0xffffff, 0.25);
    this.baseGfx.strokeCircle(BASE_CENTER.x, BASE_CENTER.y, BASE_RADIUS);
  }

  private _drawKnob(dx: number, dy: number): void {
    const kx = BASE_CENTER.x + dx;
    const ky = BASE_CENTER.y + dy;
    this.knobGfx.clear();
    this.knobGfx.fillStyle(0xffffff, 0.45);
    this.knobGfx.fillCircle(kx, ky, KNOB_RADIUS);
    this.knobGfx.lineStyle(2, 0xffffff, 0.65);
    this.knobGfx.strokeCircle(kx, ky, KNOB_RADIUS);
  }

  private _drawButtons(): void {
    const isProfessor = this.currentRole === 'professor';

    let btn2Text = '';
    if (this.currentDowned)   btn2Text = 'RESPONDER';
    else if (isProfessor)     btn2Text = 'ATACAR';
    else                      btn2Text = 'INTERAGIR';

    const btn2Bg     = isProfessor ? 0x4a0f0f : 0x0f2a3a;
    const btn2Border = isProfessor ? 0xef5350 : 0x4fc3f7;

    this.btn2Gfx.clear();
    this.btn2Gfx.fillStyle(btn2Bg, 0.85);
    this.btn2Gfx.fillCircle(BTN2_CENTER.x, BTN2_CENTER.y, BTN_RADIUS);
    this.btn2Gfx.lineStyle(2.5, btn2Border, 0.9);
    this.btn2Gfx.strokeCircle(BTN2_CENTER.x, BTN2_CENTER.y, BTN_RADIUS);
    this.btn2Label.setText(btn2Text);

    this.btn1Gfx.clear();
    this.btn1Label.setAlpha(0);
    if (isProfessor) {
      this.btn1Gfx.fillStyle(0x0f3a1a, 0.85);
      this.btn1Gfx.fillCircle(BTN1_CENTER.x, BTN1_CENTER.y, BTN_RADIUS - 8);
      this.btn1Gfx.lineStyle(2, 0x4caf50, 0.9);
      this.btn1Gfx.strokeCircle(BTN1_CENTER.x, BTN1_CENTER.y, BTN_RADIUS - 8);
      this.btn1Label.setText('REFORÇAR').setAlpha(1);
    }
  }

  private _registerEvents(): void {
    const s = this.scene;
    s.input.on('pointerdown',   (p: Phaser.Input.Pointer) => this._onDown(p));
    s.input.on('pointermove',   (p: Phaser.Input.Pointer) => this._onMove(p));
    s.input.on('pointerup',     (p: Phaser.Input.Pointer) => this._onUp(p));
    s.input.on('pointercancel', (p: Phaser.Input.Pointer) => this._onUp(p));
  }

  private _onDown(p: Phaser.Input.Pointer): void {
    const { x, y } = p;

    if (
      this.joystickPointerId === null &&
      Phaser.Math.Distance.Between(x, y, BASE_CENTER.x, BASE_CENTER.y) <= BASE_RADIUS + 24
    ) {
      this.joystickPointerId = p.id;
      this.state.active      = true;
      this._moveKnob(x, y);
      return;
    }

    if (
      this.currentRole === 'professor' &&
      this.btn1PointerId === null &&
      Phaser.Math.Distance.Between(x, y, BTN1_CENTER.x, BTN1_CENTER.y) <= BTN_RADIUS
    ) {
      this.btn1PointerId    = p.id;
      this.state.active     = true;
      this.state.actionHeld = true;
      this.state.actionJust = true;
      return;
    }

    if (
      this.btn2PointerId === null &&
      Phaser.Math.Distance.Between(x, y, BTN2_CENTER.x, BTN2_CENTER.y) <= BTN_RADIUS
    ) {
      this.btn2PointerId = p.id;
      this.state.active  = true;
      if (this.currentRole === 'professor') {
        this.state.attackHeld = true;
        this.state.attackJust = true;
      } else {
        this.state.actionHeld = true;
        this.state.actionJust = true;
      }
    }
  }

  private _onMove(p: Phaser.Input.Pointer): void {
    if (p.id === this.joystickPointerId) this._moveKnob(p.x, p.y);
  }

  private _onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.state.vx = 0; this.state.vy = 0;
      this.state.analogScale = 1; this.state.sprinting = false;
      this._drawKnob(0, 0);
    }
    if (p.id === this.btn1PointerId) {
      this.btn1PointerId    = null;
      this.state.actionHeld = false;
    }
    if (p.id === this.btn2PointerId) {
      this.btn2PointerId = null;
      if (this.currentRole === 'professor') {
        this.state.attackHeld   = false;
        this.state.attackJustUp = true;
      } else {
        this.state.actionHeld = false;
      }
    }
    if (
      this.joystickPointerId === null &&
      this.btn1PointerId     === null &&
      this.btn2PointerId     === null
    ) {
      this.state.active = false;
    }
  }

  private _moveKnob(px: number, py: number): void {
    const dx    = px - BASE_CENTER.x;
    const dy    = py - BASE_CENTER.y;
    const dist  = Math.hypot(dx, dy);
    const clamp = Math.min(dist, BASE_RADIUS);
    const nx    = dist > 0 ? dx / dist : 0;
    const ny    = dist > 0 ? dy / dist : 0;
    const ratio = clamp / BASE_RADIUS;

    this.state.vx          = nx * ratio;
    this.state.vy          = ny * ratio;
    this.state.analogScale = ratio;
    this.state.sprinting   = ratio > 0.8;

    this._drawKnob(nx * clamp, ny * clamp);
  }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/game/TouchControlManager.ts
git commit -m "feat: add TouchControlManager with virtual joystick and action buttons"
```

---

## Task 3: SurvivorCard — compact mode, corações, estado, hack indicator

**Files:**
- Modify: `src/game/hud/SurvivorCard.ts`

- [ ] **Step 1: Adicionar compact mode e novos elementos**

Substituir o arquivo inteiro:

```typescript
import Phaser from 'phaser';

const CARD_X = 8;

interface CardSizes {
  w: number; h: number; portH: number;
}

const SIZES_NORMAL:  CardSizes = { w: 78, h: 76, portH: 44 };
const SIZES_COMPACT: CardSizes = { w: 60, h: 48, portH: 36 };

const STATE_BORDER: Record<string, number> = {
  healthy:  0x4caf50,
  injured:  0xffcc00,
  downed:   0xff9800,
  expelled: 0x444444,
  escaped:  0x4fc3f7,
};

const STATE_LABEL: Record<string, string> = {
  downed:   'DOWNED',
  expelled: 'EXPELLED',
  escaped:  'ESCAPED',
};

export class SurvivorCard {
  private scene:     Phaser.Scene;
  private baseColor: number;
  readonly cardY:    number;
  private compact:   boolean;
  private sz:        CardSizes;

  private bg:            Phaser.GameObjects.Graphics;
  private portrait:      Phaser.GameObjects.Graphics;
  private overlay:       Phaser.GameObjects.Graphics;
  private nameText:      Phaser.GameObjects.Text;
  private heart1:        Phaser.GameObjects.Text;
  private heart2:        Phaser.GameObjects.Text;
  private hackIndicator: Phaser.GameObjects.Graphics;
  private stateLabel:    Phaser.GameObjects.Text;
  private portImg:       Phaser.GameObjects.Image | null = null;
  private statusBars:    Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, cardY: number, baseColor: number, compact = false) {
    this.scene     = scene;
    this.cardY     = cardY;
    this.baseColor = baseColor;
    this.compact   = compact;
    this.sz        = compact ? SIZES_COMPACT : SIZES_NORMAL;

    const { w, h, portH } = this.sz;

    this.bg       = scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.portrait = scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.overlay  = scene.add.graphics().setScrollFactor(0).setDepth(32).setAlpha(0);

    this.nameText = scene.add
      .text(CARD_X + 8, cardY + portH + 5, '', {
        fontSize: compact ? '9px' : '10px',
        color: '#ddd', fontStyle: 'bold',
      })
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    this.heart1 = scene.add
      .text(CARD_X + w - 22, cardY + portH + 6, '♥', {
        fontSize: '11px', color: '#e53935',
      })
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    this.heart2 = scene.add
      .text(CARD_X + w - 12, cardY + portH + 6, '♥', {
        fontSize: '11px', color: '#e53935',
      })
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    this.stateLabel = scene.add
      .text(CARD_X + w / 2 + 2, cardY + portH / 2, '', {
        fontSize: '9px', color: '#fff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 3,
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(33).setAlpha(0);

    this.hackIndicator = scene.add.graphics().setScrollFactor(0).setDepth(33).setAlpha(0);
    this.statusBars    = scene.add.graphics().setScrollFactor(0).setDepth(33).setAlpha(0);
  }

  show(
    label:        string,
    skinId:       string,
    hp:           number,
    downed:       boolean,
    expelled:     boolean,
    escaped:      boolean,
    hacking:      boolean,
    showActivity: boolean,
    healPct:      number,
    bleedMs:      number,
    showHealPct:  boolean,
  ) {
    const stateKey = escaped  ? 'escaped'
      : expelled             ? 'expelled'
      : downed               ? 'downed'
      : hp <= 1              ? 'injured'
      : 'healthy';

    this._drawBackground(stateKey);
    this._updatePortrait(skinId, hp, downed);
    this._drawStatusBars(downed, healPct, bleedMs, showHealPct);

    const maxChars = this.compact ? 7 : 12;
    this.nameText.setText(label.slice(0, maxChars)).setAlpha(1);
    this.bg.setAlpha(1);
    this.overlay.setAlpha(1);
    this.statusBars.setAlpha(1);

    const stateStr = STATE_LABEL[stateKey] ?? '';
    this.stateLabel.setText(stateStr).setAlpha(stateStr ? 1 : 0);

    if (!this.compact) {
      this._drawHearts(hp, downed);
      this.heart1.setAlpha(1);
      this.heart2.setAlpha(1);
      this._drawHackIndicator(showActivity && hacking && !downed && !expelled && !escaped);
    }
  }

  hide() {
    this.bg.setAlpha(0);
    this.portrait.setAlpha(0);
    this.overlay.setAlpha(0);
    this.nameText.setAlpha(0);
    this.heart1.setAlpha(0);
    this.heart2.setAlpha(0);
    this.stateLabel.setAlpha(0);
    this.hackIndicator.setAlpha(0);
    this.portImg?.setAlpha(0);
    this.statusBars.setAlpha(0);
  }

  private _drawBackground(state: string) {
    const { bg, portrait, overlay, baseColor, cardY } = this;
    const { w, h, portH } = this.sz;
    const x  = CARD_X;
    const cx = x + w / 2 + 2;

    bg.clear();
    bg.fillStyle(0x0e0e0e, 0.84);
    bg.fillRoundedRect(x, cardY, w, h, 5);
    bg.fillStyle(STATE_BORDER[state] ?? 0x666666, 1);
    bg.fillRect(x, cardY + 4, 4, h - 8);

    portrait.clear();
    portrait.fillStyle(baseColor, 0.20);
    portrait.fillRect(x + 4, cardY, w - 4, portH);

    overlay.clear();
    if (state === 'downed') {
      overlay.fillStyle(0xff9800, 0.50);
      overlay.fillRect(x + 4, cardY, w - 4, portH);
      overlay.lineStyle(2.5, 0xffffff, 0.85);
      overlay.lineBetween(cx - 8, cardY + 8, cx + 8, cardY + portH - 8);
      overlay.lineBetween(cx + 8, cardY + 8, cx - 8, cardY + portH - 8);
    } else if (state === 'expelled') {
      overlay.fillStyle(0x000000, 0.70);
      overlay.fillRect(x + 4, cardY, w - 4, portH);
    } else if (state === 'escaped') {
      overlay.fillStyle(0x4fc3f7, 0.28);
      overlay.fillRect(x + 4, cardY, w - 4, portH);
    }
    portrait.setAlpha(1);
    overlay.setAlpha(1);
  }

  private _updatePortrait(skinId: string, hp: number, downed: boolean) {
    const hurt    = downed || hp <= 1;
    const hurtKey = `${skinId}-icon-hurt`;
    const normKey = `${skinId}-icon`;
    const wantKey = (hurt && this.scene.textures.exists(hurtKey)) ? hurtKey : normKey;

    if (!this.scene.textures.exists(wantKey)) {
      this.portImg?.setAlpha(0);
      return;
    }

    const { w, portH } = this.sz;
    const cx   = CARD_X + w / 2 + 2;
    const cy   = this.cardY + portH / 2;
    const size = portH - 4;

    if (!this.portImg) {
      this.portImg = this.scene.add
        .image(cx, cy, wantKey)
        .setDisplaySize(size, size)
        .setScrollFactor(0)
        .setDepth(31);
    } else {
      this.portImg.setTexture(wantKey).setDisplaySize(size, size).setPosition(cx, cy);
    }
    this.portImg.setAlpha(1);
    this.portrait.setAlpha(0);
  }

  private _drawHearts(hp: number, downed: boolean) {
    const full  = !downed && hp > 0;
    const full2 = !downed && hp > 1;
    this.heart1.setColor(full  ? '#e53935' : '#2a2a2a');
    this.heart2.setColor(full2 ? '#e53935' : '#2a2a2a');
  }

  private _drawHackIndicator(active: boolean) {
    const { w, portH } = this.sz;
    this.hackIndicator.clear();
    if (!active) { this.hackIndicator.setAlpha(0); return; }
    const bx = CARD_X + 4;
    const by = this.cardY + portH - 4;
    const bw = w - 8;
    this.hackIndicator.fillStyle(0x00e676, 0.85);
    this.hackIndicator.fillRoundedRect(bx, by, bw, 4, 2);
    this.hackIndicator.setAlpha(1);
  }

  private _drawStatusBars(downed: boolean, healPct: number, bleedMs: number, showHealPct: boolean) {
    this.statusBars.clear();
    if (!downed) return;

    const BLEED_OUT_MS = 70_000;
    const { w, h } = this.sz;
    const bx = CARD_X + 4;
    const bw = w - 8;
    const bh = 4;

    const bleedY = this.cardY + h - 13;
    const healY  = this.cardY + h - 7;

    this.statusBars.fillStyle(0x1a1a1a, 0.9);
    this.statusBars.fillRoundedRect(bx, bleedY, bw, bh, 2);
    const bleedFill = Math.min(1, bleedMs / BLEED_OUT_MS) * bw;
    if (bleedFill > 0) {
      this.statusBars.fillStyle(0xff6600, 0.9);
      this.statusBars.fillRoundedRect(bx, bleedY, bleedFill, bh, 2);
    }

    if (!showHealPct || healPct <= 0) return;
    this.statusBars.fillStyle(0x1a1a1a, 0.9);
    this.statusBars.fillRoundedRect(bx, healY, bw, bh, 2);
    const healFill = Math.min(1, healPct / 100) * bw;
    if (healFill > 0) {
      this.statusBars.fillStyle(0x81c995, 0.9);
      this.statusBars.fillRoundedRect(bx, healY, healFill, bh, 2);
    }
  }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/game/hud/SurvivorCard.ts
git commit -m "feat: SurvivorCard compact mode, heart HP display, state labels, hack indicator"
```

---

## Task 4: Terminal Pins

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Adicionar campos para pin images e error state**

No topo da classe `HUD`, adicionar as novas propriedades privadas (junto com as já existentes):

```typescript
private terminalErrorArrows: Map<string, number> = new Map();
private terminalPinImages:   Map<string, Phaser.GameObjects.Image> = new Map();
```

- [ ] **Step 2: Adicionar método público `setTerminalError`**

Adicionar após `showLoudNoiseAlert`:

```typescript
setTerminalError(terminalId: string, durationMs = 3000): void {
  this.terminalErrorArrows.set(terminalId, Date.now() + durationMs);
}
```

- [ ] **Step 3: Adicionar `_drawTerminalPin` e substituir chamadas**

Substituir o método privado `_drawArrowTriangle` por `_drawTerminalPin`:

```typescript
private _drawTerminalPin(
  ex: number,
  ey: number,
  angle: number,
  terminalId: string,
): void {
  const now      = Date.now();
  const isLoud   = (this.loudNoiseArrows.get(terminalId) ?? 0) > now;
  const isErr    = (this.terminalErrorArrows.get(terminalId) ?? 0) > now;
  const flashing = isLoud || isErr;
  const flash    = flashing ? (Math.floor(now / 250) % 2 === 0) : true;
  const alpha    = flash ? 0.92 : 0.1;
  const color    = flashing ? 0xff2200 : 0xffcc00;

  const HEAD_R = 16;
  const TAIL_L = 12;
  const cos    = Math.cos(angle);
  const sin    = Math.sin(angle);

  this.arrowGraphics.fillStyle(color, alpha);
  this.arrowGraphics.fillCircle(ex, ey, HEAD_R);
  this.arrowGraphics.lineStyle(2, 0xffffff, alpha * 0.55);
  this.arrowGraphics.strokeCircle(ex, ey, HEAD_R);

  const tipX  = ex + cos * (HEAD_R + TAIL_L);
  const tipY  = ey + sin * (HEAD_R + TAIL_L);
  const perpX = -sin;
  const perpY =  cos;
  const wing  = 7;
  this.arrowGraphics.fillStyle(color, alpha);
  this.arrowGraphics.fillTriangle(
    tipX, tipY,
    ex + perpX * wing, ey + perpY * wing,
    ex - perpX * wing, ey - perpY * wing,
  );

  const frame    = (isErr || isLoud) ? 8 : 0;
  const imgAlpha = flash ? 0.9 : 0.1;

  let img = this.terminalPinImages.get(terminalId);
  if (!img) {
    img = this.scene.add
      .image(ex, ey, 'computer-terminal-sheet', frame)
      .setDisplaySize(22, 22)
      .setScrollFactor(0)
      .setDepth(33);
    this.terminalPinImages.set(terminalId, img);
  }
  img.setPosition(ex, ey).setFrame(frame).setAlpha(imgAlpha);
}
```

- [ ] **Step 4: Atualizar `updateTerminalArrows` para usar pins**

No início de `updateTerminalArrows`, adicionar reset das imagens e limpeza do error map. Substituir a chamada a `_drawArrowTriangle` pela nova `_drawTerminalPin`:

```typescript
updateTerminalArrows(
  positions: Readonly<Partial<Record<string, { x: number; y: number }>>>,
  completed: ReadonlySet<string>,
  camX: number,
  camY: number,
  screenW: number,
  screenH: number,
) {
  this.arrowGraphics.clear();
  const now = Date.now();

  // Ocultar todas as imagens; só as visíveis serão reativadas abaixo
  this.terminalPinImages.forEach(img => img.setAlpha(0));

  // Limpar error entries expiradas
  this.terminalErrorArrows.forEach((exp, id) => {
    if (exp <= now) this.terminalErrorArrows.delete(id);
  });

  const cx     = screenW / 2;
  const cy     = screenH / 2;
  const margin = 18;

  (Object.keys(positions) as string[]).forEach((id) => {
    if (completed.has(id)) return;
    const pos = positions[id];
    if (!pos) return;

    const sx = pos.x - camX;
    const sy = pos.y - camY;

    const isLoud  = (this.loudNoiseArrows.get(id) ?? 0) > now;
    if (sx >= 0 && sx <= screenW && sy >= 0 && sy <= screenH && isLoud) {
      const flashOn = Math.floor(now / 250) % 2 === 0;
      this.arrowGraphics.lineStyle(3, 0xff2200, flashOn ? 1.0 : 0.1);
      this.arrowGraphics.strokeCircle(sx, sy, 26);
    }

    const dx = sx - cx;
    const dy = sy - cy;
    if (dx === 0 && dy === 0) return;
    const angle = Math.atan2(dy, dx);

    const maxX = screenW - margin;
    const maxY = screenH - margin;
    const tX   = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
    const tY   = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
    const t    = Math.min(Math.abs(tX), Math.abs(tY));
    const ex   = cx + dx * t;
    const ey   = cy + dy * t;

    this._drawTerminalPin(ex, ey, angle, id);
  });

  this.loudNoiseArrows.forEach((expiresAt, id) => {
    if (expiresAt <= now) this.loudNoiseArrows.delete(id);
  });

  this.healAlertArrows.forEach((entry, id) => {
    if (entry.expiresAt <= now) { this.healAlertArrows.delete(id); return; }
    const sx = entry.x - camX;
    const sy = entry.y - camY;
    const dx = sx - cx;
    const dy = sy - cy;
    if (dx === 0 && dy === 0) return;
    const angle = Math.atan2(dy, dx);
    const maxX  = screenW - margin;
    const maxY  = screenH - margin;
    const tX    = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
    const tY    = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
    const t     = Math.min(Math.abs(tX), Math.abs(tY));
    const ex    = cx + dx * t;
    const ey    = cy + dy * t;
    const flash = Math.floor(now / 200) % 2 === 0;
    this._drawHealAlertArrow(ex, ey, angle, flash ? 1.0 : 0.3);
  });
}
```

- [ ] **Step 5: Aumentar tamanho das setas de downed e heal alert**

`_drawArrowTriangle` permanece para setas de downed (triângulo laranja). No método `updateDownedArrows`, a chamada `this._drawArrowTriangle(ex, ey, angle, 0xff6600, 0.85)` fica inalterada, mas dentro de `_drawArrowTriangle` trocar `const size = 12` para `const size = 16`.

Em `_drawHealAlertArrow`, trocar `const size = 18` para `const size = 22`.

- [ ] **Step 6: Verificar tipos**

```bash
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: terminal direction pins with sprite, error state, and larger downed arrows"
```

---

## Task 5: Hint Panel

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Substituir `hudHint` por panel com linhas**

Remover a declaração `private hudHint!: Phaser.GameObjects.Text` e adicionar:

```typescript
private hintPanel!:  Phaser.GameObjects.Graphics;
private hintLines:   Phaser.GameObjects.Text[] = [];
private readonly HINT_MAX_LINES = 3;
```

- [ ] **Step 2: Substituir criação de `hudHint` em `build()` por criação do panel**

No método `build()`, remover:
```typescript
this.hudHint = this.scene.add
  .text(8, 578, '', { fontSize: '11px', color: '#777' })
  .setScrollFactor(0).setDepth(30);
```

Adicionar (dentro do bloco `if (!isTouchDevice)` — o panel só existe em PC):
```typescript
if (!this.isTouchDevice) {
  this.hintPanel = this.scene.add.graphics().setScrollFactor(0).setDepth(30);
  for (let i = 0; i < this.HINT_MAX_LINES; i++) {
    this.hintLines.push(
      this.scene.add
        .text(0, 0, '', { fontSize: '12px', color: '#bbb' })
        .setScrollFactor(0).setDepth(31).setAlpha(0),
    );
  }
}
```

Se `isTouchDevice = true`, `hintPanel` e `hintLines` ficam sem inicialização — usar optional chaining nas chamadas.

- [ ] **Step 3: Reescrever `refreshHint()`**

```typescript
private refreshHint(): void {
  if (this.isTouchDevice) return;
  if (!this.hintPanel) return;

  this.hintPanel.clear();
  this.hintLines.forEach(t => t.setAlpha(0));

  const gp = this.usingGamepad;
  let lines: string[] = [];

  if (this.currentDowned) {
    lines = [gp ? '[X] Responder' : '[SPACE] Responder'];
  } else if (this.currentRole === 'survivor') {
    lines = [
      gp ? '[A] Hackear / Fugir' : '[E] Hackear / Fugir',
      gp ? '[RB] Correr'         : '[SHIFT] Correr',
      '[C] Microfone',
    ];
  } else if (this.currentRole === 'professor') {
    lines = [
      gp ? '[X] Atacar   [A] Reforçar' : '[SPACE] Atacar  [E] Reforçar',
      gp ? '[RB] Correr'               : '[SHIFT] Correr',
      '[C] Microfone',
    ];
  }

  if (lines.length === 0) return;

  const PANEL_X = 8;
  const LINE_H  = 17;
  const PAD_V   = 7;
  const PANEL_W = 220;
  const PANEL_H = lines.length * LINE_H + PAD_V * 2 - 2;
  const PANEL_Y = 596 - PANEL_H;

  this.hintPanel.fillStyle(0x000000, 0.55);
  this.hintPanel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 5);

  lines.forEach((line, i) => {
    if (i >= this.hintLines.length) return;
    this.hintLines[i]
      .setText(line)
      .setPosition(PANEL_X + 8, PANEL_Y + PAD_V + i * LINE_H)
      .setAlpha(1);
  });
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: replace hint text with contextual hint panel (PC only)"
```

---

## Task 6: Atualizações dos elementos HUD + remover role badge

**Files:**
- Modify: `src/game/HUD.ts`

- [ ] **Step 1: Remover role badge**

Remover as declarações `private roleBadge` e `private hudRole` da classe.

No `build()`, remover:
```typescript
this.roleBadge = this.scene.add.graphics().setScrollFactor(0).setDepth(30);
this.hudRole   = this.scene.add.text(30, 10, '', { ... }).setScrollFactor(0).setDepth(31);
```

No `update()`, remover a chamada `this._drawRoleBadge(role)`.

Remover o método `_drawRoleBadge()` inteiramente.

- [ ] **Step 2: Down count — substituir dots por texto ⚠**

Remover `private downCountDots!: Phaser.GameObjects.Graphics` e adicionar:

```typescript
private downWarn1!: Phaser.GameObjects.Text;
private downWarn2!: Phaser.GameObjects.Text;
```

No `build()`, remover:
```typescript
this.downCountDots = this.scene.add.graphics().setScrollFactor(0).setDepth(30);
```

Adicionar (a posição Y varia: 30 para PC, `compactCardsBottom + 10` para mobile — calcular na Task 7):
```typescript
this.downWarn1 = this.scene.add
  .text(8, 32, '⚠', { fontSize: '13px', color: '#444' })
  .setScrollFactor(0).setDepth(30).setAlpha(0);
this.downWarn2 = this.scene.add
  .text(22, 32, '⚠', { fontSize: '13px', color: '#444' })
  .setScrollFactor(0).setDepth(30).setAlpha(0);
```

Substituir `_drawDownCountDots` por:

```typescript
private _updateDownWarnings(role: Role | null, downCount: 0 | 1 | 2): void {
  if (role !== 'survivor') {
    this.downWarn1.setAlpha(0);
    this.downWarn2.setAlpha(0);
    return;
  }
  this.downWarn1.setColor(downCount >= 1 ? '#e53935' : '#333').setAlpha(1);
  this.downWarn2.setColor(downCount >= 2 ? '#e53935' : '#333').setAlpha(1);
}
```

Atualizar `update()` para chamar `this._updateDownWarnings(role, downCount)` em vez de `this._drawDownCountDots(role, downCount)`.

Atualizar `setDownCount()` para chamar `this._updateDownWarnings(this.currentRole, downCount)`.

- [ ] **Step 3: Terminal count — reposicionar e ampliar**

Alterar a criação de `hudTerminals` em `build()`:

```typescript
this.hudTerminals = this.scene.add
  .text(400, 14, '', { fontSize: '16px', color: '#ffcc00', stroke: '#000', strokeThickness: 3 })
  .setOrigin(0.5, 0)
  .setScrollFactor(0).setDepth(30);
```

- [ ] **Step 4: Mic state — top-right, maior**

Alterar `hudMic` em `build()` de posição (792, 568) para (792, 8) e fontSize de '11px' para '14px':

```typescript
this.hudMic = this.scene.add
  .text(792, 8, '', { fontSize: '14px', color: '#4caf50' })
  .setOrigin(1, 0).setScrollFactor(0).setDepth(30);
```

Mover `hudGamepad` para evitar sobreposição com mic:

```typescript
this.hudGamepad = this.scene.add
  .text(792, 26, 'Controle inativo — pressione um botao para ativar', { fontSize: '10px', color: '#555' })
  .setOrigin(1, 0).setScrollFactor(0).setDepth(30);
```

- [ ] **Step 5: Endgame timer — maior**

Na `build()`, `endgameTimerText` — alterar fontSize de '12px' para '15px'.

Em `setEndgameTimer()`, alterar `BAR_H` de `8` para `12`.

- [ ] **Step 6: Terror heart — adicionar label**

Adicionar declaração:
```typescript
private terrorLabel!: Phaser.GameObjects.Text;
```

No `build()` após `terrorHeart`:
```typescript
this.terrorLabel = this.scene.add
  .text(400, 572, 'TERROR', { fontSize: '10px', color: '#ff2244', stroke: '#000', strokeThickness: 3 })
  .setOrigin(0.5).setScrollFactor(0).setDepth(30).setAlpha(0);
```

Em `setTerrorLevel()`, adicionar `this.terrorLabel.setAlpha(alphas[level])` junto com `this.terrorHeart.setAlpha(...)` e `this.terrorLabel.setAlpha(0)` no bloco `level === 0`.

- [ ] **Step 7: Chase indicator — badge maior**

Em `setChaseState()`, alterar o rect de `(668, 26, 100, 20)` para `(648, 24, 124, 24)` (tanto no fillRoundedRect quanto no strokeRoundedRect).

Alterar posição do texto de `(762, 28)` para `(770, 28)`.

- [ ] **Step 8: Verificar tipos**

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add src/game/HUD.ts
git commit -m "feat: remove role badge, update HUD elements (terminal count, mic, endgame timer, terror label, chase badge)"
```

---

## Task 7: HUD.build() split mobile/PC + integração no GameScene

**Files:**
- Modify: `src/game/HUD.ts`
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Adicionar `isTouchDevice` à classe HUD**

Adicionar propriedade privada:
```typescript
private isTouchDevice = false;
```

Alterar assinatura de `build()`:
```typescript
build(isTouchDevice = false): void {
  this.isTouchDevice = isTouchDevice;
  // ... resto do build existente ...
}
```

- [ ] **Step 2: Diferenciar posições dos cards no mobile vs PC**

Em `_buildSurvivorCards()`, aceitar `compact`:
```typescript
private _buildSurvivorCards(compact: boolean): void {
  const startY  = compact ? 8 : 92;
  const cardH   = compact ? 48 : 76;
  const cardGap = compact ? 4  : 6;

  this.survivorCards = [];
  for (let i = 0; i < 4; i++) {
    const cardY     = startY + i * (cardH + cardGap);
    const baseColor = ACCENT_COLORS[i];
    this.survivorCards.push(new SurvivorCard(this.scene, cardY, baseColor, compact));
  }
}
```

Chamar `this._buildSurvivorCards(isTouchDevice)` em vez de `this._buildSurvivorCards()`.

- [ ] **Step 3: Posicionar ⚠ down count abaixo dos cards no mobile**

No `build()`, após `_buildSurvivorCards`, calcular a posição Y dos warnings:

```typescript
const downWarnY = isTouchDevice
  ? 8 + 4 * (48 + 4) + 8   // abaixo dos 4 cards compactos = 224
  : 32;
this.downWarn1.setY(downWarnY);
this.downWarn2.setY(downWarnY);
```

- [ ] **Step 4: Esconder hack/heal bars no mobile (sobreposição com botões)**

No mobile, as barras de hack/heal em (270, 480) ficam perto dos botões de ação. Reposicionar para top-center abaixo do terminal count:

```typescript
if (isTouchDevice) {
  // Reposicionar hack e heal bars para área segura
  // ProgressBar não tem setPosition público — vamos apenas esconder no mobile
  // e confiar no feedback do estado via SurvivorCard
}
```

Na verdade, as barras de hack/heal mostram o progresso do próprio jogador (global). No mobile elas podem ficar em (270, 480) se os botões ficam em (740, 488) e (668, 452) — não há sobreposição real. Manter a posição.

- [ ] **Step 5: Adicionar `TouchControlManager` e `isTouchDevice` ao GameScene**

Em `src/scenes/GameScene.ts`, adicionar import:
```typescript
import { TouchControlManager } from '../game/TouchControlManager';
```

Adicionar propriedade à classe:
```typescript
private isTouchDevice  = false;
private touchControls: TouchControlManager | null = null;
```

No método `create()`, antes de `this.inputManager = new InputManager(this)`:
```typescript
this.isTouchDevice = navigator.maxTouchPoints > 0;
this.inputManager  = new InputManager(this, this.isTouchDevice);
```

Após `this.hud = new HUD(this)`, instanciar touch controls:
```typescript
if (this.isTouchDevice) {
  this.touchControls = new TouchControlManager(this);
  this.touchControls.build();
}
```

Alterar `this.hud.build()` para:
```typescript
this.hud.build(this.isTouchDevice);
```

Na linha do `gameReset` que chama `this.hud.build()`:
```typescript
this.hud.build(this.isTouchDevice);
```

- [ ] **Step 6: Atualizar `update()` para passar touchState**

Alterar linha 762:
```typescript
const touchState   = this.touchControls?.readAndClear();
const input        = this.inputManager.read(pad, touchState);
```

- [ ] **Step 7: Chamar `setRole` no TouchControlManager quando o role muda**

Localizar os eventos onde `this.myRole` é atribuído e `hud.update` é chamado — adicionar `this.touchControls?.setRole(role, downed)` logo após cada um. Os principais pontos em GameScene são:

No handler do evento `gameState` (linha ~382):
```typescript
this.hud.update(role, this.myHp, this.downed);
this.touchControls?.setRole(role, this.downed);
```

No handler do evento `playerDowned` quando `targetId === this.myId` (linha ~596):
```typescript
this.hud.update(this.myRole, this.myHp, true, this.myDownCount);
this.touchControls?.setRole(this.myRole, true);
```

No handler do evento `playerRevived` quando `targetId === this.myId` (linha ~632):
```typescript
this.hud.update(this.myRole, this.myHp, false, this.myDownCount);
this.touchControls?.setRole(this.myRole, false);
```

- [ ] **Step 8: Chamar `setTerminalError` no firewallAlert**

No handler de `firewallAlert` (linha ~535), adicionar após `this.terminals.setFailed(...)`:

```typescript
this.hud.setTerminalError(terminalId, 3000);
```

- [ ] **Step 9: Destruir `touchControls` no shutdown**

No método `shutdown()`, junto com `voiceManager?.destroy()`:
```typescript
this.touchControls?.destroy();
this.touchControls = null;
```

- [ ] **Step 10: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erros. Se houver erro de tipo no `TouchInputState` vindo do `readAndClear()` (que retorna `TouchInputState`) sendo passado para `read()` (que aceita `TouchInputState | undefined`), verificar que o tipo bate corretamente.

- [ ] **Step 11: Commit**

```bash
git add src/game/HUD.ts src/scenes/GameScene.ts
git commit -m "feat: mobile/PC HUD split, TouchControlManager wiring, terminal pin error on firewallAlert"
```

---

## Task 8: Teste Manual

**Files:** nenhum — só execução

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

Abrir `http://localhost:5173` no browser.

- [ ] **Step 2: Testar no PC (teclado)**

- [ ] Abrir duas abas — uma como professor, uma como sobrevivente
- [ ] Verificar que role badge sumiu
- [ ] Verificar hint panel (bottom-left) mostrando controles corretos por role/estado
- [ ] Verificar cards de sobrevivente com corações e labels de estado
- [ ] Movimentar câmera até terminal fora de tela — verificar pin amarelo com sprite
- [ ] Triggar skill check fail → verificar pin piscando vermelho com frame 8
- [ ] Verificar terminal count em cima centralizado (amarelo, 16px)
- [ ] Verificar mic top-right (se voip ativo)
- [ ] Verificar terror heart + label "TERROR" ao entrar em chase

- [ ] **Step 3: Testar no mobile (Chrome DevTools → device emulation landscape)**

- [ ] Ativar emulação de dispositivo móvel em landscape (ex: iPad Pro 1024×768)
- [ ] Verificar joystick virtual bottom-left (base + knob)
- [ ] Verificar botão INTERAGIR para sobrevivente bottom-right
- [ ] Verificar botão ATACAR + REFORÇAR para professor
- [ ] Mover personagem com joystick
- [ ] Apertar INTERAGIR perto de terminal → personagem deve iniciar hack
- [ ] Verificar cards compactos top-left (60×48px)
- [ ] Verificar que hint panel NÃO aparece no mobile
- [ ] Verificar ⚠ down count abaixo dos cards

- [ ] **Step 4: Testar com gamepad (se disponível)**

- [ ] Conectar gamepad — mensagem de "Controle inativo" deve sumir
- [ ] Hint panel deve trocar para labels do gamepad ([A], [X], [RB])
- [ ] Movimentar com analog stick esquerdo
- [ ] Botão A: hackear/interagir (sobrevivente), reforçar (professor)
- [ ] Botão X: atacar (professor), responder (downed)

- [ ] **Step 5: Commit final se necessário**

```bash
git add -A
git commit -m "fix: manual testing adjustments post-HUD redesign"
```
