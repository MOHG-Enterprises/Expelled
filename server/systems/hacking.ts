import {
  HACK_AMOUNT_MAX,
  HACK_EFFICIENCY_PENALTY,
  HACK_FAIL_LOCK_MS,
  HACK_FAIL_REGRESSION,
  HACK_KICK_REGRESSION,
  HACK_REGRESSION_EVENTS_MAX,
  HACK_REGRESSION_RATE_PCT_S,
} from '../gameState';
import type { EmitContext, GameStateRecord, TerminalId } from '../types';

// room → terminalId → set of socketIds currently hacking
const roomHackingMap = new Map<string, Map<string, Set<string>>>();

export function getRepairerCount(roomName: string, terminalId: string): number {
  return roomHackingMap.get(roomName)?.get(terminalId)?.size ?? 0;
}

export function removeHackerSocket(roomName: string, socketId: string): void {
  roomHackingMap.get(roomName)?.forEach((set) => set.delete(socketId));
}

export function clearHackingState(roomName: string): void {
  roomHackingMap.delete(roomName);
}

export function tickTerminalRegression(
  state: GameStateRecord,
  roomName: string,
  emit: EmitContext,
): void {
  (Object.keys(state.terminals) as TerminalId[]).forEach((id) => {
    const t = state.terminals[id];
    if (!t.regressing) return;

    if (getRepairerCount(roomName, id) > 0) {
      t.regressing = false;
      emit.all('terminalRegressing', { terminalId: id, isRegressing: false });
      return;
    }

    const prev = t.progress;
    t.progress = Math.max(0, prev - HACK_REGRESSION_RATE_PCT_S * 0.5);
    if (t.progress === 0) {
      t.regressing = false;
      emit.all('terminalRegressing', { terminalId: id, isRegressing: false });
    }
    if (prev !== t.progress) {
      emit.all('terminalUpdate', { id, progress: t.progress });
    }
  });
}

export function processHackProgress(
  state: GameStateRecord,
  roomName: string,
  actorId: string,
  terminalId: TerminalId,
  amount: number,
  emit: EmitContext,
): void {
  const p = state.players[actorId];
  if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
  if (p.beingHealed) return;
  if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;
  if (typeof amount !== 'number' || amount < 0 || amount > HACK_AMOUNT_MAX) return;

  const t = state.terminals[terminalId];
  if (t.progress >= 100) return;
  if (Date.now() < t.failLockUntil) return;
  if (state.endgameStartedAt !== null) return;

  const repairerCount = getRepairerCount(roomName, terminalId);
  const penaltyFactor = Math.max(0, repairerCount - 1) * (HACK_EFFICIENCY_PENALTY / 100);
  const effective = amount * Math.max(0.1, 1 - penaltyFactor);

  t.progress = Math.min(100, t.progress + effective);

  if (t.progress >= 100) {
    state.hackedCount++;
    emit.all('terminalHacked', terminalId);
    const survivorCount = Object.values(state.players).filter((pl) => pl.role === 'survivor').length;
    const threshold = survivorCount + 1;
    if (state.hackedCount >= threshold && !state.gatesPowered) {
      state.gatesPowered = true;
      emit.all('gatesPowered', undefined);
    }
  }

  emit.all('terminalUpdate', { id: terminalId, progress: t.progress });
}

export function processSetHacking(
  state: GameStateRecord,
  roomName: string,
  actorId: string,
  terminalId: string | null,
  emit: EmitContext,
): void {
  const p = state.players[actorId];
  if (!p || p.role !== 'survivor' || p.expelled) return;

  const roomHackMap = roomHackingMap.get(roomName) ?? new Map<string, Set<string>>();
  if (!roomHackingMap.has(roomName)) roomHackingMap.set(roomName, roomHackMap);
  roomHackMap.forEach((set) => set.delete(actorId));

  if (terminalId && Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) {
    const termSet = roomHackMap.get(terminalId) ?? new Set<string>();
    if (!roomHackMap.has(terminalId)) roomHackMap.set(terminalId, termSet);
    termSet.add(actorId);

    const t = state.terminals[terminalId as TerminalId];
    if (t && t.regressing) {
      t.regressing = false;
      emit.all('terminalRegressing', { terminalId, isRegressing: false });
    }
  }

  emit.all('survivorActivity', { socketId: actorId, terminalId: terminalId ?? null });
}

export function processSkillCheckFailed(
  state: GameStateRecord,
  actorId: string,
  terminalId: TerminalId,
  emit: EmitContext,
): void {
  const p = state.players[actorId];
  if (!p || p.role !== 'survivor') return;
  if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;

  const t = state.terminals[terminalId];
  t.failLockUntil = Date.now() + HACK_FAIL_LOCK_MS;
  t.progress = Math.max(0, t.progress - HACK_FAIL_REGRESSION);

  emit.all('terminalUpdate', { id: terminalId, progress: t.progress });
  emit.all('firewallAlert', { terminalId, survivorId: actorId });
}

export function processReinforceTerminal(
  state: GameStateRecord,
  actorId: string,
  terminalId: TerminalId,
  emit: EmitContext,
): void {
  const p = state.players[actorId];
  if (!p || p.role !== 'professor') return;
  if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;

  const t = state.terminals[terminalId];
  if (t.progress >= 100 || t.progress <= 0) return;
  if (t.regressionEvents >= HACK_REGRESSION_EVENTS_MAX) return;
  if (t.regressing) return;

  t.regressionEvents++;
  t.regressing = true;
  t.progress = Math.max(0, t.progress - HACK_KICK_REGRESSION);

  emit.all('terminalUpdate', { id: terminalId, progress: t.progress });
  emit.all('terminalRegressing', { terminalId, isRegressing: true, regressionEvents: t.regressionEvents });
}
