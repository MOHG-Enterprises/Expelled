import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import {
  freshGameState,
  getOrCreateRoom,
  getRoomSummary,
  rooms,
  ROOM_NAMES,
  GATE_TICK_AMOUNT,
  ENDGAME_DURATION_MS,
  HEAL_AMOUNT_MAX,
  HEAL_FAIL_LOCK_MS,
  HEAL_FAIL_REGRESSION,
  HEAL_SELF_CAP,
  HEAL_EFFICIENCY_PENALTY,
  MAX_PLAYERS_PER_ROOM,
  PROFESSOR_LOCK_DURATION_MS,
  checkWinConditions,
} from './gameState';
import { initVoiceWorker, registerVoiceSocket } from './voiceRouter';
import type { EmitContext, GameStateRecord, GateId, TerminalId } from './types';
import {
  tickTerminalRegression,
  processHackProgress,
  processSetHacking,
  processSkillCheckFailed,
  processReinforceTerminal,
  removeHackerSocket,
  clearHackingState,
} from './systems/hacking';
import { processLungeTick, processAttack, processKick } from './systems/combat';
import { tickChase } from './systems/chase';
import { processEscape, tickBleedOut } from './systems/detention';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { path: './expelled/socket.io' });

app.use(express.static(path.join(__dirname, '../')));

const DEFAULT_PROFESSOR_SPAWN = { x: 1840, y: 2160 };
const DEFAULT_SURVIVOR_SPAWN  = { x: 1680, y: 2155 };

const socketToRoom = new Map<string, string>();

// room → healerId → targetId
const roomHealingMap = new Map<string, Map<string, string>>();

const VALID_SURVIVOR_SKINS = new Set(['arthur', 'gustavo', 'giu', 'isabela', 'davi', 'caio']);

function getRoomForSocket(socketId: string): { roomName: string; state: GameStateRecord } | null {
  const roomName = socketToRoom.get(socketId);
  if (!roomName) return null;
  const state = rooms[roomName];
  if (!state) return null;
  return { roomName, state };
}

function makeEmit(roomName: string, socketId: string): EmitContext {
  return {
    all:    (e, d) => io.to(roomName).emit(e, d),
    others: (e, d) => io.to(roomName).except(socketId).emit(e, d),
    self:   (e, d) => io.to(socketId).emit(e, d),
  };
}

function startEndgameInterval(roomName: string): void {
  const handle = setInterval(() => {
    const state = rooms[roomName];
    if (!state?.endgameStartedAt || state.phase !== 'playing') {
      clearInterval(handle);
      return;
    }
    if (Date.now() - state.endgameStartedAt < ENDGAME_DURATION_MS) return;

    clearInterval(handle);
    const survivors = Object.entries(state.players).filter(
      ([, p]) => p.role === 'survivor' && !p.expelled && !p.escaped,
    );
    for (const [id, p] of survivors) {
      p.expelled = true;
      io.to(roomName).emit('playerExpelled', id);
    }
    checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
  }, 1000);
}

setInterval(() => {
  for (const roomName of Object.keys(rooms)) {
    const state = rooms[roomName];
    if (!state || state.phase !== 'playing') continue;

    const emit: EmitContext = {
      all:    (e, d) => io.to(roomName).emit(e, d),
      others: (_e, _d) => {},
      self:   (_e, _d) => {},
    };

    tickTerminalRegression(state, roomName, emit);
    tickChase(state, emit);
    tickBleedOut(state, emit);
  }
}, 500);

