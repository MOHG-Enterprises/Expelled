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
  combat?: LpcSheet;
  hurt?: { key: string; path: string };
  icon?:     { key: string; path: string };
  iconHurt?: { key: string; path: string };
  displayWidth: number;
  displayHeight: number;
  bodyOffset: { x: number; y: number };
  frameRates?: Partial<Record<AnimationState, number>>;
}

export const DOWNED_DIRECTION_FRAMES: Record<MoveDirection, number> = {
  right: 6, left: 7, up: 8, down: 5,
};

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
    idle:   { key: 'professor-idle',   path: './personagens/professor/idle.png',   totalCols: 13, animCols: 2 },
    walk:   { key: 'professor-walk',   path: './personagens/professor/walk.png',   totalCols: 13, animCols: 9 },
    run:    { key: 'professor-run',    path: './personagens/professor/run.png',    totalCols: 13, animCols: 6 },
    sit:    { key: 'professor-sit',    path: './personagens/professor/sit.png',    totalCols: 13, animCols: 3 },
    combat: { key: 'professor-combat', path: './personagens/professor/combat.png', totalCols: 13, animCols: 2 },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
    frameRates: { walk: 14 },
  },
  arthur: {
    id: 'arthur',
    frameSize: 64,
    idle: { key: 'arthur-idle', path: './personagens/arthur/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'arthur-walk', path: './personagens/arthur/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'arthur-run',  path: './personagens/arthur/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'arthur-sit',  path: './personagens/arthur/sit.png',  totalCols: 13, animCols: 3 },
    hurt: { key: 'arthur-hurt', path: './personagens/arthur/hurt.png' },
    icon:     { key: 'arthur-icon',      path: './personagens/arthur/icons/Arthur_Icon.png' },
    iconHurt: { key: 'arthur-icon-hurt', path: './personagens/arthur/icons/Arthur_Icon_Hurt.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
  gustavo: {
    id: 'gustavo',
    frameSize: 64,
    idle: { key: 'gustavo-idle', path: './personagens/gustavo/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'gustavo-walk', path: './personagens/gustavo/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'gustavo-run',  path: './personagens/gustavo/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'gustavo-sit',  path: './personagens/gustavo/sit.png',  totalCols: 13, animCols: 3 },
    hurt: { key: 'gustavo-hurt', path: './personagens/gustavo/hurt.png' },
    icon:     { key: 'gustavo-icon',      path: './personagens/gustavo/icons/Gustavo_Icon.png' },
    iconHurt: { key: 'gustavo-icon-hurt', path: './personagens/gustavo/icons/Gustavo_Icon_Hurt.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
  giu: {
    id: 'giu',
    frameSize: 64,
    idle: { key: 'giu-idle', path: './personagens/giu/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'giu-walk', path: './personagens/giu/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'giu-run',  path: './personagens/giu/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'giu-sit',  path: './personagens/giu/sit.png',  totalCols: 13, animCols: 3 },
    hurt: { key: 'giu-hurt', path: './personagens/giu/hurt.png' },
    icon:     { key: 'giu-icon',      path: './personagens/giu/icons/Giu_Icon.png' },
    iconHurt: { key: 'giu-icon-hurt', path: './personagens/giu/icons/Giu_Icon_Hurt.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
  isabela: {
    id: 'isabela',
    frameSize: 64,
    idle: { key: 'isabela-idle', path: './personagens/isabela/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'isabela-walk', path: './personagens/isabela/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'isabela-run',  path: './personagens/isabela/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'isabela-sit',  path: './personagens/isabela/sit.png',  totalCols: 13, animCols: 3 },
    hurt: { key: 'isabela-hurt', path: './personagens/isabela/hurt.png' },
    icon:     { key: 'isabela-icon',      path: './personagens/isabela/icons/Isabela_Icon.png' },
    iconHurt: { key: 'isabela-icon-hurt', path: './personagens/isabela/icons/Isabela_Icon_Hurt.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
  davi: {
    id: 'davi',
    frameSize: 64,
    idle: { key: 'davi-idle', path: './personagens/davi/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'davi-walk', path: './personagens/davi/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'davi-run',  path: './personagens/davi/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'davi-sit',  path: './personagens/davi/sit.png',  totalCols: 13, animCols: 3 },
    hurt: { key: 'davi-hurt', path: './personagens/davi/hurt.png' },
    icon:     { key: 'davi-icon',      path: './personagens/davi/icons/Davi_Icon.png' },
    iconHurt: { key: 'davi-icon-hurt', path: './personagens/davi/icons/Davi_Icon_Hurt.png' },
    displayWidth: 64,
    displayHeight: 64,
    bodyOffset: { x: 16, y: 10 },
  },
  caio: {
    id: 'caio',
    frameSize: 64,
    idle: { key: 'caio-idle', path: './personagens/caio/idle.png', totalCols: 13, animCols: 2 },
    walk: { key: 'caio-walk', path: './personagens/caio/walk.png', totalCols: 13, animCols: 9 },
    run:  { key: 'caio-run',  path: './personagens/caio/run.png',  totalCols: 13, animCols: 6 },
    sit:  { key: 'caio-sit',  path: './personagens/caio/sit.png',  totalCols: 13, animCols: 3 },
    hurt: { key: 'caio-hurt', path: './personagens/caio/hurt.png' },
    icon:     { key: 'caio-icon',      path: './personagens/caio/icons/Caio_Icon.png' },
    iconHurt: { key: 'caio-icon-hurt', path: './personagens/caio/icons/Caio_Icon_Hurt.png' },
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
    if (skin.combat && !scene.textures.exists(skin.combat.key)) {
      scene.load.spritesheet(skin.combat.key, skin.combat.path, {
        frameWidth: skin.frameSize,
        frameHeight: skin.frameSize,
      });
    }
    if (skin.hurt && !scene.textures.exists(skin.hurt.key)) {
      scene.load.spritesheet(skin.hurt.key, skin.hurt.path, {
        frameWidth: skin.frameSize,
        frameHeight: skin.frameSize,
      });
    }
    if (skin.icon && !scene.textures.exists(skin.icon.key)) {
      scene.load.image(skin.icon.key, skin.icon.path);
    }
    if (skin.iconHurt && !scene.textures.exists(skin.iconHurt.key)) {
      scene.load.image(skin.iconHurt.key, skin.iconHurt.path);
    }
  });
}

export function getSkinForRole(role: Role): PlayerSkin {
  const skinId = ROLE_DEFAULT_SKINS[role];
  return PLAYER_SKINS[skinId] ?? PLAYER_SKINS.arthur;
}

export function getSkinById(skinId: string): PlayerSkin {
  return PLAYER_SKINS[skinId] ?? PLAYER_SKINS.arthur;
}

function animationKey(skin: PlayerSkin, state: AnimationState, direction: MoveDirection): string {
  return `${skin.id}:${state}:${direction}`;
}

function ensureSkinAnimations(scene: Phaser.Scene, skin: PlayerSkin): void {
  (Object.keys(DIRECTION_ROWS) as MoveDirection[]).forEach((direction) => {
    const row = DIRECTION_ROWS[direction];

    const sheets: [AnimationState, LpcSheet, number][] = [
      ['idle', skin.idle, skin.frameRates?.idle ?? 8],
      ['walk', skin.walk, skin.frameRates?.walk ?? 10],
      ['run',  skin.run,  skin.frameRates?.run  ?? 12],
      ['sit',  skin.sit,  skin.frameRates?.sit  ?? 6],
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

    if (skin.combat) {
      const combatKey = `${skin.id}:combat:${direction}`;
      if (!scene.anims.exists(combatKey)) {
        scene.anims.create({
          key: combatKey,
          frames: scene.anims.generateFrameNumbers(skin.combat.key, {
            start: row * skin.combat.totalCols,
            end:   row * skin.combat.totalCols + skin.combat.animCols - 1,
          }),
          frameRate: 8,
          repeat: -1,
        });
      }
    }
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

export function applySkinByIdToSprite(sprite: Phaser.GameObjects.Sprite, skinId: string): void {
  const skin = getSkinById(skinId);
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

export function playSkinAnimation(
  sprite:    Phaser.GameObjects.Sprite,
  skinId:    string,
  state:     AnimationState,
  direction: MoveDirection,
): void {
  const skin = getSkinById(skinId);
  sprite.play(animationKey(skin, state, direction), true);
}

export function playCombatAnimation(
  sprite: Phaser.GameObjects.Sprite,
  role: Role,
  direction: MoveDirection,
): boolean {
  const skin = getSkinForRole(role);
  if (!skin.combat) return false;
  const key = `${skin.id}:combat:${direction}`;
  if (!sprite.scene.anims.exists(key)) return false;
  sprite.play(key, true);
  return true;
}

export function applyDownedFrame(
  sprite: Phaser.GameObjects.Sprite,
  role: Role,
  direction: MoveDirection,
): boolean {
  const skin = getSkinForRole(role);
  if (!skin.hurt || !sprite.scene.textures.exists(skin.hurt.key)) return false;
  sprite.stop();
  sprite.setTexture(skin.hurt.key, DOWNED_DIRECTION_FRAMES[direction]);
  return true;
}

export function applyDownedFrameById(
  sprite:    Phaser.GameObjects.Sprite,
  skinId:    string,
  direction: MoveDirection,
): boolean {
  const skin = getSkinById(skinId);
  if (!skin.hurt || !sprite.scene.textures.exists(skin.hurt.key)) return false;
  sprite.stop();
  sprite.setTexture(skin.hurt.key, DOWNED_DIRECTION_FRAMES[direction]);
  return true;
}

export function playHurtFallAnimation(
  sprite: Phaser.GameObjects.Sprite,
  role: Role,
  direction: MoveDirection,
): void {
  const skin = getSkinForRole(role);
  if (!skin.hurt || !sprite.scene.textures.exists(skin.hurt.key)) {
    applyDownedFrame(sprite, role, direction);
    return;
  }
  const key = `${skin.id}:hurt-fall`;
  if (!sprite.scene.anims.exists(key)) {
    sprite.scene.anims.create({
      key,
      frames: sprite.scene.anims.generateFrameNumbers(skin.hurt.key, { start: 0, end: 5 }),
      frameRate: 12,
      repeat: 0,
    });
  }
  sprite.once(`animationcomplete-${key}`, () => {
    if (sprite.active) applyDownedFrame(sprite, role, direction);
  });
  sprite.play(key);
}

export function playHurtFallById(
  sprite:    Phaser.GameObjects.Sprite,
  skinId:    string,
  direction: MoveDirection,
): void {
  const skin = getSkinById(skinId);
  if (!skin.hurt || !sprite.scene.textures.exists(skin.hurt.key)) {
    applyDownedFrameById(sprite, skinId, direction);
    return;
  }
  const key = `${skin.id}:hurt-fall`;
  if (!sprite.scene.anims.exists(key)) {
    sprite.scene.anims.create({
      key,
      frames: sprite.scene.anims.generateFrameNumbers(skin.hurt.key, { start: 0, end: 5 }),
      frameRate: 12,
      repeat: 0,
    });
  }
  sprite.once(`animationcomplete-${key}`, () => {
    if (sprite.active) applyDownedFrameById(sprite, skinId, direction);
  });
  sprite.play(key);
}
