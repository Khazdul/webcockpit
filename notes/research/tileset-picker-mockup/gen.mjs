// Builds mockup.html: Settings → Mapper with a tileset picker of 3×3
// checkable previews. Each preview is the same 6×6 scene drawn with the
// set's own tiles (downscaled to 40 px, embedded as data URIs), so the
// mockup shows what each set really looks like.
//
// Run from the repository root: node notes/research/tileset-picker-mockup/gen.mjs
// Needs ImageMagick (`magick`).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MAP = join(here, '../../../public/map');

// The scene, north up. Keys are pixmap file names without `.png`.
const SCENE = [
  ['terrain-mountains', 'terrain-mountains', 'terrain-hills', 'terrain-forest', 'terrain-forest', 'terrain-water'],
  ['terrain-mountains', 'terrain-hills', 'terrain-brush', 'terrain-forest', 'terrain-forest', 'terrain-water'],
  ['terrain-hills', 'terrain-brush', 'terrain-field', 'terrain-field', 'terrain-shallow', 'terrain-water'],
  ['road-ew', 'road-ew', 'road-ew', 'road-sw', 'terrain-shallow', 'terrain-shallow'],
  ['terrain-field', 'terrain-field', 'terrain-brush', 'road-nes', 'terrain-city', 'terrain-city'],
  ['terrain-brush', 'terrain-field', 'terrain-field', 'road-ns', 'terrain-city', 'terrain-city'],
];
const KEYS = [...new Set(SCENE.flat())];

// Folder per set (null: MMapper's default pixmaps). A file the set lacks
// comes from the default, as in src/map/tilesets.ts.
const SETS = {
  default: null,
  spring: 'shimrod-spring',
  summer: 'shimrod-summer',
  autumn: 'shimrod-autumn',
  winter: 'shimrod-winter',
  desert: 'desert',
  gefe: 'gefe-rik',
  grays: 'grays-map',
};

function tile(dir, key) {
  const own = dir ? join(MAP, 'tilesets', dir, `${key}.png`) : null;
  const file = own && existsSync(own) ? own : join(MAP, 'pixmaps', `${key}.png`);
  const png = execFileSync('magick', [file, '-resize', '40x40', '-strip', 'png:-']);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const tiles = {};
for (const [id, dir] of Object.entries(SETS)) {
  tiles[id] = Object.fromEntries(KEYS.map((k) => [k, tile(dir, k)]));
}

const template = readFileSync(join(here, 'template.html'), 'utf8');
const html = template
  .replace('/*SCENE*/', JSON.stringify(SCENE))
  .replace('/*TILES*/', JSON.stringify(tiles));
writeFileSync(join(here, 'mockup.html'), html);
console.log(`mockup.html: ${(html.length / 1024).toFixed(0)} KB`);
