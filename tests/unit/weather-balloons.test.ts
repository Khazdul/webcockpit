// Stage 69 (ADR 0159): the balloon notices' pure parts: the feed (kills and
// their merge; round 2: level up, death, achievement), the sky lane, the
// flight's phases as functions of time and a seed (round 2: a balloon's
// motion: continuous velocity, a speed cap, the readable spot low, varied
// shrinking), and the raster skin's file contract.
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/runs/events';
import { KillRater } from '../../src/runs/kill-rating';
import { ACHIEVEMENT_MAX, FACE_LABEL, type KillNotice, SAMPLE_BURST, bestFace, noticeOf, raterFor, signFor, signOf } from '../../src/weather/balloons/feed';
import {
  type FlightPlan,
  type LaneGeom,
  READ_EXTEND,
  READ_MAX,
  VMAX,
  V_ARRIVE,
  canJoin,
  extendRead,
  flightAt,
  flightTotal,
  phaseAt,
  planFlight,
  posAt,
  skyLane,
} from '../../src/weather/balloons/flight';
import { rasterSkinOf } from '../../src/weather/balloons/image-skin';

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
    expect(signOf([{ name: 'an orc scout', xp: 1900, face: 'good' }])).toEqual({ kind: 'kill', title: 'An orc scout', big: '+1.9k', unit: 'XP', label: 'Good', more: '', mood: 'good', count: 1 });
    expect(signOf([{ name: 'a mouse', xp: 140, face: 'calibrating' }]).label).toBe('');
    expect(FACE_LABEL.pvp).toBe('PvP');
  });

  it('joined kills: the count, the summed XP, the best face and the last three names', () => {
    const s = signOf(SAMPLE_BURST);
    expect(s).toMatchObject({ title: '4 kills', big: '+7.6k', mood: 'great', label: 'Great', count: 4 });
    expect(s.more).toBe('orc scout, goblin thief, Uruk-hai tracker, …');
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
    const l = skyLane(WIDE, 180);
    expect(l.sky).toBe(true);
    expect(l.x0).toBeGreaterThanOrEqual(82 * 9);
    expect(l.x0).toBeGreaterThanOrEqual(1920 * 0.56 - 1);
    expect(l.x1).toBe(1912);
  });

  it('too little sky room: the whole width (the distant part then behind the text)', () => {
    expect(skyLane(NARROW, 180)).toEqual({ x0: 8, x1: 692, sky: false });
    expect(skyLane(PHONE, 180).sky).toBe(false);
  });

  it('on a wide screen every flight keeps to the lane (only the right path leaves over the right edge)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const p = planFlight(seed, WIDE, 180, 330);
      const lane = p.lane;
      expect(lane.sky).toBe(true);
      for (let t = 0; t < flightTotal(p); t += 0.25) {
        const f = flightAt(p, t);
        const half = (180 * f.scale) / 2;
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
  const plan = (seed: number, g = WIDE) => planFlight(seed, g, 180, 330);

  it('the same seed, the same flight; another seed, another', () => {
    expect(plan(7)).toEqual(plan(7));
    expect(flightAt(plan(7), 12.3)).toEqual(flightAt(plan(7), 12.3));
    expect(plan(7)).not.toEqual(plan(8));
  });

  it('phases: a slow arrival, about 5.5 s readable, an ease into flight, then a drift of up to a minute', () => {
    for (let seed = 1; seed < 100; seed++) {
      const p = plan(seed);
      expect(p.ta).toBeGreaterThanOrEqual(5.5);
      expect(p.ta).toBeLessThanOrEqual(8);
      expect(p.read).toBeGreaterThanOrEqual(5.5);
      expect(p.read).toBeLessThanOrEqual(6.1);
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
        const q = planFlight(seed, g, 180, 330, { avoidX: p.read0.x });
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
        expect(p.read).toBeGreaterThan(5.5 + 2 * READ_EXTEND - 0.01);
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
    const b = planFlight(11, WIDE, 180, 330, { avoidX: a.read0.x });
    expect(Math.abs(b.read0.x - a.read0.x)).toBeGreaterThan(150);
  });

  it('prefers-reduced-motion: no flight, a fade in place', () => {
    const p = planFlight(4, WIDE, 180, 330, { reduced: true });
    const xs = [0.2, 2, 5, flightTotal(p) - 0.2].map((t) => flightAt(p, t));
    for (const f of xs) expect([f.x, f.y, f.scale, f.tilt, f.swing, f.front]).toEqual([p.read0.x, p.read0.y, p.scale, 0, 0, true]);
    expect(xs[0]!.opacity).toBeLessThan(1);
    expect(xs[1]!.opacity).toBe(1);
    expect(flightTotal(p)).toBeLessThan(8);
  });

  it('a narrow screen: the readable spot right of the middle, inside the screen', () => {
    const p = plan(2, NARROW);
    expect(p.lane.sky).toBe(false);
    expect(p.read0.x - (180 * p.scale) / 2).toBeGreaterThanOrEqual(8);
    expect(p.read0.x + (180 * p.scale) / 2).toBeLessThanOrEqual(692);
    expect(p.read0.y + 330 * p.scale).toBeLessThanOrEqual(NARROW.protect.fadeTop);
  });
});

describe('raster skins', () => {
  const dir = '/public/balloons/goblin/';
  const base = [`${dir}balloon.webp`, `${dir}basket-front.webp`, `${dir}passenger-calibrating.webp`];
  it('needs balloon, basket-front and passenger-calibrating; a missing mood falls back to calibrating', () => {
    expect(rasterSkinOf([], 'goblin')).toBeNull();
    expect(rasterSkinOf([`${dir}balloon.webp`, `${dir}basket-front.webp`], 'goblin')).toBeNull();
    const r = rasterSkinOf([...base, `${dir}passenger-great.webp`, `${dir}passenger-great-blink.webp`], 'goblin', '/x/')!;
    expect(r.balloon).toBe('/x/balloons/goblin/balloon.webp');
    expect(r.front).toBe('/x/balloons/goblin/basket-front.webp');
    expect(r.passenger.great).toBe('/x/balloons/goblin/passenger-great.webp');
    expect(r.passenger.poor).toBe('/x/balloons/goblin/passenger-calibrating.webp');
    expect(r.blink).toEqual({ great: '/x/balloons/goblin/passenger-great-blink.webp' });
    expect(r.wave).toBeNull();
    expect(rasterSkinOf(base, 'other')).toBeNull();
  });

  it('round 2: levelup → superb, achievement → great, death → poor, then calibrating', () => {
    const url = (m: string) => `/balloons/goblin/passenger-${m}.webp`;
    const none = rasterSkinOf(base, 'goblin')!;
    for (const m of ['levelup', 'death', 'achievement'] as const) expect(none.passenger[m]).toBe(url('calibrating'));
    const kin = rasterSkinOf([...base, `${dir}passenger-superb.webp`, `${dir}passenger-great.webp`, `${dir}passenger-poor.webp`], 'goblin')!;
    expect([kin.passenger.levelup, kin.passenger.achievement, kin.passenger.death]).toEqual([url('superb'), url('great'), url('poor')]);
    const own = rasterSkinOf([...base, `${dir}passenger-superb.webp`, `${dir}passenger-levelup.webp`, `${dir}passenger-death.webp`, `${dir}passenger-achievement.webp`], 'goblin')!;
    expect([own.passenger.levelup, own.passenger.achievement, own.passenger.death]).toEqual([url('levelup'), url('achievement'), url('death')]);
  });
});
