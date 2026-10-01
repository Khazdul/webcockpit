// Glyph coverage and metrics of the terminal fonts (Inv §10.1 "Glyph needs",
// ADR 0010, ADR 0049). Reads the cmap, hmtx and line metrics straight from
// the woff2 files: the WOFF2 table directory, one Brotli stream (node:zlib),
// then cmap format 4 / 12.
import { readFileSync, readdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { FONT_IDS, type FontId } from '../../src/settings/types';
import {
  AGAVE_BOLD_RANGE,
  AGAVE_REGULAR_FACE,
  FILL_FACES,
  FONTS,
  type FontFaceFile,
  UNDERSCORE_FACE,
  allFontFaces,
  familyFaces,
  fontFaceCss,
  fontFiles,
} from '../../src/theme/fonts';

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
  return new Set(woff2Cmap(buf).keys());
}

/**
 * A woff2 font's cmap: code point → glyph id (formats 4 and 12). The cmap
 * is the same table in TrueType and CFF fonts (only `glyf` / `loca` are
 * transformed in WOFF2), so this reads Hermit's OTF-based files too.
 */
export function woff2Cmap(buf: Buffer): Map<number, number> {
  const c = woff2Tables(buf).get('cmap');
  if (!c) throw new Error('no cmap');
  const out = new Map<number, number>();
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
          if (g !== 0 && !out.has(cp)) out.set(cp, g);
        }
      }
    } else if (format === 12) {
      const groups = c.readUInt32BE(sub + 12);
      for (let gIdx = 0; gIdx < groups; gIdx++) {
        const o = sub + 16 + gIdx * 12;
        const start = c.readUInt32BE(o);
        const end = c.readUInt32BE(o + 4);
        const glyph = c.readUInt32BE(o + 8);
        for (let cp = start; cp <= end; cp++) if (glyph + (cp - start) !== 0 && !out.has(cp)) out.set(cp, glyph + (cp - start));
      }
    }
  }
  return out;
}

const missing = (cps: Set<number>, chars: string): string[] =>
  [...chars].filter((ch) => !cps.has(ch.codePointAt(0)!));

const read = (file: string): Buffer => readFileSync(new URL(file, DIR));

/** The code points of a CSS `unicode-range` value. */
function rangeSet(range: string): Set<number> {
  const out = new Set<number>();
  for (const part of range.split(',')) {
    const m = /^\s*U\+([0-9A-F]+)(?:-([0-9A-F]+))?\s*$/i.exec(part);
    if (!m) throw new Error(`bad range ${part}`);
    const a = parseInt(m[1]!, 16);
    const b = m[2] ? parseInt(m[2], 16) : a;
    for (let cp = a; cp <= b; cp++) out.add(cp);
  }
  return out;
}

/** The code points the faces `faces` (stack order) draw for one weight, unicode-range applied. */
function covered(faces: readonly FontFaceFile[]): Set<number> {
  const out = new Set<number>();
  for (const f of faces) {
    if (!f.file) continue;
    const range = f.unicodeRange ? rangeSet(f.unicodeRange) : null;
    for (const cp of woff2CodePoints(read(f.file))) if (!range || range.has(cp)) out.add(cp);
  }
  return out;
}

/** The glyphs a fill face may draw (scripts/build-fill-fonts.py FILL_SET). */
const FILL_SET = '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▀▄▌▐█▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇░▒▓';

const BUNDLED = FONT_IDS.filter((id) => !FONTS[id].local);

