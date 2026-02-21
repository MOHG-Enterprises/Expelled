const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../')));

// Estado global da partida
const gameState = {
  players: {},
  terminals: { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0 },
};

io.on('connection', (socket) => {
  console.log(`Jogador conectou: ${socket.id}`);

  // Registra o jogador
  gameState.players[socket.id] = { x: 100, y: 100, role: 'survivor' };
  io.emit('gameState', gameState);

  // Recebe movimento
  socket.on('move', (data) => {
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].x = data.x;
      gameState.players[socket.id].y = data.y;
    }
    socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
  });

  socket.on('disconnect', () => {
    console.log(`Jogador desconectou: ${socket.id}`);
    delete gameState.players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
