export type Role      = 'professor' | 'survivor';
export type TerminalId = 't1' | 't2' | 't3' | 't4' | 't5';
export type GateId = 'g1' | 'g2';
export type GamePhase = 'lobby' | 'playing' | 'ended';

export interface Vec2 { x: number; y: number; }

export interface TerminalRecord {
  progress:         number;
  regressing:       boolean;
  regressionEvents: number;
  failLockUntil:    number;
}

export interface EmitContext {
  all:    (event: string, data?: unknown) => void;
  others: (event: string, data?: unknown) => void;
  self:   (event: string, data?: unknown) => void;
}

export interface PlayerRecord {
  x: number;
  y: number;
  role: Role;
  ready: boolean;
  hp: number;
  downed: boolean;
  expelled: boolean;
  escaped: boolean;
  lastAttackTime: number;
  activeLunge?: { hitTargets: Set<string> };
  lookAngle: number;
  downCount:         0 | 1 | 2;
  healPct:           number;
  downBleedMs:       number;
  beingHealed:       boolean;
  healFailLockUntil: number;
}

export interface GameStateRecord {
  players:           Record<string, PlayerRecord>;
  terminals:         Record<TerminalId, TerminalRecord>;
  terminalPositions: Record<TerminalId, Vec2>;
  hackedCount:       number;
  gates:             Record<string, number>;
  gatesOpen:         Record<string, boolean>;
  gatesPowered:      boolean;
  endgameStartedAt:  number | null;
  phase:             GamePhase;
  chase: {
    target:    string | null;
    elapsed:   number;
    tier:      0 | 1 | 2 | 3;
    losLostAt: number | null;
  };
}
