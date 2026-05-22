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
  HACK_FAIL_REGRESSION,
  HACK_FAIL_LOCK_MS,
  HACK_AMOUNT_MAX,
  HACK_EFFICIENCY_PENALTY,
  HACK_KICK_REGRESSION,
  HACK_REGRESSION_RATE_PCT_S,
  HACK_REGRESSION_EVENTS_MAX,
  QUICK_ATTACK_RADIUS,
  QUICK_ATTACK_HALF_ANGLE_RAD,
  LUNGE_ATTACK_RADIUS,
  LUNGE_ATTACK_HALF_ANGLE_RAD,
  ATTACK_STAGGER_HIT_MS,
  ATTACK_STAGGER_MISS_MS,
  checkWinConditions,
  CHASE_START_RADIUS_PX,
  CHASE_END_RADIUS_PX,
  CHASE_LOS_TIMEOUT_MS,
  CHASE_FOV_HALF_DEG,
  BLOODLUST_TIER_TIMES_MS,
  GATE_TICK_AMOUNT,
  ENDGAME_DURATION_MS,
  HEAL_AMOUNT_MAX,
  HEAL_FAIL_LOCK_MS,
  HEAL_FAIL_REGRESSION,
  HEAL_SELF_CAP,
} from './gameState';
import { initVoiceWorker, registerVoiceSocket } from './voiceRouter';
import type { GameStateRecord, GateId, PlayerRecord, TerminalId } from './types';

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
// room → healerId → targetId
const roomHealingMap = new Map<string, Map<string, string>>();

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
  roomHealingMap.delete(roomName);
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
    const now        = Date.now();

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
            state.chase.losLostAt = now;
          }

          const losTimeout = state.chase.losLostAt !== null && now - state.chase.losLostAt > CHASE_LOS_TIMEOUT_MS;
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

    Object.entries(state.players).forEach(([id, p]) => {
      if (!p.downed || p.expelled) return;
      p.downBleedMs += 500;
      if (p.downBleedMs < 70_000) return;

      if (p.downCount === 1) {
        p.downCount   = 2;
        p.downBleedMs = 0;
        p.healPct     = 0;
        if (p.beingHealed) {
          p.beingHealed = false;
          io.to(roomName).emit('setBeingHealed', { targetId: id, isBeingHealed: false });
        }
        io.to(roomName).emit('downCountUpdated', { id, downCount: 2 });
      } else if (p.downCount >= 2) {
        p.expelled    = true;
        p.downed      = false;
        if (p.beingHealed) {
          p.beingHealed = false;
          io.to(roomName).emit('setBeingHealed', { targetId: id, isBeingHealed: false });
        }
        io.to(roomName).emit('playerExpelled', id);
        checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
      }
    });
  }
}, 500);

const endgameIntervals = new Map<string, ReturnType<typeof setInterval>>();

function startEndgameInterval(roomName: string): void {
  const handle = setInterval(() => {
    const state = rooms[roomName];
    if (!state?.endgameStartedAt || state.phase !== 'playing') {
      clearInterval(handle);
      endgameIntervals.delete(roomName);
      return;
    }
    if (Date.now() - state.endgameStartedAt < ENDGAME_DURATION_MS) return;

    clearInterval(handle);
    endgameIntervals.delete(roomName);

    const survivors = Object.entries(state.players).filter(
      ([, p]) => p.role === 'survivor' && !p.expelled && !p.escaped,
    );
    for (const [id, p] of survivors) {
      p.expelled = true;
      io.to(roomName).emit('playerExpelled', id);
    }
    checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
  }, 1000);
  endgameIntervals.set(roomName, handle);
}

