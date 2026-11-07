// The lantern kit's motion (stage 42, ADR 0127): every timing of layout B
// "Rummet växer" in one place, the plan of a transition between two boxes
// (`morphPlan`, pure; the start surface runs it, src/chrome/start-morph.tsx)
// and the one reduced-motion helper of the kit. Package 42a owns this file.
//
// Timings are ms; easings are CSS / Web Animations strings. With reduced
// motion nothing grows, slides, lifts, clips or zooms: a cross-fade of at
// most 260 ms (the `reduced` entries).

import { useEffect, useState } from 'preact/hooks';

/** The choreography of layout B (stage 42 "Decisions": the table), and the box swap. */
export const MOTION = {
  open: {
    /** The menu items fade out. */
    items: { ms: 200 },
    /** The wordmark lifts and fades, from 0 (start.css: `.wc-start.is-large .wc-start-brand`). */
    wordmark: { ms: 620, lift: 46, easing: 'cubic-bezier(.5,0,.5,1)' },
    /** The quote and the almanac fade out. */
    scenery: { ms: 350 },
    /** The proxy grows from the panel's rect. */
    box: { delay: 200, ms: 780, easing: 'cubic-bezier(.55,0,.15,1)' },
    /** The hood stays 74 px wide until this fraction of the growth, then takes its width. */
    hood: { narrow: 74, until: 0.25 },
    /** The content fades in once the box has landed. */
    content: { ms: 320 },
  },
  close: {
    /** The content fades, then the proxy shrinks to the panel. */
    content: { ms: 240 },
    box: { ms: 680 },
    /** The hood is back to 74 px by this fraction of the shrink. */
    hood: { narrow: 74, by: 0.75 },
    /** The wordmark settles back (start.css: `.wc-start.is-from-large .wc-start-brand`). */
    wordmark: { delay: 320, ms: 700, easing: 'cubic-bezier(.3,.7,.3,1)' },
    /** The quote and the almanac fade in after the shrink. */
    scenery: { ms: 350 },
    /** The menu items fade in after the shrink. */
    items: { ms: 260 },
  },
  /** One large box to another: the box stays. */
  swap: { title: 200, out: 140, in: 220, resize: 380 },
  /** Normal → normal of another size: the height morphs, the content cross-fades. */
  resize: { ms: 380 },
  /** Reduced motion: fades only. */
  reduced: { open: 260, close: 240 },
  /** The stack's hold (42c): the frame below stays drawn on open, a popped frame while it fades. */
  hold: { open: 200, close: 240 },
} as const;

/** Whether the user asks for reduced motion (now). */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Whether the user asks for reduced motion, kept current. */
export function useReducedMotion(): boolean {
  const [on, setOn] = useState(reducedMotion);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const put = (): void => setOn(mq.matches);
    put();
    mq.addEventListener?.('change', put);
    return () => mq.removeEventListener?.('change', put);
  }, []);
  return on;
}

// ------------------------------------------------------------ the plan

/**
 * What a frame shows on the start surface, for the morph: `menu` the start
 * menu's panel (a box without Back), `normal` and `tall` a sub-page's
 * normal box, `large` a layout B box, `none` a look frame without a box,
 * `grid` an old-look frame (it covers the sky; nothing morphs to or from it).
 */
export type BoxKind = 'menu' | 'normal' | 'tall' | 'large' | 'none' | 'grid';

/** A rectangle in viewport CSS px (as `getBoundingClientRect`). */
export interface MorphRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One end of a transition: the old top frame's box (`from`) or the new one's (`to`). */
export interface MorphEnd {
  kind: BoxKind;
  /** The box's rectangle (null: none known). */
  rect: MorphRect | null;
  /** The hood plate's width in px (the plain plate is 74). */
  hood?: number;
  /**
   * `from` only: the box is drawn with its content showing now (the stack
   * holds it), so its content fades before the proxy takes over. False:
   * the old frame is already gone (no hold), or its content never showed.
   */
  shown?: boolean;
  /** `from` only: the rect is the proxy's, caught mid-flight (a reversal): the proxy moves on at once. */
  flying?: boolean;
}

