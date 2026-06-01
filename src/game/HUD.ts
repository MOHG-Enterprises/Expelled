import Phaser from 'phaser';
import type { Role } from '../types';
import { ENDGAME_DURATION_MS } from '../constants';
import { ProgressBar } from './hud/ProgressBar';
import { SurvivorCard } from './hud/SurvivorCard';

export interface SurvivorStatus {
  label:       string;
  skinId:      string;
  hp:          number;
  downed:      boolean;
  expelled:    boolean;
  escaped:     boolean;
  hacking:     boolean;
  downCount:   0 | 1 | 2;
  healPct:     number;
  beingHealed: boolean;
  bleedMs:     number;
}

const ACCENT_COLORS = [0x4285f4, 0x34a853, 0xfbbc04, 0x9c27b0] as const;

export class HUD {
  private scene: Phaser.Scene;

  private downWarn1!: Phaser.GameObjects.Text;
  private downWarn2!: Phaser.GameObjects.Text;
  private bleedOutBg!:    Phaser.GameObjects.Graphics;
  private bleedOutBar!:   Phaser.GameObjects.Graphics;
  private recoveryBg!:    Phaser.GameObjects.Graphics;
  private recoveryBar!:   Phaser.GameObjects.Graphics;
  private currentDownCount: 0 | 1 | 2 = 0;
  private healAlertArrows: Map<string, { x: number; y: number; expiresAt: number }> = new Map();
  private hudTerminals!: Phaser.GameObjects.Text;
  private hudTerminalIcon!: Phaser.GameObjects.Image;
  private hudGate!:      Phaser.GameObjects.Text;
  private endgameTimerBg!:   Phaser.GameObjects.Graphics;
  private endgameTimerBar!:  Phaser.GameObjects.Graphics;
  private endgameTimerText!: Phaser.GameObjects.Text;
  private isTouchDevice = false;
  private hintPanel!:  Phaser.GameObjects.Graphics;
  private hintLines:   Phaser.GameObjects.Text[] = [];
  private readonly HINT_MAX_LINES = 2;
  private hudGamepad!: Phaser.GameObjects.Text;
  private hudMic!:     Phaser.GameObjects.Text;
  private terrorHeart!:  Phaser.GameObjects.Text;
  private terrorLabel!:  Phaser.GameObjects.Text;
  private terrorTween:   Phaser.Tweens.Tween | null = null;
  private currentTerrorLevel = -1;
  private chaseIndicatorBg!:   Phaser.GameObjects.Graphics;
  private chaseIndicatorText!: Phaser.GameObjects.Text;

  private damageVignette!: Phaser.GameObjects.Graphics;
  private vignetteTween:   Phaser.Tweens.Tween | null = null;
  private vignetteAlpha    = 0;

  private arrowGraphics!:     Phaser.GameObjects.Graphics;
  private loudNoiseArrows:    Map<string, number> = new Map();
  private lastLoudNoiseTimes: Map<string, number> = new Map();
  private terminalErrorArrows:     Map<string, number> = new Map();
  private terminalCompletedArrows: Map<string, number> = new Map();
  private terminalPinImages:       Map<string, Phaser.GameObjects.Image> = new Map();

  private hackBar!:  ProgressBar;
  private healBar!:  ProgressBar;
  private ghostLabel!: Phaser.GameObjects.Text;
  private survivorCards: SurvivorCard[] = [];

  private currentRole:  Role | null = null;
  private currentDowned = false;
  private usingGamepad  = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  build(isTouchDevice = false) {
    this.isTouchDevice = isTouchDevice;
    this.downWarn1 = this.scene.add
      .text(8, 32, '⚠', { fontSize: '13px', color: '#444' })
      .setScrollFactor(0).setDepth(30).setAlpha(0);
    this.downWarn2 = this.scene.add
      .text(22, 32, '⚠', { fontSize: '13px', color: '#444' })
      .setScrollFactor(0).setDepth(30).setAlpha(0);

    this.bleedOutBg  = this.scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.bleedOutBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.recoveryBg  = this.scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.recoveryBar = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);

