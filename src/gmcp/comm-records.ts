// A Comm record's rules (ADR 0152), shared by the Comm archive and the
// sync's `comm` kind (src/cloud/sync/items.ts): the UTC day, the fields a
// record has, its identity and the order of a day's records. Pure and
// small: the archive is on a guest's path and must not pull in the sync.

import { canonicalJson } from '../core/canonical-json';

/** A message as stored, without the store's `seq`: the `Comm.Channel.Text` fields as received. */
export interface NewCommRecord {
  /** Character name from `Char.Name`. */
  character: string;
  /** Receive time, ms since the epoch. */
  ts: number;
  channel: string;
  talker: string;
  /** `talker-type` as sent (npc, ally, neutral, enemy, player …), or null. */
  talkerType: string | null;
  /** `destination` (only on sent messages), or null. */
  destination: string | null;
  /** Text as sent, ANSI kept. */
  text: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * How long a Comm day is kept whole (stage 62 review, F9): while its start
 * is within 8 days 6 hours, so a day is given up (and its tombstone
 * pushed) only once all its records are past the pane's seven days, with
 * six hours for clocks that differ between devices. The sync lists such
 * a day and the archive's `prune` removes only days past it: a listed day
 * never loses records to pruning (which would read as an edit and push).
 */
export const COMM_LIST_MS = (8 * 24 + 6) * 3600_000;

/** The day (`YYYY-MM-DD`, or a piece key `YYYY-MM-DD.2`) is still kept at `now`. */
export function commDayKept(day: string, now: number): boolean {
  return Date.parse(`${day.slice(0, 10)}T00:00:00Z`) >= now - COMM_LIST_MS;
}

/** The start of the oldest day kept at `now`: every record before it is in a day past `COMM_LIST_MS`. */
export function commKeptFrom(now: number): number {
  return Math.ceil((now - COMM_LIST_MS) / DAY_MS) * DAY_MS;
}

/** The UTC day `YYYY-MM-DD` of a time in ms. */
export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** The start (inclusive) and end (exclusive) of a UTC day in ms; throws `RangeError` on a bad day. */
export function dayBounds(day: string): [number, number] {
  const m = DAY_RE.exec(day);
  const start = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || !Number.isFinite(start) || utcDay(start) !== day) throw new RangeError(`not a UTC day: ${day}`);
  return [start, start + DAY_MS];
}

/**
 * The record's fields without `seq` (and without anything else that is
 * not a field), or null when it is not a record: `character`, `channel`,
 * `talker`, `text` strings, `ts` a finite number, `talkerType` and
 * `destination` a string or null.
 */
export function commFields(raw: unknown): NewCommRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
  if (typeof r.character !== 'string' || typeof r.ts !== 'number' || !Number.isFinite(r.ts)) return null;
  if (typeof r.channel !== 'string' || typeof r.talker !== 'string' || typeof r.text !== 'string') return null;
  if (!strOrNull(r.talkerType) || !strOrNull(r.destination)) return null;
  return {
    character: r.character,
    ts: r.ts,
    channel: r.channel,
    talker: r.talker,
    talkerType: r.talkerType,
    destination: r.destination,
    text: r.text,
  };
}

/** A record's identity: the canonical JSON of its fields without `seq`. */
export function commIdentity(rec: NewCommRecord): string {
  return canonicalJson(commFields(rec) ?? rec);
}

/** Records sorted by `ts`, then identity, each identity once (a new array; a piece's order). */
export function sortCommRecords(records: Iterable<NewCommRecord>): NewCommRecord[] {
  const byId = new Map<string, NewCommRecord>();
  for (const r of records) {
    const id = commIdentity(r);
    if (!byId.has(id)) byId.set(id, r);
  }
  return [...byId]
    .sort(([ia, a], [ib, b]) => a.ts - b.ts || (ia < ib ? -1 : ia > ib ? 1 : 0))
    .map(([, r]) => r);
}
