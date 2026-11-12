// @vitest-environment happy-dom
// Stage 51 (ADR 0136 §1): the phone's game layout is used on a phone-size
// window only; a phone flag forced on a desktop-size window keeps the old
// phone layout (the desktop projects' specs of the Options frames).
import { describe, expect, it } from 'vitest';
import { phoneGameWanted, phoneSizeWindow } from '../../src/app/shell';

describe('phoneSizeWindow', () => {
  it('a phone in portrait or landscape: the short side is under 600 px', () => {
    expect(phoneSizeWindow({ innerWidth: 390, innerHeight: 844 })).toBe(true);
    expect(phoneSizeWindow({ innerWidth: 844, innerHeight: 390 })).toBe(true);
    expect(phoneSizeWindow({ innerWidth: 412, innerHeight: 400 })).toBe(true);
    expect(phoneSizeWindow({ innerWidth: 599, innerHeight: 1200 })).toBe(true);
  });

  it('a desktop-size window is not', () => {
    expect(phoneSizeWindow({ innerWidth: 1280, innerHeight: 720 })).toBe(false);
    expect(phoneSizeWindow({ innerWidth: 600, innerHeight: 600 })).toBe(false);
  });

  it('an unknown size counts as a phone\'s', () => {
    expect(phoneSizeWindow(null)).toBe(true);
    expect(phoneSizeWindow({ innerWidth: 0, innerHeight: 0 })).toBe(true);
    expect(phoneSizeWindow({ innerWidth: Number.NaN, innerHeight: 700 })).toBe(true);
  });
});

// Stage 54: the development trial flag `?tablet=phone` asks for the phone's
// game layout on a window of any size; `?phone=1` alone keeps the 600 px rule.
describe('phoneGameWanted', () => {
  const win = (innerWidth: number, innerHeight: number, search = '') => ({ innerWidth, innerHeight, location: { search } });

  it('the phone flag on a phone-size window', () => {
    expect(phoneGameWanted(true, win(390, 844))).toBe(true);
    expect(phoneGameWanted(true, win(844, 390, '?phone=1'))).toBe(true);
    expect(phoneGameWanted(true, null)).toBe(true);
  });

  it('`?phone=1` on a desktop- or tablet-size window keeps the old phone layout', () => {
    expect(phoneGameWanted(true, win(1280, 720, '?phone=1'))).toBe(false);
    expect(phoneGameWanted(true, win(820, 1180, '?replay&phone=1'))).toBe(false);
    expect(phoneGameWanted(true, win(820, 1180, '?phone=1&tablet=1'))).toBe(false);
  });

  it('`?tablet=phone` uses it on a tablet in portrait and landscape', () => {
    expect(phoneGameWanted(true, win(820, 1180, '?tablet=phone'))).toBe(true);
    expect(phoneGameWanted(true, win(1180, 820, '?replay&tablet=phone'))).toBe(true);
  });

  it('never without the phone flag', () => {
    expect(phoneGameWanted(false, win(390, 844))).toBe(false);
    expect(phoneGameWanted(false, win(820, 1180, '?tablet=phone'))).toBe(false);
  });
});
