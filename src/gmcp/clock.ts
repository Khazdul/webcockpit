// MUME game clock (Inv §2.5). Pure TS, no DOM, no timers.
//
// One anchor: `epoch`, the real unix second at which MUME year 0, month 0,
// day 1, 00:00 began. 1 real second = 1 game minute; an hour is 60 s, a
// day 1440 s, a month 30 days, a year 12 months (518 400 s). The time now
// is computed from the anchor on demand.
//
// Precision: unset < day < hour < minute. It never goes down while the
// page lives; only loading an old saved state lowers it (age rules).
//
// Sync sources (all passive, nothing is sent):
//   GMCP Event.Sun {what: rise|set}    hour = dawn/dusk of the month, :00 → minute (needs ≥ day)
//   GMCP Event.Sun {what: light|dark}  hour = dawn+1 / dusk+1, :00 → minute (needs ≥ day)
//   `8 am on Mersday, the 26th of Solmath, year 2973 of the Third Age.`  → hour
//   `Mersday, the 26th of Solmath, year 2973 of the Third Age.`         → day (keeps known hour/minute)
//   `The current time is 8:00am.`      hour + minute → minute (needs ≥ day)
//   MSSP GAME YEAR/MONTH/DAY/HOUR      → hour, only while precision ≤ day
//     (MUME's MSSP table; the day is 0-based there, as MMapper reads it)
//
// Weekdays follow Shire Reckoning: every year starts on Sterday, so a
// date has the same weekday every year (checked against `time` lines in
// Cockpit's 2026 logs).
//
// The input-line strip shows the time to the next day/night change
// (`nextTransition`, `stripText`); the Character pane no longer shows it.

/** localStorage key of the clock state (saved by src/gmcp/state.ts). */
export const CLOCK_KEY = 'wc.clock';

/** Clock precision, lowest first. */
export type Precision = 'unset' | 'day' | 'hour' | 'minute';
const RANK: Readonly<Record<Precision, number>> = { unset: 0, day: 1, hour: 2, minute: 3 };
export const PRECISIONS: readonly Precision[] = ['unset', 'day', 'hour', 'minute'];

export const MINUTE_S = 1;
export const HOUR_S = 60;
export const DAY_S = 1440;
export const MONTH_S = 43_200;
export const YEAR_S = 518_400;

/** Cold-start anchor: MUME year 2850 began ≈ unix 1696118400 (Oct 2023). */
export const SEED_EPOCH = 1_696_118_400 - 2850 * YEAR_S;

/** Dawn and dusk hour per month (0 = Afteryule). */
export const DAWN: readonly number[] = [8, 9, 8, 7, 7, 6, 5, 4, 5, 6, 7, 7];
export const DUSK: readonly number[] = [18, 17, 18, 19, 20, 20, 21, 22, 21, 20, 20, 19];

export const MONTHS_WESTRON: readonly string[] = [
  'Afteryule', 'Solmath', 'Rethe', 'Astron', 'Thrimidge', 'Forelithe',
  'Afterlithe', 'Wedmath', 'Halimath', 'Winterfilth', 'Blotmath', 'Foreyule',
];
export const MONTHS_SINDARIN: readonly string[] = [
  'Narwain', 'Ninui', 'Gwaeron', 'Gwirith', 'Lothron', 'Norui',
  'Cerveth', 'Urui', 'Ivanneth', 'Narbeleth', 'Hithui', 'Girithron',
];
export const WEEKDAYS: readonly string[] = ['Sterday', 'Sunday', 'Monday', 'Trewsday', 'Hevensday', 'Mersday', 'Highday'];

/** Age of the last sync after which a saved state is not trusted (Inv §2.5). */
export const TRUST_FULL_S = 24 * 3600;
export const TRUST_DAY_S = 7 * 24 * 3600;

