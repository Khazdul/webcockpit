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
//   tallest seen at this width (the keyboard is open); the cockpit skips
//   the too-small guard then.
//
// Nothing here runs on desktop: src/main.ts calls it only with the flag.

/** Quiet time (ms) after the last visualViewport event before the update. */
export const VV_SETTLE_MS = 150;
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

/** True while the on-screen keyboard is up (phone only; always false on desktop). */
export function keyboardUp(): boolean {
  return kbd;
}

/** The keyboard state from the visible height `h` and the tallest seen at this width (pure). */
export function isKeyboardUp(h: number, tallest: number): boolean {
  return tallest > 0 && h < tallest * KEYBOARD_SHARE;
}

/** Starts following the visual viewport (phone only). Returns the stop function. */
export function installPhoneViewport(win: Window = window): () => void {
  const vv = win.visualViewport;
  const root = win.document.documentElement;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let width = -1;
  let tallest = 0;
  const apply = (): void => {
    timer = null;
    const h = vv ? vv.height : win.innerHeight;
    const top = vv ? vv.offsetTop : 0;
    const w = vv ? vv.width : win.innerWidth;
    // A new width is a rotation (or a new window): start over.
    if (Math.round(w) !== width) {
      width = Math.round(w);
      tallest = 0;
    }
    tallest = Math.max(tallest, h);
    kbd = isKeyboardUp(h, tallest);
    root.classList.toggle('wc-kbd', kbd);
    root.style.setProperty('--wc-vv-h', `${h}px`);
    root.style.setProperty('--wc-vv-top', `${top}px`);
    // iOS pans the layout viewport to show a focused input; the app
    // follows the visual viewport instead, so keep the page itself at 0.
    if (win.scrollY !== 0 && top === 0) win.scrollTo(0, 0);
  };
  const later = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(apply, VV_SETTLE_MS);
  };
  apply();
  const target: EventTarget = vv ?? win;
  target.addEventListener('resize', later);
  target.addEventListener('scroll', later);
  if (vv) win.addEventListener('resize', later);
  return () => {
    if (timer) clearTimeout(timer);
    target.removeEventListener('resize', later);
    target.removeEventListener('scroll', later);
    if (vv) win.removeEventListener('resize', later);
  };
}
