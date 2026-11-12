// Device flags (ADR 0075 §1, ADR 0140): `touch`, `phone` and `tablet`,
// decided once at startup and never changed at runtime (rotating keeps
// them).
//
//   touch   the primary pointer is coarse and cannot hover
//           (`(pointer: coarse) and (hover: none)`); a laptop with a touch
//           screen and a touchpad stays desktop. Fallback for browsers
//           that misreport the primary pointer (Samsung Internet answers
//           `hover: hover`, ADR 0086): a touch screen
//           (`navigator.maxTouchPoints > 0`) on a screen whose short side
//           is under 600 CSS px, or on Android.
//   tablet  a touch device (found as above, not forced with `?touch=1`)
//           whose screen's short side is 600 CSS px or more (ADR 0140).
//   phone   touch, and the short side of the screen is under 600 CSS px;
//           or a tablet. "Phone" is the phone's code paths, layout and
//           keyboard: a tablet uses them all (ADR 0140), so `phone` is on
//           whenever `tablet` is.
//
// What `tablet` adds to `phone`: the shell uses the phone's game layout
// and our own keyboard whatever the window's size (src/app/shell.ts
// `phoneGameWanted`), and stored settings are left exactly as they are
// (src/phone/phone-defaults.ts). Nothing else reads it.
//
// Query flags:
//
//   ?touch=1, ?phone=1  force those flags on (phone implies touch), for
//                       development on a desktop and for the e2e tests.
//                       Neither makes a tablet: `?touch=1` on a desktop is
//                       the desktop cockpit with touch behaviours, and
//                       `?phone=1` on a desktop-size window is the OLD
//                       phone layout (ADR 0075), as before ADR 0140.
//   ?tablet=phone       forces `tablet` (and so `phone` and `touch`) on any
//                       device: the phone's game layout on a window of any
//                       size (tests and development on a desktop).
//   ?tablet=desktop     a tablet is not one: touch only, the desktop
//                       cockpit and the device's keyboard, as before
//                       ADR 0140. No effect on a phone or a desktop.
//
// With all flags off no phone code path runs: every touch/phone branch
// reads these flags, and all touch/phone CSS is scoped under
// `html.wc-touch` / `html.wc-phone`.

export interface DeviceFlags {
  readonly touch: boolean;
  readonly phone: boolean;
  /** A tablet (ADR 0140): the phone's layout on a window of any size. Implies `phone`. */
  readonly tablet: boolean;
}

export interface DeviceInputs {
  /** `matchMedia('(pointer: coarse) and (hover: none)').matches`. */
  coarse: boolean;
  /** `navigator.maxTouchPoints`. */
  touchPoints: number;
  /** `navigator.userAgent`. */
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  /** The page's query string (`location.search`). */
  search: string;
}

/** Short side (CSS px) below which a touch device counts as a phone; from it up, as a tablet. */
export const PHONE_MAX_SHORT_SIDE = 600;

const forced = (params: URLSearchParams, name: string): boolean => {
  const v = params.get(name);
  return v !== null && v !== '0' && v !== 'false';
};

/** The flags for these inputs (pure). */
export function decideDevice(i: DeviceInputs): DeviceFlags {
  const params = new URLSearchParams(i.search);
  const asked = params.get('tablet');
  const forcePhone = forced(params, 'phone');
  const small = Math.min(i.screenWidth, i.screenHeight) < PHONE_MAX_SHORT_SIDE;
  const touchScreen = i.touchPoints > 0 && (small || /Android/i.test(i.userAgent));
  // A touch device by what the browser says: the query's forced flags do not make a tablet.
  const found = i.coarse || touchScreen;
  const tablet = asked === 'phone' || (found && !small && asked !== 'desktop');
  const touch = tablet || forcePhone || forced(params, 'touch') || found;
  const phone = tablet || forcePhone || (touch && small);
  return { touch, phone, tablet };
}

let flags: DeviceFlags = { touch: false, phone: false, tablet: false };

/** The flags in force (all off until `initDevice` runs, e.g. in unit tests). */
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
    touchPoints: win.navigator?.maxTouchPoints ?? 0,
    userAgent: win.navigator?.userAgent ?? '',
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

/** Test hook: sets the flags directly (unit tests of touch branches); `tablet` is off unless given. */
export function setDeviceForTest(next: Pick<DeviceFlags, 'touch' | 'phone'> & Partial<DeviceFlags>): void {
  flags = { tablet: false, ...next };
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
