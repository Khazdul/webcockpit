// @vitest-environment happy-dom
// Enter MUME's transition (ADR 0125, addendum): its timing and what it animates.

import { describe, expect, it } from 'vitest';
import { ENTER_ZOOM, enterTiming, playEnter } from '../../src/chrome/enter-transition';

describe('enterTiming', () => {
  it('leaves, then zooms, then fades, unhurried (a quick leave, a long zoom, a slow fade)', () => {
    const t = enterTiming(false);
    expect(t.leave && t.zoom).toBeTruthy();
    const leave = t.leave!;
    const zoom = t.zoom!;
    expect(leave.delay).toBe(0);
    expect(leave.duration).toBeGreaterThanOrEqual(400);
    expect(leave.duration).toBeLessThanOrEqual(1200);
    // The zoom starts as the scenery is nearly gone; the fade after it.
    expect(zoom.delay).toBeLessThanOrEqual(leave.duration);
    expect(zoom.delay).toBeGreaterThanOrEqual(leave.duration / 2);
    expect(t.fade.delay).toBeGreaterThanOrEqual(zoom.delay + 1000);
    expect(t.fade.delay - zoom.delay).toBeLessThanOrEqual(2500);
    expect(t.fade.duration).toBeGreaterThanOrEqual(1000);
    expect(t.fade.duration).toBeLessThanOrEqual(2500);
    expect(t.total).toBe(t.fade.delay + t.fade.duration);
    expect(ENTER_ZOOM).toBeGreaterThan(1);
    expect(ENTER_ZOOM).toBeLessThanOrEqual(1.15);
  });

  it('with reduced motion: a short fade, nothing moves or zooms', () => {
    const t = enterTiming(true);
    expect(t.leave).toBeNull();
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
  it('fades the scenery in place, slides the almanac down, zooms the sky and fades the surface last', async () => {
    const { el, played } = surface();
    const run = playEnter(el, false);
    const t = enterTiming(false);
    for (const c of ['wc-start-brand', 'wc-sm-panel', 'wc-sm-quote']) {
      const [a] = on(played, c);
      expect(a?.frames.at(-1)).toEqual({ opacity: 0 });
      expect(a?.opts).toMatchObject({ delay: t.leave!.delay, duration: t.leave!.duration, fill: 'forwards' });
    }
    const [alm] = on(played, 'wc-start-almanac');
    expect(alm?.frames.at(-1)?.translate).toMatch(/^0 \d+px$/);
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
