// Game time model (ADR 0074): seasons, periods, the moon and the window
// solver. The closed forms are checked against minute-by-minute stepping.
import { describe, expect, it } from 'vitest';
import { DAY_S, DAWN, DUSK, HOUR_S, MONTH_S, YEAR_S, momentAt, momentSeconds } from '../../src/gmcp/clock';
import {
  CondError,
  type GameTimeCond,
  MOON_CYCLE,
  MOON_ORIGIN,
  MOON_PHASES,
  condHolds,
  findWindow,
  gameTimeAt,
  gameTimeEventsAt,
  nextGameTimeEvents,
  moonAt,
  moonZenith,
  nextAt,
  nextMoonChange,
  nextMoonEvent,
  nextPhaseChange,
  parseCond,
  periodOf,
  seasonOf,
} from '../../src/gmcp/gametime';

/** Cockpit's clock anchor, synced 2026-09-26 (data/shared/clock.state). */
const COCKPIT_EPOCH = 310_694_465;
const G0 = momentSeconds(2855, 7, 19, 12, 0);

/** First minute ≥ g where `f` turns true after being false (stepping). */
function stepTo(g: number, f: (t: number) => boolean, max = 2 * YEAR_S): number {
  for (let t = g; t < g + max; t++) if (f(t) && !f(t - 1)) return t;
  throw new Error('not found');
}

describe('seasons and periods', () => {
  it('maps months to seasons', () => {
    expect([0, 2, 3, 5, 6, 8, 9, 11].map(seasonOf)).toEqual(['winter', 'winter', 'spring', 'spring', 'summer', 'summer', 'autumn', 'autumn']);
  });

  it('splits the day into dawn hour, day, dusk hour and night', () => {
    // Astron (3): dawn 7, dusk 19.
    expect([6, 7, 8, 18, 19, 20, 0].map((h) => periodOf(3, h))).toEqual(['night', 'dawn', 'day', 'day', 'dusk', 'night', 'night']);
  });
});

