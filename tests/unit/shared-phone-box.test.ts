// Stage 73 part B (ADR 0160 addendum): a shared run on a phone or tablet.
// The fight card is off (`sharedPhoneSettings`), the lens is half as large
// again on a phone (`lensReplayScaledPx`), and the floating box is kept
// inside the visible part of the window (`boxLift`, `visibleBox`).
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/settings';
import { SHARED_PHONE_LENS_SCALE, sharedPhoneSettings } from '../../src/app/player-host';
import { LENS_SCALED_MAX_PX, lensReplayPx, lensReplayScaledPx } from '../../src/phone/lens-zoom';
import { boxLift, visibleBox } from '../../src/player/view';

describe('a shared run on a phone: the settings', () => {
  it('turns the fight card off', () => {
    const s = defaultSettings();
    expect(s.phone.fightCard).toBe(true);
    sharedPhoneSettings(s);
    expect(s.phone.fightCard).toBe(false);
  });
});

describe('lensReplayScaledPx', () => {
  it("is the run log player's size at a scale of 1, or none usable", () => {
    for (const [w, h, land] of [
      [412, 760, false],
      [800, 380, true],
      [820, 1100, false],
    ] as const) {
      expect(lensReplayScaledPx(w, h, land, 1)).toBe(lensReplayPx(w, h, land));
      expect(lensReplayScaledPx(w, h, land, Number.NaN)).toBe(lensReplayPx(w, h, land));
      expect(lensReplayScaledPx(w, h, land, 0.5)).toBe(lensReplayPx(w, h, land));
    }
  });

  it('is half as large again on a phone upright, within half the width', () => {
    // 376 px wide: 124 − 16 = 108 → 162; half the width less the rings is 172.
    expect(lensReplayPx(376, 760, false)).toBe(108);
    expect(lensReplayScaledPx(376, 760, false, SHARED_PHONE_LENS_SCALE)).toBe(162);
    // 320 px: the least (96) → 144; half the width less the rings is 144.
    expect(lensReplayScaledPx(320, 600, false, SHARED_PHONE_LENS_SCALE)).toBe(144);
  });

  it('on its side: within two thirds of the height, never over the largest', () => {
    // 380 px high: 190 − 16 = 174 → 261; two thirds less the rings is 234.
    expect(lensReplayPx(800, 380, true)).toBe(174);
    expect(lensReplayScaledPx(800, 380, true, SHARED_PHONE_LENS_SCALE)).toBe(234);
    // Tall enough: the largest.
    expect(lensReplayScaledPx(900, 600, true, SHARED_PHONE_LENS_SCALE)).toBe(LENS_SCALED_MAX_PX);
  });

  it("is never smaller than the run log player's", () => {
    for (let w = 280; w <= 1200; w += 13) {
      for (const land of [false, true]) {
        const W = land ? w : Math.round(w / 2);
        const H = land ? Math.round(w / 2) : w;
        expect(lensReplayScaledPx(W, H, land, SHARED_PHONE_LENS_SCALE)).toBeGreaterThanOrEqual(lensReplayPx(W, H, land));
      }
    }
  });
});

describe('boxLift', () => {
  const vis = { left: 0, top: 0, right: 1180, bottom: 820 };
  it('is nothing where the root is inside the visible part', () => {
    expect(boxLift({ left: 0, top: 0, right: 1180, bottom: 820 }, vis)).toEqual({ bottom: 0, right: 0 });
    expect(boxLift({ left: 10, top: 10, right: 300, bottom: 400 }, vis)).toEqual({ bottom: 0, right: 0 });
  });

  it('lifts and moves in by what reaches past it, whole px', () => {
    // iPadOS after a turn in fullscreen: laid out taller (and wider) than what shows.
    expect(boxLift({ left: 0, top: 0, right: 1180.4, bottom: 1024 }, { left: 0, top: 0, right: 1180, bottom: 796.5 })).toEqual({ bottom: 228, right: 1 });
  });

  it('ignores numbers that are not', () => {
    expect(boxLift({ left: 0, top: 0, right: Number.NaN, bottom: 900 }, { left: 0, top: 0, right: 100, bottom: Number.NaN })).toEqual({ bottom: 0, right: 0 });
  });
});

describe('visibleBox', () => {
  const win = (o: { iw: number; ih: number; vv?: { offsetLeft: number; offsetTop: number; width: number; height: number } }): Window =>
    ({ innerWidth: o.iw, innerHeight: o.ih, visualViewport: o.vv ?? null }) as unknown as Window;

  it('is the layout viewport without a visual viewport', () => {
    expect(visibleBox(win({ iw: 820, ih: 1180 }))).toEqual({ left: 0, top: 0, right: 820, bottom: 1180 });
  });

  it('is the visual viewport, never past the layout viewport', () => {
    expect(visibleBox(win({ iw: 1180, ih: 1024, vv: { offsetLeft: 0, offsetTop: 0, width: 1180, height: 820 } }))).toEqual({ left: 0, top: 0, right: 1180, bottom: 820 });
    expect(visibleBox(win({ iw: 1180, ih: 800, vv: { offsetLeft: 0, offsetTop: 10, width: 1180, height: 820 } }))).toEqual({ left: 0, top: 10, right: 1180, bottom: 800 });
  });

  it('falls back to the layout viewport for an empty visual viewport', () => {
    expect(visibleBox(win({ iw: 400, ih: 800, vv: { offsetLeft: 0, offsetTop: 0, width: 0, height: 0 } }))).toEqual({ left: 0, top: 0, right: 400, bottom: 800 });
  });
});
