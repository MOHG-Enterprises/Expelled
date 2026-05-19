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
  HACK_AMOUNT_MAX,
  checkWinConditions,
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

function getRoomForSocket(socketId: string): { roomName: string; state: GameStateRecord } | null {
  const roomName = socketToRoom.get(socketId);
  if (!roomName) return null;
  const state = rooms[roomName];
  if (!state) return null;
  return { roomName, state };
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
      ready:           false,
      detentionHits:   0,
      hp:              2,
      downed:          false,
      expelled:        false,
      escaped:         false,
      lastAttackTime:  0,
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

  socket.on('move', (data: { x: number; y: number }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.expelled || p.escaped) return;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return;
    p.x = data.x;
    p.y = data.y;
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

    state.terminals[terminalId] = Math.min(100, state.terminals[terminalId] + amount);

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

  socket.on('skillCheckFailed', ({ terminalId }: { terminalId: TerminalId }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const p = state.players[socket.id];
    if (!p || p.role !== 'survivor') return;
    if (!Object.prototype.hasOwnProperty.call(state.terminals, terminalId)) return;

    state.terminals[terminalId] = Math.max(0, state.terminals[terminalId] - HACK_FAIL_REGRESSION);
    io.to(roomName).emit('terminalUpdate', { id: terminalId, progress: state.terminals[terminalId] });
    io.to(roomName).emit('firewallAlert', { terminalId, survivorId: socket.id });
  });

  socket.on('attack', ({ targetId }: { targetId: string }) => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;
    const { roomName, state } = room;
    const attacker = state.players[socket.id];
    const target   = state.players[targetId];
    if (!attacker || attacker.role !== 'professor') return;
    if (!target || target.role !== 'survivor' || target.downed || target.expelled) return;

    const now = Date.now();
    if (now - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;
    attacker.lastAttackTime = now;

    target.hp--;
    if (target.hp <= 0) {
      target.hp            = 0;
      target.downed        = true;
      target.detentionHits = 0;
      io.to(roomName).emit('playerDowned', targetId);
    } else {
      io.to(roomName).emit('playerHit', { targetId, hp: target.hp });
    }
    socket.emit('attackStagger', ATTACK_COOLDOWN_MS);
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

    state.terminals[terminalId] = Math.max(0, state.terminals[terminalId] - 30);
    io.to(roomName).emit('terminalUpdate', { id: terminalId, progress: state.terminals[terminalId] });
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

      io.to(roomName).emit('playerLeft', socket.id);

      if (wasProf) {
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
