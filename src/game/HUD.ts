import Phaser from 'phaser';
import type { Role } from '../types';
import { ENDGAME_DURATION_MS } from '../constants';

export interface SurvivorStatus {
  label:     string;
  skinId:    string;
  hp:        number;
  downed:    boolean;
  expelled:  boolean;
  escaped:   boolean;
  hacking:   boolean;
  downCount: 0 | 1 | 2;
  healPct:   number;
  beingHealed: boolean;
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
  private downCountDots!: Phaser.GameObjects.Graphics;
  private bleedOutBg!:    Phaser.GameObjects.Graphics;
  private bleedOutBar!:   Phaser.GameObjects.Graphics;
  private recoveryBg!:    Phaser.GameObjects.Graphics;
  private recoveryBar!:   Phaser.GameObjects.Graphics;
  private healBarGraphic2!: Phaser.GameObjects.Graphics;
  private healBarLabel2!:   Phaser.GameObjects.Text;
  private healBarPct2!:     Phaser.GameObjects.Text;
  private lastHealProg:     number | null = null;
  private currentDownCount: 0 | 1 | 2 = 0;
  private healAlertArrows:  Map<string, { x: number; y: number; expiresAt: number }> = new Map();
  private hudTerminals!: Phaser.GameObjects.Text;
  private hudGate!:     Phaser.GameObjects.Text;
  private endgameTimerBg!:   Phaser.GameObjects.Graphics;
  private endgameTimerBar!:  Phaser.GameObjects.Graphics;
  private endgameTimerText!: Phaser.GameObjects.Text;
  private hudHint!:     Phaser.GameObjects.Text;
  private hudGamepad!:  Phaser.GameObjects.Text;
  private hudMic!:      Phaser.GameObjects.Text;
  private hudAttack!:   Phaser.GameObjects.Text;
  private survivorCards: SurvivorCard[] = [];
  private terrorHeart!: Phaser.GameObjects.Text;
  private terrorTween:  Phaser.Tweens.Tween | null = null;
  private currentTerrorLevel = -1;
  private chaseIndicatorBg!:   Phaser.GameObjects.Graphics;
  private chaseIndicatorText!: Phaser.GameObjects.Text;

  private arrowGraphics!:    Phaser.GameObjects.Graphics;
  private loudNoiseArrows:   Map<string, number> = new Map();
  private lastLoudNoiseTimes: Map<string, number> = new Map();

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

    this.downCountDots = this.scene.add.graphics().setScrollFactor(0).setDepth(30);

