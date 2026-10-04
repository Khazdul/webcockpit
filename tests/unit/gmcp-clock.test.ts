import { describe, expect, it } from 'vitest';
import {
  ClockModel,
  DAWN,
  DUSK,
  SEED_EPOCH,
  YEAR_S,
  countdownText,
  hour24,
  isDay,
  loadClockState,
  momentAt,
  momentSeconds,
  monthIndex,
  periodIcon,
  unsetClock,
  WEEKDAYS,
  weekdayOf,
} from '../../src/gmcp/clock';

const T = 1_790_449_200_000; // ms, a whole second
const S = T / 1000;

/** A clock anchored so that `nowMs` is the given moment. */
function clockAt(y: number, mo: number, d: number, h: number, mi: number, precision: 'day' | 'hour' | 'minute', nowMs = T): ClockModel {
  return new ClockModel({ epoch: Math.floor(nowMs / 1000) - momentSeconds(y, mo, d, h, mi), precision, lastSync: nowMs / 1000, reason: 'test' });
}

describe('calendar', () => {
  it('computes moments from the anchor', () => {
    const e = 1000;
    expect(momentAt(e, e)).toEqual({ year: 0, month: 0, day: 1, hour: 0, minute: 0, weekday: 0 });
    const m = momentAt(e, e + momentSeconds(2973, 3, 12, 8, 5));
    expect(m).toMatchObject({ year: 2973, month: 3, day: 12, hour: 8, minute: 5 });
    expect(SEED_EPOCH + 2850 * YEAR_S).toBe(1_696_118_400);
  });

  it('weekdays repeat every year (Shire Reckoning), as the time lines show', () => {
    // Cockpit logs, 2026-09-25/26 (year 2854).
    expect(WEEKDAYS[weekdayOf(3, 21)]).toBe('Mersday');
    expect(WEEKDAYS[weekdayOf(5, 20)]).toBe('Sunday');
    expect(WEEKDAYS[weekdayOf(5, 24)]).toBe('Mersday');
    expect(weekdayOf(0, 1)).toBe(0);
    const e = 1000;
    expect(momentAt(e, e + momentSeconds(2854, 3, 21, 17, 0)).weekday).toBe(5);
    expect(momentAt(e, e + momentSeconds(2973, 3, 21, 17, 0)).weekday).toBe(5);
  });

  it('knows months in both languages, hours in 12-hour form, day and night', () => {
    expect(monthIndex('Solmath')).toBe(1);
    expect(monthIndex('ninui')).toBe(1);
    expect(monthIndex('Foreyule')).toBe(11);
    expect(monthIndex('Smarch')).toBe(-1);
    expect([hour24(12, 'am'), hour24(1, 'am'), hour24(12, 'pm'), hour24(11, 'PM')]).toEqual([0, 1, 12, 23]);
    expect(DAWN).toHaveLength(12);
    expect(DUSK).toHaveLength(12);
    expect(isDay(3, 7)).toBe(true); // Astron: 7 → 19
    expect(isDay(3, 6)).toBe(false);
    expect(isDay(3, 19)).toBe(false);
    expect(periodIcon('day')).toBe('☼');
    expect(periodIcon('night')).toBe('☾');
  });
});

