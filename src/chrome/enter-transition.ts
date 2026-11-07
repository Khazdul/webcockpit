// Enter MUME's transition (ADR 0125, addenda "Enter MUME transition"):
// the start page leaves over the cockpit in three phases.
//
//   leave  the wordmark, the menu panel and the quote scroll up out of
//          view together; the almanac (bottom right) slides down out of
//          view; the notices fade. Only the sky is left;
//   zoom   the sky host scales up (a compositor transform: the canvases
//          are not repainted larger; the engine keeps drawing);
//   fade   the whole surface fades out over the cockpit, which is already
//          shown underneath, focused and connecting.
//
// The owner asked for an unhurried pace (2026-11-07): the zoom and the
// fade take 1-2 s each. `prefers-reduced-motion`: a plain short fade of
// the surface, nothing moves or zooms. Everything is Web Animations with
// `fill: 'forwards'`, cancelled by `cancel()` (the start page shows
// again: everything is as it was).

/** One phase's place on the transition's clock, ms. */
export interface Phase {
  delay: number;
  duration: number;
}

export interface EnterTiming {
  /** The wordmark, panel and quote scroll up; the almanac slides down. */
  leave: Phase | null;
  /** The sky zooms in. */
  zoom: Phase | null;
  /** The surface fades out over the cockpit. */
  fade: Phase;
  /** The end of the last phase. */
  total: number;
}

/** How far the sky zooms in. */
export const ENTER_ZOOM = 1.1;

const LEAVE: Phase = { delay: 0, duration: 900 };
/** Most of the zoom happens in its first ~1.8 s; it eases on through the fade. */
const ZOOM: Phase = { delay: 700, duration: 3000 };
const FADE: Phase = { delay: 2200, duration: 1500 };
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
/** A scroll that gathers speed and leaves. */
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
    // Up and away as one block: far enough that the lowest of them (the
    // quote) clears the top edge.
    const up = all('.wc-start-brand, .wc-sm-panel, .wc-sm-quote');
    const bottom = Math.max(0, ...up.map((el) => el.getBoundingClientRect().bottom));
    const rise = `0 ${-Math.ceil(bottom + 48)}px`;
    for (const el of up) run(el, [{ translate: '0 0' }, { translate: rise }], l, EASE_IN);
    // The almanac goes the other way, out under the bottom edge.
    for (const el of all('.wc-start-almanac')) {
      const top = el.getBoundingClientRect().top;
      const fall = `0 ${Math.ceil(Math.max(vh, top) - top + 48)}px`;
      run(el, [{ translate: '0 0' }, { translate: fall }], l, EASE_IN);
    }
    for (const el of all('.wc-start-pills')) {
      run(el, [{ opacity: 1 }, { opacity: 0 }], { delay: l.delay, duration: Math.round(l.duration / 2) }, 'linear');
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
  const fade = surface.animate([{ opacity: 1 }, { opacity: 0 }], {
    delay: t.fade.delay,
    duration: t.fade.duration,
    easing: reduced ? 'ease-out' : EASE_IN_OUT,
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
