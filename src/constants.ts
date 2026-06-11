import type { GateId } from './types';

// exporta regras compartilhadas com server
export {
  ATTACK_COOLDOWN_MS,
  HACK_FAIL_REGRESSION,
  HACK_FAIL_LOCK_MS,
  HACK_AMOUNT_MAX,
  LUNGE_THRESHOLD_MS,
  LUNGE_MAX_HOLD_MS,
  QUICK_ATTACK_RADIUS,
  QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS,
  LUNGE_ATTACK_HALF_ANGLE_RAD,
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  BLOODLUST_SPEED_BONUS_PX_S,
  GATE_TICK_MS,
  GATE_TICK_AMOUNT,
  ENDGAME_DURATION_MS,
  BLEED_OUT_MS,
  HEAL_FAIL_REGRESSION,
  HEAL_FAIL_LOCK_MS,
  HEAL_AMOUNT_MAX,
  HEAL_SELF_CAP,
  MAX_PLAYERS_PER_ROOM,
  MIN_SURVIVORS_TO_START,
  TERMINAL_SPAWN_POOL,
} from '../shared/gameRules';

//  mundo 
export const WORLD_WIDTH  = 1600;
export const WORLD_HEIGHT = 1200;
export const MAP_SCALE    = 2; // 16x16 -> 32x32 visual

//  movimento
export const PLAYER_SPEED          = 107;   // 56.5% of sprint (DBD walk ratio)
export const PLAYER_SPRINT_SPEED   = 189;   // 100% — survivor running (4.0 m/s equivalent)
export const PROFESSOR_SPEED       = 208;   // 110% of survivor run (DBD 4.4 m/s killer)
export const ON_HIT_SPRINT_SPEED   = 312;   // 165% of survivor run (DBD on-hit sprint)
export const ON_HIT_SPRINT_MS      = 1800;  // duration of on-hit speed boost

export const SCRATCH_MARKS_SELF_VISIBLE = true; // false = DBD-authentic (survivor can't see own marks)

//  interacoes 
export const INTERACT_RADIUS      = 48;   // px
export const GATE_INTERACT_RADIUS = 96;   // px — botão fica na parede, player não chega perto
export const SKILL_CHECK_WINDOW = 0.15; // parte do circulo q conta como acerto
export const STAGGER_MS         = 1500; // tempo que o professor fica parado depois de atacar
export const MOVE_EMIT_RATE_MS  = 33;   // ~30 update de rede por segundo

//Hack
export const HACK_PASSIVE_TICK    = 1.0;   // % por tick passivo (+50% vs original 0.667)
export const HACK_PASSIVE_RATE_MS = 600;   // intervalo do tick passivo
export const HACK_GREAT_BONUS     = 1.5;   // % extra no great (+50% vs original 1%)

//  Heal
export const HEAL_PASSIVE_TICK     = 5;
export const HEAL_PASSIVE_RATE_MS  = 1_000;
export const HEAL_GREAT_BONUS      = 10;
export const HEAL_SELF_RATE_FACTOR = 0.5;
export const CRAWL_SPEED_FACTOR    = 0.28;
export const GHOST_SPEED_FACTOR    = 1.8;

//  terror radius (professor)
export const TERROR_RADIUS = 450; // px — raio do terror do professor

//  visao (fov)
export const FOV_PROFESSOR = 380;
export const FOV_SURVIVOR  = 230;
export const FOV_PROFESSOR_CONE_DEG = 80;

export const TILE_WORLD_SIZE = 32; // 16px tile × MAP_SCALE 2

export const FOV_BLOCKING_LAYERS = new Set([
  'Parede',
]);

//  voz
export const VOICE_SURVIVOR_HEAR_RADIUS = 200;
export const ROOM_NAMES = ['sala1', 'sala2', 'sala3', 'sala4'] as const;
export type  RoomName   = typeof ROOM_NAMES[number];

//  cores
export const COLOR_SELF_SURVIVOR  = 0x4fc3f7;
export const COLOR_SELF_PROF      = 0xe94560;
export const COLOR_OTHER_SURVIVOR = 0x81c995;
export const COLOR_OTHER_PROF     = 0xff6b6b;
export const COLOR_TERMINAL_IDLE  = 0xaaaaaa;
export const COLOR_TERMINAL_DONE  = 0x00e676;

//  spawn points dos sobreviventes
export const SURVIVOR_SPAWN_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  // Ala superior-esquerda
  { x: 992,  y: 256  },
  { x: 1312, y: 448  },
  // Corredor esquerdo
  { x: 672,  y: 2208 },
  { x: 672,  y: 2560 },
  { x: 1056, y: 2208 },
  // Ala inferior-esquerda
  { x: 672,  y: 3200 },
  { x: 1360, y: 3696 },
  // Ala superior-centro
  { x: 1760, y: 800  },
  { x: 1216, y: 1120 },
  { x: 1760, y: 1760 },
  // Centro
  { x: 1840, y: 2800 },
  // Ala inferior
  { x: 2224, y: 3728 },
  // Ala direita
  { x: 2928, y: 208  },
  { x: 2656, y: 1504 },
  { x: 2880, y: 2208 },
  { x: 2928, y: 3056 },
];

//  gates
export const GATE_POSITIONS: Record<GateId, { x: number; y: number }> = {
  g1: { x: 14 * 32 + 16, y: 46 * 32 + 16 },
  g2: { x: 93 * 32 + 16, y: 94 * 32 + 16 },
};

export const GATE_TILE_RANGES: Record<GateId, { col: number; rowStart: number; rowEnd: number }> = {
  g1: { col: 12, rowStart: 70, rowEnd: 75 },
  g2: { col: 12, rowStart: 47, rowEnd: 52 },
};

export const FEIRA_PRODUCT_ID  = 0;
export const GOOGLE_CLIENT_ID  = '331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com';