/** Month index (0–11) for a Westron or Sindarin name, case-insensitive; -1 if unknown. */
export function monthIndex(name: string): number {
  const n = name.trim().toLowerCase();
  let i = MONTHS_WESTRON.findIndex((m) => m.toLowerCase() === n);
  if (i < 0) i = MONTHS_SINDARIN.findIndex((m) => m.toLowerCase() === n);
  return i;
}

/** A point in game time. */
export interface Moment {
  year: number;
  /** 0–11. */
  month: number;
  /** 1–30. */
  day: number;
  hour: number;
  minute: number;
  /** 0–6 (0 = Sterday). */
  weekday: number;
}

/** The saved / live clock state. Times in unix seconds. */
export interface ClockState {
  epoch: number;
  precision: Precision;
  lastSync: number | null;
  reason: string | null;
  /**
   * Diagnostics: the last GMCP `Event.Moon` against the moon model
   * (gametime.ts), as `set +0` (game minutes late). Never syncs: one
   * logged event matched to the minute, too few to trust (stage 18).
   */
  moonCheck?: string;
}

/** Game seconds since the anchor for a moment (day is 1-based). */
export function momentSeconds(year: number, month: number, day: number, hour: number, minute: number): number {
  return year * YEAR_S + month * MONTH_S + (day - 1) * DAY_S + hour * HOUR_S + minute * MINUTE_S;
}

/** The moment `nowS` (unix s) under anchor `epoch`. */
export function momentAt(epoch: number, nowS: number): Moment {
  const e = Math.max(0, Math.floor(nowS - epoch));
  return {
    year: Math.floor(e / YEAR_S),
    month: Math.floor(e / MONTH_S) % 12,
    day: (Math.floor(e / DAY_S) % 30) + 1,
    hour: Math.floor(e / HOUR_S) % 24,
    minute: e % 60,
    weekday: weekdayOf(Math.floor(e / MONTH_S) % 12, (Math.floor(e / DAY_S) % 30) + 1),
  };
}

/** Weekday (0 = Sterday) of a date: the day of the year modulo 7, the same every year. */
export function weekdayOf(month: number, day: number): number {
  return (month * 30 + day - 1) % 7;
}

/** Day: dawn ≤ hour < dusk of the month; everything else is night. */
export function isDay(month: number, hour: number): boolean {
  return hour >= DAWN[month]! && hour < DUSK[month]!;
}

/** 12-hour clock → 0–23 (`12 am` = 0, `12 pm` = 12). */
export function hour24(h: number, ampm: string): number {
  const pm = ampm.toLowerCase().startsWith('p');
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

export type Period = 'day' | 'night';

/** The next day/night change: the current period and when it ends (ms). */
export interface Transition {
  period: Period;
  /** Unix ms of the change. */
  at: number;
  precision: 'hour' | 'minute';
}

/** A clock state that has never synced. */
export function unsetClock(): ClockState {
  return { epoch: SEED_EPOCH, precision: 'unset', lastSync: null, reason: null };
}

/**
 * A saved state after the age rules (Inv §2.5 "Persistence"): missing,
 * unreadable or older than 7 days → seed, unset; 24 h – 7 days → kept but
 * at most day; newer → as stored.
 */
export function loadClockState(json: string | null, nowMs: number): ClockState {
  if (!json) return unsetClock();
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return unsetClock();
  }
  if (typeof o !== 'object' || o === null) return unsetClock();
  const r = o as Record<string, unknown>;
  const epoch = r.epoch;
  const lastSync = r.lastSync;
  const precision = r.precision;
  if (typeof epoch !== 'number' || !Number.isFinite(epoch)) return unsetClock();
  if (typeof lastSync !== 'number' || !Number.isFinite(lastSync)) return unsetClock();
  if (typeof precision !== 'string' || !(precision in RANK)) return unsetClock();
  const age = nowMs / 1000 - lastSync;
  if (age > TRUST_DAY_S) return unsetClock();
  const reason = typeof r.reason === 'string' ? r.reason : null;
  let p = precision as Precision;
  if (age > TRUST_FULL_S && RANK[p] > RANK.day) p = 'day';
  const out: ClockState = { epoch: Math.round(epoch), precision: p, lastSync, reason };
  if (typeof r.moonCheck === 'string') out.moonCheck = r.moonCheck;
  return out;
}