/** The proxy's flight: an empty iron frame from `from` to `to`. */
export interface MorphFlight {
  from: MorphRect;
  to: MorphRect;
  /** ms from the start: the proxy shows (it stands at `from` until `at`). */
  show: number;
  /** ms from the start: it starts to move; it lands at `at + ms`. */
  at: number;
  ms: number;
  easing: string;
  /**
   * The hood's width: `open` keeps `from` until `until` of the move, then
   * takes `to`; `close` reaches `to` by `until` of the move.
   */
  hood: { from: number; to: number; until: number; mode: 'open' | 'close' };
}

/**
 * The transition between the old and the new top frame (all times in ms
 * from the frame change):
 *
 * - the old box's content (with `whole`, the whole box) fades out over
 *   `[0, out]`, then the old box hides; the old frame's own scenery
 *   (`.wc-lk-fades`, the start menu's quote) fades over `[0, sceneryOut]`;
 * - the proxy flies (`flight`, or none);
 * - the new box is hidden until `land`, then its content (with `whole`,
 *   the whole box) fades in over `in`, its own scenery over `sceneryIn`.
 *
 * `none`: nothing animates (the old frame goes at once, the new one shows
 * at once), as stage 41 built menu ↔ normal and as every old-look frame is.
 */
export interface MorphPlan {
  type: 'none' | 'open' | 'close' | 'swap' | 'fade';
  out: number;
  sceneryOut: number;
  flight: MorphFlight | null;
  land: number;
  in: number;
  sceneryIn: number;
  whole: boolean;
}

/** The plain hood plate's width (px). */
export const PLAIN_HOOD = 74;

const NONE: MorphPlan = { type: 'none', out: 0, sceneryOut: 0, flight: null, land: 0, in: 0, sceneryIn: 0, whole: false };

const boxed = (k: BoxKind): boolean => k === 'menu' || k === 'normal' || k === 'tall' || k === 'large';
const sameRect = (a: MorphRect, b: MorphRect): boolean =>
  Math.abs(a.left - b.left) < 1 &&
  Math.abs(a.top - b.top) < 1 &&
  Math.abs(a.width - b.width) < 1 &&
  Math.abs(a.height - b.height) < 1;

/** The total length of a plan (ms): until the last fade has ended. */
export function planLength(p: MorphPlan): number {
  return Math.max(p.out, p.sceneryOut, p.land + Math.max(p.in, p.sceneryIn), p.flight ? p.flight.at + p.flight.ms : 0);
}

/**
 * Plans the transition from the old top frame's box to the new one's (a
 * pure function of their kinds and rectangles; the start surface runs it).
 *
 * - menu or normal → large: `open` (the box grows out of the old one);
 *   large → menu or normal: `close` (it shrinks back);
 * - large → large and normal → normal: `swap` (the box stays; the content
 *   cross-fades, and a different rectangle morphs in `MOTION.swap.resize`);
 * - menu ↔ normal: `none` (stage 41: the wordmark's own move);
 * - anything with an old-look frame, a frame without a box or an unknown
 *   rectangle: `none`.
 *
 * With reduced motion nothing grows: `open` and `close` become `fade`
 * (the boxes fade as a whole, ≤ 260 ms) and `swap` keeps only its content
 * fades.
 */
