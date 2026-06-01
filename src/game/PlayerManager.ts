import Phaser from 'phaser';
import { INTERACT_RADIUS } from '../constants';
import type { PlayerState, Role } from '../types';
import {
  applySkinByIdToSprite,
  applyDownedFrameById,
  getSkinById,
  playSkinAnimation,
  playCombatAnimation,
  playHurtFallById,
  type MoveDirection,
} from './playerSkins';

interface RemotePlayer {
  sprite:          Phaser.GameObjects.Sprite;
  role:            Role;
  skinId:          string;
  facingDirection: MoveDirection;
  lastMoveAt:      number;
  isCharging:      boolean;
  isDowned:        boolean;
  pendingStagger:  boolean;
  staggerMs:       number;
  isPlayingHurt:   boolean;
}

export class PlayerManager {
  private scene:  Phaser.Scene;
  private others: Record<string, RemotePlayer> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getOrCreate(id: string, data: Partial<PlayerState>): Phaser.GameObjects.Sprite {
    if (!this.others[id]) {
      const role: Role  = data.role ?? 'survivor';
      const skinId      = role === 'professor' ? 'professor' : (data.skinId || 'arthur');
      const skin        = getSkinById(skinId);
      const sprite      = this.scene.add.sprite(data.x ?? 100, data.y ?? 100, skin.idle.key).setDepth(5);
      applySkinByIdToSprite(sprite, skinId);
      this.others[id] = {
        sprite,
        role,
        skinId,
        facingDirection: 'down',
        lastMoveAt: 0,
        isCharging: false,
        isDowned: false,
        pendingStagger: false,
        staggerMs: 0,
        isPlayingHurt: false,
      };
      playSkinAnimation(sprite, skinId, 'idle', 'down');
    }

    const tracked = this.others[id];

    if (data.role && tracked.role !== data.role) {
      tracked.role   = data.role;
      tracked.skinId = data.role === 'professor' ? 'professor' : (data.skinId || 'arthur');
      applySkinByIdToSprite(tracked.sprite, tracked.skinId);
      playSkinAnimation(tracked.sprite, tracked.skinId, 'idle', tracked.facingDirection);
    } else if (data.skinId && data.skinId !== tracked.skinId && tracked.role !== 'professor') {
      tracked.skinId = data.skinId;
      applySkinByIdToSprite(tracked.sprite, tracked.skinId);
      playSkinAnimation(tracked.sprite, tracked.skinId, 'idle', tracked.facingDirection);
    }

    return tracked.sprite;
  }

  move(id: string, x: number, y: number, sprinting?: boolean, dir?: MoveDirection) {
    const sprite = this.getOrCreate(id, { x, y });
    const tracked = this.others[id];
    const dx = x - sprite.x;
    const dy = y - sprite.y;
    sprite.setPosition(x, y);

    if (tracked.isDowned) {
      if (dx !== 0 || dy !== 0) {
        if (dir) {
          tracked.facingDirection = dir;
        } else if (Math.abs(dx) > Math.abs(dy)) {
          tracked.facingDirection = dx > 0 ? 'right' : 'left';
        } else {
          tracked.facingDirection = dy > 0 ? 'down' : 'up';
        }
        const skin = getSkinById(tracked.skinId);
        const hurtFallKey = `${skin.id}:hurt-fall`;
        const hurtFallPlaying = tracked.sprite.anims.currentAnim?.key === hurtFallKey && tracked.sprite.anims.isPlaying;
        if (!hurtFallPlaying) {
          applyDownedFrameById(tracked.sprite, tracked.skinId, tracked.facingDirection);
        }
      }
      return;
    }

    if (dx !== 0 || dy !== 0) {
      if (dir) {
        tracked.facingDirection = dir;
      } else if (Math.abs(dx) > Math.abs(dy)) {
        tracked.facingDirection = dx > 0 ? 'right' : 'left';
      } else {
        tracked.facingDirection = dy > 0 ? 'down' : 'up';
      }

      tracked.lastMoveAt = this.scene.time.now;

      if (tracked.isCharging) {
        playCombatAnimation(tracked.sprite, tracked.role, tracked.facingDirection);
      } else {
        const moveAnim = (tracked.role === 'survivor' && sprinting) ? 'run' : 'walk';
        playSkinAnimation(tracked.sprite, tracked.skinId, moveAnim, tracked.facingDirection);
      }
    }
  }

  setDowned(id: string, downed: boolean) {
    const p = this.others[id];
    if (!p || p.role !== 'survivor') return;
    p.isDowned = downed;
    if (downed) {
      playHurtFallById(p.sprite, p.skinId, p.facingDirection);
    } else {
      applySkinByIdToSprite(p.sprite, p.skinId);
      playSkinAnimation(p.sprite, p.skinId, 'idle', p.facingDirection);
    }
  }

  setCharging(id: string, charging: boolean) {
    const p = this.others[id];
    if (!p || p.role !== 'professor') return;
    p.isCharging = charging;
    if (charging) {
      playCombatAnimation(p.sprite, p.role, p.facingDirection);
    } else {
      playSkinAnimation(p.sprite, p.skinId, 'idle', p.facingDirection);
    }
  }

