// Stage 52d (cut back in 0.6.1): the phone's visible area, in fullscreen and out of it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FS_RECHECK_MS,
  NO_BASELINE,
  VV_SETTLE_MS,
  installPhoneViewport,
  holdDeviceKeyboard,
  keyboardUp,
  watchDeviceKeyboard,
  landscapeLayout,
  nextBaseline,
  screenLandscape,
  onPhoneViewportApplied,
  visibleArea,
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
    // The keyboard up on an upright phone, not yet known to be up (a start or a rotation with it up).
    expect(landscapeLayout(360, 300, false)).toBe(false);
    // A phone flag in a computer's narrow window: the monitor lies on its side, the window does not.
    expect(landscapeLayout(390, 844, true)).toBe(false);
    expect(landscapeLayout(400, 400, true)).toBe(false);
  });
});

describe('visibleArea (pure)', () => {
  it('the visual viewport alone decides; the keyboard is up well below the tallest height', () => {
    expect(visibleArea({ height: 800, top: 0, tallest: 800 })).toEqual({ height: 800, top: 0, keyboardUp: false });
    expect(visibleArea({ height: 480, top: 0, tallest: 800 })).toEqual({ height: 480, top: 0, keyboardUp: true });
    expect(visibleArea({ height: 480, top: 12, tallest: 800 })).toEqual({ height: 480, top: 12, keyboardUp: true });
    expect(visibleArea({ height: 480, top: 0, tallest: 0 })).toEqual({ height: 480, top: 0, keyboardUp: false });
  });
});

