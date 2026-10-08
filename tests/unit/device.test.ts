import { describe, expect, it } from 'vitest';
import { decideDevice } from '../../src/core/device';

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
