import Phaser from 'phaser';
import { FOV_PROFESSOR, FOV_SURVIVOR, FOV_PROFESSOR_CONE_DEG } from '../constants';
import type { Role } from '../types';

// fog de guerra
// - desenha um overlay preto na tela toda
// - usa mask pra "abrir" a area visivel
// - survivor enxerga em circulo
// - professor enxerga em cone na direcao q ta olhando
export class FogOfWar {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private maskGraphics: Phaser.GameObjects.Graphics | null = null;
  private role: Role = 'survivor';
  private fovRadius = FOV_SURVIVOR;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setup(role: Role) {
    this.role = role;
    this.fovRadius = role === 'professor' ? FOV_PROFESSOR : FOV_SURVIVOR;

    this.overlay?.destroy();
    this.maskGraphics?.destroy();

    // overlay preto fixo na tela
    this.overlay = this.scene.add
      .rectangle(0, 0, 800, 600, 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(25);

    this.maskGraphics = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(24)
      .setVisible(false);

    const mask = this.maskGraphics.createGeometryMask();
    mask.invertAlpha = true;
    this.overlay.setMask(mask);
  }

  update(player: { x: number; y: number }, lookAngle = 0) {
    if (!this.maskGraphics) return;
    const cam = this.scene.cameras.main;
    const sx = (player.x - cam.scrollX) * cam.zoom;
    const sy = (player.y - cam.scrollY) * cam.zoom;
    const g = this.maskGraphics;

    g.clear();
    g.fillStyle(0xffffff, 1);

    if (this.role === 'professor') {
      const halfCone = Phaser.Math.DegToRad(FOV_PROFESSOR_CONE_DEG) / 2;
      const start = lookAngle - halfCone;
      const end = lookAngle + halfCone;

      g.beginPath();
      g.moveTo(sx, sy);
      g.arc(sx, sy, this.fovRadius, start, end, false);
      g.closePath();
      g.fillPath();

      // circulozinho perto do prof pra n ficar cego grudado nele
      g.fillCircle(sx, sy, 18);
      return;
    }

    g.fillCircle(sx, sy, this.fovRadius);
  }
}

