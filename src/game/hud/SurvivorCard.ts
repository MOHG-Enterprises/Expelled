import Phaser from 'phaser';

const CARD_X   = 8;
const CARD_W   = 78;
const CARD_H   = 76;
const PORT_H   = 44;

const STATE_BORDER: Record<string, number> = {
  healthy:  0x4caf50,
  injured:  0xffcc00,
  downed:   0xff9800,
  expelled: 0x444444,
  escaped:  0x4fc3f7,
};

export class SurvivorCard {
  private scene:    Phaser.Scene;
  private baseColor: number;
  readonly cardY:   number;

  private bg:       Phaser.GameObjects.Graphics;
  private portrait: Phaser.GameObjects.Graphics;
  private overlay:  Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private hpDots:   Phaser.GameObjects.Graphics;
  private hackIcon: Phaser.GameObjects.Text;
  private portImg:  Phaser.GameObjects.Image | null = null;
  private statusBars: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, cardY: number, baseColor: number) {
    this.scene     = scene;
    this.cardY     = cardY;
    this.baseColor = baseColor;

    this.bg      = scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.portrait = scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.overlay  = scene.add.graphics().setScrollFactor(0).setDepth(32).setAlpha(0);

    this.nameText = scene.add
      .text(CARD_X + 8, cardY + PORT_H + 2, '', { fontSize: '10px', color: '#ddd', fontStyle: 'bold' })
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    this.hpDots = scene.add.graphics().setScrollFactor(0).setDepth(31).setAlpha(0);

    this.hackIcon = scene.add
      .text(CARD_X + 8, cardY + PORT_H + 15, '⚙ HACK', {
        fontSize: '9px', color: '#00e676', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      })
      .setOrigin(0, 0).setScrollFactor(0).setDepth(32).setAlpha(0);

    this.statusBars = scene.add.graphics().setScrollFactor(0).setDepth(33).setAlpha(0);
  }

  show(
    label:        string,
    skinId:       string,
    hp:           number,
    downed:       boolean,
    expelled:     boolean,
    escaped:      boolean,
    hacking:      boolean,
    showActivity: boolean,
    healPct:      number,
    bleedMs:      number,
    showHealPct:  boolean,
  ) {
    const stateKey = escaped ? 'escaped'
      : expelled            ? 'expelled'
      : downed              ? 'downed'
      : hp <= 1             ? 'injured'
      : 'healthy';

    this._drawBackground(stateKey);
    this._updatePortrait(skinId, hp, downed);
    this._drawHpDots(hp, downed);
    this._drawStatusBars(downed, healPct, bleedMs, showHealPct);

    const displayName = label.length > 6 ? label.slice(0, 5) + '…' : label;
    this.nameText.setText(displayName).setAlpha(1);
    this.bg.setAlpha(1);
    this.overlay.setAlpha(1);
    this.hpDots.setAlpha(1);
    this.statusBars.setAlpha(1);
    this.hackIcon.setAlpha(showActivity && hacking && !downed && !expelled && !escaped ? 1 : 0);
  }

  hide() {
    this.bg.setAlpha(0);
    this.portrait.setAlpha(0);
    this.overlay.setAlpha(0);
    this.nameText.setAlpha(0);
    this.hpDots.setAlpha(0);
    this.portImg?.setAlpha(0);
    this.hackIcon.setAlpha(0);
    this.statusBars.setAlpha(0);
  }

  private _drawBackground(state: string) {
    const { bg, portrait, overlay, baseColor, cardY } = this;
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

  private _updatePortrait(skinId: string, hp: number, downed: boolean) {
    const hurt    = downed || hp <= 1;
    const hurtKey = `${skinId}-icon-hurt`;
    const normKey = `${skinId}-icon`;
    const wantKey = (hurt && this.scene.textures.exists(hurtKey)) ? hurtKey : normKey;

    if (!this.scene.textures.exists(wantKey)) {
      this.portImg?.setAlpha(0);
      return;
    }

    const cx   = CARD_X + CARD_W / 2 + 2;
    const cy   = this.cardY + PORT_H / 2;
    const size = PORT_H - 4;

    if (!this.portImg) {
      this.portImg = this.scene.add
        .image(cx, cy, wantKey)
        .setDisplaySize(size, size)
        .setScrollFactor(0)
        .setDepth(31);
    } else {
      this.portImg.setTexture(wantKey).setDisplaySize(size, size).setPosition(cx, cy);
    }

    this.portImg.setAlpha(1);
    this.portrait.setAlpha(0);
  }

  private _drawHpDots(hp: number, downed: boolean) {
    const { hpDots, cardY } = this;
    hpDots.clear();

    const dotR = 4;
    const gap  = 3;
    const x    = CARD_X + CARD_W - 8 - (2 * dotR * 2 + gap);
    const y    = cardY + PORT_H + 8;

    for (let i = 0; i < 2; i++) {
      const filled = !downed && hp > i;
      hpDots.fillStyle(filled ? 0xe53935 : 0x2a2a2a, 0.95);
      hpDots.fillCircle(x + i * (dotR * 2 + gap), y, dotR);
      hpDots.lineStyle(1, filled ? 0xff6659 : 0x444444, 0.9);
      hpDots.strokeCircle(x + i * (dotR * 2 + gap), y, dotR);
    }
  }

  private _drawStatusBars(downed: boolean, healPct: number, bleedMs: number, showHealPct: boolean) {
    this.statusBars.clear();
    if (!downed) return;

    const BLEED_OUT_MS = 70_000;
    const bx  = CARD_X + 4;
    const bw  = CARD_W - 8;
    const bh  = 4;

    const bleedY = this.cardY + PORT_H + 15;
    const healY  = this.cardY + PORT_H + 26;

    this.statusBars.fillStyle(0x1a1a1a, 0.9);
    this.statusBars.fillRoundedRect(bx, bleedY, bw, bh, 2);
    const bleedFill = Math.min(1, bleedMs / BLEED_OUT_MS) * bw;
    if (bleedFill > 0) {
      this.statusBars.fillStyle(0xff6600, 0.9);
      this.statusBars.fillRoundedRect(bx, bleedY, bleedFill, bh, 2);
    }

    if (!showHealPct || healPct <= 0) return;

    this.statusBars.fillStyle(0x1a1a1a, 0.9);
    this.statusBars.fillRoundedRect(bx, healY, bw, bh, 2);
    const healFill = Math.min(1, healPct / 100) * bw;
    if (healFill > 0) {
      this.statusBars.fillStyle(0x81c995, 0.9);
      this.statusBars.fillRoundedRect(bx, healY, healFill, bh, 2);
    }
  }
}