describe('moon', () => {
  it('predicts the logged moonset to the minute (Event.Moon set, 2026-10-03)', () => {
    const g = 1_791_056_163 - COCKPIT_EPOCH;
    expect(momentAt(0, g)).toMatchObject({ year: 2855, month: 7, day: 19, hour: 22, minute: 58 });
    expect(moonAt(g - 1).position).not.toBe('below');
    expect(moonAt(g).position).toBe('below');
    expect(nextMoonEvent(g - 600, 'set')).toBe(g);
    // That evening the moon was a waxing crescent (level 5).
    expect(moonAt(g - 1)).toMatchObject({ phase: 'waxing crescent', level: 5, waxing: true, position: 'west' });
  });

  it('is full at the model origin and runs through all eight phases in a cycle', () => {
    expect(moonAt(MOON_ORIGIN)).toMatchObject({ level: 12, phase: 'full' });
    expect(moonZenith(MOON_ORIGIN)).toBe(0);
    const seen: string[] = [];
    let t = MOON_ORIGIN;
    while (t < MOON_ORIGIN + MOON_CYCLE) {
      const p = moonAt(t).phase;
      if (seen[seen.length - 1] !== p) seen.push(p);
      t = nextPhaseChange(t);
    }
    expect(seen).toEqual(['full', 'waning gibbous', 'third quarter', 'waning crescent', 'new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full']);
    expect(moonAt(MOON_ORIGIN + MOON_CYCLE)).toMatchObject({ phase: 'full' });
    // New at half a cycle.
    expect(moonAt(MOON_ORIGIN + MOON_CYCLE / 2)).toMatchObject({ phase: 'new', level: 0 });
  });

  it('rises and sets 12 hours apart; position runs east → west', () => {
    const rise = nextMoonEvent(G0, 'rise');
    const set = nextMoonEvent(rise, 'set');
    expect(set - rise).toBeGreaterThanOrEqual(12 * HOUR_S);
    expect(set - rise).toBeLessThan(12 * HOUR_S + 30);
    const places: string[] = [];
    for (let t = rise; t < set; t += 30) if (places[places.length - 1] !== moonAt(t).position) places.push(moonAt(t).position);
    expect(places).toEqual(['east', 'southeast', 'south', 'southwest', 'west']);
    expect(moonAt(set).position).toBe('below');
  });

  it('the closed-form rise and set match stepping, over a cycle', () => {
    const up = (t: number) => moonAt(t).position !== 'below';
    for (let g = G0; g < G0 + MOON_CYCLE; g += 997) {
      expect(nextMoonEvent(g, 'rise'), `rise from ${g}`).toBe(stepTo(g, up));
      expect(nextMoonEvent(g, 'set'), `set from ${g}`).toBe(stepTo(g, (t) => !up(t)));
    }
    // An event exactly at g counts.
    const r = nextMoonEvent(G0, 'rise');
    expect(nextMoonEvent(r, 'rise')).toBe(r);
  });

  it('phase changes match stepping', () => {
    for (let g = G0; g < G0 + MOON_CYCLE; g += 1231) {
      const p = moonAt(g).phase;
      expect(nextPhaseChange(g)).toBe(stepTo(g + 1, (t) => moonAt(t).phase !== p));
      expect(nextMoonChange(g)).toBeGreaterThan(g);
    }
  });

  it('a dim moon is not visible by day; a new moon never is', () => {
    // Find a dim crescent above the horizon at noon, and at midnight.
    let dimDay = -1;
    let dimNight = -1;
    for (let t = G0; t < G0 + MOON_CYCLE && (dimDay < 0 || dimNight < 0); t += 17) {
      const m = moonAt(t);
      if (m.position === 'below' || m.phase === 'new' || m.level > 4) continue;
      const mo = momentAt(0, t);
      const per = periodOf(mo.month, mo.hour);
      if (per === 'day' && dimDay < 0) dimDay = t;
      if (per === 'night' && dimNight < 0) dimNight = t;
    }
    expect(moonAt(dimDay)).toMatchObject({ visible: false, bright: false });
    expect(moonAt(dimNight)).toMatchObject({ visible: true, bright: false });
    for (let t = G0; t < G0 + MOON_CYCLE; t += 101) {
      const m = moonAt(t);
      if (m.phase === 'new') expect(m.visible).toBe(false);
      if (m.visible && m.level > 4) expect(m.bright).toBe(true);
    }
  });
});

describe('gameTimeAt', () => {
  it('gives Lua-friendly fields', () => {
    const g = momentSeconds(2854, 3, 21, 17, 5);
    expect(gameTimeAt(g)).toMatchObject({
      year: 2854,
      month: 4,
      monthName: 'Astron',
      sindarin: 'Gwirith',
      day: 21,
      hour: 17,
      minute: 5,
      weekday: 'Mersday',
      season: 'spring',
      period: 'day',
      dawn: 7,
      dusk: 19,
    });
    expect(MOON_PHASES).toContain(gameTimeAt(g).moon.phase);
  });
});

