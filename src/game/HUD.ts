import Phaser from 'phaser';
import type { Role } from '../types';

export interface SurvivorStatus {
  label:    string;
  skinId:   string;
  hp:       number;
  downed:   boolean;
  expelled: boolean;
  escaped:  boolean;
  hacking:  boolean;
}

const CARD_X   = 8;
const CARD_W   = 78;
const CARD_H   = 76;
const CARD_GAP = 6;
const PORT_H   = 44;

const ACCENT_COLORS = [0x4285f4, 0x34a853, 0xfbbc04, 0x9c27b0] as const;

const STATE_BORDER: Record<string, number> = {
  healthy:  0x4caf50,
  injured:  0xffcc00,
  downed:   0xff9800,
  expelled: 0x444444,
  escaped:  0x4fc3f7,
};

interface SurvivorCard {
  bg:        Phaser.GameObjects.Graphics;
  portrait:  Phaser.GameObjects.Graphics;
  portImg:   Phaser.GameObjects.Image | null;
  overlay:   Phaser.GameObjects.Graphics;
  nameText:  Phaser.GameObjects.Text;
  hpDots:    Phaser.GameObjects.Graphics;
  hackIcon:  Phaser.GameObjects.Text;
  baseColor: number;
  cardY:     number;
}

export class HUD {
  private scene: Phaser.Scene;

  private roleBadge!:   Phaser.GameObjects.Graphics;
  private hudRole!:     Phaser.GameObjects.Text;
  private selfHpBar!:   Phaser.GameObjects.Graphics;
  private hudTerminals!: Phaser.GameObjects.Text;
  private hudGate!:     Phaser.GameObjects.Text;
  private hudHint!:     Phaser.GameObjects.Text;
  private hudGamepad!:  Phaser.GameObjects.Text;
  private hudMic!:      Phaser.GameObjects.Text;
  private hudAttack!:   Phaser.GameObjects.Text;
  private survivorCards: SurvivorCard[] = [];
  private terrorHeart!: Phaser.GameObjects.Text;
  private terrorTween:  Phaser.Tweens.Tween | null = null;
  private currentTerrorLevel = -1;

  private hackBarGraphic!: Phaser.GameObjects.Graphics;
  private hackBarLabel!:   Phaser.GameObjects.Text;
  private hackBarPct!:     Phaser.GameObjects.Text;
  private lastHackProg:    number | null = null;

  private currentRole:  Role | null = null;
  private currentDowned = false;
  private usingGamepad  = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build() {
    this.roleBadge = this.scene.add.graphics().setScrollFactor(0).setDepth(30);
    this.hudRole   = this.scene.add
      .text(30, 10, '', { fontSize: '12px', color: '#fff', fontStyle: 'bold' })
      .setScrollFactor(0).setDepth(31);

    this.selfHpBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30);

    this.hudTerminals = this.scene.add
      .text(8, 52, '', { fontSize: '11px', color: '#ccc' })
      .setScrollFactor(0).setDepth(30);

    this.hudGate = this.scene.add
      .text(8, 68, '', { fontSize: '12px', color: '#00e676', stroke: '#000', strokeThickness: 3 })
      .setScrollFactor(0).setDepth(30);

    this.hudHint = this.scene.add
      .text(8, 578, '', { fontSize: '11px', color: '#777' })
      .setScrollFactor(0).setDepth(30);

