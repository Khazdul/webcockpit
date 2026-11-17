// Stage 69 (ADR 0159): the balloon notices' pure parts: the kill feed and
// its merge, the sky lane, the flight's phases as functions of time and a
// seed, and the raster skin's file contract.
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../src/runs/events';
import { FACE_LABEL, type KillNotice, SAMPLE_BURST, bestFace, noticeOf, raterFor, signOf } from '../../src/weather/balloons/feed';
import {
  type LaneGeom,
  READ_EXTEND,
  READ_MAX,
  canJoin,
  extendRead,
  flightAt,
  flightTotal,
  phaseAt,
  planFlight,
  skyLane,
} from '../../src/weather/balloons/flight';
import { rasterSkinOf } from '../../src/weather/balloons/image-skin';

const kill = (mobName: string, xpDelta: number, us = 1): RunEvent => ({ type: 'kill', us, logUs: us, mobName, xpDelta });

describe('feed', () => {
  it('rates like the Statistics pane: calibrating under 5 kills, then against the median, this kill included; a pkill is PvP', () => {
    const live: RunEvent[] = [];
    const add = (e: RunEvent): KillNotice => {
      live.push(e);
      return noticeOf(e, raterFor([], live))!;
    };
    for (let i = 0; i < 4; i++) expect(add(kill('an orc', 1000)).face).toBe('calibrating');
    expect(add(kill('an orc', 1000)).face).toBe('good');
    expect(add(kill('a troll', 3000)).face).toBe('superb');
    expect(add(kill('a mouse', 100)).face).toBe('poor');
    const pk: RunEvent = { type: 'pkill', us: 9, logUs: 9, name: 'Grimbold', race: 'Orc', xpDelta: 5000 };
    expect(add(pk)).toEqual({ name: '*Grimbold*', xp: 5000, face: 'pvp' });
    expect(noticeOf({ type: 'level_up', us: 1, level: 2 }, raterFor([], live))).toBeNull();
  });

  it('the chain\'s earlier runs count toward the median', () => {
    const prior = [1, 2, 3, 4, 5].map((i) => kill('an orc', 1000, i));
    expect(noticeOf(kill('an orc', 1000), raterFor(prior, [kill('an orc', 1000)]))!.face).toBe('good');
  });

  it('one kill: its name capitalised, the XP, the rating word; none while calibrating', () => {
    expect(signOf([{ name: 'an orc scout', xp: 1900, face: 'good' }])).toEqual({ title: 'An orc scout', xp: '+1.9k', label: 'Good', more: '', face: 'good', count: 1 });
    expect(signOf([{ name: 'a mouse', xp: 140, face: 'calibrating' }]).label).toBe('');
    expect(FACE_LABEL.pvp).toBe('PvP');
  });

  it('joined kills: the count, the summed XP, the best face and the last three names', () => {
    const s = signOf(SAMPLE_BURST);
    expect(s).toMatchObject({ title: '4 kills', xp: '+7.6k', face: 'great', label: 'Great', count: 4 });
    expect(s.more).toBe('orc scout, goblin thief, Uruk-hai tracker, …');
    expect(bestFace([{ name: 'x', xp: 1, face: 'superb' }, { name: 'y', xp: 1, face: 'pvp' }])).toBe('pvp');
  });
});

/** The owner's 1920 × 1080 desktop: the game pane to x 1410, the docked panes right of it. */
const WIDE: LaneGeom = { W: 1920, H: 1080, out: { x: 0, y: 0, w: 1410, h: 1045 }, cell: { w: 9, h: 18 }, protect: { fadeTop: 970 } };
/** A narrow window: the text takes the whole width. */
const NARROW: LaneGeom = { W: 700, H: 800, out: { x: 0, y: 0, w: 700, h: 780 }, cell: { w: 9, h: 18 }, protect: { fadeTop: 700 } };
const PHONE: LaneGeom = { W: 400, H: 800, out: { x: 0, y: 0, w: 400, h: 760 }, cell: { w: 8, h: 16 }, protect: { fadeTop: 690 }, noBand: true };

describe('the sky lane', () => {
  it('a wide screen: the strip right of both the left band and the text\'s 80-odd columns', () => {
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

  it('on a wide screen every flight keeps to the lane after it arrives (only the right path leaves over the right edge)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const p = planFlight(seed, WIDE, 180, 330);
      const lane = p.lane;
      expect(lane.sky).toBe(true);
      for (let t = p.ta; t < flightTotal(p); t += 0.25) {
        const f = flightAt(p, t);
        const half = (180 * f.scale) / 2;
        // the sway may lean a few px past the clamp
        expect(f.x - half, `seed ${seed} t ${t}`).toBeGreaterThanOrEqual(lane.x0 - 25);
        if (p.path !== 'right') expect(f.x + half, `seed ${seed} t ${t}`).toBeLessThanOrEqual(lane.x1 + 25);
      }
    }
  });
});

