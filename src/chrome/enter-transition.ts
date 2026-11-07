// Enter MUME's transition (ADR 0125, addendum "Enter MUME transition"):
// the start page leaves over the cockpit in three overlapping phases.
//
//   fold   the menu panel folds up into its hood while the wordmark, the
//          quote, the almanac and the notices fade, until only the sky is
//          left;
//   zoom   the sky host scales up a little (a compositor transform: the
//          canvases are not repainted larger; the engine keeps drawing);
//   fade   the whole surface fades out over the cockpit, which is already
//          shown underneath, focused and connecting.
//
// `prefers-reduced-motion`: a plain short fade of the surface, nothing
// folds or zooms. Everything is Web Animations with `fill: 'forwards'`,
// cancelled by `cancel()` (the start page shows again: everything is as
// it was).

/** One phase's place on the transition's clock, ms. */
export interface Phase {
  delay: number;
  duration: number;
}

export interface EnterTiming {
  /** The panel folds; the wordmark, quote, almanac and notices fade. */
  fold: Phase | null;
  /** The sky zooms in. */
  zoom: Phase | null;
  /** The surface fades out over the cockpit. */
  fade: Phase;
  /** The end of the last phase. */
  total: number;
}

/** How far the sky zooms in. */
export const ENTER_ZOOM = 1.07;

const FOLD: Phase = { delay: 0, duration: 380 };
const ZOOM: Phase = { delay: 220, duration: 1280 };
const FADE: Phase = { delay: 660, duration: 840 };
const STILL_FADE: Phase = { delay: 0, duration: 220 };

const end = (p: Phase): number => p.delay + p.duration;

/** The transition's phases, or only a short fade with `reduced` motion. */
export function enterTiming(reduced: boolean): EnterTiming {
  if (reduced) return { fold: null, zoom: null, fade: STILL_FADE, total: end(STILL_FADE) };
  return { fold: FOLD, zoom: ZOOM, fade: FADE, total: Math.max(end(FOLD), end(ZOOM), end(FADE)) };
}

export interface EnterRun {
  /** Resolves true when the fade is over, false when it was cancelled. */
  readonly finished: Promise<boolean>;
  /** Stops every animation and puts every element back as it was. */
  cancel(): void;
}

const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.55, 1)';

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

  if (t.fold) {
    const f = t.fold;
    // The panel folds up into its hood: the window's rows go first, then
    // the iron box closes to a strip under the hood and fades.
    for (const el of all('.wc-sm-panel')) {
      run(
        el,
        [
          { transform: 'none', opacity: 1, transformOrigin: '50% 0' },
          { transform: 'scale(1, 0.06)', opacity: 1, offset: 0.62, transformOrigin: '50% 0' },
          { transform: 'scale(0.82, 0.03)', opacity: 0, transformOrigin: '50% 0' },
        ],
        f,
        EASE_IN_OUT,
      );
    }
    for (const el of all('.wc-sm-panel .wc-lk-win')) {
      run(el, [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 0 }], f, 'ease-in');
    }
    const fadeOut = { delay: f.delay, duration: Math.round(f.duration * 0.85) };
    for (const el of all('.wc-start-brand')) {
      run(el, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -10px' }], fadeOut, 'linear');
    }
    for (const el of all('.wc-sm-quote')) {
      run(el, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 10px' }], fadeOut, 'linear');
    }
    for (const el of all('.wc-start-almanac, .wc-start-pills')) {
      run(el, [{ opacity: 1 }, { opacity: 0 }], fadeOut, 'linear');
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
      EASE_IN_OUT,
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
