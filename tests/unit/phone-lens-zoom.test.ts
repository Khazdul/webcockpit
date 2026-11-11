import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN, pxPerRoom } from '../../src/map/view';
import { LENS_FULL_MAX_PX, LENS_FULL_MIN_PX, LENS_LEVELS, LENS_MIN_PX, LENS_ROOMS, PX_PER_ROOM, lensFullPx, lensLabel, lensLevel, lensZoom, nextLevel } from '../../src/phone/lens-zoom';
import { PHONE_LENS_LEVELS } from '../../src/settings/types';

/** Every diameter the lens can have: from its least, shrunk, to the largest full size. */
const SIZES = [LENS_MIN_PX, 102, 119, 136, 150, 163, LENS_FULL_MAX_PX];

describe('the lens zoom levels', () => {
  it('are the settings\' levels', () => {
    expect([...LENS_LEVELS]).toEqual([...PHONE_LENS_LEVELS]);
  });

  it('a room is 44 px wide at zoom 1 on the player\'s layer, as the worker draws it', () => {
    expect(pxPerRoom(1, 0)).toBe(PX_PER_ROOM);
  });

  it('show about 3, 5 and 10 rooms across the lens, whatever its size', () => {
    expect(LENS_ROOMS).toEqual({ near: 3, middle: 5, far: 10 });
    for (const px of SIZES) {
      for (const level of LENS_LEVELS) {
        expect(px / pxPerRoom(lensZoom(level, px), 0)).toBeCloseTo(LENS_ROOMS[level], 9);
      }
    }
  });

  it('the 150 px lens: 1.136, 0.682 and 0.341', () => {
    expect(lensZoom('near', 150)).toBeCloseTo(1.1364, 4);
    expect(lensZoom('middle', 150)).toBeCloseTo(0.6818, 4);
    expect(lensZoom('far', 150)).toBeCloseTo(0.3409, 4);
  });

  it('every level of every size is inside the worker\'s zoom limits', () => {
    for (const px of SIZES) {
      for (const level of LENS_LEVELS) {
        const z = lensZoom(level, px);
        expect(z).toBeGreaterThan(ZOOM_MIN);
        expect(z).toBeLessThan(ZOOM_MAX);
      }
    }
  });

  it('a tap steps near → middle → far → near', () => {
    expect(nextLevel('near')).toBe('middle');
    expect(nextLevel('middle')).toBe('far');
    expect(nextLevel('far')).toBe('near');
  });

  it('the full size is a share of the short side: 150 at 360, 163 at 390, within 130 to 190', () => {
    expect(lensFullPx(360)).toBe(150);
    expect(lensFullPx(390)).toBe(163);
    expect(lensFullPx(412)).toBe(172);
    expect(lensFullPx(320)).toBe(133);
    expect(lensFullPx(300)).toBe(LENS_FULL_MIN_PX);
    expect(lensFullPx(200)).toBe(130);
    expect(lensFullPx(456)).toBe(190);
    expect(lensFullPx(600)).toBe(LENS_FULL_MAX_PX);
    // Nothing to go by: the mockups' 150.
    expect(lensFullPx(0)).toBe(150);
    expect(lensFullPx(Number.NaN)).toBe(150);
    expect(lensFullPx(Number.POSITIVE_INFINITY)).toBe(150);
    expect(LENS_MIN_PX).toBe(96);
  });

  it('the zoom follows the diameter: the same rooms across at every size', () => {
    expect(lensZoom('middle', 96) / lensZoom('middle', 150)).toBeCloseTo(96 / 150, 9);
  });

  it('an unknown level is middle; the label names the level', () => {
    expect(lensLevel('far')).toBe('far');
    expect(lensLevel('closest')).toBe('middle');
    expect(lensLabel('near')).toBe('Map, near zoom. Tap to zoom');
  });
});
