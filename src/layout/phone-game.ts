// The phone's layout in the live game (ADR 0136 §2): a pure allocator
// beside `allocatePhone`. The cockpit uses it only with its `phoneGame`
// option, which only the live game's shell passes; the run log player and
// Spotlights keep `allocatePhone` and the tab strip.
//
// Screen (C × R cells), top to bottom, every part full width:
//
//   +--------------------------------------------+
//   | pane strip (one pane)                      |  0, or ~20 % of R
//   +--------------------------------------------+
//   | fight card                                 |  0, or 2 while fighting
//   +--------------------------------------------+
//   | Comm                                       |  0, or its stored rows
//   +--------------------------------------------+
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
//   corner. It floats (the game pane keeps its full width) and is left out
//   (`lens: null`, `lensHidden`) when it would collide with Comm or would
//   reach into the rows the keys at the bottom right need.
// - Short screens (the keyboard is up): the game keeps `GAME_KEEP_ROWS`.
//   Comm shrinks to its minimum first, then the strip closes, then Comm,
//   and last the fight card gives way. The result's rectangles say what is
//   shown; an empty one (h = 0) is closed.
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

/** The lens as the caller wants it, in cells. */
export interface PhoneGameLens {
  /** The square's size (150 px in whole cells: more columns than rows). */
  cols: number;
  rows: number;
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
  /** A fight is on: the fight card shows. */
  fight?: boolean;
  /** Comm is open, at `rows` (null: the default share); absent or null: closed. */
  comm?: { rows: number | null } | null;
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
  /** The lens's square, or null (not wanted, or hidden). */
  lens: Rect | null;
  /** The lens was wanted but would collide: its keys stay as a row (ADR 0136 §4). */
  lensHidden: boolean;
  /** While Comm shows: the heights a resize may give it. */
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
    lensHidden: false,
    commRange: null,
  };
  if ((input.guard ?? true) && (cols < PHONE_MIN_COLS || rows < PHONE_MIN_ROWS)) {
    res.tooSmall = true;
    return res;
  }

  let fightH = input.fight ? FIGHT_ROWS : 0;
  let stripH = input.strip ? stripRows(rows) : 0;
  let commH = 0;
  let commRange: PhoneGameResult['commRange'] = null;
  const comm = input.comm ?? null;
  // The fight card gives way only when the text would all but vanish.
  if (avail - fightH < GAME_MIN_ROWS) fightH = 0;
  // The strip alone must leave the game its rows.
  if (stripH > 0 && avail - fightH - stripH < GAME_KEEP_ROWS) stripH = 0;
  if (comm) {
    let max = avail - fightH - stripH - GAME_KEEP_ROWS;
    // Not even the least Comm fits under the strip: the strip closes.
    if (max < COMM_MIN_ROWS && stripH > 0) {
      stripH = 0;
      max = avail - fightH - GAME_KEEP_ROWS;
    }
    if (max >= COMM_MIN_ROWS) {
      // A stored height that is not a number (a damaged setting) is the default.
      const dflt = Math.round(rows * COMM_DEFAULT_SHARE);
      const want = comm.rows === null ? dflt : whole(comm.rows, dflt);
      commH = Math.min(max, Math.max(COMM_MIN_ROWS, want));
      commRange = { min: COMM_MIN_ROWS, max };
    }
  }

  const top = stripH + fightH + commH;
  res.strip = { x: 0, y: 0, w: cols, h: stripH };
  res.fight = { x: 0, y: stripH, w: cols, h: fightH };
  res.comm = { x: 0, y: stripH + fightH, w: cols, h: commH };
  res.game = { x: 0, y: top, w: cols, h: avail - top };
  res.commRange = commRange;

  const lens = input.lens ?? null;
  if (lens) {
    const w = Math.max(1, Math.floor(lens.cols));
    const h = Math.max(1, Math.floor(lens.rows));
    const x = cols - w - Math.max(0, Math.floor(lens.gapRight ?? 0));
    const y = top + Math.max(0, Math.floor(lens.gapTop ?? 0));
    const floor = avail - Math.max(0, Math.floor(lens.clearBottom ?? 0));
    // Comm is full width right where the lens sits: they always collide.
    if (commH > 0 || x < 0 || y + h > floor) res.lensHidden = true;
    else res.lens = { x, y, w, h };
  }
  return res;
}