describe('bundled fonts', () => {
  it('every font file referenced by the code exists, and every woff2 is referenced', () => {
    const present = readdirSync(DIR);
    const used = new Set(allFontFaces().flatMap((f) => (f.file ? [f.file] : [])));
    for (const f of used) expect(present).toContain(f);
    expect(present.filter((f) => f.endsWith('.woff2')).sort()).toEqual([...used].sort());
  });

  it('Lucida Console is never shipped (ADR 0049)', () => {
    expect(readdirSync(DIR).filter((f) => /lucida|lucon/i.test(f))).toEqual([]);
    expect(FONTS.lucida.regular).toBeNull();
    expect(FONTS.lucida.bold).toBeNull();
    expect(familyFaces('lucida').filter((f) => f.family === FONTS.lucida.family).every((f) => !f.file && f.local)).toBe(
      true,
    );
  });

  it('every bundled family has a licence file', () => {
    const present = readdirSync(DIR);
    for (const name of [
      'Agave', 'AnonymousPro', 'CascadiaCode', 'DejaVu', 'FantasqueSansMono', 'FiraCode', 'GoMono', 'Hack',
      'Hermit', '3270', 'IBMPlexMono', 'Inconsolata', 'JetBrainsMono-OFL', 'mononoki', 'NotoSansMono',
      'WebCockpitFill',
    ]) {
      expect(present).toContain(`LICENSE-${name}.txt`);
    }
  });

  for (const id of FONT_IDS) {
    for (const weight of ['normal', 'bold'] as const) {
      it(`${id} ${weight}: every box, block and quadrant glyph is in the family or its glyph faces`, () => {
        const faces = familyFaces(id).filter((f) => f.weight === weight);
        if (FONTS[id].local) {
          // Lucida Console 5.01 has all but what its fill face draws.
          const fill = covered(faces);
          expect(missing(fill, '▛▜▙▟▁▂▃▅▆▇')).toEqual([]);
          return;
        }
        const cps = covered(faces);
        expect(cps.has(0x41)).toBe(true);
        expect(missing(cps, STRUCTURAL)).toEqual([]);
        expect(missing(cps, FILL_SET)).toEqual([]);
      });
    }
  }

  it('symbols: DejaVu has all; JetBrains Mono lacks only ✦✧⚔♦★☆✖▬ (DejaVu is its fallback)', () => {
    const dv = woff2CodePoints(read(FONTS.dejavu.regular!));
    expect(missing(dv, SYMBOLS)).toEqual([]);
    const dvb = woff2CodePoints(read(FONTS.dejavu.bold!));
    expect(missing(dvb, SYMBOLS)).toEqual([]);
    for (const f of [FONTS.jetbrains.regular!, FONTS.jetbrains.bold!]) {
      const jb = woff2CodePoints(read(f));
      expect(missing(jb, SYMBOLS).sort()).toEqual([...'✦✧⚔♦★☆✖▬'].sort());
    }
    for (const id of FONT_IDS) if (id !== 'dejavu') expect(FONTS[id].stack).toContain('"DejaVu Sans Mono", monospace');
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
    useTypo: (os2.readUInt16BE(62) >> 7) & 1,
    typoAscender: os2.readInt16BE(68),
    typoDescender: os2.readInt16BE(70),
    typoLineGap: os2.readInt16BE(72),
    winAscent: os2.readUInt16BE(74),
    winDescent: os2.readUInt16BE(76),
  };
}

/** The line metrics browsers use: hhea, and OS/2 typo or win (USE_TYPO_METRICS). */
function usedMetrics(m: Record<string, number>): Record<string, number> {
  const { typoAscender, typoDescender, typoLineGap, ...rest } = m;
  return m.useTypo ? { ...rest, typoAscender: typoAscender!, typoDescender: typoDescender!, typoLineGap: typoLineGap! } : rest;
}

/** Advance width of glyph `gid` (hmtx, with hhea.numberOfHMetrics). */
function advance(buf: Buffer, gid: number): number {
  const t = woff2Tables(buf);
  const n = t.get('hhea')!.readUInt16BE(34);
  return t.get('hmtx')!.readUInt16BE(Math.min(gid, n - 1) * 4);
}

/**
 * `█` y-range in font units (fontTools glyph bounds; public/fonts/README.md
 * "Metrics"). Anonymous Pro has no `█`: its line metrics, which its `│` and
 * its fill face's blocks span.
 */
const BLOCK: Record<FontId, readonly [number, number]> = {
  agave: [-544, 1568],
  anonymous: [-373, 1675],
  cascadia: [-480, 2226],
  dejavu: [-512, 1921],
  fantasque: [-505, 1820],
  firacode: [-600, 1800],
  gomono: [-432, 1935],
  hack: [-512, 1950],
  hermit: [-375, 875],
  ibm3270: [-400, 1600],
  plex: [-350, 950],
  inconsolata: [-400, 1000],
  jetbrains: [-300, 1020],
  mononoki: [-250, 900],
  notomono: [-240, 973],
  lucida: [-432, 1616],
};

/** Lucida Console 5.01's line metrics (lucon.ttf; never shipped). */
const LUCIDA_METRICS = {
  unitsPerEm: 2048,
  hheaAscent: 1616,
  hheaDescent: -432,
  hheaLineGap: 0,
  useTypo: 0,
  typoAscender: 1604,
  typoDescender: -420,
  typoLineGap: 167,
  winAscent: 1616,
  winDescent: 432,
};

/**
 * The tallest cell `█` covers (ADR 0049): a line box of height L puts the
 * baseline (A - D) / 2 above the box's middle (A, D: the ascent and
 * descent the browser uses), so the glyph's top and bottom must lie at
 * least L / 2 from that middle. Browsers take hhea (Linux, macOS) or OS/2
 * win, or typo where USE_TYPO_METRICS is set (Windows); the cell must work
 * with both.
 */
function coverHeight(m: Record<string, number>, [bottom, top]: readonly [number, number]): number {
  const sets: Array<[number, number]> = [[m.hheaAscent!, -m.hheaDescent!]];
  sets.push(m.useTypo ? [m.typoAscender!, -m.typoDescender!] : [m.winAscent!, m.winDescent!]);
  let h = top - bottom;
  for (const [a, d] of sets) {
    const mid = (a - d) / 2;
    h = Math.min(h, 2 * (top - mid), 2 * (mid - bottom));
  }
  return h;
}

describe('cell metrics in FONTS match the files', () => {
  for (const id of BUNDLED) {
    it(`${id}: units per em, a monospace advance, and the cell █ covers`, () => {
      const f = FONTS[id];
      const reg = read(f.regular!);
      const m = lineMetrics(reg);
      const upm = m.unitsPerEm!;
      // ASCII, the grid glyphs and Swedish letters: all one advance, in both weights.
      for (const file of [f.regular!, f.bold ?? f.regular!]) {
        const buf = read(file);
        const cmap = woff2Cmap(buf);
        const chars = [...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), ...FILL_SET, ...'åäöÅÄÖé'];
        for (const ch of chars) {
          const gid = cmap.get(ch.codePointAt(0)!);
          if (gid === undefined) continue;
          expect(advance(buf, gid), `${file} ${ch}`).toBe(Math.round(f.advanceEm * upm));
        }
        // Bold has the regular's line metrics (those a browser uses): the
        // cell does not depend on the weight.
        expect(usedMetrics(lineMetrics(buf))).toEqual(usedMetrics(m));
      }
      expect(f.advanceEm * upm).toBeCloseTo(Math.round(f.advanceEm * upm), 6);
      const cover = coverHeight(m, BLOCK[id]);
      if (id === 'dejavu') {
        // ADR 0010's value, the full ink height; the hhea centre is 9 units
        // (0.004 em) off the glyph's, which hinting absorbs.
        expect(f.blockEm * upm).toBeCloseTo(2433, 6);
        expect(cover).toBe(2424);
      } else {
        expect(f.blockEm * upm).toBeCloseTo(cover, 6);
      }
    });
  }

  it('lucida: the measured Lucida Console 5.01 numbers', () => {
    expect(FONTS.lucida.advanceEm).toBe(1234 / 2048);
    expect(FONTS.lucida.blockEm * 2048).toBeCloseTo(coverHeight(LUCIDA_METRICS, BLOCK.lucida), 6);
  });
});

describe('fill faces (ADR 0049)', () => {
  const hosts = [
    ['AP', 'anonymous'],
    ['H', 'hermit'],
    ['GM', 'gomono'],
    ['LC', 'lucida'],
  ] as const;

  for (const [key, id] of hosts) {
    const face = FILL_FACES[key];
    it(`${face.family} draws exactly what ${FONTS[id].label} lacks, at its advance and line metrics`, () => {
      expect(face.regular).toBe(`WebCockpitFill-${key}.woff2`);
      expect(face.bold).toBe(face.regular);
      const buf = read(face.regular);
      const cps = woff2Cmap(buf);
      const drawn = [...FILL_SET].filter((c) => cps.has(c.codePointAt(0)!)).join('');
      expect([...cps.keys()].length).toBe([...drawn].length);
      expect(drawn).toBe(face.text);
      expect(rangeSet(face.unicodeRange!)).toEqual(new Set([...face.text].map((c) => c.codePointAt(0)!)));
      const f = FONTS[id];
      expect(f.overrides).toContain(face);
      expect(f.stack.startsWith(`"${face.family}", "${f.family}"`)).toBe(true);
      const upm = lineMetrics(buf).unitsPerEm!;
      const adv = Math.round(f.advanceEm * upm);
      for (const gid of [0, ...cps.values()]) expect(advance(buf, gid)).toBe(adv);
      if (f.local) {
        expect(lineMetrics(buf)).toEqual(LUCIDA_METRICS);
        return;
      }
      for (const file of [f.regular!, f.bold!]) {
        const host = read(file);
        // Identical line metrics: the face cannot change a line box.
        expect(lineMetrics(buf)).toEqual(lineMetrics(host));
        // Exactly the grid glyphs this weight of the host lacks.
        const hostCps = woff2CodePoints(host);
        expect([...FILL_SET].filter((c) => !hostCps.has(c.codePointAt(0)!)).join('')).toBe(face.text);
      }
    });
  }

  it('the bundled families without a fill face need none', () => {
    const withFill = new Set<FontId>(hosts.map(([, id]) => id));
    for (const id of BUNDLED) {
      if (withFill.has(id) || id === 'agave') continue;
      for (const file of [FONTS[id].regular!, FONTS[id].bold ?? FONTS[id].regular!]) {
        expect(missing(woff2CodePoints(read(file)), FILL_SET), file).toEqual([]);
      }
    }
  });
});

describe('families without a full bold (ADR 0049)', () => {
  it('Agave: the bold face is limited to its cmap; the rest of bold is Agave Regular', () => {
    expect(rangeSet(AGAVE_BOLD_RANGE)).toEqual(woff2CodePoints(read(FONTS.agave.bold!)));
    const bold = familyFaces('agave').filter((f) => f.weight === 'bold');
    expect(bold.map((f) => [f.family, f.file, f.unicodeRange])).toEqual([
      ['Agave', 'Agave-Bold.woff2', AGAVE_BOLD_RANGE],
      [AGAVE_REGULAR_FACE.family, 'Agave-Regular.woff2', undefined],
    ]);
    expect(FONTS.agave.stack).toBe('"Agave", "WebCockpit Agave Regular", "DejaVu Sans Mono", monospace');
  });

  it('IBM 3270 and Lucida Console: the bold rule uses the regular face (no synthetic bold)', () => {
    const b3270 = familyFaces('ibm3270').find((f) => f.family === 'IBM 3270' && f.weight === 'bold')!;
    expect(b3270.file).toBe('IBM3270-Regular.woff2');
    const bl = familyFaces('lucida').find((f) => f.family === FONTS.lucida.family && f.weight === 'bold')!;
    expect(bl.local).toEqual(['Lucida Console', 'LucidaConsole']);
  });
});

describe('the underscore face (ADR 0043)', () => {
  const pairs = [
    [UNDERSCORE_FACE.regular, FONTS.dejavu.regular!],
    [UNDERSCORE_FACE.bold, FONTS.dejavu.bold!],
  ] as const;

  for (const [face, dejavu] of pairs) {
    it(`${face} maps only U+005F and has DejaVu's line metrics and advance`, () => {
      const f = read(face);
      const d = read(dejavu);
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
    for (const id of FONT_IDS) if (id !== 'dejavu') expect(FONTS[id].stack).not.toContain(UNDERSCORE_FACE.family);
    expect(fontFiles('dejavu').map((f) => f.file)).toEqual([
      FONTS.dejavu.regular,
      FONTS.dejavu.bold,
      UNDERSCORE_FACE.regular,
      UNDERSCORE_FACE.bold,
    ]);
    expect(fontFiles('jetbrains').map((f) => f.file)).toEqual([FONTS.jetbrains.regular, FONTS.jetbrains.bold]);
    const css = fontFaceCss();
    for (const file of [UNDERSCORE_FACE.regular, UNDERSCORE_FACE.bold]) {
      const face = css.split('@font-face').find((b) => b.includes(file));
      expect(face).toContain(`font-family:"${UNDERSCORE_FACE.family}"`);
      expect(face).toContain('unicode-range:U+5F');
      expect(face).toContain('font-display:block');
    }
  });
});
