// Where a lens the user moved or resized is shown (round 53k; ADR 0137's
// addendum of that round). Pure: no DOM, numbers in CSS px relative to the
// phone layer's top left corner.
//
// The user sets a WANTED place (the lens's centre, as shares of the
// screen's width and height) and a WANTED size by dragging; they are stored
// per orientation and never changed by anything else. What is SHOWN is
// derived from them and the room there is at every layout (`fitLens`):
//
// - The lens's box stays inside the room's rectangle: below what is above
//   the game text (the strip, Comm, the fight card), right of the landscape
//   column, above the command row (and so above our keyboard), inside the
//   screen's edges. A rectangle that moves in on it pushes it along.
// - Things that stand on the bottom edge (the compass, the hot key columns)
//   are blocks: over the columns of a block the lens's floor is the block's
//   top, so it is pushed up by one, never laid over it.
// - Where its size does not fit between the top and its floor, or between
//   the sides, it shrinks to the largest size that fits at its centre, down
//   to the least size; below that it is not shown (null: the caller hides
//   it and its keys stand as a row).
// - Pushed or shrunk, nothing is stored: when the room comes back, the same
//   wanted values give the old place and size again.
//
// A lens never moved or resized is not placed here: it keeps the rules of
// ADR 0137 §2 (the allocator, whole cells, top right). A wanted place with
// no wanted size has the full size of the screen, and a wanted size with no
// wanted place stands in the room's top right corner, as the default does.

import { KEY_GAP, PAD_MARGIN, compassHeight, hotTop, hotWidth, leftOfHot } from './compass-size';

/** A thing standing on the bottom edge: its columns, and its top (with the air the lens keeps to it). */
export interface LensBlock {
  left: number;
  right: number;
  top: number;
}

/** The room the lens's box may take, and the blocks in it. */
export interface LensRoom {
  left: number;
  top: number;
  right: number;
  bottom: number;
  blocks: readonly LensBlock[];
}

/** The lens's box on screen: its top left corner and its diameter. */
export interface LensSpot {
  left: number;
  top: number;
  size: number;
}

/** A wanted lens: its centre and diameter, px. */
export interface LensWant {
  cx: number;
  cy: number;
  size: number;
}

/** What is stored of one orientation (`phone.lens.portrait` / `.landscape`): the centre as shares of the screen, the diameter in px; null: not set. */
export interface LensStored {
  x: number | null;
  y: number | null;
  size: number | null;
}

/** True when the user has set a place or a size for this orientation. */
export function lensIsSet(s: LensStored): boolean {
  return (s.x !== null && s.y !== null) || s.size !== null;
}

/**
 * The wanted lens on a screen `W` × `H` px: the stored size, or `full`; the
 * stored centre, or the room's top right corner at that size.
 */
