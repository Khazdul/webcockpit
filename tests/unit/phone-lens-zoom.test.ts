import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN, pxPerRoom } from '../../src/map/view';
import { LENS_LEVELS, LENS_PX, LENS_ROOMS, PX_PER_ROOM, lensLabel, lensLevel, lensPx, lensZoom, nextLevel } from '../../src/phone/lens-zoom';
import { PHONE_LENS_LEVELS, PHONE_LENS_SIZES } from '../../src/settings/types';

describe('the lens zoom levels', () => {
  it('are the settings\' levels and sizes', () => {
    expect([...LENS_LEVELS]).toEqual([...PHONE_LENS_LEVELS]);
    expect(Object.keys(LENS_PX)).toEqual([...PHONE_LENS_SIZES]);
  });

  it('a room is 44 px wide at zoom 1 on the player\'s layer, as the worker draws it', () => {
    expect(pxPerRoom(1, 0)).toBe(PX_PER_ROOM);
  });

  it('show about 3, 5 and 10 rooms across the lens, whatever its size', () => {
    expect(LENS_ROOMS).toEqual({ near: 3, middle: 5, far: 10 });
    for (const px of Object.values(LENS_PX)) {
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
    for (const px of Object.values(LENS_PX)) {
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

  it('sizes: S 120, M 150, L 180; an unknown size is M', () => {
    expect(lensPx('s')).toBe(120);
    expect(lensPx('m')).toBe(150);
    expect(lensPx('l')).toBe(180);
    expect(lensPx('xl')).toBe(150);
    expect(lensPx('constructor')).toBe(150);
  });

  it('an unknown level is middle; the label names the level', () => {
    expect(lensLevel('far')).toBe('far');
    expect(lensLevel('closest')).toBe('middle');
    expect(lensLabel('near')).toBe('Map, near zoom. Tap to zoom');
  });
});
