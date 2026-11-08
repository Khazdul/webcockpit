// History (Inv §7.4): pure helpers for the page in history.tsx (stage 45,
// ADR 0130). Sorting, the pills' names, small formatters, the card's words
// (deeds, long date and duration, expiry), the phone's sort list and the
// box's width cap. No DOM; unit tested.

import { RETENTION_DAYS, type Session } from '../../runs/stitch';

/**
 * History's box stops at its content's width (table ≤ 800 + gap 26 + card
 * 290 + padding), centred (owner decision 2). Statistics uses the same
 * cap, so the box swap keeps the same rectangle and nothing morphs.
 */
export const HISTORY_MAX_W = 1180;

// ------------------------------------------------------------------ sort

export type HistorySortKey = 'char' | 'date' | 'time' | 'dur' | 'expires' | 'rating';

export interface HistorySort {
  key: HistorySortKey;
  /** 1 = ascending (▲), -1 = descending (▼). */
  dir: 1 | -1;
}

/** Newest first (Inv §7.4). */
export const DEFAULT_HISTORY_SORT: HistorySort = { key: 'date', dir: -1 };

/** A header click: the same column flips; a new one starts at its type's default (text ▲, the rest ▼). */
export function nextHistorySort(cur: HistorySort, key: HistorySortKey): HistorySort {
  if (cur.key === key) return { key, dir: cur.dir > 0 ? -1 : 1 };
  return { key, dir: key === 'char' ? 1 : -1 };
}

