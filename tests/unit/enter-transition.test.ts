// @vitest-environment happy-dom
// Enter MUME's transition (ADR 0125, addendum): its timing and what it animates.

import { describe, expect, it } from 'vitest';
import { ENTER_ZOOM, enterTiming, playEnter } from '../../src/chrome/enter-transition';

describe('enterTiming', () => {
  it('folds, then zooms, then fades, overlapping, in 1.5 to 2 s', () => {
    const t = enterTiming(false);
    expect(t.fold && t.zoom).toBeTruthy();
    const fold = t.fold!;
    const zoom = t.zoom!;
    expect(fold.delay).toBe(0);
    expect(fold.duration).toBeGreaterThanOrEqual(300);
    expect(fold.duration).toBeLessThanOrEqual(400);
    // The zoom starts before the fold is over; the fade once only the sky is left.
    expect(zoom.delay).toBeLessThan(fold.duration);
    expect(t.fade.delay).toBeGreaterThanOrEqual(fold.delay + fold.duration);
    // A slower fade than the fold.
    expect(t.fade.duration).toBeGreaterThanOrEqual(600);
    expect(t.fade.duration).toBeLessThanOrEqual(900);
    expect(t.total).toBe(t.fade.delay + t.fade.duration);
    expect(t.total).toBeGreaterThanOrEqual(1500);
    expect(t.total).toBeLessThanOrEqual(2000);
    expect(ENTER_ZOOM).toBeGreaterThanOrEqual(1.04);
    expect(ENTER_ZOOM).toBeLessThanOrEqual(1.08);
  });

  it('with reduced motion: a short fade, nothing folds or zooms', () => {
    const t = enterTiming(true);
    expect(t.fold).toBeNull();
    expect(t.zoom).toBeNull();
    expect(t.fade.delay).toBe(0);
    expect(t.total).toBeLessThanOrEqual(300);
  });
});

interface Played {
  el: Element;
  frames: Keyframe[];
  opts: KeyframeAnimationOptions;
  cancelled: boolean;
  finish: () => void;
  abort: () => void;
}

/** A start surface whose elements record their animations. */
function surface(): { el: HTMLElement; played: Played[] } {
  const el = document.createElement('div');
  el.className = 'wc-start';
  el.innerHTML = `
    <div class="wc-start-skyhost"></div>
    <div class="wc-start-scenery"><div class="wc-start-brand"></div><aside class="wc-start-almanac"></aside></div>
    <div class="wc-stack"><div class="wc-frame"><div class="wc-sm-stage">
      <section class="wc-lk-box wc-sm-panel"><div class="wc-lk-win wc-sm-win"></div></section>
      <blockquote class="wc-sm-quote"></blockquote>
    </div></div></div>`;
  const played: Played[] = [];
  for (const e of [el, ...el.querySelectorAll('*')]) {
    (e as HTMLElement).animate = ((frames: Keyframe[], opts: KeyframeAnimationOptions) => {
      let finish!: () => void;
      let abort!: () => void;
      const finished = new Promise<void>((res, rej) => {
        finish = res;
        abort = () => rej(new DOMException('cancelled', 'AbortError'));
      });
      // As the browser does: a cancelled animation's finished promise is marked handled.
      finished.catch(() => undefined);
      const p: Played = { el: e, frames, opts, cancelled: false, finish, abort };
      played.push(p);
      return {
        finished,
        cancel: () => {
          p.cancelled = true;
          abort();
        },
      } as unknown as Animation;
    }) as HTMLElement['animate'];
  }
  return { el, played };
}

const on = (played: Played[], cls: string): Played[] => played.filter((p) => p.el.classList.contains(cls));

describe('playEnter', () => {
  it('folds the panel, fades the scenery, zooms the sky and fades the surface last', async () => {
    const { el, played } = surface();
    const run = playEnter(el, false);
    const t = enterTiming(false);
    expect(on(played, 'wc-sm-panel')).toHaveLength(1);
    expect(on(played, 'wc-sm-win')).toHaveLength(1);
    for (const c of ['wc-start-brand', 'wc-sm-quote', 'wc-start-almanac']) {
      const [a] = on(played, c);
      expect(a?.frames.at(-1)?.opacity).toBe(0);
      expect(a?.opts.fill).toBe('forwards');
    }
    const [zoom] = on(played, 'wc-start-skyhost');
    expect(zoom?.frames.at(-1)?.transform).toBe(`scale(${ENTER_ZOOM})`);
    expect(zoom?.opts.delay).toBe(t.zoom!.delay);
    const [fade] = on(played, 'wc-start');
    expect(fade?.opts).toMatchObject({ delay: t.fade.delay, duration: t.fade.duration, fill: 'forwards' });
    expect(fade?.frames.at(-1)?.opacity).toBe(0);
    fade!.finish();
    await expect(run.finished).resolves.toBe(true);
  });

  it('with reduced motion only fades the surface', () => {
    const { el, played } = surface();
    playEnter(el, true);
    expect(played).toHaveLength(1);
    expect(played[0]!.el).toBe(el);
    expect(played[0]!.opts.duration).toBe(enterTiming(true).fade.duration);
  });

  it('cancel stops every animation and finished resolves false', async () => {
    const { el, played } = surface();
    const run = playEnter(el, false);
    run.cancel();
    expect(played.every((p) => p.cancelled)).toBe(true);
    await expect(run.finished).resolves.toBe(false);
  });

  it('skips what is not there (a sub-page on top)', () => {
    const el = document.createElement('div');
    el.innerHTML = '<div class="wc-start-skyhost"></div>';
    const calls: Element[] = [];
    for (const e of [el, ...el.querySelectorAll('*')]) {
      (e as HTMLElement).animate = (() => {
        calls.push(e);
        return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
      }) as HTMLElement['animate'];
    }
    playEnter(el, false);
    expect(calls).toEqual([el.firstElementChild, el]);
  });
});
