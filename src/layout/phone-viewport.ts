// Phone viewport (ADR 0075 §3, *phone* flag only): the viewport meta, and
// the visible area under the on-screen keyboard.
//
// - `phoneViewportMeta` adds `maximum-scale=1` (focusing the input does
//   not zoom the page on iOS) and `viewport-fit=cover` (the page reaches
//   under the notch; ui.css pads by the safe-area insets).
// - `installPhoneViewport` follows `visualViewport` resize/scroll and
//   publishes the visible area as `--wc-vv-h` / `--wc-vv-top` on <html>;
//   ui.css sizes #app by them, so the cockpit fits above the keyboard and
//   the input line sits just over it. The update waits until the events
//   have been quiet for VV_SETTLE_MS, so the relayout and NAWS run once at
//   the end of the keyboard animation, not on every step.
// - `keyboardUp()` is true while the visible height is well below the
//   tallest seen at this width (the device's keyboard is open); the
//   cockpit skips the too-small guard then. ONLY FOR THE OLD PHONE LAYOUT
//   and a phone whose phone chunk could not be loaded (stage 52 file,
//   section C: both go in a later pass, and this state with them). A
//   phone with the phone layer has a keyboard of our own on every text
//   field (ADR 0138, ADR 0139) and the device's never comes up: the shell
//   turns the state off there (`watchDeviceKeyboard(false)`; an old-layout
//   cockpit on the page holds it on, `holdDeviceKeyboard`), so a visible
//   area that shrinks for another reason (a split screen, a window made
//   lower) is laid out as any small screen and is never taken for a
//   keyboard. `--wc-vv-h` / `--wc-vv-top` are published either way.
//
// Fullscreen (stage 52d, cut back in 0.6.1). The visual viewport alone
// decides the visible area, in fullscreen as outside it.
//
// 1. Entering fullscreen with the keyboard up left the height from before
//    fullscreen published (owner's Samsung S21, Android Chrome): Android
//    delivers the viewport resize and the fullscreen change in no fixed
//    order, and the resize may come before the page has its fullscreen
//    size (or not at all). So a fullscreen change measures again at once,
//    after the settle time, and once more at FS_RECHECK_MS. The tallest
//    height is kept apart for the plain page and for fullscreen.
// 2. KNOWN, ACCEPTED (the old phone layout only since stage 53): in
//    fullscreen with the keyboard up, the visual viewport is about 44 CSS
//    px too tall on that phone, so the keyboard's top row may cover the
//    input line. Stage 52d (0.6.0) worked around it with the
//    VirtualKeyboard API: `overlaysContent = true` in fullscreen and the
//    visible area ending at `boundingRect.top`. That path was REMOVED in
//    0.6.1: on the owner's S21 it collapsed the whole layout to about
//    80 CSS px at the top of the screen in portrait fullscreen (Chrome
//    presumably reports a wrong rectangle; not verified on a device).
//    `overlaysContent` is never set here now and the rectangle is never
//    read for the layout; `virtualKeyboardOf` remains only for the
//    readout below, which still shows the rectangle's numbers.
//
// `?vv=1` shows the measured numbers on screen (phone-viewport-debug.ts,
// loaded only with the parameter), for a screenshot from the device.
//
// Nothing here runs on desktop: src/main.ts calls it only with the flag.
// Everything is event-driven; nothing runs per frame.

import { isFullscreen } from '../core/fullscreen';

/** Quiet time (ms) after the last visualViewport event before the update. */
export const VV_SETTLE_MS = 150;
/** A second measurement this long (ms) after a fullscreen change: the transition may outlast the settle time. */
export const FS_RECHECK_MS = 500;
/** The keyboard counts as up below this share of the tallest visible height at this width. */
const KEYBOARD_SHARE = 0.8;

const META = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';

/** Sets the phone viewport meta (creates the tag if missing). */
export function phoneViewportMeta(doc: Document = document): void {
  let m = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!m) {
    m = doc.createElement('meta');
    m.name = 'viewport';
    doc.head.append(m);
  }
  m.content = META;
}

