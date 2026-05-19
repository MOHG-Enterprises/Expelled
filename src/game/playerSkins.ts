import Phaser from 'phaser';
import type { Role } from '../types';

export type MoveDirection = 'down' | 'left' | 'right' | 'up';
export type AnimationState = 'idle' | 'walk';

export interface PlayerSkin {
  id: string;
  textureKey: string;
  texturePath: string;
  frameWidth: number;
  frameHeight: number;
  walkFrameRanges: Record<MoveDirection, [number, number]>;
  idleFrameIndices: Record<MoveDirection, number>;
  displayWidth: number;
  displayHeight: number;
  bodyOffset: { x: number; y: number };
}

export const PLAYER_SKINS: Record<string, PlayerSkin> = {
  rodrigoSilva: {
    id: 'rodrigoSilva',
    textureKey: 'player-rodrigo-silva',
    texturePath: '/RodrigoSilva.png',
    frameWidth: 32,
    frameHeight: 32,
    walkFrameRanges: {
      down: [0, 4],
      left: [5, 10],
      right: [11, 16],
      up: [17, 22],
    },
    idleFrameIndices: {
      down: 23,
      left: 24,
      right: 25,
      up: 26,
    },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 8 },
  },
  sabrinaTorres: {
    id: 'sabrinaTorres',
    textureKey: 'player-sabrina-torres',
    texturePath: '/SabrinaTorres.png',
    frameWidth: 64,
    frameHeight: 64,
    walkFrameRanges: {
      down: [0, 4],
      left: [5, 10],
      right: [11, 16],
      up: [17, 22],
    },
    idleFrameIndices: {
      down: 23,
      left: 24,
      right: 25,
      up: 26,
    },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 16 },
  },
};

// Mapa de skin por role. Para trocar no futuro, so muda aqui
export const ROLE_DEFAULT_SKINS: Record<Role, string> = {
  professor: 'rodrigoSilva',
  survivor: 'sabrinaTorres',
};

const UNIQUE_SKINS = Object.values(PLAYER_SKINS).filter(
  (skin, index, all) => all.findIndex((candidate) => candidate.textureKey === skin.textureKey) === index,
);

export function preloadPlayerSkins(scene: Phaser.Scene): void {
  UNIQUE_SKINS.forEach((skin) => {
    if (!scene.textures.exists(skin.textureKey)) {
      scene.load.spritesheet(skin.textureKey, skin.texturePath, {
        frameWidth: skin.frameWidth,
        frameHeight: skin.frameHeight,
      });
    }
  });
}

export function getSkinForRole(role: Role): PlayerSkin {
  const skinId = ROLE_DEFAULT_SKINS[role];
  return PLAYER_SKINS[skinId] ?? PLAYER_SKINS.sabrinaTorres;
}

function animationKey(skin: PlayerSkin, state: AnimationState, direction: MoveDirection): string {
  return `${skin.textureKey}:${state}:${direction}`;
}

function ensureSkinAnimations(scene: Phaser.Scene, skin: PlayerSkin): void {
  (Object.keys(skin.walkFrameRanges) as MoveDirection[]).forEach((direction) => {
    const idleKey = animationKey(skin, 'idle', direction);
    if (!scene.anims.exists(idleKey)) {
      scene.anims.create({
        key: idleKey,
        frames: [{ key: skin.textureKey, frame: skin.idleFrameIndices[direction] }],
        frameRate: 1,
        repeat: -1,
      });
    }

    const walkKey = animationKey(skin, 'walk', direction);
    if (!scene.anims.exists(walkKey)) {
      const [start, end] = skin.walkFrameRanges[direction];
      scene.anims.create({
        key: walkKey,
        frames: scene.anims.generateFrameNumbers(skin.textureKey, {
          start,
          end,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
  });
}

export function ensurePlayerSkinAnimations(scene: Phaser.Scene): void {
  UNIQUE_SKINS.forEach((skin) => ensureSkinAnimations(scene, skin));
}

export function applySkinToSprite(sprite: Phaser.GameObjects.Sprite, role: Role): void {
  const skin = getSkinForRole(role);
  sprite.setTexture(skin.textureKey);
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