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
//   | Comm                                       |  0, or its stored rows
//   +--------------------------------------------+
//   | fight card                                 |  0, or 2 while fighting
//   +--------------------------------------------+  <- never below `maxTop`
//   |                                 +-------+  |
//   |   game text                     | lens  |  |  what is left
//   |                                 +-------+  |
//   +--------------------------------------------+
//   | command row                                |  `inputRows`
//   +--------------------------------------------+
//
// - The fight card always lies under the panes at the top (round 53k, the
//   owner's rule): under Comm, or under the strip when Comm is closed, and
//   at the very top when neither is open. (Before that round it lay between
//   the two.) A setting takes it away altogether (`fight` false).
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
//   the game `GAME_KEEP_ROWS` and, with `maxTop`, what ends at or above
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
//   `guard` is false (the device's keyboard is up, on a phone without the
//   phone layer), as in `allocatePhone`.
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
//   and `maxTop` does not apply: the column takes no row from
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
// Comm holds that keyboard's target (`commKeep`: its reply line or its
// search field is typed in): Comm then never goes under its minimum while
// anything else can give way. Portrait only (in landscape the column has
// every row above the keyboard, and those always hold Comm's minimum).
// Where the usual order (Comm down to its minimum, the strip down to its
// own, the strip closed) ends with no Comm, it is tried again with more
// room, in this order: `maxTop` is dropped (`overLimit` in the result:
// Comm reaches under the place of the hot keys, and the phone layer hides
// their columns), then the game text goes down to `GAME_MIN_ROWS`, then
// the fight card gives way. Only a screen with no room even then closes
// Comm.
//
// Hidden for now (round 53j, `hide`): the strip and/or Comm, though open,
// are left out of this layout as if they were closed, and their rows are
// the game text's. The caller takes them out while something else needs
// the room (the hot key box with our keyboard typing in it) and brings
// them back by laying out without `hide`; nothing of what they show is
// touched here. `hidden` in the result says which open part was left out.
//
// Neither the strip nor Comm has a hood on a row of its own (round 53j, ADR
// 0137's addendum of that round): the pane has every row of its part but
// the band's (`phonePaneRect`), and its name is written on the band.
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
/** The least rows of an open strip: three rows of pane and its band. Lower, it closes. */
export const STRIP_MIN_ROWS = 4;
/**
 * Portrait: the last row of the strip and of Comm is the phone layer's
 * resize band, which also carries the pane's name (round 53j). It is the
 * only row of a part that is not its pane's: no row is a hood's.
 */
export const BAND_ROWS = 1;
/** Comm's default share of the rows and its least height (ADR 0136 §2). */
export const COMM_DEFAULT_SHARE = 0.4;
export const COMM_MIN_ROWS = 6;
/**
 * Comm's least height is a floor in px, not only a count of rows (round
 * 53k): its reply line is 40 px high whatever the text size, so at a small
 * text size six rows cut it off and it could not be tapped. What Comm's
 * pane holds at its least: the thread's top air under the search key
 * (`COMM_MIN_TOP_EM` of the text size, comm.css) with one line of chat, and
 * the reply line with the air above it (`COMM_MIN_REPLY_PX`, phone.css:
 * 4 px and the 40 px line).
 */
export const COMM_MIN_REPLY_PX = 44;
export const COMM_MIN_TOP_EM = 2.4;

/**
 * Comm's least rows at a cell `cellH` px high and a text size of `fontPx`:
 * the whole rows that hold one line of chat and the whole reply line, and
 * the band's row; never under `COMM_MIN_ROWS`. (At the phone's default text
 * size this is seven rows: six cut the reply line's lower edge by 4 px.)
 */
export function commMinRows(cellH: number, fontPx: number): number {
  if (!(cellH > 0) || !(fontPx > 0)) return COMM_MIN_ROWS;
  const px = COMM_MIN_TOP_EM * fontPx + cellH + COMM_MIN_REPLY_PX;
  return Math.max(COMM_MIN_ROWS, Math.ceil(px / cellH - 1e-6) + BAND_ROWS);
}
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
/**
 * The least height in CSS px of the command row: the 44 px field and menu
 * key with 3 px above and below. (The mockups' row is 56 px: three 19 px
 * lines. Three rows of a phone's default 17 px cell are 51 px.)
 */
export const COMMAND_ROW_PX = 50;

/**
 * The rows a keyboard of our own gets (ADR 0138 §5; the cockpit asks at
 * every layout, the phone layer to know its height before one): the
 * keyboard wants `ownPx` px from the bottom edge of a screen `height` px
 * high with cells `cellH` px high.
 *
 * - `bottom`: whole rows. What the screen has under its last whole row is
 *   the keyboard's too, so it counts towards its height; and the keyboard
 *   gives up to `give` of its height (its rows share what it gets) rather
 *   than take one more row from the game text for a few px. Never more
 *   than leaves the command row (`inputRows`) and `GAME_MIN_ROWS` of game
 *   text, as the allocator has it.
 * - `lift`: what that is on screen, px from the bottom edge to the command
 *   row's foot (the rows and what is under the last whole row).
 *
 * Nothing wanted: both 0.
 */
