// The items of the sync (ADR 0151): their bodies, the content hash, the
// names a conflict or a collision gives, the device label. Pure.
//
//   body (in the blob) = UTF-8 of canonicalJson({ v, ...record })
//                        (gzip of it for a kind with `compress`: comm, ADR 0152)
//   hash               = base64url(SHA-256(UTF-8(kind | "\n" | canonicalJson(record))))
//
// `v` is the body's format version per kind. A reader refuses a `v` above
// its own and leaves the item untouched ("update the client"); a field is
// never added without raising `v`, so an older client never drops one it
// does not know. The hash is over the record without `v`, so raising a
// version does not make every item look edited.

import { type Browser, DEVICE_TYPES, type DeviceType, type SyncKind } from '../../../shared/cloud/api.ts';
import { SETTINGS_VERSION } from '../../settings/types';
import { toBase64Url } from '../crypto/base64url';
import type { Body, CommItem, CommPieceRecord, ItemKind, ProfileItem, ScriptDataItem, ScriptItem, SettingsItem, TimersItem } from './types';

/**
 * How a conflict on the kind is settled (ADR 0146's table): `keepBoth`
 * (profile, script), `lastWriter` (the small kinds), `merge` (comm, ADR
 * 0152: `KindSpec.merge`).
 */
export type ConflictPolicy = 'keepBoth' | 'lastWriter' | 'merge';

/** The result of reading a body. */
export type Decoded = { ok: true; body: Body } | { ok: false; why: 'newer' | 'unreadable' };

/** The rules of a kind's names (both kinds: a letter, then letters, digits, `_` (scripts also `-`), at most 32). */
export interface NameRules {
  max: number;
  /** The characters allowed after the first, as a character class body. */
  allowed: RegExp;
}

/** What the engine knows about one kind. */
export interface KindSpec {
  kind: SyncKind;
  /** The highest body version this client writes and reads. */
  version: number;
  policy: ConflictPolicy;
  /** The local key of a record. */
  key(body: Body): string;
  /** Reads a body (parsed JSON); `newer` for a `v` above `version`. */
  decode(raw: unknown): Decoded;
  /** Names, when the kind's items have unique names. */
  names?: {
    rules: NameRules;
    get(body: Body): string;
    set(body: Body, name: string): Body;
  };
  /** A keep-both copy: the local record under a new key (its times kept). */
  copy?(body: Body, key: string, name: string): Body;
  /** `merge`: the record both an edited local and an edited remote version become (same key). */
  merge?(local: Body, remote: Body): Body;
  /** What the hashes are over, when not the whole record (settings: without `from`). */
  hashed?(body: Body): Body;
  /** The blob's plaintext is gzip of the canonical JSON (comm). The hashes stay over the JSON. */
  compress?: boolean;
}

// --- Canonical encoding and hash ---

/**
 * JSON with object keys sorted (by UTF-16 code units) and no whitespace.
 * Values are what the records hold: strings, finite numbers, booleans,
 * null, arrays and plain objects.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: a number that is not finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new Error(`canonicalJson: a ${typeof value}`);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** The content hash of a record of `kind`: 43 characters of base64url. */
export async function contentHash(kind: SyncKind, body: Body): Promise<string> {
  const bytes = encoder.encode(`${kind}\n${canonicalJson(body)}`);
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

/**
 * A record's two hashes: `hash` over all of it, `bare` over all but the
 * name (equal to `hash` for a kind without names). `bare` tells a rename
 * that moved nothing else (the engine's own, to keep names unique) from
 * an edit.
 */
export async function itemHashes(spec: KindSpec, record: Body): Promise<{ hash: string; bare: string }> {
  const body = spec.hashed ? spec.hashed(record) : record;
  const hash = await contentHash(spec.kind, body);
  if (!spec.names) return { hash, bare: hash };
  return { hash, bare: await contentHash(spec.kind, { ...body, name: undefined }) };
}

/** The plaintext of a blob: the record with its format version (gzipped for a kind with `compress`). */
export async function encodeBody(spec: KindSpec, body: Body): Promise<Uint8Array<ArrayBuffer>> {
  const json = encoder.encode(canonicalJson({ ...body, v: spec.version })) as Uint8Array<ArrayBuffer>;
  return spec.compress ? gzip(json) : json;
}

/** The record in a blob's plaintext. */
export async function decodeBody(spec: KindSpec, plain: Uint8Array): Promise<Decoded> {
  let raw: unknown;
  try {
    const json = spec.compress ? await gunzip(plain, MAX_PLAIN_BYTES) : plain;
    raw = JSON.parse(decoder.decode(json));
  } catch {
    return { ok: false, why: 'unreadable' };
  }
  return spec.decode(raw);
}

/** The most a compressed body may grow to when it is opened (an item is at most 1 MB compressed). */
export const MAX_PLAIN_BYTES = 32 * 1024 * 1024;

async function streamBytes(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new Error('a compressed body too large');
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** gzip (`CompressionStream`). */
export function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return streamBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), Number.POSITIVE_INFINITY);
}

