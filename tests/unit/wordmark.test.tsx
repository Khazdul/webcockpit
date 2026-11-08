// @vitest-environment happy-dom
// The start page wordmark (ADR 0126): the light model, the markup and the Preact component.

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkyLook } from '../../src/start/sky/look';
import { PLACE_SETTLE_MS, Wordmark } from '../../src/start/wordmark';
import { COCKPIT, MUME } from '../../src/start/wordmark-glyphs';
import {
  type MarkBox,
  SHEEN_FIRST_MS,
  SHEEN_GAP_MS,
  SHEEN_PASS_MS,
  applyWordmarkLight,
  paintWordmark,
  parseColor,
  sheenDelay,
  sheenGap,
  wordmarkLight,
  wordmarkMarkup,
} from '../../src/start/wordmark-svg';

const box: MarkBox = { cx: 500, cy: 200, vw: 1000, vh: 800 };

function look(over: Omit<Partial<SkyLook>, 'light'> & { light?: Partial<SkyLook['light']> } = {}): SkyLook {
  // Only the fields the wordmark reads matter; the rest of SkyLook is not used here.
  const base = {
    period: 'day' as const,
    season: 'summer' as const,
    dayness: 1,
    top: '#3d7fc4',
    mid: '#79acd9',
    horizon: '#c9def0',
    below: '#9cc3e6',
    textBackLuminance: 0.6,
    light: { kind: 'sun' as const, x: 0.5, y: 0.05, strength: 1, color: '#fff3d6' },
  };
  return { ...base, ...over, light: { ...base.light, ...over.light } } as unknown as SkyLook;
}

describe('wordmarkLight', () => {
  it('uses the day metal by day and the night metal at night', () => {
    expect(wordmarkLight(look({ dayness: 1 }), box).night).toBe(0);
    expect(wordmarkLight(look({ dayness: 0 }), box).night).toBe(1);
    const dusk = wordmarkLight(look({ dayness: 0.5 }), box).night;
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
  });

  it('dims the inlay when there is little light, never by day', () => {
    expect(wordmarkLight(look(), box).dim).toBe(0);
    const moon = wordmarkLight(look({ dayness: 0, light: { kind: 'moon', strength: 0.35 } }), box).dim;
    const none = wordmarkLight(look({ dayness: 0, light: { kind: 'none', strength: 0.35 } }), box).dim;
    expect(moon).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(moon);
  });

  it('moves the glint with the light across the word', () => {
    const left = wordmarkLight(look({ light: { x: 0.1 } }), box).glintX;
    const mid = wordmarkLight(look({ light: { x: 0.5 } }), box).glintX;
    const right = wordmarkLight(look({ light: { x: 0.9 } }), box).glintX;
    expect(left).toBeLessThan(mid);
    expect(mid).toBeLessThan(right);
    expect(left).toBeGreaterThanOrEqual(MUME.x0);
    expect(right).toBeLessThanOrEqual(MUME.x1);
    expect(mid).toBeCloseTo((MUME.x0 + MUME.x1) / 2, 0);
  });

  it('turns the lit edge towards the light (screen direction, y down)', () => {
    const upLeft = wordmarkLight(look({ light: { x: 0.1, y: 0 } }), box);
    expect(upLeft.dx).toBeLessThan(0);
    expect(upLeft.dy).toBeLessThan(0);
    expect(Math.hypot(upLeft.dx, upLeft.dy)).toBeCloseTo(1, 5);
    const right = wordmarkLight(look({ light: { x: 1, y: 0.25 } }), box);
    expect(right.dx).toBeGreaterThan(0);
  });

  it('brightens the glint with the light', () => {
    const sun = wordmarkLight(look(), box).glintAlpha;
    const moon = wordmarkLight(look({ dayness: 0, light: { kind: 'moon', strength: 0.35 } }), box).glintAlpha;
    expect(sun).toBeGreaterThan(moon);
  });
});