io.on('connection', (socket) => {
  console.log(`Jogador conectou: ${socket.id}`);
  socket.emit('roomList', getRoomSummary());

  socket.on('joinRoom', ({ roomName }: { roomName: string }) => {
    if (!(ROOM_NAMES as readonly string[]).includes(roomName)) return;
    if (socketToRoom.has(socket.id)) return;

    const existing = rooms[roomName];
    if (existing && Object.keys(existing.players).length >= MAX_PLAYERS_PER_ROOM) {
      socket.emit('joinRejected', { reason: 'full' });
      return;
    }

    const state = getOrCreateRoom(roomName);
    socket.join(roomName);
    socketToRoom.set(socket.id, roomName);

    const isProfessor = Object.keys(state.players).length === 0;
    state.players[socket.id] = {
      x:               isProfessor ? DEFAULT_PROFESSOR_SPAWN.x : DEFAULT_SURVIVOR_SPAWN.x,
      y:               isProfessor ? DEFAULT_PROFESSOR_SPAWN.y : DEFAULT_SURVIVOR_SPAWN.y,
      role:            isProfessor ? 'professor' : 'survivor',
      ready:              false,
      hp:                 2,
      downed:             false,
      expelled:           false,
      escaped:            false,
      lastAttackTime:     0,
      lookAngle:          0,
      downCount:          0,
      healPct:            0,
      downBleedMs:        0,
      beingHealed:        false,
      healFailLockUntil:  0,
      name:               '',
      skinId:             '',
      hackContributed:    0,
      healsGiven:         0,
      hitsLanded:         0,
      downedCount:        0,
      expelledCount:      0,
    };

    socket.emit('roleAssigned', state.players[socket.id].role);
    io.to(roomName).emit('gameState', state);
    io.emit('roomList', getRoomSummary());
  });

  socket.on('setReady', ({ ready }: { ready: boolean }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || state.phase !== 'lobby') return;
    if (typeof ready !== 'boolean') return;
    p.ready = ready;
    io.to(roomName).emit('gameState', state);
  });

  socket.on('setCharacter', ({ name, skinId }: { name: string; skinId: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor') return;
    if (typeof name !== 'string' || typeof skinId !== 'string') return;
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) return;
    if (!VALID_SURVIVOR_SKINS.has(skinId)) return;
    p.name   = trimmed;
    p.skinId = skinId;
    io.to(roomName).emit('gameState', state);
  });

  socket.on('startMatch', () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'professor' || state.phase !== 'lobby') return;
    const survivors = Object.values(state.players).filter((pl) => pl.role === 'survivor');
    if (survivors.length < 1 || !survivors.every((pl) => pl.ready)) return;
    state.phase = 'playing';
    io.to(roomName).emit('gamePhase', 'playing');
    state.professorLockedEndsAt = Date.now() + PROFESSOR_LOCK_DURATION_MS;
    io.to(roomName).emit('professorLocked', { endsAt: state.professorLockedEndsAt });
    setTimeout(() => {
      const currentState = rooms[roomName];
      if (!currentState || currentState.phase !== 'playing') return;
      currentState.professorLockedEndsAt = null;
      io.to(roomName).emit('professorReleased');
    }, PROFESSOR_LOCK_DURATION_MS);
  });

  socket.on('requestSync', () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { state } = room;
    const p = state.players[socket.id];
    if (!p) return;
    socket.emit('roleAssigned', p.role);
    socket.emit('gameState', state);
    socket.emit('gamePhase', state.phase);
  });

  socket.on('move', (data: { x: number; y: number; angle?: number; sprinting?: boolean; dir?: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.escaped) return;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return;
    p.x = data.x;
    p.y = data.y;
    if (p.role === 'professor' && typeof data.angle === 'number' && isFinite(data.angle)) {
      p.lookAngle = data.angle;
    }
    socket.to(roomName).emit('playerMoved', { id: socket.id, x: data.x, y: data.y, sprinting: !!data.sprinting, dir: data.dir });
  });

  socket.on('scratchMark', (data: { x: number; y: number; direction: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return;
    socket.to(roomName).emit('scratchMark', { x: data.x, y: data.y, direction: data.direction });
  });

  socket.on('hackProgress', ({ terminalId, amount }: { terminalId: TerminalId; amount: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    processHackProgress(state, roomName, socket.id, terminalId, amount, makeEmit(roomName, socket.id));
  });

  socket.on('setHacking', ({ terminalId }: { terminalId: string | null }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (terminalId && p?.beingHealed) {
      p.beingHealed = false;
      io.to(roomName).emit('setBeingHealed', { targetId: socket.id, isBeingHealed: false });
      const healMap = roomHealingMap.get(roomName);
      if (healMap) {
        for (const [healerId, tid] of healMap) {
          if (tid === socket.id) { healMap.delete(healerId); break; }
        }
      }
    }
    processSetHacking(state, roomName, socket.id, terminalId, makeEmit(roomName, socket.id));
  });

  socket.on('setHealing', ({ targetId }: { targetId: string | null }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const healer = state.players[socket.id];
    if (!healer || healer.role !== 'survivor' || healer.expelled || healer.escaped) return;
    if (healer.beingHealed) return;

    const roomHealMap = roomHealingMap.get(roomName) ?? new Map<string, string>();
    if (!roomHealingMap.has(roomName)) roomHealingMap.set(roomName, roomHealMap);

    const prevTarget = roomHealMap.get(socket.id);
    if (prevTarget && prevTarget !== targetId) {
      const prev = state.players[prevTarget];
      if (prev && prev.beingHealed) {
        prev.beingHealed = false;
        io.to(roomName).emit('setBeingHealed', { targetId: prevTarget, isBeingHealed: false });
      }
    }

    if (!targetId) { roomHealMap.delete(socket.id); return; }

    const target = state.players[targetId];
    if (!target || target.role !== 'survivor' || target.expelled || target.escaped) return;
    if (target.hp >= 2) return;

    roomHealMap.set(socket.id, targetId);
    if (!target.beingHealed) {
      target.beingHealed = true;
      io.to(roomName).emit('setBeingHealed', { targetId, isBeingHealed: true });
    }
  });

  socket.on('healProgress', ({ targetId, amount }: { targetId: string; amount: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const healer = state.players[socket.id];
    if (!healer || healer.role !== 'survivor' || healer.expelled || healer.escaped) return;

    const target = state.players[targetId];
    if (!target || target.role !== 'survivor' || target.expelled || target.escaped) return;
    if (typeof amount !== 'number' || amount < 0 || amount > HEAL_AMOUNT_MAX) return;
    if (Date.now() < target.healFailLockUntil) return;

    const isSelf = targetId === socket.id;
    const healMap = roomHealingMap.get(roomName);
    if (!isSelf && healer.beingHealed) return;
    if (!isSelf && healMap?.get(socket.id) !== targetId) return;
    if (isSelf && !target.downed) return;
    if (isSelf && target.healPct >= HEAL_SELF_CAP) return;
    if (isSelf && target.beingHealed) return;
    if (!isSelf && target.hp >= 2) return;

    const cap = isSelf ? HEAL_SELF_CAP : 100;
    const healerCount = isSelf ? 1 : [...(healMap?.values() ?? [])].filter(t => t === targetId).length;
    const penaltyFactor = Math.max(0, healerCount - 1) * (HEAL_EFFICIENCY_PENALTY / 100);
    const effective = amount * Math.max(0.1, 1 - penaltyFactor);
    target.healPct = Math.min(cap, target.healPct + effective);
    io.to(roomName).emit('healUpdate', { targetId, healPct: target.healPct });

    if (!isSelf && target.healPct >= 100) {
      target.healPct     = 0;
      target.beingHealed = false;
      healer.healsGiven++;
      io.to(roomName).emit('setBeingHealed', { targetId, isBeingHealed: false });
      if (target.hp === 0) {
        target.hp     = 1;
        target.downed = false;
        io.to(roomName).emit('playerRevived', { id: targetId, hp: 1 });
      } else {
        target.hp = 2;
        io.to(roomName).emit('playerHealed', { id: targetId, hp: 2 });
      }
    }
  });

  socket.on('healSkillCheckFailed', ({ targetId }: { targetId: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor') return;
    if (p.beingHealed && targetId !== socket.id) return;
    const target = state.players[targetId];
    if (!target || target.role !== 'survivor') return;
    target.healFailLockUntil = Date.now() + HEAL_FAIL_LOCK_MS;
    target.healPct = Math.max(0, target.healPct - HEAL_FAIL_REGRESSION);
    io.to(roomName).emit('healUpdate', { targetId, healPct: target.healPct });
    if (targetId !== socket.id) {
      io.to(roomName).emit('healAlert', { targetId, healerId: socket.id });
    }
  });

  socket.on('skillCheckFailed', ({ terminalId }: { terminalId: TerminalId }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    processSkillCheckFailed(state, socket.id, terminalId, makeEmit(roomName, socket.id));
  });

  socket.on('lungeTick', (payload: { x: number; y: number; angle: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    processLungeTick(state, socket.id, payload, makeEmit(roomName, socket.id));
  });

  socket.on('attack', (payload: { x: number; y: number; angle: number; lunge: boolean; dir?: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    processAttack(state, socket.id, payload, makeEmit(roomName, socket.id));
  });

  socket.on('kick', (payload: { x: number; y: number; dir: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName } = room;
    processKick(socket.id, payload, makeEmit(roomName, socket.id));
  });

  socket.on('professorCharge', ({ charging }: { charging: boolean }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'professor') return;
    socket.to(roomName).emit('professorCharge', { id: socket.id, charging: !!charging });
  });

  socket.on('facing', ({ dir }: { dir: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    if (!state.players[socket.id]) return;
    socket.to(roomName).emit('playerFacing', { id: socket.id, dir });
  });

  socket.on('reinforceTerminal', ({ terminalId }: { terminalId: TerminalId }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    processReinforceTerminal(state, socket.id, terminalId, makeEmit(roomName, socket.id));
  });

  socket.on('escape', () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    processEscape(state, socket.id, makeEmit(roomName, socket.id));
  });

  socket.on('gateOpenTick', ({ gateId }: { gateId: GateId }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled || p.escaped) return;
    if (!state.gatesPowered) return;
    if (gateId !== 'g1' && gateId !== 'g2') return;
    if (state.gatesOpen[gateId]) return;

    state.gates[gateId] = Math.min(100, state.gates[gateId] + GATE_TICK_AMOUNT);
    io.to(roomName).emit('gateProgress', { gateId, progress: state.gates[gateId] });

    if (state.gates[gateId] >= 100) {
      state.gatesOpen[gateId] = true;
      io.to(roomName).emit('gateOpened', { gateId });
      if (state.endgameStartedAt === null) {
        state.endgameStartedAt = Date.now();
        io.to(roomName).emit('endgameStarted', { startAt: state.endgameStartedAt });
        startEndgameInterval(roomName);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Jogador desconectou: ${socket.id}`);
    const room = getRoomForSocket(socket.id);
    if (room) {
      const { roomName, state } = room;
      const wasProf = state.players[socket.id]?.role === 'professor';
      delete state.players[socket.id];
      socketToRoom.delete(socket.id);

      removeHackerSocket(roomName, socket.id);

      const healMap = roomHealingMap.get(roomName);
      if (healMap) {
        const healTarget = healMap.get(socket.id);
        if (healTarget) {
          const t = state.players[healTarget];
          if (t && t.beingHealed) {
            t.beingHealed = false;
            io.to(roomName).emit('setBeingHealed', { targetId: healTarget, isBeingHealed: false });
          }
        }
        healMap.delete(socket.id);
      }

      io.to(roomName).emit('survivorActivity', { socketId: socket.id, terminalId: null });
      io.to(roomName).emit('playerLeft', socket.id);

      if (wasProf) {
        clearHackingState(roomName);
        roomHealingMap.delete(roomName);
        rooms[roomName] = freshGameState();
        io.to(roomName).emit('gameReset');
      } else {
        checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
      }
      io.emit('roomList', getRoomSummary());
    } else {
      socketToRoom.delete(socket.id);
    }
  });

  registerVoiceSocket(socket, (id) => socketToRoom.get(id) ?? null, {
    to: (roomOrId: string) => ({ emit: (event: string, data: unknown) => io.to(roomOrId).emit(event, data) }),
  });
});

const PORT = 3000;

initVoiceWorker().then(() => {
  server.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando em http://0.0.0.0:${PORT}`));
}).catch((err) => {
  console.error('Falha ao inicializar mediasoup:', err);
  process.exit(1);
});