/** The bytes gzipped in `bytes`; rejects on a stream that is not gzip or grows over `max`. */
export function gunzip(bytes: Uint8Array, max = MAX_PLAIN_BYTES): Promise<Uint8Array<ArrayBuffer>> {
  return streamBytes(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip')), max);
}

// --- The kinds ---

const isStr = (x: unknown): x is string => typeof x === 'string';
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const UNREADABLE: Decoded = { ok: false, why: 'unreadable' };

/** `v` of a parsed body: `newer` above `version`, `unreadable` when it is not a version. */
function checkVersion(raw: unknown, version: number): { fields: Record<string, unknown> } | { refused: Decoded } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { refused: { ok: false, why: 'unreadable' } };
  const v = (raw as { v?: unknown }).v;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { refused: { ok: false, why: 'unreadable' } };
  if (v > version) return { refused: { ok: false, why: 'newer' } };
  return { fields: raw as Record<string, unknown> };
}

/** Profile names (src/profiles/names.ts): a letter, then letters, digits and `_`, at most 32. */
export const PROFILE_NAMES: NameRules = { max: 32, allowed: /[A-Za-z0-9_]/ };
/** Script names (src/scripts/library.ts): a letter, then letters, digits, `_` and `-`, at most 32. */
export const SCRIPT_NAMES: NameRules = { max: 32, allowed: /[A-Za-z0-9_-]/ };

export const PROFILE_VERSION = 1;
export const SCRIPT_VERSION = 1;

export const profileSpec: KindSpec = {
  kind: 'profile',
  version: PROFILE_VERSION,
  policy: 'keepBoth',
  key: (b) => (b as unknown as ProfileItem).id,
  decode(raw) {
    const r = checkVersion(raw, PROFILE_VERSION);
    if ('refused' in r) return r.refused;
    const { id, name, text, created, modified } = r.fields;
    if (!isStr(id) || id === '' || !isStr(name) || !isStr(text) || !isTime(created) || !isTime(modified)) return { ok: false, why: 'unreadable' };
    const body: ProfileItem = { id, name, text, created, modified };
    return { ok: true, body: body as unknown as Body };
  },
  names: {
    rules: PROFILE_NAMES,
    get: (b) => (b as unknown as ProfileItem).name,
    set: (b, name) => ({ ...b, name }),
  },
  copy: (b, key, name) => ({ ...b, id: key, name }),
};

export const scriptSpec: KindSpec = {
  kind: 'script',
  version: SCRIPT_VERSION,
  policy: 'keepBoth',
  key: (b) => (b as unknown as ScriptItem).id,
  decode(raw) {
    const r = checkVersion(raw, SCRIPT_VERSION);
    if ('refused' in r) return r.refused;
    const { id, name, source, enabled, created, updated } = r.fields;
    if (!isStr(id) || id === '' || !isStr(name) || !isStr(source) || typeof enabled !== 'boolean' || !isTime(created) || !isTime(updated)) {
      return { ok: false, why: 'unreadable' };
    }
    const body: ScriptItem = { id, name, source, enabled, created, updated };
    return { ok: true, body: body as unknown as Body };
  },
  names: {
    rules: SCRIPT_NAMES,
    get: (b) => (b as unknown as ScriptItem).name,
    set: (b, name) => ({ ...b, name }),
  },
  copy: (b, key, name) => ({ ...b, id: key, name }),
};

// --- The small kinds (ADR 0152) ---

export const SETTINGS_ITEM_VERSION = 1;
export const SCRIPT_DATA_VERSION = 1;
export const TIMERS_VERSION = 1;
export const COMM_VERSION = 1;