let kbd = false;
let watched = true;
let holds = 0;
const appliedFns = new Set<() => void>();

/**
 * Whether a shrunken visible area is taken for the device's keyboard
 * (`keyboardUp()`, `html.wc-kbd`). On until the shell turns it off: a
 * phone with our own keyboard never has the device's (see the header).
 */
export function watchDeviceKeyboard(on: boolean, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  watched = on;
  dropUnwatched(doc);
}

/**
 * A cockpit in the old phone layout (the tab strip: the run log player and
 * Spotlights on a phone, a phone flag forced in a wide window) is on the
 * page: its pane fields (Comm's search) still get the device's keyboard,
 * so the state is followed while it lives, whatever the shell said.
 * Returns the release.
 */
export function holdDeviceKeyboard(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): () => void {
  holds++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds--;
    dropUnwatched(doc);
  };
}

/** No longer followed while set: dropped at once. */
function dropUnwatched(doc: Document | undefined): void {
  if (watched || holds > 0 || !kbd) return;
  kbd = false;
  doc?.documentElement.classList.toggle('wc-kbd', false);
}

/** True while the device's on-screen keyboard is up (the old phone layout only, see the header; always false on desktop). */
export function keyboardUp(): boolean {
  return kbd;
}

/**
 * Whether the SCREEN lies on its side, from what the on-screen keyboard
 * does not change (pure of the viewport): `screen.orientation.type`, else
 * the old `window.orientation` angle (iOS before 16.4, where `screen.width`
 * and `height` do not turn with the device). Null where neither is known.
 */
export function screenLandscape(win: Pick<Window, 'screen'> & { orientation?: unknown }): boolean | null {
  const type = (win.screen as (Screen & { orientation?: { type?: unknown } }) | undefined)?.orientation?.type;
  if (typeof type === 'string') {
    if (type.startsWith('landscape')) return true;
    if (type.startsWith('portrait')) return false;
  }
  const angle = win.orientation;
  if (typeof angle === 'number' && Number.isFinite(angle)) return Math.abs(angle) % 180 === 90;
  return null;
}

/**
 * The phone's game layout in landscape (stage 52c)? A window wider than
 * tall whose screen does not say portrait. The window alone is not enough:
 * the on-screen keyboard leaves a small portrait phone a visible area wider
 * than tall, and after a rotation or a start with the keyboard up
 * `keyboardUp()` does not know it yet. The screen alone is not enough
 * either: a phone flag in a computer's narrow window is portrait on a
 * screen that is not.
 */
export function landscapeLayout(width: number, height: number, screen: boolean | null): boolean {
  return width > height && screen !== false;
}

/** Calls `fn` after every published update (the `?vv=1` readout); returns the unsubscribe. */
export function onPhoneViewportApplied(fn: () => void): () => void {
  appliedFns.add(fn);
  return () => appliedFns.delete(fn);
}

/** The keyboard state from the visible height `h` and the tallest seen at this width (pure). */
export function isKeyboardUp(h: number, tallest: number): boolean {
  return tallest > 0 && h < tallest * KEYBOARD_SHARE;
}

/**
 * The tallest visual viewport height seen at `width`, kept apart for the
 * page as it normally is (`plain`) and in fullscreen (`full`): the two
 * differ by the system bars, so one must not be judged against the other.
 */
export interface Baseline {
  width: number;
  plain: number;
  full: number;
}

export const NO_BASELINE: Baseline = { width: -1, plain: 0, full: 0 };

/**
 * The baseline after a measurement (pure). A new width is a rotation (or a
 * new window): both start over. The fullscreen page is never shorter than
 * the plain one, so `plain` is a floor for `full`: entering fullscreen
 * with the keyboard already up still reads as keyboard up.
 */
export function nextBaseline(b: Baseline, width: number, height: number, fullscreen: boolean): Baseline {
  const w = Math.round(width);
  const from = w === b.width ? b : { width: w, plain: 0, full: 0 };
  return fullscreen
    ? { ...from, full: Math.max(from.full, from.plain, height) }
    : { ...from, plain: Math.max(from.plain, height) };
}