const minutesOfDay = (us: number): number => {
  const d = new Date(us / 1000);
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Sessions in `sort` order; start time (newest first) breaks ties.
 * Expires and Rating keep saved sessions above the unsaved ones in both
 * directions (Inv §7.4).
 */
export function sortSessions(list: readonly Session[], sort: HistorySort): Session[] {
  const { key, dir } = sort;
  const cmp = (a: Session, b: Session): number => {
    if (key === 'expires' || key === 'rating') {
      if (a.saved !== b.saved) return a.saved ? -1 : 1;
      if (key === 'rating') return (a.rating - b.rating) * dir;
      return ((a.expiresDays ?? 0) - (b.expiresDays ?? 0)) * dir;
    }
    switch (key) {
      case 'char':
        return a.character.localeCompare(b.character) * dir;
      case 'date':
        return (a.startUs - b.startUs) * dir;
      case 'time':
        return (minutesOfDay(a.startUs) - minutesOfDay(b.startUs)) * dir;
      case 'dur':
        return (a.endUs - a.startUs - (b.endUs - b.startUs)) * dir;
    }
  };
  return [...list].sort((a, b) => cmp(a, b) || b.startUs - a.startUs);
}

// ----------------------------------------------------------------- cells

const p2 = (n: number): string => String(n).padStart(2, '0');

/** `2026-09-26` (local). */
export function fmtDate(us: number): string {
  const d = new Date(us / 1000);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** `21:00` (local). */
export function fmtTime(us: number): string {
  const d = new Date(us / 1000);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** A duration as History shows it: `5h02m`, `34m`. */
export function fmtDur(us: number): string {
  const m = Math.max(0, Math.round(us / 60e6));
  return m >= 60 ? `${Math.floor(m / 60)}h${p2(m % 60)}m` : `${m}m`;
}

/** `★★★` for a rating (blank for 0). */
export const stars = (n: number): string => '★'.repeat(Math.max(0, Math.min(5, n)));

/** The characters with sessions, alphabetical (the filter pills after `All`). */
export function pillNames(list: readonly Session[]): string[] {
  return [...new Set(list.map((s) => s.character))].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------- misc

/** `12 KB`, `3.4 MB`, `1.2 GB`. */
export function fmtBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, n);
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  const txt = u === 0 || v >= 10 ? String(Math.round(v)) : v.toFixed(1);
  return `${txt} ${units[u]}`;
}

/** The storage line under History: `Storage: 1.2 MB of 2.0 GB`. */
export function storageText(est: { usage: number; quota: number } | null): string {
  if (!est) return '';
  return est.quota > 0
    ? `Storage: ${fmtBytes(est.usage)} of ${fmtBytes(est.quota)}`
    : `Storage: ${fmtBytes(est.usage)}`;
}

// ------------------------------------------------- the new-look page (stage 45)
//
// Pure helpers for the History page in the new look (WP 45-A): the card's
// deeds, long date and duration, the expiry tone and gauge, and the
// phone's sort list.

/** What a session did, summed over its runs' summaries. */
export interface SessionDeeds {
  kills: number;
  pkills: number;
  deaths: number;
}

/** The session's kills, PvP kills and deaths (the card's Deeds line); null when no run has a summary (runs older than stage 6). */
export function sessionDeeds(s: Pick<Session, 'runs'>): SessionDeeds | null {
  let seen = false;
  const out: SessionDeeds = { kills: 0, pkills: 0, deaths: 0 };
  for (const r of s.runs) {
    const m = r.summary;
    if (!m) continue;
    seen = true;
    out.kills += m.kills;
    out.pkills += m.pkills;
    out.deaths += m.deaths;
  }
  return seen ? out : null;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The deeds as the card shows them: `64 kills`, `2 PvP`, `1 death` (PvP and deaths null when none). */
export function deedsParts(d: SessionDeeds): { kills: string; pvp: string | null; deaths: string | null } {
  return {
    kills: plural(d.kills, 'kill'),
    pvp: d.pkills > 0 ? `${d.pkills} PvP` : null,
    deaths: d.deaths > 0 ? plural(d.deaths, 'death') : null,
  };
}

/** A duration in words, as the card shows it: `3 h 41 min`, `48 min`. */
export function fmtDurLong(us: number): string {
  const m = Math.max(0, Math.round(us / 60e6));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** `Friday, 6 November 2026` (local; the same in every engine, unlike `toLocaleDateString`). */
export function fmtLongDate(us: number): string {
  const d = new Date(us / 1000);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Days left at which the Expires cell turns warm (`--lk-soon`). */
export const EXPIRES_SOON_DAYS = 2;

/** The Expires cell's tone: `saved` gold, `soon` warm (≤ 2 days), `later` dim. */
export function expiryTone(s: Pick<Session, 'saved' | 'expiresDays'>): 'saved' | 'soon' | 'later' {
  if (s.saved || s.expiresDays === null) return 'saved';
  return s.expiresDays <= EXPIRES_SOON_DAYS ? 'soon' : 'later';
}

/** The Expires cell's text: `Saved` or `<N> days` (as the TUI table). */
export function expiresText(s: Pick<Session, 'saved' | 'expiresDays'>): string {
  return s.saved || s.expiresDays === null ? 'Saved' : `${s.expiresDays} days`;
}

/** The card's Kept line for an unsaved session: `Expires in 14 days`, `Expires in 1 day`, `Expires today`. */
export function expiresInText(days: number): string {
  return days <= 0 ? 'Expires today' : `Expires in ${plural(days, 'day')}`;
}

/** The drain gauge under the Kept line: the share of the retention left, 0–1. */
export function expiryLeft(days: number, retention = RETENTION_DAYS): number {
  return Math.max(0, Math.min(1, days / retention));
}

/** The phone's sort list (no table heads there); the value is `key:dir`. */
export const HISTORY_SORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'date:-1', label: 'Newest first' },
  { value: 'date:1', label: 'Oldest first' },
  { value: 'char:1', label: 'Character' },
  { value: 'dur:-1', label: 'Longest' },
  { value: 'rating:-1', label: 'Rating' },
  { value: 'expires:1', label: 'Expires soonest' },
];

/** A sort's value in the phone's list (`key:dir`). */
export const sortValue = (s: HistorySort): string => `${s.key}:${s.dir}`;

const SORT_KEYS: readonly HistorySortKey[] = ['char', 'date', 'time', 'dur', 'expires', 'rating'];

/** The sort a value of the phone's list names, or null. */
export function parseSortValue(v: string): HistorySort | null {
  const [k, d] = v.split(':');
  const key = SORT_KEYS.find((x) => x === k);
  if (!key || (d !== '1' && d !== '-1')) return null;
  return { key, dir: d === '1' ? 1 : -1 };
}

const SORT_WORDS: Record<HistorySortKey, string> = {
  char: 'character',
  date: 'date',
  time: 'time of day',
  dur: 'duration',
  expires: 'expiry',
  rating: 'rating',
};

/**
 * The phone's sort list for the current sort: the six fixed choices, plus
 * one for the current sort when it is none of them (a head click on a
 * wide window, say Time ▴), so the list always names the order shown.
 */
export function sortOptions(cur: HistorySort): { value: string; label: string }[] {
  const v = sortValue(cur);
  if (HISTORY_SORT_OPTIONS.some((o) => o.value === v)) return [...HISTORY_SORT_OPTIONS];
  return [...HISTORY_SORT_OPTIONS, { value: v, label: `By ${SORT_WORDS[cur.key]} ${cur.dir > 0 ? '▴' : '▾'}` }];
}