export function lensWant(s: LensStored, full: number, room: LensRoom, W: number, H: number): LensWant {
  const size = s.size ?? full;
  if (s.x !== null && s.y !== null) return { cx: s.x * W, cy: s.y * H, size };
  return { cx: room.right - size / 2, cy: room.top + size / 2, size };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The floor of a box from `left`, `size` px wide: the room's bottom, or the top of the highest block under its columns. */
function floorAt(room: LensRoom, left: number, size: number): number {
  let floor = room.bottom;
  for (const b of room.blocks) if (b.left < left + size && b.right > left) floor = Math.min(floor, b.top);
  return floor;
}

/**
 * The lens as shown for `want` in `room`: clamped into the room, pushed up
 * by a block under it, or shrunk: the largest size up to the wanted one
 * that fits at the wanted centre (as near to it as the room's sides put the
 * box). Never under `min`: null when not even `min` fits there. Whole px.
 *
 * A smaller box at the same centre lies inside a larger one, so it stands
 * over no block the larger one did not: what fits is every size up to a
 * limit, and the limit is found by halving (some eight rounds on a phone).
 * It is not simply the height under the wanted width: a narrower box may no
 * longer reach over a block, and then has more height than that.
 */
export function fitLens(want: LensWant, room: LensRoom, min: number): LensSpot | null {
  const at = (size: number): LensSpot | null => {
    const left = Math.round(clamp(want.cx - size / 2, room.left, room.right - size));
    const floor = floorAt(room, left, size);
    if (Math.floor(floor - room.top) < size) return null;
    return { left, top: Math.round(clamp(want.cy - size / 2, room.top, floor - size)), size };
  };
  let hi = Math.min(Math.round(want.size), Math.floor(room.right - room.left));
  let lo = Math.ceil(min);
  if (hi < lo) return hi >= min ? at(hi) : null;
  const whole = at(hi);
  if (whole) return whole;
  let best = at(lo);
  // From here `lo` fits and `hi` does not.
  while (best && hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const spot = at(mid);
    if (spot) {
      lo = mid;
      best = spot;
    } else hi = mid;
  }
  return best;
}

/** The largest diameter the room holds at all (its rectangle; blocks only shorten it where the lens stands over them). */
export function lensMax(room: LensRoom): number {
  return Math.max(0, Math.floor(Math.min(room.right - room.left, room.bottom - room.top)));
}

/**
 * A move's box: `spot` carried `dx`, `dy` px by the finger, kept inside the
 * room's rectangle. (Blocks are not asked while the finger is down: the
 * layout after the drop pushes the lens off one.)
 */
export function moveLens(spot: LensSpot, dx: number, dy: number, room: LensRoom): LensSpot {
  return {
    left: Math.round(clamp(spot.left + dx, room.left, Math.max(room.left, room.right - spot.size))),
    top: Math.round(clamp(spot.top + dy, room.top, Math.max(room.top, room.bottom - spot.size))),
    size: spot.size,
  };
}

/**
 * A resize's diameter: the finger went down `d0` px from the lens's centre
 * and is now `d` px from it. Away from the centre grows the lens, towards
 * it shrinks it, the rim moving as far as the finger did (so twice that in
 * diameter). Within `min` and `max`.
 */
export function resizeLens(size: number, d0: number, d: number, min: number, max: number): number {
  return Math.round(clamp(size + 2 * (d - d0), min, Math.max(min, max)));
}

/** The air the lens's box keeps: to the screen's sides and the command row (its corner keys overhang by 10 px), to what is above, to a block. */
export const LENS_AIR = 12;
export const LENS_AIR_TOP = 16;
export const LENS_AIR_TOP_LAND = 12;
export const LENS_AIR_SIDE_LAND = 20;
export const LENS_AIR_HOT = 16;

/** What `lensRoom` needs to know of the screen, px. */
export interface LensRoomInput {
  W: number;
  H: number;
  landscape: boolean;
  /** The game text's top edge and left edge (under the fight card; right of the landscape column). */
  gameTop: number;
  gameLeft: number;
  /** The command row's top edge. */
  inputTop: number;
  /** What a keyboard of our own takes from the bottom edge (0: closed). */
  lift: number;
  /** A key's side. */
  keyPx: number;
  /** The hot key columns there are, and the keys in the taller one while the columns show (0: hidden). */
  hotCols: number;
  hotRows: number;
  /** Portrait with our keyboard open: whether the compass and the columns have room above it. */
  pad: boolean;
  k: boolean;
  /** What an open hot key box takes from the bottom edge (0: closed). */
  boxClear: number;
}

/**
 * The room of a moved or resized lens on this screen (see the file header).
 * Portrait: the compass and the shown hot key columns are blocks, standing
 * on the keyboard's top edge while ours is open. Landscape: the room ends
 * left of the hot key columns, shown or not (as the default lens does), the
 * compass is a block, and with our keyboard open the keys are in its band,
 * so nothing stands in the room.
 */
export function lensRoom(i: LensRoomInput): LensRoom {
  const padW = 3 * i.keyPx + 2 * KEY_GAP;
  let bottom = i.inputTop - LENS_AIR;
  if (i.boxClear > 0) bottom = Math.min(bottom, i.H - i.boxClear);
  const blocks: LensBlock[] = [];
  if (i.landscape) {
    if (i.lift === 0) blocks.push({ left: i.W - PAD_MARGIN - padW - LENS_AIR, right: i.W, top: i.H - compassHeight(i.keyPx) - LENS_AIR });
    return {
      left: i.gameLeft + (i.gameLeft > 0 ? LENS_AIR_SIDE_LAND : LENS_AIR),
      top: i.gameTop + LENS_AIR_TOP_LAND,
      right: i.W - leftOfHot(i.keyPx, i.hotCols, LENS_AIR),
      bottom,
      blocks,
    };
  }
  const base = i.H - i.lift;
  if (i.lift === 0 || i.pad) blocks.push({ left: i.W - PAD_MARGIN - padW - LENS_AIR, right: i.W, top: base - compassHeight(i.keyPx) - LENS_AIR });
  if (i.hotRows > 0 && (i.lift === 0 || i.k)) {
    blocks.push({ left: i.W - PAD_MARGIN - hotWidth(i.keyPx, i.hotCols) - LENS_AIR, right: i.W, top: base - hotTop(i.keyPx, i.hotRows) - LENS_AIR_HOT });
  }
  return { left: LENS_AIR, top: i.gameTop + LENS_AIR_TOP, right: i.W - LENS_AIR, bottom, blocks };
}
