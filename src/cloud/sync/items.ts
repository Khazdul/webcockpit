// The items of the sync (ADR 0151): their bodies, the content hash, the
// names a conflict or a collision gives, the device label. Pure.
//
//   body (in the blob) = UTF-8 of canonicalJson({ v, ...record })
//   hash               = base64url(SHA-256(UTF-8(kind | "\n" | canonicalJson(record))))
//
// `v` is the body's format version per kind. A reader refuses a `v` above
// its own and leaves the item untouched ("update the client"); a field is
// never added without raising `v`, so an older client never drops one it
// does not know. The hash is over the record without `v`, so raising a
// version does not make every item look edited.

import type { Browser, DeviceType, SyncKind } from '../../../shared/cloud/api.ts';
import { toBase64Url } from '../crypto/base64url';
import type { Body, ItemKind, ProfileItem, ScriptItem } from './types';

/** How a conflict on the kind is settled (ADR 0146's table). */
export type ConflictPolicy = 'keepBoth' | 'lastWriter';

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

/** The plaintext of a blob: the record with its format version. */
export function encodeBody(spec: KindSpec, body: Body): Uint8Array<ArrayBuffer> {
  return encoder.encode(canonicalJson({ ...body, v: spec.version })) as Uint8Array<ArrayBuffer>;
}

/** The record in a blob's plaintext. */
export function decodeBody(spec: KindSpec, plain: Uint8Array): Decoded {
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(plain));
  } catch {
    return { ok: false, why: 'unreadable' };
  }
  return spec.decode(raw);
}

// --- The two kinds ---

const isStr = (x: unknown): x is string => typeof x === 'string';
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

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

/** The kinds this client syncs, in the order a sync handles them. */
export const ITEM_SPECS: Readonly<Record<ItemKind, KindSpec>> = { profile: profileSpec, script: scriptSpec };

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
