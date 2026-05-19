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
  ATTACK_COOLDOWN_MS,
  DETENTION_SKILL_CHECKS_REQUIRED,
  HACK_FAIL_REGRESSION,
  HACK_FAIL_LOCK_MS,
  HACK_AMOUNT_MAX,
  HACK_EFFICIENCY_PENALTY,
  HACK_KICK_REGRESSION,
  HACK_REGRESSION_RATE_PCT_S,
  HACK_REGRESSION_EVENTS_MAX,
  ATTACK_HITBOX_WIDTH,
  ATTACK_HITBOX_DEPTH,
  ATTACK_STAGGER_HIT_MS,
  ATTACK_STAGGER_MISS_MS,
  checkWinConditions,
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  BLOODLUST_SPEED_BONUS_PX_S,
} from './gameState';
import { initVoiceWorker, registerVoiceSocket } from './voiceRouter';
import type { GameStateRecord, TerminalId } from './types';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, '../')));

const DEFAULT_PROFESSOR_SPAWN = { x: 1840, y: 2160 };
const DEFAULT_SURVIVOR_SPAWN  = { x: 1680, y: 2155 };

// mapeia socketId → roomName para lookup O(1)
const socketToRoom = new Map<string, string>();

interface TerminalMeta {
  regressing: boolean;
  regressionEvents: number;
  failLockUntil: number;
}

// room → terminalId → TerminalMeta
const roomTerminalMeta = new Map<string, Record<string, TerminalMeta>>();
// room → terminalId → set de socketIds consertando
const roomHackingMap = new Map<string, Map<string, Set<string>>>();

function getTerminalMeta(roomName: string, terminalId: string): TerminalMeta {
  if (!roomTerminalMeta.has(roomName)) roomTerminalMeta.set(roomName, {});
  const meta = roomTerminalMeta.get(roomName)!;
  if (!meta[terminalId]) meta[terminalId] = { regressing: false, regressionEvents: 0, failLockUntil: 0 };
  return meta[terminalId];
}

function getRepairerCount(roomName: string, terminalId: string): number {
  return roomHackingMap.get(roomName)?.get(terminalId)?.size ?? 0;
}

function clearRoomMeta(roomName: string) {
  roomTerminalMeta.delete(roomName);
  roomHackingMap.delete(roomName);
}

function getRoomForSocket(socketId: string): { roomName: string; state: GameStateRecord } | null {
  const roomName = socketToRoom.get(socketId);
  if (!roomName) return null;
  const state = rooms[roomName];
  if (!state) return null;
  return { roomName, state };
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d >  Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

setInterval(() => {
  for (const roomName of Object.keys(rooms)) {
    const state = rooms[roomName];
    if (!state || state.phase !== 'playing') continue;
    const meta = roomTerminalMeta.get(roomName);
    if (!meta) continue;

    (Object.keys(state.terminals) as TerminalId[]).forEach((id) => {
      const m = meta[id];
      if (!m?.regressing) return;

      if (getRepairerCount(roomName, id) > 0) {
        m.regressing = false;
        io.to(roomName).emit('terminalRegressing', { terminalId: id, isRegressing: false });
        return;
      }

      const prev = state.terminals[id];
      state.terminals[id] = Math.max(0, prev - HACK_REGRESSION_RATE_PCT_S * 0.5);
      if (state.terminals[id] === 0) {
        m.regressing = false;
        io.to(roomName).emit('terminalRegressing', { terminalId: id, isRegressing: false });
      }
      if (prev !== state.terminals[id]) {
        io.to(roomName).emit('terminalUpdate', { id, progress: state.terminals[id] });
      }
    });

    const prof = Object.entries(state.players).find(([, p]) => p.role === 'professor');
    const survivors = Object.entries(state.players).filter(
      ([, p]) => p.role === 'survivor' && !p.expelled && !p.downed,
    );

    const prevTier   = state.chase.tier;
    const wasActive  = state.chase.target !== null;
    const fovHalfRad = (CHASE_FOV_HALF_DEG * Math.PI) / 180;
    const now2       = Date.now();

    if (!prof || survivors.length === 0) {
      if (wasActive) {
        state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
        io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: false });
      }
    } else {
      const [, profData] = prof;

      if (state.chase.target === null) {
        for (const [sid, s] of survivors) {
          const dist  = Math.hypot(s.x - profData.x, s.y - profData.y);
          const angle = Math.abs(angleDiff(Math.atan2(s.y - profData.y, s.x - profData.x), profData.lookAngle));
          if (dist <= CHASE_START_RADIUS_PX && angle <= fovHalfRad) {
            state.chase = { target: sid, elapsed: 0, tier: 0, losLostAt: null };
            io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: true });
            break;
          }
        }
      } else {
        const target = state.players[state.chase.target];
        if (!target || target.expelled || target.downed) {
          state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
          io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: false });
        } else {
          const dist  = Math.hypot(target.x - profData.x, target.y - profData.y);
          const angle = Math.abs(angleDiff(Math.atan2(target.y - profData.y, target.x - profData.x), profData.lookAngle));
          const inView = dist <= CHASE_END_RADIUS_PX && angle <= fovHalfRad;

          if (inView) {
            state.chase.losLostAt = null;
          } else if (state.chase.losLostAt === null) {
            state.chase.losLostAt = now2;
          }

          const losTimeout = state.chase.losLostAt !== null && now2 - state.chase.losLostAt > CHASE_LOS_TIMEOUT_MS;
          const tooFar     = dist > CHASE_END_RADIUS_PX;

          if (losTimeout || tooFar) {
            state.chase = { target: null, elapsed: 0, tier: 0, losLostAt: null };
            io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: false });
          } else {
            state.chase.elapsed += 500;
            const newTier = (
              state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[2] ? 3 :
              state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[1] ? 2 :
              state.chase.elapsed >= BLOODLUST_TIER_TIMES_MS[0] ? 1 : 0
            ) as 0 | 1 | 2 | 3;

            if (newTier !== prevTier) {
              state.chase.tier = newTier;
              io.to(roomName).emit('bloodlustUpdate', { tier: newTier, chaseActive: true });
            }
          }
        }
      }
    }
  }
}, 500);

