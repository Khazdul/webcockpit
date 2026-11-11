// @vitest-environment happy-dom
// Stage 51 (ADR 0136 §1): the phone's game layout is used on a phone-size
// window only; a phone flag forced on a desktop-size window keeps the old
// phone layout (the desktop projects' specs of the Options frames).
import { describe, expect, it } from 'vitest';
import { phoneSizeWindow } from '../../src/app/shell';

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
