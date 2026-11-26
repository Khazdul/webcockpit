// Stage 69 (ADR 0159): the balloon notices' pure parts: the feed (kills and
// their merge; round 2: level up, death, achievement), the sky lane, the
// flight's phases as functions of time and a seed (round 2: a balloon's
// motion: continuous velocity, a speed cap, the readable spot low, varied
// shrinking); stage 75: the leading burner, the passenger by race, the sky.
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/runs/events';
import { KillRater } from '../../src/runs/kill-rating';
import { ACHIEVEMENT_MAX, FACE_LABEL, type KillNotice, SAMPLE_BURST, bestFace, noticeOf, raterFor, signFor, signOf } from '../../src/weather/balloons/feed';
import {
  type FlightKeys,
  type FlightPlan,
  type LaneGeom,
  BURN_BLAST_IN,
  KEYFRAME_DT,
  flightKeys,
  flightTransform,
  keysAt,
  BURN_LEAD,
  BURN_MIN,
  BURN_STILL,
  READ_EXTEND,
  READ_MAX,
  READ_S,
  VMAX,
  V_ARRIVE,
  burnStep,
  burnTarget,
  canJoin,
  extendRead,
  flightAt,
  flightTotal,
  phaseAt,
  planFlight,
  posAt,
  skyLane,
} from '../../src/weather/balloons/flight';
import { RIG_SIZE } from '../../src/weather/balloons/skin';
import { PASSENGER_IDS, isPassengerId, loadPassenger, passengerOf, raceWords } from '../../src/weather/balloons/passenger';

const kill = (mobName: string, xpDelta: number, us = 1): RunEvent => ({ type: 'kill', us, logUs: us, mobName, xpDelta });

describe('feed', () => {
  it('rates like the Statistics pane: calibrating under 5 kills, then against the median, this kill included; a pkill is PvP', () => {
    const live: RunEvent[] = [];
    const add = (e: RunEvent): KillNotice => {
      live.push(e);
      return noticeOf(e, raterFor([], live)) as KillNotice;
    };
    for (let i = 0; i < 4; i++) expect(add(kill('an orc', 1000)).face).toBe('calibrating');
    expect(add(kill('an orc', 1000)).face).toBe('good');
    expect(add(kill('a troll', 3000)).face).toBe('superb');
    expect(add(kill('a mouse', 100)).face).toBe('poor');
    const pk: RunEvent = { type: 'pkill', us: 9, logUs: 9, name: 'Grimbold', race: 'Orc', xpDelta: 5000 };
    expect(add(pk)).toEqual({ name: '*Grimbold*', xp: 5000, face: 'pvp' });
    expect(noticeOf({ type: 'tp_gained', us: 1, tpDelta: 3 }, raterFor([], live))).toBeNull();
  });

  it("the chain's earlier runs count toward the median", () => {
    const prior = [1, 2, 3, 4, 5].map((i) => kill('an orc', 1000, i));
    expect((noticeOf(kill('an orc', 1000), raterFor(prior, [kill('an orc', 1000)])) as KillNotice).face).toBe('good');
  });

  it('one kill: its name capitalised, the XP, the rating word; none while calibrating', () => {
    expect(signOf([{ name: 'an orc scout', xp: 1900, face: 'good' }])).toEqual({ kind: 'kill', title: 'An orc scout', big: '1,900', unit: 'xp', label: 'Good', more: '', mood: 'good', count: 1 });
    expect(signOf([{ name: 'a mouse', xp: 140, face: 'calibrating' }]).label).toBe('');
    expect(FACE_LABEL.pvp).toBe('PvP');
  });

  it('joined kills: the count, the summed XP, the best face and the last three names', () => {
    const s = signOf(SAMPLE_BURST);
    expect(s).toMatchObject({ title: '4 kills', big: '7,600', mood: 'great', label: 'Great', count: 4 });
    expect(s.more).toBe('an orc scout · a goblin thief · an Uruk-hai tracker · …');
    expect(signOf(SAMPLE_BURST.slice(0, 3)).more).toBe('a goblin thief · an orc scout · a goblin thief');
    expect(bestFace([{ name: 'x', xp: 1, face: 'superb' }, { name: 'y', xp: 1, face: 'pvp' }])).toBe('pvp');
  });

  it('round 2: a level up, a death and an achievement each make their own notice and sign', () => {
    const none = new KillRater();
    expect(noticeOf({ type: 'level_up', us: 1, level: 23 }, none)).toEqual({ kind: 'levelup', level: 23 });
    expect(noticeOf({ type: 'char_death', us: 1, logUs: 1, level: 23 }, none)).toEqual({ kind: 'death', level: 23 });
    expect(noticeOf({ type: 'char_death', us: 1, logUs: 1 }, none)).toEqual({ kind: 'death' });
    expect(noticeOf({ type: 'achievement', us: 1, name: 'you found the hidden valley' }, none)).toEqual({ kind: 'achievement', text: 'you found the hidden valley' });
    expect(noticeOf({ type: 'achievement', us: 1, name: '  ' }, none)).toBeNull();
    expect(signFor([{ kind: 'levelup', level: 23 }])).toMatchObject({ kind: 'levelup', big: 'Level 23!', title: '', label: '', unit: '', mood: 'levelup' });
    expect(signFor([{ kind: 'death' }])).toMatchObject({ kind: 'death', big: 'You died', title: '', mood: 'death' });
    expect(signFor([{ kind: 'achievement', text: 'you found the hidden valley' }])).toMatchObject({ kind: 'achievement', title: 'You found the hidden valley', label: 'Achievement', big: '', mood: 'achievement' });
  });

  it('a long achievement is cut with an ellipsis (the sign also clamps it to four lines)', () => {
    const t = signFor([{ kind: 'achievement', text: 'word '.repeat(60) }]).title;
    expect(t.length).toBeLessThanOrEqual(ACHIEVEMENT_MAX);
    expect(t.endsWith('…')).toBe(true);
  });
});

