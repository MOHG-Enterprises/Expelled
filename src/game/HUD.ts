import Phaser from 'phaser';
import type { Role, GamePhase } from '../types';

export class HUD {
  private scene: Phaser.Scene;
  private hudRole!:    Phaser.GameObjects.Text;
  private hudHp!:      Phaser.GameObjects.Text;
  private hudPhase!:   Phaser.GameObjects.Text;
  private hudHint!:    Phaser.GameObjects.Text;
  private hudGamepad!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build() {
    const base = { scrollFactor: 0 } as const;
    this.hudRole  = this.scene.add.text(16, 16,  '', { fontSize: '14px', color: '#fff' }).setScrollFactor(0).setDepth(30);
    this.hudHp    = this.scene.add.text(16, 34,  '', { fontSize: '14px', color: '#e94560' }).setScrollFactor(0).setDepth(30);
    this.hudPhase = this.scene.add.text(16, 52,  '', { fontSize: '12px', color: '#888' }).setScrollFactor(0).setDepth(30);
    this.hudHint   = this.scene.add.text(16, 570, '', { fontSize: '12px', color: '#aaa' }).setScrollFactor(0).setDepth(30);
    this.hudGamepad = this.scene.add
      .text(784, 16, 'Controle inativo — pressione um botao para ativar', { fontSize: '11px', color: '#555' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(30);
    void base; // so pra n reclamar q ta sem uso
  }

  update(role: Role | null, hp: number, phase: GamePhase | string, downed: boolean) {
    this.hudRole.setText(`Role: ${role ?? '...'}`);
    this.hudHp.setText(
      role === 'survivor'
        ? `HP: ${'♥'.repeat(Math.max(0, hp))}${'♡'.repeat(Math.max(0, 2 - hp))}`
        : '',
    );
    this.hudPhase.setText(`Fase: ${phase}`);

    if (downed)                    this.hudHint.setText('Em detenção — SPACE para responder');
    else if (role === 'survivor')  this.hudHint.setText('E (segurar) = hackear  |  E na saída = fugir');
    else if (role === 'professor') this.hudHint.setText('SPACE = atacar  |  E = reforçar terminal');
    else                           this.hudHint.setText('');
  }

  setGamepadConnected(connected: boolean) {
    this.hudGamepad.setVisible(!connected);
  }

  flash(text: string, color = 0xffffff, duration = 2000) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t = this.scene.add
      .text(400, 200, text, { fontSize: '22px', color: hex, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(50);
    this.scene.time.delayedCall(duration, () => t.destroy());
  }
}
