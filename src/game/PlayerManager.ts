import Phaser from 'phaser';
import { INTERACT_RADIUS } from '../constants';
import type { PlayerState, Role } from '../types';
import { applySkinToSprite, getSkinForRole, type MoveDirection, playRoleAnimation } from './playerSkins';

interface RemotePlayer {
  sprite: Phaser.GameObjects.Sprite;
  role: Role;
  facingDirection: MoveDirection;
  lastMoveAt: number;
}

export class PlayerManager {
  private scene:  Phaser.Scene;
  // lista dos outros players (menos o local)
  private others: Record<string, RemotePlayer> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getOrCreate(id: string, data: Partial<PlayerState>): Phaser.GameObjects.Sprite {
    // cria o boneco remoto se ainda n existir
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

  move(id: string, x: number, y: number) {
    // garante q existe e move
    const sprite = this.getOrCreate(id, { x, y });
    const tracked = this.others[id];
    const dx = x - sprite.x;
    const dy = y - sprite.y;
    sprite.setPosition(x, y);

    if (dx !== 0 || dy !== 0) {
      if (Math.abs(dx) > Math.abs(dy)) tracked.facingDirection = dx > 0 ? 'right' : 'left';
      else tracked.facingDirection = dy > 0 ? 'down' : 'up';

      tracked.lastMoveAt = this.scene.time.now;
      playRoleAnimation(tracked.sprite, tracked.role, 'walk', tracked.facingDirection);
    }
  }

  update(now: number) {
    Object.values(this.others).forEach((player) => {
      if (now - player.lastMoveAt > 120) {
        playRoleAnimation(player.sprite, player.role, 'idle', player.facingDirection);
      }
    });
  }

  remove(id: string) {
    // remove quando player sai
    this.others[id]?.sprite.destroy();
    delete this.others[id];
  }

  setAlpha(id: string, alpha: number) {
    this.others[id]?.sprite.setAlpha(alpha);
  }

  setVisible(id: string, visible: boolean) {
    this.others[id]?.sprite.setVisible(visible);
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
    // pega o survivor mais perto dentro do range de interacao
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
