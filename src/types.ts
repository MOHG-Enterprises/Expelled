export type Role = 'professor' | 'survivor';
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5';
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
}

export interface GameState {
  players: Record<string, PlayerState>;
  terminals: Record<TerminalId, number>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount: number;
  gateOpen: boolean;
  phase: GamePhase;
}
