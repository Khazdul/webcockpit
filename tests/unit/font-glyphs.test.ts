// Glyph coverage of the bundled fonts (Inv §10.1 "Glyph needs", ADR 0010).
// Reads the cmap straight from the woff2 files: the WOFF2 table directory,
// one Brotli stream (node:zlib), then cmap format 4 / 12.
import { readFileSync, readdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { FONTS, UNDERSCORE_FACE, fontFiles } from '../../src/theme/fonts';

const DIR = new URL('../../public/fonts/', import.meta.url);

/** Box drawing, half blocks, quadrants and blocks: must be in the font itself. */
const STRUCTURAL = '─│┌┐└┘┬═║▀▄▌▐▛▜▙▟█░▁▂▃▅▆▇';
/** Symbols: a fallback font in the CSS stack is acceptable. */
const SYMBOLS = '·◦✦✧◄►▲▼⚔♦★☆✓●◆▶⚠✖•…▬↑‹›';

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

/**
 * The tables of a woff2 font, decompressed (one Brotli stream, node:zlib).
 * `glyf` / `loca` come back in their WOFF2-transformed form (unused here).
 */
export function woff2Tables(buf: Buffer): Map<string, Buffer> {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not woff2');
  const numTables = buf.readUInt16BE(12);
  const compLen = buf.readUInt32BE(20);
  let p = 48;
  const base128 = (): number => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[p++]!;
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('bad UIntBase128');
  };
  let offset = 0;
  const dir: Array<{ tag: string; off: number; len: number }> = [];
  for (let t = 0; t < numTables; t++) {
    const flags = buf[p++]!;
    let tag = KNOWN_TAGS[flags & 0x3f]!;
    if ((flags & 0x3f) === 63) {
      tag = buf.toString('latin1', p, p + 4);
      p += 4;
    }
    const version = (flags >> 6) & 3;
    const orig = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const len = transformed ? base128() : orig;
    dir.push({ tag, off: offset, len });
    offset += len;
  }
  const data = brotliDecompressSync(buf.subarray(p, p + compLen));
  return new Map(dir.map((t) => [t.tag, data.subarray(t.off, t.off + t.len)]));
}

/** The code points in a woff2 font's cmap. */
export function woff2CodePoints(buf: Buffer): Set<number> {
  const c = woff2Tables(buf).get('cmap');
  if (!c) throw new Error('no cmap');
  const out = new Set<number>();
  const n = c.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const sub = c.readUInt32BE(4 + i * 8 + 4);
    const format = c.readUInt16BE(sub);
    if (format === 4) {
      const segX2 = c.readUInt16BE(sub + 6);
      const ends = sub + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = c.readUInt16BE(ends + s * 2);
        const start = c.readUInt16BE(starts + s * 2);
        const delta = c.readUInt16BE(deltas + s * 2);
        const ro = c.readUInt16BE(ranges + s * 2);
        for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
          let g: number;
          if (ro === 0) g = (cp + delta) & 0xffff;
          else {
            const gi = ranges + s * 2 + ro + (cp - start) * 2;
            g = c.readUInt16BE(gi);
            if (g !== 0) g = (g + delta) & 0xffff;
          }
          if (g !== 0) out.add(cp);
        }
      }
    } else if (format === 12) {
      const groups = c.readUInt32BE(sub + 12);
      for (let gIdx = 0; gIdx < groups; gIdx++) {
        const o = sub + 16 + gIdx * 12;
        const start = c.readUInt32BE(o);
        const end = c.readUInt32BE(o + 4);
        const glyph = c.readUInt32BE(o + 8);
        for (let cp = start; cp <= end; cp++) if (glyph + (cp - start) !== 0) out.add(cp);
      }
    }
  }
  return out;
}

const missing = (cps: Set<number>, chars: string): string[] =>
  [...chars].filter((ch) => !cps.has(ch.codePointAt(0)!));

