import { describe, expect, it } from 'vitest';
import { decideDevice, device, phoneSizeWindow, setDeviceForTest } from '../../src/core/device';

// The window is unknown (0 × 0) unless a case gives one: it then counts as a phone's.
const base = { coarse: false, touchPoints: 0, userAgent: '', screenWidth: 1920, screenHeight: 1080, innerWidth: 0, innerHeight: 0, search: '' };

describe('decideDevice', () => {
  it('desktop: both off', () => {
    expect(decideDevice(base)).toEqual({ touch: false, phone: false, tablet: false, desktopSite: false });
  });
  it('fine pointer on a small screen stays desktop', () => {
    expect(decideDevice({ ...base, screenWidth: 390, screenHeight: 844 })).toEqual({ touch: false, phone: false, tablet: false, desktopSite: false });
  });
  it('coarse pointer on a large screen: a tablet, which has the phone flag too (ADR 0140)', () => {
    expect(decideDevice({ ...base, coarse: true, screenWidth: 1024, screenHeight: 1366 })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
  });
  it('coarse pointer with a short side under 600: phone', () => {
    expect(decideDevice({ ...base, coarse: true, screenWidth: 390, screenHeight: 844 })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 844, screenHeight: 390 })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 599, screenHeight: 900 })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 600, screenHeight: 900 })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
  });
  it('touch screen with a misreported pointer (Samsung Internet): phone on a small screen', () => {
    const samsung = { ...base, touchPoints: 5, userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Mobile' };
    expect(decideDevice({ ...samsung, screenWidth: 384, screenHeight: 832 })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
    // An Android tablet with the same misreport: a tablet.
    expect(decideDevice({ ...samsung, screenWidth: 800, screenHeight: 1280 })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
  });
  it('touch-screen laptop with a fine pointer stays desktop', () => {
    expect(decideDevice({ ...base, touchPoints: 10, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toEqual({ touch: false, phone: false, tablet: false, desktopSite: false });
  });
  it('?touch=1 forces touch', () => {
    expect(decideDevice({ ...base, search: '?touch=1' })).toEqual({ touch: true, phone: false, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, search: '?replay&touch' })).toEqual({ touch: true, phone: false, tablet: false, desktopSite: false });
  });
  it('?phone=1 forces phone and implies touch', () => {
    expect(decideDevice({ ...base, search: '?phone=1' })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
  });
  it('=0 does not force', () => {
    expect(decideDevice({ ...base, search: '?touch=0&phone=0' })).toEqual({ touch: false, phone: false, tablet: false, desktopSite: false });
  });
});

// ADR 0140: a tablet gets the phone's layout by default.
describe('tablet (ADR 0140)', () => {
  const ipad = { ...base, coarse: true, screenWidth: 820, screenHeight: 1180 };
  const phone = { ...base, coarse: true, screenWidth: 390, screenHeight: 844 };
  const off = { touch: false, phone: false, tablet: false, desktopSite: false };

  it('a touch device with a short side of 600 or more is a tablet, in both orientations', () => {
    expect(decideDevice(ipad)).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
    expect(decideDevice({ ...ipad, screenWidth: 1180, screenHeight: 820 })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
    expect(decideDevice({ ...ipad, search: '?fixture=gmcp-demo.log&speed=0' })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
  });
  it('a phone is not a tablet, whatever the query says', () => {
    for (const search of ['', '?tablet=desktop', '?tablet=1', '?phone=1', '?touch=1']) {
      expect(decideDevice({ ...phone, search })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
    }
  });
  it('a desktop is not a tablet: no touch, a touch-screen laptop, the forced flags', () => {
    expect(decideDevice(base)).toEqual(off);
    expect(decideDevice({ ...base, touchPoints: 10, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toEqual(off);
    expect(decideDevice({ ...base, search: '?tablet=desktop' })).toEqual(off);
    // `?touch=1` is the desktop cockpit with touch; `?phone=1` a phone at any window size: neither is a tablet.
    expect(decideDevice({ ...base, search: '?touch=1' })).toEqual({ touch: true, phone: false, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, search: '?phone=1' })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, search: '?replay&phone=1&touch=1' })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
  });
  it('?tablet=desktop: a tablet is touch only, as before ADR 0140', () => {
    expect(decideDevice({ ...ipad, search: '?tablet=desktop' })).toEqual({ touch: true, phone: false, tablet: false, desktopSite: false });
    expect(decideDevice({ ...ipad, search: '?replay&tablet=desktop&touch=1' })).toEqual({ touch: true, phone: false, tablet: false, desktopSite: false });
    // A phone can still be asked for on it.
    expect(decideDevice({ ...ipad, search: '?tablet=desktop&phone=1' })).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
  });
  it('?tablet=phone forces a tablet on any device (phone and touch with it)', () => {
    expect(decideDevice({ ...base, search: '?replay&tablet=phone' })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
    expect(decideDevice({ ...ipad, search: '?tablet=phone' })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
    expect(decideDevice({ ...phone, search: '?tablet=phone' })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
  });
  it('only the values `phone` and `desktop` mean anything', () => {
    for (const search of ['?tablet', '?tablet=1', '?tablet=0', '?tablet=Phone', '?tablet=Desktop', '?tablet=tablet']) {
      expect(decideDevice({ ...base, search })).toEqual(off);
      expect(decideDevice({ ...ipad, search })).toEqual({ touch: true, phone: true, tablet: true, desktopSite: false });
    }
  });
  it('the test hook leaves the tablet and Desktop-site flags off unless they are given', () => {
    setDeviceForTest({ touch: true, phone: true });
    expect(device()).toEqual({ touch: true, phone: true, tablet: false, desktopSite: false });
    setDeviceForTest({ touch: true, phone: false, desktopSite: true });
    expect(device()).toEqual({ touch: true, phone: false, tablet: false, desktopSite: true });
    setDeviceForTest({ touch: true, phone: true, tablet: true, desktopSite: false });
    expect(device().tablet).toBe(true);
    setDeviceForTest({ touch: false, phone: false });
    expect(device()).toEqual(off);
  });
});

describe('phoneSizeWindow', () => {
  it('a phone in portrait or landscape: the short side is under 600 px', () => {
    expect(phoneSizeWindow(390, 844)).toBe(true);
    expect(phoneSizeWindow(844, 390)).toBe(true);
    expect(phoneSizeWindow(412, 400)).toBe(true);
    expect(phoneSizeWindow(599, 1200)).toBe(true);
  });
  it('a desktop-size window is not', () => {
    expect(phoneSizeWindow(1280, 720)).toBe(false);
    expect(phoneSizeWindow(600, 600)).toBe(false);
    expect(phoneSizeWindow(980, 1743)).toBe(false);
  });
  it('an unknown size counts as a phone\'s', () => {
    expect(phoneSizeWindow(0, 0)).toBe(true);
    expect(phoneSizeWindow(Number.NaN, 700)).toBe(true);
    expect(phoneSizeWindow(700, 0)).toBe(true);
  });
});

// Stage 55: a phone in the browser's "Desktop site" mode gets the desktop cockpit.
describe('Desktop site (stage 55)', () => {
  const win = (innerWidth: number, innerHeight: number) => ({ innerWidth, innerHeight });
  const phone = { ...base, coarse: true, screenWidth: 390, screenHeight: 844 };
  const samsung = { ...base, touchPoints: 5, userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0', screenWidth: 384, screenHeight: 832 };
  const ipad = { ...base, coarse: true, screenWidth: 820, screenHeight: 1180 };
  const desktopSite = { touch: true, phone: false, tablet: false, desktopSite: true };
  const asPhone = { touch: true, phone: true, tablet: false, desktopSite: false };

  it('a phone in its own window is a phone: portrait, landscape, a split screen, an unknown window', () => {
    for (const w of [win(390, 844), win(844, 390), win(390, 400), win(599, 1300), win(0, 0)]) {
      expect(decideDevice({ ...phone, ...w })).toEqual(asPhone);
    }
  });
  it('a phone\'s screen with a window that is not a phone\'s: touch only, the shape `?tablet=desktop` gives a tablet', () => {
    expect(decideDevice({ ...phone, ...win(980, 2120) })).toEqual(desktopSite);
    expect(decideDevice({ ...phone, ...win(2120, 980) })).toEqual(desktopSite);
    expect(decideDevice({ ...phone, ...win(600, 600) })).toEqual(desktopSite);
    // Found by the touch screen alone (Samsung Internet's misreported pointer).
    expect(decideDevice({ ...samsung, ...win(980, 2123) })).toEqual(desktopSite);
    expect(decideDevice({ ...phone, ...win(980, 2120), search: '?replay&touch=1' })).toEqual(desktopSite);
    const { desktopSite: _mode, ...flags } = decideDevice({ ...phone, ...win(980, 2120) });
    const { desktopSite: _none, ...tabletDesktop } = decideDevice({ ...ipad, search: '?tablet=desktop' });
    expect(flags).toEqual(tabletDesktop);
  });
  it('`?phone=1` is a phone at any window size: the rule is skipped, and it is never a tablet', () => {
    for (const w of [win(390, 844), win(980, 2120), win(1280, 720), win(1920, 1080)]) {
      expect(decideDevice({ ...phone, ...w, search: '?phone=1' })).toEqual(asPhone);
      expect(decideDevice({ ...base, ...w, search: '?replay&phone=1' })).toEqual(asPhone);
      expect(decideDevice({ ...ipad, ...w, search: '?tablet=desktop&phone=1' })).toEqual(asPhone);
    }
  });
  it('a tablet is untouched: the tablet flag wins at any window size', () => {
    const tablet = { touch: true, phone: true, tablet: true, desktopSite: false };
    for (const w of [win(820, 1180), win(1180, 820), win(320, 1180), win(980, 1410), win(1920, 1080)]) {
      expect(decideDevice({ ...ipad, ...w })).toEqual(tablet);
      expect(decideDevice({ ...phone, ...w, search: '?tablet=phone' })).toEqual(tablet);
      expect(decideDevice({ ...ipad, ...w, search: '?tablet=desktop' })).toEqual({ touch: true, phone: false, tablet: false, desktopSite: false });
    }
  });
  it('never on a desktop: no touch found, whatever the screen, the window and the forced touch flag', () => {
    expect(decideDevice({ ...base, ...win(1280, 720) })).toEqual({ touch: false, phone: false, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, ...win(1280, 720), search: '?touch=1' })).toEqual({ touch: true, phone: false, tablet: false, desktopSite: false });
    expect(decideDevice({ ...base, screenWidth: 390, screenHeight: 844, ...win(1280, 720) }).desktopSite).toBe(false);
  });
});