describe('sync sources', () => {
  it('the full time line sets hour precision', () => {
    const c = new ClockModel();
    expect(c.now(T)).toBeNull();
    expect(c.syncTimeLine('8 am on Sterday, the 12th of Astron, year 2973 of the Third Age.', T)).toBe(true);
    expect(c.precision).toBe('hour');
    expect(c.now(T)).toMatchObject({ year: 2973, month: 3, day: 12, hour: 8, minute: 0 });
    expect(c.state.reason).toBe('time_dated');
    expect(c.state.lastSync).toBe(S);
    expect(c.now(T + 90_000)).toMatchObject({ hour: 9, minute: 30 });
  });

  it('the date-only line sets day precision and keeps a known hour', () => {
    const c = new ClockModel();
    expect(c.syncTimeLine('Mersday, the 26th of Solmath, year 2973 of the Third Age.', T)).toBe(true);
    expect(c.precision).toBe('day');
    expect(c.now(T)).toMatchObject({ month: 1, day: 26, hour: 0 });
    const h = clockAt(2973, 1, 20, 14, 33, 'minute');
    h.syncTimeLine('Mersday, the 26th of Solmath, year 2973 of the Third Age.', T);
    expect(h.precision).toBe('minute'); // never lowered
    expect(h.now(T)).toMatchObject({ day: 26, hour: 14, minute: 33 });
  });

  it('a full line keeps a known minute at minute precision', () => {
    const c = clockAt(2973, 3, 12, 8, 17, 'minute');
    c.syncTimeLine('9 pm on Sterday, the 12th of Astron, year 2973 of the Third Age.', T);
    expect(c.now(T)).toMatchObject({ hour: 21, minute: 17 });
    expect(c.precision).toBe('minute');
  });

  it('rejects other lines', () => {
    const c = new ClockModel();
    expect(c.syncTimeLine('You cannot guess the time indoors.', T)).toBe(false);
    expect(c.syncTimeLine('8 am on Sterday, the 12th of Smarch, year 2973 of the Third Age.', T)).toBe(false);
    expect(c.syncTimeLine('13 am on Sterday, the 12th of Astron, year 2973 of the Third Age.', T)).toBe(false);
    expect(c.version).toBe(0);
  });

  it('the room clock needs at least day and sets minute', () => {
    const c = new ClockModel();
    expect(c.syncRoomClock('The current time is 8:00am.', T)).toBe(false);
    c.syncTimeLine('Mersday, the 26th of Solmath, year 2973 of the Third Age.', T);
    expect(c.syncRoomClock('The current time is 2:31 pm.', T)).toBe(true);
    expect(c.precision).toBe('minute');
    expect(c.now(T)).toMatchObject({ day: 26, hour: 14, minute: 31 });
    expect(c.syncRoomClock('The current time is late.', T)).toBe(false);
  });

  it('Event.Sun rise/set/light/dark need at least day', () => {
    const c = new ClockModel();
    expect(c.syncSun('rise', T)).toBe(false);
    c.syncTimeLine('Sterday, the 12th of Astron, year 2973 of the Third Age.', T);
    expect(c.syncSun('noon', T)).toBe(false);
    expect(c.syncSun('rise', T)).toBe(true);
    expect(c.now(T)).toMatchObject({ month: 3, hour: DAWN[3], minute: 0 });
    expect(c.precision).toBe('minute');
    c.syncSun('set', T);
    expect(c.now(T)).toMatchObject({ hour: DUSK[3], minute: 0 });
  });

  it('Event.Sun light is an hour after dawn, dark an hour after dusk (logs)', () => {
    // Gittan 2026-10-03, 16 Wedmath (dawn 4, dusk 22): light 05:00, set
    // 22:00 and dark 23:00, 1020 s and 60 s apart.
    const c = clockAt(2855, 7, 16, 4, 40, 'day');
    expect(c.syncSun('light', T)).toBe(true);
    expect(c.now(T)).toMatchObject({ hour: 5, minute: 0 });
    expect(c.state.reason).toBe('sun_light');
    expect(c.now(T + 1_020_000)).toMatchObject({ hour: 22, minute: 0 });
    c.syncSun('dark', T);
    expect(c.now(T)).toMatchObject({ hour: DUSK[7]! + 1, minute: 0 });
  });

  it('MSSP sets hour precision only while at most day', () => {
    const c = new ClockModel();
    const vars = new Map([
      ['GAME YEAR', ['2973']],
      ['GAME MONTH', ['Astron']],
      ['GAME DAY', ['11']],
      ['GAME HOUR', ['15']],
    ]);
    expect(c.syncMssp(vars, T)).toBe(true);
    expect(c.precision).toBe('hour');
    expect(c.now(T)).toMatchObject({ year: 2973, month: 3, day: 12, hour: 15, minute: 0 });
    const m = clockAt(2973, 3, 12, 8, 10, 'minute');
    expect(m.syncMssp(vars, T)).toBe(false);
    expect(c.syncMssp(new Map([['GAME YEAR', ['2973']]]), T)).toBe(false);
    expect(new ClockModel().syncMssp(new Map([...vars, ['GAME HOUR', ['x']]]), T)).toBe(false);
  });
});

