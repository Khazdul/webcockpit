// Phone viewport (ADR 0075 §3, *phone* flag only): the viewport meta, and
// the visible area the page is laid out in.
//
// - `phoneViewportMeta` adds `maximum-scale=1` (focusing a field does not
//   zoom the page on iOS) and `viewport-fit=cover` (the page reaches under
//   the notch; ui.css pads by the safe-area insets).
// - `installPhoneViewport` follows `visualViewport` resize/scroll and
//   publishes the visible area as `--wc-vv-h` / `--wc-vv-top` on <html>;
//   ui.css sizes #app by them. The update waits until the events have been
//   quiet for VV_SETTLE_MS, so the relayout and NAWS run once at the end
//   of a change, not on every step. An event with a new width (a turn) is
//   published at once: one layout and one NAWS.
// - The device's on-screen keyboard is not followed (stage 55): a phone has
//   a keyboard of our own on every text field (ADR 0138, ADR 0139) and the
//   device's never comes up, so a visible area that shrinks (a split
//   screen, a window made lower) is laid out as any small screen. The old
//   phone layout's `keyboardUp()` / `html.wc-kbd` state went with it.
//
// Fullscreen (stage 52d, cut back in 0.6.1). The visual viewport alone
// decides the visible area, in fullscreen as outside it.
//
// 1. Entering fullscreen could leave the height from before fullscreen
//    published (owner's Samsung S21, Android Chrome): Android delivers the
//    viewport resize and the fullscreen change in no fixed order, and the
//    resize may come before the page has its fullscreen size (or not at
//    all). So a fullscreen change measures again at once, after the settle
//    time, and once more at FS_RECHECK_MS.
// 2. HISTORY (the device's keyboard, which a phone no longer gets): in
//    fullscreen with that keyboard up, the visual viewport was about 44
//    CSS px too tall on that phone. Stage 52d (0.6.0) worked around it
//    with the VirtualKeyboard API: `overlaysContent = true` in fullscreen and the
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

/** Quiet time (ms) after the last visualViewport event before the update. */
export const VV_SETTLE_MS = 150;
/** A second measurement this long (ms) after a fullscreen change: the transition may outlast the settle time. */
export const FS_RECHECK_MS = 500;

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

const appliedFns = new Set<() => void>();

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
 * a visible area made lower (a split screen) can leave a small upright
 * phone an area wider than tall, and that is still portrait. The screen
 * alone is not enough either: a phone flag in a computer's narrow window
 * is portrait on a screen that is not.
 */
export function landscapeLayout(width: number, height: number, screen: boolean | null): boolean {
  return width > height && screen !== false;
}

/** Calls `fn` after every published update (the `?vv=1` readout); returns the unsubscribe. */
export function onPhoneViewportApplied(fn: () => void): () => void {
  appliedFns.add(fn);
  return () => appliedFns.delete(fn);
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
  // The width last published: a new one is a turn (see `later`).
  let width = -1;
  const apply = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    const height = vv ? vv.height : win.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    width = Math.round(vv ? vv.width : win.innerWidth);
    root.style.setProperty('--wc-vv-h', `${height}px`);
    root.style.setProperty('--wc-vv-top', `${top}px`);
    // iOS pans the layout viewport to show a focused input; the app
    // follows the visual viewport instead, so keep the page itself at 0.
    if (win.scrollY !== 0 && top === 0) win.scrollTo(0, 0);
    for (const fn of appliedFns) fn();
  };
  const later = (): void => {
    // A new width is a turn (or a new window), never a keyboard's animation: the page's width
    // follows at once, so the height is published at once too. Else the first layout after a
    // turn is at the new width and the old height, and MUME is told window sizes that never
    // were. The trailing measurement stays, for a height that comes after the width.
    const w = vv ? vv.width : win.innerWidth;
    if (Math.round(w) !== width) apply();
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