describe('flight', () => {
  const plan = (seed: number, g = WIDE) => planFlight(seed, g, 180, 330);

  it('the same seed, the same flight; another seed, another', () => {
    expect(plan(7)).toEqual(plan(7));
    expect(flightAt(plan(7), 12.3)).toEqual(flightAt(plan(7), 12.3));
    expect(plan(7)).not.toEqual(plan(8));
  });

  it('phases: a fast arrival, about 5.5 s readable, a glide, then a slow drift of up to a minute', () => {
    for (let seed = 1; seed < 100; seed++) {
      const p = plan(seed);
      expect(p.ta).toBeGreaterThanOrEqual(0.9);
      expect(p.ta).toBeLessThanOrEqual(1.1);
      expect(p.read).toBeGreaterThanOrEqual(5.5);
      expect(p.read).toBeLessThanOrEqual(6.1);
      expect(p.td).toBeGreaterThanOrEqual(9);
      expect(p.td).toBeLessThanOrEqual(60);
      expect(phaseAt(p, 0)).toBe('arrive');
      expect(phaseAt(p, p.ta + 0.01)).toBe('read');
      expect(phaseAt(p, p.ta + p.read + 0.01)).toBe('glide');
      expect(phaseAt(p, p.ta + p.read + p.tg + 0.01)).toBe('drift');
      expect(phaseAt(p, flightTotal(p))).toBe('done');
    }
  });

  it('arrives from below, near and readable at the end of the arrival, over the text only then', () => {
    const p = plan(3);
    const a = flightAt(p, 0), r = flightAt(p, p.ta + 1);
    expect(a.y).toBeGreaterThan(r.y + 30);
    expect(a.scale).toBeLessThan(r.scale);
    expect(a.opacity).toBe(0);
    expect(r.opacity).toBe(1);
    expect(r.front).toBe(true);
    expect(flightAt(p, p.ta + p.read + 0.1).front).toBe(false);
  });

  it('drifts much slower than it glides, shrinking, and fades out at the end', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = plan(seed);
      const g0 = p.ta + p.read, d0 = g0 + p.tg;
      // mean pace: the glide's leg against the drift's (end to end, the sway left out)
      const gs = flightAt(p, g0), ge = flightAt(p, d0), de = flightAt(p, d0 + p.td - 0.01);
      const glide = Math.hypot(ge.x - gs.x, ge.y - gs.y) / p.tg, drift = Math.hypot(de.x - ge.x, de.y - ge.y) / p.td;
      expect(drift, `seed ${seed} ${p.path}`).toBeLessThan(glide);
      expect(flightAt(p, d0 + p.td * 0.5).scale).toBeLessThan(flightAt(p, g0).scale);
      expect(flightAt(p, d0 + p.td * 0.999).opacity).toBeLessThan(0.1);
      expect(flightAt(p, d0 + p.td * 0.999).scale).toBeLessThanOrEqual(p.scale * 0.45);
    }
  });

  it('varied: all three leave paths come up', () => {
    const paths = new Set<string>();
    for (let seed = 1; seed < 40; seed++) paths.add(plan(seed).path);
    expect([...paths].sort()).toEqual(['meander', 'right', 'top']);
    const right = [...Array(80).keys()].map((s) => plan(s + 1)).find((p) => p.path === 'right')!;
    expect(right.end.x).toBeGreaterThan(WIDE.W);
    const top = [...Array(80).keys()].map((s) => plan(s + 1)).find((p) => p.path === 'top')!;
    expect(top.end.y).toBeLessThan(0);
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
  it('needs balloon, basket-front and passenger-calibrating; a missing mood falls back to calibrating', () => {
    expect(rasterSkinOf([], 'goblin')).toBeNull();
    expect(rasterSkinOf([`${dir}balloon.webp`, `${dir}basket-front.webp`], 'goblin')).toBeNull();
    const r = rasterSkinOf([`${dir}balloon.webp`, `${dir}basket-front.webp`, `${dir}passenger-calibrating.webp`, `${dir}passenger-great.webp`, `${dir}passenger-great-blink.webp`], 'goblin', '/x/')!;
    expect(r.balloon).toBe('/x/balloons/goblin/balloon.webp');
    expect(r.front).toBe('/x/balloons/goblin/basket-front.webp');
    expect(r.passenger.great).toBe('/x/balloons/goblin/passenger-great.webp');
    expect(r.passenger.poor).toBe('/x/balloons/goblin/passenger-calibrating.webp');
    expect(r.blink).toEqual({ great: '/x/balloons/goblin/passenger-great-blink.webp' });
    expect(r.wave).toBeNull();
    expect(rasterSkinOf([`${dir}balloon.webp`, `${dir}basket-front.webp`, `${dir}passenger-calibrating.webp`], 'other')).toBeNull();
  });
});
