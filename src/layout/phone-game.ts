// The phone's layout in the live game (ADR 0136 §2): a pure allocator
// beside `allocatePhone`. The cockpit uses it only with its `phoneGame`
// option, which only the live game's shell passes; the run log player and
// Spotlights keep `allocatePhone` and the tab strip.
//
// Screen (C × R cells), top to bottom, every part full width:
//
//   +--------------------------------------------+
//   | pane strip (one pane)                      |  0, or its stored rows (~20 % of R)
//   +--------------------------------------------+
//   | fight card                                 |  0, or 2 while fighting
//   +--------------------------------------------+
//   | Comm                                       |  0, or its stored rows
//   +--------------------------------------------+  <- never below `maxTop`
//   |                                 +-------+  |
//   |   game text                     | lens  |  |  what is left
//   |                                 +-------+  |
//   +--------------------------------------------+
//   | command row                                |  `inputRows`
//   +--------------------------------------------+
//
// - The command row is as many whole rows as the thumb-size field needs
//   (`commandRows`): the cockpit places in whole cells, and the phone
//   layer's CSS draws the 44 px field centred in them.
// - The lens is a square of whole cells over the game text's top right
//   corner, directly under the strip, the fight card and Comm. It floats
//   (the game pane keeps its full width). Its room is from there down to
//   the rows the keys at the bottom right need (`clearBottom`): with room
//   it has its full size, with less it is the largest square of whole rows
//   that fits, and under its least size it is left out (`lens: null`,
//   `lensHidden`).
// - The strip, the fight card and Comm share a budget of rows: what leaves
//   the game `GAME_KEEP_ROWS` (or `gameKeep`, which the cockpit lowers
//   while the keyboard is up) and, with `maxTop`, what ends at or above
//   that row (stage 52: the place of three hot keys above the compass, so
//   the three never reach under the quick buttons). When they want more
//   than the budget, Comm shrinks towards its minimum first, then the
//   strip towards its own, then the strip closes, then Comm. The stored
//   heights are the caller's and are not changed by this. The fight card
//   gives way only when the game text would all but vanish, never to the
//   budget. The result's rectangles say what is shown; an empty one
//   (h = 0) is closed.
// - `stripRange` and `commRange` are what a drag of that part's band may
//   give it while the other keeps the height it has now: the dragged one
//   stops at the budget, the other does not shrink.
// - Below PHONE_MIN_COLS × PHONE_MIN_ROWS the result is `tooSmall`, unless
//   `guard` is false (the on-screen keyboard is up), as in `allocatePhone`.
//
// Landscape (stage 52c, `side` given): the strip and Comm open from the
// left as one column instead, the strip above and Comm below, one width:
//
//   +-----------+--------------------------------+
//   | strip    ||  fight card                    |  0, or 2 while fighting
//   |          |+--------------------------------+
//   +----------||                 +------+       |
//   | Comm     ||  game text      | lens | K K   |
//   |          ||                 +------+ pad   |
//   |          |+--------------------------------+
//   |          ||  command row                   |
//   +-----------+--------------------------------+
//
// - The column takes the whole height, the command row's rows too: the game
//   text, the fight card and the command row are what is right of it. Its
//   last columns (`side.band`) are the phone layer's resize band.
// - Its width is the stored one, or about 40 % of the columns, from
//   `SIDE_MIN_COLS` up to what leaves the game text `SIDE_GAME_MIN_COLS`
//   and stays left of `side.clearRight` (the lens's least place, the hot
//   key columns and the compass). `sideRange` is what a drag may give it.
//   Where not even the least width fits, the column does not open.
// - One of the two open: it has every row. Both: the strip about 40 % of
//   the rows, Comm the rest, each at least its minimum; when both minimums
//   do not fit the strip closes. The stored portrait heights are not used,
//   and `maxTop` and `gameKeep` do not apply: the column takes no row from
//   the game text.
// - The lens stands under the fight card `gapRight` columns from the right
//   edge (the caller puts it left of the hot key columns) and also shrinks
//   to the columns between the column and there (`gapLeft` of air).
//
// A keyboard of our own (ADR 0138, `bottom`): the last `bottom` rows are
// its, in both arrangements. Everything above is laid out as on a screen
// that many rows lower (the command row directly above the keyboard, the
// landscape column ending there too); the too-small guard and the result's
// `rows` are still the whole screen's. The reserve gives way before the
// command row and `GAME_MIN_ROWS` of game text do (`bottom` in the result
// is what was really kept).
//
// The chrome over these rectangles (fight card, lens ring, keys, compass)
// is the phone layer's (src/phone/), laid out in pixels.

