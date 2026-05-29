import {
  ATTACK_COOLDOWN_MS,
  ATTACK_STAGGER_HIT_MS,
  ATTACK_STAGGER_MISS_MS,
  LUNGE_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS,
  LUNGE_THRESHOLD_MS,
  QUICK_ATTACK_HALF_ANGLE_RAD,
  QUICK_ATTACK_RADIUS,
  checkWinConditions,
} from '../gameState';
import type { EmitContext, GameStateRecord, PlayerRecord } from '../types';

function applyDamage(
  state: GameStateRecord,
  id: string,
  target: PlayerRecord,
  emit: EmitContext,
): void {
  const prof = Object.values(state.players).find((p) => p.role === 'professor');
  if (prof) prof.hitsLanded++;

  target.hp--;
  if (target.hp > 0) {
    emit.all('playerHit', { targetId: id, hp: target.hp });
    return;
  }
  target.hp = 0;
  if (target.downCount >= 2) {
    target.expelled = true;
    if (prof) prof.expelledCount++;
    if (target.beingHealed) {
      target.beingHealed = false;
      emit.all('setBeingHealed', { targetId: id, isBeingHealed: false });
    }
    emit.all('playerExpelled', id);
    checkWinConditions(state, (e, d) => emit.all(e, d));
    return;
  }
  target.downCount = (target.downCount + 1) as 0 | 1 | 2;
  target.downed      = true;
  if (prof) prof.downedCount++;
  target.healPct     = 0;
  target.downBleedMs = 0;
  if (target.beingHealed) {
    target.beingHealed = false;
    emit.all('setBeingHealed', { targetId: id, isBeingHealed: false });
  }
  emit.all('playerDowned', { id, downCount: target.downCount });
}

export function processLungeTick(
  state: GameStateRecord,
  actorId: string,
  payload: { x: number; y: number; angle: number },
  emit: EmitContext,
): void {
  const { x, y, angle } = payload;
  const attacker = state.players[actorId];
  if (!attacker || attacker.role !== 'professor') return;
  if (typeof x !== 'number' || typeof y !== 'number') return;
  if (typeof angle !== 'number' || !isFinite(angle)) return;
  if (Date.now() - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;

  if (!attacker.activeLunge) {
    attacker.activeLunge = { hitTargets: new Set() };
  }

  Object.entries(state.players).forEach(([id, target]) => {
    if (target.role !== 'survivor' || target.downed || target.expelled) return;
    if (attacker.activeLunge!.hitTargets.has(id)) return;

    const dx = target.x - x;
    const dy = target.y - y;
    if (dx * dx + dy * dy > LUNGE_ATTACK_RADIUS * LUNGE_ATTACK_RADIUS) return;

    let diff = Math.abs(Math.atan2(dy, dx) - angle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > LUNGE_ATTACK_HALF_ANGLE_RAD) return;

    attacker.activeLunge!.hitTargets.add(id);
    applyDamage(state, id, target, emit);
  });
}

export function processAttack(
  state: GameStateRecord,
  actorId: string,
  payload: { x: number; y: number; angle: number; lunge: boolean; dir?: string },
  emit: EmitContext,
): void {
  const { x, y, angle, lunge, dir } = payload;
  const attacker = state.players[actorId];
  if (!attacker || attacker.role !== 'professor') return;
  if (typeof x !== 'number' || typeof y !== 'number') return;
  if (typeof angle !== 'number' || !isFinite(angle)) return;

  const now = Date.now();
  if (now - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;
  attacker.lastAttackTime = now;

  emit.others('professorAttacked', { id: actorId, x, y, dir: dir ?? 'down' });

  const radius    = lunge ? LUNGE_ATTACK_RADIUS    : QUICK_ATTACK_RADIUS;
  const halfAngle = lunge ? LUNGE_ATTACK_HALF_ANGLE_RAD : QUICK_ATTACK_HALF_ANGLE_RAD;
  const exclude   = lunge ? attacker.activeLunge?.hitTargets : undefined;

  let hitAny = false;
  Object.entries(state.players).forEach(([id, target]) => {
    if (target.role !== 'survivor' || target.downed || target.expelled) return;
    if (exclude?.has(id)) return;

    const dx = target.x - x;
    const dy = target.y - y;
    if (dx * dx + dy * dy > radius * radius) return;

    let diff = Math.abs(Math.atan2(dy, dx) - angle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > halfAngle) return;

    hitAny = true;
    applyDamage(state, id, target, emit);
  });

  attacker.activeLunge = undefined;

  if (hitAny && (state.chase.elapsed > 0 || state.chase.tier > 0)) {
    state.chase.elapsed = 0;
    state.chase.tier    = 0;
    emit.all('bloodlustUpdate', { tier: 0, chaseActive: state.chase.target !== null });
  }

  const stagger = hitAny ? ATTACK_STAGGER_HIT_MS : ATTACK_STAGGER_MISS_MS;
  emit.self('attackStagger', stagger);
  emit.others('professorStaggered', { id: actorId, ms: stagger });
}

export function processKick(
  actorId: string,
  payload: { x: number; y: number; dir: string },
  emit: EmitContext,
): void {
  const { x, y, dir } = payload;
  if (typeof x !== 'number' || typeof y !== 'number') return;
  emit.others('professorKicked', { id: actorId, x, y, dir: dir ?? 'down' });
}

export { LUNGE_THRESHOLD_MS };
