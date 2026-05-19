export const ATTACK_COOLDOWN_MS = 1500;
export const DETENTION_SKILL_CHECKS_REQUIRED = 3;
export const HACK_FAIL_REGRESSION = 10;
export const HACK_FAIL_LOCK_MS = 3000;
export const HACK_AMOUNT_MAX = 25;
export const HACK_EFFICIENCY_PENALTY = 15;
export const HACK_KICK_REGRESSION = 5;
export const HACK_REGRESSION_RATE_PCT_S = 4;
export const HACK_REGRESSION_EVENTS_MAX = 8;

export const ATTACK_HITBOX_WIDTH = 96;
export const ATTACK_HITBOX_DEPTH = 100;
export const ATTACK_STAGGER_HIT_MS = 2700;
export const ATTACK_STAGGER_MISS_MS = 1500;

export const CHASE_START_RADIUS_PX = 384;
export const CHASE_END_RADIUS_PX = 576;
export const CHASE_LOS_TIMEOUT_MS = 8000;
export const CHASE_FOV_HALF_DEG = 40;
export const BLOODLUST_TIER_TIMES_MS = [15000, 25000, 35000] as const;
export const BLOODLUST_SPEED_BONUS_PX_S = [0, 6.4, 12.8, 19.2] as const;