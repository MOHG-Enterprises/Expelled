export const ATTACK_COOLDOWN_MS = 1500;
export const HACK_FAIL_REGRESSION = 10;
export const HACK_FAIL_LOCK_MS = 3000;
export const HACK_AMOUNT_MAX = 2;
export const HACK_EFFICIENCY_PENALTY = 15;
export const HACK_KICK_REGRESSION = 5;
export const HACK_REGRESSION_RATE_PCT_S = 0.278;
export const HACK_REGRESSION_EVENTS_MAX = 8;

export const ATTACK_STAGGER_HIT_MS = 2700;
export const ATTACK_STAGGER_MISS_MS = 1500;

export const LUNGE_THRESHOLD_MS         = 200;
export const LUNGE_MAX_HOLD_MS          = 300;
export const QUICK_ATTACK_RADIUS        = 80;
export const QUICK_ATTACK_HALF_ANGLE_RAD = Math.PI * 40 / 180;
export const LUNGE_ATTACK_RADIUS        = 80;
export const LUNGE_ATTACK_HALF_ANGLE_RAD = Math.PI * 40 / 180;

export const CHASE_START_RADIUS_PX = 384;
export const CHASE_END_RADIUS_PX = 576;
export const CHASE_LOS_TIMEOUT_MS = 8000;
export const CHASE_FOV_HALF_DEG = 40;
export const BLOODLUST_TIER_TIMES_MS = [15000, 25000, 35000] as const;
export const BLOODLUST_SPEED_BONUS_PX_S = [0, 6.4, 12.8, 19.2] as const;

export const GATE_TICK_MS        = 500;
export const GATE_TICK_AMOUNT    = 2.5;
export const ENDGAME_DURATION_MS = 120_000;
export const PROFESSOR_LOCK_DURATION_MS = 10_000;

export const BLEED_OUT_MS         = 70_000;
export const HEAL_FAIL_REGRESSION  = 10;
export const HEAL_FAIL_LOCK_MS     = 3_000;
export const HEAL_AMOUNT_MAX       = 20;
export const HEAL_SELF_CAP         = 95;
export const HEAL_EFFICIENCY_PENALTY = 15;

export const MAX_PLAYERS_PER_ROOM = 5;
export const MIN_SURVIVORS_TO_START = 1;