/** What was measured, for `visibleArea`. */
export interface ViewportMeasure {
  /** `visualViewport.height` (or `innerHeight`). */
  height: number;
  /** `visualViewport.offsetTop` (or 0). */
  top: number;
  /** The tallest height seen at this width in this mode (`Baseline`). */
  tallest: number;
}

export interface VisibleArea {
  height: number;
  top: number;
  keyboardUp: boolean;
}

/**
 * The visible area from the measured numbers (pure): the visual viewport
 * alone, in fullscreen too. The keyboard is up while the height is well
 * below the tallest seen in this mode.
 */
export function visibleArea(m: ViewportMeasure): VisibleArea {
  return { height: m.height, top: m.top, keyboardUp: isKeyboardUp(m.height, m.tallest) };
}

/** The part of the VirtualKeyboard API the `?vv=1` readout shows (Chrome on Android). Read only: see the header. */
interface VirtualKeyboardLike extends EventTarget {
  readonly overlaysContent: boolean;
  readonly boundingRect: { top: number; height: number };
}

/** `navigator.virtualKeyboard`, or null where the API is missing (iOS, Firefox). For the readout only. */
export function virtualKeyboardOf(win: Window): VirtualKeyboardLike | null {
  const k = (win.navigator as (Navigator & { virtualKeyboard?: VirtualKeyboardLike }) | undefined)?.virtualKeyboard;
  return k && typeof k.addEventListener === 'function' ? k : null;
}

/** Starts following the visual viewport (phone only). Returns the stop function. */
export function installPhoneViewport(win: Window = window): () => void {
  const vv = win.visualViewport;
  const doc = win.document;
  const root = doc.documentElement;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let recheck: ReturnType<typeof setTimeout> | null = null;
  let base = NO_BASELINE;
  const apply = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    const fullscreen = isFullscreen(doc);
    const h = vv ? vv.height : win.innerHeight;
    const w = vv ? vv.width : win.innerWidth;
    base = nextBaseline(base, w, h, fullscreen);
    const area = visibleArea({
      height: h,
      top: vv ? vv.offsetTop : 0,
      tallest: fullscreen ? base.full : base.plain,
    });
    kbd = (watched || holds > 0) && area.keyboardUp;
    root.classList.toggle('wc-kbd', kbd);
    root.style.setProperty('--wc-vv-h', `${area.height}px`);
    root.style.setProperty('--wc-vv-top', `${area.top}px`);
    // iOS pans the layout viewport to show a focused input; the app
    // follows the visual viewport instead, so keep the page itself at 0.
    if (win.scrollY !== 0 && area.top === 0) win.scrollTo(0, 0);
    for (const fn of appliedFns) fn();
  };
  const later = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(apply, VV_SETTLE_MS);
  };
  // Point 1 above: measure now (the height from the other mode is stale),
  // at the settle time, and once more when the transition is surely over.
  const onFullscreen = (): void => {
    apply();
    later();
    if (recheck) clearTimeout(recheck);
    recheck = setTimeout(() => {
      recheck = null;
      apply();
    }, FS_RECHECK_MS);
  };
  apply();
  const target: EventTarget = vv ?? win;
  target.addEventListener('resize', later);
  target.addEventListener('scroll', later);
  if (vv) win.addEventListener('resize', later);
  doc.addEventListener('fullscreenchange', onFullscreen);
  doc.addEventListener('webkitfullscreenchange', onFullscreen);
  // The owner's readout (`?vv=1`): loaded only when asked for.
  let stopReadout: (() => void) | null = null;
  let stopped = false;
  if (new URLSearchParams(win.location?.search ?? '').get('vv') === '1') {
    void import('./phone-viewport-debug').then((m) => {
      if (!stopped) stopReadout = m.installViewportReadout(win);
    });
  }
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (recheck) clearTimeout(recheck);
    target.removeEventListener('resize', later);
    target.removeEventListener('scroll', later);
    if (vv) win.removeEventListener('resize', later);
    doc.removeEventListener('fullscreenchange', onFullscreen);
    doc.removeEventListener('webkitfullscreenchange', onFullscreen);
    stopReadout?.();
  };
}
