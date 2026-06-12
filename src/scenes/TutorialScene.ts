import Phaser from 'phaser';
import { SkillCheck } from '../game/SkillCheck';

const TUTORIAL_PAGES = 3;

type InputMode = 'keyboard' | 'gamepad' | 'touch';

export class TutorialScene extends Phaser.Scene {
  private currentPage = 0;
  private inputMode: InputMode = 'keyboard';
  private questionContainer!: Phaser.GameObjects.Container;
  private pages: Phaser.GameObjects.Container[] = [];
  private navContainer!: Phaser.GameObjects.Container;
  private prevBtn!: Phaser.GameObjects.Text;
  private nextBtn!: Phaser.GameObjects.Text;
  private feedbackText!: Phaser.GameObjects.Text;
  private survivorBody!: Phaser.GameObjects.Text;
  private skillCheckBody!: Phaser.GameObjects.Text;
  private professorBody!: Phaser.GameObjects.Text;
  private skillCheck!: SkillCheck;
  private demoRestart: Phaser.Time.TimerEvent | null = null;
  private padHint!: Phaser.GameObjects.Text;

  constructor() {
    super('TutorialScene');
  }

  preload() {
    this.load.image('tut-survivor-icon', './personagens/survivors/arthur/icons/Arthur_Icon.png');
    this.load.image('tut-killer-icon', './personagens/killers/professor/icon/Boi_Icon.png');
    this.load.spritesheet('tut-terminal', './Computer Room Spritesheet 1 (1).png', {
      frameWidth: 32,
      frameHeight: 32,
    });
    this.load.audio('buttonClick', './audio/buttonClick.wav');
  }