function applyDamage(
  state: GameStateRecord,
  id: string,
  target: PlayerRecord,
  roomName: string,
): void {
  target.hp--;
  if (target.hp > 0) {
    io.to(roomName).emit('playerHit', { targetId: id, hp: target.hp });
    return;
  }
  target.hp = 0;
  if (target.downCount >= 2) {
    target.expelled = true;
    io.to(roomName).emit('playerExpelled', id);
    checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
    return;
  }
  target.downCount = (target.downCount + 1) as 0 | 1 | 2;
  target.downed      = true;
  target.healPct     = 0;
  target.downBleedMs = 0;
  if (target.beingHealed) {
    target.beingHealed = false;
    io.to(roomName).emit('setBeingHealed', { targetId: id, isBeingHealed: false });
  }
  io.to(roomName).emit('playerDowned', { id, downCount: target.downCount });
}

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

  socket.on('move', (data: { x: number; y: number; angle?: number; sprinting?: boolean; dir?: string }) => {
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

  socket.on('bloodMark', (data: { x: number; y: number; frame: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.frame !== 'number') return;
    socket.to(roomName).emit('bloodMark', { x: data.x, y: data.y, frame: data.frame });
  });

  socket.on('bloodBigPool', (data: { x: number; y: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return;
    socket.to(roomName).emit('bloodBigPool', { x: data.x, y: data.y });
  });

  socket.on('hackProgress', ({ terminalId, amount }: { terminalId: TerminalId; amount: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (p.beingHealed) return;
    if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;
    if (typeof amount !== 'number' || amount < 0 || amount > HACK_AMOUNT_MAX) return;
    if (state.terminals[terminalId] >= 100) return;

    const meta = getTerminalMeta(roomName, terminalId);
    if (Date.now() < meta.failLockUntil) return;
    if (state.endgameStartedAt !== null) return;

    const repairerCount = getRepairerCount(roomName, terminalId);
    const penaltyFactor = Math.max(0, repairerCount - 1) * (HACK_EFFICIENCY_PENALTY / 100);
    const effective = amount * Math.max(0.1, 1 - penaltyFactor);

    state.terminals[terminalId] = Math.min(100, state.terminals[terminalId] + effective);

    if (state.terminals[terminalId] >= 100) {
      state.hackedCount++;
      io.to(roomName).emit('terminalHacked', terminalId);
      const survivorCount = Object.values(state.players).filter((pl) => pl.role === 'survivor').length;
      const threshold = survivorCount + 1;
      if (state.hackedCount >= threshold && !state.gatesPowered) {
        state.gatesPowered = true;
        io.to(roomName).emit('gatesPowered');
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

  socket.on('setHealing', ({ targetId }: { targetId: string | null }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const healer = state.players[socket.id];
    if (!healer || healer.role !== 'survivor' || healer.expelled || healer.escaped) return;

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

    if (!targetId) {
      roomHealMap.delete(socket.id);
      return;
    }

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
    if (isSelf && !target.downed) return;
    if (isSelf && target.healPct >= HEAL_SELF_CAP) return;
    if (isSelf && target.beingHealed) return;
    if (!isSelf && target.hp >= 2) return;

    const cap = isSelf ? HEAL_SELF_CAP : 100;
    target.healPct = Math.min(cap, target.healPct + amount);
    io.to(roomName).emit('healUpdate', { targetId, healPct: target.healPct });

    if (!isSelf && target.healPct >= 100) {
      target.healPct     = 0;
      target.beingHealed = false;
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

    const target = state.players[targetId];
    if (!target || target.role !== 'survivor') return;

    target.healFailLockUntil = Date.now() + HEAL_FAIL_LOCK_MS;
    target.healPct = Math.max(0, target.healPct - HEAL_FAIL_REGRESSION);
    io.to(roomName).emit('healUpdate', { targetId, healPct: target.healPct });
    io.to(roomName).emit('healAlert', { targetId, healerId: socket.id });
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

  socket.on('lungeTick', ({ x, y, angle }: { x: number; y: number; angle: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const attacker = state.players[socket.id];
    if (!attacker || attacker.role !== 'professor') return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (typeof angle !== 'number' || !isFinite(angle)) return;

    const now = Date.now();
    if (now - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;

    if (!attacker.activeLunge) {
      attacker.activeLunge = { hitTargets: new Set() };
    }

    const radius    = LUNGE_ATTACK_RADIUS;
    const halfAngle = LUNGE_ATTACK_HALF_ANGLE_RAD;

    Object.entries(state.players).forEach(([id, target]) => {
      if (target.role !== 'survivor' || target.downed || target.expelled) return;
      if (attacker.activeLunge!.hitTargets.has(id)) return;

      const dx = target.x - x;
      const dy = target.y - y;
      if (dx * dx + dy * dy > radius * radius) return;

      let angleDiff = Math.abs(Math.atan2(dy, dx) - angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff > halfAngle) return;

      attacker.activeLunge!.hitTargets.add(id);
      applyDamage(state, id, target, roomName);
    });
  });

  socket.on('attack', ({ x, y, angle, lunge, dir }: { x: number; y: number; angle: number; lunge: boolean; dir?: string }) => {
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

    socket.to(roomName).emit('professorAttacked', { id: socket.id, x, y, dir: dir ?? 'down' });

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

      let angleDiff = Math.abs(Math.atan2(dy, dx) - angle);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      if (angleDiff > halfAngle) return;

      hitAny = true;
      applyDamage(state, id, target, roomName);
    });

    attacker.activeLunge = undefined;

    if (hitAny && (state.chase.elapsed > 0 || state.chase.tier > 0)) {
      state.chase.elapsed = 0;
      state.chase.tier    = 0;
      io.to(roomName).emit('bloodlustUpdate', { tier: 0, chaseActive: state.chase.target !== null });
    }

    const stagger = hitAny ? ATTACK_STAGGER_HIT_MS : ATTACK_STAGGER_MISS_MS;
    socket.emit('attackStagger', stagger);
    socket.to(roomName).emit('professorStaggered', { id: socket.id, ms: stagger });
  });

  socket.on('kick', ({ x, y, dir }: { x: number; y: number; dir: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'professor') return;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    socket.to(roomName).emit('professorKicked', { id: socket.id, x, y, dir: dir ?? 'down' });
  });

  socket.on('professorCharge', ({ charging }: { charging: boolean }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'professor') return;
    socket.to(roomName).emit('professorCharge', { id: socket.id, charging: !!charging });
  });

  socket.on('reinforceTerminal', ({ terminalId }: { terminalId: TerminalId }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'professor') return;
    if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;
    if (state.terminals[terminalId] >= 100) return;
    if (state.terminals[terminalId] <= 0) return;

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
    if (!state.gatesOpen.g1 && !state.gatesOpen.g2) return;
    p.escaped = true;
    io.to(roomName).emit('playerEscaped', socket.id);
    checkWinConditions(state, (e, ...a) => io.to(roomName).emit(e, ...a));
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

      roomHackingMap.get(roomName)?.forEach((set) => set.delete(socket.id));

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
