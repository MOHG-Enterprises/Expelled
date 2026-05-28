import Phaser from 'phaser';
import type { Socket } from '../socketClient';
import {
  LUNGE_THRESHOLD_MS, LUNGE_MAX_HOLD_MS,
  QUICK_ATTACK_RADIUS, QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS, LUNGE_ATTACK_HALF_ANGLE_RAD,
} from '../constants';
import type { TerminalId } from '../types';
import type { InputState } from './InputManager';
import type { MoveDirection } from './playerSkins';
import type { InteractionPromptManager } from './InteractionPromptManager';

export class CombatSystem {
  private scene:  Phaser.Scene;
  private player: Phaser.Physics.Arcade.Sprite;
  private socket: Socket;

  private _isSwinging      = false;
  private _swingDirection: MoveDirection | null = null;
  private _attackHoldStart: number | null = null;
  private _lastLungeTick   = 0;
  private _isKicking       = false;
  private _wasCharging     = false;
  private _slashSprite: Phaser.GameObjects.Sprite | null = null;
  private _kickSprite:  Phaser.GameObjects.Sprite | null = null;
  private promptManager: InteractionPromptManager;

  constructor(
    scene:         Phaser.Scene,
    player:        Phaser.Physics.Arcade.Sprite,
    socket:        Socket,
    promptManager: InteractionPromptManager,
  ) {
    this.scene         = scene;
    this.player        = player;
    this.socket        = socket;
    this.promptManager = promptManager;
  }

  get isSwinging():       boolean { return this._isSwinging; }
  get isKicking():        boolean { return this._isKicking; }
  get attackHoldActive(): boolean { return this._attackHoldStart !== null && !this._isSwinging; }

  createSlashAnimations() {
    const dirs: [MoveDirection, number][] = [['up', 0], ['left', 1], ['down', 2], ['right', 3]];
    dirs.forEach(([dir, row]) => {
      const slashKey = `professor-slash:${dir}`;
      if (!this.scene.anims.exists(slashKey)) {
        this.scene.anims.create({
          key:       slashKey,
          frames:    this.scene.anims.generateFrameNumbers('professor-slash', { start: row * 6, end: row * 6 + 5 }),
          frameRate: 12,
          repeat:    0,
        });
      }
      const kickKey = `professor-kick:${dir}`;
      if (!this.scene.anims.exists(kickKey)) {
        this.scene.anims.create({
          key:       kickKey,
          frames:    this.scene.anims.generateFrameNumbers('professor-slash', { start: row * 6, end: row * 6 + 5 }),
          frameRate: 5,
          repeat:    1,
        });
      }
    });
  }

  playHurtAnimation(ms: number) {
    if (!this.scene.textures.exists('professor-hurt')) return;
    if (this.scene.anims.exists('professor:hurt')) this.scene.anims.remove('professor:hurt');
    this.scene.anims.create({
      key: 'professor:hurt',
      frames: [
        { key: 'professor-hurt', frame: 0 },
        { key: 'professor-hurt', frame: 1 },
        { key: 'professor-hurt', frame: 2 },
        { key: 'professor-hurt', frame: 2 },
        { key: 'professor-hurt', frame: 1 },
        { key: 'professor-hurt', frame: 0 },
      ],
      duration: ms,
      repeat:   0,
    });
    this.player.play('professor:hurt');
  }

  cancelAll() {
    this._isSwinging      = false;
    this._swingDirection  = null;
    this._attackHoldStart = null;
    if (this._slashSprite) { this._slashSprite.destroy(); this._slashSprite = null; }
    this._isKicking = false;
    if (this._kickSprite) { this._kickSprite.destroy(); this._kickSprite = null; }
    this.player.setVisible(true);
    this.promptManager.hide();
  }

  reset() {
    this.cancelAll();
    this._wasCharging   = false;
    this._lastLungeTick = 0;
  }