const TIME_FULL_RE = /^(\d+)(?::\d{2})?\s*(am|pm) on (\w+), the (\d+)\w* of (\w+), year (\d+) of the Third Age\.$/i;
const TIME_DATE_RE = /^(\w+), the (\d+)\w* of (\w+), year (\d+) of the Third Age\.$/i;
const ROOM_CLOCK_RE = /^The current time is (\d+):(\d+)\s*(am|pm)\.$/i;

export class ClockModel {
  state: ClockState;
  /** Bumped on every change. */
  version = 0;

  constructor(state: ClockState = unsetClock()) {
    this.state = { ...state };
  }

  get precision(): Precision {
    return this.state.precision;
  }

  /** The moment now, or null while unset. */
  now(nowMs: number): Moment | null {
    if (this.state.precision === 'unset') return null;
    return momentAt(this.state.epoch, nowMs / 1000);
  }

  private anchor(m: Omit<Moment, 'weekday'>, nowMs: number, precision: Precision, reason: string): void {
    const nowS = Math.floor(nowMs / 1000);
    this.state = {
      ...this.state,
      epoch: nowS - momentSeconds(m.year, m.month, m.day, m.hour, m.minute),
      precision: RANK[precision] > RANK[this.state.precision] ? precision : this.state.precision,
      lastSync: nowS,
      reason,
    };
    this.version++;
  }

  /**
   * GMCP `Event.Moon` (`rise` / `set`): records `delta` (game minutes the
   * event came after the predicted one, from `moonEventDelta`) in
   * `state.moonCheck`. Diagnostics only; the anchor does not move. Needs
   * ≥ hour. Returns true when it recorded.
   */
  noteMoon(what: unknown, delta: number): boolean {
    if (what !== 'rise' && what !== 'set') return false;
    if (RANK[this.state.precision] < RANK.hour) return false;
    this.state = { ...this.state, moonCheck: `${what} ${delta >= 0 ? '+' : ''}${delta}` };
    return true;
  }

  /**
   * GMCP `Event.Sun` (needs ≥ day): `rise` at dawn, `light` an hour later,
   * `set` at dusk, `dark` an hour later, each on the hour. The logs show
   * `light`/`dark` far more often than `rise`/`set`.
   */
  syncSun(what: unknown, nowMs: number): boolean {
    if (what !== 'rise' && what !== 'set' && what !== 'light' && what !== 'dark') return false;
    const m = this.now(nowMs);
    if (!m) return false;
    const hour = what === 'rise' ? DAWN[m.month]! : what === 'light' ? DAWN[m.month]! + 1 : what === 'set' ? DUSK[m.month]! : DUSK[m.month]! + 1;
    this.anchor({ ...m, hour, minute: 0 }, nowMs, 'minute', `sun_${what}`);
    return true;
  }

  /**
   * A `time` output line ending in `of the Third Age.` (full: date + hour
   * → hour; date only → day). Returns true when it synced.
   */
  syncTimeLine(line: string, nowMs: number): boolean {
    const text = line.trim();
    const cur = this.now(nowMs);
    const p = RANK[this.state.precision];
    let m = TIME_FULL_RE.exec(text);
    if (m) {
      const month = monthIndex(m[5]!);
      const hour = Number(m[1]);
      if (month < 0 || hour < 1 || hour > 12) return false;
      const day = Number(m[4]);
      if (day < 1 || day > 30) return false;
      const minute = p >= RANK.minute && cur ? cur.minute : 0;
      this.anchor({ year: Number(m[6]), month, day, hour: hour24(hour, m[2]!), minute }, nowMs, 'hour', 'time_dated');
      return true;
    }
    m = TIME_DATE_RE.exec(text);
    if (m) {
      const month = monthIndex(m[3]!);
      const day = Number(m[2]);
      if (month < 0 || day < 1 || day > 30) return false;
      const hour = p >= RANK.hour && cur ? cur.hour : 0;
      const minute = p >= RANK.minute && cur ? cur.minute : 0;
      this.anchor({ year: Number(m[4]), month, day, hour, minute }, nowMs, 'day', 'time_day');
      return true;
    }
    return false;
  }