describe('bundled fonts', () => {
  const files = Object.values(FONTS).flatMap((f) => [f.regular, f.bold]);

  it('every font file referenced by the code exists', () => {
    const present = readdirSync(DIR);
    for (const f of files) expect(present).toContain(f);
  });

  for (const file of files) {
    it(`${file} has every box, block and quadrant glyph`, () => {
      const cps = woff2CodePoints(readFileSync(new URL(file, DIR)));
      expect(cps.has(0x41)).toBe(true);
      expect(missing(cps, STRUCTURAL)).toEqual([]);
    });
  }

  it('symbols: DejaVu has all; JetBrains Mono lacks only ✦✧⚔♦★☆✖▬ (DejaVu is its fallback)', () => {
    const dv = woff2CodePoints(readFileSync(new URL(FONTS.dejavu.regular, DIR)));
    expect(missing(dv, SYMBOLS)).toEqual([]);
    const dvb = woff2CodePoints(readFileSync(new URL(FONTS.dejavu.bold, DIR)));
    expect(missing(dvb, SYMBOLS)).toEqual([]);
    for (const f of [FONTS.jetbrains.regular, FONTS.jetbrains.bold]) {
      const jb = woff2CodePoints(readFileSync(new URL(f, DIR)));
      expect(missing(jb, SYMBOLS).sort()).toEqual([...'✦✧⚔♦★☆✖▬'].sort());
    }
    expect(FONTS.jetbrains.stack).toContain('"DejaVu Sans Mono"');
  });
});

/** The metrics that decide a line box: hhea, OS/2 and head, as numbers. */
function lineMetrics(buf: Buffer): Record<string, number> {
  const t = woff2Tables(buf);
  const hhea = t.get('hhea')!;
  const os2 = t.get('OS/2')!;
  const head = t.get('head')!;
  return {
    unitsPerEm: head.readUInt16BE(18),
    hheaAscent: hhea.readInt16BE(4),
    hheaDescent: hhea.readInt16BE(6),
    hheaLineGap: hhea.readInt16BE(8),
    fsSelection: os2.readUInt16BE(62),
    typoAscender: os2.readInt16BE(68),
    typoDescender: os2.readInt16BE(70),
    typoLineGap: os2.readInt16BE(72),
    winAscent: os2.readUInt16BE(74),
    winDescent: os2.readUInt16BE(76),
  };
}

/** Advance width of glyph `gid` (hmtx, with hhea.numberOfHMetrics). */
function advance(buf: Buffer, gid: number): number {
  const t = woff2Tables(buf);
  const n = t.get('hhea')!.readUInt16BE(34);
  return t.get('hmtx')!.readUInt16BE(Math.min(gid, n - 1) * 4);
}

describe('the underscore face (ADR 0043)', () => {
  const pairs = [
    [UNDERSCORE_FACE.regular, FONTS.dejavu.regular],
    [UNDERSCORE_FACE.bold, FONTS.dejavu.bold],
  ] as const;

  for (const [face, dejavu] of pairs) {
    it(`${face} maps only U+005F and has DejaVu's line metrics and advance`, () => {
      const f = readFileSync(new URL(face, DIR));
      const d = readFileSync(new URL(dejavu, DIR));
      expect([...woff2CodePoints(f)]).toEqual([0x5f]);
      // Identical vertical metrics: the face cannot change a line box, so
      // the cell (src/theme/cells.ts) and every row stay as they are.
      expect(lineMetrics(f)).toEqual(lineMetrics(d));
      // Glyph 1 is the underscore (glyph 0 is .notdef); every DejaVu Sans Mono glyph is 1233 wide.
      expect(advance(f, 1)).toBe(1233);
      expect(advance(f, 0)).toBe(1233);
    });
  }

  it('comes first in the DejaVu stack only, and is loaded with DejaVu', () => {
    expect(FONTS.dejavu.stack.startsWith(`"${UNDERSCORE_FACE.family}", "DejaVu Sans Mono"`)).toBe(true);
    expect(FONTS.jetbrains.stack).not.toContain(UNDERSCORE_FACE.family);
    expect(fontFiles('dejavu').map((f) => f.file)).toEqual([
      FONTS.dejavu.regular,
      FONTS.dejavu.bold,
      UNDERSCORE_FACE.regular,
      UNDERSCORE_FACE.bold,
    ]);
    expect(fontFiles('jetbrains').map((f) => f.file)).toEqual([FONTS.jetbrains.regular, FONTS.jetbrains.bold]);
    const css = readFileSync(new URL('../../src/theme/fonts.css', import.meta.url), 'utf8');
    for (const file of [UNDERSCORE_FACE.regular, UNDERSCORE_FACE.bold]) {
      const face = css.split('@font-face').find((b) => b.includes(file));
      expect(face).toContain(`font-family: "${UNDERSCORE_FACE.family}"`);
      expect(face).toContain('unicode-range: U+5F;');
      expect(face).toContain('font-display: block;');
    }
  });
});
