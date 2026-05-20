// exporta regras compartilhadas com server
export {
  ATTACK_COOLDOWN_MS,
  DETENTION_SKILL_CHECKS_REQUIRED,
  HACK_FAIL_REGRESSION,
  HACK_FAIL_LOCK_MS,
  HACK_AMOUNT_MAX,
  ATTACK_HITBOX_WIDTH,
  ATTACK_HITBOX_DEPTH,
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  BLOODLUST_SPEED_BONUS_PX_S,
} from '../shared/gameRules';

//  mundo 
export const WORLD_WIDTH  = 1600;
export const WORLD_HEIGHT = 1200;
export const MAP_SCALE    = 2; // 16x16 -> 32x32 visual

//  movimento 
export const PLAYER_SPEED       = 160;
export const PLAYER_SPRINT_SPEED = 260;
export const PROFESSOR_SPEED    = 185;

//  stamina
export const STAMINA_MAX        = 100;
export const STAMINA_DRAIN      = 18;  // por segundo enquanto corre
export const STAMINA_REGEN      = 6;   // por segundo enquanto não corre
export const STAMINA_MIN_SPRINT = 10;  // vigor mínimo para começar a correr

//  interacoes 
export const INTERACT_RADIUS    = 48;   // px
export const SKILL_CHECK_WINDOW = 0.10; // parte do circulo q conta como acerto
export const STAGGER_MS         = 1500; // tempo que o professor fica parado depois de atacar
export const MOVE_EMIT_RATE_MS  = 33;   // ~30 update de rede por segundo

//Hack
export const HACK_PASSIVE_TICK    = 2;    // % por tick passivo
export const HACK_PASSIVE_RATE_MS = 600;  // intervalo do tick passivo
export const HACK_GREAT_BONUS     = 3;    // % extra no great


//  terror radius (professor)
export const TERROR_RADIUS = 450; // px — raio do terror do professor

//  visao (fov)
export const FOV_PROFESSOR = 460;
export const FOV_SURVIVOR  = 280;
export const FOV_PROFESSOR_CONE_DEG = 80;

export const TILE_WORLD_SIZE = 32; // 16px tile × MAP_SCALE 2

export const FOV_BLOCKING_LAYERS = new Set([
  'Parede',
  'PORTAO',
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
