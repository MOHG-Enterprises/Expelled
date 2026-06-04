import Phaser from 'phaser';
import {
  PLAYER_SPEED, PLAYER_SPRINT_SPEED, PROFESSOR_SPEED,
  ON_HIT_SPRINT_SPEED, CRAWL_SPEED_FACTOR, GHOST_SPEED_FACTOR,
  BLOODLUST_SPEED_BONUS_PX_S,
} from '../constants';
import type { Role } from '../types';
import type { InputState } from './InputManager';
import {
  applyDownedFrameById, playCombatAnimationById, playRoleAnimation, getSkinById,
  playSkinAnimation,
  type MoveDirection,
} from './playerSkins';

export interface MovementContext {
  role:              Role | null;
  downed:            boolean;
  sprinting:         boolean;
  onHitSprintTimer:  number;
  bloodlustTier:     0 | 1 | 2 | 3;
  attackHoldActive:  boolean;
  isSwinging:        boolean;
  skinId:            string;
  ghost:             boolean;
}

export class MovementSystem {
  private player: Phaser.Physics.Arcade.Sprite;

  private _slidAxis:       'x' | 'y' | null = null;
  private _slidHysteresis  = 0;

  facingDirection: MoveDirection = 'down';
  targetLookAngle  = 0;
  lookAngle        = 0;

  constructor(player: Phaser.Physics.Arcade.Sprite) {
    this.player = player;
  }

  reset() {
    this._slidAxis       = null;
    this._slidHysteresis = 0;
    this.facingDirection = 'down';
    this.targetLookAngle = 0;
    this.lookAngle       = 0;
  }