io.on('connection', (socket) => {
  console.log(`Jogador conectou: ${socket.id}`);

  // envia lista de salas disponíveis para o cliente escolher
  socket.emit('roomList', getRoomSummary());

  // player escolhe sala — atribui role e entra no estado de jogo daquela sala
  socket.on('joinRoom', ({ roomName }: { roomName: string }) => {
    if (!(ROOM_NAMES as readonly string[]).includes(roomName)) return;
    if (socketToRoom.has(socket.id)) return; // já está em uma sala

    const state = getOrCreateRoom(roomName);
    socket.join(roomName);
    socketToRoom.set(socket.id, roomName);

    const isProfessor = Object.keys(state.players).length === 0;
    state.players[socket.id] = {
      x:               isProfessor ? DEFAULT_PROFESSOR_SPAWN.x : DEFAULT_SURVIVOR_SPAWN.x,
      y:               isProfessor ? DEFAULT_PROFESSOR_SPAWN.y : DEFAULT_SURVIVOR_SPAWN.y,
      role:            isProfessor ? 'professor' : 'survivor',
      ready:           false,
      detentionHits:   0,
      hp:              2,
      downed:          false,
      expelled:        false,
      escaped:         false,
      lastAttackTime:  0,
      lookAngle:       0,
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

  socket.on('startMatch', () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'professor' || state.phase !== 'lobby') return;

    const survivors = Object.values(state.players).filter((pl) => pl.role === 'survivor');
    if (survivors.length < 1) return;
    if (!survivors.every((pl) => pl.ready)) return;

    state.phase = 'playing';
    io.to(roomName).emit('gamePhase', 'playing');
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

  socket.on('move', (data: { x: number; y: number; angle?: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.expelled || p.escaped) return;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return;
    p.x = data.x;
    p.y = data.y;
    if (p.role === 'professor' && typeof data.angle === 'number' && isFinite(data.angle)) {
      p.lookAngle = data.angle;
    }
    socket.to(roomName).emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
  });

  socket.on('hackProgress', ({ terminalId, amount }: { terminalId: TerminalId; amount: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;
    if (typeof amount !== 'number' || amount < 0 || amount > HACK_AMOUNT_MAX) return;
    if (state.terminals[terminalId] >= 100) return;

    const meta = getTerminalMeta(roomName, terminalId);
    if (Date.now() < meta.failLockUntil) return;

    const repairerCount = getRepairerCount(roomName, terminalId);
    const penaltyFactor = Math.max(0, repairerCount - 1) * (HACK_EFFICIENCY_PENALTY / 100);
    const effective = amount * Math.max(0.1, 1 - penaltyFactor);

    state.terminals[terminalId] = Math.min(100, state.terminals[terminalId] + effective);

    if (state.terminals[terminalId] >= 100) {
      state.hackedCount++;
      io.to(roomName).emit('terminalHacked', terminalId);
      const survivorCount = Object.values(state.players).filter((pl) => pl.role === 'survivor').length;
      if (state.hackedCount >= survivorCount && !state.gateOpen) {
        state.gateOpen = true;
        io.to(roomName).emit('gateUnlocked');
      }
    }

    io.to(roomName).emit('terminalUpdate', { id: terminalId, progress: state.terminals[terminalId] });
  });

  socket.on('setHacking', ({ terminalId }: { terminalId: string | null }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.expelled) return;

    const roomHackMap = roomHackingMap.get(roomName) ?? new Map<string, Set<string>>();
    if (!roomHackingMap.has(roomName)) roomHackingMap.set(roomName, roomHackMap);
    roomHackMap.forEach((set) => set.delete(socket.id));

    if (terminalId && Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) {
      const termSet = roomHackMap.get(terminalId) ?? new Set<string>();
      if (!roomHackMap.has(terminalId)) roomHackMap.set(terminalId, termSet);
      termSet.add(socket.id);

      const m = getTerminalMeta(roomName, terminalId);
      if (m.regressing) {
        m.regressing = false;
        io.to(roomName).emit('terminalRegressing', { terminalId, isRegressing: false });
      }
    }

    io.to(roomName).emit('survivorActivity', { socketId: socket.id, terminalId: terminalId ?? null });
  });

  socket.on('skillCheckFailed', ({ terminalId }: { terminalId: TerminalId }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor') return;
    if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;

    const meta = getTerminalMeta(roomName, terminalId);
    meta.failLockUntil = Date.now() + HACK_FAIL_LOCK_MS;

    state.terminals[terminalId] = Math.max(0, state.terminals[terminalId] - HACK_FAIL_REGRESSION);
    io.to(roomName).emit('terminalUpdate', { id: terminalId, progress: state.terminals[terminalId] });
    io.to(roomName).emit('firewallAlert', { terminalId, survivorId: socket.id });
  });

  socket.on('attack', ({ x, y, angle, lunge }: { x: number; y: number; angle: number; lunge: boolean }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const attacker = state.players[socket.id];
    if (!attacker || attacker.role !== 'professor') return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (typeof angle !== 'number' || !isFinite(angle)) return;

    const now = Date.now();
    if (now - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;
    attacker.lastAttackTime = now;

    const isLunge = lunge === true;
    const depth = ATTACK_HITBOX_DEPTH;
    const half  = ATTACK_HITBOX_WIDTH / 2;
    const cosA  = Math.cos(angle);
    const sinA  = Math.sin(angle);

    let hitAny = false;
    Object.entries(state.players).forEach(([id, target]) => {
      if (target.role !== 'survivor' || target.downed || target.expelled) return;
      const dx    = target.x - x;
      const dy    = target.y - y;
      const along = dx * cosA + dy * sinA;
      const perp  = dx * (-sinA) + dy * cosA;
      if (along < 0 || along > depth || Math.abs(perp) > half) return;
      hitAny = true;
      if (state.chase.elapsed > 0 || state.chase.tier > 0) {
        state.chase.elapsed = 0;
        state.chase.tier    = 0;
        io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: state.chase.target !== null });
      }
      target.hp--;
      if (target.hp <= 0) {
        target.hp = 0;
        target.downed = true;
        target.detentionHits = 0;
        io.to(roomName).emit('playerDowned', id);
      } else {
        io.to(roomName).emit('playerHit', { targetId: id, hp: target.hp });
      }
    });

    const stagger = hitAny ? ATTACK_STAGGER_HIT_MS : ATTACK_STAGGER_MISS_MS;
    socket.emit('attackStagger', stagger);
  });

  socket.on('detentionAnswer', ({ correct, isGreat }: { correct: boolean; isGreat: boolean }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || !p.downed) return;
    if (typeof correct !== 'boolean') return;

    if (correct) {
      p.detentionHits += (isGreat === true) ? 2 : 1;
      if (p.detentionHits >= DETENTION_SKILL_CHECKS_REQUIRED) {
        p.downed        = false;
        p.hp            = 1;
        p.detentionHits = 0;
        socket.emit('detentionEscaped');
        io.to(roomName).emit('playerRevived', socket.id);
      } else {
        socket.emit('detentionProgress', {
          current:  p.detentionHits,
          required: DETENTION_SKILL_CHECKS_REQUIRED,
        });
      }
    } else {
      p.expelled      = true;
      p.detentionHits = 0;
      socket.emit('expelled');
      io.to(roomName).emit('playerExpelled', socket.id);
      checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
    }
  });

  socket.on('reinforceTerminal', ({ terminalId }: { terminalId: TerminalId }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'professor') return;
    if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;
    if (state.terminals[terminalId] >= 100) return;

    const meta = getTerminalMeta(roomName, terminalId);
    if (meta.regressionEvents >= HACK_REGRESSION_EVENTS_MAX) return;
    if (meta.regressing) return;

    meta.regressionEvents++;
    meta.regressing = true;
    state.terminals[terminalId] = Math.max(0, state.terminals[terminalId] - HACK_KICK_REGRESSION);

    io.to(roomName).emit('terminalUpdate', { id: terminalId, progress: state.terminals[terminalId] });
    io.to(roomName).emit('terminalRegressing', { terminalId, isRegressing: true, regressionEvents: meta.regressionEvents });
  });

  socket.on('escape', () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (!state.gateOpen) return;
    p.escaped = true;
    io.to(roomName).emit('playerEscaped', socket.id);
    checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
  });

  socket.on('disconnect', () => {
    console.log(`Jogador desconectou: ${socket.id}`);
    const room = getRoomForSocket(socket.id);
    if (room) {
      const { roomName, state } = room;
      const wasProf = state.players[socket.id]?.role === 'professor';
      delete state.players[socket.id];
      socketToRoom.delete(socket.id);

      roomHackingMap.get(roomName)?.forEach((set) => set.delete(socket.id));

      io.to(roomName).emit('survivorActivity', { socketId: socket.id, terminalId: null });
      io.to(roomName).emit('playerLeft', socket.id);

      if (wasProf) {
        clearRoomMeta(roomName);
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

  // registra handlers de voz no mesmo socket
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
