import Phaser from 'phaser';
import { StartScene }    from './scenes/StartScene';
import { LobbyScene }    from './scenes/LobbyScene';
import { GameScene }     from './scenes/GameScene';
import { PostGameScene } from './scenes/PostGameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#1a1a2e',
  scale: {
    parent: 'game',
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600,
  },
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { gamepad: true },
  scene: [StartScene, LobbyScene, GameScene, PostGameScene],
};

new Phaser.Game(config);
// (window as unknown as Record<string, unknown>).game = new Phaser.Game(config);
