import type { GameStateRecord, TerminalId, Vec2 } from './types';
import { ATTACK_COOLDOWN_MS, DETENTION_SKILL_CHECKS_REQUIRED, HACK_FAIL_REGRESSION, HACK_AMOUNT_MAX } from '../shared/gameRules';

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
export { HACK_AMOUNT_MAX };

// partida nova resetada
export function freshGameState(): GameStateRecord {
  return {
    players:           {},
    terminals:         { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 },
    terminalPositions: TERMINAL_POSITIONS,
    hackedCount:       0,
    gateOpen:          false,
    phase:             'lobby',
  };
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
