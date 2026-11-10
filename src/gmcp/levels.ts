// MUME level data (ADR 0016 "Game data"; Inv §2.2): the XP needed for
// each level 1–100 and the TP a character is expected to have at each
// level, as cumulative totals. These are facts about the game, written
// here in our own format.
//
// The Character pane derives the level from XP (`Char.StatusVars.level` is
// not resent after a death level-drop) and shows two progress bars through
// the current level, each split into "had at session start" and "gained
// this session" (Inv §2.2 "Session-gain rules").

/** Highest level in the tables. */
export const MAX_LEVEL = 100;

// Cumulative XP at the start of level n is XP_AT[n - 1].
// prettier-ignore
const XP_AT: readonly number[] = [
  // 1–10
  1, 1_000, 3_000, 7_000, 15_000, 30_000, 60_000, 105_000, 165_000, 240_000,
  // 11–20
  330_000, 435_000, 555_000, 690_000, 840_000, 1_040_000, 1_290_000, 1_590_000, 1_940_000, 2_340_000,
  // 21–30
  2_790_000, 3_290_000, 3_840_000, 4_440_000, 5_090_000, 5_790_000, 6_540_000, 7_340_000, 8_190_000, 9_090_000,
  // 31–40
  10_040_000, 11_040_000, 12_090_000, 13_190_000, 14_290_000, 15_390_000, 16_640_000, 17_890_000, 19_145_000, 20_400_000,
  // 41–50
  21_700_000, 23_050_000, 24_400_000, 25_750_000, 27_150_000, 28_550_000, 30_000_000, 31_500_000, 33_000_000, 34_550_000,
  // 51–60
  36_150_000, 37_750_000, 39_400_000, 41_100_000, 42_850_000, 44_600_000, 46_400_000, 48_250_000, 50_000_000, 52_000_000,
  // 61–70
  54_000_000, 56_000_000, 58_000_000, 60_000_000, 62_000_000, 64_000_000, 66_500_000, 68_500_000, 71_000_000, 73_000_000,
  // 71–80
  75_500_000, 77_500_000, 80_000_000, 82_500_000, 85_000_000, 87_500_000, 90_000_000, 92_500_000, 95_000_000, 97_500_000,
  // 81–90
  100_500_000, 103_000_000, 106_000_000, 108_500_000, 111_500_000, 114_000_000, 117_000_000, 120_000_000, 123_000_000, 126_000_000,
  // 91–100
  129_000_000, 132_000_000, 135_000_000, 138_000_000, 141_500_000, 144_500_000, 148_000_000, 151_000_000, 154_500_000, 158_000_000,
];

// Cumulative TP expected at the start of level n is TP_AT[n - 1].
// prettier-ignore
const TP_AT: readonly number[] = [
  // 1–10
  0, 100, 300, 600, 1_000, 1_500, 2_100, 2_800, 3_600, 4_500,
  // 11–20
  5_500, 6_600, 7_900, 9_400, 11_100, 13_000, 15_100, 17_400, 19_900, 22_600,
  // 21–30
  25_500, 28_600, 32_000, 35_400, 38_700, 42_000, 45_400, 48_700, 52_000, 55_300,
  // 31–40
  58_700, 62_000, 65_300, 68_700, 72_000, 75_300, 78_700, 82_000, 85_300, 88_700,
  // 41–50
  92_000, 95_300, 98_700, 102_000, 105_300, 108_700, 112_000, 115_300, 118_700, 122_000,
  // 51–60
  125_300, 128_700, 132_000, 135_300, 138_700, 142_000, 145_300, 148_700, 152_000, 155_300,
  // 61–70
  158_700, 162_000, 165_300, 168_700, 172_000, 175_300, 178_700, 182_000, 185_300, 188_700,
  // 71–80
  192_000, 195_300, 198_600, 202_000, 205_300, 208_600, 212_000, 215_300, 218_600, 222_000,
  // 81–90
  225_300, 228_600, 232_000, 235_300, 238_600, 242_000, 245_300, 248_600, 252_000, 255_300,
  // 91–100
  258_600, 262_000, 265_300, 268_600, 272_000, 275_300, 278_600, 282_000, 285_300, 288_600,
];

/** Trolls need a tenth of the TP (Inv §2.2 "Row 2"). */
export const TROLL_TP_SCALE = 0.1;

/** Cumulative XP at the start of `level` (1–100). */
export function xpForLevel(level: number): number {
  return XP_AT[clampLevel(level) - 1]!;
}

/** Cumulative TP expected at the start of `level` (1–100), scaled for trolls. */
export function tpForLevel(level: number, race?: string | null): number {
  return TP_AT[clampLevel(level) - 1]! * tpScale(race);
}

/** The TP threshold multiplier for a race (`troll` → 0.1, else 1). */
export function tpScale(race?: string | null): number {
  return typeof race === 'string' && race.trim().toLowerCase() === 'troll' ? TROLL_TP_SCALE : 1;
}

const clampLevel = (l: number): number => Math.max(1, Math.min(MAX_LEVEL, Math.floor(l)));

/** The level a character with `xp` experience has (1–100). */
export function levelFromXp(xp: number): number {
  if (!(xp > XP_AT[0]!)) return 1;
  if (xp >= XP_AT[MAX_LEVEL - 1]!) return MAX_LEVEL;
  // Binary search for the last threshold <= xp.
  let lo = 0;
  let hi = MAX_LEVEL - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (XP_AT[mid]! <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** XP still needed for the next level ("TNL"), or null at the top level. */
export function xpToNextLevel(xp: number): number | null {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return null;
  return Math.max(0, XP_AT[level]! - xp);
}

/** Fraction 0–1 of `value` through `level` of `table` (level 100 is full). */
function through(table: readonly number[], level: number, value: number, scale: number): number {
  if (level >= MAX_LEVEL) return 1;
  const lo = table[level - 1]! * scale;
  const hi = table[level]! * scale;
  if (hi <= lo) return 1;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

/**
 * A progress bar with a session split (Inv §2.2): the bar is filled to
 * `progress`; the part up to `baseline` is what the character had at
 * session start, the rest was gained this session. `0 <= baseline <=
 * progress <= 1`.
 */
export interface SessionBar {
  progress: number;
  baseline: number;
}

function sessionBar(
  table: readonly number[],
  level: number,
  value: number,
  anchor: number | null,
  scale: number,
): SessionBar {
  const progress = through(table, level, value, scale);
  // No anchor, or nothing gained (lost XP, death level-drop): all baseline.
  if (anchor === null || value <= anchor) return { progress, baseline: progress };
  if (level >= MAX_LEVEL) return { progress, baseline: progress };
  // Session start below this level's start: a level-up this session, so the
  // whole fill is gain until the next level.
  if (anchor <= table[level - 1]! * scale) return { progress, baseline: 0 };
  const baseline = Math.min(progress, through(table, level, anchor, scale));
  return { progress, baseline };
}

/**
 * The XP bar: progress through the level `xp` gives, split at `anchorXp`
 * (XP at session start; null = no session split).
 */
export function xpBar(xp: number, anchorXp: number | null): SessionBar {
  return sessionBar(XP_AT, levelFromXp(xp), xp, anchorXp, 1);
}

/**
 * The TP bar: TP progress through the level `xp` gives (troll thresholds
 * × 0.1), split at `anchorTp` (TP at session start; null = no split).
 */
export function tpBar(xp: number, tp: number, anchorTp: number | null, race?: string | null): SessionBar {
  return sessionBar(TP_AT, levelFromXp(xp), tp, anchorTp, tpScale(race));
}
