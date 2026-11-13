// Device flags (ADR 0075 §1, ADR 0140, stage 55): `touch`, `phone`, `tablet`
// and `desktopSite`, decided once at startup and never changed at runtime
// (rotating keeps them).
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
//   phone   touch, the short side of the screen is under 600 CSS px and
//           the window is a phone's too (`phoneSizeWindow`); or a tablet.
//           "Phone" is the phone's code paths, layout and keyboard: a
//           tablet uses them all (ADR 0140), so `phone` is on whenever
//           `tablet` is.
//   desktopSite
//           a touch device (found as above) on a phone's screen whose
//           window is not a phone's: the browser's "Desktop site" mode
//           (stage 55). The player asked for the desktop version and gets
//           it: `touch` only, the desktop cockpit with touch behaviours
//           and the device's keyboard, the same shape `?tablet=desktop`
//           gives a tablet. Never on a tablet (iPadOS asks for the desktop
//           site by default, so there the request says nothing).
//
// What `tablet` adds to `phone`: stored settings are left exactly as they
// are (src/phone/phone-defaults.ts) and the phone layer sizes its keys for
// it. What `desktopSite` adds to `touch`: a first visit still gets the
// phone's new-user defaults (settings and scripts), since they are stored
// and follow the phone back to its normal mode (src/main.ts,
// src/boot/first-paint.ts, src/app/shell.ts `newUserScripts`). Nothing
// else reads either.
//
// Query flags:
//
//   ?touch=1            forces `touch` on, for development on a desktop
//                       and for the e2e tests: the desktop cockpit with
//                       touch behaviours. It does not make a tablet.
//   ?phone=1            a phone at any window size: forces `phone` and
//                       `touch`, never `tablet`, and the Desktop-site rule
//                       is skipped. On a desktop-size window that is the
//                       phone's layout stretched (development only).
//   ?tablet=phone       forces `tablet` (and so `phone` and `touch`) on any
//                       device: the phone's game layout with the tablet's
//                       key sizes (tests and development on a desktop).
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
  /**
   * A phone in the browser's "Desktop site" mode (stage 55): `touch` only, the desktop cockpit.
   * Read only where a new user's defaults are chosen, which follow the device and not the mode.
   */
  readonly desktopSite: boolean;
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
  /** `window.innerWidth` / `innerHeight`; 0 when unknown. */
  innerWidth: number;
  innerHeight: number;
  /** The page's query string (`location.search`). */
  search: string;
}

/** Short side (CSS px) below which a touch device counts as a phone; from it up, as a tablet. */
export const PHONE_MAX_SHORT_SIDE = 600;

const forced = (params: URLSearchParams, name: string): boolean => {
  const v = params.get(name);
  return v !== null && v !== '0' && v !== 'false';
};

/**
 * True when a window of this size is as small as a phone's screen: its
 * short side is under `PHONE_MAX_SHORT_SIDE` CSS px. An unknown size (a
 * 0 × 0 window, a page loaded hidden) counts as a phone's.
 */
export function phoneSizeWindow(innerWidth: number, innerHeight: number): boolean {
  if (!(innerWidth > 0 && innerHeight > 0)) return true;
  return Math.min(innerWidth, innerHeight) < PHONE_MAX_SHORT_SIDE;
}

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
  // "Desktop site" on a phone: its screen, but not its window. The forced flags skip the rule.
  const desktopSite = found && small && !tablet && !forcePhone && !phoneSizeWindow(i.innerWidth, i.innerHeight);
  const touch = tablet || forcePhone || forced(params, 'touch') || found;
  const phone = tablet || forcePhone || (touch && small && !desktopSite);
  return { touch, phone, tablet, desktopSite };
}

let flags: DeviceFlags = { touch: false, phone: false, tablet: false, desktopSite: false };

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
    innerWidth: win.innerWidth ?? 0,
    innerHeight: win.innerHeight ?? 0,
    search: win.location.search,
  });
  const root = win.document.documentElement;
  if (flags.touch) root.classList.add('wc-touch');
  if (flags.phone) root.classList.add('wc-phone');
  if (flags.touch) trackPointer(win);
  return flags;
}

/** Test hook: sets the flags directly (unit tests of touch branches); `tablet` and `desktopSite` are off unless given. */
export function setDeviceForTest(next: Pick<DeviceFlags, 'touch' | 'phone'> & Partial<DeviceFlags>): void {
  flags = { tablet: false, desktopSite: false, ...next };
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
