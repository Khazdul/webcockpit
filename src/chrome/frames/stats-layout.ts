// Statistics (Inv §7.3): the pure helpers the Statistics views share
// (History → Stats, frames/history-stats.tsx; the Statistics pane,
// ../stats-pane.ts): number and clock formatting and the table sorting. No
// DOM; unit tested. The cell-grid layout of the old Statistics page (widths,
// title rows, sparklines and the XP ruler as coloured segments) went with
// that page in stage 55.

import type { KillRow, PvpRow } from '../../runs/stats';

// ------------------------------------------------------------ formatting

/** `950`, `9.1k`, `48.2k`, `482k`, `1.2M`, `12M` (negative with `-`). */
export function fmtK(n: number): string {
  const v = Math.round(Math.abs(n));
  const sign = n < 0 && v > 0 ? '-' : '';
  let s: string;
  if (v < 1000) s = String(v);
  else if (v < 99_950) s = (v / 1000).toFixed(1) + 'k';
  else if (v < 999_500) s = Math.round(v / 1000) + 'k';
  else if (v < 9_950_000) s = (v / 1e6).toFixed(1) + 'M';
  else s = Math.round(v / 1e6) + 'M';
  return sign + s;
}

/** A clock on a sparkline's x-axis: `00:00`, `34:12`, `2:14:00`. */
export function fmtClock(us: number): string {
  const s = Math.max(0, Math.floor(us / 1e6));
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}` : `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
}

// ----------------------------------------------------------------- tables

export type KillSortKey = 'name' | 'n' | 'xpPer' | 'xpTotal';
export type PvpSortKey = 'name' | 'n' | 'xp';

export interface StatSort<K extends string> {
  key: K;
  dir: 1 | -1;
}

export const DEFAULT_KILL_SORT: StatSort<KillSortKey> = {
  key: 'xpTotal',
  dir: -1,
};
export const DEFAULT_PVP_SORT: StatSort<PvpSortKey> = { key: 'xp', dir: -1 };

/** Same column flips; a new column starts at its type's default (text ▲, numbers ▼). */
export function nextStatSort<K extends string>(cur: StatSort<K>, key: K): StatSort<K> {
  if (cur.key === key) return { key, dir: cur.dir > 0 ? -1 : 1 };
  return { key, dir: key === 'name' ? 1 : -1 };
}

export function sortKills(rows: readonly KillRow[], s: StatSort<KillSortKey>): KillRow[] {
  return [...rows].sort((a, b) => {
    const d = s.key === 'name' ? a.name.localeCompare(b.name) : a[s.key] - b[s.key];
    return d * s.dir || b.xpTotal - a.xpTotal || a.name.localeCompare(b.name);
  });
}

export function sortPvps(rows: readonly PvpRow[], s: StatSort<PvpSortKey>): PvpRow[] {
  return [...rows].sort((a, b) => {
    const d = s.key === 'name' ? a.label.localeCompare(b.label) : a[s.key] - b[s.key];
    return d * s.dir || b.xp - a.xp || a.label.localeCompare(b.label);
  });
}