  create() {
    this.currentPage = 0;
    this.pages = [];
    this.demoRestart = null;
    this.inputMode = this.detectInputMode();
    this.cameras.main.setBackgroundColor('#1a1a2e');
    this.skillCheck = new SkillCheck(this);

    this.buildQuestionScreen();
    this.pages.push(this.buildSurvivorPage(), this.buildSkillCheckPage(), this.buildProfessorPage());
    this.buildNav();
    this.padHint = this.add.text(this.scale.width / 2, this.scale.height - 16, '', {
      fontSize: '11px', color: '#888',
    }).setOrigin(0.5);
    this.showQuestion();
    this.applySkillCheckPrompt();

    this.input.keyboard?.on('keydown-SPACE', () => this.skillCheck.tryHit());
    this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      this.onPadDown(button.index);
    });
    this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.skillCheck.tryHit();
    });
    this.input.gamepad?.once('connected', () => {
      this.inputMode = 'gamepad';
      this.refreshControlTexts();
    });

    const onResize = (gameSize: Phaser.Structs.Size) => {
      const cx = gameSize.width / 2;
      const cy = gameSize.height / 2;
      this.questionContainer.setPosition(cx, cy);
      this.pages.forEach((p) => p.setPosition(cx, cy));
      this.navContainer.setPosition(cx, gameSize.height - 50);
      this.padHint.setPosition(cx, gameSize.height - 16);
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  update(_time: number, delta: number) {
    this.skillCheck.update(delta);
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void, fontSize = '20px') {
    const btn = this.add.text(x, y, label, {
      fontSize,
      color: '#e0e0ff',
      backgroundColor: '#333355',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setBackgroundColor('#4a4a77'));
    btn.on('pointerout', () => btn.setBackgroundColor('#333355'));
    btn.on('pointerdown', () => { this.sound.play('buttonClick', { volume: 0.5 }); onClick(); });
    return btn;
  }

  private buildQuestionScreen() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const title = this.add.text(0, -100, 'Já jogou Expelled antes?', {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const yesBtn = this.makeButton(0, -10, 'Sim, ir pro lobby', () => this.goToLobby());
    const noBtn = this.makeButton(0, 60, 'Não, ver o tutorial', () => this.showPage(0));
    this.questionContainer = this.add.container(cx, cy, [title, yesBtn, noBtn]);
  }

  private buildSurvivorPage(): Phaser.GameObjects.Container {
    const title = this.add.text(0, -210, 'ALUNO', {
      fontSize: '26px',
      color: '#00e676',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const icon = this.add.image(-100, -130, 'tut-survivor-icon').setDisplaySize(96, 96);
    const terminal = this.add.sprite(100, -130, 'tut-terminal', 0).setDisplaySize(96, 96);
    this.survivorBody = this.add.text(0, 40, this.survivorBodyText(), {
      fontSize: '16px',
      color: '#e0e0ff',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);
    return this.add.container(this.scale.width / 2, this.scale.height / 2, [title, icon, terminal, this.survivorBody]).setVisible(false);
  }

  private buildSkillCheckPage(): Phaser.GameObjects.Container {
    const title = this.add.text(0, -210, 'SKILL CHECK', {
      fontSize: '26px',
      color: '#00e676',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.skillCheckBody = this.add.text(0, -150, this.skillCheckBodyText(), {
      fontSize: '16px',
      color: '#e0e0ff',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);
    this.feedbackText = this.add.text(0, 110, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    return this.add.container(this.scale.width / 2, this.scale.height / 2, [title, this.skillCheckBody, this.feedbackText]).setVisible(false);
  }

  private buildProfessorPage(): Phaser.GameObjects.Container {
    const title = this.add.text(0, -210, 'PROFESSOR', {
      fontSize: '26px',
      color: '#ff5555',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const icon = this.add.image(0, -130, 'tut-killer-icon').setDisplaySize(96, 96);
    this.professorBody = this.add.text(0, 40, this.professorBodyText(), {
      fontSize: '16px',
      color: '#e0e0ff',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);
    return this.add.container(this.scale.width / 2, this.scale.height / 2, [title, icon, this.professorBody]).setVisible(false);
  }

  private buildNav() {
    this.prevBtn = this.makeButton(-220, 0, '◀ Voltar', () => this.showPage(this.currentPage - 1), '16px');
    const skipBtn = this.makeButton(0, 0, 'Pular tutorial', () => this.goToLobby(), '14px');
    this.nextBtn = this.makeButton(220, 0, 'Avançar ▶', () => {
      if (this.currentPage === TUTORIAL_PAGES - 1) this.goToLobby();
      else this.showPage(this.currentPage + 1);
    }, '16px');
    this.navContainer = this.add.container(this.scale.width / 2, this.scale.height - 50, [this.prevBtn, skipBtn, this.nextBtn]);
    this.navContainer.setVisible(false);
  }

  private showQuestion() {
    this.questionContainer.setVisible(true);
    this.pages.forEach((p) => p.setVisible(false));
    this.navContainer.setVisible(false);
    this.updatePadHint();
  }

  private showPage(index: number) {
    this.stopDemo();
    this.questionContainer.setVisible(false);
    this.pages.forEach((p, i) => p.setVisible(i === index));
    this.currentPage = index;
    this.navContainer.setVisible(true);
    this.prevBtn.setVisible(index > 0);
    this.nextBtn.setText(index === TUTORIAL_PAGES - 1 ? 'Jogar ▶' : 'Avançar ▶');
    this.updatePadHint();
    if (index === 1) this.startDemo();
  }

  private onPadDown(buttonIndex: number) {
    if (this.inputMode !== 'gamepad') {
      this.inputMode = 'gamepad';
      this.refreshControlTexts();
    }
    if (this.questionContainer.visible) {
      if (buttonIndex === 0) this.showPage(0);
      else if (buttonIndex === 9) this.goToLobby();
      return;
    }
    if (this.navContainer.visible) {
      if (buttonIndex === 0 || buttonIndex === 2) {
        this.skillCheck.tryHit();
      } else if (buttonIndex === 1 && this.currentPage > 0) {
        this.showPage(this.currentPage - 1);
      } else if (buttonIndex === 9 || buttonIndex === 5) {
        if (this.currentPage === TUTORIAL_PAGES - 1) this.goToLobby();
        else this.showPage(this.currentPage + 1);
      } else if (buttonIndex === 3) {
        this.goToLobby();
      }
    }
  }

  private updatePadHint() {
    if (this.inputMode !== 'gamepad') {
      this.padHint.setText('');
      return;
    }
    this.padHint.setText(
      this.questionContainer.visible
        ? 'Controle:  A — ver tutorial   ·   START — ir pro lobby'
        : 'Controle:  B — voltar   ·   A/X — skill check   ·   START — avançar   ·   Y — pular',
    );
  }

  private startDemo() {
    this.feedbackText.setText('');
    this.skillCheck.show(
      (isGreat) => this.onDemoResult(isGreat ? 'Ótimo! Bônus de progresso!' : 'Acertou!', isGreat ? '#ffee00' : '#00e676'),
      () => this.onDemoResult('Errou — no jogo, o terminal regrediria 15%.', '#ff5555'),
    );
  }

  private onDemoResult(message: string, color: string) {
    this.feedbackText.setText(message).setColor(color);
    this.demoRestart = this.time.delayedCall(1100, () => {
      if (this.currentPage === 1) this.startDemo();
    });
  }

  private stopDemo() {
    this.demoRestart?.remove();
    this.demoRestart = null;
    this.skillCheck.hide();
    if (this.feedbackText) this.feedbackText.setText('');
  }

  private goToLobby() {
    this.stopDemo();
    this.scene.start('LobbyScene');
  }

  private detectInputMode(): InputMode {
    if ((this.input.gamepad?.total ?? 0) > 0) return 'gamepad';
    if (navigator.maxTouchPoints > 0) return 'touch';
    return 'keyboard';
  }

  private refreshControlTexts() {
    this.survivorBody.setText(this.survivorBodyText());
    this.skillCheckBody.setText(this.skillCheckBodyText());
    this.professorBody.setText(this.professorBodyText());
    this.updatePadHint();
    this.applySkillCheckPrompt();
  }

  private applySkillCheckPrompt() {
    const prompt: Record<InputMode, string> = {
      keyboard: 'SPACE !',
      gamepad:  'A / X !',
      touch:    'TAP !',
    };
    this.skillCheck.setPromptText(prompt[this.inputMode]);
  }

  private survivorBodyText(): string {
    const controls: Record<InputMode, string[]> = {
      keyboard: [
        'WASD / Setas — mover',
        'SHIFT — correr',
        'E — hackear terminal / interagir',
      ],
      gamepad: [
        'Analógico esquerdo — mover',
        'RB — correr',
        'A — hackear terminal / interagir',
      ],
      touch: [
        'Joystick — mover',
        'Botão CORRER — correr',
        'Botão INTERAGIR — hackear terminal',
      ],
    };
    return [
      'Objetivo: hackeie os terminais e fuja pelo portão.',
      '',
      ...controls[this.inputMode],
      '',
      'Se o professor te derrubar, ainda não acabou!!:',
      'Fique parado para se curar e espere alguém vir te levantar.',
    ].join('\n');
  }

  private skillCheckBodyText(): string {
    const hit: Record<InputMode, string> = {
      keyboard: 'Aperte SPACE (ou clique) quando o ponteiro estiver na zona verde.',
      gamepad: 'Aperte A ou X quando o ponteiro estiver na zona verde.',
      touch: 'Toque na tela quando o ponteiro estiver na zona verde\n(no jogo, use o botão TAP!).',
    };
    return [
      'Enquanto hackeia, skill checks aparecem do nada.',
      hit[this.inputMode],
      'A zona amarela dá um bônus de progresso. Treine à vontade:',
    ].join('\n');
  }

  private professorBodyText(): string {
    const controls: Record<InputMode, string[]> = {
      keyboard: [
        'WASD / Setas — mover',
        'SPACE ou clique esquerdo — atacar (tem cooldown)',
      ],
      gamepad: [
        'Analógico esquerdo — mover',
        'RT — atacar (tem cooldown)',
      ],
      touch: [
        'Joystick — mover · analógico da direita — mirar',
        'Botão ATACAR — atacar (tem cooldown)',
      ],
    };
    return [
      'Objetivo: expulse todos os alunos antes que eles fujam.',
      '',
      ...controls[this.inputMode],
      'Aperte e solte = ataque curto · segure = lunge (avança com mais alcance)',
      '',
      'Você enxerga pelo cone da lanterna',
      'e ouve as vozes dos alunos dentro dele.',
    ].join('\n');
  }
}
