// Device flags (ADR 0075 §1): `touch` and `phone`, decided once at
// startup and never changed at runtime (rotating keeps them).
//
//   touch  the primary pointer is coarse and cannot hover
//          (`(pointer: coarse) and (hover: none)`); a laptop with a touch
//          screen and a touchpad stays desktop.
//   phone  touch, and the short side of the screen is under 600 CSS px.
//
// `?touch=1` and `?phone=1` force them on (phone implies touch), for
// development on a desktop and for the e2e tests. With both flags off no
// phone code path runs: every touch/phone branch reads these flags, and
// all touch/phone CSS is scoped under `html.wc-touch` / `html.wc-phone`.

export interface DeviceFlags {
  readonly touch: boolean;
  readonly phone: boolean;
}

export interface DeviceInputs {
  /** `matchMedia('(pointer: coarse) and (hover: none)').matches`. */
  coarse: boolean;
  screenWidth: number;
  screenHeight: number;
  /** The page's query string (`location.search`). */
  search: string;
}

/** Short side (CSS px) below which a touch device counts as a phone. */
export const PHONE_MAX_SHORT_SIDE = 600;

const forced = (params: URLSearchParams, name: string): boolean => {
  const v = params.get(name);
  return v !== null && v !== '0' && v !== 'false';
};

/** The flags for these inputs (pure). */
export function decideDevice(i: DeviceInputs): DeviceFlags {
  const params = new URLSearchParams(i.search);
  const forcePhone = forced(params, 'phone');
  const touch = forcePhone || forced(params, 'touch') || i.coarse;
  const phone = forcePhone || (touch && Math.min(i.screenWidth, i.screenHeight) < PHONE_MAX_SHORT_SIDE);
  return { touch, phone };
}

let flags: DeviceFlags = { touch: false, phone: false };

/** The flags in force (both off until `initDevice` runs, e.g. in unit tests). */
export function device(): DeviceFlags {
  return flags;
}

/**
 * Decides the flags from the browser and sets `wc-touch` / `wc-phone` on
 * `<html>`. Called once, first thing at startup (src/main.ts).
 */
export function initDevice(win: Window = window): DeviceFlags {
  const coarse = win.matchMedia?.('(pointer: coarse) and (hover: none)').matches ?? false;
  flags = decideDevice({
    coarse,
    screenWidth: win.screen?.width ?? 0,
    screenHeight: win.screen?.height ?? 0,
    search: win.location.search,
  });
  const root = win.document.documentElement;
  if (flags.touch) root.classList.add('wc-touch');
  if (flags.phone) root.classList.add('wc-phone');
  if (flags.touch) trackPointer(win);
  return flags;
}

/** Test hook: sets the flags directly (unit tests of touch branches). */
export function setDeviceForTest(next: DeviceFlags): void {
  flags = next;
}

let lastPointerType = '';

/**
 * Touch only: remembers the type of the last pointerdown, because the
 * compatibility mouse events after a tap carry no pointer type. Not
 * installed on desktop.
 */
function trackPointer(win: Window): void {
  win.addEventListener('pointerdown', (e) => (lastPointerType = e.pointerType), { capture: true, passive: true });
}

/**
 * True when the current interaction came from a finger: the touch flag is
 * on and the last pointerdown was not a mouse or pen. Always false on
 * desktop. Used to keep taps from focusing the game input (the keyboard
 * opens only when the input itself is tapped).
 */
export function touchInteraction(): boolean {
  return flags.touch && lastPointerType !== 'mouse' && lastPointerType !== 'pen';
}
