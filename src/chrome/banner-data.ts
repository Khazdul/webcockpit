// Banner data and twinkle math (Inv §10.7, owner decision 2026-09-27:
// the MUME + COCKPIT wordmark exactly as in Cockpit). Pure; unit tested.
//
// 45 × 11 cells: rows 0–4 starfield, 5–7 MUME (#00d0d0), 8–10 COCKPIT
// (#0a9a9c), each word centred in the 45 cells. Stars sit in blank cells.

export const BANNER_W = 45;
export const BANNER_H = 11;

/** MUME in half-block letters (22 cells wide). */
export const MUME_ROWS: readonly string[] = [
  '█▄ ▄█ █   █ █▄ ▄█ █▀▀▀',
  '█ █ █ █   █ █ █ █ █▀▀ ',
  '█   █ ▀▄▄▄▀ █   █ █▄▄▄',
];

/** COCKPIT in half-block letters (39 cells wide). */
export const COCKPIT_ROWS: readonly string[] = [
  '▄▀▀▀▄ ▄▀▀▀▄ ▄▀▀▀▄ █ ▄▀  █▀▀▀▄ ▀█▀ ▀▀█▀▀',
  '█     █   █ █     █▀▄   █▀▀▀   █    █  ',
  '▀▄▄▄▀ ▀▄▄▄▀ ▀▄▄▄▀ █  ▀▄ █     ▄█▄   █  ',
];

export const MUME_ROW0 = 5;
export const COCKPIT_ROW0 = 8;
export const MUME_COL0 = Math.floor((BANNER_W - 22) / 2); // 11
export const COCKPIT_COL0 = Math.floor((BANNER_W - 39) / 2); // 3

/** Star brightness: 0 dim, 1 mid, 2 bright. */
export type Tier = 0 | 1 | 2;

export interface Star {
  row: number;
  col: number;
  glyph: string;
  tier: Tier;
}

const DIM = 0;
const MID = 1;
const BRIGHT = 2;

export const STARS: readonly Star[] = [
  { row: 0, col: 8, glyph: '✧', tier: BRIGHT },
  { row: 0, col: 22, glyph: '✧', tier: MID },
  { row: 0, col: 35, glyph: '·', tier: DIM },
  { row: 0, col: 41, glyph: '·', tier: DIM },
  { row: 1, col: 3, glyph: '·', tier: DIM },
  { row: 1, col: 19, glyph: '·', tier: DIM },
  { row: 1, col: 27, glyph: '◦', tier: MID },
  { row: 2, col: 0, glyph: '◦', tier: DIM },
  { row: 2, col: 14, glyph: '·', tier: MID },
  { row: 2, col: 33, glyph: '·', tier: DIM },
  { row: 4, col: 9, glyph: '·', tier: DIM },
  { row: 4, col: 31, glyph: '◦', tier: DIM },
  { row: 5, col: 5, glyph: '·', tier: DIM },
];

/** True when (row, col) lies within a wordmark's span: such stars stay static. */
export function inWordmarkSpan(row: number, col: number): boolean {
  if (row >= MUME_ROW0 && row < MUME_ROW0 + 3) return col >= MUME_COL0 && col < MUME_COL0 + 22;
  if (row >= COCKPIT_ROW0 && row < COCKPIT_ROW0 + 3) return col >= COCKPIT_COL0 && col < COCKPIT_COL0 + 39;
  return false;
}

/** Twinkle periods (s) and threshold. */
export const PERIOD_MIN = 12;
export const PERIOD_MAX = 32;
export const PEAK = 0.82;
/** Four-point stars twinkle this much slower. */
export const SPARKLE_SLOWDOWN = 5;

const SWAP: Readonly<Record<string, string>> = { '✦': '✧', '✧': '✦' };

export const isSparkle = (glyph: string): boolean => glyph in SWAP;

export interface StarAnim {
  /** Seconds per sine cycle; 0 = static. */
  period: number;
  /** Phase as a fraction of the cycle, 0–1. */
  phase: number;
}

/** A random period and phase per star (static ones get period 0). */
export function makeAnims(stars: readonly Star[] = STARS, rand: () => number = Math.random): StarAnim[] {
  return stars.map((s) => {
    if (inWordmarkSpan(s.row, s.col)) return { period: 0, phase: 0 };
    let period = PERIOD_MIN + rand() * (PERIOD_MAX - PERIOD_MIN);
    if (isSparkle(s.glyph)) period *= SPARKLE_SLOWDOWN;
    return { period, phase: rand() };
  });
}

