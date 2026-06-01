import Phaser from 'phaser';

const CARD_X = 8;

interface CardSizes {
  w: number; h: number; portH: number;
}

const SIZES_NORMAL:  CardSizes = { w: 78, h: 76, portH: 44 };
const SIZES_COMPACT: CardSizes = { w: 60, h: 48, portH: 36 };

const STATE_BORDER: Record<string, number> = {
  healthy:  0x4caf50,
  injured:  0xffcc00,
  downed:   0xff9800,
  expelled: 0x444444,
  escaped:  0x4fc3f7,
};

const STATE_LABEL: Record<string, string> = {
  downed:   'DOWNED',
  expelled: 'EXPELLED',
  escaped:  'ESCAPED',
};

export class SurvivorCard {
  private scene:     Phaser.Scene;
  private baseColor: number;
  readonly cardY:    number;
  private compact:   boolean;
  private sz:        CardSizes;

  private bg:            Phaser.GameObjects.Graphics;
  private portrait:      Phaser.GameObjects.Graphics;
  private overlay:       Phaser.GameObjects.Graphics;
  private nameText:      Phaser.GameObjects.Text;
  private heart1:        Phaser.GameObjects.Text;
  private heart2:        Phaser.GameObjects.Text;
  private hackIndicator: Phaser.GameObjects.Graphics;
  private stateLabel:    Phaser.GameObjects.Text;
  private portImg:       Phaser.GameObjects.Image | null = null;
  private statusBars:    Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, cardY: number, baseColor: number, compact = false) {
    this.scene     = scene;
    this.cardY     = cardY;
    this.baseColor = baseColor;
    this.compact   = compact;
    this.sz        = compact ? SIZES_COMPACT : SIZES_NORMAL;

    const { w, h, portH } = this.sz;

    this.bg       = scene.add.graphics().setScrollFactor(0).setDepth(29).setAlpha(0);
    this.portrait = scene.add.graphics().setScrollFactor(0).setDepth(30).setAlpha(0);
    this.overlay  = scene.add.graphics().setScrollFactor(0).setDepth(32).setAlpha(0);

    this.nameText = scene.add
      .text(CARD_X + 8, cardY + portH + 5, '', {
        fontSize: compact ? '9px' : '10px',
        color: '#ddd', fontStyle: 'bold',
      })
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    this.heart1 = scene.add
      .text(CARD_X + w - 22, cardY + portH + 6, '♥', {
        fontSize: '11px', color: '#e53935',
      })
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    this.heart2 = scene.add
      .text(CARD_X + w - 12, cardY + portH + 6, '♥', {
        fontSize: '11px', color: '#e53935',
      })
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    this.stateLabel = scene.add
      .text(CARD_X + w / 2 + 2, cardY + portH / 2, '', {
        fontSize: '9px', color: '#fff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 3,
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(33).setAlpha(0);

    this.hackIndicator = scene.add.graphics().setScrollFactor(0).setDepth(33).setAlpha(0);
    this.statusBars    = scene.add.graphics().setScrollFactor(0).setDepth(33).setAlpha(0);
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
    const stateKey = escaped  ? 'escaped'
      : expelled             ? 'expelled'
      : downed               ? 'downed'
      : hp <= 1              ? 'injured'
      : 'healthy';

    this._drawBackground(stateKey);
    this._updatePortrait(skinId, hp, downed);
    this._drawStatusBars(downed, healPct, bleedMs, showHealPct);

    const maxChars = this.compact ? 7 : 12;
    this.nameText.setText(label.slice(0, maxChars)).setAlpha(1);
    this.bg.setAlpha(1);
    this.overlay.setAlpha(1);
    this.statusBars.setAlpha(1);

    const stateStr = STATE_LABEL[stateKey] ?? '';
    this.stateLabel.setText(stateStr).setAlpha(stateStr ? 1 : 0);

    if (!this.compact) {
      this._drawHearts(hp, downed);
      this.heart1.setAlpha(1);
      this.heart2.setAlpha(1);
      this._drawHackIndicator(showActivity && hacking && !downed && !expelled && !escaped);
    }
  }

  hide() {
    this.bg.setAlpha(0);
    this.portrait.setAlpha(0);
    this.overlay.setAlpha(0);
    this.nameText.setAlpha(0);
    this.heart1.setAlpha(0);
    this.heart2.setAlpha(0);
    this.stateLabel.setAlpha(0);
    this.hackIndicator.setAlpha(0);
    this.portImg?.setAlpha(0);
    this.statusBars.setAlpha(0);
  }

  private _drawBackground(state: string) {
    const { bg, portrait, overlay, baseColor, cardY } = this;
    const { w, h, portH } = this.sz;
    const x  = CARD_X;
    const cx = x + w / 2 + 2;

    bg.clear();
    bg.fillStyle(0x0e0e0e, 0.84);
    bg.fillRoundedRect(x, cardY, w, h, 5);
    bg.fillStyle(STATE_BORDER[state] ?? 0x666666, 1);
    bg.fillRect(x, cardY + 4, 4, h - 8);

    portrait.clear();
    portrait.fillStyle(baseColor, 0.20);
    portrait.fillRect(x + 4, cardY, w - 4, portH);

    overlay.clear();
    if (state === 'downed') {
      overlay.fillStyle(0xff9800, 0.50);
      overlay.fillRect(x + 4, cardY, w - 4, portH);
      overlay.lineStyle(2.5, 0xffffff, 0.85);
      overlay.lineBetween(cx - 8, cardY + 8, cx + 8, cardY + portH - 8);
      overlay.lineBetween(cx + 8, cardY + 8, cx - 8, cardY + portH - 8);
    } else if (state === 'expelled') {
      overlay.fillStyle(0x000000, 0.70);
      overlay.fillRect(x + 4, cardY, w - 4, portH);
    } else if (state === 'escaped') {
      overlay.fillStyle(0x4fc3f7, 0.28);
      overlay.fillRect(x + 4, cardY, w - 4, portH);
    }
    portrait.setAlpha(1);
    overlay.setAlpha(1);
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

    const { w, portH } = this.sz;
    const cx   = CARD_X + w / 2 + 2;
    const cy   = this.cardY + portH / 2;
    const size = portH - 4;

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

  private _drawHearts(hp: number, downed: boolean) {
    const full  = !downed && hp > 0;
    const full2 = !downed && hp > 1;
    this.heart1.setColor(full  ? '#e53935' : '#2a2a2a');
    this.heart2.setColor(full2 ? '#e53935' : '#2a2a2a');
  }

  private _drawHackIndicator(active: boolean) {
    const { w, portH } = this.sz;
    this.hackIndicator.clear();
    if (!active) { this.hackIndicator.setAlpha(0); return; }
    const bx = CARD_X + 4;
    const by = this.cardY + portH - 4;
    const bw = w - 8;
    this.hackIndicator.fillStyle(0x00e676, 0.85);
    this.hackIndicator.fillRoundedRect(bx, by, bw, 4, 2);
    this.hackIndicator.setAlpha(1);
  }

  private _drawStatusBars(downed: boolean, healPct: number, bleedMs: number, showHealPct: boolean) {
    this.statusBars.clear();
    if (!downed) return;

    const BLEED_OUT_MS = 70_000;
    const { w, h } = this.sz;
    const bx = CARD_X + 4;
    const bw = w - 8;
    const bh = 4;

    const bleedY = this.cardY + h - 13;
    const healY  = this.cardY + h - 7;

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
