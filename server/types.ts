export type Role      = 'professor' | 'survivor';
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5';
export type GamePhase = 'lobby' | 'playing' | 'ended';

export interface Vec2 { x: number; y: number; }

export interface PlayerRecord {
  x: number;
  y: number;
  role: Role;
  ready: boolean;
  detentionHits: number;
  hp: number;
  downed: boolean;
  expelled: boolean;
  escaped: boolean;
  lastAttackTime: number;
  lastMoveTime: number;
}

export interface GameStateRecord {
  players:           Record<string, PlayerRecord>;
  terminals:         Record<TerminalId, number>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount:       number;
  gateOpen:          boolean;
  phase:             GamePhase;
}
