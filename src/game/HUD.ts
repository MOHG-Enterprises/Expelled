import Phaser from 'phaser';
import type { Role } from '../types';

export interface SurvivorStatus {
  label:    string;
  hp:       number;
  downed:   boolean;
  expelled: boolean;
  escaped:  boolean;
}

export class HUD {
  private scene: Phaser.Scene;

  private hudRole!:      Phaser.GameObjects.Text;
  private hudHp!:        Phaser.GameObjects.Text;
  private hudTerminals!: Phaser.GameObjects.Text;
  private hudGate!:      Phaser.GameObjects.Text;
  private hudHint!:      Phaser.GameObjects.Text;
  private hudGamepad!:   Phaser.GameObjects.Text;
  private hudMic!:       Phaser.GameObjects.Text;
  private hudAttack!:    Phaser.GameObjects.Text;
  private hudSurvivors:  Phaser.GameObjects.Text[] = [];

  private currentRole:  Role | null = null;
  private currentDowned = false;
  private usingGamepad  = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build() {
    this.hudRole      = this.scene.add.text(16, 16, '', { fontSize: '14px', color: '#fff' }).setScrollFactor(0).setDepth(30);
    this.hudHp        = this.scene.add.text(16, 34, '', { fontSize: '14px', color: '#e94560' }).setScrollFactor(0).setDepth(30);
    this.hudTerminals = this.scene.add.text(16, 52, '', { fontSize: '12px', color: '#aaa' }).setScrollFactor(0).setDepth(30);
    this.hudGate      = this.scene.add.text(16, 70, '', { fontSize: '13px', color: '#00e676', stroke: '#000', strokeThickness: 3 }).setScrollFactor(0).setDepth(30);
    this.hudHint      = this.scene.add.text(16, 570, '', { fontSize: '12px', color: '#aaa' }).setScrollFactor(0).setDepth(30);

    this.hudGamepad = this.scene.add
      .text(784, 16, 'Controle inativo — pressione um botao para ativar', { fontSize: '11px', color: '#555' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30);

    for (let i = 0; i < 4; i++) {
      this.hudSurvivors.push(
        this.scene.add
          .text(784, 34 + i * 18, '', { fontSize: '12px', color: '#fff' })
          .setOrigin(1, 0).setScrollFactor(0).setDepth(30),
      );
    }

    this.hudAttack = this.scene.add
      .text(784, 550, '', { fontSize: '13px', color: '#fff' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30);

    this.hudMic = this.scene.add
      .text(784, 570, '', { fontSize: '12px', color: '#4caf50' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30);
  }

  update(role: Role | null, hp: number, downed: boolean) {
    this.currentRole  = role;
    this.currentDowned = downed;

    this.hudRole.setText(`Role: ${role ?? '...'}`);
    this.hudHp.setText(
      role === 'survivor'
        ? `HP: ${'♥'.repeat(Math.max(0, hp))}${'♡'.repeat(Math.max(0, 2 - hp))}`
        : '',
    );

    this.hudAttack.setVisible(role === 'professor');
    this.refreshHint();
  }

  setTerminalCount(done: number, total: number) {
    if (total === 0) return;
    this.hudTerminals.setText(`Terminais: ${done}/${total}`);
  }

  setGateOpen(open: boolean) {
    this.hudGate.setText(open ? 'PORTAO ABERTO — va para a saida!' : '');
  }

  setSurvivorStatuses(statuses: SurvivorStatus[]) {
    this.hudSurvivors.forEach((t, i) => {
      const s = statuses[i];
      if (!s) { t.setText(''); return; }

      let text: string;
      let color: string;
      if (s.escaped)       { text = `${s.label} FUGIU`;   color = '#4fc3f7'; }
      else if (s.expelled) { text = `${s.label} EXPULSO`; color = '#555555'; }
      else if (s.downed)   { text = `${s.label} DET`;     color = '#ff9800'; }
      else if (s.hp <= 1)  { text = `${s.label} ♥`;       color = '#ffcc00'; }
      else                 { text = `${s.label} ♥♥`;      color = '#4caf50'; }

      t.setText(text).setColor(color);
    });
  }

  setAttackCooldown(remainingMs: number) {
    if (!this.hudAttack.visible) return;
    const label = this.usingGamepad ? 'X' : 'SPACE';
    if (remainingMs > 0) {
      this.hudAttack.setText(`[ ${(remainingMs / 1000).toFixed(1)}s ]`).setColor('#666');
    } else {
      this.hudAttack.setText(`[ ${label} ]`).setColor('#fff');
    }
  }

  setGamepadConnected(connected: boolean) {
    this.hudGamepad.setVisible(!connected);
    if (this.usingGamepad !== connected) {
      this.usingGamepad = connected;
      this.refreshHint();
    }
  }

  setMicState(state: 'active' | 'muted' | 'error' | 'off'): void {
    switch (state) {
      case 'active': this.hudMic.setText('● MIC').setColor('#4caf50'); break;
      case 'muted':  this.hudMic.setText('● MUDO').setColor('#ff9800'); break;
      case 'error':  this.hudMic.setText('● SEM MIC').setColor('#ef5350'); break;
      case 'off':    this.hudMic.setText(''); break;
    }
  }

  flash(text: string, color = 0xffffff, duration = 2000) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t = this.scene.add
      .text(400, 200, text, { fontSize: '22px', color: hex, stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.scene.time.delayedCall(duration, () => t.destroy());
  }

  private refreshHint() {
    const gp = this.usingGamepad;
    if (this.currentDowned) {
      this.hudHint.setText(gp ? 'X para responder' : 'SPACE para responder');
    } else if (this.currentRole === 'survivor') {
      this.hudHint.setText(gp
        ? 'A (segurar) = hackear  |  A na saida = fugir'
        : 'E (segurar) = hackear  |  E na saida = fugir');
    } else if (this.currentRole === 'professor') {
      this.hudHint.setText(gp
        ? 'X = atacar  |  A = reforcar terminal'
        : 'SPACE = atacar  |  E = reforcar terminal');
    } else {
      this.hudHint.setText('');
    }
  }
}
