import { describe, expect, it } from 'vitest';
import {
  ClockModel,
  DAWN,
  DUSK,
  SEED_EPOCH,
  YEAR_S,
  countdownText,
  hour24,
  dayBeginsAt,
  dayHour,
  nightBeginsAt,
  nightHour,
  isDay,
  loadClockState,
  momentAt,
  momentSeconds,
  monthIndex,
  periodIcon,
  periodLeft,
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
    // Astron: dawn hour 7 (still dark), day 8 → 20; the dusk hour 19 is still lit (stage 28 items 59, 61)
    expect(isDay(3, 7)).toBe(false);
    expect(isDay(3, 8)).toBe(true);
    expect(isDay(3, 18)).toBe(true);
    expect(isDay(3, 19)).toBe(true);
    expect(isDay(3, 6)).toBe(false);
    expect(isDay(3, 20)).toBe(false);
    expect(nightHour(3)).toBe(20);
    // Solmath (the owner's log): "The light slowly increases" at 9, "The day has begun." at 10
    expect(isDay(1, 9)).toBe(false);
    expect(isDay(1, 10)).toBe(true);
    expect(dayHour(1)).toBe(10);
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
  it('counts down to the night (dusk + 1) by day, to the day (dawn + 1) by night, across midnight', () => {
    // Astron (3): dawn hour 7, the day 8:00 → 20:00.
    const day = clockAt(2973, 3, 12, 19, 55, 'minute').nextTransition(T)!;
    expect(day).toEqual({ period: 'day', at: T + 5 * 1000, from: T - 715 * 1000, precision: 'minute' });
    // the dusk hour is still day
    const dusk = clockAt(2973, 3, 12, 19, 0, 'minute').nextTransition(T)!;
    expect(dusk).toEqual({ period: 'day', at: T + 60 * 1000, from: T - 660 * 1000, precision: 'minute' });
    const night = clockAt(2973, 3, 12, 20, 0, 'minute').nextTransition(T)!;
    expect(night).toEqual({ period: 'night', at: T + 12 * 60 * 1000, from: T, precision: 'minute' });
    const early = clockAt(2973, 3, 12, 5, 30, 'minute').nextTransition(T)!;
    expect(early.period).toBe('night');
    expect(early.at).toBe(T + 150 * 1000);
    const late = clockAt(2973, 3, 12, 22, 0, 'minute').nextTransition(T)!;
    expect(late.at).toBe(T + (2 * 60 + 8 * 60) * 1000);
    // Day 30: the day of the next month (Thrimidge, dawn 7, day 8).
    const eom = clockAt(2973, 2, 30, 23, 0, 'minute').nextTransition(T)!;
    expect(eom.at).toBe(T + (60 + (DAWN[3]! + 1) * 60) * 1000);
  });

  it('the dawn hour is still night; the day begins an hour later (item 59)', () => {
    // Solmath (1): dawn hour 9, day from 10:00, dusk 17.
    const before = clockAt(2973, 1, 11, 8, 59, 'minute').nextTransition(T)!;
    expect(before).toEqual({ period: 'night', at: T + 61 * 1000, from: T - 899 * 1000, precision: 'minute' });
    const dawn = clockAt(2973, 1, 11, 9, 0, 'minute').nextTransition(T)!;
    expect(dawn).toEqual({ period: 'night', at: T + 60 * 1000, from: T - 900 * 1000, precision: 'minute' });
    const last = clockAt(2973, 1, 11, 9, 59, 'minute').nextTransition(T)!;
    expect(last).toEqual({ period: 'night', at: T + 1000, from: T - 959 * 1000, precision: 'minute' });
    const begun = clockAt(2973, 1, 11, 10, 0, 'minute').nextTransition(T)!;
    expect(begun).toEqual({ period: 'day', at: T + 8 * 3600 * 1000 / 60, from: T, precision: 'minute' });
    // hour precision in the dawn hour: ~1 to the day
    const h = clockAt(2973, 1, 11, 9, 0, 'hour').nextTransition(T)!;
    expect(h).toMatchObject({ period: 'night', at: T + 60 * 1000 });
  });

  it('dayBeginsAt: the start of this day, or of the next one at night (minute precision only)', () => {
    // Solmath (1): day from 10:00 to 18:00 (dusk hour 17).
    expect(dayBeginsAt(clockAt(2973, 1, 11, 9, 0, 'minute').state, T)).toBe(T + 60_000);
    expect(dayBeginsAt(clockAt(2973, 1, 11, 9, 59, 'minute').state, T + 400)).toBe(T + 1000);
    expect(dayBeginsAt(clockAt(2973, 1, 11, 10, 0, 'minute').state, T)).toBe(T);
    expect(dayBeginsAt(clockAt(2973, 1, 11, 17, 59, 'minute').state, T)).toBe(T - (7 * 60 + 59) * 1000);
    // after the day: tomorrow's
    expect(dayBeginsAt(clockAt(2973, 1, 11, 18, 0, 'minute').state, T)).toBe(T + (6 * 60 + 10 * 60) * 1000);
    // after dusk on day 30: the next month's (Rethe: dawn 8, day 9)
    expect(dayBeginsAt(clockAt(2973, 1, 30, 23, 0, 'minute').state, T)).toBe(T + (60 + 9 * 60) * 1000);
    expect(dayBeginsAt(clockAt(2973, 1, 11, 9, 0, 'hour').state, T)).toBeNull();
    expect(dayBeginsAt(new ClockModel().state, T)).toBeNull();
  });

  it('the dusk hour is still day; the night begins an hour later (item 61)', () => {
    // Solmath (1): dusk hour 17 ("The sun slowly disappears"), night from 18:00 ("The night has begun.").
    const set = clockAt(2973, 1, 11, 17, 0, 'minute').nextTransition(T)!;
    expect(set).toEqual({ period: 'day', at: T + 60 * 1000, from: T - 420 * 1000, precision: 'minute' });
    const last = clockAt(2973, 1, 11, 17, 59, 'minute').nextTransition(T)!;
    expect(last).toEqual({ period: 'day', at: T + 1000, from: T - 479 * 1000, precision: 'minute' });
    const begun = clockAt(2973, 1, 11, 18, 0, 'minute').nextTransition(T)!;
    expect(begun).toEqual({ period: 'night', at: T + (6 * 60 + 10 * 60) * 1000, from: T, precision: 'minute' });
  });

  it('nightBeginsAt: the start of this night (the evening before, after midnight), or of the coming one by day', () => {
    // Solmath (1): night from 18:00 to 10:00.
    expect(nightBeginsAt(clockAt(2973, 1, 11, 17, 0, 'minute').state, T)).toBe(T + 60_000);
    expect(nightBeginsAt(clockAt(2973, 1, 11, 17, 59, 'minute').state, T + 400)).toBe(T + 1000);
    expect(nightBeginsAt(clockAt(2973, 1, 11, 18, 0, 'minute').state, T)).toBe(T);
    expect(nightBeginsAt(clockAt(2973, 1, 11, 23, 0, 'minute').state, T)).toBe(T - 5 * 60_000);
    expect(nightBeginsAt(clockAt(2973, 1, 11, 10, 0, 'minute').state, T)).toBe(T + 8 * 60_000);
    // after midnight: the evening before
    expect(nightBeginsAt(clockAt(2973, 1, 11, 2, 0, 'minute').state, T)).toBe(T - 8 * 60_000);
    expect(nightBeginsAt(clockAt(2973, 1, 11, 9, 59, 'minute').state, T)).toBe(T - (15 * 60 + 59) * 1000);
    // after midnight on day 1: the last evening of the month before (Afteryule: dusk 18, night 19)
    expect(nightBeginsAt(clockAt(2973, 1, 1, 2, 0, 'minute').state, T)).toBe(T - 7 * 60_000);
    expect(nightBeginsAt(clockAt(2973, 1, 11, 17, 0, 'hour').state, T)).toBeNull();
  });

  it('the period began: minute precision, across midnight and into a new month and year', () => {
    // Astron (3): day 8:00 → 20:00, night 20:00 → 8:00.
    expect(clockAt(2973, 3, 12, 8, 0, 'minute').nextTransition(T)!.from).toBe(T);
    expect(clockAt(2973, 3, 12, 14, 30, 'minute').nextTransition(T + 700)!.from).toBe(T - 390_000);
    expect(clockAt(2973, 3, 12, 23, 10, 'minute').nextTransition(T)!.from).toBe(T - 190_000);
    // after midnight: the evening before (20:00), 6 h 10 min ago
    expect(clockAt(2973, 3, 12, 2, 10, 'minute').nextTransition(T)!.from).toBe(T - 370_000);
    // the 1st of Astron after midnight: the last evening of Rethe (dusk 18, night 19)
    expect(clockAt(2973, 3, 1, 2, 10, 'minute').nextTransition(T)!.from).toBe(T - (5 * 60 + 2 * 60 + 10) * 1000);
    // the 1st of Afteryule: the last evening of Foreyule the year before (dusk 19, night 20)
    const ny = clockAt(2974, 0, 1, 3, 0, 'minute').nextTransition(T)!;
    expect(ny.from).toBe(T - (4 * 60 + 3 * 60) * 1000);
    expect(ny.at).toBe(T + (DAWN[0]! + 1 - 3) * 60_000);
    // a night that starts on day 30 ends in the next month: the whole night is one period
    const eom = clockAt(2973, 2, 30, 23, 0, 'minute').nextTransition(T)!;
    expect(eom.at - eom.from).toBe((24 - (DUSK[2]! + 1) + DAWN[3]! + 1) * 60_000);
  });

  it('the period began: hour precision counts from the start of the game hour', () => {
    // Astron 14:xx, hour precision: the day began 6 game hours before :00.
    const h = clockAt(2973, 3, 12, 14, 0, 'hour');
    const t0 = h.nextTransition(T)!;
    expect(t0.from).toBe(T - 6 * 60_000);
    expect(t0.at).toBe(T + 6 * 60_000);
    // 40 s (game minutes) later the same estimate, moved with the wall clock
    const t1 = h.nextTransition(T + 40_000)!;
    expect(t1.at - t1.from).toBe(12 * 60_000);
    expect(periodLeft(t1, T + 40_000)).toBe(0.5);
    // after midnight at hour precision, on the 1st (Rethe's last evening: night 19)
    const n = clockAt(2973, 3, 1, 2, 0, 'hour').nextTransition(T)!;
    expect(n.period).toBe('night');
    expect(n.from).toBe(T - 7 * 60_000);
    expect(n.at).toBe(T + 6 * 60_000);
  });

  it('periodLeft: 1 as the period begins, 0 at the change, clamped', () => {
    const t = { period: 'day' as const, at: T + 600_000, from: T - 120_000, precision: 'minute' as const };
    expect(periodLeft(t, T - 120_000)).toBe(1);
    expect(periodLeft(t, T + 240_000)).toBe(0.5);
    expect(periodLeft(t, T + 600_000)).toBe(0);
    expect(periodLeft(t, T + 700_000)).toBe(0);
    expect(periodLeft(t, T - 500_000)).toBe(1);
    expect(periodLeft({ ...t, from: t.at }, T)).toBe(0);
  });

  it('hour precision ignores the minute; day and unset have none', () => {
    const h = clockAt(2973, 3, 12, 16, 0, 'hour').nextTransition(T + 20_000)!;
    expect(h.precision).toBe('hour');
    expect(h.at).toBe(T + 20_000 + 4 * 3600 * 1000 / 60);
    expect(clockAt(2973, 3, 12, 16, 0, 'day').nextTransition(T)).toBeNull();
    expect(new ClockModel().nextTransition(T)).toBeNull();
  });

  it('formats H:MM and ~N', () => {
    const t = { period: 'day' as const, at: T + 273_000, from: T - 207_000, precision: 'minute' as const };
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