export function ownKeyboardReserve(height: number, cellH: number, ownPx: number, inputRows = 1, give = OWN_KBD_GIVE): { bottom: number; lift: number } {
  if (!(ownPx > 0) || !(cellH > 0) || !(height > 0)) return { bottom: 0, lift: 0 };
  const rows = Math.floor(height / cellH + 1e-6);
  const under = height - rows * cellH;
  const want = Math.max(1, Math.ceil((ownPx * (1 - give) - under) / cellH - 1e-6));
  const bottom = Math.max(0, Math.min(want, rows - Math.max(1, Math.floor(inputRows)) - GAME_MIN_ROWS));
  return { bottom, lift: bottom > 0 ? height - (rows - bottom) * cellH : 0 };
}

/** The share of its height a keyboard of our own gives before it takes one more row (`ownKeyboardReserve`). */
export const OWN_KBD_GIVE = 0.06;

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
  /** Apply the too-small guard (default true; false while the device's keyboard is up). */
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
  /** Comm's least rows on this screen (`commMinRows`); absent: `COMM_MIN_ROWS`. Never under that. */
  commMin?: number;
  /** The lens is wanted; absent or null: no lens. */
  lens?: PhoneGameLens | null;
  /** Whole rows kept free at the bottom edge, under the command row (a keyboard of our own, ADR 0138). Default 0. */
  bottom?: number;
  /** Comm holds the keyboard's target: it keeps its minimum while anything else can give way (see the file header). */
  commKeep?: boolean;
  /** Open parts left out of this layout for now (see the file header). Absent: none. */
  hide?: PhoneGameHide | null;
  /**
   * Landscape (stage 52c): the strip and Comm open from the left as one
   * column (see the file header). Absent or null: portrait, as above.
   */
  side?: PhoneGameSide | null;
}

/** The open parts a layout leaves out for now (`PhoneGameInput.hide`). */
export interface PhoneGameHide {
  strip: boolean;
  comm: boolean;
}

