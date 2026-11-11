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
}

const EMPTY: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** `n` floored, or `fallback` when it is not a finite number. */
const whole = (n: number, fallback: number): number => (Number.isFinite(n) ? Math.floor(n) : fallback);

/** Lays out the phone's game screen (see the file header). */
export function allocatePhoneGame(input: PhoneGameInput): PhoneGameResult {
  const cols = Math.max(0, Math.floor(input.cols));
  const rows = Math.max(0, Math.floor(input.rows));
  // The command row never takes the last row from the game text.
  const wantIn = Math.max(1, whole(input.inputRows ?? 1, 1));
  const inH = Math.min(rows, Math.max(1, Math.min(wantIn, rows - 1)));
  const inputRect: Rect = { x: 0, y: rows - inH, w: cols, h: inH };
  const avail = rows - inH;
  const res: PhoneGameResult = {
    cols,
    rows,
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
  };
  if ((input.guard ?? true) && (cols < PHONE_MIN_COLS || rows < PHONE_MIN_ROWS)) {
    res.tooSmall = true;
    return res;
  }

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

  const lens = input.lens ?? null;
  if (lens && lens.fullPx > 0 && lens.cellW > 0 && lens.cellH > 0) {
    const up = (px: number, unit: number): number => Math.max(1, Math.ceil(px / unit - 1e-6));
    const y = top + Math.max(0, Math.floor(lens.gapTop ?? 0));
    const floor = avail - Math.max(0, Math.floor(lens.clearBottom ?? 0));
    const room = floor - y;
    const fullRows = up(lens.fullPx, lens.cellH);
    // With room: the full size. With less: the largest square of whole rows that fits.
    const px = room >= fullRows ? lens.fullPx : Math.min(lens.fullPx, Math.floor(room * lens.cellH + 1e-6));
    const h = room >= fullRows ? fullRows : room;
    const w = px > 0 ? up(px, lens.cellW) : 0;
    const x = cols - w - Math.max(0, Math.floor(lens.gapRight ?? 0));
    const min = Math.min(lens.fullPx, lens.minPx ?? lens.fullPx);
    if (px < min || h < 1 || x < 0) res.lensHidden = true;
    else {
      res.lens = { x, y, w, h };
      res.lensPx = px;
    }
  }
  return res;
}
