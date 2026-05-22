import {
  BLOODLUST_TIER_TIMES_MS,
  CHASE_END_RADIUS_PX,
  CHASE_FOV_HALF_DEG,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_START_RADIUS_PX,
} from '../gameState';
import { angleDiff } from '../utils';
import type { EmitContext, GameStateRecord } from '../types';

export function tickChase(
  state: GameStateRecord,
  emit: EmitContext,
): void {
  const prof = Object.entries(state.players).find(([, p]) => p.role === 'professor');
  const survivors = Object.entries(state.players).filter(
    ([, p]) => p.role === 'survivor' && !p.expelled && !p.downed,
  );

  const prevTier  = state.chase.tier;
  const wasActive = state.chase.target !== null;
  const fovHalfRad = (CHASE_FOV_HALF_DEG * Math.PI) / 180;
  const now = Date.now();

  if (!prof || survivors.length === 0) {
    if (wasActive) {
      state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
      emit.all('bloodlustUpdate', { tier: 0, chaseActive: false });
    }
    return;
  }

  const [, profData] = prof;

  if (state.chase.target === null) {
    for (const [sid, s] of survivors) {
      const dist  = Math.hypot(s.x - profData.x, s.y - profData.y);
      const angle = Math.abs(angleDiff(Math.atan2(s.y - profData.y, s.x - profData.x), profData.lookAngle));
      if (dist <= CHASE_START_RADIUS_PX && angle <= fovHalfRad) {
        state.chase = { target: sid, elapsed: 0, tier: 0, losLostAt: null };
        emit.all('bloodlustUpdate', { tier: 0, chaseActive: true });
        break;
      }
    }
    return;
  }

  const target = state.players[state.chase.target];
  if (!target || target.expelled || target.downed) {
    state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
    emit.all('bloodlustUpdate', { tier: 0, chaseActive: false });
    return;
  }

  const dist  = Math.hypot(target.x - profData.x, target.y - profData.y);
  const angle = Math.abs(angleDiff(Math.atan2(target.y - profData.y, target.x - profData.x), profData.lookAngle));
  const inView = dist <= CHASE_END_RADIUS_PX && angle <= fovHalfRad;

  if (inView) {
    state.chase.losLostAt = null;
  } else if (state.chase.losLostAt === null) {
    state.chase.losLostAt = now;
  }

  const losTimeout = state.chase.losLostAt !== null && now - state.chase.losLostAt > CHASE_LOS_TIMEOUT_MS;
  const tooFar     = dist > CHASE_END_RADIUS_PX;

  if (losTimeout || tooFar) {
    state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
    emit.all('bloodlustUpdate', { tier: 0, chaseActive: false });
    return;
  }

  state.chase.elapsed += 500;
  const newTier = (
    state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[2] ? 3 :
    state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[1] ? 2 :
    state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[0] ? 1 : 0
  ) as 0 | 1 | 2 | 3;

  if (newTier !== prevTier) {
    state.chase.tier = newTier;
    emit.all('bloodlustUpdate', { tier: newTier, chaseActive: true });
  }
}
