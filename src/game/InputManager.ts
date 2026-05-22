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

const PAD_DEADZONE = 0.2;

export class InputManager {
  private cursors:  Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd:     Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey: Phaser.Input.Keyboard.Key;
  private eKey:     Phaser.Input.Keyboard.Key;
  private shiftKey: Phaser.Input.Keyboard.Key;
  private cKey:     Phaser.Input.Keyboard.Key;

  private padPrevAction = false;
  private padPrevAttack = false;

  private mouseAttackJust:   boolean = false;
  private mouseAttackJustUp: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.cursors  = scene.input.keyboard!.createCursorKeys();
    this.wasd     = scene.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.spaceKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.eKey     = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.shiftKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.cKey     = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.mouseAttackJust = true;
    });
    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.mouseAttackJustUp = true;
    });
  }

  read(pad: Phaser.Input.Gamepad.Gamepad | null): InputState {
    const padActionNow = pad?.buttons[0].pressed ?? false;
    const padAttackNow = pad?.buttons[2].pressed ?? false;

    const actionHeld  = padActionNow;
    const attackHeld  = padAttackNow;
    const sprintHeld  = pad?.buttons[5].pressed ?? false;
    const actionJust  = padActionNow && !this.padPrevAction;
    const attackJust  = padAttackNow && !this.padPrevAttack;
    const attackJustUp = !padAttackNow && this.padPrevAttack;

    this.padPrevAction = padActionNow;
    this.padPrevAttack = padAttackNow;

    const spaceJustDown = Phaser.Input.Keyboard.JustDown(this.spaceKey);
    const spaceJustUp   = Phaser.Input.Keyboard.JustUp(this.spaceKey);
    const eJustDown     = Phaser.Input.Keyboard.JustDown(this.eKey);
    const cJustDown     = Phaser.Input.Keyboard.JustDown(this.cKey);
    const mouseAJ       = this.mouseAttackJust;
    const mouseAJU      = this.mouseAttackJustUp;
    this.mouseAttackJust    = false;
    this.mouseAttackJustUp  = false;

    let vx = 0, vy = 0;
    let analogScale = 1;

    if (this.cursors.left.isDown  || this.wasd['A'].isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd['D'].isDown) vx = 1;
    if (this.cursors.up.isDown    || this.wasd['W'].isDown) vy = -1;
    else if (this.cursors.down.isDown  || this.wasd['S'].isDown) vy = 1;

    if (pad) {
      const sx = pad.leftStick.x;
      const sy = pad.leftStick.y;
      const magnitude = Math.hypot(sx, sy);
      if (magnitude > PAD_DEADZONE) {
        vx = sx;
        vy = sy;
        analogScale = Math.min(magnitude, 1);
      }
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

  get spaceKeyRef(): Phaser.Input.Keyboard.Key { return this.spaceKey; }
  get eKeyRef():     Phaser.Input.Keyboard.Key { return this.eKey; }
}
