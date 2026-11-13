// Stage 52d (cut back in 0.6.1): the phone's visible area, in fullscreen and out of it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FS_RECHECK_MS,
  VV_SETTLE_MS,
  installPhoneViewport,
  landscapeLayout,
  screenLandscape,
  onPhoneViewportApplied,
} from '../../src/layout/phone-viewport';

describe('the screen\'s orientation and the landscape layout (stage 52e)', () => {
  const win = (type: unknown, angle?: unknown) => ({ screen: (type === undefined ? {} : { orientation: { type } }) as Screen, ...(angle === undefined ? {} : { orientation: angle }) });

  it('`screen.orientation.type` decides; without it the old `window.orientation` angle; else unknown', () => {
    expect(screenLandscape(win('landscape-primary'))).toBe(true);
    expect(screenLandscape(win('landscape-secondary'))).toBe(true);
    expect(screenLandscape(win('portrait-primary'))).toBe(false);
    expect(screenLandscape(win('portrait-secondary', 90))).toBe(false);
    expect([screenLandscape(win(undefined, 90)), screenLandscape(win(undefined, -90)), screenLandscape(win(undefined, 0)), screenLandscape(win(undefined, 180))]).toEqual([true, true, false, false]);
    expect(screenLandscape(win(undefined))).toBeNull();
    expect(screenLandscape(win(7, 'x'))).toBeNull();
    expect(screenLandscape({ screen: undefined as unknown as Screen })).toBeNull();
  });

  it('landscape is a window wider than tall whose screen does not say portrait', () => {
    expect(landscapeLayout(844, 390, true)).toBe(true);
    expect(landscapeLayout(844, 390, null)).toBe(true);
    // An upright phone whose visible area was made lower (a split screen).
    expect(landscapeLayout(360, 300, false)).toBe(false);
    // A phone flag in a computer's narrow window: the monitor lies on its side, the window does not.
    expect(landscapeLayout(390, 844, true)).toBe(false);
    expect(landscapeLayout(400, 400, true)).toBe(false);
  });
});

/** A window as far as the module looks at it. */
function fakeWindow(opts: { vk?: boolean; search?: string } = {}) {
  const vv = Object.assign(new EventTarget(), { width: 360, height: 686, offsetTop: 0 });
  const classes = new Set<string>();
  const props = new Map<string, string>();
  const doc = Object.assign(new EventTarget(), {
    fullscreenElement: null as object | null,
    documentElement: {
      classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
      style: { setProperty: (k: string, v: string) => props.set(k, v), getPropertyValue: (k: string) => props.get(k) ?? '' },
    },
  });
  const vk = Object.assign(new EventTarget(), { overlaysContent: false, boundingRect: { top: 0, height: 0 } });
  const win = Object.assign(new EventTarget(), {
    visualViewport: vv,
    document: doc,
    navigator: opts.vk === false ? {} : { virtualKeyboard: vk },
    innerHeight: 686,
    innerWidth: 360,
    scrollY: 0,
    scrollTo: () => {},
    location: { search: opts.search ?? '' },
  });
  return {
    win: win as unknown as Window,
    vv,
    vk,
    doc,
    height: () => props.get('--wc-vv-h'),
    classes: () => [...classes],
    resize: (h: number, w = vv.width) => {
      vv.height = h;
      vv.width = w;
      vv.dispatchEvent(new Event('resize'));
    },
    fullscreen: (on: boolean, event = 'fullscreenchange') => {
      doc.fullscreenElement = on ? doc.documentElement : null;
      doc.dispatchEvent(new Event(event));
    },
    keyboard: (top: number, height: number) => {
      vk.boundingRect = { top, height };
      vk.dispatchEvent(new Event('geometrychange'));
    },
  };
}