    this.hudTerminals = this.scene.add
      .text(0, 14, '', { fontSize: '16px', color: '#ffcc00', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0, 0)
      .setScrollFactor(0).setDepth(30);

    this.hudTerminalIcon = this.scene.add
      .image(0, 22, 'computer-terminal-sheet', 0)
      .setDisplaySize(16, 16)
      .setScrollFactor(0).setDepth(30).setAlpha(0);

    this.hudGate = this.scene.add
      .text(8, 74, '', { fontSize: '12px', color: '#00e676', stroke: '#000', strokeThickness: 3 })
      .setScrollFactor(0).setDepth(30);

    this.endgameTimerBg   = this.scene.add.graphics().setScrollFactor(0).setDepth(35).setAlpha(0);
    this.endgameTimerBar  = this.scene.add.graphics().setScrollFactor(0).setDepth(36).setAlpha(0);
    this.endgameTimerText = this.scene.add
      .text(400, 4, '', { fontSize: '15px', color: '#ff4444', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(37).setAlpha(0);

    this.hintLines = [];
    if (!this.isTouchDevice) {
      this.hintPanel = this.scene.add.graphics().setScrollFactor(0).setDepth(30);
      for (let i = 0; i < this.HINT_MAX_LINES; i++) {
        this.hintLines.push(
          this.scene.add
            .text(0, 0, '', { fontSize: '12px', color: '#bbb' })
            .setScrollFactor(0).setDepth(31).setAlpha(0),
        );
      }
    }

    this.hudMic = this.scene.add
      .text(792, 8, '', { fontSize: '14px', color: '#4caf50' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30);

    this.hudGamepad = this.scene.add
      .text(792, 26, 'Controle inativo — pressione um botao para ativar', { fontSize: '10px', color: '#555' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(30)
      .setVisible(!this.usingGamepad);

    this.terrorHeart = this.scene.add
      .text(400, 548, '♥', { fontSize: '30px', color: '#ff2244', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(30).setAlpha(0);

    this.terrorLabel = this.scene.add
      .text(400, 572, 'TERROR', { fontSize: '10px', color: '#ff2244', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(30).setAlpha(0);

    this.hackBar = new ProgressBar(this.scene, {
      x: 270, y: 480, w: 260, h: 14, depth: 30,
      bgColor: 0x070f1c, borderColor: 0x2a4a6e, fillColor: 0x8ec8f0,
      label: 'HACKEANDO', labelColor: '#8ec8f0', labelY: 465, pctY: 480,
    });

    this.healBar = new ProgressBar(this.scene, {
      x: 270, y: 464, w: 260, h: 14, depth: 30,
      bgColor: 0x071c0f, borderColor: 0x2a6e3a, fillColor: 0x81c995,
      label: 'CURANDO', labelColor: '#81c995', labelY: 449, pctY: 480,
    });

    this.chaseIndicatorBg   = this.scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.chaseIndicatorText = this.scene.add
      .text(770, 28, '', { fontSize: '12px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(31).setAlpha(0);

    this.arrowGraphics = this.scene.add.graphics().setScrollFactor(0).setDepth(32);

    this.damageVignette = this.scene.add.graphics().setScrollFactor(0).setDepth(45).setAlpha(0);
    this.damageVignette.fillStyle(0xff0000, 1);
    this.damageVignette.fillTriangle(0, 0, 200, 0, 0, 200);
    this.damageVignette.fillTriangle(800, 0, 600, 0, 800, 200);
    this.damageVignette.fillTriangle(0, 600, 200, 600, 0, 400);
    this.damageVignette.fillTriangle(800, 600, 600, 600, 800, 400);

    this._buildSurvivorCards(isTouchDevice);

    this.ghostLabel = this.scene.add
      .text(400, 284, '💀 FANTASMA 💀', {
        fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(31).setAlpha(0);

    const downWarnY = isTouchDevice
      ? 8 + 4 * (48 + 4) + 8
      : 32;
    this.downWarn1.setY(downWarnY);
    this.downWarn2.setY(downWarnY);
  }

  private _buildSurvivorCards(compact: boolean) {
    this.survivorCards = [];
    const startY  = compact ? 8  : 92;
    const cardH   = compact ? 48 : 76;
    const cardGap = compact ? 4  : 6;
    for (let i = 0; i < 4; i++) {
      const cardY     = startY + i * (cardH + cardGap);
      const baseColor = ACCENT_COLORS[i];
      this.survivorCards.push(new SurvivorCard(this.scene, cardY, baseColor, compact));
    }
  }

  update(role: Role | null, _hp: number, downed: boolean, downCount: 0|1|2 = 0) {
    this.currentRole      = role;
    this.currentDowned    = downed;
    this.currentDownCount = downCount;

    this._updateDownWarnings(role, downCount);

    this.refreshHint();
  }

  private _updateDownWarnings(role: Role | null, downCount: 0|1|2): void {
    if (role !== 'survivor') {
      this.downWarn1.setAlpha(0);
      this.downWarn2.setAlpha(0);
      return;
    }
    this.downWarn1.setColor(downCount >= 1 ? '#e53935' : '#333').setAlpha(1);
    this.downWarn2.setColor(downCount >= 2 ? '#e53935' : '#333').setAlpha(1);
  }

  setTerminalCount(done: number, total: number) {
    if (total === 0) return;
    this.hudTerminals.setText(`${done} / ${total} terminais`);
    const iconSize = 16;
    const gap = 4;
    const totalWidth = iconSize + gap + this.hudTerminals.width;
    const startX = 400 - totalWidth / 2;
    this.hudTerminalIcon.setPosition(startX + iconSize / 2, 22).setAlpha(1);
    this.hudTerminals.setPosition(startX + iconSize + gap, 14);
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
    const BAR_H = 12;
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

  setSurvivorStatuses(statuses: SurvivorStatus[], showActivity = false, showHealPct = false) {
    this.survivorCards.forEach((card, i) => {
      const s = statuses[i];
      if (!s) { card.hide(); return; }
      card.show(
        s.label, s.skinId, s.hp, s.downed, s.expelled, s.escaped,
        s.hacking, showActivity,
        s.healPct, s.bleedMs, showHealPct,
      );
    });
  }

  setHackProgress(progress: number | null) {
    this.hackBar.setProgress(progress);
  }

  setHealProgress(progress: number | null) {
    this.healBar.setProgress(progress);
  }

  setGhostMode(enabled = true) {
    this.ghostLabel.setAlpha(enabled ? 0.6 : 0);
    if (enabled) {
      this.downWarn1.setAlpha(0);
      this.downWarn2.setAlpha(0);
      this.setBleedOutProgress(null);
      this.setRecoveryProgress(null);
      this.setHackProgress(null);
      this.setHealProgress(null);
      this.damageVignette.setAlpha(0);
    }
  }

  setDownCount(downCount: 0|1|2) {
    this.currentDownCount = downCount;
    this._updateDownWarnings(this.currentRole, downCount);
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
      this.terrorLabel.setAlpha(0);
      return;
    }

    const periods:    [number, number, number, number] = [0, 1100, 650, 320];
    const peakScales: [number, number, number, number] = [1, 1.18, 1.38, 1.65];
    const alphas:     [number, number, number, number] = [0, 0.70, 0.85, 1.00];

    this.terrorHeart.setAlpha(alphas[level]);
    this.terrorLabel.setAlpha(alphas[level]);
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

  setDamageVignette(hp: number, downed: boolean): void {
    this.vignetteTween?.stop();
    this.vignetteTween = null;
    if (downed)    this.vignetteAlpha = 0.55;
    else if (hp <= 1) this.vignetteAlpha = 0.38;
    else           this.vignetteAlpha = 0;
    this.damageVignette.setAlpha(this.vignetteAlpha);
  }

  flashDamageVignette(): void {
    this.vignetteTween?.stop();
    const peak = Math.min(1, this.vignetteAlpha + 0.45);
    this.damageVignette.setAlpha(peak);
    this.vignetteTween = this.scene.tweens.add({
      targets:  this.damageVignette,
      alpha:    this.vignetteAlpha,
      duration: 430,
      ease:     'Quad.easeOut',
      onComplete: () => { this.vignetteTween = null; },
    });
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
    this.chaseIndicatorBg.fillRoundedRect(648, 24, 124, 24, 4);
    this.chaseIndicatorBg.lineStyle(1, 0xffffff, 0.2);
    this.chaseIndicatorBg.strokeRoundedRect(648, 24, 124, 24, 4);
    this.chaseIndicatorBg.setAlpha(1);

    this.chaseIndicatorText.setPosition(770, 28).setText(tierLabel).setColor(text).setAlpha(1);
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
    const now = Date.now();

    this.terminalPinImages.forEach(img => img.setAlpha(0));

    this.terminalErrorArrows.forEach((exp, id) => {
      if (exp <= now) this.terminalErrorArrows.delete(id);
    });
    this.terminalCompletedArrows.forEach((exp, id) => {
      if (exp <= now) this.terminalCompletedArrows.delete(id);
    });

    const cx     = screenW / 2;
    const cy     = screenH / 2;
    const margin = 18;

    (Object.keys(positions) as string[]).forEach((id) => {
      const isRecentlyCompleted = (this.terminalCompletedArrows.get(id) ?? 0) > now;
      if (completed.has(id) && !isRecentlyCompleted) return;
      const pos = positions[id];
      if (!pos) return;

      const sx = pos.x - camX;
      const sy = pos.y - camY;

      const isLoud  = (this.loudNoiseArrows.get(id) ?? 0) > now;
      if (sx >= 0 && sx <= screenW && sy >= 0 && sy <= screenH && isLoud) {
        const flashOn = Math.floor(now / 250) % 2 === 0;
        this.arrowGraphics.lineStyle(3, 0xff2200, flashOn ? 1.0 : 0.1);
        this.arrowGraphics.strokeCircle(sx, sy, 26);
      }

      const dx = sx - cx;
      const dy = sy - cy;
      if (dx === 0 && dy === 0) return;
      const angle = Math.atan2(dy, dx);

      const maxX = screenW - margin;
      const maxY = screenH - margin;
      const tX   = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
      const tY   = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
      const t    = Math.min(Math.abs(tX), Math.abs(tY));
      const ex   = cx + dx * t;
      const ey   = cy + dy * t;

      this._drawTerminalPin(ex, ey, angle, id);
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

  updateDownedArrows(
    positions: Record<string, { x: number; y: number }>,
    camX: number,
    camY: number,
    screenW: number,
    screenH: number,
  ): void {
    this.arrowGraphics.clear();
    const cx     = screenW / 2;
    const cy     = screenH / 2;
    const margin = 18;

    (Object.keys(positions) as string[]).forEach((id) => {
      const pos = positions[id];
      if (!pos) return;
      const sx = pos.x - camX;
      const sy = pos.y - camY;
      if (sx >= 0 && sx <= screenW && sy >= 0 && sy <= screenH) return;
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
      this._drawArrowTriangle(ex, ey, angle, 0xff6600, 0.85);
    });
  }

  private _drawTerminalPin(ex: number, ey: number, angle: number, terminalId: string): void {
    const now         = Date.now();
    const isLoud      = (this.loudNoiseArrows.get(terminalId) ?? 0) > now;
    const isErr       = (this.terminalErrorArrows.get(terminalId) ?? 0) > now;
    const isDone      = (this.terminalCompletedArrows.get(terminalId) ?? 0) > now;
    const flashing    = isLoud || isErr || isDone;
    const flash       = flashing ? (Math.floor(now / 250) % 2 === 0) : true;
    const alpha       = flash ? 0.92 : 0.1;
    const color       = isDone ? 0x00e676 : (isLoud || isErr) ? 0xff2200 : 0xffcc00;

    const HEAD_R = 16;
    const TAIL_L = 12;
    const cos    = Math.cos(angle);
    const sin    = Math.sin(angle);

    this.arrowGraphics.fillStyle(color, alpha);
    this.arrowGraphics.fillCircle(ex, ey, HEAD_R);
    this.arrowGraphics.lineStyle(2, 0xffffff, alpha * 0.55);
    this.arrowGraphics.strokeCircle(ex, ey, HEAD_R);

    const tipX  = ex + cos * (HEAD_R + TAIL_L);
    const tipY  = ey + sin * (HEAD_R + TAIL_L);
    const perpX = -sin;
    const perpY =  cos;
    const wing  = 7;
    this.arrowGraphics.fillStyle(color, alpha);
    this.arrowGraphics.fillTriangle(
      tipX, tipY,
      ex + perpX * wing, ey + perpY * wing,
      ex - perpX * wing, ey - perpY * wing,
    );

    const frame    = isDone ? 9 : (isErr || isLoud) ? 8 : 0;
    const imgAlpha = flash ? 0.9 : 0.1;

    let img = this.terminalPinImages.get(terminalId);
    if (!img) {
      img = this.scene.add
        .image(ex, ey, 'computer-terminal-sheet', frame)
        .setDisplaySize(22, 22)
        .setScrollFactor(0)
        .setDepth(33);
      this.terminalPinImages.set(terminalId, img);
    }
    img.setPosition(ex, ey).setFrame(frame).setAlpha(imgAlpha);
  }

  private _drawHealAlertArrow(x: number, y: number, angle: number, alpha: number) {
    const size = 22;
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
    const size = 16;
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

  setTerminalError(terminalId: string, durationMs = 3000): void {
    this.terminalErrorArrows.set(terminalId, Date.now() + durationMs);
  }

  setTerminalCompleted(terminalId: string, durationMs = 3000): void {
    this.terminalCompletedArrows.set(terminalId, Date.now() + durationMs);
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
      .image(BX + 20, BY + BH / 2, 'computer-terminal-sheet', 0)
      .setDisplaySize(20, 20)
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(51);

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
    if (this.isTouchDevice) return;
    if (!this.hintPanel) return;

    this.hintPanel.clear();
    this.hintLines.forEach(t => t.setAlpha(0));

    const gp = this.usingGamepad;
    let lines: string[] = [];

    if (this.currentDowned) {
      lines = [gp ? '[X] Responder' : '[SPACE] Responder'];
    } else if (this.currentRole === 'survivor') {
      lines = [
        gp ? '[A] Hackear / Fugir' : '[E] Hackear / Fugir',
        gp ? '[RB] Correr'         : '[SHIFT] Correr',
      ];
    } else if (this.currentRole === 'professor') {
      lines = [
        gp ? '[X] Atacar'   : '[SPACE] Atacar',
        gp ? '[A] Reforçar' : '[E] Reforçar',
      ];
    }

    if (lines.length === 0) return;

    const PANEL_X = 8;
    const LINE_H  = 17;
    const PAD_V   = 7;
    const PANEL_W = 220;
    const PANEL_H = lines.length * LINE_H + PAD_V * 2 - 2;
    const PANEL_Y = 596 - PANEL_H;

    this.hintPanel.fillStyle(0x000000, 0.55);
    this.hintPanel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 5);

    lines.forEach((line, i) => {
      if (i >= this.hintLines.length) return;
      this.hintLines[i]
        .setText(line)
        .setPosition(PANEL_X + 8, PANEL_Y + PAD_V + i * LINE_H)
        .setAlpha(1);
    });
  }
}
