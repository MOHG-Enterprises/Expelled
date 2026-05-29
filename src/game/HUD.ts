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

const CARD_GAP = 6;
const CARD_H   = 76;

const ACCENT_COLORS = [0x4285f4, 0x34a853, 0xfbbc04, 0x9c27b0] as const;

export class HUD {
  private scene: Phaser.Scene;

  private roleBadge!:   Phaser.GameObjects.Graphics;
  private hudRole!:     Phaser.GameObjects.Text;
  private downCountDots!: Phaser.GameObjects.Graphics;
  private bleedOutBg!:    Phaser.GameObjects.Graphics;
  private bleedOutBar!:   Phaser.GameObjects.Graphics;
  private recoveryBg!:    Phaser.GameObjects.Graphics;
  private recoveryBar!:   Phaser.GameObjects.Graphics;
  private currentDownCount: 0 | 1 | 2 = 0;
  private healAlertArrows: Map<string, { x: number; y: number; expiresAt: number }> = new Map();
  private hudTerminals!: Phaser.GameObjects.Text;
  private hudGate!:      Phaser.GameObjects.Text;
  private endgameTimerBg!:   Phaser.GameObjects.Graphics;
  private endgameTimerBar!:  Phaser.GameObjects.Graphics;
  private endgameTimerText!: Phaser.GameObjects.Text;
  private hudHint!:    Phaser.GameObjects.Text;
  private hudGamepad!: Phaser.GameObjects.Text;
  private hudMic!:     Phaser.GameObjects.Text;
  private hudAttack!:  Phaser.GameObjects.Text;
  private terrorHeart!: Phaser.GameObjects.Text;
  private terrorTween:  Phaser.Tweens.Tween | null = null;
  private currentTerrorLevel = -1;
  private chaseIndicatorBg!:   Phaser.GameObjects.Graphics;
  private chaseIndicatorText!: Phaser.GameObjects.Text;

  private damageVignette!: Phaser.GameObjects.Graphics;
  private vignetteTween:   Phaser.Tweens.Tween | null = null;
  private vignetteAlpha    = 0;

  private arrowGraphics!:     Phaser.GameObjects.Graphics;
  private loudNoiseArrows:    Map<string, number> = new Map();
  private lastLoudNoiseTimes: Map<string, number> = new Map();

  private hackBar!:  ProgressBar;
  private healBar!:  ProgressBar;
  private survivorCards: SurvivorCard[] = [];

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
      .text(8, 60, '', { fontSize: '11px', color: '#ccc' })
      .setScrollFactor(0).setDepth(30);

    this.hudGate = this.scene.add
      .text(8, 74, '', { fontSize: '12px', color: '#00e676', stroke: '#000', strokeThickness: 3 })
      .setScrollFactor(0).setDepth(30);

    this.endgameTimerBg   = this.scene.add.graphics().setScrollFactor(0).setDepth(35).setAlpha(0);
    this.endgameTimerBar  = this.scene.add.graphics().setScrollFactor(0).setDepth(36).setAlpha(0);
    this.endgameTimerText = this.scene.add
      .text(400, 4, '', { fontSize: '12px', color: '#ff4444', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(37).setAlpha(0);

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
      .text(762, 28, '', { fontSize: '12px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(31).setAlpha(0);

    this.arrowGraphics = this.scene.add.graphics().setScrollFactor(0).setDepth(32);

    this.damageVignette = this.scene.add.graphics().setScrollFactor(0).setDepth(45).setAlpha(0);
    this.damageVignette.fillStyle(0xff0000, 1);
    this.damageVignette.fillTriangle(0, 0, 200, 0, 0, 200);
    this.damageVignette.fillTriangle(800, 0, 600, 0, 800, 200);
    this.damageVignette.fillTriangle(0, 600, 200, 600, 0, 400);
    this.damageVignette.fillTriangle(800, 600, 600, 600, 800, 400);

    this._buildSurvivorCards();
  }

  private _buildSurvivorCards() {
    const startY = 92;
    for (let i = 0; i < 4; i++) {
      const cardY     = startY + i * (CARD_H + CARD_GAP);
      const baseColor = ACCENT_COLORS[i];
      this.survivorCards.push(new SurvivorCard(this.scene, cardY, baseColor));
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

      const maxX = screenW - margin;
      const maxY = screenH - margin;
      const tX   = dx !== 0 ? (dx > 0 ? maxX - cx : margin - cx) / dx : Infinity;
      const tY   = dy !== 0 ? (dy > 0 ? maxY - cy : margin - cy) / dy : Infinity;
      const t    = Math.min(Math.abs(tX), Math.abs(tY));
      const ex   = cx + dx * t;
      const ey   = cy + dy * t;

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