/** The owner's 1920 × 1080 desktop: the game pane to x 1410, the docked panes right of it. */
const WIDE: LaneGeom = { W: 1920, H: 1080, out: { x: 0, y: 0, w: 1410, h: 1045 }, cell: { w: 9, h: 18 }, protect: { fadeTop: 970 } };
/** A narrow window: the text takes the whole width. */
const NARROW: LaneGeom = { W: 700, H: 800, out: { x: 0, y: 0, w: 700, h: 780 }, cell: { w: 9, h: 18 }, protect: { fadeTop: 700 } };
const PHONE: LaneGeom = { W: 400, H: 800, out: { x: 0, y: 0, w: 400, h: 760 }, cell: { w: 8, h: 16 }, protect: { fadeTop: 690 }, noBand: true };

describe('the sky lane', () => {
  it("a wide screen: the strip right of both the left band and the text's 80-odd columns", () => {
    const l = skyLane(WIDE, RIG_SIZE.w);
    expect(l.sky).toBe(true);
    expect(l.x0).toBeGreaterThanOrEqual(82 * 9);
    expect(l.x0).toBeGreaterThanOrEqual(1920 * 0.56 - 1);
    expect(l.x1).toBe(1912);
  });

  it('too little sky room: the whole width (the distant part then behind the text)', () => {
    expect(skyLane(NARROW, RIG_SIZE.w)).toEqual({ x0: 8, x1: 692, sky: false });
    expect(skyLane(PHONE, RIG_SIZE.w).sky).toBe(false);
  });

  it('on a wide screen every flight keeps to the lane (only the right path leaves over the right edge)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const p = planFlight(seed, WIDE, RIG_SIZE.w, RIG_SIZE.h);
      const lane = p.lane;
      expect(lane.sky).toBe(true);
      for (let t = 0; t < flightTotal(p); t += 0.25) {
        const f = flightAt(p, t);
        const half = (RIG_SIZE.w * f.scale) / 2;
        // the sway may lean a few px past the bound
        expect(f.x - half, `seed ${seed} t ${t}`).toBeGreaterThanOrEqual(lane.x0 - 15);
        if (p.path !== 'right') expect(f.x + half, `seed ${seed} t ${t}`).toBeLessThanOrEqual(lane.x1 + 15);
      }
    }
  });
});

/** Velocity by finite differences of the position, px/s. */
function velocities(p: FlightPlan, from: number, to: number, h: number, at: (p: FlightPlan, t: number) => { x: number; y: number } = posAt): Array<{ t: number; x: number; y: number }> {
  const out = [];
  for (let t = from; t < to - h; t += h) {
    const a = at(p, t), b = at(p, t + h);
    out.push({ t, x: (b.x - a.x) / h, y: (b.y - a.y) / h });
  }
  return out;
}

/** The balloon's middle (its top centre plus half its scaled height): the scale's change shows here too. */
const middle = (p: FlightPlan, t: number) => {
  const f = flightAt(p, t);
  return { x: f.x, y: f.y + (p.bh * f.scale) / 2 };
};

