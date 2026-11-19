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
  /**
   * One box to another of its own kind (large → large, normal → normal), and
   * the menu's panel to a normal box and back (stage 74): the content fades
   * out, a different rectangle flies in `resize`, the content fades in.
   * (start.css: the wordmark's move between the menu's place and a
   * sub-page's takes `resize` too, on the flight's clock.)
   */
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
 * at once), as every old-look frame is.
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
 * - menu ↔ normal (stage 74; `none` until then, the page changed at once):
 *   a `swap` too, on the same clock (the size change is small). The
 *   menu's items and its quote fade with the content, and the hood keeps
 *   to the menu's plain plate near the panel as in `open` and `close`. The
 *   wordmark moves to its other place during the flight (start.css);
 * - anything with an old-look frame, a frame without a box or an unknown
 *   rectangle: `none`.
 *
 * With reduced motion nothing grows: `open` and `close` become `fade`
 * (the boxes fade as a whole, ≤ 260 ms), menu ↔ normal too (two boxes in
 * two places), and a `swap` between boxes of one kind keeps only its
 * content fades.
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
  const sub = (k: BoxKind): boolean => k === 'normal' || k === 'tall';
  // The menu's panel to a sub-page's box (`enter`) or back (`leave`): a swap with the menu's scenery.
  const enter = fk === 'menu' && sub(tk);
  const leave = sub(fk) && tk === 'menu';
  let type: MorphPlan['type'];
  if (small(fk) && tk === 'large') type = 'open';
  else if (fk === 'large' && small(tk)) type = 'close';
  else if (fk === 'large' && tk === 'large') type = 'swap';
  else if ((sub(fk) && sub(tk)) || enter || leave) type = 'swap';
  else return NONE;

  if (reduced) {
    if (type === 'swap' && !enter && !leave) {
      const out = shown ? MOTION.swap.out : 0;
      return { ...NONE, type, out, land: out, in: MOTION.swap.in };
    }
    if (type === 'open' || enter) {
      const ms = MOTION.reduced.open;
      return { ...NONE, type: 'fade', whole: true, out: shown ? ms : 0, sceneryOut: shown ? ms : 0, in: ms };
    }
    // close: the popped box fades away over the frame below, which shows at once
    return { ...NONE, type: 'fade', whole: true, out: shown ? MOTION.reduced.close : 0 };
  }

  if (type === 'swap') {
    const out = shown ? MOTION.swap.out : 0;
    // The menu's quote goes with its items, and comes back with them.
    const scenery = { sceneryOut: enter ? out : 0, sceneryIn: leave ? MOTION.swap.in : 0 };
    const moves = !!from.rect && !!to.rect && !sameRect(from.rect, to.rect);
    if (!moves) return { ...NONE, type, out, ...scenery, land: out, in: MOTION.swap.in };
    const at = flying ? 0 : out;
    const ms = MOTION.swap.resize;
    // The hood: from the menu's plain plate as `open` widens it, back to it as `close` narrows it.
    const hood = enter
      ? { until: MOTION.open.hood.until, mode: 'open' as const }
      : leave
        ? { until: MOTION.close.hood.by, mode: 'close' as const }
        : { until: 0.5, mode: 'close' as const };
    return {
      ...NONE,
      type,
      out,
      ...scenery,
      flight: {
        from: from.rect!,
        to: to.rect!,
        show: at,
        at,
        ms,
        easing: MOTION.open.box.easing,
        hood: { from: fromHood, to: toHood, ...hood },
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
  // A pop from a normal or tall box can land on a large box below it (an
  // `open`: its content fades for `open.items` before the proxy shows) or
  // on a normal one or the menu (a `swap`, shorter): hold for the longer.
  // A push from the menu is an `open` (its quote fades for `open.scenery`)
  // or a `swap` to a normal box (shorter).
  if (reduced) return dir === 'push' || from !== 'large' ? MOTION.reduced.open : MOTION.reduced.close;
  if (dir === 'push') {
    if (from === 'menu') return MOTION.open.scenery.ms;
    if (from === 'large') return MOTION.close.content.ms;
    return MOTION.open.items.ms;
  }
  if (from === 'large') return MOTION.close.content.ms;
  if (from === 'menu') return 0;
  return Math.max(MOTION.open.items.ms, MOTION.swap.out);
}

// ------------------------------------------------------------ the proxy's pieces

/**
 * The proxy is drawn in pieces that only ever take a transform or an
 * opacity (stage 74, ADR 0164), so its flight runs on the compositor:
 * nothing is laid out, painted or rastered again per frame, and work on
 * the main thread (the new page's mount, a first-use cost) cannot hold it
 * back.
 *
 * - The pane (`pane`: the iron and the window glass with its glow and
 *   inner shadow) is drawn once, at the larger of the flight's two sizes,
 *   and scaled to the rectangle: at the large end it is exactly the box;
 *   smaller, its soft parts shrink with it.
 * - The box's outer shadows, which a small box over the sky shows most,
 *   are drawn twice, once at each end's size, and scaled to the
 *   rectangle: `shadowFrom` fades out as `shadowTo` fades in, so at each
 *   end they are exactly that box's.
 * - The four edges (`top`, `bottom`, `left`, `right`: the border, the iron
 *   band and the window's own border, `PROXY_EDGE` px thick) are drawn at
 *   the larger size and scaled along their length only, so every line
 *   keeps its width; the side edges run between the top and the bottom
 *   one.
 * - The four corners (`tl`, `tr`, `bl`, `br`: the brackets, `PROXY_CORNER`
 *   px square) and the hood's holder (`hood`: the box's top centre) are
 *   only moved.
 *
 * Every transform is `translate(…) scale(…)` from the viewport's origin
 * (`transform-origin: 0 0`), so each piece's edges are linear in the
 * easing's progress: the same geometry the animated `left`, `top`,
 * `width` and `height` had.
 */
export type ProxyPiece =
  | 'shadowFrom'
  | 'shadowTo'
  | 'pane'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 'hood';

export const PROXY_PIECES: readonly ProxyPiece[] = ['shadowFrom', 'shadowTo', 'pane', 'top', 'bottom', 'left', 'right', 'tl', 'tr', 'bl', 'br', 'hood'];

/** An edge piece's thickness (px): the border, the 7 px of iron, the window's border and its lit line. */
export const PROXY_EDGE = 10;
/** A corner piece's side (px): the bracket's. */
export const PROXY_CORNER = 24;

/** A drawn size (px). */
export interface ProxySize {
  width: number;
  height: number;
}

export interface ProxyFlight {
  /** The size each end's shadows are drawn at: that end's own. */
  fromSize: ProxySize;
  toSize: ProxySize;
  /** The size the pane and the edges are drawn at: the larger of the two ends on each axis. */
  maxSize: ProxySize;
  /** Each piece's transform at the flight's start and at its landing. */
  from: Record<ProxyPiece, string>;
  to: Record<ProxyPiece, string>;
  /** The pieces that fade over the flight: their opacity at its start and at its landing. */
  fade: Partial<Record<ProxyPiece, readonly [number, number]>>;
}

/** `r` with its edges on whole device pixels, as layout paints a box (so the proxy's lines are as sharp as the box's). */
export function snapRect(r: MorphRect, dpr = 1): MorphRect {
  const d = dpr > 0 ? dpr : 1;
  const snap = (v: number): number => Math.round(v * d) / d;
  const left = snap(r.left);
  const top = snap(r.top);
  return { left, top, width: Math.max(0, snap(r.left + r.width) - left), height: Math.max(0, snap(r.top + r.height) - top) };
}

const num = (v: number): string => String(Math.round(v * 10000) / 10000);

/** The pieces' transforms when the proxy stands at `r`, for a flight between boxes of `from` and `to` size. */
export function proxyAt(r: MorphRect, from: ProxySize, to: ProxySize): Record<ProxyPiece, string> {
  const at = (x: number, y: number, kx = 1, ky = 1): string => `translate(${num(x)}px, ${num(y)}px) scale(${num(kx)}, ${num(ky)})`;
  const box = (s: ProxySize): string => at(r.left, r.top, s.width > 0 ? r.width / s.width : 1, s.height > 0 ? r.height / s.height : 1);
  const w = Math.max(from.width, to.width);
  const h = Math.max(from.height, to.height);
  const sx = w > 0 ? r.width / w : 1;
  // The side edges run between the top and the bottom one (no edge lies over another).
  const se = h > 2 * PROXY_EDGE ? Math.max(0, r.height - 2 * PROXY_EDGE) / (h - 2 * PROXY_EDGE) : 1;
  const right = r.left + r.width;
  const bottom = r.top + r.height;
  return {
    shadowFrom: box(from),
    shadowTo: box(to),
    pane: box({ width: w, height: h }),
    top: at(r.left, r.top, sx, 1),
    bottom: at(r.left, bottom - PROXY_EDGE, sx, 1),
    left: at(r.left, r.top + PROXY_EDGE, 1, se),
    right: at(right - PROXY_EDGE, r.top + PROXY_EDGE, 1, se),
    tl: at(r.left, r.top),
    tr: at(right - PROXY_CORNER, r.top),
    bl: at(r.left, bottom - PROXY_CORNER),
    br: at(right - PROXY_CORNER, bottom - PROXY_CORNER),
    hood: at(r.left + r.width / 2, r.top),
  };
}

/** The proxy's pieces for a flight from `from` to `to` (pure). */
export function proxyFlight(from: MorphRect, to: MorphRect): ProxyFlight {
  const fromSize = { width: from.width, height: from.height };
  const toSize = { width: to.width, height: to.height };
  return {
    fromSize,
    toSize,
    maxSize: { width: Math.max(from.width, to.width), height: Math.max(from.height, to.height) },
    from: proxyAt(from, fromSize, toSize),
    to: proxyAt(to, fromSize, toSize),
    fade: { shadowFrom: [1, 0], shadowTo: [0, 1] },
  };
}