describe('parseColor', () => {
  it('reads hex and rgb colours', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('#00d0d0')).toEqual([0, 208, 208]);
    expect(parseColor('rgba(10, 154, 156, .5)')).toEqual([10, 154, 156]);
    expect(parseColor('hsl(1 2% 3%)', [1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('wordmarkMarkup', () => {
  it('draws paths, never text, and names itself', () => {
    const html = wordmarkMarkup('full', 'wx');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="MUME Cockpit"');
    expect(html).not.toMatch(/<text\b/);
    expect(html).toContain(MUME.d);
    expect(html).toContain(COCKPIT.d);
    expect(html).toContain('id="wx-core"');
  });

  it('keeps every filter out of the layer the light updates', () => {
    const html = wordmarkMarkup('full', 'wx');
    const inlay = html.slice(html.indexOf('data-wcw="inlay"'));
    expect(inlay.slice(0, inlay.indexOf('</svg>'))).not.toMatch(/filter/);
  });

  it('leaves COCKPIT out of the small mark', () => {
    const html = wordmarkMarkup('small', 'wy');
    expect(html).not.toContain(COCKPIT.d);
    expect(html).toContain('wc-wordmark-small');
  });
});

describe('applyWordmarkLight', () => {
  it('sets the dynamic attributes and the rivet colours', () => {
    const host = document.createElement('div');
    paintWordmark(host, look({ dayness: 0, light: { kind: 'moon', strength: 0.3 } }), 'full', 'wz');
    expect(host.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('1');
    const w = wordmarkLight(look(), box);
    applyWordmarkLight(host, w);
    expect(host.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('0');
    const g = host.querySelector('[data-wcw="glint"]')!;
    expect(Number(g.getAttribute('x1'))).toBeCloseTo(w.glintX - 900, 0);
    const lit = host.querySelector('[data-wcw="lit-e"]')!;
    expect(lit.getAttribute('transform')).toMatch(/^translate\(/);
    const root = host.querySelector<HTMLElement>('.wc-wordmark')!;
    expect(root.style.getPropertyValue('--wcw-rv-mid')).toBe(w.rivet[1]);
  });

  it('writes only the values that changed', () => {
    const host = document.createElement('div');
    paintWordmark(host, look({ dayness: 0, light: { kind: 'moon', strength: 0.3 } }), 'full', 'wq');
    const attrs = vi.spyOn(Element.prototype, 'setAttribute');
    const props = vi.spyOn(host.querySelector<HTMLElement>('.wc-wordmark')!.style, 'setProperty');
    try {
      const w = wordmarkLight(look(), box);
      applyWordmarkLight(host, w);
      expect(attrs).toHaveBeenCalled();
      expect(props).toHaveBeenCalled();
      attrs.mockClear();
      props.mockClear();
      applyWordmarkLight(host, { ...w });
      expect(attrs).not.toHaveBeenCalled();
      expect(props).not.toHaveBeenCalled();
      // the glint alone moves: its two ends, nothing else
      applyWordmarkLight(host, { ...w, glintX: w.glintX + 40 });
      expect(attrs.mock.calls.map((c) => c[0]).sort()).toEqual(['x1', 'x2']);
      expect(props).not.toHaveBeenCalled();
    } finally {
      attrs.mockRestore();
      props.mockRestore();
    }
  });
});

describe('<Wordmark>', () => {
  it('mounts once and follows the look', () => {
    const el = document.createElement('div');
    document.body.append(el);
    act(() => render(<Wordmark look={look()} run={false} />, el));
    const svg = el.querySelector('[data-wcw="iron"]');
    expect(el.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('MUME Cockpit');
    expect(el.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('0');
    act(() => render(<Wordmark look={look({ dayness: 0, light: { kind: 'moon', strength: 0.3 } })} run={false} />, el));
    expect(el.querySelector('[data-wcw="iron"]')).toBe(svg);
    expect(el.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).toBe('1');
    act(() => render(<Wordmark look={look()} size="small" run={false} />, el));
    expect(el.querySelector('.wc-wordmark-small')).not.toBeNull();
    act(() => render(null, el));
    el.remove();
  });
});

describe('<Wordmark> measuring', () => {
  let mounted: HTMLElement | null = null;
  afterEach(() => {
    if (mounted) act(() => render(null, mounted!));
    mounted = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  function setup(): { el: HTMLDivElement; parent: HTMLDivElement; reads: () => number; resize: () => void } {
    let observed: (() => void) | null = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observed = cb;
        }
        observe(): void {}
        disconnect(): void {
          observed = null;
        }
      },
    );
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    const parent = document.createElement('div');
    const el = document.createElement('div');
    parent.append(el);
    document.body.append(parent);
    mounted = el;
    return { el, parent, reads: () => rect.mock.calls.length, resize: () => observed?.() };
  }

  const moon = look({ dayness: 0, light: { kind: 'moon', strength: 0.3 } });

  it('reads the layout once, not on every look', () => {
    const { el, reads } = setup();
    act(() => render(<Wordmark look={look()} run={false} />, el));
    expect(reads()).toBe(1);
    for (let i = 0; i < 6; i++)
      act(() => render(<Wordmark look={look({ dayness: 1 - i / 6, light: { x: i / 6 } })} run={false} />, el));
    expect(reads()).toBe(1);
    expect(el.querySelector('[data-wcw="night"]')?.getAttribute('opacity')).not.toBe('0');
    act(() => render(null, el));
  });

  it('measures again on a resize of the window or the host, and on a transition above it', () => {
    const { el, parent, reads, resize } = setup();
    act(() => render(<Wordmark look={look()} run={false} />, el));
    const n = reads();
    window.dispatchEvent(new Event('resize'));
    expect(reads()).toBe(n + 1);
    resize();
    expect(reads()).toBe(n + 2);
    parent.dispatchEvent(new Event('transitionend', { bubbles: true }));
    expect(reads()).toBe(n + 3);
    // a transition elsewhere on the page does not move the mark
    const other = document.createElement('div');
    document.body.append(other);
    other.dispatchEvent(new Event('transitionend', { bubbles: true }));
    expect(reads()).toBe(n + 3);
    act(() => render(<Wordmark look={moon} run={false} />, el));
    expect(reads()).toBe(n + 3);
    act(() => render(null, el));
    window.dispatchEvent(new Event('resize'));
    parent.dispatchEvent(new Event('transitionend', { bubbles: true }));
    expect(reads()).toBe(n + 3);
  });

  it('measures again when the place changes and once the move is over', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { el, reads } = setup();
    act(() => render(<Wordmark look={look()} run={false} place="main" />, el));
    const n = reads();
    act(() => render(<Wordmark look={moon} run={false} place="main" />, el));
    expect(reads()).toBe(n);
    act(() => render(<Wordmark look={moon} run={false} place="sub" />, el));
    expect(reads()).toBe(n + 1);
    vi.advanceTimersByTime(PLACE_SETTLE_MS);
    expect(reads()).toBe(n + 2);
    act(() => render(null, el));
  });
});

describe('the sheen', () => {
  it('waits SHEEN_FIRST_MS for the first pass, then a random 20-45 s after each', () => {
    expect(sheenDelay(null)).toBe(SHEEN_FIRST_MS);
    expect(sheenGap(() => 0)).toBe(SHEEN_GAP_MS[0]);
    expect(sheenGap(() => 0.999999)).toBe(SHEEN_GAP_MS[1]);
    expect(SHEEN_GAP_MS[0]).toBeGreaterThanOrEqual(20_000);
    expect(SHEEN_GAP_MS[1]).toBeLessThanOrEqual(45_000);
    // shown again soon after a pass: the rest of the gap; long after: soon
    expect(sheenDelay(SHEEN_PASS_MS, () => 0)).toBe(SHEEN_GAP_MS[0]);
    expect(sheenDelay(SHEEN_PASS_MS + 18_000, () => 0)).toBe(SHEEN_FIRST_MS);
    expect(sheenDelay(10 * 60_000, () => 0.5)).toBe(SHEEN_FIRST_MS);
  });

  interface Pass {
    cancelled: boolean;
    finite: boolean;
  }
  const proto = HTMLElement.prototype as { animate?: unknown };
  const hadAnimate = 'animate' in proto;

  /** Fake Web Animations on the band: each pass is recorded; `end()` finishes the last one. */
  function fakeAnimate(): { passes: Pass[]; end: () => Promise<void> } {
    if (!('animate' in proto)) proto.animate = () => null;
    const passes: Pass[] = [];
    let finish: (() => void) | null = null;
    vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation((_k, opts) => {
      const rec = { cancelled: false, finite: typeof opts === 'object' && opts.iterations === undefined };
      passes.push(rec);
      let state: AnimationPlayState = 'running';
      let reject: (e: unknown) => void = () => {};
      const finished = new Promise<void>((res, rej) => {
        finish = () => {
          state = 'finished';
          res();
        };
        reject = rej;
      });
      finished.catch(() => {});
      return {
        finished,
        get playState() {
          return state;
        },
        cancel() {
          rec.cancelled = true;
          state = 'idle';
          reject(new Error('cancelled'));
        },
      } as unknown as Animation;
    });
    return {
      passes,
      end: async () => {
        finish?.();
        await Promise.resolve();
        await Promise.resolve();
      },
    };
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (!hadAnimate) delete proto.animate;
    document.body.innerHTML = '';
  });

  it('passes once now and then, runs nothing between passes, and stops when run goes false', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const { passes, end } = fakeAnimate();
    const el = document.createElement('div');
    document.body.append(el);
    act(() => render(<Wordmark look={look()} />, el));
    expect(passes).toHaveLength(0);
    vi.advanceTimersByTime(SHEEN_FIRST_MS - 1);
    expect(passes).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(passes).toHaveLength(1);
    expect(passes[0]!.finite).toBe(true);
    // the pass ends; nothing until the gap is over
    vi.advanceTimersByTime(SHEEN_PASS_MS);
    await end();
    vi.advanceTimersByTime(SHEEN_GAP_MS[0] - 1);
    expect(passes).toHaveLength(1);
    vi.advanceTimersByTime(SHEEN_GAP_MS[1] - SHEEN_GAP_MS[0] + 1);
    expect(passes).toHaveLength(2);
    // hidden or leaving: the pass is cancelled and no timer is left
    act(() => render(<Wordmark look={look()} run={false} />, el));
    expect(passes[1]!.cancelled).toBe(true);
    vi.advanceTimersByTime(10 * 60_000);
    expect(passes).toHaveLength(2);
    // shown again long after: soon again
    act(() => render(<Wordmark look={look()} />, el));
    vi.advanceTimersByTime(SHEEN_FIRST_MS);
    expect(passes).toHaveLength(3);
    act(() => render(null, el));
    expect(passes[2]!.cancelled).toBe(true);
  });

  it('never passes with reduced motion', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { passes } = fakeAnimate();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('reduce'), media: q }) as unknown as MediaQueryList,
    );
    const el = document.createElement('div');
    document.body.append(el);
    act(() => render(<Wordmark look={look()} />, el));
    vi.advanceTimersByTime(5 * 60_000);
    expect(passes).toHaveLength(0);
    act(() => render(null, el));
  });
});