describe('nextBaseline (pure)', () => {
  it('keeps the tallest per mode; the plain height is a floor for fullscreen', () => {
    let b = nextBaseline(NO_BASELINE, 360, 686, false);
    expect(b).toEqual({ width: 360, plain: 686, full: 0 });
    b = nextBaseline(b, 360, 372, false); // keyboard up
    expect(b.plain).toBe(686);
    b = nextBaseline(b, 360, 372, true); // fullscreen entered, keyboard still up
    expect(b).toEqual({ width: 360, plain: 686, full: 686 });
    b = nextBaseline(b, 360, 800, true);
    expect(b).toEqual({ width: 360, plain: 686, full: 800 });
    // Back out: the fullscreen height does not leak into the plain baseline.
    b = nextBaseline(b, 360, 686, false);
    expect(b).toEqual({ width: 360, plain: 686, full: 800 });
  });

  it('a new width (a rotation) starts both over', () => {
    const b = nextBaseline({ width: 360, plain: 686, full: 800 }, 800.4, 300, false);
    expect(b).toEqual({ width: 800, plain: 300, full: 0 });
    expect(nextBaseline({ width: 360, plain: 686, full: 800 }, 800, 360, true)).toEqual({ width: 800, plain: 0, full: 360 });
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
    kbd: () => classes.has('wc-kbd'),
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

  it('outside fullscreen follows the visual viewport, never turns overlaysContent on, ignores the rectangle', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    expect(f.height()).toBe('686px');
    expect(f.kbd()).toBe(false);
    f.resize(372);
    expect(f.height()).toBe('686px'); // not before the events are quiet
    settle();
    expect(f.height()).toBe('372px');
    expect(f.kbd()).toBe(true);
    expect(keyboardUp()).toBe(true);
    f.keyboard(300, 386);
    settle();
    expect(f.height()).toBe('372px');
    expect(f.vk.overlaysContent).toBe(false);
    f.resize(686);
    settle();
    expect(f.height()).toBe('686px');
    expect(f.kbd()).toBe(false);
  });

  it('with the device keyboard state off (a phone with our own keyboard) a shrink is no keyboard; the height is still published', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    f.resize(372);
    settle();
    expect(f.kbd()).toBe(true);
    try {
      // Turned off while it is set: dropped at once.
      watchDeviceKeyboard(false, f.doc as unknown as Document);
      expect(f.kbd()).toBe(false);
      expect(keyboardUp()).toBe(false);
      f.resize(300);
      settle();
      expect(f.height()).toBe('300px');
      expect(f.kbd()).toBe(false);
      expect(keyboardUp()).toBe(false);
      // An old-layout cockpit on the page (the log player on a phone) holds the state on.
      const release = holdDeviceKeyboard(f.doc as unknown as Document);
      f.resize(299);
      settle();
      expect(f.kbd()).toBe(true);
      release();
      release();
      expect(f.kbd()).toBe(false);
      expect(keyboardUp()).toBe(false);
    } finally {
      watchDeviceKeyboard(true);
    }
    // On again (the phone layer could not be mounted): the next measurement says so.
    f.resize(301);
    settle();
    expect(f.kbd()).toBe(true);
  });

  it('a new width (a turn) is published at once, and is no keyboard; the same width still waits for the events to be quiet', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    // Turned to landscape: lower, but at a new width.
    f.resize(360, 800);
    expect(f.height()).toBe('360px');
    expect(f.kbd()).toBe(false);
    // A height that comes after the width, with no event of its own, is taken by the trailing measurement.
    f.vv.height = 340;
    settle();
    expect(f.height()).toBe('340px');
    expect(f.kbd()).toBe(false);
    // At the same width a shrink waits (the device keyboard's animation), and is the keyboard.
    f.resize(150);
    expect(f.height()).toBe('340px');
    settle();
    expect(f.height()).toBe('150px');
    expect(f.kbd()).toBe(true);
    // Turned back with it "up": the new width starts over at once.
    f.resize(686, 360);
    expect(f.height()).toBe('686px');
    expect(f.kbd()).toBe(false);
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
    expect(f.kbd()).toBe(true);
  });

  it('a fullscreen change measures at once, at the settle time and at the recheck; overlaysContent stays off', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    f.resize(372);
    settle();
    expect(f.kbd()).toBe(true);
    // The fullscreen change arrives; the viewport has not followed yet.
    f.fullscreen(true);
    expect(f.vk.overlaysContent).toBe(false);
    expect(f.height()).toBe('372px');
    expect(f.kbd()).toBe(true); // the plain baseline is the floor
    // The viewport changes without any event reaching us.
    f.vv.height = 430;
    settle();
    expect(f.height()).toBe('430px');
    f.vv.height = 456;
    vi.advanceTimersByTime(FS_RECHECK_MS - VV_SETTLE_MS);
    expect(f.height()).toBe('456px');
    expect(f.kbd()).toBe(true);
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
    expect(f.kbd()).toBe(false);
    // The rectangle the owner's S21 collapsed on: near the top of the screen.
    f.keyboard(80, 720);
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(f.height()).toBe('800px');
    expect(f.kbd()).toBe(false);
    expect(f.vk.overlaysContent).toBe(false);
    // A geometry change alone publishes nothing.
    applied.mockClear();
    f.keyboard(456, 344);
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(applied).not.toHaveBeenCalled();
    // The viewport shrinks for the keyboard: that is what counts.
    f.resize(500);
    settle();
    expect(f.height()).toBe('500px');
    expect(f.kbd()).toBe(true);
    // Out of fullscreen with the rectangle still there: the plain viewport.
    f.vv.height = 686;
    f.fullscreen(false);
    expect(f.vk.overlaysContent).toBe(false);
    expect(f.height()).toBe('686px');
    expect(f.kbd()).toBe(false);
    expect(applied).toHaveBeenCalled();
    off();
  });

  it('a rotation starts the baseline over', () => {
    const f = fakeWindow({ vk: false });
    stop = installPhoneViewport(f.win);
    f.resize(340, 800); // landscape: short, but the tallest at this width
    settle();
    expect(f.height()).toBe('340px');
    expect(f.kbd()).toBe(false);
    f.resize(150);
    settle();
    expect(f.kbd()).toBe(true);
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
