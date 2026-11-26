// Map tokens (stage 80 §7, ADR 0171): where the player and the group
// members' round tokens go and how large they are, in the look of the
// mockup (notes/research/token-mockups/round2.html, ring R3). Pure: the
// renderer (webgl.ts) turns the quads into one instanced draw, the
// fragment shader (shaders.ts TOKEN_FS) makes the disc, ring, outline and
// arc.
//
// - A token: the picture in a disc of diameter `d` (CSS px), the ring
//   (1 px, the hue muted 25 % toward grey) on it, a 1 px dark outline
//   outside the ring, and with the HP arc on, room for the arc outside
//   (0.5 px gap, the arc `aw` = max(1, 3.5 % of d) px, 0.5 px). The arc is
//   drawn only below full HP and not when the HP is unknown.
// - Sizes (`fitD`): the token, ring and arc room included, fills a box of
//   0.8 room alone (the spec; the mockup's 0.84); in the fan yours fills
//   0.7 room at 37 % from the room's top, the others 0.38 room along the
//   lower edge at 78 %, a step of at most 1.05 d apart, at most three, then
//   a `+n` disc (diameter d + 2, the count's glyphs over it).
// - Order in a room (decision 8): you first when you are there (located),
//   else the first member; the others in group order. Drawn back to front:
//   the `+n` disc, the small ones last to first, the whole one on top.

import type { TokenFace } from '../protocol';

/** Least CSS px a room for tokens: below it, today's boxes (spec §7). */
export const TOKEN_MIN_PX = 20;
/** The box a token alone fills, in rooms. */
export const TOKEN_ROOM = 0.8;
/** The ring's width and the outline's, CSS px (R3, decision 16). */
export const RING_PX = 1;
export const OUTLINE_PX = 1;
/** The fan (the mockup's numbers): the whole one's box and centre, the small ones' box and row, in rooms from the top. */
export const FAN_BIG = 0.7;
export const FAN_BIG_Y = 0.37;
export const FAN_SMALL = 0.38;
export const FAN_SMALL_Y = 0.78;
/** Small tokens shown before the `+n` disc. */
export const FAN_SHOWN = 3;
/** The `+n` disc's glyphs are drawn from this picture diameter (CSS px). */
export const PLUS_GLYPHS_FROM = 9;

/** The HP arc's width for a picture of diameter `d` (CSS px). */
export const arcWidth = (d: number): number => Math.max(1, d * 0.035);

/** How far a token of picture diameter `d` reaches from its centre (CSS px), the arc's room included when `arc`. */
export function tokenReach(d: number, arc: boolean): number {
  return d / 2 + RING_PX + 0.5 + (arc ? 0.5 + arcWidth(d) + 0.5 : 0);
}

/** The picture diameter of a token that fills a box of `box` CSS px (the mockup's `fitD`), at least 1. */
export function fitD(box: number, arc: boolean): number {
  let d = box;
  for (let i = 0; i < 6; i++) d *= box / (2 * tokenReach(d, arc));
  return Math.max(1, d);
}

/** One token (or `+n` disc) to draw: what the renderer packs into an instance. */
export interface TokenQuad {
  /** The centre, world units (the room's layer z). */
  x: number;
  y: number;
  z: number;
  /** The picture's radius, CSS px. */
  r: number;
  /** The picture (null: the disc and the ring only); for a `+n` disc, null. */
  face: TokenFace | null;
  /** The ring's colour, 0xRRGGBB (already muted). */
  ring: number;
  /** The HP fraction for the arc, or -1: no arc. */
  hp: number;
  /** The arc's colour, 0xRRGGBB. */
  arc: number;
  /** The arc's width, CSS px. */
  aw: number;
  /** A `+n` disc: n (0: a token). */
  plus: number;
}

/** A character in a room, in the room's order. */
export interface RoomToken {
  face: TokenFace | null;
  ring: number;
  hp: number;
  arc: number;
}

/**
 * The tokens of one room at (x, y, z) with `s` CSS px a room, appended to
 * `out` back to front. `list[0]` is the whole one.
 */
export function layoutRoom(out: TokenQuad[], list: readonly RoomToken[], x: number, y: number, z: number, s: number, arc: boolean): void {
  const n = list.length;
  if (n === 0) return;
  const quad = (t: RoomToken, cx: number, cy: number, d: number): TokenQuad => ({
    x: cx,
    y: cy,
    z,
    r: d / 2,
    face: t.face,
    ring: t.ring,
    hp: arc ? t.hp : -1,
    arc: t.arc,
    aw: arcWidth(d),
    plus: 0,
  });
  if (n === 1) {
    out.push(quad(list[0]!, x + 0.5, y + 0.5, fitD(s * TOKEN_ROOM, arc)));
    return;
  }
  const rest = n - 1;
  const shown = Math.min(FAN_SHOWN, rest);
  const more = rest - shown;
  const slots = shown + (more > 0 ? 1 : 0);
  const d1 = fitD(s * FAN_SMALL, arc);
  const step = Math.min(d1 * 1.05, (s * 0.98 - s * FAN_SMALL) / Math.max(1, slots - 1)) / s;
  const x0 = x + 0.5 - (step * (slots - 1)) / 2;
  const yy = y + 1 - FAN_SMALL_Y;
  if (more > 0) {
    out.push({ x: x0 + shown * step, y: yy, z, r: d1 / 2, face: null, ring: 0, hp: -1, arc: 0, aw: 0, plus: more });
  }
  for (let i = shown - 1; i >= 0; i--) out.push(quad(list[1 + i]!, x0 + i * step, yy, d1));
  out.push(quad(list[0]!, x + 0.5, y + 1 - FAN_BIG_Y, fitD(s * FAN_BIG, arc)));
}
