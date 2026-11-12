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

// ADR 0140: a tablet uses the phone's game layout on a window of any size;
// the phone flag alone (`?phone=1`) keeps the 600 px rule.

describe('phoneGameWanted', () => {
  const win = (innerWidth: number, innerHeight: number) => ({ innerWidth, innerHeight });
  const phone = { touch: true, phone: true, tablet: false };
  const tablet = { touch: true, phone: true, tablet: true };

  it('the phone flag on a phone-size window', () => {
    expect(phoneGameWanted(phone, win(390, 844))).toBe(true);
    expect(phoneGameWanted(phone, win(844, 390))).toBe(true);
    expect(phoneGameWanted(phone, null)).toBe(true);
    expect(phoneGameWanted({ phone: true }, win(390, 844))).toBe(true);
  });

  it('the phone flag alone (`?phone=1`) on a desktop- or tablet-size window keeps the old phone layout', () => {
    expect(phoneGameWanted(phone, win(1280, 720))).toBe(false);
    expect(phoneGameWanted(phone, win(820, 1180))).toBe(false);
    expect(phoneGameWanted({ phone: true }, win(600, 600))).toBe(false);
  });

  it('a tablet uses it whatever the window\'s size: portrait, landscape, a narrow split window', () => {
    expect(phoneGameWanted(tablet, win(820, 1180))).toBe(true);
    expect(phoneGameWanted(tablet, win(1180, 820))).toBe(true);
    expect(phoneGameWanted(tablet, win(320, 1180))).toBe(true);
    expect(phoneGameWanted(tablet, win(1920, 1080))).toBe(true);
  });

  it('never without the phone flag (a desktop; a tablet sent back with `?tablet=desktop`)', () => {
    expect(phoneGameWanted({ phone: false, tablet: false }, win(390, 844))).toBe(false);
    expect(phoneGameWanted({ phone: false, tablet: false }, win(820, 1180))).toBe(false);
  });
});
