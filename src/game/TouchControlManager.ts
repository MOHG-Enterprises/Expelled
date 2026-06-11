import Phaser from 'phaser';
import type { Role } from '../types';
import type { TouchInputState } from './InputManager';

const BASE_RADIUS  = 80;
const KNOB_RADIUS  = 32;
const BTN_RADIUS   = 44;
const LOOK_BASE_R  = 44;
const LOOK_KNOB_R  = 18;

// Offsets from screen edges (original design: 800×600)
const JOYSTICK_FROM_LEFT   = 110;
const JOYSTICK_FROM_BOTTOM = 110;  // 600 - 490
const BTN2_FROM_RIGHT      = 60;   // 800 - 740
const BTN2_FROM_BOTTOM     = 112;  // 600 - 488
const BTN1_FROM_RIGHT      = 132;  // 800 - 668
const BTN1_FROM_BOTTOM     = 148;  // 600 - 452
const LOOK_FROM_RIGHT      = 90;   // 800 - 710
const LOOK_FROM_BOTTOM     = 232;  // 600 - 368

export class TouchControlManager {
  private scene: Phaser.Scene;

  private baseGfx!:     Phaser.GameObjects.Graphics;
  private knobGfx!:     Phaser.GameObjects.Graphics;
  private btn1Gfx!:     Phaser.GameObjects.Graphics;
  private btn2Gfx!:     Phaser.GameObjects.Graphics;
  private btn1Label!:   Phaser.GameObjects.Text;
  private btn2Label!:   Phaser.GameObjects.Text;
  private lookBaseGfx!: Phaser.GameObjects.Graphics;
  private lookKnobGfx!: Phaser.GameObjects.Graphics;

  private baseCenter  = { x: 0, y: 0 };
  private btn2Center  = { x: 0, y: 0 };
  private btn1Center  = { x: 0, y: 0 };
  private lookCenter  = { x: 0, y: 0 };

  private resizeHandler: (() => void) | null = null;

  private joystickPointerId: number | null = null;
  private btn1PointerId:     number | null = null;
  private btn2PointerId:     number | null = null;
  private lookPointerId:     number | null = null;

  private currentRole:      Role | null = null;
  private currentDowned:    boolean     = false;
  private sprintActive:     boolean     = false;
  private skillCheckActive: boolean     = false;