/** `settings`: one item per device type, `{type, record, from?}`; last writer; `from` is not hashed. */
export const settingsSpec: KindSpec = {
  kind: 'settings',
  version: SETTINGS_ITEM_VERSION,
  policy: 'lastWriter',
  key: (b) => (b as unknown as SettingsItem).type,
  decode(raw) {
    const r = checkVersion(raw, SETTINGS_ITEM_VERSION);
    if ('refused' in r) return r.refused;
    const { type, record, from } = r.fields;
    if (!isStr(type) || !(DEVICE_TYPES as readonly string[]).includes(type) || !isObj(record) || (from !== undefined && !isStr(from))) return UNREADABLE;
    const version = record.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return UNREADABLE;
    // A newer client's settings: left untouched ("update the client"). An older one is migrated by the store.
    if (version > SETTINGS_VERSION) return { ok: false, why: 'newer' };
    const body = { type, record, ...(from !== undefined ? { from } : {}) } as unknown as SettingsItem;
    return { ok: true, body: body as unknown as Body };
  },
  hashed: (b) => ({ ...b, from: undefined }),
};

/** `scriptData`: one item per script name (bundled and user), the library's record; last writer. */
export const scriptDataSpec: KindSpec = {
  kind: 'scriptData',
  version: SCRIPT_DATA_VERSION,
  policy: 'lastWriter',
  key: (b) => (b as unknown as ScriptDataItem).name,
  decode(raw) {
    const r = checkVersion(raw, SCRIPT_DATA_VERSION);
    if ('refused' in r) return r.refused;
    const { name, enabled, settings, store } = r.fields;
    if (!isStr(name) || name === '' || (enabled !== undefined && typeof enabled !== 'boolean') || !isObj(settings) || !isObj(store)) return UNREADABLE;
    const body = { name, settings, store, ...(enabled !== undefined ? { enabled } : {}) } as unknown as ScriptDataItem;
    return { ok: true, body: body as unknown as Body };
  },
};

/** `timers`: one item per character, the archive's record; last writer. */
export const timersSpec: KindSpec = {
  kind: 'timers',
  version: TIMERS_VERSION,
  policy: 'lastWriter',
  key: (b) => (b as unknown as TimersItem).character,
  decode(raw) {
    const r = checkVersion(raw, TIMERS_VERSION);
    if ('refused' in r) return r.refused;
    const { character, savedAt, state } = r.fields;
    if (!isStr(character) || character === '' || !isTime(savedAt)) return UNREADABLE;
    const body: TimersItem = { character, savedAt, state: state ?? null };
    return { ok: true, body: body as unknown as Body };
  },
};

/** A Comm day's key: `YYYY-MM-DD`, or `YYYY-MM-DD.<n>` (n ≥ 2) for a further piece of the day. */
export const COMM_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}(?:\.(?:[2-9]|[1-9]\d+))?$/;

/** The UTC day of a time, `YYYY-MM-DD`. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A Comm record's identity: its canonical JSON (without `seq`). */
export function commIdentity(rec: CommPieceRecord): string {
  return canonicalJson(rec);
}

/** A Comm record of a piece, without `seq` and fields it does not know; null when it is not one. */
function commRecord(x: unknown): CommPieceRecord | null {
  if (!isObj(x)) return null;
  const { character, ts, channel, talker, talkerType, destination, text } = x;
  const strOrNull = (y: unknown): y is string | null => y === null || isStr(y);
  if (!isStr(character) || !isTime(ts) || !isStr(channel) || !isStr(talker) || !strOrNull(talkerType) || !strOrNull(destination) || !isStr(text)) return null;
  return { character, ts, channel, talker, talkerType, destination, text };
}

/** Records sorted by `ts`, then identity, each identity once. */
export function sortCommRecords(records: Iterable<CommPieceRecord>): CommPieceRecord[] {
  const byId = new Map<string, CommPieceRecord>();
  for (const r of records) {
    const id = commIdentity(r);
    if (!byId.has(id)) byId.set(id, r);
  }
  return [...byId]
    .sort(([ia, a], [ib, b]) => a.ts - b.ts || (ia < ib ? -1 : ia > ib ? 1 : 0))
    .map(([, r]) => r);
}

