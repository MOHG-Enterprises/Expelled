import Phaser from 'phaser';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene }  from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [LobbyScene, GameScene], // Lobby primeiro, dps poartida
};

new Phaser.Game(config);
