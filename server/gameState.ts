import type { GameStateRecord, TerminalId, Vec2 } from './types';
import {
  ATTACK_COOLDOWN_MS,
  DETENTION_SKILL_CHECKS_REQUIRED,
  HACK_FAIL_REGRESSION,
  HACK_FAIL_LOCK_MS,
  HACK_AMOUNT_MAX,
  HACK_EFFICIENCY_PENALTY,
  HACK_KICK_REGRESSION,
  HACK_REGRESSION_RATE_PCT_S,
  HACK_REGRESSION_EVENTS_MAX,
  ATTACK_HITBOX_WIDTH,
  ATTACK_HITBOX_DEPTH,
  ATTACK_STAGGER_HIT_MS,
  ATTACK_STAGGER_MISS_MS,
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  BLOODLUST_SPEED_BONUS_PX_S,
} from '../shared/gameRules';

export const ROOM_NAMES = ['sala1', 'sala2', 'sala3', 'sala4'] as const;
export type  RoomName   = typeof ROOM_NAMES[number];

// posicao fixa dos terminais no mapa
export const TERMINAL_POSITIONS: Record<TerminalId, Vec2> = {
  t1: { x: 2140, y: 2520 },
  t2: { x: 500,  y: 150  },
  t3: { x: 200,  y: 400  },
  t4: { x: 500,  y: 400  },
  t5: { x: 350,  y: 280  },
};

export { ATTACK_COOLDOWN_MS };
export { DETENTION_SKILL_CHECKS_REQUIRED };
export { HACK_FAIL_REGRESSION };
export { HACK_FAIL_LOCK_MS };
export { HACK_AMOUNT_MAX };
export { HACK_EFFICIENCY_PENALTY };
export { HACK_KICK_REGRESSION };
export { HACK_REGRESSION_RATE_PCT_S };
export { HACK_REGRESSION_EVENTS_MAX };
export { ATTACK_HITBOX_WIDTH };
export { ATTACK_HITBOX_DEPTH };
export { ATTACK_STAGGER_HIT_MS };
export { ATTACK_STAGGER_MISS_MS };
export { CHASE_START_RADIUS_PX };
export { CHASE_END_RADIUS_PX };
export { CHASE_LOS_TIMEOUT_MS };
export { CHASE_FOV_HALF_DEG };
export { BLOODLUST_TIER_TIMES_MS };
export { BLOODLUST_SPEED_BONUS_PX_S };

// partida nova resetada
export function freshGameState(): GameStateRecord {
  return {
    players:           {},
    terminals:         { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 },
    terminalPositions: TERMINAL_POSITIONS,
    hackedCount:       0,
    gateOpen:          false,
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
    emit('gameOver', { winner: 'survivors' });
    return true;
  }

  if (allSurvivors.length > 0 && allSurvivors.every((p) => p.expelled)) {
    state.phase = 'ended';
    emit('gameOver', { winner: 'professor' });
    return true;
  }

  return false;
}