    this.hudGamepad = this.scene.add
      .text(792, 8, 'Controle inativo — pressione um botao para ativar', { fontSize: '10px', color: '#555' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30);

    this.hudAttack = this.scene.add
      .text(792, 550, '', { fontSize: '13px', color: '#fff' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30);

    this.hudMic = this.scene.add
      .text(792, 568, '', { fontSize: '11px', color: '#4caf50' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30);

    this.terrorHeart = this.scene.add
      .text(400, 548, '♥', { fontSize: '30px', color: '#ff2244', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(30).setAlpha(0);

    this.hackBarGraphic = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.hackBarLabel   = this.scene.add
      .text(400, 465, 'HACKEANDO', {
        fontSize: '11px', color: '#8ec8f0', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    this.hackBarPct = this.scene.add
      .text(400, 480, '', { fontSize: '10px', color: '#cce8ff' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(32).setAlpha(0);

    this._buildSurvivorCards();
  }

  private _buildSurvivorCards() {
    const startY = 92;

    for (let i = 0; i < 4; i++) {
      const cardY     = startY + i * (CARD_H + CARD_GAP);
      const baseColor = ACCENT_COLORS[i];

      const bg       = this.scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
      const portrait = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
      const overlay  = this.scene.add.graphics().setScrollFactor(0).setDepth(32).setAlpha(0);

      const nameText = this.scene.add
        .text(CARD_X + 8, cardY + PORT_H + 6, '', { fontSize: '10px', color: '#ddd', fontStyle: 'bold' })
        .setScrollFactor(0).setDepth(31).setAlpha(0);

      const hpDots = this.scene.add.graphics().setScrollFactor(0).setDepth(31).setAlpha(0);

      const hackIcon = this.scene.add
        .text(CARD_X + 8, cardY + PORT_H + 19, '⚙ HACK', {
          fontSize: '9px', color: '#00e676', fontStyle: 'bold',
          stroke: '#000', strokeThickness: 2,
        })
        .setOrigin(0, 0).setScrollFactor(0).setDepth(32).setAlpha(0);

      this.survivorCards.push({ bg, portrait, portImg: null, overlay, nameText, hpDots, hackIcon, baseColor, cardY });
    }
  }

  update(role: Role | null, hp: number, downed: boolean) {
    this.currentRole   = role;
    this.currentDowned = downed;

    this._drawRoleBadge(role);
    this._drawSelfHp(role, hp, downed);

    this.hudAttack.setVisible(role === 'professor');
    this.refreshHint();
  }

  private _drawRoleBadge(role: Role | null) {
    this.roleBadge.clear();
    if (!role) { this.hudRole.setText(''); return; }

    const isProfessor = role === 'professor';
    const bgColor     = isProfessor ? 0x6a0000 : 0x0d2b45;
    const textColor   = isProfessor ? '#ff8a80' : '#80d8ff';
    const label       = isProfessor ? 'PROFESSOR' : 'SOBREVIVENTE';

    this.roleBadge.fillStyle(bgColor, 0.88);
    this.roleBadge.fillRoundedRect(4, 4, 128, 22, 5);
    this.roleBadge.lineStyle(1, isProfessor ? 0xaa2222 : 0x1565c0, 0.8);
    this.roleBadge.strokeRoundedRect(4, 4, 128, 22, 5);

    this.hudRole.setText(label).setColor(textColor);
  }

  private _drawSelfHp(role: Role | null, hp: number, downed: boolean) {
    this.selfHpBar.clear();
    if (role !== 'survivor') return;

    const x    = 8;
    const y    = 32;
    const segW = 22;
    const segH = 11;
    const gap  = 3;

    for (let i = 0; i < 2; i++) {
      let fill: number;
      if (downed) {
        fill = 0xcc3300;
      } else if (hp > i) {
        fill = hp >= 2 ? 0x4caf50 : 0xffcc00;
      } else {
        fill = 0x222222;
      }
      this.selfHpBar.fillStyle(fill, 0.92);
      this.selfHpBar.fillRoundedRect(x + i * (segW + gap), y, segW, segH, 3);
      this.selfHpBar.lineStyle(1, 0x555555, 0.7);
      this.selfHpBar.strokeRoundedRect(x + i * (segW + gap), y, segW, segH, 3);
    }
  }

  setTerminalCount(done: number, total: number) {
    if (total === 0) return;
    this.hudTerminals.setText(`⚡ ${done} / ${total} terminais`);
  }

  setGateOpen(open: boolean) {
    this.hudGate.setText(open ? '▶ PORTAO ABERTO — va para a saida!' : '');
  }

  setSurvivorStatuses(statuses: SurvivorStatus[], showActivity = false) {
    this.survivorCards.forEach((card, i) => {
      const s       = statuses[i];
      const visible = !!s;
      const alpha   = visible ? 1 : 0;

      card.bg.setAlpha(alpha);
      card.portrait.setAlpha(alpha);
      card.overlay.setAlpha(alpha);
      card.nameText.setAlpha(alpha);
      card.hpDots.setAlpha(alpha);

      if (!s) {
        card.portImg?.setAlpha(0);
        card.hackIcon.setAlpha(0);
        return;
      }

      const stateKey = s.escaped ? 'escaped'
        : s.expelled              ? 'expelled'
        : s.downed                ? 'downed'
        : s.hp <= 1               ? 'injured'
        : 'healthy';

      this._drawCard(card, stateKey);
      this._updatePortraitImage(card, s.skinId);
      this._drawHpDots(card, s.hp, s.downed);
      card.nameText.setText(s.label);
      card.hackIcon.setAlpha(showActivity && s.hacking && !s.downed && !s.expelled && !s.escaped ? 1 : 0);
    });
  }

  private _updatePortraitImage(card: SurvivorCard, skinId: string) {
    const iconKey = `${skinId}-icon`;
    if (!this.scene.textures.exists(iconKey)) {
      card.portImg?.setAlpha(0);
      return;
    }

    const cx    = CARD_X + CARD_W / 2 + 2;
    const cy    = card.cardY + PORT_H / 2;
    const size  = PORT_H - 4;

    if (!card.portImg) {
      card.portImg = this.scene.add
        .image(cx, cy, iconKey)
        .setDisplaySize(size, size)
        .setScrollFactor(0)
        .setDepth(31);
      this.survivorCards[this.survivorCards.indexOf(card)].portImg = card.portImg;
    } else {
      card.portImg.setTexture(iconKey).setDisplaySize(size, size).setPosition(cx, cy);
    }

    card.portImg.setAlpha(1);
    card.portrait.setAlpha(0);
  }

  private _drawCard(card: SurvivorCard, state: string) {
    const { bg, portrait, overlay, baseColor, cardY } = card;
    const x  = CARD_X;
    const y  = cardY;
    const cx = x + CARD_W / 2 + 2;

    bg.clear();
    bg.fillStyle(0x0e0e0e, 0.84);
    bg.fillRoundedRect(x, y, CARD_W, CARD_H, 5);
    bg.fillStyle(STATE_BORDER[state] ?? 0x666666, 1);
    bg.fillRect(x, y + 4, 4, CARD_H - 8);

    portrait.clear();
    portrait.fillStyle(baseColor, 0.20);
    portrait.fillRect(x + 4, y, CARD_W - 4, PORT_H);

    portrait.fillStyle(baseColor, 0.50);
    portrait.fillCircle(cx, y + PORT_H * 0.36, 9);
    portrait.fillRoundedRect(cx - 9, y + PORT_H * 0.36 + 11, 18, 16, 3);

    overlay.clear();
    if (state === 'downed') {
      overlay.fillStyle(0xff9800, 0.50);
      overlay.fillRect(x + 4, y, CARD_W - 4, PORT_H);
      overlay.lineStyle(2.5, 0xffffff, 0.85);
      overlay.lineBetween(cx - 8, y + 8, cx + 8, y + PORT_H - 8);
      overlay.lineBetween(cx + 8, y + 8, cx - 8, y + PORT_H - 8);
    } else if (state === 'expelled') {
      overlay.fillStyle(0x000000, 0.70);
      overlay.fillRect(x + 4, y, CARD_W - 4, PORT_H);
    } else if (state === 'escaped') {
      overlay.fillStyle(0x4fc3f7, 0.28);
      overlay.fillRect(x + 4, y, CARD_W - 4, PORT_H);
    }
  }

  private _drawHpDots(card: SurvivorCard, hp: number, downed: boolean) {
    const { hpDots, cardY } = card;
    hpDots.clear();

    const dotR = 5;
    const gap  = 4;
    const x    = CARD_X + CARD_W - 8 - (2 * dotR * 2 + gap);
    const y    = cardY + PORT_H + 9;

    for (let i = 0; i < 2; i++) {
      const filled = !downed && hp > i;
      hpDots.fillStyle(filled ? 0xe53935 : 0x2a2a2a, 0.95);
      hpDots.fillCircle(x + i * (dotR * 2 + gap), y, dotR);
      hpDots.lineStyle(1, filled ? 0xff6659 : 0x444444, 0.9);
      hpDots.strokeCircle(x + i * (dotR * 2 + gap), y, dotR);
    }
  }

  setHackProgress(progress: number | null) {
    if (progress === this.lastHackProg) return;
    this.lastHackProg = progress;

    if (progress === null) {
      this.hackBarGraphic.setAlpha(0);
      this.hackBarLabel.setAlpha(0);
      this.hackBarPct.setAlpha(0);
      return;
    }

    this.hackBarGraphic.setAlpha(1);
    this.hackBarLabel.setAlpha(1);
    this.hackBarPct.setAlpha(1);

    const BAR_X = 270;
    const BAR_Y = 480;
    const BAR_W = 260;
    const BAR_H = 14;
    const R     = BAR_H / 2;
    const fill  = Math.min(1, progress / 100) * BAR_W;

    this.hackBarGraphic.clear();

    this.hackBarGraphic.fillStyle(0x070f1c, 0.90);
    this.hackBarGraphic.fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, R);
    this.hackBarGraphic.lineStyle(1, 0x2a4a6e, 0.85);
    this.hackBarGraphic.strokeRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, R);

    if (fill > 0) {
      this.hackBarGraphic.fillStyle(0x8ec8f0, 0.95);
      this.hackBarGraphic.fillRoundedRect(BAR_X, BAR_Y, Math.max(fill, R * 2), BAR_H, R);

      this.hackBarGraphic.fillStyle(0xffffff, 0.18);
      this.hackBarGraphic.fillRoundedRect(BAR_X + 2, BAR_Y + 2, Math.max(fill - 4, 0), Math.floor(BAR_H / 2) - 2, R - 1);
    }

    this.hackBarPct.setText(`${Math.round(progress)}%`);
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

  setTerrorLevel(level: 0 | 1 | 2 | 3) {
    if (level === this.currentTerrorLevel) return;
    this.currentTerrorLevel = level;

    this.terrorTween?.stop();
    this.terrorTween = null;
    this.terrorHeart.setScale(1);

    if (level === 0) {
      this.terrorHeart.setAlpha(0);
      return;
    }

    const periods:    [number, number, number, number] = [0, 1100, 650, 320];
    const peakScales: [number, number, number, number] = [1, 1.18, 1.38, 1.65];
    const alphas:     [number, number, number, number] = [0, 0.70, 0.85, 1.00];

    this.terrorHeart.setAlpha(alphas[level]);
    this.terrorTween = this.scene.tweens.add({
      targets:     this.terrorHeart,
      scale:       peakScales[level],
      duration:    periods[level] * 0.25,
      yoyo:        true,
      repeat:      -1,
      ease:        'Quad.easeOut',
      repeatDelay: periods[level] * 0.5,
    });
  }

  flash(text: string, color = 0xffffff, duration = 2000) {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const t   = this.scene.add
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
