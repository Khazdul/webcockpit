// Sunrise / sunset beams (owner feedback 37, ADR 0091): a few strong beams
// from the sun; the frame lines glint exactly where a beam crosses them.

import { describe, expect, it } from 'vitest';
import { BEAMS, BEAM_INSIDE, type Beam, type BeamHit, beamAim, beamHits, beamPieces, notchPieces, sunBeams } from '../../src/weather/worker/beams';
import type { FrameBox } from '../../src/weather/worker/glint';

const W = 1600, H = 900;
const pane = (x: number, y: number, w: number, h: number, plate?: { x: number; w: number; y1: number; lip: number; r: number }): FrameBox => ({ x, y, w, h, border: 3, plate });

/** The shoelace area of a flat x, y polygon. */
function area(P: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < P.length; i += 2) {
    const j = (i + 2) % P.length;
    s += P[i]! * P[j + 1]! - P[j]! * P[i + 1]!;
  }
  return Math.abs(s) / 2;
}

describe('sun beams', () => {
  it('makes a bundle of a few beams, the middle one the strongest, aimed across the screen', () => {
    const out: Beam[] = [];
    sunBeams('set', 0.4, 0, W * 0.15, -H * 0.3, W, H, out);
    expect(out).toHaveLength(BEAMS);
    expect(BEAMS).toBeGreaterThanOrEqual(2);
    expect(BEAMS).toBeLessThanOrEqual(4);
    const mid = out[1]!;
    for (const b of out) expect(b.k).toBeLessThanOrEqual(mid.k + 1e-9);
    // a sunset from the top left shines down and to the right
    expect(Math.cos(mid.a)).toBeGreaterThan(0);
    expect(Math.sin(mid.a)).toBeGreaterThan(0);
    sunBeams('rise', 0.4, 0, W * 1.02, -H * 0.1, W, H, out);
    expect(Math.cos(out[1]!.a)).toBeLessThan(0);
  });

  it('sweeps the aim across the screen over the moment', () => {
    const a = new Float32Array(2), b = new Float32Array(2);
    beamAim('set', 0.1, W, H, a);
    beamAim('set', 0.9, W, H, b);
    expect(b[0]!).toBeGreaterThan(a[0]!);
    expect(b[1]!).toBeLessThan(a[1]!);
  });
});

describe('beam hits on frame lines', () => {
  const sx = 400, sy = -200;
  /** A beam from the sun straight at (x, y). */
  const at = (x: number, y: number, hw = 0.01): Beam => ({ a: Math.atan2(y - sy, x - sx), hw, k: 1 });

  it('enters through the top line where the beam crosses it, and leaves through the far line', () => {
    const p = pane(500, 300, 400, 200);
    const hits = beamHits([p], sx, sy, at(650, 300), []);
    expect(hits[0]).toMatchObject({ side: 't', enter: true, att: 1 });
    expect(hits[0]!.c).toBeCloseTo(650, 3);
    // the beam's width on the line: about 2 · t · tan(hw) / sin(angle)
    const t = Math.hypot(650 - sx, 300 - sy), s = (300 - sy) / t;
    expect(hits[0]!.len).toBeCloseTo((2 * t * Math.tan(0.01)) / s, 3);
    expect(hits.at(-1)!.enter).toBe(false);
    expect(['b', 'r']).toContain(hits.at(-1)!.side);
    expect(hits.filter((h) => h.enter)).toHaveLength(1);
  });

  it('hits a side line when the beam comes in from the side', () => {
    const p = pane(900, 100, 300, 600);
    const hits = beamHits([p], sx, sy, at(900, 400), []);
    expect(hits[0]).toMatchObject({ side: 'l', enter: true });
    expect(hits[0]!.c).toBeCloseTo(400, 3);
  });

  it('depends on where the pane is: a pane the beam misses gets nothing; borderless panes never', () => {
    const b = at(650, 300);
    expect(beamHits([pane(1100, 300, 200, 200)], sx, sy, b, [])).toHaveLength(0);
    expect(beamHits([{ ...pane(500, 300, 400, 200), border: 0 }], sx, sy, b, [])).toHaveLength(0);
    // move the pane under the beam and it is hit
    const hits: BeamHit[] = [];
    expect(beamHits([pane(1100, 300, 200, 200)], sx, sy, at(1200, 300), hits).length).toBeGreaterThan(0);
  });

  it('is weaker inside another pane (a float over a docked pane), not behind one', () => {
    const back = pane(500, 300, 400, 200), fl = pane(600, 250, 100, 100);
    const hits = beamHits([back, fl], sx, sy, at(650, 300), []);
    const onBack = hits.find((h) => h.p === back && h.side === 't')!;
    expect(onBack.att).toBe(BEAM_INSIDE);
    // two panes one behind the other along the beam: the far one is not shadowed
    const near = pane(500, 300, 200, 100), far = pane(700, 600, 300, 200);
    const b2 = at(600, 300);
    const h2 = beamHits([near, far], sx, sy, b2, []);
    const farHit = h2.find((h) => h.p === far && h.enter)!;
    expect(farHit).toMatchObject({ side: 't', att: 1 });
    expect(farHit.c).toBeCloseTo(720, 3);
  });
});

