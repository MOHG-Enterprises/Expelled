import Phaser from 'phaser';
import type { Role } from '../types';

export type MoveDirection = 'down' | 'left' | 'right' | 'up';
export type AnimationState = 'idle' | 'walk' | 'run' | 'sit';

export interface LpcSheet {
  key: string;
  path: string;
  totalCols: number;
  animCols: number;
}

export interface PlayerSkin {
  id: string;
  frameSize: number;
  idle: LpcSheet;
  walk: LpcSheet;
  run: LpcSheet;
  sit: LpcSheet;
  icon: { key: string; path: string };
  displayWidth: number;
  displayHeight: number;
  bodyOffset: { x: number; y: number };
}

// Universal LPC Spritesheet Generator row order
const DIRECTION_ROWS: Record<MoveDirection, number> = {
  up: 0,
  left: 1,
  down: 2,
  right: 3,
};

export const PLAYER_SKINS: Record<string, PlayerSkin> = {
  professor: {
    id: 'professor',
    frameSize: 64,
    idle: { key: 'professor-idle', path: '/personagens/professor/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'professor-walk', path: '/personagens/professor/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'professor-run',  path: '/personagens/professor/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'professor-sit',  path: '/personagens/professor/sit.png',  totalCols: 13, animCols: 3 },
    icon: { key: 'professor-icon', path: '/personagens/professor/icon.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
  arthur: {
    id: 'arthur',
    frameSize: 64,
    idle: { key: 'arthur-idle', path: '/personagens/arthur/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'arthur-walk', path: '/personagens/arthur/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'arthur-run',  path: '/personagens/arthur/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'arthur-sit',  path: '/personagens/arthur/sit.png',  totalCols: 13, animCols: 3 },
    icon: { key: 'arthur-icon', path: '/personagens/arthur/icon.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
  gustavo: {
    id: 'gustavo',
    frameSize: 64,
    idle: { key: 'gustavo-idle', path: '/personagens/gustavo/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'gustavo-walk', path: '/personagens/gustavo/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'gustavo-run',  path: '/personagens/gustavo/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'gustavo-sit',  path: '/personagens/gustavo/sit.png',  totalCols: 13, animCols: 3 },
    icon: { key: 'gustavo-icon', path: '/personagens/gustavo/icon.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
};

export const ROLE_DEFAULT_SKINS: Record<Role, string> = {
  professor: 'professor',
  survivor: 'arthur',
};

export function preloadPlayerSkins(scene: Phaser.Scene): void {
  Object.values(PLAYER_SKINS).forEach((skin) => {
    for (const sheet of [skin.idle, skin.walk, skin.run, skin.sit]) {
      if (!scene.textures.exists(sheet.key)) {
        scene.load.spritesheet(sheet.key, sheet.path, {
          frameWidth: skin.frameSize,
          frameHeight: skin.frameSize,
        });
      }
    }
    if (!scene.textures.exists(skin.icon.key)) {
      scene.load.image(skin.icon.key, skin.icon.path);
    }
  });
}

export function getSkinForRole(role: Role): PlayerSkin {
  const skinId = ROLE_DEFAULT_SKINS[role];
  return PLAYER_SKINS[skinId] ?? PLAYER_SKINS.arthur;
}

function animationKey(skin: PlayerSkin, state: AnimationState, direction: MoveDirection): string {
  return `${skin.id}:${state}:${direction}`;
}

function ensureSkinAnimations(scene: Phaser.Scene, skin: PlayerSkin): void {
  (Object.keys(DIRECTION_ROWS) as MoveDirection[]).forEach((direction) => {
    const row = DIRECTION_ROWS[direction];

    const sheets: [AnimationState, LpcSheet, number][] = [
      ['idle', skin.idle, 8],
      ['walk', skin.walk, 10],
      ['run',  skin.run,  12],
      ['sit',  skin.sit,  6],
    ];

    sheets.forEach(([state, sheet, frameRate]) => {
      const key = animationKey(skin, state, direction);
      if (!scene.anims.exists(key)) {
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(sheet.key, {
            start: row * sheet.totalCols,
            end:   row * sheet.totalCols + sheet.animCols - 1,
          }),
          frameRate,
          repeat: -1,
        });
      }
    });
  });
}

export function ensurePlayerSkinAnimations(scene: Phaser.Scene): void {
  Object.values(PLAYER_SKINS).forEach((skin) => ensureSkinAnimations(scene, skin));
}

export function applySkinToSprite(sprite: Phaser.GameObjects.Sprite, role: Role): void {
  const skin = getSkinForRole(role);
  sprite.setTexture(skin.idle.key);
  sprite.setDisplaySize(skin.displayWidth, skin.displayHeight);
}

export function playRoleAnimation(
  sprite: Phaser.GameObjects.Sprite,
  role: Role,
  state: AnimationState,
  direction: MoveDirection,
): void {
  const skin = getSkinForRole(role);
  sprite.play(animationKey(skin, state, direction), true);
}