  update(
    input:           InputState,
    facingDirection: MoveDirection,
    lookAngle:       number,
    nearestTerminal: { id: TerminalId; pos: { x: number; y: number } } | null,
  ) {
    if (nearestTerminal && !this._isKicking && !this._isSwinging) {
      this.promptManager.show(nearestTerminal.pos.x, nearestTerminal.pos.y, 64, 64, 'Chutar', input.usingGamepad, 0xff6600);
    } else {
      this.promptManager.hide();
    }

    const now = this.scene.time.now;

    if (input.attackJust && !this._isSwinging && !this._isKicking) {
      this._attackHoldStart = now;
    }

    if (this._attackHoldStart !== null && !this._isSwinging && (now - this._attackHoldStart) >= LUNGE_MAX_HOLD_MS) {
      this._fireAttack(facingDirection, lookAngle, true);
    }

    if (this._attackHoldStart !== null && !this._isSwinging) {
      const heldMs = now - this._attackHoldStart;
      if (heldMs >= LUNGE_THRESHOLD_MS && (now - this._lastLungeTick) > 50) {
        this._lastLungeTick = now;
        this.socket.emit('lungeTick', { x: this.player.x, y: this.player.y, angle: lookAngle });
      }
    }

    if (input.attackJustUp && this._attackHoldStart !== null && !this._isSwinging) {
      const heldMs = now - this._attackHoldStart;
      this._fireAttack(facingDirection, lookAngle, heldMs >= LUNGE_THRESHOLD_MS);
    }

    if (input.actionJust && nearestTerminal) {
      this._playKick(nearestTerminal.id, facingDirection);
    }

    const nowCharging = this._attackHoldStart !== null && !this._isSwinging;
    if (nowCharging !== this._wasCharging) {
      this._wasCharging = nowCharging;
      this.socket.emit('professorCharge', { charging: nowCharging });
    }

    if (this._isSwinging) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this._slashSprite?.setPosition(this.player.x, this.player.y);
    }

    if (this._isKicking) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this._kickSprite?.setPosition(this.player.x, this.player.y);
    }
  }

  private _fireAttack(facingDirection: MoveDirection, lookAngle: number, isLunge: boolean) {
    this._attackHoldStart = null;
    if (this._isSwinging || this._isKicking) return;
    this._playSlash(facingDirection, lookAngle, isLunge);
  }

  private _playSlash(facingDirection: MoveDirection, lookAngle: number, isLunge: boolean) {
    this._isSwinging     = true;
    this._swingDirection = facingDirection;

    this.player.setVisible(false);
    const slash = this.scene.add.sprite(this.player.x, this.player.y, 'professor-slash')
      .setDepth(6)
      .setDisplaySize(128, 128);
    this._slashSprite = slash;
    slash.play(`professor-slash:${this._swingDirection}`);

    this._showAttackHitbox(this.player.x, this.player.y, lookAngle, isLunge);
    this.socket.emit('attack', {
      x: this.player.x, y: this.player.y,
      angle: lookAngle, lunge: isLunge, dir: facingDirection,
    });

    slash.once('animationcomplete', () => {
      slash.destroy();
      this._slashSprite    = null;
      this._swingDirection = null;
      this.player.setVisible(true);
      this._isSwinging     = false;
    });
  }

  private _playKick(terminalId: TerminalId, facingDirection: MoveDirection) {
    if (this._isKicking || this._isSwinging) return;
    this._isKicking = true;
    this.socket.emit('kick', { x: this.player.x, y: this.player.y, dir: facingDirection });
    this.player.setVisible(false);

    const kick = this.scene.add.sprite(this.player.x, this.player.y, 'professor-slash')
      .setDepth(6)
      .setDisplaySize(128, 128);
    this._kickSprite = kick;
    kick.play(`professor-kick:${facingDirection}`);

    kick.once('animationcomplete', () => {
      kick.destroy();
      this._kickSprite = null;
      this.player.setVisible(true);
      this._isKicking  = false;
      this.socket.emit('reinforceTerminal', { terminalId });
    });
  }

  private _showAttackHitbox(x: number, y: number, angle: number, isLunge: boolean) {
    const radius    = isLunge ? LUNGE_ATTACK_RADIUS    : QUICK_ATTACK_RADIUS;
    const halfAngle = isLunge ? LUNGE_ATTACK_HALF_ANGLE_RAD : QUICK_ATTACK_HALF_ANGLE_RAD;

    const g = this.scene.add.graphics().setDepth(30);
    g.lineStyle(2, 0xff2222, 1);
    g.fillStyle(0xff2222, 0.25);

    const steps = 16;
    const pts: { x: number; y: number }[] = [{ x, y }];
    for (let i = 0; i <= steps; i++) {
      const a = angle - halfAngle + (2 * halfAngle * i / steps);
      pts.push({ x: x + Math.cos(a) * radius, y: y + Math.sin(a) * radius });
    }
    pts.push({ x, y });

    g.strokePoints(pts, false);
    g.fillPoints(pts, true, false);
    this.scene.time.delayedCall(500, () => g.destroy());
  }
}
