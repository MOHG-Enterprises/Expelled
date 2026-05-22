import Phaser from 'phaser';
import { INTERACT_RADIUS } from '../constants';
import type { PlayerState, Role } from '../types';
import {
  applySkinToSprite,
  applyDownedFrame,
  getSkinForRole,
  type MoveDirection,
  playRoleAnimation,
  playCombatAnimation,
  playHurtFallAnimation,
} from './playerSkins';

interface RemotePlayer {
  sprite: Phaser.GameObjects.Sprite;
  role: Role;
  facingDirection: MoveDirection;
  lastMoveAt: number;
  isCharging: boolean;
  isDowned: boolean;
}

export class PlayerManager {
  private scene:  Phaser.Scene;
  private others: Record<string, RemotePlayer> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getOrCreate(id: string, data: Partial<PlayerState>): Phaser.GameObjects.Sprite {
    if (!this.others[id]) {
      const role: Role = data.role ?? 'survivor';
      const fallbackSkin = getSkinForRole(role);
      const sprite = this.scene.add.sprite(data.x ?? 100, data.y ?? 100, fallbackSkin.idle.key).setDepth(5);
      applySkinToSprite(sprite, role);
      this.others[id] = {
        sprite,
        role,
        facingDirection: 'down',
        lastMoveAt: 0,
        isCharging: false,
        isDowned: false,
      };
      playRoleAnimation(sprite, role, 'idle', 'down');
    }

    if (data.role && this.others[id].role !== data.role) {
      this.others[id].role = data.role;
      applySkinToSprite(this.others[id].sprite, data.role);
      playRoleAnimation(this.others[id].sprite, data.role, 'idle', this.others[id].facingDirection);
    }

    return this.others[id].sprite;
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
        const skin = getSkinForRole(tracked.role);
        const hurtFallKey = `${skin.id}:hurt-fall`;
        const hurtFallPlaying = tracked.sprite.anims.currentAnim?.key === hurtFallKey && tracked.sprite.anims.isPlaying;
        if (!hurtFallPlaying) {
          applyDownedFrame(tracked.sprite, tracked.role, tracked.facingDirection);
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
        playRoleAnimation(tracked.sprite, tracked.role, moveAnim, tracked.facingDirection);
      }
    }
  }

  setDowned(id: string, downed: boolean) {
    const p = this.others[id];
    if (!p || p.role !== 'survivor') return;
    p.isDowned = downed;
    if (downed) {
      playHurtFallAnimation(p.sprite, p.role, p.facingDirection);
    } else {
      applySkinToSprite(p.sprite, p.role);
      playRoleAnimation(p.sprite, p.role, 'idle', p.facingDirection);
    }
  }

  setCharging(id: string, charging: boolean) {
    const p = this.others[id];
    if (!p || p.role !== 'professor') return;
    p.isCharging = charging;
    if (charging) {
      playCombatAnimation(p.sprite, p.role, p.facingDirection);
    } else {
      playRoleAnimation(p.sprite, p.role, 'idle', p.facingDirection);
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
      if (this.others[id]) this.others[id].sprite.setVisible(true);
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
      if (this.others[id]) this.others[id].sprite.setVisible(true);
    });
  }

  playStagger(id: string, ms: number) {
    const p = this.others[id];
    if (!p || p.role !== 'professor') return;
    if (!this.scene.textures.exists('professor-hurt')) return;
    p.sprite.setTexture('professor-hurt', 0);
    this.scene.time.delayedCall(ms, () => {
      if (!this.others[id]) return;
      applySkinToSprite(p.sprite, p.role);
      playRoleAnimation(p.sprite, p.role, 'idle', p.facingDirection);
    });
  }

  update(now: number) {
    Object.values(this.others).forEach((player) => {
      if (player.isDowned || player.isCharging) return;
      if (now - player.lastMoveAt > 120) {
        playRoleAnimation(player.sprite, player.role, 'idle', player.facingDirection);
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