/**
 * A star at time `t` (s): its base look most of the cycle; one tier up
 * while the sine is above PEAK (a four-point star also swaps ✧↔✦ there)
 * and one tier down while it is below −PEAK. Tiers clamp to 0–2.
 */
export function starLook(star: Star, anim: StarAnim, t: number): { tier: Tier; glyph: string } {
  if (anim.period <= 0) return { tier: star.tier, glyph: star.glyph };
  const s = Math.sin(2 * Math.PI * (t / anim.period + anim.phase));
  if (s > PEAK) {
    return {
      tier: Math.min(BRIGHT, star.tier + 1) as Tier,
      glyph: isSparkle(star.glyph) ? SWAP[star.glyph]! : star.glyph,
    };
  }
  if (s < -PEAK) return { tier: Math.max(DIM, star.tier - 1) as Tier, glyph: star.glyph };
  return { tier: star.tier, glyph: star.glyph };
}

/** One run of same-styled text in a banner row. `star` = index into STARS. */
export interface Segment {
  text: string;
  cls: 'word' | 'word-dim' | 'star' | 'space';
  star?: number;
}

/** The narrowest banner: COCKPIT's 39 cells, the starfield cropped to them. */
export const BANNER_MIN_W = 39;

/**
 * The banner's columns for a grid `cols` wide: all 45, or on a narrower
 * grid (a phone, ADR 0075 §3.2) `cols` of them with the starfield cropped
 * evenly and the wordmark kept whole; null under BANNER_MIN_W (no banner).
 */
export function bannerCrop(cols: number): { c0: number; width: number } | null {
  if (cols >= BANNER_W) return { c0: 0, width: BANNER_W };
  if (cols < BANNER_MIN_W) return null;
  const end = COCKPIT_COL0 + BANNER_MIN_W; // the wordmark's right edge
  const c0 = Math.min(COCKPIT_COL0, Math.max(end - cols, Math.floor((BANNER_W - cols) / 2)));
  return { c0, width: cols };
}

/** The 11 rows as styled segments (stars as their own one-cell segments), columns [c0, c0 + width). */
export function bannerRows(stars: readonly Star[] = STARS, c0 = 0, width = BANNER_W): Segment[][] {
  const grid: { ch: string; cls: Segment['cls']; star?: number }[][] = Array.from({ length: BANNER_H }, () =>
    Array.from({ length: BANNER_W }, () => ({ ch: ' ', cls: 'space' as const })),
  );
  const paint = (rows: readonly string[], row0: number, col0: number, cls: Segment['cls']): void => {
    rows.forEach((line, r) => {
      [...line].forEach((ch, c) => {
        if (ch !== ' ') grid[row0 + r]![col0 + c] = { ch, cls };
      });
    });
  };
  paint(MUME_ROWS, MUME_ROW0, MUME_COL0, 'word');
  paint(COCKPIT_ROWS, COCKPIT_ROW0, COCKPIT_COL0, 'word-dim');
  stars.forEach((s, i) => {
    const cell = grid[s.row]?.[s.col];
    if (cell && cell.cls === 'space') grid[s.row]![s.col] = { ch: s.glyph, cls: 'star', star: i };
  });
  return grid.map((row) => {
    const segs: Segment[] = [];
    for (const c of row.slice(c0, c0 + width)) {
      const last = segs[segs.length - 1];
      if (c.cls !== 'star' && last && last.cls === c.cls) last.text += c.ch;
      else segs.push(c.star === undefined ? { text: c.ch, cls: c.cls } : { text: c.ch, cls: 'star', star: c.star });
    }
    return segs;
  });
}

/**
 * Whether the banner fits: `available` rows must hold the banner plus a
 * blank row above and below it and `reserved` rows of other content (the
 * menu always wins, Inv §10.7), and the grid must be at least
 * BANNER_MIN_W columns wide (`cols`; narrower only on a phone).
 */
export function bannerFits(available: number, reserved: number, cols: number = BANNER_W): boolean {
  return available >= reserved + BANNER_H + 2 && bannerCrop(cols) !== null;
}