  /** `The current time is 8:00am.` (needs ≥ day) → minute. */
  syncRoomClock(line: string, nowMs: number): boolean {
    const m = ROOM_CLOCK_RE.exec(line.trim());
    if (!m) return false;
    const cur = this.now(nowMs);
    if (!cur) return false;
    const h = Number(m[1]);
    const minute = Number(m[2]);
    if (h < 1 || h > 12 || minute > 59) return false;
    this.anchor({ ...cur, hour: hour24(h, m[3]!), minute }, nowMs, 'minute', 'room_clock');
    return true;
  }

  /**
   * An MSSP table: `GAME YEAR`, `GAME MONTH` (a name), `GAME DAY` (0–29),
   * `GAME HOUR` (0–23) → hour. Ignored when the clock is already finer
   * than day (MSSP has no minute).
   */
  syncMssp(vars: ReadonlyMap<string, readonly string[]>, nowMs: number): boolean {
    if (RANK[this.state.precision] > RANK.day) return false;
    const get = (k: string): string | undefined => vars.get(k)?.[0]?.trim();
    const y = get('GAME YEAR');
    const mo = get('GAME MONTH');
    const d = get('GAME DAY');
    const h = get('GAME HOUR');
    if (y === undefined || mo === undefined || d === undefined || h === undefined) return false;
    if (!/^\d+$/.test(y) || !/^\d+$/.test(d) || !/^\d+$/.test(h)) return false;
    const month = /^\d+$/.test(mo) ? Number(mo) : monthIndex(mo);
    const day0 = Number(d);
    const hour = Number(h);
    if (month < 0 || month > 11 || day0 > 29 || hour > 23) return false;
    this.anchor({ year: Number(y), month, day: day0 + 1, hour, minute: 0 }, nowMs, 'hour', 'mssp');
    return true;
  }

  /** The next day/night change, or null below hour precision. */
  nextTransition(nowMs: number): Transition | null {
    const p = this.state.precision;
    if (p !== 'hour' && p !== 'minute') return null;
    const m = momentAt(this.state.epoch, nowMs / 1000);
    const minute = p === 'minute' ? m.minute : 0;
    const t = m.hour * 60 + minute;
    let until: number;
    let period: Period;
    if (isDay(m.month, m.hour)) {
      period = 'day';
      until = DUSK[m.month]! * 60 - t;
    } else if (m.hour < DAWN[m.month]!) {
      period = 'night';
      until = DAWN[m.month]! * 60 - t;
    } else {
      period = 'night';
      const next = m.day === 30 ? (m.month + 1) % 12 : m.month;
      until = 24 * 60 - t + DAWN[next]! * 60;
    }
    // Game minutes are real seconds; count from the start of this second.
    const at = (Math.floor(nowMs / 1000) + until) * 1000;
    return { period, at, precision: p };
  }
}

/** Width of the countdown text in the strip. */
export const STRIP_TIME_W = 5;

/**
 * The countdown text (Inv §2.5): minute precision `H:MM` (game hours and
 * minutes = real minutes and seconds), hour precision `~N` (game hours
 * left, rounded up, at least 1).
 */
export function countdownText(t: Transition, nowMs: number): string {
  const remaining = Math.max(0, Math.floor((t.at - nowMs) / 1000));
  if (t.precision === 'minute') {
    return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  }
  return `~${Math.max(1, Math.ceil(remaining / 60))}`;
}

/** The strip's icon for a period: ☼ day, ☾ night. */
export const periodIcon = (p: Period): string => (p === 'day' ? '☼' : '☾');