import type { Rect } from './allocate';
import { PHONE_MIN_COLS, PHONE_MIN_ROWS } from './phone';

/** Rows of the fight card while fighting (ADR 0136 §3). */
export const FIGHT_ROWS = 2;
/** The open pane strip's share of the rows, and its limits (ADR 0136 §2). */
export const STRIP_SHARE = 0.2;
export const STRIP_MIN_SHARE = 0.15;
export const STRIP_MAX_SHARE = 0.25;
/** The least rows of an open strip: its hood, its dots and two rows of pane. Lower, it closes. */
export const STRIP_MIN_ROWS = 4;
/** Comm's default share of the rows and its least height (ADR 0136 §2). */
export const COMM_DEFAULT_SHARE = 0.4;
export const COMM_MIN_ROWS = 6;
/** Rows the game text keeps under an open strip or Comm (ADR 0136 §2). */
export const GAME_KEEP_ROWS = 8;
/** Rows the game text keeps before the fight card gives way. */
export const GAME_MIN_ROWS = 3;
/** Landscape (stage 52c): the column's default share of the columns, and its least width (Comm's rail and a line of chat; a Timers row). */
export const SIDE_SHARE = 0.4;
export const SIDE_MIN_COLS = 24;
/** Landscape: columns the game text keeps beside the column; on a screen too narrow for that, the phone's least columns. */
export const SIDE_GAME_MIN_COLS = 40;
/** Landscape, the strip and Comm both open: the strip's share of the rows. */
export const SIDE_STRIP_SHARE = 0.4;
/** Landscape, the keyboard up: Comm's least rows (its hood, a line of chat and its reply line), so it stays while it is typed in. */
export const SIDE_COMM_KBD_ROWS = 5;
/** Landscape, the keyboard up, the strip open too: the rows Comm needs under it for its head, some chat and the whole reply line; with fewer the strip gives way. */
export const SIDE_COMM_KBD_BESIDE_ROWS = 9;
/**
 * The least height in CSS px of the command row: the 44 px field and menu
 * key with 3 px above and below. (The mockups' row is 56 px: three 19 px
 * lines. Three rows of a phone's default 17 px cell are 51 px.)
 */
export const COMMAND_ROW_PX = 50;

/** Whole rows the command row takes at a cell `cellH` px high (at least one). */
export function commandRows(cellH: number): number {
  if (!(cellH > 0)) return 1;
  return Math.max(1, Math.ceil(COMMAND_ROW_PX / cellH - 1e-6));
}

/** Rows of the open pane strip on a screen `rows` high: about 20 %, within 15–25 %. */
export function stripRows(rows: number): number {
  const lo = Math.ceil(rows * STRIP_MIN_SHARE);
  const hi = Math.max(1, Math.floor(rows * STRIP_MAX_SHARE));
  return Math.min(hi, Math.max(lo, Math.round(rows * STRIP_SHARE)));
}

/** The lens as the caller wants it. */
export interface PhoneGameLens {
  /** The lens's full diameter, px. */
  fullPx: number;
  /** Its least diameter, px: with less room it is hidden. Default `fullPx` (it never shrinks). */
  minPx?: number;
  /** A cell's size, px (the lens is a square in px: more columns than rows). */
  cellW: number;
  cellH: number;
  /** Rows between what is above (the fight card, or the top edge) and the lens. Default 0. */
  gapTop?: number;
  /** Columns between the lens and the right edge. Default 0. */
  gapRight?: number;
  /** Landscape: columns between the game text's left edge and the lens. Default 0. */
  gapLeft?: number;
  /** Rows above the command row the lens must stay out of (the hot keys, the compass). Default 0. */
  clearBottom?: number;
}

