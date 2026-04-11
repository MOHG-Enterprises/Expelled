import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';

const projectRoot = process.cwd();
const mapPath = path.join(projectRoot, 'mapa', 'mapa.tmx');
const outMapPath = path.join(projectRoot, 'mapa', 'mapa.phaser.json');
const outTilesetManifestPath = path.join(projectRoot, 'mapa', 'mapa.tilesets.json');
const publicRoot = path.join(projectRoot, 'public');
const publicMapPath = path.join(publicRoot, 'maps', 'mapa.phaser.json');
const publicTilesetManifestPath = path.join(publicRoot, 'maps', 'mapa.tilesets.json');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  parseTagValue: false,
});

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseCsvNumbers(csvText) {
  return csvText
    .replace(/\s+/g, '')
    .split(',')
    .filter((x) => x.length > 0)
    .map((x) => Number.parseInt(x, 10) || 0);
}

function readXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf-8');
  return parser.parse(xml);
}

function normalizeWebPath(absPath) {
  const rel = path.relative(projectRoot, absPath).split(path.sep).join('/');
  return `/${rel}`;
}

function copyToPublic(absPath) {
  const rel = path.relative(projectRoot, absPath);
  const target = path.join(publicRoot, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(absPath, target);
}

const mapXml = readXml(mapPath);
const mapNode = mapXml.map;
const mapDir = path.dirname(mapPath);
const tileWidth = Number(mapNode.tilewidth);
const tileHeight = Number(mapNode.tileheight);

const tilesets = toArray(mapNode.tileset).map((tilesetRef) => {
  const tsxAbsPath = path.resolve(mapDir, tilesetRef.source);
  const tsxNode = readXml(tsxAbsPath).tileset;
  const imageSource = tsxNode.image?.source;

  if (!imageSource) {
    throw new Error(`Tileset sem image source: ${tsxAbsPath}`);
  }

  const imageAbsPath = path.resolve(path.dirname(tsxAbsPath), imageSource);
  if (!fs.existsSync(imageAbsPath)) {
    throw new Error(`Imagem de tileset não encontrada: ${imageAbsPath}`);
  }

  copyToPublic(imageAbsPath);

  return {
    firstgid: Number(tilesetRef.firstgid),
    name: tsxNode.name,
    tilewidth: Number(tsxNode.tilewidth),
    tileheight: Number(tsxNode.tileheight),
    tilecount: Number(tsxNode.tilecount),
    columns: Number(tsxNode.columns),
    image: normalizeWebPath(imageAbsPath),
    imagewidth: Number(tsxNode.image.width),
    imageheight: Number(tsxNode.image.height),
    margin: 0,
    spacing: 0,
  };
});

const layerNodes = toArray(mapNode.layer);

let minTileX = Infinity;
let minTileY = Infinity;
let maxTileX = -Infinity;
let maxTileY = -Infinity;

layerNodes.forEach((layer) => {
  const chunks = toArray(layer.data?.chunk).map((chunk) => ({
    x: Number(chunk.x),
    y: Number(chunk.y),
    width: Number(chunk.width),
    height: Number(chunk.height),
  }));

  chunks.forEach((chunk) => {
    minTileX = Math.min(minTileX, chunk.x);
    minTileY = Math.min(minTileY, chunk.y);
    maxTileX = Math.max(maxTileX, chunk.x + chunk.width);
    maxTileY = Math.max(maxTileY, chunk.y + chunk.height);
  });
});

const hasChunks = Number.isFinite(minTileX) && Number.isFinite(minTileY);
const mapWidthTiles = hasChunks ? (maxTileX - minTileX) : Number(mapNode.width);
const mapHeightTiles = hasChunks ? (maxTileY - minTileY) : Number(mapNode.height);

const layers = layerNodes.map((layer) => {
  const width = mapWidthTiles;
  const height = mapHeightTiles;
  const data = new Array(width * height).fill(0);

  const chunks = toArray(layer.data?.chunk).map((chunk) => ({
    x: Number(chunk.x),
    y: Number(chunk.y),
    width: Number(chunk.width),
    height: Number(chunk.height),
    data: parseCsvNumbers(chunk['#text'] ?? ''),
  }));

  if (chunks.length > 0) {
    chunks.forEach((chunk) => {
      for (let row = 0; row < chunk.height; row += 1) {
        for (let col = 0; col < chunk.width; col += 1) {
          const srcIndex = row * chunk.width + col;
          const destX = (chunk.x - minTileX) + col;
          const destY = (chunk.y - minTileY) + row;
          if (destX < 0 || destY < 0 || destX >= width || destY >= height) continue;
          data[(destY * width) + destX] = chunk.data[srcIndex] ?? 0;
        }
      }
    });
  } else {
    const rawData = parseCsvNumbers(layer.data?.['#text'] ?? '');
    for (let i = 0; i < Math.min(data.length, rawData.length); i += 1) {
      data[i] = rawData[i];
    }
  }

  return {
    id: Number(layer.id),
    name: layer.name,
    type: 'tilelayer',
    x: 0,
    y: 0,
    width,
    height,
    opacity: Number(layer.opacity ?? 1),
    visible: layer.visible === undefined ? true : layer.visible !== '0',
    data,
  };
});

const phaserMapJson = {
  compressionlevel: -1,
  height: mapHeightTiles,
  width: mapWidthTiles,
  infinite: 0,
  nextlayerid: Number(mapNode.nextlayerid),
  nextobjectid: Number(mapNode.nextobjectid),
  orientation: mapNode.orientation,
  renderorder: mapNode.renderorder,
  tiledversion: mapNode.tiledversion,
  tileheight: tileHeight,
  tilewidth: tileWidth,
  type: 'map',
  version: Number(mapNode.version),
  layers,
  tilesets,
};

const tilesetManifest = tilesets.map((t) => ({
  name: t.name,
  firstgid: t.firstgid,
  tilewidth: t.tilewidth,
  tileheight: t.tileheight,
  image: t.image,
}));

fs.writeFileSync(outMapPath, `${JSON.stringify(phaserMapJson)}\n`, 'utf-8');
fs.writeFileSync(outTilesetManifestPath, `${JSON.stringify(tilesetManifest, null, 2)}\n`, 'utf-8');
fs.mkdirSync(path.dirname(publicMapPath), { recursive: true });
fs.writeFileSync(publicMapPath, `${JSON.stringify(phaserMapJson)}\n`, 'utf-8');
fs.writeFileSync(publicTilesetManifestPath, `${JSON.stringify(tilesetManifest, null, 2)}\n`, 'utf-8');

console.log(`Gerado: ${path.relative(projectRoot, outMapPath)}`);
console.log(`Gerado: ${path.relative(projectRoot, outTilesetManifestPath)}`);
console.log(`Gerado: ${path.relative(projectRoot, publicMapPath)}`);
console.log(`Gerado: ${path.relative(projectRoot, publicTilesetManifestPath)}`);