/** `comm`: one item per UTC day (or piece of one), merged by record; gzipped. */
export const commSpec: KindSpec = {
  kind: 'comm',
  version: COMM_VERSION,
  policy: 'merge',
  compress: true,
  key: (b) => (b as unknown as CommItem).day,
  decode(raw) {
    const r = checkVersion(raw, COMM_VERSION);
    if ('refused' in r) return r.refused;
    const { day, records } = r.fields;
    if (!isStr(day) || !COMM_DAY_PATTERN.test(day) || !Array.isArray(records)) return UNREADABLE;
    const recs: CommPieceRecord[] = [];
    for (const x of records) {
      const rec = commRecord(x);
      if (!rec) return UNREADABLE;
      recs.push(rec);
    }
    const body: CommItem = { day, records: sortCommRecords(recs) };
    return { ok: true, body: body as unknown as Body };
  },
  merge(local, remote) {
    const l = local as unknown as CommItem;
    const r = remote as unknown as CommItem;
    const body: CommItem = { day: r.day, records: sortCommRecords([...r.records, ...l.records]) };
    return body as unknown as Body;
  },
};

/** Every kind this client syncs, by kind. */
export const ITEM_SPECS: Readonly<Record<ItemKind, KindSpec>> = {
  profile: profileSpec,
  script: scriptSpec,
  settings: settingsSpec,
  scriptData: scriptDataSpec,
  timers: timersSpec,
  comm: commSpec,
};

/** The kinds in the order a sync handles them (ADR 0152): profile, script, settings, scriptData, timers, comm. */
export const SYNC_SPECS: readonly KindSpec[] = [profileSpec, scriptSpec, settingsSpec, scriptDataSpec, timersSpec, commSpec];

// --- Names ---

/** `base` if it is free, else `base_2`, `base_3` …, cut so the suffix fits. */
export function freeName(base: string, taken: ReadonlySet<string>, rules: NameRules): string {
  const b = base.slice(0, rules.max);
  if (!taken.has(b)) return b;
  for (let i = 2; ; i++) {
    const suffix = `_${i}`;
    const n = b.slice(0, rules.max - suffix.length) + suffix;
    if (!taken.has(n)) return n;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A short local date, "14 Nov". */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * The name of a keep-both copy: the spec's `<name> (from <device>, <date>)`
 * under today's name rules, which allow no spaces or brackets:
 * `warrior_from_phone_14Nov`, `warrior_from_Firefox_14Nov`. The device
 * word is the label's last part; the name is cut, never the device or
 * the date. Then made free like any name.
 */
export function keepBothName(name: string, deviceLabel: string, ms: number, taken: ReadonlySet<string>, rules: NameRules): string {
  const word = deviceWord(deviceLabel);
  const suffix = `_from_${word}_${shortDate(ms).replace(' ', '')}`;
  const base = name.slice(0, Math.max(1, rules.max - suffix.length)) + suffix;
  return freeName(base.slice(0, rules.max), taken, rules);
}

/** The label's last part, letters and digits only ("desktop, Firefox" → "Firefox"; "Samsung Internet" → "Samsung"). */
export function deviceWord(label: string): string {
  const last = label.split(',').pop()?.trim() ?? '';
  const word = (last.split(/\s+/)[0] ?? '').replace(/[^A-Za-z0-9]/g, '');
  return word === '' ? 'device' : word.slice(0, 12);
}

const BROWSER_WORDS: Record<Browser, string | null> = {
  firefox: 'Firefox',
  chrome: 'Chrome',
  safari: 'Safari',
  edge: 'Edge',
  samsung: 'Samsung',
  other: null,
};

/**
 * This device in a keep-both name and notice: "phone" and "tablet" alone
 * (a player rarely has two), a desktop with its browser ("desktop,
 * Firefox"), or "desktop" when the browser has no name.
 */
export function syncDeviceLabel(type: DeviceType, browser: Browser): string {
  if (type !== 'desktop') return type;
  const b = BROWSER_WORDS[browser];
  return b ? `desktop, ${b}` : 'desktop';
}

/**
 * The key of a keep-both copy, a UUID made from what it copies (the
 * item, the server rev it lost to, the local content), so a sync that is
 * cut off and run again makes the same copy, not a second one.
 */
export async function copyKey(kind: SyncKind, key: string, rev: number, localHash: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`copy\n${kind}\n${key}\n${rev}\n${localHash}`)));
  h[6] = (h[6]! & 0x0f) | 0x40;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = Array.from(h.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