export interface PhoneGameInput {
  cols: number;
  rows: number;
  /** Rows of the command row (`commandRows`). Default 1. */
  inputRows?: number;
  /** Apply the too-small guard (default true; false while the keyboard is up). */
  guard?: boolean;
  /** The pane strip is open. */
  strip?: boolean;
  /** The strip's stored rows; absent or null: the default share (`stripRows`). */
  stripRows?: number | null;
  /**
   * The row the strip, the fight card and Comm together must end at or
   * above (stage 52: the top of the place of three hot keys). Absent: no
   * such limit.
   */
  maxTop?: number;
  /** A fight is on: the fight card shows. */
  fight?: boolean;
  /** Comm is open, at `rows` (null: the default share); absent or null: closed. */
  comm?: { rows: number | null } | null;
  /**
   * Rows the game text keeps under an open strip or Comm. Default
   * `GAME_KEEP_ROWS`. The cockpit lowers it while the on-screen keyboard is
   * up, so Comm's reply line stays on the short screen while it is typed in.
   */
  gameKeep?: number;
  /** The lens is wanted; absent or null: no lens. */
  lens?: PhoneGameLens | null;
  /** Whole rows kept free at the bottom edge, under the command row (a keyboard of our own, ADR 0138). Default 0. */
  bottom?: number;
  /**
   * Landscape (stage 52c): the strip and Comm open from the left as one
   * column (see the file header). Absent or null: portrait, as above.
   */
  side?: PhoneGameSide | null;
}

/** The landscape column as the caller wants it. */
export interface PhoneGameSide {
  /** The stored width in columns; null: the default share (`SIDE_SHARE`). */
  cols: number | null;
  /** Columns from the right edge the column never reaches (the lens's least place, the hot keys, the compass). Default 0. */
  clearRight?: number;
  /** Columns of the column's right edge that are its resize band. Default 1. */
  band?: number;
  /** The on-screen keyboard is up: Comm stays down to `SIDE_COMM_KBD_ROWS`. */
  keyboard?: boolean;
}

export interface PhoneGameResult {
  cols: number;
  rows: number;
  /** Below the phone's limit (with the guard on): only the game and the command row are laid out. */
  tooSmall: boolean;
  /** The pane strip (h = 0: closed, or it gave way). */
  strip: Rect;
  /** The fight card (h = 0: no fight, or it gave way). */
  fight: Rect;
  /** Comm (h = 0: closed, or it gave way). */
  comm: Rect;
  /** The game text. */
  game: Rect;
  /** The command row. */
  input: Rect;
  /** The rows kept free under the command row (`bottom` as given, or less on a screen too low for it). */
  bottom: number;
  /** The lens's rectangle of whole cells, or null (not wanted, or hidden). */
  lens: Rect | null;
  /** The lens's diameter in px inside `lens` (full, or shrunk to the room); 0 without a lens. */
  lensPx: number;
  /** The lens was wanted but has no room: its keys stay as a row (ADR 0136 §4). */
  lensHidden: boolean;
  /** While the strip shows: the heights a resize may give it (Comm keeping its height). */
  stripRange: { min: number; max: number } | null;
  /** While Comm shows: the heights a resize may give it (the strip keeping its height). */
  commRange: { min: number; max: number } | null;
  /** The landscape arrangement (`side` was given). */
  landscape: boolean;
  /** Landscape: the column that holds the strip and Comm (w = 0: closed, or no room for it). */
  side: Rect;
  /** Landscape: the columns at the column's right edge that are its resize band. */
  sideBand: number;
  /** Landscape, while the column shows: the widths a resize may give it. */
  sideRange: { min: number; max: number } | null;
}

const EMPTY: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** `n` floored, or `fallback` when it is not a finite number. */
const whole = (n: number, fallback: number): number => (Number.isFinite(n) ? Math.floor(n) : fallback);