/** The landscape column as the caller wants it. */
export interface PhoneGameSide {
  /** The stored width in columns; null: the default share (`SIDE_SHARE`). */
  cols: number | null;
  /** Columns from the right edge the column never reaches (the lens's least place, the hot keys, the compass). Default 0. */
  clearRight?: number;
  /** Columns of the column's right edge that are its resize band. Default 1. */
  band?: number;
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
  /** Portrait, `commKeep`: Comm ends below `maxTop` (the hot key columns' place is under it). */
  overLimit: boolean;
  /** The parts that are open but were left out of this layout (`hide`). */
  hidden: PhoneGameHide;
  /** The lens's rectangle of whole cells, or null (not wanted, or hidden). */
  lens: Rect | null;
  /** The lens's diameter in px inside `lens` (full, or shrunk to the room); 0 without a lens. */
  lensPx: number;
  /** The lens was wanted but has no room: its keys stay as a row (ADR 0136 §4). */
  lensHidden: boolean;
  /**
   * A lens the user moved or resized (round 53k): its circle's top left
   * corner in px, anywhere inside `lens` (the whole cells that hold it).
   * Null: the circle is centred in `lens` (the default place). Set by the
   * cockpit from the phone layer's answer, not by the allocator.
   */
  lensAt: { left: number; top: number } | null;
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

/**
 * The pane's rectangle inside its part `part` (the result's `strip` or
 * `comm`): the part without the resize band, which is its last row in
 * portrait and the column's last columns in landscape. Every other row and
 * column is the pane's (at least one of each).
 */
export function phonePaneRect(part: Rect, g: Pick<PhoneGameResult, 'landscape' | 'sideBand'>): Rect {
  if (g.landscape) return { ...part, w: Math.max(1, part.w - g.sideBand) };
  return { ...part, h: Math.max(1, part.h - BAND_ROWS) };
}

/** Lays out the phone's game screen (see the file header). */
export function allocatePhoneGame(input: PhoneGameInput): PhoneGameResult {
  // Parts hidden for now are laid out as closed ones; the result remembers which were open.
  const hidden: PhoneGameHide = {
    strip: input.strip === true && input.hide?.strip === true,
    comm: (input.comm ?? null) !== null && input.hide?.comm === true,
  };
  if (hidden.strip || hidden.comm) input = { ...input, strip: input.strip === true && !hidden.strip, comm: hidden.comm ? null : input.comm };
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
    overLimit: false,
    hidden,
    lens: null,
    lensPx: 0,
    lensHidden: false,
    lensAt: null,
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
/** Comm's least rows for this layout: the caller's px floor in rows (`commMin`), never under `COMM_MIN_ROWS`. */
function commMinOf(input: PhoneGameInput): number {
  return Math.max(COMM_MIN_ROWS, whole(input.commMin ?? COMM_MIN_ROWS, COMM_MIN_ROWS));
}

function layoutStack(input: PhoneGameInput, res: PhoneGameResult, rows: number, avail: number): number {
  const { cols } = res;
  let fightH = input.fight ? FIGHT_ROWS : 0;
  // The fight card gives way only when the text would all but vanish.
  if (avail - fightH < GAME_MIN_ROWS) fightH = 0;
  // What the strip and Comm may take together: the game keeps its rows, and they end at or above `maxTop`.
  const maxTop = input.maxTop === undefined ? Infinity : whole(input.maxTop, Infinity);

  // A stored height that is not a number (a damaged setting) is the default.
  const stripDflt = stripRows(rows);
  const storedStrip = input.stripRows ?? null;
  let stripWant = 0;
  if (input.strip) {
    // The default share on a low screen has no room for a pane: no strip. A stored height is at least the minimum.
    stripWant = storedStrip === null ? stripDflt : Math.max(STRIP_MIN_ROWS, whole(storedStrip, stripDflt));
    if (stripWant < STRIP_MIN_ROWS) stripWant = 0;
  }
  const comm = input.comm ?? null;
  const COMM_MIN = commMinOf(input);
  const commDflt = Math.round(rows * COMM_DEFAULT_SHARE);
  const commWant = comm ? Math.max(COMM_MIN, comm.rows === null ? commDflt : whole(comm.rows, commDflt)) : 0;
  /** The two heights within `budget` rows. */
  const fit = (budget: number): { stripH: number; commH: number } => {
    let stripH = stripWant;
    let commH = commWant;
    // More than the budget: Comm gives way first, then the strip, each down to its minimum;
    // then the strip closes, and last Comm.
    if (stripH + commH > budget) {
      if (commH > 0) commH = Math.max(COMM_MIN, budget - stripH);
      if (stripH > 0 && stripH + commH > budget) stripH = Math.max(STRIP_MIN_ROWS, budget - commH);
      if (stripH > 0 && stripH + commH > budget) {
        stripH = 0;
        commH = comm ? Math.max(COMM_MIN, Math.min(commWant, budget)) : 0;
      }
      if (commH > budget) commH = 0;
    }
    return { stripH, commH };
  };
  let budget = Math.min(avail - GAME_KEEP_ROWS, maxTop) - fightH;
  let { stripH, commH } = fit(budget);
  if (comm && commH === 0 && input.commKeep) {
    // Comm is typed in: it stays while anything else can give way (see the file header).
    const tries: Array<{ budget: number; fight: number }> = [
      { budget: avail - GAME_KEEP_ROWS - fightH, fight: fightH },
      { budget: avail - Math.min(GAME_KEEP_ROWS, GAME_MIN_ROWS) - fightH, fight: fightH },
      { budget: avail - Math.min(GAME_KEEP_ROWS, GAME_MIN_ROWS), fight: 0 },
    ];
    for (const t of tries) {
      const f = fit(t.budget);
      if (f.commH === 0) continue;
      ({ stripH, commH } = f);
      budget = t.budget;
      fightH = t.fight;
      res.overLimit = stripH + fightH + commH > maxTop;
      break;
    }
  }

  const top = stripH + fightH + commH;
  res.strip = { x: 0, y: 0, w: cols, h: stripH };
  // The fight card under the panes, whichever are open (round 53k).
  res.comm = { x: 0, y: stripH, w: cols, h: commH };
  res.fight = { x: 0, y: stripH + commH, w: cols, h: fightH };
  res.game = { x: 0, y: top, w: cols, h: avail - top };
  if (stripH > 0) res.stripRange = { min: STRIP_MIN_ROWS, max: budget - commH };
  if (commH > 0) res.commRange = { min: COMM_MIN, max: budget - stripH };
  return top;
}

/** Landscape: the strip and Comm as one column from the left (see the file header). Returns the game text's first row. */
function layoutSide(input: PhoneGameInput, side: PhoneGameSide, res: PhoneGameResult, rows: number, avail: number): number {
  const { cols } = res;
  res.landscape = true;
  const band = Math.max(1, whole(side.band ?? 1, 1));
  res.sideBand = band;
  // The rows: one of them has all, both share them; when both minimums do not fit the strip closes.
  let stripOn = input.strip === true;
  const commOn = (input.comm ?? null) !== null;
  const COMM_MIN = commMinOf(input);
  if (stripOn && commOn && rows < STRIP_MIN_ROWS + COMM_MIN) stripOn = false;
  let stripH = 0;
  let commH = 0;
  if (stripOn && commOn) {
    stripH = Math.max(STRIP_MIN_ROWS, Math.min(rows - COMM_MIN, Math.round(rows * SIDE_STRIP_SHARE)));
    commH = rows - stripH;
  } else if (stripOn) stripH = rows >= STRIP_MIN_ROWS ? rows : 0;
  else if (commOn) commH = rows >= COMM_MIN ? rows : 0;

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