  playAttack(id: string, x: number, y: number, dir: MoveDirection) {
    const p = this.others[id];
    if (!p) return;
    p.sprite.setVisible(false);
    const slash = this.scene.add.sprite(x, y, 'professor-slash')
      .setDepth(6)
      .setDisplaySize(128, 128);
    slash.play(`professor-slash:${dir}`);
    slash.once('animationcomplete', () => {
      slash.destroy();
      if (!this.others[id]) return;
      const tracked = this.others[id];
      tracked.sprite.setVisible(true);
      if (tracked.pendingStagger) {
        tracked.pendingStagger = false;
        this._playHurtNow(id, tracked.staggerMs);
      } else {
        applySkinByIdToSprite(tracked.sprite, tracked.skinId);
        playSkinAnimation(tracked.sprite, tracked.skinId, 'idle', tracked.facingDirection);
      }
    });
  }

  playKick(id: string, x: number, y: number, dir: MoveDirection) {
    const p = this.others[id];
    if (!p) return;
    p.sprite.setVisible(false);
    const kick = this.scene.add.sprite(x, y, 'professor-slash')
      .setDepth(6)
      .setDisplaySize(128, 128);
    kick.play(`professor-kick:${dir}`);
    kick.once('animationcomplete', () => {
      kick.destroy();
      if (!this.others[id]) return;
      const tracked = this.others[id];
      tracked.sprite.setVisible(true);
      if (tracked.pendingStagger) {
        tracked.pendingStagger = false;
        this._playHurtNow(id, tracked.staggerMs);
      } else {
        applySkinByIdToSprite(tracked.sprite, tracked.skinId);
        playSkinAnimation(tracked.sprite, tracked.skinId, 'idle', tracked.facingDirection);
      }
    });
  }

  playStagger(id: string, ms: number) {
    const p = this.others[id];
    if (!p || p.role !== 'professor') return;
    if (!this.scene.textures.exists('professor-hurt')) return;
    if (p.sprite.visible) {
      this._playHurtNow(id, ms);
    } else {
      p.pendingStagger = true;
      p.staggerMs = ms;
    }
  }

  private _playHurtNow(id: string, ms: number) {
    const p = this.others[id];
    if (!p) return;
    p.isPlayingHurt = true;

    const key = 'professor:stagger';
    if (this.scene.anims.exists(key)) this.scene.anims.remove(key);
    this.scene.anims.create({
      key,
      frames: [
        { key: 'professor-hurt', frame: 0 },
        { key: 'professor-hurt', frame: 1 },
        { key: 'professor-hurt', frame: 2 },
        { key: 'professor-hurt', frame: 1 },
        { key: 'professor-hurt', frame: 0 },
      ],
      duration: ms,
      repeat: 0,
    });
    p.sprite.play(key);

    p.sprite.once('animationcomplete', () => {
      if (!this.others[id]) return;
      p.isPlayingHurt = false;
      applySkinByIdToSprite(p.sprite, p.skinId);
      playSkinAnimation(p.sprite, p.skinId, 'idle', p.facingDirection);
    });
  }

  updateFacing(id: string, dir: MoveDirection) {
    const p = this.others[id];
    if (!p || p.isDowned) return;
    p.facingDirection = dir;
    const isIdle = (this.scene.time.now - p.lastMoveAt) > 120;
    if (!isIdle || p.isPlayingHurt) return;
    if (p.isCharging) {
      playCombatAnimation(p.sprite, p.role, dir);
    } else {
      playSkinAnimation(p.sprite, p.skinId, 'idle', dir);
    }
  }

  update(now: number) {
    Object.values(this.others).forEach((player) => {
      if (player.isDowned || player.isCharging || player.isPlayingHurt) return;
      if (now - player.lastMoveAt > 120) {
        playSkinAnimation(player.sprite, player.skinId, 'idle', player.facingDirection);
      }
    });
  }

  remove(id: string) {
    this.others[id]?.sprite.destroy();
    delete this.others[id];
  }

  setAlpha(id: string, alpha: number) {
    this.others[id]?.sprite.setAlpha(alpha);
  }

  setVisible(id: string, visible: boolean) {
    this.others[id]?.sprite.setVisible(visible);
  }

  getPosition(id: string): { x: number; y: number } | null {
    const tracked = this.others[id];
    if (!tracked) return null;
    return { x: tracked.sprite.x, y: tracked.sprite.y };
  }

  getFacingDirection(id: string): MoveDirection | null {
    const p = this.others[id];
    return p ? p.facingDirection : null;
  }

  getPositions(): Record<string, { x: number; y: number }> {
    const result: Record<string, { x: number; y: number }> = {};
    Object.entries(this.others).forEach(([id, p]) => {
      result[id] = { x: p.sprite.x, y: p.sprite.y };
    });
    return result;
  }

  getProfessorPosition(): { x: number; y: number } | null {
    for (const p of Object.values(this.others)) {
      if (p.role === 'professor') return { x: p.sprite.x, y: p.sprite.y };
    }
    return null;
  }

  nearestSurvivor(x: number, y: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    Object.keys(this.others).forEach((id) => {
      const p = this.others[id];
      if (p.role !== 'survivor') return;
      const d = Phaser.Math.Distance.Between(x, y, p.sprite.x, p.sprite.y);
      if (d < INTERACT_RADIUS && d < bestDist) { best = id; bestDist = d; }
    });
    return best;
  }
}
