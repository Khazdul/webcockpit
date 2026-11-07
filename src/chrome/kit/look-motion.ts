// The lantern kit's motion (stage 42, ADR 0127): every timing of layout B
// "Rummet växer" in one place, and the one reduced-motion helper of the
// kit. Package 42a owns this file (the choreography runs in the start
// surface); 42-0 stubs it with the stage file's table.
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
    /** The wordmark lifts and fades, from 0. */
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
    /** The wordmark settles back. */
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
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
