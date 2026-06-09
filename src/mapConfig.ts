import Phaser from 'phaser';
import { MAP_SCALE } from './constants';

export type TilesetConfig = {
  name: string;
  key: string;
  image: string;
  tileWidth: number;
  tileHeight: number;
};

export const MAP_TILESETS: TilesetConfig[] = [
  { name: '2',                             key: 'tileset-2',             image: './mapa/Expelled/abc/Dungeon_Tiles.png',                                                    tileWidth: 16, tileHeight: 16 },
  { name: '1',                             key: 'tileset-1',             image: './mapa/Expelled/abc/Interiors_free_32x32.png',                                             tileWidth: 16, tileHeight: 16 },
  { name: '3',                             key: 'tileset-3',             image: './mapa/Expelled/abc/mainlevbuild.png',                                                     tileWidth: 16, tileHeight: 16 },
  { name: 'pingpong',                      key: 'tileset-pingpong',      image: './mesaDeTenis.png',                                                                        tileWidth: 16, tileHeight: 16 },
  { name: 'armario',                       key: 'tileset-armario',       image: './mapa/Expelled/abc/House Interiors – Cozy Farmhouse Bedroom/obj/spr_book_case.png',       tileWidth: 16, tileHeight: 16 },
  { name: 'Computer Room Spritesheet 1 (1)', key: 'tileset-computer-room', image: './Computer Room Spritesheet 1 (1).png',                                                  tileWidth: 16, tileHeight: 16 },
  { name: 'AnimatedAutum',                 key: 'tileset-animated-autum', image: './mapa/Expelled/abc/AnimatedAutum.png',                                                   tileWidth: 16, tileHeight: 16 },
  { name: 'mesaArvor',                     key: 'tileset-mesaarvor',     image: './mapa/Expelled/abc/mesaArvor.png',                                                        tileWidth: 16, tileHeight: 16 },
  { name: 'mapaClosev5',                   key: 'tileset-mapa-close',    image: './mapa/Expelled/abc/mapaClosev5.png',                                                      tileWidth: 16, tileHeight: 16 },
  { name: 'PrincipalV2 (1)',               key: 'tileset-principal-v2',  image: './mapa/Expelled/abc/PrincipalV2 (1).png',                                                  tileWidth: 16, tileHeight: 16 },
  { name: 'mesas',                         key: 'tileset-mesas',         image: './mapa/Expelled/abc/mesas.png',                                                            tileWidth: 16, tileHeight: 16 },
  { name: 'conundrum',                     key: 'tileset-conundrum',     image: './mapa/Expelled/abc/titleGame.png',                                                        tileWidth: 16, tileHeight: 16 },
];

export const COLLISION_LAYERS = new Set([
  'OBSTACULOS',
  'Parede',
  'MESAS',
  'BANCOS',
  'Coisas na parede',
  'PORTAS',
  'PORTAO',
  'ARVORES',
  'PORTAOBOI',
  'GRADE',
]);

export function preloadMapAssets(scene: Phaser.Scene) {
  MAP_TILESETS.forEach((t) => scene.load.image(t.key, encodeURI(t.image)));
}

export function buildTilemap(scene: Phaser.Scene): Phaser.Tilemaps.Tilemap {
  const map = scene.make.tilemap({ key: 'school-map' });
  const tilesets = MAP_TILESETS
    .map((t) => map.addTilesetImage(t.name, t.key, t.tileWidth, t.tileHeight))
    .filter((t): t is Phaser.Tilemaps.Tileset => !!t);

  const abovePlayer = new Set(['pilares', 'TOPO ARVORE']); // nao lembro se é pilares ou topo arvore kkkk botar os 2

  map.layers.forEach((layerData) => {
    const layer = map.createLayer(layerData.name, tilesets, 0, 0);
    if (!layer) return;
    layer.setScale(MAP_SCALE);
    layer.setDepth(abovePlayer.has(layerData.name) ? 6 : 1);
    if (COLLISION_LAYERS.has(layerData.name)) {
      layer.setCollisionByExclusion([-1], true);
    }
  });
  return map;
}
