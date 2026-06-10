import Phaser from 'phaser';

interface PostGameData {
  winner: string;
  stats:  Record<string, { role: 'survivor' | 'professor' }>;
  myId:   string;
}

export class EndScreenScene extends Phaser.Scene {
  constructor() {
    super('EndScreenScene');
  }

  preload() {
    this.load.image('opressoresWin',  './screen/opressoresWin.jpg');
    this.load.image('opressoresLose', './screen/opressoresLose.jpg');
    this.load.image('oprimidosWin',   './screen/oprimidosWin.jpg');
    this.load.image('oprimidosLose',  './screen/oprimidosLose.jpg');
  }

  create() {
    const data = this.registry.get('postGameData') as PostGameData;
    const myRole = data?.stats[data.myId]?.role ?? 'survivor';
    const winner = data?.winner ?? '';

    let key: string;
    if (myRole === 'professor') {
      key = winner === 'professor' ? 'opressoresWin' : 'opressoresLose';
    } else {
      key = winner === 'survivors' ? 'oprimidosWin' : 'oprimidosLose';
    }

    const { width, height } = this.scale;
    const img = this.add.image(width / 2, height / 2, key);
    img.setDisplaySize(width, height);

    const onResize = (gameSize: Phaser.Structs.Size) => {
      img.setPosition(gameSize.width / 2, gameSize.height / 2);
      img.setDisplaySize(gameSize.width, gameSize.height);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.time.delayedCall(5000, () => this.scene.start('PostGameScene'));
  }
}
