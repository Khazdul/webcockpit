import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, ZOOM_MIN, pxPerRoom } from '../../src/map/view';
import { LENS_FULL_MAX_PX, LENS_FULL_MIN_PX, LENS_LEVELS, LENS_MIN_PX, LENS_ROOMS, PX_PER_ROOM, lensFullPx, lensLabel, lensLevel, lensZoom, nextLevel } from '../../src/phone/lens-zoom';
import { PHONE_LENS_LEVELS } from '../../src/settings/types';

/** Diameters the lens can have: from its least, shrunk, to the largest full size, and sizes a user sets (round 53k). */
const SIZES = [LENS_MIN_PX, 102, 119, 136, 150, 163, LENS_FULL_MAX_PX, 336, 700];

describe('the lens zoom levels', () => {
  it('are the settings\' levels', () => {
    expect([...LENS_LEVELS]).toEqual([...PHONE_LENS_LEVELS]);
  });

  it('a room is 44 px wide at zoom 1 on the player\'s layer, as the worker draws it', () => {
    expect(pxPerRoom(1, 0)).toBe(PX_PER_ROOM);
  });

  it('show about 5, 10, 20 and 44 rooms across the lens, whatever its size (round 53k: four levels)', () => {
    expect(LENS_ROOMS).toEqual({ z1: 5, z2: 10, z3: 20, z4: 44 });
    // The first three keep one ratio; the fourth is far more than one such step.
    expect(LENS_ROOMS.z2 / LENS_ROOMS.z1).toBe(LENS_ROOMS.z3 / LENS_ROOMS.z2);
    expect(LENS_ROOMS.z4 / LENS_ROOMS.z3).toBeGreaterThan(LENS_ROOMS.z3 / LENS_ROOMS.z2);
    for (const px of SIZES) {
      for (const level of LENS_LEVELS) {
        expect(px / pxPerRoom(lensZoom(level, px), 0)).toBeCloseTo(LENS_ROOMS[level], 9);
      }
    }
  });

  it('the 150 px lens: 0.682 and 0.341 as 0.6.1\'s middle and far, then 0.170 and 0.077', () => {
    expect(lensZoom('z1', 150)).toBeCloseTo(0.6818, 4);
    expect(lensZoom('z2', 150)).toBeCloseTo(0.3409, 4);
    expect(lensZoom('z3', 150)).toBeCloseTo(0.1705, 4);
    expect(lensZoom('z4', 150)).toBeCloseTo(0.0775, 4);
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

  it('a tap steps one level out, and from the furthest back to the nearest', () => {
    expect(nextLevel('z1')).toBe('z2');
    expect(nextLevel('z2')).toBe('z3');
    expect(nextLevel('z3')).toBe('z4');
    expect(nextLevel('z4')).toBe('z1');
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
    expect(lensZoom('z1', 96) / lensZoom('z1', 150)).toBeCloseTo(96 / 150, 9);
  });

  it('an unknown level is the nearest; the label names the level and its place', () => {
    expect(lensLevel('z3')).toBe('z3');
    expect(lensLevel('closest')).toBe('z1');
    // (0.6.1's names are no levels here: the settings' migration maps them.)
    expect(lensLevel('far')).toBe('z1');
    expect(lensLabel('z1')).toBe('Map, near zoom (1 of 4). Tap to zoom');
    expect(lensLabel('z4')).toBe('Map, area zoom (4 of 4). Tap to zoom');
  });
});
