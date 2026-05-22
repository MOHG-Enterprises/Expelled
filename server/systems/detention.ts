import { checkWinConditions } from '../gameState';
import type { EmitContext, GameStateRecord } from '../types';

export function processEscape(
  state: GameStateRecord,
  actorId: string,
  emit: EmitContext,
): void {
  const p = state.players[actorId];
  if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
  if (!state.gatesOpen.g1 && !state.gatesOpen.g2) return;
  p.escaped = true;
  emit.all('playerEscaped', actorId);
  checkWinConditions(state, (e, d) => emit.all(e, d));
}

export function tickBleedOut(
  state: GameStateRecord,
  emit: EmitContext,
): void {
  Object.entries(state.players).forEach(([id, p]) => {
    if (!p.downed || p.expelled) return;
    p.downBleedMs += 500;
    if (p.downBleedMs < 70_000) return;

    if (p.downCount === 1) {
      p.downCount   = 2;
      p.downBleedMs = 0;
      if (p.beingHealed) {
        p.beingHealed = false;
        emit.all('setBeingHealed', { targetId: id, isBeingHealed: false });
      }
      emit.all('downCountUpdated', { id, downCount: 2 });
    } else if (p.downCount >= 2) {
      p.expelled = true;
      p.downed   = false;
      if (p.beingHealed) {
        p.beingHealed = false;
        emit.all('setBeingHealed', { targetId: id, isBeingHealed: false });
      }
      emit.all('playerExpelled', id);
      checkWinConditions(state, (e, d) => emit.all(e, d));
    }
  });
}
