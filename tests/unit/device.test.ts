import { describe, expect, it } from 'vitest';
import { decideDevice, tabletPhoneTrial } from '../../src/core/device';

const base = { coarse: false, touchPoints: 0, userAgent: '', screenWidth: 1920, screenHeight: 1080, search: '' };

describe('decideDevice', () => {
  it('desktop: both off', () => {
    expect(decideDevice(base)).toEqual({ touch: false, phone: false });
  });
  it('fine pointer on a small screen stays desktop', () => {
    expect(decideDevice({ ...base, screenWidth: 390, screenHeight: 844 })).toEqual({ touch: false, phone: false });
  });
  it('coarse pointer on a large screen: touch only (tablet)', () => {
    expect(decideDevice({ ...base, coarse: true, screenWidth: 1024, screenHeight: 1366 })).toEqual({ touch: true, phone: false });
  });
  it('coarse pointer with a short side under 600: phone', () => {
    expect(decideDevice({ ...base, coarse: true, screenWidth: 390, screenHeight: 844 })).toEqual({ touch: true, phone: true });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 844, screenHeight: 390 })).toEqual({ touch: true, phone: true });
    expect(decideDevice({ ...base, coarse: true, screenWidth: 600, screenHeight: 900 })).toEqual({ touch: true, phone: false });
  });
  it('touch screen with a misreported pointer (Samsung Internet): phone on a small screen', () => {
    const samsung = { ...base, touchPoints: 5, userAgent: 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/26.0 Mobile' };
    expect(decideDevice({ ...samsung, screenWidth: 384, screenHeight: 832 })).toEqual({ touch: true, phone: true });
    expect(decideDevice({ ...samsung, screenWidth: 800, screenHeight: 1280 })).toEqual({ touch: true, phone: false });
  });
  it('touch-screen laptop with a fine pointer stays desktop', () => {
    expect(decideDevice({ ...base, touchPoints: 10, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toEqual({ touch: false, phone: false });
  });
  it('?touch=1 forces touch', () => {
    expect(decideDevice({ ...base, search: '?touch=1' })).toEqual({ touch: true, phone: false });
    expect(decideDevice({ ...base, search: '?replay&touch' })).toEqual({ touch: true, phone: false });
  });
  it('?phone=1 forces phone and implies touch', () => {
    expect(decideDevice({ ...base, search: '?phone=1' })).toEqual({ touch: true, phone: true });
  });
  it('=0 does not force', () => {
    expect(decideDevice({ ...base, search: '?touch=0&phone=0' })).toEqual({ touch: false, phone: false });
  });
});

// Stage 54: the development trial flag `?tablet=phone` (the phone layout on a tablet).
describe('?tablet=phone (trial)', () => {
  const ipad = { ...base, coarse: true, screenWidth: 820, screenHeight: 1180 };
  it('without the flag a tablet is touch, not phone', () => {
    expect(decideDevice(ipad)).toEqual({ touch: true, phone: false });
    expect(tabletPhoneTrial('')).toBe(false);
    expect(tabletPhoneTrial(null)).toBe(false);
  });
  it('forces the phone flag on a tablet, and on a desktop (phone implies touch)', () => {
    expect(decideDevice({ ...ipad, search: '?tablet=phone' })).toEqual({ touch: true, phone: true });
    expect(decideDevice({ ...base, search: '?replay&tablet=phone' })).toEqual({ touch: true, phone: true });
  });
  it('only the value `phone` is the trial', () => {
    for (const search of ['?tablet', '?tablet=1', '?tablet=0', '?tablet=desktop', '?tablet=Phone', '?phone=1', '?touch=1']) {
      expect(tabletPhoneTrial(search)).toBe(false);
    }
    expect(decideDevice({ ...ipad, search: '?tablet=1' })).toEqual({ touch: true, phone: false });
    expect(tabletPhoneTrial('?fixture=gmcp-demo.log&speed=0&tablet=phone')).toBe(true);
  });
});
