// Stage 52d: the phone's visible area, in fullscreen and out of it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FS_RECHECK_MS,
  NO_BASELINE,
  VV_SETTLE_MS,
  installPhoneViewport,
  keyboardUp,
  nextBaseline,
  onPhoneViewportApplied,
  visibleArea,
} from '../../src/layout/phone-viewport';

describe('visibleArea (pure)', () => {
  const m = { height: 800, top: 0, tallest: 800, fullscreen: false, keyboard: null };

  it('without the VirtualKeyboard API the visual viewport alone decides', () => {
    expect(visibleArea(m)).toEqual({ height: 800, top: 0, keyboardUp: false });
    expect(visibleArea({ ...m, height: 480 })).toEqual({ height: 480, top: 0, keyboardUp: true });
    expect(visibleArea({ ...m, height: 480, top: 12, fullscreen: true })).toEqual({ height: 480, top: 12, keyboardUp: true });
  });

  it('an empty keyboard rectangle changes nothing, in fullscreen too', () => {
    const keyboard = { top: 0, height: 0 };
    expect(visibleArea({ ...m, fullscreen: true, keyboard })).toEqual({ height: 800, top: 0, keyboardUp: false });
    expect(visibleArea({ ...m, height: 480, fullscreen: true, keyboard })).toEqual({ height: 480, top: 0, keyboardUp: true });
  });

  it('in fullscreen the area ends at the keyboard rectangle and the keyboard is up', () => {
    // overlaysContent: the viewport did not shrink at all.
    expect(visibleArea({ ...m, fullscreen: true, keyboard: { top: 456, height: 344 } })).toEqual({ height: 456, top: 0, keyboardUp: true });
    // The viewport shrank, but 44 px too little (the owner's bug 2).
    expect(visibleArea({ ...m, height: 500, fullscreen: true, keyboard: { top: 456, height: 344 } }).height).toBe(456);
    // Never below the visual viewport's own bottom.
    expect(visibleArea({ ...m, height: 400, fullscreen: true, keyboard: { top: 456, height: 344 } }).height).toBe(400);
    // The rectangle is measured from the layout viewport, the area starts at `top`.
    expect(visibleArea({ ...m, top: 20, fullscreen: true, keyboard: { top: 456, height: 344 } })).toEqual({ height: 436, top: 20, keyboardUp: true });
    // A rectangle at the very top is not believed for the height.
    expect(visibleArea({ ...m, fullscreen: true, keyboard: { top: 0, height: 300 } })).toEqual({ height: 800, top: 0, keyboardUp: true });
  });

  it('outside fullscreen the keyboard rectangle is ignored', () => {
    expect(visibleArea({ ...m, keyboard: { top: 456, height: 344 } })).toEqual({ height: 800, top: 0, keyboardUp: false });
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

  it('bug 1: a fullscreen change measures at once, at the settle time and at the recheck', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    f.resize(372);
    settle();
    expect(f.kbd()).toBe(true);
    // The fullscreen change arrives; the viewport has not followed yet.
    f.fullscreen(true);
    expect(f.vk.overlaysContent).toBe(true);
    expect(f.height()).toBe('372px');
    expect(f.kbd()).toBe(true); // the plain baseline is the floor
    // The viewport and the rectangle change without any event reaching us.
    f.vv.height = 700;
    f.vk.boundingRect = { top: 470, height: 330 };
    settle();
    expect(f.height()).toBe('470px');
    f.vv.height = 800;
    f.vk.boundingRect = { top: 456, height: 344 };
    vi.advanceTimersByTime(FS_RECHECK_MS - VV_SETTLE_MS);
    expect(f.height()).toBe('456px');
    expect(f.kbd()).toBe(true);
  });

  it('bug 2: in fullscreen the keyboard rectangle is the bottom; leaving fullscreen goes back to the viewport', () => {
    const f = fakeWindow();
    const applied = vi.fn();
    const off = onPhoneViewportApplied(applied);
    stop = installPhoneViewport(f.win);
    f.vv.height = 800;
    f.fullscreen(true, 'webkitfullscreenchange');
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(f.height()).toBe('800px');
    expect(f.kbd()).toBe(false);
    f.keyboard(456, 344);
    settle();
    expect(f.height()).toBe('456px');
    expect(f.kbd()).toBe(true);
    f.keyboard(0, 0);
    settle();
    expect(f.height()).toBe('800px');
    expect(f.kbd()).toBe(false);
    // Out of fullscreen with a (stale) rectangle: the viewport alone again.
    f.vk.boundingRect = { top: 456, height: 344 };
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

  it('stopping turns overlaysContent off and removes the listeners', () => {
    const f = fakeWindow();
    stop = installPhoneViewport(f.win);
    f.fullscreen(true);
    expect(f.vk.overlaysContent).toBe(true);
    stop();
    stop = () => {};
    expect(f.vk.overlaysContent).toBe(false);
    f.resize(300);
    f.keyboard(200, 100);
    vi.advanceTimersByTime(FS_RECHECK_MS);
    expect(f.height()).toBe('686px');
  });
});