    this.bleedOutBg  = this.scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.bleedOutBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.recoveryBg  = this.scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.recoveryBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);

    this.hudTerminals = this.scene.add
      .text(8, 52, '', { fontSize: '11px', color: '#ccc' })
      .setScrollFactor(0).setDepth(30);

    this.hudGate = this.scene.add
      .text(8, 68, '', { fontSize: '12px', color: '#00e676', stroke: '#000', strokeThickness: 3 })
      .setScrollFactor(0).setDepth(30);

    this.endgameTimerBg = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(35)
      .setAlpha(0);

    this.endgameTimerBar = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(36)
      .setAlpha(0);

    this.endgameTimerText = this.scene.add
      .text(400, 4, '', {
        fontSize: '12px',
        color: '#ff4444',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(37)
      .setAlpha(0);

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

    this.healBarGraphic2 = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.healBarLabel2   = this.scene.add
      .text(400, 449, 'CURANDO', {
        fontSize: '11px', color: '#81c995', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(31).setAlpha(0);
    this.healBarPct2 = this.scene.add
      .text(400, 480, '', { fontSize: '10px', color: '#b9f6ca' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(32).setAlpha(0);

    this.chaseIndicatorBg = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(30)
      .setAlpha(0);

    this.chaseIndicatorText = this.scene.add
      .text(762, 28, '', { fontSize: '12px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(31)
      .setAlpha(0);

    this.arrowGraphics = this.scene.add.graphics().setScrollFactor(0).setDepth(32);

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

  update(role: Role | null, _hp: number, downed: boolean, downCount: 0|1|2 = 0) {
    this.currentRole      = role;
    this.currentDowned    = downed;
    this.currentDownCount = downCount;

    this._drawRoleBadge(role);
    this._drawDownCountDots(role, downCount);

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

  private _drawDownCountDots(role: Role | null, downCount: 0|1|2) {
    this.downCountDots.clear();
    if (role !== 'survivor') return;

    const x   = 8;
    const y   = 32;
    const r   = 5;
    const gap = 4;

    for (let i = 0; i < 2; i++) {
      const used  = i < downCount;
      const color = used ? 0xe53935 : 0x2a2a2a;
      const edge  = used ? 0xff6659 : 0x444444;
      this.downCountDots.fillStyle(color, 0.95);
      this.downCountDots.fillCircle(x + i * (r * 2 + gap) + r, y + r, r);
      this.downCountDots.lineStyle(1, edge, 0.9);
      this.downCountDots.strokeCircle(x + i * (r * 2 + gap) + r, y + r, r);
    }
  }

  setTerminalCount(done: number, total: number) {
    if (total === 0) return;
    this.hudTerminals.setText(`⚡ ${done} / ${total} terminais`);
  }

  setEndgameTimer(remainingMs: number | null) {
    if (remainingMs === null) {
      this.endgameTimerBg.setAlpha(0);
      this.endgameTimerBar.setAlpha(0);
      this.endgameTimerText.setAlpha(0);
      return;
    }

    this.endgameTimerBg.setAlpha(1);
    this.endgameTimerBar.setAlpha(1);
    this.endgameTimerText.setAlpha(1);

    const BAR_W = 400;
    const BAR_H = 8;
    const BAR_X = (800 - BAR_W) / 2;
    const BAR_Y = 0;
    const fill  = Math.min(1, remainingMs / ENDGAME_DURATION_MS) * BAR_W;

    this.endgameTimerBg.clear();
    this.endgameTimerBg.fillStyle(0x1a0000, 0.9);
    this.endgameTimerBg.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);

    this.endgameTimerBar.clear();
    if (fill > 0) {
      this.endgameTimerBar.fillStyle(0xff2222, 0.95);
      this.endgameTimerBar.fillRect(BAR_X, BAR_Y, fill, BAR_H);
    }

    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.endgameTimerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
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
      this._updatePortraitImage(card, s.skinId, s.hp, s.downed);
      this._drawHpDots(card, s.hp, s.downed);
      card.nameText.setText(s.label);
      card.hackIcon.setAlpha(showActivity && s.hacking && !s.downed && !s.expelled && !s.escaped ? 1 : 0);
    });
  }

  private _updatePortraitImage(card: SurvivorCard, skinId: string, hp: number, downed: boolean) {
    const hurt    = downed || hp <= 1;
    const hurtKey = `${skinId}-icon-hurt`;
    const normKey = `${skinId}-icon`;
    const wantKey = (hurt && this.scene.textures.exists(hurtKey)) ? hurtKey : normKey;

    if (!this.scene.textures.exists(wantKey)) {
      card.portImg?.setAlpha(0);
      return;
    }

    const cx   = CARD_X + CARD_W / 2 + 2;
    const cy   = card.cardY + PORT_H / 2;
    const size = PORT_H - 4;

    if (!card.portImg) {
      card.portImg = this.scene.add
        .image(cx, cy, wantKey)
        .setDisplaySize(size, size)
        .setScrollFactor(0)
        .setDepth(31);
      this.survivorCards[this.survivorCards.indexOf(card)].portImg = card.portImg;
    } else {
      card.portImg.setTexture(wantKey).setDisplaySize(size, size).setPosition(cx, cy);
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

  setDownCount(downCount: 0|1|2) {
    this.currentDownCount = downCount;
    this._drawDownCountDots(this.currentRole, downCount);
  }

  setBleedOutProgress(pct: number | null) {
    const BAR_X = 8, BAR_Y = 48, BAR_W = 100, BAR_H = 6;
    if (pct === null) { this.bleedOutBg.setAlpha(0); this.bleedOutBar.setAlpha(0); return; }
    this.bleedOutBg.setAlpha(1).clear().fillStyle(0x222222, 0.85).fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 3);
    this.bleedOutBar.setAlpha(1).clear();
    const fill = Math.min(1, pct / 100) * BAR_W;
    if (fill > 0) this.bleedOutBar.fillStyle(0xff6600, 0.95).fillRoundedRect(BAR_X, BAR_Y, fill, BAR_H, 3);
  }

  setRecoveryProgress(pct: number | null) {
    const BAR_X = 8, BAR_Y = 58, BAR_W = 100, BAR_H = 6;
    if (pct === null) { this.recoveryBg.setAlpha(0); this.recoveryBar.setAlpha(0); return; }
    this.recoveryBg.setAlpha(1).clear().fillStyle(0x222222, 0.85).fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 3);
    this.recoveryBar.setAlpha(1).clear();
    const fill = Math.min(1, pct / 95) * BAR_W;
    if (fill > 0) this.recoveryBar.fillStyle(0x4caf50, 0.95).fillRoundedRect(BAR_X, BAR_Y, fill, BAR_H, 3);
  }

  setHealProgress(progress: number | null) {
    if (progress === this.lastHealProg) return;
    this.lastHealProg = progress;
    if (progress === null) {
      this.healBarGraphic2.setAlpha(0); this.healBarLabel2.setAlpha(0); this.healBarPct2.setAlpha(0); return;
    }
    this.healBarGraphic2.setAlpha(1); this.healBarLabel2.setAlpha(1); this.healBarPct2.setAlpha(1);
    const BAR_X = 270, BAR_Y = 464, BAR_W = 260, BAR_H = 14, R = BAR_H / 2;
    const fill = Math.min(1, progress / 100) * BAR_W;
    this.healBarGraphic2.clear()
      .fillStyle(0x071c0f, 0.90).fillRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, R)
      .lineStyle(1, 0x2a6e3a, 0.85).strokeRoundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, R);
    if (fill > 0) {
      this.healBarGraphic2.fillStyle(0x81c995, 0.95).fillRoundedRect(BAR_X, BAR_Y, Math.max(fill, R * 2), BAR_H, R)
        .fillStyle(0xffffff, 0.18).fillRoundedRect(BAR_X + 2, BAR_Y + 2, Math.max(fill - 4, 0), Math.floor(BAR_H / 2) - 2, R - 1);
    }
    this.healBarPct2.setText(`${Math.round(progress)}%`);
  }

  showHealAlert(
    targetId: string,
    worldX: number,
    worldY: number,
    _camX: number,
    _camY: number,
    _screenW: number,
    _screenH: number,
  ) {
    this.healAlertArrows.set(targetId, { x: worldX, y: worldY, expiresAt: Date.now() + 3_000 });
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

  setChaseState(active: boolean, tier: 0 | 1 | 2 | 3): void {
    if (this.currentRole !== 'professor') return;

    this.chaseIndicatorBg.clear();

    if (!active) {
      this.chaseIndicatorBg.setAlpha(0);
      this.chaseIndicatorText.setAlpha(0);
      return;
    }

    const tierColors: Record<number, { bg: number; text: string }> = {
      0: { bg: 0x333333, text: '#cccccc' },
      1: { bg: 0x665500, text: '#ffdd00' },
      2: { bg: 0x663300, text: '#ff8800' },
      3: { bg: 0x660000, text: '#ff2200' },
    };
    const { bg, text } = tierColors[tier];
    const tierLabel = tier === 0 ? 'CHASE' : `CHASE  ${'I'.repeat(tier)}`;

    this.chaseIndicatorBg.fillStyle(bg, 0.85);
    this.chaseIndicatorBg.fillRoundedRect(668, 26, 100, 20, 4);
    this.chaseIndicatorBg.lineStyle(1, 0xffffff, 0.2);
    this.chaseIndicatorBg.strokeRoundedRect(668, 26, 100, 20, 4);
    this.chaseIndicatorBg.setAlpha(1);

    this.chaseIndicatorText.setText(tierLabel).setColor(text).setAlpha(1);
  }

  updateTerminalArrows(
    positions: Readonly<Partial<Record<string, { x: number; y: number }>>>,
    completed: ReadonlySet<string>,
    camX: number,
    camY: number,
    screenW: number,
    screenH: number,
  ) {
    this.arrowGraphics.clear();
    const now    = Date.now();
    const cx     = screenW / 2;
    const cy     = screenH / 2;
    const margin = 18;

    (Object.keys(positions) as string[]).forEach((id) => {
      if (completed.has(id)) return;
      const pos = positions[id];
      if (!pos) return;

      const sx = pos.x - camX;
      const sy = pos.y - camY;
      const onScreen = sx >= 0 && sx <= screenW && sy >= 0 && sy <= screenH;

      const isLoud  = (this.loudNoiseArrows.get(id) ?? 0) > now;
      const color   = isLoud ? 0xff2200 : 0xffcc00;
      const alpha   = isLoud ? (Math.floor(now / 250) % 2 === 0 ? 1.0 : 0.1) : 0.85;

      if (onScreen && isLoud) {
        this.arrowGraphics.lineStyle(3, color, alpha);
        this.arrowGraphics.strokeCircle(sx, sy, 26);
      }

      const dx = sx - cx;
      const dy = sy - cy;
      if (dx === 0 && dy === 0) return;
      const angle = Math.atan2(dy, dx);

      const maxX  = screenW - margin;
      const maxY  = screenH - margin;
      const tX    = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
      const tY    = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
      const t     = Math.min(Math.abs(tX), Math.abs(tY));
      const ex    = cx + dx * t;
      const ey    = cy + dy * t;

      this._drawArrowTriangle(ex, ey, angle, color, alpha);
    });

    this.loudNoiseArrows.forEach((expiresAt, id) => {
      if (expiresAt <= now) this.loudNoiseArrows.delete(id);
    });

    this.healAlertArrows.forEach((entry, id) => {
      if (entry.expiresAt <= now) { this.healAlertArrows.delete(id); return; }
      const sx = entry.x - camX;
      const sy = entry.y - camY;
      const dx = sx - cx;
      const dy = sy - cy;
      if (dx === 0 && dy === 0) return;
      const angle = Math.atan2(dy, dx);
      const maxX  = screenW - margin;
      const maxY  = screenH - margin;
      const tX    = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
      const tY    = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
      const t     = Math.min(Math.abs(tX), Math.abs(tY));
      const ex    = cx + dx * t;
      const ey    = cy + dy * t;
      const flash = Math.floor(now / 200) % 2 === 0;
      this._drawHealAlertArrow(ex, ey, angle, flash ? 1.0 : 0.3);
    });
  }

  private _drawHealAlertArrow(x: number, y: number, angle: number, alpha: number) {
    const size = 18;
    const cos  = Math.cos(angle);
    const sin  = Math.sin(angle);
    const tipX = x + cos * size;
    const tipY = y + sin * size;
    const lX   = x + cos * -size * 0.5 - sin * size * 0.6;
    const lY   = y + sin * -size * 0.5 + cos * size * 0.6;
    const rX   = x + cos * -size * 0.5 + sin * size * 0.6;
    const rY   = y + sin * -size * 0.5 - cos * size * 0.6;
    this.arrowGraphics.fillStyle(0xff2222, alpha);
    this.arrowGraphics.fillTriangle(tipX, tipY, lX, lY, rX, rY);
    this.arrowGraphics.lineStyle(2, 0xffffff, alpha * 0.6);
    this.arrowGraphics.strokeTriangle(tipX, tipY, lX, lY, rX, rY);
  }

  private _drawArrowTriangle(x: number, y: number, angle: number, color: number, alpha: number) {
    const size = 12;
    const cos  = Math.cos(angle);
    const sin  = Math.sin(angle);

    const tipX = x + cos * size;
    const tipY = y + sin * size;
    const lX   = x + cos * -size * 0.5 - sin * size * 0.6;
    const lY   = y + sin * -size * 0.5 + cos * size * 0.6;
    const rX   = x + cos * -size * 0.5 + sin * size * 0.6;
    const rY   = y + sin * -size * 0.5 - cos * size * 0.6;

    this.arrowGraphics.fillStyle(color, alpha);
    this.arrowGraphics.fillTriangle(tipX, tipY, lX, lY, rX, rY);
  }

  showLoudNoiseAlert(
    terminalId: string,
    camX: number,
    camY: number,
    screenW: number,
    screenH: number,
  ) {
    const now      = Date.now();
    const lastTime = this.lastLoudNoiseTimes.get(terminalId) ?? 0;
    if (now - lastTime < 1000) return;
    this.lastLoudNoiseTimes.set(terminalId, now);

    const DURATION = 4000;
    this.loudNoiseArrows.set(terminalId, now + DURATION);

    const BW = 180;
    const BH = 36;
    const BX = screenW - BW - 8;
    const BY = 50;

    const bg = this.scene.add.graphics().setScrollFactor(0).setDepth(50);
    bg.fillStyle(0x0a0a0a, 0.92);
    bg.fillRoundedRect(BX, BY, BW, BH, 6);
    bg.lineStyle(2, 0xff6600, 1);
    bg.strokeRoundedRect(BX, BY, BW, BH, 6);

    const icon = this.scene.add
      .text(BX + 10, BY + BH / 2, '⚡', { fontSize: '16px', color: '#ff8800' })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);

    const label = this.scene.add
      .text(BX + 32, BY + BH / 2, `SKILL CHECK — ${terminalId}`, {
        fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      })
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(51);

    this.scene.time.delayedCall(DURATION, () => {
      bg.destroy();
      icon.destroy();
      label.destroy();
    });
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
