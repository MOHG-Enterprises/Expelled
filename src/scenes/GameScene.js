class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    this.socket = io();

    // Jogador local 
    this.player = this.add.rectangle(400, 300, 16, 16, 0x4fc3f7);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setSize(16, 16, true);
    // Outros jogadores
    this.otherPlayers = {};

    this.socket.on('gameState', (state) => {
      Object.keys(state.players).forEach(id => {
        if (id !== this.socket.id && !this.otherPlayers[id]) {
          this.otherPlayers[id] = this.add.rectangle(
            state.players[id].x, state.players[id].y, 16, 16, 0xe94560
          );
        }
      });
    });

    this.socket.on('playerMoved', (data) => {
      if (this.otherPlayers[data.id]) {
        this.otherPlayers[data.id].setPosition(data.x, data.y);
      } else {
        this.otherPlayers[data.id] = this.add.rectangle(data.x, data.y, 16, 16, 0xe94560);
      }
    });

    // tira quem kitou
    this.socket.on('playerLeft', (id) => {
      if (this.otherPlayers[id]) {
        this.otherPlayers[id].destroy();
        delete this.otherPlayers[id];
      }
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // hud fds
    this.add.text(16, 16, 'EXPELLED — alfa B)', { fontSize: '14px', fill: '#888' });
  }

  update() {
    const speed = 160;
    const body = this.player.body;

    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = 1;

    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
    }

    body.setVelocity(vx, vy);

    // Envia posição para o servidor a cada frame (vamootimiza c throttle dps)
    this.socket.emit('move', { x: this.player.x, y: this.player.y });
  }
}