  private state: TouchInputState = {
    active: true, engaged: false, vx: 0, vy: 0, analogScale: 1, sprinting: false,
    actionHeld: false, actionJust: false,
    attackHeld: false, attackJust: false, attackJustUp: false,
    lookVx: 1, lookVy: 0, hasLookInput: false,
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build(): void {
    this.scene.input.addPointer(3);

    this.baseGfx      = this.scene.add.graphics().setScrollFactor(0).setDepth(40);
    this.knobGfx      = this.scene.add.graphics().setScrollFactor(0).setDepth(41);
    this.btn1Gfx      = this.scene.add.graphics().setScrollFactor(0).setDepth(40);
    this.btn2Gfx      = this.scene.add.graphics().setScrollFactor(0).setDepth(40);
    this.lookBaseGfx  = this.scene.add.graphics().setScrollFactor(0).setDepth(40);
    this.lookKnobGfx  = this.scene.add.graphics().setScrollFactor(0).setDepth(41);

    this.btn1Label = this.scene.add
      .text(0, 0, '', {
        fontSize: '11px', color: '#fff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2, align: 'center',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(41);

    this.btn2Label = this.scene.add
      .text(0, 0, '', {
        fontSize: '11px', color: '#fff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2, align: 'center',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(41);

    this._computePositions();
    this._redrawAll();
    this._registerEvents();

    this.resizeHandler = () => {
      this._computePositions();
      this._redrawAll();
    };
    this.scene.scale.on('resize', this.resizeHandler);
  }

  setRole(role: Role | null, downed: boolean): void {
    this.currentRole   = role;
    this.currentDowned = downed;
    if (downed || role === 'professor') {
      this.sprintActive    = false;
      this.state.sprinting = false;
    }
    if (role !== 'professor') {
      this.state.hasLookInput = false;
      this.lookPointerId      = null;
      this._drawLookBase(false);
      this._drawLookKnob(0, 0, false);
    }
    this._drawButtons();
  }

  readAndClear(): TouchInputState {
    const snap = { ...this.state, engaged: this._anyPointerEngaged() };
    this.state.actionJust   = false;
    this.state.attackJust   = false;
    this.state.attackJustUp = false;
    return snap;
  }

  deactivate(): void {
    this.state.active = false;
  }

  private _anyPointerEngaged(): boolean {
    return this.joystickPointerId !== null
      || this.btn1PointerId !== null
      || this.btn2PointerId !== null
      || this.lookPointerId !== null;
  }

  setSkillCheckActive(active: boolean): void {
    if (active === this.skillCheckActive) return;
    this.skillCheckActive = active;
    this._drawButtons();
  }

  destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.baseGfx.destroy();
    this.knobGfx.destroy();
    this.btn1Gfx.destroy();
    this.btn2Gfx.destroy();
    this.btn1Label.destroy();
    this.btn2Label.destroy();
    this.lookBaseGfx.destroy();
    this.lookKnobGfx.destroy();
  }

  private _computePositions(): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.baseCenter = { x: JOYSTICK_FROM_LEFT,      y: h - JOYSTICK_FROM_BOTTOM };
    this.btn2Center = { x: w - BTN2_FROM_RIGHT,     y: h - BTN2_FROM_BOTTOM };
    this.btn1Center = { x: w - BTN1_FROM_RIGHT,     y: h - BTN1_FROM_BOTTOM };
    this.lookCenter = { x: w - LOOK_FROM_RIGHT,     y: h - LOOK_FROM_BOTTOM };
  }

  private _redrawAll(): void {
    this._drawBase();
    this._drawKnob(0, 0);
    this._drawButtons();
    this._drawLookBase(this.currentRole === 'professor');
    this._drawLookKnob(0, 0, this.currentRole === 'professor');
  }

  private _drawBase(): void {
    this.baseGfx.clear();
    this.baseGfx.fillStyle(0xffffff, 0.08);
    this.baseGfx.fillCircle(this.baseCenter.x, this.baseCenter.y, BASE_RADIUS);
    this.baseGfx.lineStyle(2, 0xffffff, 0.25);
    this.baseGfx.strokeCircle(this.baseCenter.x, this.baseCenter.y, BASE_RADIUS);
  }

  private _drawKnob(dx: number, dy: number): void {
    const kx = this.baseCenter.x + dx;
    const ky = this.baseCenter.y + dy;
    this.knobGfx.clear();
    this.knobGfx.fillStyle(0xffffff, 0.45);
    this.knobGfx.fillCircle(kx, ky, KNOB_RADIUS);
    this.knobGfx.lineStyle(2, 0xffffff, 0.65);
    this.knobGfx.strokeCircle(kx, ky, KNOB_RADIUS);
  }

  private _drawLookBase(visible: boolean): void {
    this.lookBaseGfx.clear();
    if (!visible) return;
    this.lookBaseGfx.fillStyle(0x334466, 0.12);
    this.lookBaseGfx.fillCircle(this.lookCenter.x, this.lookCenter.y, LOOK_BASE_R);
    this.lookBaseGfx.lineStyle(1.5, 0x88aaff, 0.35);
    this.lookBaseGfx.strokeCircle(this.lookCenter.x, this.lookCenter.y, LOOK_BASE_R);
  }

  private _drawLookKnob(dx: number, dy: number, visible: boolean): void {
    this.lookKnobGfx.clear();
    if (!visible) return;
    const kx = this.lookCenter.x + dx;
    const ky = this.lookCenter.y + dy;
    this.lookKnobGfx.fillStyle(0x223355, 0.88);
    this.lookKnobGfx.fillCircle(kx, ky, LOOK_KNOB_R);
    this.lookKnobGfx.lineStyle(1.5, 0x88aaff, 0.9);
    this.lookKnobGfx.strokeCircle(kx, ky, LOOK_KNOB_R);
    this.lookKnobGfx.fillStyle(0xffffff, 0.92);
    this.lookKnobGfx.fillEllipse(kx, ky, 20, 12);
    this.lookKnobGfx.fillStyle(0x4488ff, 0.95);
    this.lookKnobGfx.fillCircle(kx, ky, 5);
    this.lookKnobGfx.fillStyle(0x000000, 0.98);
    this.lookKnobGfx.fillCircle(kx, ky, 2.5);
    this.lookKnobGfx.lineStyle(1, 0xbbccff, 0.5);
    this.lookKnobGfx.strokeEllipse(kx, ky, 20, 12);
  }

  private _drawButtons(): void {
    const isProfessor = this.currentRole === 'professor';
    const showTap     = this.skillCheckActive && !isProfessor && !this.currentDowned;

    let btn2Text = '';
    if (showTap)                  btn2Text = 'TAP!';
    else if (this.currentDowned)  btn2Text = 'RESPONDER';
    else if (isProfessor)         btn2Text = 'ATACAR';
    else                          btn2Text = 'INTERAGIR';

    const btn2Bg     = showTap ? 0x3a2a00 : isProfessor ? 0x4a0f0f : 0x0f2a3a;
    const btn2Border = showTap ? 0xffcc00 : isProfessor ? 0xef5350 : 0x4fc3f7;

    this.btn2Gfx.clear();
    this.btn2Gfx.fillStyle(btn2Bg, 0.85);
    this.btn2Gfx.fillCircle(this.btn2Center.x, this.btn2Center.y, BTN_RADIUS);
    this.btn2Gfx.lineStyle(2.5, btn2Border, 0.9);
    this.btn2Gfx.strokeCircle(this.btn2Center.x, this.btn2Center.y, BTN_RADIUS);
    this.btn2Label
      .setPosition(this.btn2Center.x, this.btn2Center.y)
      .setText(btn2Text).setColor(showTap ? '#ffcc00' : '#ffffff');

    this.btn1Gfx.clear();
    this.btn1Label.setAlpha(0);

    if (isProfessor) {
      this.btn1Gfx.fillStyle(0x0f3a1a, 0.85);
      this.btn1Gfx.fillCircle(this.btn1Center.x, this.btn1Center.y, BTN_RADIUS - 8);
      this.btn1Gfx.lineStyle(2, 0x4caf50, 0.9);
      this.btn1Gfx.strokeCircle(this.btn1Center.x, this.btn1Center.y, BTN_RADIUS - 8);
      this.btn1Label.setPosition(this.btn1Center.x, this.btn1Center.y).setText('CHUTAR').setAlpha(1);
      this._drawLookBase(true);
      this._drawLookKnob(0, 0, true);
    } else if (!this.currentDowned) {
      const sprintBg     = this.sprintActive ? 0x1a3a1a : 0x1a1a1a;
      const sprintBorder = this.sprintActive ? 0x76ff03 : 0x555555;
      const sprintAlpha  = this.sprintActive ? 0.95 : 0.75;
      this.btn1Gfx.fillStyle(sprintBg, sprintAlpha);
      this.btn1Gfx.fillCircle(this.btn1Center.x, this.btn1Center.y, BTN_RADIUS - 8);
      this.btn1Gfx.lineStyle(2, sprintBorder, 0.9);
      this.btn1Gfx.strokeCircle(this.btn1Center.x, this.btn1Center.y, BTN_RADIUS - 8);
      this.btn1Label
        .setPosition(this.btn1Center.x, this.btn1Center.y)
        .setText('CORRER').setAlpha(1).setColor(this.sprintActive ? '#76ff03' : '#888888');
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
    if (!p.wasTouch) return;
    const { x, y } = p;

    if (
      this.joystickPointerId === null &&
      Phaser.Math.Distance.Between(x, y, this.baseCenter.x, this.baseCenter.y) <= BASE_RADIUS + 24
    ) {
      this.joystickPointerId = p.id;
      this.state.active      = true;
      this._moveKnob(x, y);
      return;
    }

    if (
      this.currentRole === 'professor' &&
      this.lookPointerId === null &&
      Phaser.Math.Distance.Between(x, y, this.lookCenter.x, this.lookCenter.y) <= LOOK_BASE_R
    ) {
      this.lookPointerId      = p.id;
      this.state.active       = true;
      this.state.hasLookInput = true;
      this._moveLookKnob(x, y);
      return;
    }

    if (
      this.btn1PointerId === null &&
      Phaser.Math.Distance.Between(x, y, this.btn1Center.x, this.btn1Center.y) <= BTN_RADIUS - 8
    ) {
      this.btn1PointerId = p.id;
      this.state.active  = true;
      if (this.currentRole === 'professor') {
        this.state.actionHeld = true;
        this.state.actionJust = true;
      } else if (!this.currentDowned) {
        this.sprintActive    = !this.sprintActive;
        this.state.sprinting = this.sprintActive;
        this._drawButtons();
      }
      return;
    }

    if (
      this.btn2PointerId === null &&
      Phaser.Math.Distance.Between(x, y, this.btn2Center.x, this.btn2Center.y) <= BTN_RADIUS
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
    if (p.id === this.lookPointerId)     this._moveLookKnob(p.x, p.y);
  }

  private _onUp(p: Phaser.Input.Pointer): void {
    if (p.id === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.state.vx          = 0;
      this.state.vy          = 0;
      this.state.analogScale = 1;
      this._drawKnob(0, 0);
    }
    if (p.id === this.lookPointerId) {
      this.lookPointerId      = null;
      this.state.hasLookInput = false;
      this._drawLookKnob(0, 0, this.currentRole === 'professor');
    }
    if (p.id === this.btn1PointerId) {
      this.btn1PointerId = null;
      if (this.currentRole === 'professor') {
        this.state.actionHeld = false;
      }
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
  }

  private _moveKnob(px: number, py: number): void {
    const dx    = px - this.baseCenter.x;
    const dy    = py - this.baseCenter.y;
    const dist  = Math.hypot(dx, dy);
    const clamp = Math.min(dist, BASE_RADIUS);
    const nx    = dist > 0 ? dx / dist : 0;
    const ny    = dist > 0 ? dy / dist : 0;
    const ratio = clamp / BASE_RADIUS;

    this.state.vx          = nx * ratio;
    this.state.vy          = ny * ratio;
    this.state.analogScale = ratio;

    this._drawKnob(nx * clamp, ny * clamp);
  }

  private _moveLookKnob(px: number, py: number): void {
    const dx    = px - this.lookCenter.x;
    const dy    = py - this.lookCenter.y;
    const dist  = Math.hypot(dx, dy);
    const clamp = Math.min(dist, LOOK_BASE_R);
    const nx    = dist > 0 ? dx / dist : 1;
    const ny    = dist > 0 ? dy / dist : 0;

    this.state.lookVx = nx;
    this.state.lookVy = ny;

    this._drawLookKnob(nx * clamp, ny * clamp, true);
  }
}
