// Sunrise / sunset beams (owner feedback 37, ADR 0091): a few beams spread
// over the sun's ray fan, which moves slowly (owner items 78, 79); the frame lines glint exactly where a beam crosses them.

import { describe, expect, it } from 'vitest';
import { BEAMS, BEAM_INSIDE, type Beam, type BeamHit, FAN_SLOTS, RAY_SLOTS, SUN_RISE_PSI, SUN_SET_PSI, SUN_TURN_HORIZON, beamHits, beamPieces, notchPieces, sunBeams, sunDrift, sunMid, sunPoint, sunPsi, rayTier, turnFan, turnRayAngle } from '../../src/weather/worker/beams';
import { TURN_RAY_N, type TurnKind, turnProgress } from '../../src/weather/sunturn';
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

describe('sun beams and the ray fan (owner items 78, 79)', () => {
  const S = new Float32Array(2), F = new Float32Array(2);
  /** The sun and its fan for a turn at `s` (seconds to the turn's second). */
  const fanAt = (kind: TurnKind, s: number, w = W, h = H): void => {
    const psi = sunPsi(kind, turnProgress(s));
    sunPoint(psi, w, h, S);
    turnFan(psi, S[0]!, S[1]!, w, h, F);
  };
  /** Every thin ray's and beam's angle at `s` (T = s + 100). */
  const angles = (kind: TurnKind, s: number, w = W, h = H): number[] => {
    fanAt(kind, s, w, h);
    const out: number[] = [];
    for (let i = 0; i < TURN_RAY_N; i++) out.push(turnRayAngle(i, F[0]!, F[1]!, s + 100));
    const b: Beam[] = [];
    sunBeams(s + 100, F[0]!, F[1]!, b);
    for (const x of b) out.push(x.a);
    return out;
  };
  /** The light's angle above the horizontal (degrees; + up), for a ray toward the screen. */
  const up = (a: number): number => (Math.atan2(-Math.sin(a), Math.abs(Math.cos(a))) * 180) / Math.PI;

  it('spreads a few beams over the whole fan between the rays, of about one strength', () => {
    const out: Beam[] = [];
    sunBeams(0, 2, 3, out);
    expect(out).toHaveLength(BEAMS);
    expect(BEAMS).toBeGreaterThanOrEqual(2);
    expect(BEAMS).toBeLessThanOrEqual(4);
    const mid = out[1]!;
    for (const b of out) expect(b.k).toBeLessThanOrEqual(mid.k + 1e-9);
    // a little stronger than the rays, not much (owner item 80): none much weaker than the middle one
    for (const b of out) expect(b.k).toBeGreaterThan(mid.k * 0.65);
    // over the whole fan, swaying with every ray (owner item 68)
    expect(mid.a - sunDrift(0)).toBeCloseTo(2.5, 2);
    expect(out[0]!.a - sunDrift(0)).toBeCloseTo(2 + 3.5 / FAN_SLOTS, 2);
    expect(out[2]!.a - sunDrift(0)).toBeCloseTo(2 + 11.5 / FAN_SLOTS, 2);
  });

  it('interleaves the tiers evenly: beam, weak, middle, weak, beam … (owner item 80)', () => {
    expect(RAY_SLOTS).toHaveLength(TURN_RAY_N);
    expect(FAN_SLOTS).toBe(TURN_RAY_N + BEAMS);
    const tiers = Array.from({ length: FAN_SLOTS }, (_, k) => (RAY_SLOTS.includes(k) ? rayTier(RAY_SLOTS.indexOf(k)) : 'S')).join('');
    // never two of a tier side by side; beams apart by a third of the fan
    for (let k = 1; k < tiers.length; k++) expect(tiers[k]).not.toBe(tiers[k - 1]);
    const at = [...tiers].flatMap((c, k) => (c === 'S' ? [k] : []));
    expect(at).toHaveLength(BEAMS);
    for (let k = 1; k < at.length; k++) expect(at[k]! - at[k - 1]!).toBeGreaterThanOrEqual(FAN_SLOTS / 4);
    expect(tiers.split('m').length - 1).toBeGreaterThanOrEqual(3);
    expect(tiers.split('w').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('spreads the rays and beams evenly: no two closer than 0.75 of an even step, none further than 1.25', () => {
    const b: Beam[] = [];
    sunBeams(0, 0, 1, b);
    const a = [...Array.from({ length: TURN_RAY_N }, (_, i) => turnRayAngle(i, 0, 1, 0)), ...b.map((x) => x.a)].map((x) => x - sunDrift(0)).sort((x, y) => x - y);
    const step = 1 / FAN_SLOTS;
    for (let i = 1; i < a.length; i++) {
      expect(a[i]! - a[i - 1]!).toBeGreaterThan(step * 0.75);
      expect(a[i]! - a[i - 1]!).toBeLessThan(step * 1.25);
    }
    expect(a[0]!).toBeGreaterThan(0);
    expect(a.at(-1)!).toBeLessThan(1);
  });

  it('a sunrise starts sideways and down; later some rays point up; a sunset ends the same way at the left', () => {
    for (const [kind, s] of [['rise', -59], ['set', -1]] as const) {
      const u = angles(kind, s).map(up);
      // at most a few degrees up, most of them level or down
      for (const x of u) expect(x).toBeLessThan(2.5);
      expect(u.filter((x) => x <= 0.5).length).toBeGreaterThanOrEqual(Math.ceil(u.length / 2));
      // from the right in the morning, from the left in the evening
      for (const a of angles(kind, s)) expect(Math.sign(Math.cos(a))).toBe(kind === 'rise' ? -1 : 1);
    }
    // further into the sunrise a few point up, toward the top-left corner
    const u = angles('rise', -40).map(up);
    expect(Math.max(...u)).toBeGreaterThan(2.5);
    expect(u.filter((x) => x > 1).length).toBeGreaterThanOrEqual(1);
  });

  it('spans from about level to steeply down, nearly straight down at the high sun (owner items 80, 81)', () => {
    for (const [w, h] of [[2000, 1150], [1400, 800], [2560, 1100]] as const) {
      for (const [kind, s0, s1] of [['rise', -59, -1], ['set', -1, -59]] as const) {
        // the low sun: from about level to 35° down or more
        let u = angles(kind, s0, w, h).map(up);
        expect(Math.min(...u)).toBeLessThan(-35);
        expect(Math.max(...u)).toBeGreaterThan(-5);
        // midway: past 55° down; the high sun: past 75° down
        u = angles(kind, -30, w, h).map(up);
        expect(Math.min(...u)).toBeLessThan(-55);
        expect(Math.max(...u)).toBeGreaterThan(-5);
        expect(Math.min(...angles(kind, s1, w, h).map(up))).toBeLessThan(-75);
      }
    }
  });

  it('never moves fast: every ray and beam under 1°/s through both turns, at any window size', () => {
    let worst = 0;
    for (const [w, h] of [[1600, 900], [1400, 800], [1280, 720], [1920, 1080], [2560, 1100], [900, 1000]] as const) {
      for (const kind of ['rise', 'set'] as const) {
        const dt = 0.05;
        let prev = angles(kind, -60, w, h);
        for (let s = -60 + dt; s <= 0; s += dt) {
          const cur = angles(kind, s, w, h);
          for (let i = 0; i < cur.length; i++) worst = Math.max(worst, (Math.abs(cur[i]! - prev[i]!) / dt) * (180 / Math.PI));
          prev = cur;
        }
      }
    }
    expect(worst).toBeLessThan(1);
  });
});

describe('one sun (owner items 65-67)', () => {
  const o = new Float32Array(2);
  /** The light's angle from the horizontal as it reaches the screen's middle, degrees. */
  const elev = (psi: number): number => {
    sunPoint(psi, W, H, o);
    const a = sunMid(o[0]!, o[1]!, W, H);
    return (Math.atan2(Math.sin(a), Math.abs(Math.cos(a))) * 180) / Math.PI;
  };

  it('a sunrise climbs from the horizon at the right to where the day\'s glimpses start; a sunset sinks from there to the left', () => {
    expect(sunPsi('rise', 0)).toBe(0);
    expect(sunPsi('rise', 1)).toBeCloseTo(sunPsi('day', 0), 9);
    expect(sunPsi('day', 1)).toBeCloseTo(sunPsi('set', 0), 9);
    expect(sunPsi('set', 1)).toBeCloseTo(Math.PI, 9);
    // the light's angle seen across the screen
    expect(elev(sunPsi('rise', 0))).toBeCloseTo(0, 6);
    expect(elev(sunPsi('day', 0))).toBeCloseTo((SUN_RISE_PSI * 180) / Math.PI, 3);
    expect(elev(sunPsi('set', 0))).toBeLessThanOrEqual(45);
    // the sunset ends at the turn horizon on the left, its light coming in level (item 75)
    expect(elev(sunPsi('set', 1))).toBeCloseTo(0, 6);
    // from the right in the morning, from the left in the evening, from above at midday
    sunPoint(sunPsi('rise', 0), W, H, o);
    expect(o[0]).toBeGreaterThan(W);
    sunPoint(sunPsi('day', 0.05), W, H, o);
    expect([o[0]! > W / 2, o[1]! < 0]).toEqual([true, true]);
    sunPoint(sunPsi('day', 0.5), W, H, o);
    expect(o[0]).toBeCloseTo(W / 2, 3);
    sunPoint(sunPsi('day', 0.95), W, H, o);
    expect(o[0]).toBeLessThan(W / 2);
    sunPoint(sunPsi('set', 1), W, H, o);
    expect(o[0]).toBeLessThan(0);
    expect(o[1]).toBeCloseTo(H * SUN_TURN_HORIZON, 3);
    // one horizon for both: the sunrise starts at the same height on the right, a third up from the bottom
    sunPoint(sunPsi('rise', 0), W, H, o);
    expect(o[1]).toBeCloseTo(H * SUN_TURN_HORIZON, 3);
    expect(SUN_TURN_HORIZON).toBeGreaterThanOrEqual(0.6);
    expect(SUN_TURN_HORIZON).toBeLessThanOrEqual(0.7);
    // and it gets there evenly: the angle moves at one pace through a turn (items 71, 72)
    expect(sunPsi('set', 0.5) - sunPsi('set', 0.25)).toBeCloseTo(sunPsi('set', 0.25) - sunPsi('set', 0), 9);
    expect(sunPsi('rise', 0.5) - sunPsi('rise', 0.25)).toBeCloseTo(sunPsi('rise', 0.25) - sunPsi('rise', 0), 9);
    expect(SUN_SET_PSI).toBeLessThanOrEqual(Math.PI / 4);
  });

  it('moves smoothly: no jump between the turns and the day, and always outside the screen', () => {
    const path: number[] = [];
    for (let i = 0; i <= 100; i++) path.push(sunPsi('rise', i / 100));
    for (let i = 0; i <= 100; i++) path.push(sunPsi('day', i / 100));
    for (let i = 0; i <= 100; i++) path.push(sunPsi('set', i / 100));
    for (let i = 1; i < path.length; i++) {
      expect(path[i]!).toBeGreaterThanOrEqual(path[i - 1]! - 1e-12);
      expect(path[i]! - path[i - 1]!).toBeLessThan(0.05);
    }
    for (const psi of path) {
      sunPoint(psi, W, H, o);
      expect(o[0]! > W || o[0]! < 0 || o[1]! < 0).toBe(true);
    }
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

  it('glints only on the first pane it meets: a pane behind it along the beam gets nothing (owner item 86)', () => {
    const near = pane(500, 300, 200, 100), far = pane(700, 600, 300, 200);
    const b = at(600, 300);
    // alone, the far pane is hit where the beam reaches it
    const alone = beamHits([far], sx, sy, b, []);
    expect(alone.find((h) => h.enter)).toMatchObject({ side: 't', att: 1 });
    expect(alone.find((h) => h.enter)!.c).toBeCloseTo(720, 3);
    // behind the near pane it gets nothing; the near pane both its lines
    for (const panes of [[near, far], [far, near]]) {
      const h = beamHits(panes, sx, sy, b, []);
      expect(h.every((x) => x.p === near)).toBe(true);
      expect(h[0]).toMatchObject({ side: 't', enter: true });
      expect(h.at(-1)!.enter).toBe(false);
    }
    // a beam that misses the near pane reaches the far one
    const past = beamHits([near, far], sx, sy, at(950, 600), []);
    expect(past.length).toBeGreaterThan(0);
    expect(past.every((x) => x.p === far)).toBe(true);
  });

  it('a float over a docked pane: the one the beam meets first glints, the other not', () => {
    const back = pane(500, 300, 400, 200), fl = pane(600, 250, 100, 100);
    // the beam meets the float's top first (y 250): only the float, its far line inside the docked pane weaker
    const hits = beamHits([back, fl], sx, sy, at(650, 300), []);
    expect(hits.every((h) => h.p === fl)).toBe(true);
    expect(hits[0]).toMatchObject({ side: 't', enter: true, att: 1 });
    expect(hits.find((h) => !h.enter)!.att).toBe(BEAM_INSIDE);
    // a float lower down inside the docked pane: the docked pane is met first
    const low = pane(600, 380, 100, 80);
    const h2 = beamHits([low, back], sx, sy, at(650, 300), []);
    expect(h2.length).toBeGreaterThan(0);
    expect(h2.every((h) => h.p === back)).toBe(true);
    expect(h2[0]).toMatchObject({ side: 't', enter: true });
  });

  it('a borderless pane is passed over: the pane under it glints, not weaker (owner item 53)', () => {
    const back = pane(500, 300, 400, 200), fl = { ...pane(600, 250, 100, 100), border: 0 };
    const onBack = beamHits([back, fl], sx, sy, at(650, 300), []).find((h) => h.p === back && h.side === 't')!;
    expect(onBack.att).toBe(1);
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
