import { describe, expect, it } from 'vitest';
import {
  BANNER_H,
  BANNER_W,
  COCKPIT_ROWS,
  MUME_ROWS,
  PEAK,
  PERIOD_MAX,
  PERIOD_MIN,
  STARS,
  SPARKLE_SLOWDOWN,
  bannerCrop,
  bannerFits,
  bannerRows,
  inWordmarkSpan,
  makeAnims,
  starLook,
} from '../../src/chrome/banner-data';
import { QUOTES, randomQuote } from '../../src/chrome/quotes';

const len = (s: string) => [...s].length;

describe('banner layout', () => {
  it('is 45 × 11 with the wordmarks at Cockpit positions', () => {
    const rows = bannerRows();
    expect(rows).toHaveLength(BANNER_H);
    for (const r of rows) expect(len(r.map((s) => s.text).join(''))).toBe(BANNER_W);
    for (const r of MUME_ROWS) expect(len(r)).toBe(22);
    for (const r of COCKPIT_ROWS) expect(len(r)).toBe(39);
    const text = rows.map((r) => r.map((s) => s.text).join(''));
    expect(text[5]!.slice(11, 33)).toBe(MUME_ROWS[0]!.replace(/ /g, ' '));
    expect(text[8]!.slice(3, 42)).toBe(COCKPIT_ROWS[0]);
    expect(text[7]!.slice(11, 33)).toBe(MUME_ROWS[2]);
  });

  it('puts every star in a blank cell, as its own segment', () => {
    const rows = bannerRows();
    const stars = rows.flatMap((r) => r.filter((s) => s.cls === 'star'));
    expect(stars).toHaveLength(STARS.length);
    for (const s of STARS) {
      expect(MUME_ROWS[s.row - 5]?.[s.col - 11] ?? ' ').toBe(' ');
    }
    expect(rows.flatMap((r) => r.filter((s) => s.cls === 'word'))).not.toHaveLength(0);
  });

  it('knows the wordmark spans', () => {
    expect(inWordmarkSpan(5, 11)).toBe(true);
    expect(inWordmarkSpan(5, 5)).toBe(false);
    expect(inWordmarkSpan(9, 3)).toBe(true);
    expect(inWordmarkSpan(9, 2)).toBe(false);
    expect(inWordmarkSpan(0, 20)).toBe(false);
  });

  it('drops the banner when the menu needs the rows', () => {
    expect(bannerFits(30, 17)).toBe(true);
    expect(bannerFits(29, 17)).toBe(false);
  });
});

describe('twinkle', () => {
  it('gives open-field stars a 12–32 s period (×5 for ✦/✧) and a phase', () => {
    let k = 0;
    const seq = [0, 0.5, 1 - 1e-9, 0.25];
    const anims = makeAnims(STARS, () => seq[k++ % seq.length]!);
    STARS.forEach((s, i) => {
      const a = anims[i]!;
      const f = s.glyph === '✦' || s.glyph === '✧' ? SPARKLE_SLOWDOWN : 1;
      expect(a.period).toBeGreaterThanOrEqual(PERIOD_MIN * f);
      expect(a.period).toBeLessThanOrEqual(PERIOD_MAX * f);
      expect(a.phase).toBeGreaterThanOrEqual(0);
      expect(a.phase).toBeLessThan(1);
    });
  });

  it('holds the base tier except near the sine peaks', () => {
    const dot = { row: 0, col: 0, glyph: '·', tier: 1 as const };
    const anim = { period: 20, phase: 0 };
    // t = 0: sine 0 → base.
    expect(starLook(dot, anim, 0)).toEqual({ tier: 1, glyph: '·' });
    // Quarter period: sine 1 → one tier up.
    expect(starLook(dot, anim, 5)).toEqual({ tier: 2, glyph: '·' });
    // Three quarters: sine −1 → one tier down.
    expect(starLook(dot, anim, 15)).toEqual({ tier: 0, glyph: '·' });
    // Just under the threshold: base.
    const t = (Math.asin(PEAK - 0.01) / (2 * Math.PI)) * 20;
    expect(starLook(dot, anim, t).tier).toBe(1);
  });

  it('clamps tiers and swaps ✧/✦ at the bright peak only', () => {
    const bright = { row: 0, col: 8, glyph: '✧', tier: 2 as const };
    const anim = { period: 100, phase: 0.25 }; // sine = 1 at t = 0
    expect(starLook(bright, anim, 0)).toEqual({ tier: 2, glyph: '✦' });
    expect(starLook(bright, anim, 50)).toEqual({ tier: 1, glyph: '✧' });
    const dim = { row: 0, col: 0, glyph: '◦', tier: 0 as const };
    expect(starLook(dim, { period: 20, phase: 0.75 }, 0).tier).toBe(0);
  });

  it('keeps stars inside a wordmark span static', () => {
    const inside = { row: 6, col: 20, glyph: '·', tier: 1 as const };
    const [a] = makeAnims([inside]);
    expect(a!.period).toBe(0);
    for (const t of [0, 3, 7, 11]) expect(starLook(inside, a!, t)).toEqual({ tier: 1, glyph: '·' });
  });
});

describe('quotes', () => {
  it('has about twenty attributed quotes and picks one', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(20);
    for (const q of QUOTES) {
      expect(q.text.length).toBeGreaterThan(5);
      expect(q.by.length).toBeGreaterThan(2);
    }
    expect(randomQuote(() => 0)).toBe(QUOTES[0]);
    expect(randomQuote(() => 0.9999999)).toBe(QUOTES[QUOTES.length - 1]);
  });
});

describe('banner on a narrow grid (phone, ADR 0075 §3.2)', () => {
  const text = (rows: ReturnType<typeof bannerRows>) => rows.map((r) => r.map((s) => s.text).join(''));
  it('keeps all 45 columns at 45 and more', () => {
    expect(bannerCrop(45)).toEqual({ c0: 0, width: 45 });
    expect(bannerCrop(120)).toEqual({ c0: 0, width: 45 });
  });
  it('crops the starfield and keeps the wordmark whole down to 39 columns', () => {
    const full = text(bannerRows());
    for (let cols = 39; cols < 45; cols++) {
      const c = bannerCrop(cols)!;
      expect(c.width).toBe(cols);
      const rows = text(bannerRows(STARS, c.c0, c.width));
      expect(rows.every((r) => [...r].length === cols)).toBe(true);
      // COCKPIT and MUME rows lose only blank cells.
      for (let r = 5; r < 11; r++) expect(rows[r]!.trim()).toBe(full[r]!.trim());
    }
  });
  it('is dropped under 39 columns', () => {
    expect(bannerCrop(38)).toBeNull();
    expect(bannerFits(40, 10, 38)).toBe(false);
    expect(bannerFits(40, 10, 41)).toBe(true);
  });
});