describe('flight', () => {
  const plan = (seed: number, g = WIDE) => planFlight(seed, g, RIG_SIZE.w, RIG_SIZE.h);

  it('the same seed, the same flight; another seed, another', () => {
    expect(plan(7)).toEqual(plan(7));
    expect(flightAt(plan(7), 12.3)).toEqual(flightAt(plan(7), 12.3));
    expect(plan(7)).not.toEqual(plan(8));
  });

  it('phases: a slow arrival, about 3 s readable, an ease into flight, then a drift of up to a minute', () => {
    for (let seed = 1; seed < 100; seed++) {
      const p = plan(seed);
      expect(p.ta).toBeGreaterThanOrEqual(5.5);
      expect(p.ta).toBeLessThanOrEqual(8);
      expect(p.read).toBeGreaterThanOrEqual(READ_S);
      expect(p.read).toBeLessThanOrEqual(READ_S + 0.6);
      expect(p.tg).toBeGreaterThanOrEqual(4);
      expect(p.tg + p.td).toBeLessThanOrEqual(60);
      expect(phaseAt(p, 0)).toBe('arrive');
      expect(phaseAt(p, p.ta + 0.01)).toBe('read');
      expect(phaseAt(p, p.ta + p.read + 0.01)).toBe('glide');
      expect(phaseAt(p, p.ta + p.read + p.tg + 0.01)).toBe('drift');
      expect(phaseAt(p, flightTotal(p))).toBe('done');
    }
  });

  it('rises from below the bottom edge (hidden at first) to a readable spot in the lower part of the screen', () => {
    for (const g of [WIDE, NARROW]) {
      for (let seed = 1; seed < 60; seed++) {
        const p = plan(seed, g);
        const a = flightAt(p, 0), r = flightAt(p, p.ta + 1);
        expect(a.y).toBeGreaterThanOrEqual(g.H);
        expect(r.scale).toBe(p.scale);
        expect(r.opacity).toBe(1);
        expect(r.front).toBe(true);
        // the readable spot: its middle in the lower half, its sign above the prompt's strip
        expect(p.read0.y + (p.bh * p.scale) / 2, `seed ${seed}`).toBeGreaterThan(g.H * 0.5);
        expect(p.read0.y + p.bh * p.scale).toBeLessThanOrEqual(g.protect.fadeTop);
        expect(flightAt(p, p.ta + p.read + 0.1).front).toBe(false);
      }
    }
  });

  it('readable over the game pane, never behind a docked pane: right of the text where there is room, else over its right end', () => {
    // docked panes from x 900: the strip right of the text (from about x 756) is too narrow for a balloon
    const MEDIUM: LaneGeom = { W: 1280, H: 800, out: { x: 0, y: 0, w: 900, h: 780 }, cell: { w: 9, h: 18 }, protect: { fadeTop: 700 } };
    for (const g of [WIDE, NARROW, MEDIUM]) {
      for (let seed = 1; seed < 60; seed++) {
        const p = plan(seed, g);
        const half = (p.bw * p.scale) / 2;
        expect(p.read0.x + half, `seed ${seed}`).toBeLessThanOrEqual(g.out.x + g.out.w);
        expect(p.read0.x - half).toBeGreaterThanOrEqual(0);
        // a second balloon near it keeps clear, still over the game pane
        const q = planFlight(seed, g, RIG_SIZE.w, RIG_SIZE.h, { avoidX: p.read0.x });
        expect(q.read0.x + half, `second, seed ${seed}`).toBeLessThanOrEqual(g.out.x + g.out.w);
        expect(q.read0.x - half).toBeGreaterThanOrEqual(0);
        if (g !== NARROW) expect(Math.abs(q.read0.x - p.read0.x), `second, seed ${seed}`).toBeGreaterThan(150);
      }
    }
  });

  it('nearly at rest while readable: under 25 px/s, the sway included', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = plan(seed);
      for (const v of velocities(p, p.ta + 0.5, p.ta + p.read, 0.05)) expect(Math.hypot(v.x, v.y), `seed ${seed} t ${v.t}`).toBeLessThan(25);
    }
  });

  it('the velocity is continuous over the whole flight: across every phase boundary and a joined kill, no step in speed', () => {
    const h = 1 / 120;
    for (const g of [WIDE, NARROW]) {
      for (let seed = 1; seed < 50; seed++) {
        const p = plan(seed, g);
        // a kill joins during the arrival and another while readable: the read phase grows, the leave starts later
        const joins = [p.ta * 0.5, p.ta + 2];
        let next = 0;
        let worst = { dv: 0, t: 0 }, worstMid = { dv: 0, t: 0 };
        let last: { x: number; y: number } | null = null, lastMid: { x: number; y: number } | null = null;
        let a = posAt(p, 0.01), m0 = middle(p, 0.01);
        for (let t = 0.01; t < flightTotal(p) - 2 * h; t += h) {
          while (next < joins.length && t >= joins[next]!) {
            if (canJoin(p, t)) extendRead(p);
            next++;
          }
          const b = posAt(p, t + h), m1 = middle(p, t + h);
          const v = { x: (b.x - a.x) / h, y: (b.y - a.y) / h }, vm = { x: (m1.x - m0.x) / h, y: (m1.y - m0.y) / h };
          if (last) {
            const dv = Math.hypot(v.x - last.x, v.y - last.y), dm = Math.hypot(vm.x - lastMid!.x, vm.y - lastMid!.y);
            if (dv > worst.dv) worst = { dv, t };
            if (dm > worstMid.dv) worstMid = { dv: dm, t };
          }
          last = v;
          lastMid = vm;
          a = b;
          m0 = m1;
        }
        // a smooth motion changes by acceleration · h (under 50 px/s² here): under 0.5 px/s per step; a jump would be several px/s
        expect(worst.dv, `seed ${seed} t ${worst.t.toFixed(3)} ${phaseAt(p, worst.t)}`).toBeLessThan(0.5);
        expect(worstMid.dv, `middle: seed ${seed} t ${worstMid.t.toFixed(3)} ${phaseAt(p, worstMid.t)}`).toBeLessThan(0.6);
        expect(p.read).toBeGreaterThan(Math.min(READ_MAX, READ_S + 2 * READ_EXTEND) - 0.01);
      }
    }
  });

  it(`never faster than ${VMAX} px/s (a balloon's pace), the arrival under about ${V_ARRIVE} px/s`, () => {
    for (const g of [WIDE, NARROW]) {
      for (let seed = 1; seed < 150; seed++) {
        const p = plan(seed, g);
        const top = Math.max(...velocities(p, 0, flightTotal(p), 1 / 30).map((v) => Math.hypot(v.x, v.y)));
        expect(top, `seed ${seed}`).toBeLessThanOrEqual(VMAX);
        // the arrival's own profile peaks at V_ARRIVE; the sway adds a little
        const arrive = Math.max(...velocities(p, 0, p.ta, 1 / 30).map((v) => Math.hypot(v.x, v.y)));
        expect(arrive, `arrive: seed ${seed}`).toBeLessThanOrEqual(V_ARRIVE + 15);
      }
    }
  });

  it('leaves somewhat faster than it arrived, eased in, shrinking; then a slower drift that ends out of sight or faded', () => {
    for (let seed = 1; seed < 80; seed++) {
      const p = plan(seed);
      const g0 = p.ta + p.read;
      // eased in: slow just after it starts to leave
      const v0 = velocities(p, g0, g0 + 0.5, 0.1)[0]!;
      expect(Math.hypot(v0.x, v0.y)).toBeLessThan(25);
      // shrinks from the leave on, never grows back
      expect(flightAt(p, g0 + p.tg).scale).toBeLessThan(p.scale);
      expect(flightAt(p, flightTotal(p) - 0.01).scale).toBeLessThanOrEqual(flightAt(p, g0 + p.tg).scale);
      // the end: out over the top or the right edge, or faded
      const e = flightAt(p, flightTotal(p) - 0.01);
      const out = e.y + p.bh * e.scale < 0 || e.x - (p.bw * e.scale) / 2 > WIDE.W;
      expect(out || e.opacity < 0.1, `seed ${seed} ${p.path}`).toBe(true);
    }
  });

  it('the shrink varies: some balloons shrink a lot, some only a little', () => {
    const ends = [...Array(120).keys()].map((s) => {
      const p = plan(s + 1);
      return p.sEnd / p.scale;
    });
    expect(Math.min(...ends)).toBeLessThan(0.25);
    expect(Math.max(...ends)).toBeGreaterThan(0.75);
    // spread over the range, not two clumps
    expect(ends.filter((e) => e > 0.4 && e < 0.6).length).toBeGreaterThan(10);
  });

  it('varied: all three leave paths come up', () => {
    const plans = [...Array(80).keys()].map((s) => plan(s + 1));
    expect([...new Set(plans.map((p) => p.path))].sort()).toEqual(['meander', 'right', 'top']);
  });

  it('a joined kill lengthens the readable time, capped; it joins only while readable', () => {
    const p = plan(5);
    const r0 = p.read;
    expect(canJoin(p, 0.2)).toBe(true);
    expect(canJoin(p, p.ta + p.read - 0.1)).toBe(false);
    extendRead(p);
    expect(p.read).toBeCloseTo(r0 + READ_EXTEND, 6);
    for (let i = 0; i < 10; i++) extendRead(p);
    expect(p.read).toBe(READ_MAX);
  });

  it('keeps clear of a balloon still near', () => {
    const a = plan(11);
    const b = planFlight(11, WIDE, RIG_SIZE.w, RIG_SIZE.h, { avoidX: a.read0.x });
    expect(Math.abs(b.read0.x - a.read0.x)).toBeGreaterThan(150);
  });

  it('prefers-reduced-motion: no flight, a fade in place', () => {
    const p = planFlight(4, WIDE, RIG_SIZE.w, RIG_SIZE.h, { reduced: true });
    const xs = [0.2, 2, 5, flightTotal(p) - 0.2].map((t) => flightAt(p, t));
    for (const f of xs) expect([f.x, f.y, f.scale, f.tilt, f.swing, f.front]).toEqual([p.read0.x, p.read0.y, p.scale, 0, 0, true]);
    expect(xs[0]!.opacity).toBeLessThan(1);
    expect(xs[1]!.opacity).toBe(1);
    expect(flightTotal(p)).toBeLessThan(8);
  });

  it('a narrow screen: the readable spot right of the middle, inside the screen', () => {
    const p = plan(2, NARROW);
    expect(p.lane.sky).toBe(false);
    expect(p.read0.x - (RIG_SIZE.w * p.scale) / 2).toBeGreaterThanOrEqual(8);
    expect(p.read0.x + (RIG_SIZE.w * p.scale) / 2).toBeLessThanOrEqual(692);
    expect(p.read0.y + RIG_SIZE.h * p.scale).toBeLessThanOrEqual(NARROW.protect.fadeTop);
  });
});

