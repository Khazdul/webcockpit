// The favicons (stage 41b, ADR 0126): the wordmark's "M" in forged iron
// with the cyan metal inlay, reproducible:
//
//   node scripts/build-favicons.ts
//
// Writes into public/ (Vite copies it to the site root, under the base):
//
//   favicon.svg           any size; what modern browsers use
//   favicon.ico           16, 32 and 48 px PNGs, for the rest
//   apple-touch-icon.png  180 px on an opaque night-sky tile (iOS fills
//                         transparency with black and rounds the corners)
//
// The M is Cinzel Black's (src/start/wordmark-glyphs.ts `M_ONLY`), a little
// narrower (it is a wide letter, the tab is square). Small sizes simplify
// the wordmark: no brush, glint or bevel; a wider, brighter inlay; a thin
// pale steel outline so the dark iron separates from a dark tab (the iron
// itself carries it on a light one). The PNGs are rasterised from the same
// SVG by Chromium (Playwright).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { M_ONLY } from '../src/start/wordmark-glyphs.ts';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

/** Horizontal squeeze of the M. */
const SX = 0.78;
/** The inlay: the letter shrunk by this much (font units). */
const CORE_IN = 42;
/** The pale outline around the iron (font units, half inside the fill's edge, half out). */
const OUTLINE = 64;

interface Opts {
  /** An opaque tile behind the M (the touch icon). */
  tile?: boolean;
}

/** The favicon SVG. */
export function faviconSvg(o: Opts = {}): string {
  const w = (M_ONLY.x1 - M_ONLY.x0) * SX;
  const h = M_ONLY.bottom - M_ONLY.top;
  const pad = o.tile ? 230 : OUTLINE / 2 + 4;
  const side = Math.max(w, h) + 2 * pad;
  const x0 = M_ONLY.x0 * SX - (side - w) / 2;
  const y0 = M_ONLY.top - (side - h) / 2;
  const view = `${x0.toFixed(1)} ${y0.toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}`;
  const m = `<path id="m" d="${M_ONLY.d}" transform="scale(${SX} 1)"/>`;
  const tile = o.tile
    ? `<rect x="${x0}" y="${y0}" width="${side}" height="${side}" fill="url(#sky)"/>` +
      `<rect x="${x0}" y="${y0}" width="${side}" height="${side}" fill="url(#moon)"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">` +
    `<style>.o{stroke:#b9d0d3}@media (prefers-color-scheme:light){.o{stroke:#8ea4a8}}</style>` +
    `<defs>${m}` +
    `<linearGradient id="face" gradientUnits="userSpaceOnUse" x1="0" y1="-720" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#7a6a5a"/><stop offset=".2" stop-color="#463b31"/><stop offset=".65" stop-color="#2a221c"/><stop offset="1" stop-color="#16110e"/></linearGradient>` +
    `<linearGradient id="inlay" gradientUnits="userSpaceOnUse" x1="0" y1="-720" x2="0" y2="0">` +
    `<stop offset="0" stop-color="#d4fffc"/><stop offset=".25" stop-color="#3ee0de"/><stop offset=".5" stop-color="#119a9c"/><stop offset=".7" stop-color="#46d6d4"/><stop offset="1" stop-color="#0b6e70"/></linearGradient>` +
    (o.tile
      ? `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1224"/><stop offset=".7" stop-color="#16213b"/><stop offset="1" stop-color="#23304c"/></linearGradient>` +
        `<radialGradient id="moon" cx=".22" cy=".14" r=".6"><stop offset="0" stop-color="#9fb3d6" stop-opacity=".35"/><stop offset="1" stop-color="#9fb3d6" stop-opacity="0"/></radialGradient>`
      : '') +
    `<mask id="core" maskUnits="userSpaceOnUse" x="${x0}" y="${y0}" width="${side}" height="${side}">` +
    `<use href="#m" fill="#fff" stroke="#000" stroke-width="${2 * CORE_IN}" stroke-linejoin="round"/></mask>` +
    `</defs>` +
    tile +
    `<use href="#m" class="o" fill="none" stroke-width="${OUTLINE}" stroke-linejoin="round"/>` +
    `<use href="#m" fill="url(#face)"/>` +
    `<rect mask="url(#core)" x="${x0}" y="${y0}" width="${side}" height="${side}" fill="url(#inlay)"/>` +
    `</svg>`
  );
}

/** An ICO holding PNG images (Vista+ and every browser read PNG entries). */
function ico(pngs: Array<{ size: number; data: Buffer }>): Buffer {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((p, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(p.size >= 256 ? 0 : p.size, e);
    head.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(p.data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += p.data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

async function main(): Promise<void> {
  const svg = faviconSvg();
  writeFileSync(`${PUBLIC}favicon.svg`, `${svg}\n`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const raster = async (src: string, size: number): Promise<Buffer> => {
    await page.setViewportSize({ width: size, height: size });
    const url = `data:image/svg+xml;base64,${Buffer.from(src).toString('base64')}`;
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${url}">`,
    );
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
    return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, data: await raster(svg, size) });
  writeFileSync(`${PUBLIC}favicon.ico`, ico(pngs));
  writeFileSync(`${PUBLIC}apple-touch-icon.png`, await raster(faviconSvg({ tile: true }), 180));
  await browser.close();
  console.log(`public/favicon.svg ${svg.length} B, favicon.ico (${sizes.join(', ')} px), apple-touch-icon.png (180 px)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
