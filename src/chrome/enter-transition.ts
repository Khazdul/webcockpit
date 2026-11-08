// Enter MUME's transition (ADR 0125, addenda "Enter MUME transition"):
// the start page leaves over the cockpit in three phases.
//
//   leave  the wordmark, the menu panel, the quote and the notices fade
//          where they are; the almanac (bottom right) slides down out of
//          view. Only the sky is left;
//   zoom   the sky host scales up (a compositor transform: the canvases
//          are not repainted larger; the engine keeps drawing);
//   fade   the whole surface fades out over the cockpit, which is already
//          shown underneath, focused and connecting; a soft mask sweeps
//          up with it, so the game shows from the bottom first.
//
// The owner asked for an unhurried pace (2026-11-07): a quick leave, then
// a long zoom and a slow fade. `prefers-reduced-motion`: a plain short fade of
// the surface, nothing moves or zooms. Everything is Web Animations with
// `fill: 'forwards'`, cancelled by `cancel()` (the start page shows
// again: everything is as it was).

/** One phase's place on the transition's clock, ms. */
export interface Phase {
  delay: number;
  duration: number;
}

export interface EnterTiming {
  /** The wordmark, panel and quote fade; the almanac slides down. */
  leave: Phase | null;
  /** The sky zooms in. */
  zoom: Phase | null;
  /** The surface fades out over the cockpit. */
  fade: Phase;
  /** The end of the last phase. */
  total: number;
}

/** How far the sky zooms in. */
export const ENTER_ZOOM = 1.12;

/**
 * The fade's sweep: a vertical mask three times the surface's height,
 * opaque in its top third and clear in its bottom third with a ramp one
 * surface height tall between, so the sweep takes the whole fade. Sliding it from the top (0 %) to
 * the bottom (100 %) clears the surface from its bottom edge upwards.
 */
const SWEEP_MASK = 'linear-gradient(to bottom, #000 33.3%, transparent 66.7%)';
const sweepFrame = (pos: string): Keyframe => ({
  maskImage: SWEEP_MASK,
  maskSize: '100% 300%',
  maskRepeat: 'no-repeat',
  maskPosition: `0 ${pos}`,
});

const LEAVE: Phase = { delay: 0, duration: 600 };
/** The almanac's slide, a little longer than the fade. */
const SLIDE: Phase = { delay: 0, duration: 700 };
/** Most of the zoom happens in its first ~2.3 s; it eases on through the fade. */
const ZOOM: Phase = { delay: 450, duration: 5850 };
const FADE: Phase = { delay: 2300, duration: 4000 };
const STILL_FADE: Phase = { delay: 0, duration: 220 };

const end = (p: Phase): number => p.delay + p.duration;

/** The transition's phases, or only a short fade with `reduced` motion. */
export function enterTiming(reduced: boolean): EnterTiming {
  if (reduced) return { leave: null, zoom: null, fade: STILL_FADE, total: end(STILL_FADE) };
  return { leave: LEAVE, zoom: ZOOM, fade: FADE, total: Math.max(end(LEAVE), end(ZOOM), end(FADE)) };
}

export interface EnterRun {
  /** Resolves true when the fade is over, false when it was cancelled. */
  readonly finished: Promise<boolean>;
  /** Stops every animation and puts every element back as it was. */
  cancel(): void;
}

const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.55, 1)';
/** The sweep: a soft start, then an even climb to the top. */
const SWEEP_EASE = 'cubic-bezier(0.35, 0, 0.9, 0.9)';
/** The final fade's opacity: lingers, then goes. */
const FADE_EASE = 'cubic-bezier(0.5, 0, 0.7, 0.6)';
/** A slide that gathers speed and leaves. */
const EASE_IN = 'cubic-bezier(0.55, 0, 0.8, 0.35)';
/** The zoom: an even start, most of the travel early, a long soft tail. */
const ZOOM_EASE = 'cubic-bezier(0.35, 0, 0.25, 1)';

/**
 * Plays the transition on the start surface `surface` (`.wc-start`).
 * Elements that are not there (a sub-page on top, the wordmark hidden on
 * a short window) are skipped.
 */
export function playEnter(surface: HTMLElement, reduced: boolean): EnterRun {
  const t = enterTiming(reduced);
  const anims: Animation[] = [];
  const run = (el: Element | null, frames: Keyframe[], p: Phase, easing: string): void => {
    if (!el || typeof (el as HTMLElement).animate !== 'function') return;
    anims.push((el as HTMLElement).animate(frames, { delay: p.delay, duration: p.duration, easing, fill: 'forwards' }));
  };
  const all = (sel: string): Element[] => [...surface.querySelectorAll(sel)];

  if (t.leave) {
    const l = t.leave;
    const vh = surface.ownerDocument.defaultView?.innerHeight ?? 0;
    // The wordmark, the panel, the quote and the notices fade where they are.
    for (const el of all('.wc-start-brand, .wc-sm-panel, .wc-sm-quote, .wc-start-pills')) {
      run(el, [{ opacity: 1 }, { opacity: 0 }], l, EASE_IN_OUT);
    }
    // The almanac is pushed down, out under the bottom edge.
    for (const el of all('.wc-start-almanac')) {
      const top = el.getBoundingClientRect().top;
      const fall = `0 ${Math.ceil(Math.max(vh, top) - top + 48)}px`;
      run(el, [{ translate: '0 0' }, { translate: fall }], SLIDE, EASE_IN);
    }
  }
  if (t.zoom) {
    // Slightly above the middle: towards the panel and the horizon.
    run(
      surface.querySelector(':scope > .wc-start-skyhost'),
      [
        { transform: 'scale(1)', transformOrigin: '50% 45%' },
        { transform: `scale(${ENTER_ZOOM})`, transformOrigin: '50% 45%' },
      ],
      t.zoom,
      ZOOM_EASE,
    );
  }
  // The sweep (not with reduced motion): the bottom clears first and the
  // clear edge climbs, a soft ramp, never a line.
  if (!reduced) {
    anims.push(
      surface.animate([sweepFrame('0%'), sweepFrame('100%')], {
        delay: t.fade.delay,
        duration: t.fade.duration,
        easing: SWEEP_EASE,
        fill: 'forwards',
      }),
    );
  }
  // The opacity under it: slow at first, so the sweep leads and the top
  // of the sky lingers, then the whole surface thins away.
  const fade = surface.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: t.fade.delay,
    duration: t.fade.duration,
    easing: reduced ? 'ease-out' : FADE_EASE,
    fill: 'forwards',
  });
  anims.push(fade);
  const finished = fade.finished.then(
    () => true,
    () => false,
  );
  return {
    finished,
    cancel() {
      for (const a of anims) a.cancel();
      anims.length = 0;
    },
  };
}
