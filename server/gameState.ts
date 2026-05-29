import type { GameStateRecord, GateId, TerminalId, Vec2 } from './types';
import {
  ATTACK_COOLDOWN_MS,
  HACK_FAIL_REGRESSION,
  HACK_FAIL_LOCK_MS,
  HACK_AMOUNT_MAX,
  HACK_EFFICIENCY_PENALTY,
  HACK_KICK_REGRESSION,
  HACK_REGRESSION_RATE_PCT_S,
  HACK_REGRESSION_EVENTS_MAX,
  ATTACK_STAGGER_HIT_MS,
  ATTACK_STAGGER_MISS_MS,
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
  BLEED_OUT_MS,
  HEAL_FAIL_REGRESSION,
  HEAL_FAIL_LOCK_MS,
  HEAL_AMOUNT_MAX,
  HEAL_SELF_CAP,
  HEAL_EFFICIENCY_PENALTY,
} from '../shared/gameRules';

export const ROOM_NAMES = ['sala1', 'sala2', 'sala3', 'sala4'] as const;
export type  RoomName   = typeof ROOM_NAMES[number];

// posicao fixa dos terminais no mapa
export const TERMINAL_POSITIONS: Record<TerminalId, Vec2> = {
  t1: { x: 2140, y: 2520 },
  t2: { x: 785,  y: 86  },
  t3: { x: 848,  y: 1830 },
  t4: { x: 780,  y: 3720  },
  t5: { x: 1510,  y: 1430  },
};

export const GATE_POSITIONS: Record<GateId, Vec2> = {
  g1: { x: 464, y: 2222 },
  g2: { x: 464, y: 1722 },
};

export const GATE_TILE_RANGES: Record<GateId, { col: number; rowStart: number; rowEnd: number }> = {
  g1: { col: 12, rowStart: 70, rowEnd: 75 },
  g2: { col: 12, rowStart: 47, rowEnd: 52 },
};

export interface PlayerStatSnapshot {
  role: 'survivor' | 'professor';
  outcome?: 'escaped' | 'expelled' | 'downed';
  hackContributed?: number;
  timesDown?: number;
  healsGiven?: number;
  hitsLanded?: number;
  downedCount?: number;
  expelledCount?: number;
}

export function buildStats(state: GameStateRecord): Record<string, PlayerStatSnapshot> {
  const result: Record<string, PlayerStatSnapshot> = {};
  for (const [id, p] of Object.entries(state.players)) {
    if (p.role === 'survivor') {
      const outcome: 'escaped' | 'expelled' | 'downed' =
        p.escaped ? 'escaped' : p.expelled ? 'expelled' : 'downed';
      result[id] = {
        role: 'survivor',
        outcome,
        hackContributed: Math.round(p.hackContributed),
        timesDown: p.downCount,
        healsGiven: p.healsGiven,
      };
    } else {
      result[id] = {
        role: 'professor',
        hitsLanded: p.hitsLanded,
        downedCount: p.downedCount,
        expelledCount: p.expelledCount,
      };
    }
  }
  return result;
}

export { ATTACK_COOLDOWN_MS };
export { HACK_FAIL_REGRESSION };
export { HACK_FAIL_LOCK_MS };
export { HACK_AMOUNT_MAX };
export { HACK_EFFICIENCY_PENALTY };
export { HACK_KICK_REGRESSION };
export { HACK_REGRESSION_RATE_PCT_S };
export { HACK_REGRESSION_EVENTS_MAX };
export { ATTACK_STAGGER_HIT_MS };
export { ATTACK_STAGGER_MISS_MS };
export { LUNGE_THRESHOLD_MS };
export { LUNGE_MAX_HOLD_MS };
export { QUICK_ATTACK_RADIUS };
export { QUICK_ATTACK_HALF_ANGLE_RAD };
export { LUNGE_ATTACK_RADIUS };
export { LUNGE_ATTACK_HALF_ANGLE_RAD };
export { CHASE_START_RADIUS_PX };
export { CHASE_END_RADIUS_PX };
export { CHASE_LOS_TIMEOUT_MS };
export { CHASE_FOV_HALF_DEG };
export { BLOODLUST_TIER_TIMES_MS };
export { BLOODLUST_SPEED_BONUS_PX_S };
export { GATE_TICK_MS, GATE_TICK_AMOUNT, ENDGAME_DURATION_MS } from '../shared/gameRules';
export { BLEED_OUT_MS };
export { HEAL_FAIL_REGRESSION };
export { HEAL_FAIL_LOCK_MS };
export { HEAL_AMOUNT_MAX };
export { HEAL_SELF_CAP };
export { HEAL_EFFICIENCY_PENALTY };

// partida nova resetada
export function freshGameState(): GameStateRecord {
  return {
    players:           {},
    terminals: {
      t1: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t2: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t3: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t4: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
      t5: { progress: 0, regressing: false, regressionEvents: 0, failLockUntil: 0 },
    },
    terminalPositions: TERMINAL_POSITIONS,
    hackedCount:       0,
    gates:             { g1: 0, g2: 0 },
    gatesOpen:         { g1: false, g2: false },
    gatesPowered:      false,
    endgameStartedAt:  null,
    phase:             'lobby',
    chase:             { target: null, elapsed: 0, tier: 0, losLostAt: null },
  };
}

// estado por sala — criado sob demanda
export const rooms: Record<string, GameStateRecord> = {};

export function getOrCreateRoom(roomName: string): GameStateRecord {
  if (!rooms[roomName]) rooms[roomName] = freshGameState();
  return rooms[roomName];
}

export function getRoomSummary(): Record<string, { playerCount: number; phase: string }> {
  return Object.fromEntries(
    ROOM_NAMES.map((name) => [
      name,
      {
        playerCount: Object.keys(rooms[name]?.players ?? {}).length,
        phase:       rooms[name]?.phase ?? 'lobby',
      },
    ]),
  );
}

type EmitFn = (event: string, ...args: unknown[]) => void;

// checa condicao de vitoria e emite gameover
export function checkWinConditions(state: GameStateRecord, emit: EmitFn): boolean {
  if (state.phase !== 'playing') return false;

  const allSurvivors = Object.values(state.players).filter((p) => p.role === 'survivor');
  const active       = allSurvivors.filter((p) => !p.expelled);
  const escaped      = active.filter((p) => p.escaped);

  if (active.length > 0 && escaped.length === active.length) {
    state.phase = 'ended';
    emit('gameOver', { winner: 'survivors', stats: buildStats(state) });
    return true;
  }

  if (allSurvivors.length > 0 && allSurvivors.every((p) => p.expelled)) {
    state.phase = 'ended';
    emit('gameOver', { winner: 'professor', stats: buildStats(state) });
    return true;
  }

  return false;
}
