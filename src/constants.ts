// exporta regra compartilhada com server
export { ATTACK_COOLDOWN_MS, DETENTION_SKILL_CHECKS_REQUIRED } from '../shared/gameRules';

//  mundo 
export const WORLD_WIDTH  = 1600;
export const WORLD_HEIGHT = 1200;

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
export const HACK_TICK          = 20;   // progresso por skill check certo (5 acertos = 100%)
export const SKILL_CHECK_WINDOW = 0.18; // parte do circulo q conta como acerto
export const STAGGER_MS         = 1500; // tempo que o professor fica parado depois de atacar
export const MOVE_EMIT_RATE_MS  = 33;   // ~30 update de rede por segundo

//  visao (fov)
export const FOV_PROFESSOR = 250; 
export const FOV_SURVIVOR  = 180; 
export const FOV_PROFESSOR_CONE_DEG = 80;

//  cores
export const COLOR_SELF_SURVIVOR  = 0x4fc3f7;
export const COLOR_SELF_PROF      = 0xe94560;
export const COLOR_OTHER_SURVIVOR = 0x81c995;
export const COLOR_OTHER_PROF     = 0xff6b6b;
export const COLOR_TERMINAL_IDLE  = 0xaaaaaa;
export const COLOR_TERMINAL_DONE  = 0x00e676;