describe('beam pieces', () => {
  it('cuts a beam into convex pieces inside and outside the boxes that tile it', () => {
    const tri = [400, -200, 900, 1000, 1000, 1000];
    const inside: number[][] = [], outside: number[][] = [];
    beamPieces(tri, [[500, 300, 900, 500], [1200, 0, 1500, 100]], inside, outside);
    expect(inside.length).toBeGreaterThan(0);
    const sum = [...inside, ...outside].reduce((s, P) => s + area(P), 0);
    expect(sum).toBeCloseTo(area(tri), 3);
    // each inside piece lies in the box
    for (const P of inside)
      for (let i = 0; i < P.length; i += 2) {
        expect(P[i]!).toBeGreaterThanOrEqual(500 - 1e-6);
        expect(P[i]!).toBeLessThanOrEqual(900 + 1e-6);
        expect(P[i + 1]!).toBeGreaterThanOrEqual(300 - 1e-6);
        expect(P[i + 1]!).toBeLessThanOrEqual(500 + 1e-6);
      }
  });

  it('leaves a beam that misses every box whole', () => {
    const tri = [0, 0, 10, 100, 20, 100];
    const inside: number[][] = [], outside: number[][] = [];
    beamPieces(tri, [[500, 300, 900, 500]], inside, outside);
    expect(inside).toHaveLength(0);
    expect(outside).toEqual([tri]);
  });
});

describe('shadow wedge less the nameplate (owner item 42)', () => {
  it('tiles the wedge less the plate with convex pieces, without overlap', () => {
    // A pane's shadow from (100, 106) down: a quad widening away from the sun.
    const P = [100, 106, 400, 106, 700, 900, 50, 900];
    const pieces = notchPieces(P, 130, 106, 190, 117);
    expect(pieces).toHaveLength(3); // left, right, below (nothing of the wedge above the plate)
    const sum = pieces.reduce((a, Q) => a + area(Q), 0);
    expect(sum).toBeCloseTo(area(P) - 60 * 11, 3);
    // No piece covers the plate's middle.
    for (const Q of pieces) {
      let ys = 0;
      for (let i = 1; i < Q.length; i += 2) ys = Math.max(ys, Q[i]!);
      const xs = Q.filter((_, i) => i % 2 === 0);
      const inPlateCols = Math.min(...xs) >= 130 && Math.max(...xs) <= 190;
      if (inPlateCols) expect(Math.min(...Q.filter((_, i) => i % 2 === 1))).toBeGreaterThanOrEqual(117);
    }
  });

  it('keeps the wedge whole when the plate misses it', () => {
    const P = [100, 106, 400, 106, 400, 300, 100, 300];
    const pieces = notchPieces(P, 500, 106, 560, 117);
    expect(pieces.reduce((a, Q) => a + area(Q), 0)).toBeCloseTo(area(P), 3);
  });
});
