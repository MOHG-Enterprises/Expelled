import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import {
  freshGameState,
  ATTACK_COOLDOWN_MS,
  DETENTION_SKILL_CHECKS_REQUIRED,
  checkWinConditions,
} from './gameState';
import type { GameStateRecord, TerminalId } from './types';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, '../')));

let gameState: GameStateRecord = freshGameState();
const DEFAULT_PROFESSOR_SPAWN = { x: 1840, y: 2160 };
const DEFAULT_SURVIVOR_SPAWN = { x: 1680, y: 2155 };

io.on('connection', (socket) => {
  console.log(`Jogador conectou: ${socket.id}`);

  const isProfessor = Object.keys(gameState.players).length === 0;
  gameState.players[socket.id] = {
    x: isProfessor ? DEFAULT_PROFESSOR_SPAWN.x : DEFAULT_SURVIVOR_SPAWN.x,
    y: isProfessor ? DEFAULT_PROFESSOR_SPAWN.y : DEFAULT_SURVIVOR_SPAWN.y,
    role: isProfessor ? 'professor' : 'survivor',
    ready: false,
    detentionHits: 0,
    hp: 2,
    downed: false,
    expelled: false,
    escaped: false,
    lastAttackTime: 0,
  };

  socket.emit('roleAssigned', gameState.players[socket.id].role);
  io.emit('gameState', gameState);

  socket.on('setReady', ({ ready }: { ready: boolean }) => {
    const p = gameState.players[socket.id];
    if (!p || p.role !== 'survivor' || gameState.phase !== 'lobby') return;
    if (typeof ready !== 'boolean') return;
    p.ready = ready;
    io.emit('gameState', gameState);
  });

  socket.on('startMatch', () => {
    const p = gameState.players[socket.id];
    if (!p || p.role !== 'professor' || gameState.phase !== 'lobby') return;

    const survivors = Object.values(gameState.players).filter((player) => player.role === 'survivor');
    if (survivors.length < 1) return;
    if (!survivors.every((player) => player.ready)) return;

    gameState.phase = 'playing';
    io.emit('gamePhase', 'playing');
  });

  // pede sync novo dps da troca de cena
  socket.on('requestSync', () => {
    const p = gameState.players[socket.id];
    if (!p) return;
    socket.emit('roleAssigned', p.role);
    socket.emit('gameState', gameState);
    socket.emit('gamePhase', gameState.phase);
  });

  //  movimento 
  socket.on('move', (data: { x: number; y: number }) => {
    const p = gameState.players[socket.id];
    if (!p || p.expelled || p.escaped) return;
    if (typeof data.x !== 'number' || typeof data.y !== 'number') return;
    p.x = data.x;
    p.y = data.y;
    socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
  });

  //  hack 
  socket.on('hackProgress', ({ terminalId, amount }: { terminalId: TerminalId; amount: number }) => {
    const p = gameState.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (!Object.prototype.hasOwnProperty.call(gameState.terminals, terminalId)) return;
    if (typeof amount !== 'number' || amount < 0 || amount > 20) return;
    if (gameState.terminals[terminalId] >= 100) return;

    gameState.terminals[terminalId] = Math.min(100, gameState.terminals[terminalId] + amount);

    if (gameState.terminals[terminalId] >= 100) {
      gameState.hackedCount++;
      io.emit('terminalHacked', terminalId);
      // qtde de terminal pra ganhar = qtde de survivor
      const survivorCount = Object.values(gameState.players).filter(p => p.role === 'survivor').length;
      if (gameState.hackedCount >= survivorCount && !gameState.gateOpen) {
        gameState.gateOpen = true;
        io.emit('gateUnlocked');
      }
    }

    io.emit('terminalUpdate', { id: terminalId, progress: gameState.terminals[terminalId] });
  });

  socket.on('skillCheckFailed', ({ terminalId }: { terminalId: TerminalId }) => {
    const p = gameState.players[socket.id];
    if (!p || p.role !== 'survivor') return;
    io.emit('firewallAlert', { terminalId, survivorId: socket.id });
  });

  //  ataque do professor 
  socket.on('attack', ({ targetId }: { targetId: string }) => {
    const attacker = gameState.players[socket.id];
    const target   = gameState.players[targetId];
    if (!attacker || attacker.role !== 'professor') return;
    if (!target || target.role !== 'survivor' || target.downed || target.expelled) return;

    const now = Date.now();
    if (now - attacker.lastAttackTime < ATTACK_COOLDOWN_MS) return;
    attacker.lastAttackTime = now;

    target.hp--;
    if (target.hp <= 0) {
      target.hp     = 0;
      target.downed = true;
      target.detentionHits = 0;
      io.emit('playerDowned', targetId);
    } else {
      io.emit('playerHit', { targetId, hp: target.hp });
    }
    socket.emit('attackStagger', ATTACK_COOLDOWN_MS);
  });

  //  detencao 
  socket.on('detentionAnswer', ({ correct }: { correct: boolean }) => {
    const p = gameState.players[socket.id];
    if (!p || !p.downed) return;
    if (typeof correct !== 'boolean') return;

    if (correct) {
      p.detentionHits += 1;
      if (p.detentionHits >= DETENTION_SKILL_CHECKS_REQUIRED) {
        p.downed = false;
        p.hp = 1;
        p.detentionHits = 0;
        socket.emit('detentionEscaped');
        io.emit('playerRevived', socket.id);
      } else {
        socket.emit('detentionProgress', {
          current: p.detentionHits,
          required: DETENTION_SKILL_CHECKS_REQUIRED,
        });
      }
    } else {
      p.expelled = true;
      p.detentionHits = 0;
      socket.emit('expelled');
      io.emit('playerExpelled', socket.id);
      checkWinConditions(gameState, (e, ...a) => io.emit(e, ...a));
    }
  });

  //  reforco de terminal (prof)
  socket.on('reinforceTerminal', ({ terminalId }: { terminalId: TerminalId }) => {
    const p = gameState.players[socket.id];
    if (!p || p.role !== 'professor') return;
    if (!Object.prototype.hasOwnProperty.call(gameState.terminals, terminalId)) return;
    if (gameState.terminals[terminalId] >= 100) return;

    gameState.terminals[terminalId] = Math.max(0, gameState.terminals[terminalId] - 30);
    io.emit('terminalUpdate', { id: terminalId, progress: gameState.terminals[terminalId] });
  });

  //  fuga 
  socket.on('escape', () => {
    const p = gameState.players[socket.id];
    if (!p || p.role !== 'survivor' || p.downed || p.expelled) return;
    if (!gameState.gateOpen) return;
    p.escaped = true;
    io.emit('playerEscaped', socket.id);
    checkWinConditions(gameState, (e, ...a) => io.emit(e, ...a));
  });

  //  quit/disconnect 
  socket.on('disconnect', () => {
    console.log(`Jogador desconectou: ${socket.id}`);
    const wasProf = gameState.players[socket.id]?.role === 'professor';
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);

    if (wasProf) {
      gameState = freshGameState();
      io.emit('gameReset');
    } else {
      checkWinConditions(gameState, (e, ...a) => io.emit(e, ...a));
    }
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando em http://0.0.0.0:${PORT}`));