/** Lays out the phone's game screen (see the file header). */
export function allocatePhoneGame(input: PhoneGameInput): PhoneGameResult {
  const cols = Math.max(0, Math.floor(input.cols));
  /** The whole screen's rows, and the ones above the bottom reserve: all that follows is laid out in those. */
  const screenRows = Math.max(0, Math.floor(input.rows));
  const wantIn = Math.max(1, whole(input.inputRows ?? 1, 1));
  const bottom = Math.max(0, Math.min(whole(input.bottom ?? 0, 0), screenRows - wantIn - GAME_MIN_ROWS));
  const rows = screenRows - bottom;
  // The command row never takes the last row from the game text.
  const inH = Math.min(rows, Math.max(1, Math.min(wantIn, rows - 1)));
  const inputRect: Rect = { x: 0, y: rows - inH, w: cols, h: inH };
  const avail = rows - inH;
  const res: PhoneGameResult = {
    cols,
    rows: screenRows,
    bottom,
    tooSmall: false,
    strip: EMPTY,
    fight: EMPTY,
    comm: EMPTY,
    game: { x: 0, y: 0, w: cols, h: avail },
    input: inputRect,
    lens: null,
    lensPx: 0,
    lensHidden: false,
    stripRange: null,
    commRange: null,
    landscape: false,
    side: EMPTY,
    sideBand: 0,
    sideRange: null,
  };
  if ((input.guard ?? true) && (cols < PHONE_MIN_COLS || screenRows < PHONE_MIN_ROWS)) {
    res.tooSmall = true;
    return res;
  }

  const side = input.side ?? null;
  // The game text's first row: the lens stands under it.
  const top = side ? layoutSide(input, side, res, rows, avail) : layoutStack(input, res, rows, avail);

  const lens = input.lens ?? null;
  if (lens && lens.fullPx > 0 && lens.cellW > 0 && lens.cellH > 0) {
    const up = (px: number, unit: number): number => Math.max(1, Math.ceil(px / unit - 1e-6));
    const y = top + Math.max(0, Math.floor(lens.gapTop ?? 0));
    const floor = avail - Math.max(0, Math.floor(lens.clearBottom ?? 0));
    const room = floor - y;
    const fullRows = up(lens.fullPx, lens.cellH);
    // With room: the full size. With less: the largest square of whole rows that fits.
    let px = room >= fullRows ? lens.fullPx : Math.min(lens.fullPx, Math.floor(room * lens.cellH + 1e-6));
    let h = room >= fullRows ? fullRows : room;
    const right = Math.max(0, Math.floor(lens.gapRight ?? 0));
    if (side) {
      // Landscape: also no wider than the whole columns between the column (and its air) and its place at the right.
      const roomW = cols - right - res.game.x - Math.max(0, Math.floor(lens.gapLeft ?? 0));
      const pxW = Math.floor(roomW * lens.cellW + 1e-6);
      if (pxW < px) {
        px = pxW;
        h = px > 0 ? up(px, lens.cellH) : 0;
      }
    }
    const w = px > 0 ? up(px, lens.cellW) : 0;
    const x = cols - w - right;
    const min = Math.min(lens.fullPx, lens.minPx ?? lens.fullPx);
    if (px < min || h < 1 || x < res.game.x) res.lensHidden = true;
    else {
      res.lens = { x, y, w, h };
      res.lensPx = px;
    }
  }
  return res;
}

/** Portrait: the strip, the fight card and Comm stacked from the top (see the file header). Returns the game text's first row. */
function layoutStack(input: PhoneGameInput, res: PhoneGameResult, rows: number, avail: number): number {
  const { cols } = res;
  const keep = Math.max(1, whole(input.gameKeep ?? GAME_KEEP_ROWS, GAME_KEEP_ROWS));
  let fightH = input.fight ? FIGHT_ROWS : 0;
  // The fight card gives way only when the text would all but vanish.
  if (avail - fightH < GAME_MIN_ROWS) fightH = 0;
  // What the strip and Comm may take together: the game keeps its rows, and they end at or above `maxTop`.
  const maxTop = input.maxTop === undefined ? Infinity : whole(input.maxTop, Infinity);
  const budget = Math.min(avail - keep, maxTop) - fightH;

  // A stored height that is not a number (a damaged setting) is the default.
  const stripDflt = stripRows(rows);
  const storedStrip = input.stripRows ?? null;
  let stripH = 0;
  if (input.strip) {
    // The default share on a low screen has no room for a pane: no strip. A stored height is at least the minimum.
    stripH = storedStrip === null ? stripDflt : Math.max(STRIP_MIN_ROWS, whole(storedStrip, stripDflt));
    if (stripH < STRIP_MIN_ROWS) stripH = 0;
  }
  const comm = input.comm ?? null;
  const commDflt = Math.round(rows * COMM_DEFAULT_SHARE);
  const commWant = comm ? Math.max(COMM_MIN_ROWS, comm.rows === null ? commDflt : whole(comm.rows, commDflt)) : 0;
  let commH = commWant;
  // More than the budget: Comm gives way first, then the strip, each down to its minimum;
  // then the strip closes, and last Comm.
  if (stripH + commH > budget) {
    if (commH > 0) commH = Math.max(COMM_MIN_ROWS, budget - stripH);
    if (stripH > 0 && stripH + commH > budget) stripH = Math.max(STRIP_MIN_ROWS, budget - commH);
    if (stripH > 0 && stripH + commH > budget) {
      stripH = 0;
      commH = comm ? Math.max(COMM_MIN_ROWS, Math.min(commWant, budget)) : 0;
    }
    if (commH > budget) commH = 0;
  }

  const top = stripH + fightH + commH;
  res.strip = { x: 0, y: 0, w: cols, h: stripH };
  res.fight = { x: 0, y: stripH, w: cols, h: fightH };
  res.comm = { x: 0, y: stripH + fightH, w: cols, h: commH };
  res.game = { x: 0, y: top, w: cols, h: avail - top };
  if (stripH > 0) res.stripRange = { min: STRIP_MIN_ROWS, max: budget - commH };
  if (commH > 0) res.commRange = { min: COMM_MIN_ROWS, max: budget - stripH };
  return top;
}