describe('the flight as keyframes (stage 79, ADR 0168: the compositor plays them)', () => {
  const plan = (seed: number, g = WIDE) => planFlight(seed, g, RIG_SIZE.w, RIG_SIZE.h);
  /** The farthest any point of the balloon's box is from where `flightAt` puts it, px (the origin is the top centre). */
  const off = (p: FlightPlan, k: FlightKeys, t: number): number => {
    const a = keysAt(k, t), f = flightAt(p, t), ds = Math.abs(a.scale - f.scale);
    return Math.max(Math.abs(a.x - f.x) + (p.bw / 2) * ds, Math.abs(a.y - f.y) + p.bh * ds);
  };

  it('every 1/30 s from the launch to the end, in order', () => {
    const p = plan(3), k = flightKeys(p);
    expect(k.end).toBe(flightTotal(p));
    expect(k.keys[0]!.t).toBe(0);
    expect(k.keys.at(-1)!.t).toBe(k.end);
    for (let i = 1; i < k.keys.length; i++) {
      const dt = k.keys[i]!.t - k.keys[i - 1]!.t;
      expect(dt).toBeGreaterThan(1e-6);
      expect(dt).toBeLessThanOrEqual(KEYFRAME_DT + 1e-9);
    }
    expect(k.keys.length).toBe(Math.ceil(k.end / KEYFRAME_DT) + 1);
    for (const s of k.keys) for (const v of [s.x, s.y, s.scale, s.opacity]) expect(Number.isFinite(v)).toBe(true);
  });

  it('linear between two keyframes is within 0.1 px of the flight, for the whole balloon and the whole flight', () => {
    let worst = 0, fade = 0;
    for (const g of [WIDE, NARROW, PHONE]) {
      for (let seed = 1; seed <= 60; seed++) {
        const p = plan(seed, g);
        if (seed % 3 === 0) extendRead(p, p.ta + 1);
        const k = flightKeys(p), end = k.end - 1e-6;
        // off the keyframes' grid: 7 moments in each gap
        for (let t = 0; t < end; t += KEYFRAME_DT / 7.3) {
          worst = Math.max(worst, off(p, k, t));
          fade = Math.max(fade, Math.abs(keysAt(k, t).opacity - flightAt(p, t).opacity));
        }
      }
    }
    expect(worst).toBeLessThan(0.1);
    expect(fade).toBeLessThan(0.005);
  });

  it('the same shape of transform in every keyframe (the browser interpolates function by function), to a thousandth of a px', () => {
    const p = plan(9), k = flightKeys(p);
    const shape = /^translate3d\(-?\d+\.\d{3}px, -?\d+\.\d{3}px, 0\) scale\(\d\.\d{5}\)$/;
    for (const s of k.keys) expect(flightTransform(p.bw, s)).toMatch(shape);
    // the balloon's left edge at scale 1, its top
    expect(flightTransform(204, { x: 500, y: 300.25, scale: 0.5 })).toBe('translate3d(398.000px, 300.250px, 0) scale(0.50000)');
  });

  it('a joined kill changes nothing before now: the keyframes agree up to its time, so the animation does not jump', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = plan(seed);
      // while it arrives, while it is readable, and in the blast's second
      for (const t of [2.2, p.ta + 0.5, p.ta + p.read - 0.5]) {
        const q = structuredClone(p);
        const before = flightKeys(q);
        expect(canJoin(q, t)).toBe(true);
        extendRead(q, t);
        const after = flightKeys(q);
        expect(after.end).toBeCloseTo(before.end + (q.read - p.read), 9);
        expect(flightTransform(q.bw, keysAt(after, t))).toBe(flightTransform(q.bw, keysAt(before, t)));
        expect(keysAt(after, t).opacity).toBe(keysAt(before, t).opacity);
        // and every keyframe up to now is the same one
        const n = before.keys.findIndex((s) => s.t > t);
        expect(after.keys.slice(0, n)).toEqual(before.keys.slice(0, n));
        // after it the new plan's flight
        expect(off(q, after, t + 6)).toBeLessThan(0.1);
      }
    }
  });

  it('a hurried fade: the same path, the opacity down to nothing over the fade, and the keyframes end there', () => {
    for (const at of [1.3, 7.777, 20.01]) {
      const p = plan(6), whole = flightKeys(p), k = flightKeys(p, { at, over: 1.5 });
      expect(k.end).toBeCloseTo(at + 1.5, 9);
      expect(k.keys.at(-1)!.t).toBe(k.end);
      expect(k.keys.at(-1)!.opacity).toBe(0);
      expect(k.keys.some((s) => s.t === at)).toBe(true);
      // nothing changes at the moment it starts
      // (to the chord: the fade adds a keyframe at its start, exactly on the path)
      const a = keysAt(k, at), b = keysAt(whole, at);
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), p.bh * Math.abs(a.scale - b.scale))).toBeLessThan(0.02);
      expect(a.opacity).toBeCloseTo(b.opacity, 4);
      for (let t = 0; t < k.end; t += 0.0931) {
        expect(off(p, k, t)).toBeLessThan(0.1);
        const out = Math.min(1, Math.max(0, 1 - (t - at) / 1.5));
        expect(keysAt(k, t).opacity).toBeCloseTo(flightAt(p, t).opacity * out, 2);
      }
    }
    // a fade that would outlast the flight ends with the flight
    const p = plan(6), tot = flightTotal(p);
    expect(flightKeys(p, { at: tot - 0.5, over: 1.5 }).end).toBe(tot);
  });

  it('prefers-reduced-motion: four keyframes, one transform, the fade in and out', () => {
    const p = planFlight(4, WIDE, RIG_SIZE.w, RIG_SIZE.h, { reduced: true });
    const k = flightKeys(p), tot = flightTotal(p);
    expect(k.keys.map((s) => s.t)).toEqual([0, 0.4, tot - 0.6, tot]);
    expect(new Set(k.keys.map((s) => flightTransform(p.bw, s))).size).toBe(1);
    expect(k.keys.map((s) => +s.opacity.toFixed(6))).toEqual([0, 1, 1, 0]);
    for (let t = 0; t < tot; t += 0.05) expect(keysAt(k, t).opacity).toBeCloseTo(flightAt(p, t).opacity, 6);
    // a joined kill: it stays longer, nothing else
    const before = keysAt(k, 2);
    extendRead(p, 2);
    const after = keysAt(flightKeys(p), 2);
    expect([after.x, after.y, after.scale]).toEqual([before.x, before.y, before.scale]);
    expect(after.opacity).toBeCloseTo(before.opacity, 9);
    expect(flightKeys(p).end).toBeCloseTo(tot + READ_EXTEND, 9);
  });
});

