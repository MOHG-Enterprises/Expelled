import Phaser from 'phaser';
import { StartScene }    from './scenes/StartScene';
import { LobbyScene }    from './scenes/LobbyScene';
import { GameScene }     from './scenes/GameScene';
import { PostGameScene } from './scenes/PostGameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { gamepad: true },
  scene: [StartScene, LobbyScene, GameScene, PostGameScene],
};

new Phaser.Game(config);
