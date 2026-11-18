// @vitest-environment happy-dom
// Stage 73 round 3 (ADR 0160 addendum "the iPad fullscreen turn"): following a
// window through a turn reported late and in steps, the frame's fit, the
// page's viewport nudge, the `?fsdebug` switch and the frame's new message.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTLE_MS, rectText, viewportLines, watchViewport } from '../../src/core/viewport-settle';
import { fsDebugAsked, mountFsDebug } from '../../src/core/fs-debug';
import { frameTarget, rootOff, turnedScreen } from '../../src/replay/frame-fit';
import { frameFsDebug } from '../../src/replay/frame';
import { nudgeViewport } from '../../src/watch/turn';

describe('watchViewport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('ticks at every settle time after an event, and starts over at the next', () => {
    const ticks: Array<[string, number]> = [];
    const w = watchViewport(window, { onTick: (why, n) => ticks.push([why, n]) });
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(60);
    expect(ticks).toEqual([
      ['resize', 0],
      ['resize', 1],
    ]);
    window.dispatchEvent(new Event('orientationchange'));
    vi.advanceTimersByTime(2000);
    expect(ticks.slice(2).map((t) => t[0])).toEqual(SETTLE_MS.map(() => 'orientationchange'));
    expect(w.last?.why).toBe('orientationchange');
    document.dispatchEvent(new Event('webkitfullscreenchange'));
    vi.advanceTimersByTime(0);
    expect(ticks.at(-1)).toEqual(['fullscreenchange', 0]);
    w.dispose();
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(2000);
    expect(ticks.at(-1)).toEqual(['fullscreenchange', 0]);
  });

  it('stops early once two reads agree after the quiet time, not before', () => {
    let n = 0;
    const w = watchViewport(window, { onTick: () => n++, read: () => 'same' });
    w.kick('page');
    vi.advanceTimersByTime(2000);
    // 0, 50, 200 run whatever the reads say; 500 agrees with 200 after the quiet time: 1000 does not run.
    expect(n).toBe(4);
    w.dispose();
  });
});

describe('the frame fits its window', () => {
  it('turns the screen\'s sides by its orientation; unknown without one', () => {
    const win = (w: number, h: number, type?: string) => ({ screen: { width: w, height: h, ...(type ? { orientation: { type } } : {}) } }) as unknown as Window;
    expect(turnedScreen(win(820, 1180, 'landscape-primary'))).toEqual({ w: 1180, h: 820 });
    expect(turnedScreen(win(1180, 820, 'portrait-primary'))).toEqual({ w: 820, h: 1180 });
    expect(turnedScreen(win(820, 1180))).toBeNull();
    expect(turnedScreen(win(0, 0, 'portrait-primary'))).toBeNull();
  });

  it('takes the window, and in fullscreen once settled never the old orientation larger than the screen', () => {
    const inner = { w: 820, h: 1180 };
    const land = { w: 1180, h: 820 };
    expect(frameTarget(inner, land, false, true)).toEqual(inner);
    expect(frameTarget(inner, land, true, false)).toEqual(inner);
    expect(frameTarget(inner, land, true, true)).toEqual({ w: 820, h: 820 });
    // The same way round, or no larger: the window.
    expect(frameTarget(land, land, true, true)).toEqual(land);
    expect(frameTarget({ w: 700, h: 800 }, land, true, true)).toEqual({ w: 700, h: 800 });
    expect(frameTarget(inner, null, true, true)).toEqual(inner);
  });

  it('a root is off when it does not fill the target, a px of rounding aside', () => {
    expect(rootOff({ left: 0, top: 0, width: 1180.5, height: 820 }, { w: 1180, h: 820 })).toBe(false);
    expect(rootOff({ left: 0, top: 0, width: 820, height: 1180 }, { w: 1180, h: 820 })).toBe(true);
    expect(rootOff({ left: 0, top: 90, width: 1180, height: 820 }, { w: 1180, h: 820 })).toBe(true);
  });
});

describe('the page after fullscreen', () => {
  it('writes the viewport meta once changed and back', async () => {
    const m = document.createElement('meta');
    m.name = 'viewport';
    m.content = 'width=device-width, initial-scale=1';
    document.head.append(m);
    const seen: string[] = [];
    new MutationObserver(() => seen.push(m.content)).observe(m, { attributes: true });
    nudgeViewport(document);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    expect(seen).toEqual(['width=device-width, initial-scale=1, minimum-scale=1', 'width=device-width, initial-scale=1']);
    m.remove();
  });
});

describe('?fsdebug', () => {
  it('is the query switch, and only `fsdebug: true` in `prefs` turns the frame\'s readout on', () => {
    expect(fsDebugAsked('?fsdebug')).toBe(true);
    expect(fsDebugAsked('?cloudtest&fsdebug=1')).toBe(true);
    expect(fsDebugAsked('?cloudtest')).toBe(false);
    expect(frameFsDebug({ fsdebug: true })).toBe(true);
    expect(frameFsDebug({ fsdebug: 'yes' })).toBe(false);
    expect(frameFsDebug(null)).toBe(false);
  });

  it('shows the lines as text with the last event, without a style attribute, and goes again', () => {
    const d = mountFsDebug(document, 'FRAME', 'top-left', () => ['<b>x</b>', ...viewportLines(window), `root ${rectText(document.body)}`]);
    const el = document.querySelector<HTMLElement>('.wc-fsdebug')!;
    d.update('resize');
    expect(el.textContent).toContain('FRAME  last resize');
    expect(el.textContent).toContain('<b>x</b>');
    expect(el.textContent).toMatch(/inner \d+×\d+/);
    expect(el.textContent).toContain('fullscreen no');
    expect(el.querySelector('b')).toBeNull();
    expect(el.hasAttribute('style')).toBe(false);
    d.dispose();
    expect(document.querySelector('.wc-fsdebug')).toBeNull();
  });
});