describe('installPhoneViewport', () => {
  let stop: () => void = () => {};
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });
  const settle = (): void => void vi.advanceTimersByTime(VV_SETTLE_MS);

  it('outside fullscreen follows the visual viewport, never turns overlaysContent on, ignores the rectangle; a shrink is no keyboard state', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    expect(f.height()).toBe('686px');
    f.resize(372);
    expect(f.height()).toBe('686px'); // not before the events are quiet
    settle();
    expect(f.height()).toBe('372px');
    // The device's keyboard is not followed (stage 55): no `wc-kbd`, nothing but the height.
    expect(f.classes()).toEqual([]);
    f.keyboard(300, 386);
    settle();
    expect(f.height()).toBe('372px');
    expect(f.vk.overlaysContent).toBe(false);
    f.resize(686);
    settle();
    expect(f.height()).toBe('686px');
  });

  it('a new width (a turn) is published at once; the same width still waits for the events to be quiet', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    // Turned to landscape: lower, but at a new width.
    f.resize(360, 800);
    expect(f.height()).toBe('360px');
    // A height that comes after the width, with no event of its own, is taken by the trailing measurement.
    f.vv.height = 340;
    settle();
    expect(f.height()).toBe('340px');
    // At the same width a shrink waits.
    f.resize(150);
    expect(f.height()).toBe('340px');
    settle();
    expect(f.height()).toBe('150px');
    // Turned back: the new width is published at once.
    f.resize(686, 360);
    expect(f.height()).toBe('686px');
  });

  it('without the VirtualKeyboard API fullscreen still follows the visual viewport', () => {
    const f = fakeWindow({ vk: false });
    stop = installPhoneViewport(f.win);
    f.vv.height = 800;
    f.fullscreen(true);
    expect(f.height()).toBe('800px');
    f.resize(500);
    settle();
    expect(f.height()).toBe('500px');
  });

  it('a fullscreen change measures at once, at the settle time and at the recheck; overlaysContent stays off', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    f.resize(372);
    settle();
    // The fullscreen change arrives; the viewport has not followed yet.
    f.fullscreen(true);
    expect(f.vk.overlaysContent).toBe(false);
    expect(f.height()).toBe('372px');
    // The viewport changes without any event reaching us.
    f.vv.height = 430;
    settle();
    expect(f.height()).toBe('430px');
    f.vv.height = 456;
    vi.advanceTimersByTime(FS_RECHECK_MS - VV_SETTLE_MS);
    expect(f.height()).toBe('456px');
    expect(f.vk.overlaysContent).toBe(false);
  });

  it('in fullscreen the keyboard rectangle is ignored (removed in 0.6.1): the viewport decides, overlaysContent stays off', () => {
    const f = fakeWindow();
    const applied = vi.fn();
    const off = onPhoneViewportApplied(applied);
    stop = installPhoneViewport(f.win);
    f.vv.height = 800;
    f.fullscreen(true, 'webkitfullscreenchange');
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(f.height()).toBe('800px');
    // The rectangle the owner's S21 collapsed on: near the top of the screen.
    f.keyboard(80, 720);
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(f.height()).toBe('800px');
    expect(f.vk.overlaysContent).toBe(false);
    // A geometry change alone publishes nothing.
    applied.mockClear();
    f.keyboard(456, 344);
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(applied).not.toHaveBeenCalled();
    // The viewport shrinks: that is what counts.
    f.resize(500);
    settle();
    expect(f.height()).toBe('500px');
    // Out of fullscreen with the rectangle still there: the plain viewport.
    f.vv.height = 686;
    f.fullscreen(false);
    expect(f.vk.overlaysContent).toBe(false);
    expect(f.height()).toBe('686px');
    expect(applied).toHaveBeenCalled();
    off();
  });

  it('stopping removes the listeners and the pending measurements', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    f.fullscreen(true);
    f.vv.height = 300;
    stop();
    stop = () => {};
    expect(f.vk.overlaysContent).toBe(false);
    f.resize(300);
    f.fullscreen(false);
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(f.height()).toBe('686px');
  });
});