/** The planned climb at t, px/s upward (the sway included, as the burner reads it). */
const climbAt = (p: FlightPlan, t: number) => -(posAt(p, t + 0.02).y - posAt(p, t - 0.02).y) / 0.04;
/** The burner as balloons.ts runs it: from 1 at the launch, stepped at 60 Hz. */
function burnRun(p: FlightPlan, until: number): Array<{ t: number; b: number }> {
  const out = [];
  let b = 1;
  for (let t = 0; t <= until; t += 1 / 60) {
    b = burnStep(b, burnTarget(p, t), 1 / 60);
    out.push({ t, b });
  }
  return out;
}

describe('the burner (stage 75: it leads the motion)', () => {
  const plan = (seed: number) => planFlight(seed, WIDE, RIG_SIZE.w, RIG_SIZE.h);

  it('on arrival: it reads the climb BURN_LEAD s ahead, so it falls before the balloon slows', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = plan(seed);
      for (let t = p.ta * 0.5; t < p.ta - BURN_LEAD - 0.05; t += 0.25) {
        const want = Math.max(BURN_MIN, Math.min(1, climbAt(p, t + BURN_LEAD) / 90));
        expect(burnTarget(p, t)).toBeCloseTo(want, 6);
        // the climb is falling here: the burner is already lower than the climb it has would ask
        if (climbAt(p, t) / 90 < 1 && climbAt(p, t) / 90 > BURN_MIN) expect(burnTarget(p, t)).toBeLessThan(climbAt(p, t) / 90);
      }
      // at rest it is the pilot flame, before the arrival is over
      const run = burnRun(p, p.ta + 1);
      const at = (t: number) => run.find((r) => r.t >= t)!.b;
      expect(at(p.ta - 0.1)).toBeLessThan(0.3);
      expect(at(p.ta + 0.5)).toBeLessThan(0.2);
      // full while it climbs fast early on
      expect(at(p.ta * 0.25)).toBeGreaterThan(0.8);
    }
  });

  it('before the leave: it roars about a second ahead, while the balloon is still at rest', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = plan(seed);
      const leave = p.ta + p.read;
      expect(burnTarget(p, leave - BURN_BLAST_IN - 0.2)).toBeLessThan(0.2);
      expect(burnTarget(p, leave - BURN_BLAST_IN + 0.2)).toBe(1);
      const run = burnRun(p, leave + 1);
      const b = run.find((r) => r.t >= leave - 0.4)!.b;
      expect(phaseAt(p, leave - 0.4)).toBe('read');
      expect(b, `seed ${seed}`).toBeGreaterThan(0.85);
    }
  });

  it('on the way up: long uneven pulls while it climbs; the pilot flame, never out, when it drifts level', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = plan(seed);
      const end = flightTotal(p);
      for (let t = p.ta + p.read + 1; t < end - 1; t += 0.5) {
        const w = burnTarget(p, t);
        expect(w).toBeGreaterThanOrEqual(BURN_MIN);
        expect(w).toBeLessThanOrEqual(1);
        if (climbAt(p, t + BURN_LEAD) <= 0) expect(w).toBe(BURN_MIN);
      }
    }
  });

  it('a kill joining in the blast\'s second: the leave moves back, the blast stays lit (no roar, drop, roar)', () => {
    for (let seed = 1; seed < 40; seed++) {
      const p = plan(seed);
      const tj = p.ta + p.read - 0.6; // tl ≈ -0.6: the blast has begun, joins are still allowed
      expect(canJoin(p, tj)).toBe(true);
      let b = 1, t = 0;
      const dt = 1 / 60;
      for (; t < tj; t += dt) b = burnStep(b, burnTarget(p, t), dt);
      expect(b, `seed ${seed}`).toBeGreaterThan(0.85);
      extendRead(p, tj);
      const leave = p.ta + p.read;
      let low = 1;
      for (; t < leave; t += dt) {
        b = burnStep(b, burnTarget(p, t), dt);
        low = Math.min(low, b);
      }
      // never back to the pilot flame between the blast's start and the (later) leave
      expect(low, `seed ${seed}`).toBeGreaterThan(0.85);
      expect(burnTarget(p, leave - 0.05)).toBe(1);
    }
  });

  it('reduced motion: the still rig\'s steady low flame', () => {
    const p = planFlight(4, WIDE, RIG_SIZE.w, RIG_SIZE.h, { reduced: true });
    expect([0, 1, 3].map((t) => burnTarget(p, t))).toEqual([BURN_STILL, BURN_STILL, BURN_STILL]);
  });

  it('burnStep: quick to light, slower to die', () => {
    const up = burnStep(0.1, 1, 0.11), down = burnStep(1, 0.1, 0.11);
    expect(up - 0.1).toBeGreaterThan(1 - down);
  });
});

