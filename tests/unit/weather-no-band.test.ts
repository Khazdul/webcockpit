// @vitest-environment happy-dom
// Stage 51f (ADR 0136 §11): the weather's left band can be switched off (the
// phone's layout in the live game), and is on everywhere else.
import { afterEach, describe, expect, it } from 'vitest';
import { geometryDiff, measureGeometry } from '../../src/weather/geometry';
import type { Geometry } from '../../src/weather/protocol';
import { LEFT_DARK, LEFT_SOLID, bandEnd, bandK, bandSolid, leftBandOn, leftDark, setLeftBand } from '../../src/weather/worker/band';
import { moonAt, moonBandK, moonPath } from '../../src/weather/worker/sky';

afterEach(() => setLeftBand(true));

describe('the left band switched off', () => {
  it('on by default: the band as it was', () => {
    expect(leftBandOn()).toBe(true);
    expect(bandSolid(1000)).toBeCloseTo(1000 * LEFT_DARK * LEFT_SOLID);
    expect(bandEnd(1000)).toBeCloseTo(1000 * LEFT_DARK);
    expect(leftDark(0)).toBe(1);
    expect(bandK(10, 1000)).toBe(0);
    expect(bandK(999, 1000)).toBe(1);
    expect(bandK(550, 1000)).toBeGreaterThan(0);
    expect(bandK(550, 1000)).toBeLessThan(1);
  });

  it('off: no curve and no width, so every effect shows from the left edge', () => {
    setLeftBand(false);
    expect(leftBandOn()).toBe(false);
    expect(bandSolid(390)).toBe(0);
    expect(bandEnd(390)).toBe(0);
    for (const x of [0, 1, 50, 150, 272, 389]) {
      expect(bandK(x, 390)).toBe(1);
      expect(leftDark(x / (390 * LEFT_DARK))).toBe(0);
    }
  });

  it('off: the moon crosses the whole screen and sets beyond the left edge, at full strength all the way', () => {
    setLeftBand(false);
    const W = 390, H = 844, R = 30;
    const P = moonPath(W, H, R), o = new Float32Array(2);
    expect(P.x0).toBe(W + R);
    expect(P.x1).toBe(-R);
    moonAt(P, 1, o);
    expect(o[0]).toBe(-R);
    for (const x of [-R, 0, 1, W / 2, W]) {
      expect(moonBandK(x, W)).toBe(1);
      expect(Number.isNaN(moonBandK(x, W))).toBe(false);
    }
  });

  it('switched back on, everything is as before', () => {
    const before = [bandSolid(800), bandEnd(800), bandK(300, 800), moonPath(800, 600, 30).x1, moonBandK(400, 800)];
    setLeftBand(false);
    setLeftBand(true);
    expect([bandSolid(800), bandEnd(800), bandK(300, 800), moonPath(800, 600, 30).x1, moonBandK(400, 800)]).toEqual(before);
  });
});

describe('the layout tells the worker', () => {
  function host(phoneGame: boolean): { root: HTMLElement; game: HTMLElement } {
    const root = document.createElement('div');
    if (phoneGame) root.setAttribute('data-phone-game', '');
    const game = document.createElement('div');
    root.append(game);
    document.body.append(root);
    return { root, game };
  }

  it('noBand on the phone\'s game layout only; absent elsewhere (desktop, tablet, the old phone layout)', () => {
    expect(measureGeometry(host(true), 1).noBand).toBe(true);
    const desk = measureGeometry(host(false), 1);
    expect(desk.noBand).toBeUndefined();
    expect('noBand' in desk).toBe(false);
  });

  it('a change of it is a layout change; absent and false are the same', () => {
    const g: Geometry = measureGeometry(host(false), 1);
    expect(geometryDiff(g, { ...g })).toBe('none');
    expect(geometryDiff(g, { ...g, noBand: false })).toBe('none');
    expect(geometryDiff(g, { ...g, noBand: true })).toBe('layout');
    expect(geometryDiff({ ...g, noBand: true }, { ...g, noBand: true })).toBe('none');
  });
});