  update(
    input: InputState,
    ctx: MovementContext,
    pad: Phaser.Input.Gamepad.Gamepad | null,
    delta: number,
  ): { vx: number; vy: number; intendedToMove: boolean } {
    let { vx, vy, analogScale } = input;
    const intendedToMove = vx !== 0 || vy !== 0;

    let speed: number;
    if (ctx.role === 'professor') {
      speed = PROFESSOR_SPEED + BLOODLUST_SPEED_BONUS_PX_S[ctx.bloodlustTier];
      if (ctx.attackHoldActive && !ctx.isSwinging) speed *= 1.5;
    } else {
      if (ctx.ghost) {
        speed = PLAYER_SPEED * GHOST_SPEED_FACTOR;
      } else if (ctx.downed) {
        speed = PLAYER_SPEED * CRAWL_SPEED_FACTOR;
      } else if (ctx.onHitSprintTimer > 0) {
        speed = ON_HIT_SPRINT_SPEED;
      } else {
        speed = ctx.sprinting ? PLAYER_SPRINT_SPEED : PLAYER_SPEED;
      }
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const slidX = (body.blocked.left && vx < 0) || (body.blocked.right && vx > 0);
    const slidY = (body.blocked.up   && vy < 0) || (body.blocked.down  && vy > 0);
    if (slidX) vx = 0;
    if (slidY) vy = 0;
    if      (slidX && !slidY) { this._slidAxis = 'x'; this._slidHysteresis = 4; }
    else if (slidY && !slidX) { this._slidAxis = 'y'; this._slidHysteresis = 4; }
    else if (!slidX && !slidY) {
      if (this._slidHysteresis > 0) this._slidHysteresis--;
      else this._slidAxis = null;
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed * analogScale;
      vy = (vy / len) * speed * analogScale;
      this.targetLookAngle = Math.atan2(vy, vx);
      if      (this._slidAxis === 'y' && vx !== 0) this.facingDirection = vx > 0 ? 'right' : 'left';
      else if (this._slidAxis === 'x' && vy !== 0) this.facingDirection = vy > 0 ? 'down' : 'up';
      else if (Math.abs(vx) > Math.abs(vy))        this.facingDirection = vx > 0 ? 'right' : 'left';
      else                                          this.facingDirection = vy > 0 ? 'down' : 'up';
    }

    if (ctx.role === 'professor') {
      if (input.lookAngle !== undefined) {
        this.targetLookAngle = input.lookAngle;
        const dx = Math.cos(input.lookAngle);
        const dy = Math.sin(input.lookAngle);
        if (Math.abs(dx) >= Math.abs(dy)) this.facingDirection = dx > 0 ? 'right' : 'left';
        else this.facingDirection = dy > 0 ? 'down' : 'up';
      } else if (!input.isTouchInput && pad !== null) {
        const PAD_DEADZONE = 0.2;
        const rx = pad.rightStick.x;
        const ry = pad.rightStick.y;
        if (Math.abs(rx) > PAD_DEADZONE || Math.abs(ry) > PAD_DEADZONE) {
          this.targetLookAngle = Math.atan2(ry, rx);
        }
      } else if (!input.isTouchInput) {
        const pointer = this.player.scene.input.activePointer;
        const cam = this.player.scene.cameras.main;
        const wp = cam.getWorldPoint(pointer.x, pointer.y);
        this.targetLookAngle = Math.atan2(wp.y - this.player.y, wp.x - this.player.x);
        const dx = wp.x - this.player.x;
        const dy = wp.y - this.player.y;
        if (Math.abs(dx) >= Math.abs(dy)) this.facingDirection = dx > 0 ? 'right' : 'left';
        else this.facingDirection = dy > 0 ? 'down' : 'up';
      }
    }

    this.smoothLookAngle(delta);

    return { vx, vy, intendedToMove };
  }

  applyVelocity(vx: number, vy: number) {
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
  }

  applyAnimation(ctx: MovementContext, intendedToMove: boolean) {
    const { role, downed, skinId, ghost } = ctx;
    if (!role) return;

    if (downed && !ghost && role === 'survivor') {
      const effectiveSkinId = skinId || 'arthur';
      const skin = getSkinById(effectiveSkinId);
      const hurtFallKey = `${skin.id}:hurt-fall`;
      const hurtFallPlaying = this.player.anims.currentAnim?.key === hurtFallKey && this.player.anims.isPlaying;
      if (!hurtFallPlaying) applyDownedFrameById(this.player, effectiveSkinId, this.facingDirection);
      return;
    }

    if (role === 'professor') {
      const effectiveSkinId = skinId || 'professor';
      const inCombatStance = ctx.attackHoldActive && !ctx.isSwinging;
      if (inCombatStance) {
        if (!playCombatAnimationById(this.player, effectiveSkinId, this.facingDirection)) {
          playSkinAnimation(this.player, effectiveSkinId, intendedToMove ? 'walk' : 'idle', this.facingDirection);
        }
      } else if (intendedToMove) {
        playSkinAnimation(this.player, effectiveSkinId, 'walk', this.facingDirection);
      } else {
        playSkinAnimation(this.player, effectiveSkinId, 'idle', this.facingDirection);
      }
      return;
    }

    const effectiveSkinId = skinId || 'arthur';
    if (intendedToMove) {
      const moveAnim = (ctx.sprinting || ctx.onHitSprintTimer > 0) ? 'run' : 'walk';
      playSkinAnimation(this.player, effectiveSkinId, moveAnim, this.facingDirection);
    } else {
      playSkinAnimation(this.player, effectiveSkinId, 'idle', this.facingDirection);
    }
  }

  private smoothLookAngle(delta: number) {
    const fullTurn = Math.PI * 2;
    let diff = this.targetLookAngle - this.lookAngle;
    while (diff > Math.PI)  diff -= fullTurn;
    while (diff < -Math.PI) diff += fullTurn;
    const smoothing = 1 - Math.pow(0.005, delta / 1000);
    let next = this.lookAngle + diff * smoothing;
    while (next > Math.PI)  next -= fullTurn;
    while (next < -Math.PI) next += fullTurn;
    this.lookAngle = next;
  }
}