describe('parseCond', () => {
  it('normalizes values and single values to lists', () => {
    expect(parseCond({ season: 'Winter', month: [1, 'Rethe'], hours: { from: 22, to: 2 }, moon: 'full', at: 'moonrise' })).toEqual({
      season: ['winter'],
      month: [0, 2],
      hours: { from: 22, to: 2 },
      moon: ['full'],
      at: 'moonrise',
    });
    expect(parseCond({ hours: [5, 9], period: ['dusk', 'night'], moonVisible: true, notSeason: ['winter'] })).toEqual({
      hours: { from: 5, to: 9 },
      period: ['dusk', 'night'],
      moonVisible: true,
      notSeason: ['winter'],
    });
    expect(parseCond([])).toEqual({});
  });

  it('refuses unknown keys and values with clear messages', () => {
    const bad = (c: unknown) => () => parseCond(c);
    expect(bad({ seasn: 'winter' })).toThrow(/unknown key 'seasn' \(season, notSeason/);
    expect(bad({ season: 'fall' })).toThrow(/season: unknown value "fall" \(one of winter, spring, summer, autumn\)/);
    expect(bad({ month: 13 })).toThrow(/month: 1–12 or a month name/);
    expect(bad({ hours: { from: 3, to: 3 } })).toThrow(/must differ/);
    expect(bad({ hours: { from: 3, to: 24 } })).toThrow(/hours.to: an hour 0–23/);
    expect(bad({ hours: 5 })).toThrow(/hours: a table/);
    expect(bad({ moon: 'half' })).toThrow(/moon: unknown value/);
    expect(bad({ moonVisible: 'yes' })).toThrow(/moonVisible: true or false/);
    expect(bad({ at: ['dawn', 'dusk'] })).toThrow(/at: one moment/);
    expect(bad({ at: 'noon' })).toThrow(/at: unknown value "noon"/);
    expect(bad('winter')).toThrow(CondError);
    expect(bad({ period: [] })).toThrow(/period: empty list/);
  });
});

/** Brute force: the first window by stepping minutes. */
function bruteWindow(c: GameTimeCond, from: number, horizon: number): { start: number; end: number } | null {
  let t = from;
  while (t < from + horizon && !condHolds(c, t)) t++;
  if (t >= from + horizon) return null;
  const start = t;
  while (t < start + YEAR_S && condHolds(c, t)) t++;
  return { start, end: t };
}

describe('findWindow', () => {
  const from = momentSeconds(2855, 7, 19, 12, 34);

  it('matches minute stepping for each key', () => {
    const conds: GameTimeCond[] = [
      { season: ['autumn'] },
      { notSeason: ['summer', 'autumn'] },
      { month: [0] },
      { hours: { from: 22, to: 2 } },
      { hours: { from: 13, to: 14 } },
      { period: ['dusk'] },
      { period: ['night'], moonVisible: true },
      { moonVisible: false },
      { moon: ['full'] },
      { moon: ['waxing gibbous', 'full'], period: ['night'] },
      { moon: ['new'], season: ['autumn'] },
    ];
    for (const c of conds) {
      expect(findWindow(c, from, 40 * DAY_S), JSON.stringify(c)).toEqual(bruteWindow(c, from, 40 * DAY_S));
    }
  });

  it('starts at from when the condition holds already', () => {
    expect(findWindow({ season: ['summer'] }, from)).toEqual({ start: from, end: momentSeconds(2855, 9, 1, 0, 0) });
  });

  it('crosses midnight, a season and a year', () => {
    const night = findWindow({ hours: { from: 23, to: 1 } }, from)!;
    expect(momentAt(0, night.start)).toMatchObject({ day: 19, hour: 23, minute: 0 });
    expect(momentAt(0, night.end)).toMatchObject({ day: 20, hour: 1, minute: 0 });
    // Winter: Afteryule–Rethe, from 1 Afteryule 2856 (across the year end) to 1 Astron.
    const winter = findWindow({ season: ['winter'] }, from)!;
    expect(winter).toEqual({ start: momentSeconds(2856, 0, 1, 0, 0), end: momentSeconds(2856, 3, 1, 0, 0) });
    // Late autumn and winter as one window across the year end.
    const dark = findWindow(parseCond({ month: ['Foreyule', 'Afteryule'] }), from)!;
    expect(dark).toEqual({ start: momentSeconds(2855, 11, 1, 0, 0), end: momentSeconds(2856, 1, 1, 0, 0) });
  });

  it('is null beyond the horizon; the default horizon is a game year', () => {
    expect(findWindow({ season: ['winter'] }, from, 30 * DAY_S)).toBeNull();
    expect(findWindow({ month: [6] }, from)).not.toBeNull(); // Afterlithe 2856, within a year
    expect(findWindow({ month: [6] }, momentSeconds(2855, 7, 1, 0, 0), 300 * DAY_S)).toBeNull();
    expect(findWindow({ month: [6] }, momentSeconds(2855, 7, 1, 0, 0))!.start).toBe(momentSeconds(2856, 6, 1, 0, 0));
  });

  it('an empty condition holds for a year', () => {
    expect(findWindow({}, from)).toEqual({ start: from, end: from + YEAR_S });
  });

  it('at: moments refined to the minute', () => {
    const dawn = findWindow({ at: 'dawn' }, from)!;
    expect(momentAt(0, dawn.start)).toMatchObject({ day: 20, hour: DAWN[7], minute: 0 });
    expect(dawn.end).toBe(dawn.start);
    expect(momentAt(0, findWindow({ at: 'dusk' }, from)!.start)).toMatchObject({ day: 19, hour: DUSK[7], minute: 0 });
    expect(momentAt(0, findWindow({ at: 'midnight' }, from)!.start)).toMatchObject({ day: 20, hour: 0, minute: 0 });
    expect(findWindow({ at: 'seasonStart' }, from)!.start).toBe(momentSeconds(2855, 9, 1, 0, 0));
    const rise = findWindow({ at: 'moonrise' }, from)!.start;
    expect(rise).toBe(nextMoonEvent(from, 'rise'));
    expect(moonAt(rise).position).toBe('east');
    expect(moonAt(rise - 1).position).toBe('below');
    expect(findWindow({ at: 'moonset' }, from)!.start).toBe(nextMoonEvent(from, 'set'));
  });

  it('at with other keys: the Dead Knight moonrise (waxing gibbous or full)', () => {
    const w = findWindow({ at: 'moonrise', moon: ['waxing gibbous', 'full'] }, from)!;
    expect(['waxing gibbous', 'full']).toContain(moonAt(w.start).phase);
    // No earlier moonrise qualifies.
    for (let t = nextAt('moonrise', from); t < w.start; t = nextAt('moonrise', t + 1)) {
      expect(['waxing gibbous', 'full']).not.toContain(moonAt(t).phase);
    }
    // Ingrove: a full moon in winter.
    const ok = findWindow(parseCond({ moon: 'full', season: 'winter' }), from)!;
    expect(seasonOf(momentAt(0, ok.start).month)).toBe('winter');
    expect(moonAt(ok.start).phase).toBe('full');
    expect(moonAt(ok.end).phase === 'full' && seasonOf(momentAt(0, ok.end).month) === 'winter').toBe(false);
  });

  it('a whole year of hour steps stays fast', () => {
    const t0 = performance.now();
    findWindow({ moonVisible: true, moon: ['new'] }, from);
    findWindow({ at: 'moonrise', month: [0], hours: { from: 3, to: 4 } }, from);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(MONTH_S).toBe(43_200);
  });
});

describe('game time events', () => {
  it('lists what happens at a minute', () => {
    // Wedmath (7): dawn 4, dusk 22.
    expect(gameTimeEventsAt(momentSeconds(2855, 7, 19, 4, 0))).toEqual(['hour', 'dawn']);
    expect(gameTimeEventsAt(momentSeconds(2855, 7, 19, 22, 0))).toEqual(['hour', 'dusk']);
    expect(gameTimeEventsAt(momentSeconds(2855, 7, 19, 13, 0))).toEqual(['hour']);
    expect(gameTimeEventsAt(momentSeconds(2855, 9, 1, 0, 0))).toContain('season');
    expect(gameTimeEventsAt(momentSeconds(2855, 8, 1, 0, 0))).not.toContain('season');
    const set = 1_791_056_163 - COCKPIT_EPOCH;
    expect(gameTimeEventsAt(set)).toEqual(['moonset']);
    expect(gameTimeEventsAt(set + 1)).toEqual([]);
  });

  it('finds every event by stepping from one to the next', () => {
    let g = G0;
    const counts: Record<string, number> = {};
    for (;;) {
      const n = nextGameTimeEvents(g);
      if (n.at >= G0 + MOON_CYCLE) break;
      expect(n.at).toBeGreaterThan(g);
      expect(n.at - g).toBeLessThanOrEqual(HOUR_S);
      expect(n.kinds.length).toBeGreaterThan(0);
      for (const k of n.kinds) counts[k] = (counts[k] ?? 0) + 1;
      g = n.at;
    }
    // About 29.5 days: one dawn and dusk a day, a rise and set a lunar day, 8 phases.
    expect(counts.dawn).toBeGreaterThanOrEqual(29);
    expect(counts.moonrise).toBeGreaterThanOrEqual(28);
    expect(counts.moonset).toBeGreaterThanOrEqual(28);
    expect(counts.phase).toBe(8);
    expect(counts.hour).toBe(Math.floor(MOON_CYCLE / HOUR_S));
  });
});