describe('the passenger by race (stage 75)', () => {
  it('every row of the owner\'s table', () => {
    const rows: Array<[string, string, string]> = [
      ['Elf', 'Noldo', 'elf'],
      ['Half-elf', '', 'elf'],
      ['Dwarf', '', 'dwarf'],
      ['Man', 'Dunadan', 'human'],
      ['Beorning', '', 'human'],
      ['Man', 'Beorning', 'human'],
      ['Hobbit', '', 'hobbit'],
      ['Troll', '', 'troll'],
      ['Orc', 'Tarkhnarb', 'goblin'],
      ['Orc', 'Zaugurz', 'orc'],
      ['Zaugurz Orc', '', 'orc'],
      ['Black Númenórean', '', 'numenorean'],
      ['Man', 'Black Numenorean', 'numenorean'],
      ['Numenorean', '', 'numenorean'],
      ['', '', 'goblin'],
    ];
    for (const [race, sub, want] of rows) expect(passengerOf(race, sub), `${race} / ${sub}`).toBe(want);
  });

  it('every name in stage 77, the subrace holding the race', () => {
    const rows: Array<[string, string, string]> = [
      ['Orc', 'Tarkhnarb Orc', 'goblin'],
      ['Orc', 'Morruhk Orc', 'goblin'],
      ['Orc', 'Zaugurz Orc', 'orc'],
      ['Elf', 'Silvan Elf', 'elf'],
      ['Elf', 'Sindarin Elf', 'elf'],
      ['Elf', 'Noldorin Elf', 'elf'],
      ['Elf', 'Sinda Elf', 'elf'],
      ['Elf', 'Noldo Elf', 'elf'],
      ['Half-Elf', 'Half-Elf', 'elf'],
      ['Half-elf', 'Half-elven', 'elf'],
      ['Half-elven', '', 'elf'],
      ['', 'Half-elven', 'elf'],
      ['Dwarf', 'Broadbeam Dwarf', 'dwarf'],
      ['Dwarf', 'Firebeard Dwarf', 'dwarf'],
      ['Dwarf', 'Longbeard Dwarf', 'dwarf'],
      ['Hobbit', 'Fallohide Hobbit', 'hobbit'],
      ['Hobbit', 'Harfoot Hobbit', 'hobbit'],
      ['Hobbit', 'Stoor Hobbit', 'hobbit'],
      ['Troll', 'Hill Troll', 'troll'],
      ['Troll', 'Cave Troll', 'troll'],
      ['Troll', 'Mountain Troll', 'troll'],
      ['Man', 'Black Númenórean', 'numenorean'],
      ['Black Númenórean', 'Black Númenórean', 'numenorean'],
      ['Man', 'Dúnadan Man', 'human'],
      ['Man', 'Dúnedain', 'human'],
      ['Man', 'Eriadorian Man', 'human'],
      ['Man', 'Rohirrim', 'human'],
      ['Man', 'Beorning Man', 'human'],
      ['Bear', 'Beorning Bear', 'human'],
      ['Bear', '', 'human'],
      ['', 'Bear', 'human'],
    ];
    for (const [race, sub, want] of rows) expect(passengerOf(race, sub), `${race} / ${sub}`).toBe(want);
  });

  it('odd casing, missing and empty fields, words not substrings', () => {
    expect(passengerOf('DWARF')).toBe('dwarf');
    expect(passengerOf('hALF-eLF', null)).toBe('elf');
    expect(passengerOf(null, null)).toBe('goblin');
    expect(passengerOf(undefined)).toBe('goblin');
    expect(passengerOf('   ', '')).toBe('goblin');
    expect(passengerOf('ORC', 'zAUGURZ')).toBe('orc');
    // "Dunadan" alone holds no word "man"; "human" is a word of its own
    expect(passengerOf('', 'Dunadan')).toBe('goblin');
    expect(passengerOf('Human')).toBe('human');
    expect(passengerOf('Woman')).toBe('goblin');
    expect(passengerOf('Shaman')).toBe('goblin');
    expect(passengerOf('Elfish')).toBe('goblin');
    // the Black Númenórean before "man"
    expect(passengerOf('Man', 'Black')).toBe('numenorean');
    expect(raceWords('Black Númenórean')).toEqual(['black', 'numenorean']);
  });

  it('each of the eight is its own module, its spec under its own id', async () => {
    for (const id of PASSENGER_IDS) {
      expect(isPassengerId(id)).toBe(true);
      expect((await loadPassenger(id)).passenger.id).toBe(id);
    }
    expect(isPassengerId('wizard')).toBe(false);
  });
});

describe('the sky behind the balloons (stage 75)', () => {
  it('night after dark; overcast under clouds, rain or snow; dusk with the sun low; else day', async () => {
    const { skyModeOf } = await import('../../src/weather/controller');
    expect(skyModeOf({ clock: 'night', weather: ' ', sunU: -1 })).toBe('night');
    expect(skyModeOf({ clock: 'day', weather: '~', sunU: 0.5 })).toBe('overcast');
    expect(skyModeOf({ clock: 'day', weather: '*', sunU: 0.5 })).toBe('overcast');
    expect(skyModeOf({ clock: 'day', weather: ' ', sunU: 0.05 })).toBe('dusk');
    expect(skyModeOf({ clock: 'day', weather: ' ', sunU: 0.95 })).toBe('dusk');
    expect(skyModeOf({ clock: 'day', weather: null, sunU: 0.5 })).toBe('day');
    expect(skyModeOf({ clock: 'day', weather: ' ', sunU: -1 })).toBe('day');
  });
});
