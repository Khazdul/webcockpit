import { describe, expect, it } from 'vitest';
import { decideDevice, device, setDeviceForTest } from '../../src/core/device';

const base = { coarse: false, touchPoints: 0, userAgent: '', screenWidth: 1920, screenHeight: 1080, search: '' };

describe('decideDevice', () => {
  it('desktop: both off', () => {
    expect(decideDevice(base)).toEqual({ touch: false, phone: false, tablet: false });
  });
  it('fine pointer on a small screen stays desktop', () => {
    expect(decideDevice({ ...base, screenWidth: 390, screenHeight: 844 })).toEqual({ touch: false, phone: false, tablet: false });
  });
  it('coarse pointer on a large screen: a tablet, which has the phone flag too (ADR 0140)', () => {
    expect(decideDevice({ ...base, coarse: true, screenWidth: 1024, screenHeight: 1366 })).toEqual({ touch: true, phone: true, tablet: true });
  });
  it('coarse pointer with a short side under 600: phone', () => {
    expect(decideDevice({ ...base, coarse: true, screenWidth: 390, screenHeight: 844 })).toEqual({ touch: true, phone: true, tablet: false });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 844, screenHeight: 390 })).toEqual({ touch: true, phone: true, tablet: false });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 599, screenHeight: 900 })).toEqual({ touch: true, phone: true, tablet: false });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 600, screenHeight: 900 })).toEqual({ touch: true, phone: true, tablet: true });
  });
  it('touch screen with a misreported pointer (Samsung Internet): phone on a small screen', () => {
    const samsung = { ...base, touchPoints: 5, userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Mobile' };
    expect(decideDevice({ ...samsung, screenWidth: 384, screenHeight: 832 })).toEqual({ touch: true, phone: true, tablet: false });
    // An Android tablet with the same misreport: a tablet.
    expect(decideDevice({ ...samsung, screenWidth: 800, screenHeight: 1280 })).toEqual({ touch: true, phone: true, tablet: true });
  });
  it('touch-screen laptop with a fine pointer stays desktop', () => {
    expect(decideDevice({ ...base, touchPoints: 10, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toEqual({ touch: false, phone: false, tablet: false });
  });
  it('?touch=1 forces touch', () => {
    expect(decideDevice({ ...base, search: '?touch=1' })).toEqual({ touch: true, phone: false, tablet: false });
    expect(decideDevice({ ...base, search: '?replay&touch' })).toEqual({ touch: true, phone: false, tablet: false });
  });
  it('?phone=1 forces phone and implies touch', () => {
    expect(decideDevice({ ...base, search: '?phone=1' })).toEqual({ touch: true, phone: true, tablet: false });
  });
  it('=0 does not force', () => {
    expect(decideDevice({ ...base, search: '?touch=0&phone=0' })).toEqual({ touch: false, phone: false, tablet: false });
  });
});

// ADR 0140: a tablet gets the phone's layout by default.
describe('tablet (ADR 0140)', () => {
  const ipad = { ...base, coarse: true, screenWidth: 820, screenHeight: 1180 };
  const phone = { ...base, coarse: true, screenWidth: 390, screenHeight: 844 };
  const off = { touch: false, phone: false, tablet: false };

  it('a touch device with a short side of 600 or more is a tablet, in both orientations', () => {
    expect(decideDevice(ipad)).toEqual({ touch: true, phone: true, tablet: true });
    expect(decideDevice({ ...ipad, screenWidth: 1180, screenHeight: 820 })).toEqual({ touch: true, phone: true, tablet: true });
    expect(decideDevice({ ...ipad, search: '?fixture=gmcp-demo.log&speed=0' })).toEqual({ touch: true, phone: true, tablet: true });
  });
  it('a phone is not a tablet, whatever the query says', () => {
    for (const search of ['', '?tablet=desktop', '?tablet=1', '?phone=1', '?touch=1']) {
      expect(decideDevice({ ...phone, search })).toEqual({ touch: true, phone: true, tablet: false });
    }
  });
  it('a desktop is not a tablet: no touch, a touch-screen laptop, the forced flags', () => {
    expect(decideDevice(base)).toEqual(off);
    expect(decideDevice({ ...base, touchPoints: 10, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toEqual(off);
    expect(decideDevice({ ...base, search: '?tablet=desktop' })).toEqual(off);
    // `?touch=1` is the desktop cockpit with touch; `?phone=1` the old phone layout: neither is a tablet.
    expect(decideDevice({ ...base, search: '?touch=1' })).toEqual({ touch: true, phone: false, tablet: false });
    expect(decideDevice({ ...base, search: '?phone=1' })).toEqual({ touch: true, phone: true, tablet: false });
    expect(decideDevice({ ...base, search: '?replay&phone=1&touch=1' })).toEqual({ touch: true, phone: true, tablet: false });
  });
  it('?tablet=desktop: a tablet is touch only, as before ADR 0140', () => {
    expect(decideDevice({ ...ipad, search: '?tablet=desktop' })).toEqual({ touch: true, phone: false, tablet: false });
    expect(decideDevice({ ...ipad, search: '?replay&tablet=desktop&touch=1' })).toEqual({ touch: true, phone: false, tablet: false });
    // The old phone layout can still be asked for on it.
    expect(decideDevice({ ...ipad, search: '?tablet=desktop&phone=1' })).toEqual({ touch: true, phone: true, tablet: false });
  });
  it('?tablet=phone forces a tablet on any device (phone and touch with it)', () => {
    expect(decideDevice({ ...base, search: '?replay&tablet=phone' })).toEqual({ touch: true, phone: true, tablet: true });
    expect(decideDevice({ ...ipad, search: '?tablet=phone' })).toEqual({ touch: true, phone: true, tablet: true });
    expect(decideDevice({ ...phone, search: '?tablet=phone' })).toEqual({ touch: true, phone: true, tablet: true });
  });
  it('only the values `phone` and `desktop` mean anything', () => {
    for (const search of ['?tablet', '?tablet=1', '?tablet=0', '?tablet=Phone', '?tablet=Desktop', '?tablet=tablet']) {
      expect(decideDevice({ ...base, search })).toEqual(off);
      expect(decideDevice({ ...ipad, search })).toEqual({ touch: true, phone: true, tablet: true });
    }
  });
  it('the test hook leaves the tablet flag off unless it is given', () => {
    setDeviceForTest({ touch: true, phone: true });
    expect(device()).toEqual({ touch: true, phone: true, tablet: false });
    setDeviceForTest({ touch: true, phone: true, tablet: true });
    expect(device().tablet).toBe(true);
    setDeviceForTest({ touch: false, phone: false });
    expect(device()).toEqual(off);
  });
});
