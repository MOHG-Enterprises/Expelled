export type Role = 'professor' | 'survivor';
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5';
export type GateId = 'g1' | 'g2';
export type GamePhase = 'lobby' | 'playing' | 'ended';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  x: number;
  y: number;
  role: Role;
  hp: number;
  downed: boolean;
  expelled: boolean;
  escaped: boolean;
  downCount:   0 | 1 | 2;
  healPct:     number;
  beingHealed: boolean;
}

export interface GameState {
  players:           Record<string, PlayerState>;
  terminals:         Record<TerminalId, { progress: number }>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount:       number;
  gates:             Record<string, number>;
  gatesOpen:         Record<string, boolean>;
  gatesPowered:      boolean;
  endgameStartedAt:  number | null;
  phase:             GamePhase;
}