describe('transitions and the strip text', () => {
  it('counts down to dusk by day, to dawn by night, across midnight', () => {
    // Astron (3): dawn 7, dusk 19.
    const day = clockAt(2973, 3, 12, 18, 55, 'minute').nextTransition(T)!;
    expect(day).toEqual({ period: 'day', at: T + 5 * 1000, precision: 'minute' });
    const early = clockAt(2973, 3, 12, 5, 30, 'minute').nextTransition(T)!;
    expect(early.period).toBe('night');
    expect(early.at).toBe(T + 90 * 1000);
    const late = clockAt(2973, 3, 12, 22, 0, 'minute').nextTransition(T)!;
    expect(late.at).toBe(T + (2 * 60 + 7 * 60) * 1000);
    // Day 30: dawn of the next month (Thrimidge, 7).
    const eom = clockAt(2973, 2, 30, 23, 0, 'minute').nextTransition(T)!;
    expect(eom.at).toBe(T + (60 + DAWN[3]! * 60) * 1000);
  });

  it('hour precision ignores the minute; day and unset have none', () => {
    const h = clockAt(2973, 3, 12, 16, 0, 'hour').nextTransition(T + 20_000)!;
    expect(h.precision).toBe('hour');
    expect(h.at).toBe(T + 20_000 + 3 * 3600 * 1000 / 60);
    expect(clockAt(2973, 3, 12, 16, 0, 'day').nextTransition(T)).toBeNull();
    expect(new ClockModel().nextTransition(T)).toBeNull();
  });

  it('formats H:MM and ~N', () => {
    const t = { period: 'day' as const, at: T + 273_000, precision: 'minute' as const };
    expect(countdownText(t, T)).toBe('4:33');
    expect(countdownText(t, T + 268_000)).toBe('0:05');
    expect(countdownText(t, T + 400_000)).toBe('0:00');
    expect(countdownText({ ...t, at: T + 921_000 }, T)).toBe('15:21');
    const h = { ...t, precision: 'hour' as const };
    expect(countdownText({ ...h, at: T + 125_000 }, T)).toBe('~3');
    expect(countdownText({ ...h, at: T + 10_000 }, T)).toBe('~1');
    expect(countdownText({ ...h, at: T }, T)).toBe('~1');
  });
});

describe('persistence age rules', () => {
  const saved = (ageS: number, precision = 'minute') =>
    JSON.stringify({ epoch: 12345, precision, lastSync: S - ageS, reason: 'room_clock' });

  it('≤ 24 h: as stored', () => {
    expect(loadClockState(saved(3600), T)).toEqual({ epoch: 12345, precision: 'minute', lastSync: S - 3600, reason: 'room_clock' });
  });

  it('24 h – 7 days: kept at most day', () => {
    expect(loadClockState(saved(2 * 86400), T).precision).toBe('day');
    expect(loadClockState(saved(2 * 86400, 'day'), T).precision).toBe('day');
    expect(loadClockState(saved(2 * 86400), T).epoch).toBe(12345);
  });

  it('missing, broken or older than 7 days: seed, unset', () => {
    expect(loadClockState(saved(8 * 86400), T)).toEqual(unsetClock());
    expect(loadClockState(null, T)).toEqual(unsetClock());
    expect(loadClockState('{', T)).toEqual(unsetClock());
    expect(loadClockState('{"epoch":1,"precision":"exact","lastSync":1}', T)).toEqual(unsetClock());
    expect(loadClockState('{"epoch":1,"precision":"day"}', T)).toEqual(unsetClock());
    expect(unsetClock().epoch).toBe(SEED_EPOCH);
  });
});