export function morphPlan(from: MorphEnd | null, to: MorphEnd | null, reduced = false): MorphPlan {
  if (!from || !to || !boxed(from.kind) || !boxed(to.kind)) return NONE;
  const fk = from.kind;
  const tk = to.kind;
  const small = (k: BoxKind): boolean => k !== 'large';
  const flying = !!from.flying;
  const shown = !!from.shown && !flying;
  const fromHood = from.hood ?? PLAIN_HOOD;
  const toHood = to.hood ?? PLAIN_HOOD;
  let type: MorphPlan['type'];
  if (small(fk) && tk === 'large') type = 'open';
  else if (fk === 'large' && small(tk)) type = 'close';
  else if (fk === 'large' && tk === 'large') type = 'swap';
  else if ((fk === 'normal' || fk === 'tall') && (tk === 'normal' || tk === 'tall')) type = 'swap';
  else return NONE;

  if (reduced) {
    if (type === 'swap') {
      const out = shown ? MOTION.swap.out : 0;
      return { ...NONE, type, out, land: out, in: MOTION.swap.in };
    }
    if (type === 'open') {
      const ms = MOTION.reduced.open;
      return { ...NONE, type: 'fade', whole: true, out: shown ? ms : 0, sceneryOut: shown ? ms : 0, in: ms };
    }
    // close: the popped box fades away over the frame below, which shows at once
    return { ...NONE, type: 'fade', whole: true, out: shown ? MOTION.reduced.close : 0 };
  }

  if (type === 'swap') {
    const out = shown ? MOTION.swap.out : 0;
    const moves = !!from.rect && !!to.rect && !sameRect(from.rect, to.rect);
    if (!moves) return { ...NONE, type, out, land: out, in: MOTION.swap.in };
    const at = flying ? 0 : out;
    const ms = MOTION.swap.resize;
    return {
      ...NONE,
      type,
      out,
      flight: {
        from: from.rect!,
        to: to.rect!,
        show: at,
        at,
        ms,
        easing: MOTION.open.box.easing,
        hood: { from: fromHood, to: toHood, until: 0.5, mode: 'close' },
      },
      land: at + ms,
      in: MOTION.swap.in,
    };
  }

  if (!from.rect || !to.rect) return NONE;

  if (type === 'open') {
    const out = shown ? MOTION.open.items.ms : 0;
    const at = flying ? 0 : MOTION.open.box.delay;
    const ms = MOTION.open.box.ms;
    return {
      type,
      out,
      sceneryOut: shown ? MOTION.open.scenery.ms : 0,
      flight: {
        from: from.rect,
        to: to.rect,
        show: shown ? out : 0,
        at,
        ms,
        easing: MOTION.open.box.easing,
        hood: { from: fromHood, to: toHood, until: MOTION.open.hood.until, mode: 'open' },
      },
      land: at + ms,
      in: MOTION.open.content.ms,
      sceneryIn: MOTION.open.content.ms,
      whole: false,
    };
  }

  // close: the content fades, then the proxy shrinks; the menu's items and its quote come back after
  const out = shown ? MOTION.close.content.ms : 0;
  const at = flying ? 0 : out;
  const ms = MOTION.close.box.ms;
  return {
    type,
    out,
    sceneryOut: 0,
    flight: {
      from: from.rect,
      to: to.rect,
      show: at,
      at,
      ms,
      easing: MOTION.open.box.easing,
      hood: { from: fromHood, to: toHood, until: MOTION.close.hood.by, mode: 'close' },
    },
    land: at + ms,
    in: MOTION.close.items.ms,
    sceneryIn: MOTION.close.scenery.ms,
    whole: false,
  };
}

/**
 * The stack's hold (42c's `FrameStackProps.hold`) for a frame change away
 * from a top frame whose box is `from`: how long the frame below (a push)
 * or the popped frame (a pop) stays drawn. The longest any plan from that
 * box needs; the surface hides the frame sooner when its plan is shorter.
 */
export function morphHold(from: BoxKind, dir: 'push' | 'pop', reduced = false): number {
  if (!boxed(from)) return 0;
  if (reduced) return dir === 'push' ? MOTION.reduced.open : MOTION.reduced.close;
  if (dir === 'push') {
    if (from === 'menu') return MOTION.open.scenery.ms;
    if (from === 'large') return MOTION.close.content.ms;
    return MOTION.open.items.ms;
  }
  if (from === 'large') return MOTION.close.content.ms;
  if (from === 'menu') return 0;
  return MOTION.swap.out;
}