/** Landscape: the strip and Comm as one column from the left (see the file header). Returns the game text's first row. */
function layoutSide(input: PhoneGameInput, side: PhoneGameSide, res: PhoneGameResult, rows: number, avail: number): number {
  const { cols } = res;
  res.landscape = true;
  const band = Math.max(1, whole(side.band ?? 1, 1));
  res.sideBand = band;
  // The rows: one of them has all, both share them; when both minimums do not fit the strip closes.
  const commMin = side.keyboard ? Math.min(COMM_MIN_ROWS, SIDE_COMM_KBD_ROWS) : COMM_MIN_ROWS;
  let stripOn = input.strip === true;
  const commOn = (input.comm ?? null) !== null;
  // (Typing on the short screen above the keyboard: Comm keeps room for its reply line.)
  const commBeside = side.keyboard ? SIDE_COMM_KBD_BESIDE_ROWS : COMM_MIN_ROWS;
  if (stripOn && commOn && rows < STRIP_MIN_ROWS + commBeside) stripOn = false;
  let stripH = 0;
  let commH = 0;
  if (stripOn && commOn) {
    stripH = Math.max(STRIP_MIN_ROWS, Math.min(rows - commBeside, Math.round(rows * SIDE_STRIP_SHARE)));
    commH = rows - stripH;
  } else if (stripOn) stripH = rows >= STRIP_MIN_ROWS ? rows : 0;
  else if (commOn) commH = rows >= commMin ? rows : 0;

  // The width: the game text keeps its columns (the phone's least ones on a narrow screen), and
  // the column ends left of what stands at the right. No room for the least width: no column.
  const clear = Math.max(0, whole(side.clearRight ?? 0, 0));
  const max = Math.min(cols - clear, Math.max(cols - SIDE_GAME_MIN_COLS, Math.min(SIDE_MIN_COLS, cols - PHONE_MIN_COLS)));
  let w = 0;
  if (stripH + commH > 0 && max >= SIDE_MIN_COLS) {
    const dflt = Math.round(cols * SIDE_SHARE);
    w = Math.max(SIDE_MIN_COLS, Math.min(max, side.cols === null ? dflt : whole(side.cols, dflt)));
    res.sideRange = { min: SIDE_MIN_COLS, max };
  } else {
    stripH = 0;
    commH = 0;
  }
  let fightH = input.fight ? FIGHT_ROWS : 0;
  if (avail - fightH < GAME_MIN_ROWS) fightH = 0;
  res.side = { x: 0, y: 0, w, h: w > 0 ? rows : 0 };
  res.strip = { x: 0, y: 0, w: stripH > 0 ? w : 0, h: stripH };
  res.comm = { x: 0, y: stripH, w: commH > 0 ? w : 0, h: commH };
  res.fight = { x: w, y: 0, w: cols - w, h: fightH };
  res.game = { x: w, y: fightH, w: cols - w, h: avail - fightH };
  res.input = { ...res.input, x: w, w: cols - w };
  return fightH;
}
