// The directory of shared looks, the client's side (stage 80 part E, spec
// §7.14, ADR 0173): report your character's race, subrace, sex and library
// token, and ask for the group members'.
//
// - Silent unless `enabled()` (the caller: `apiAllowed()`, not a replay, the
//   flag `looks`): no request at all otherwise. Every call is made on idle
//   time, never awaited by the game path; a failure is silent and tried
//   again once after RETRY_MS (not in a loop).
// - Report: logged out `PUT /api/look` with the look key (`wc.lookKey`, a
//   random UUID made when first needed and used for nothing else, never the
//   statistics' device id), logged in `PUT /api/u/look` with the session.
//   At most once per character, space and session unless what is sent
//   changed. A 409 (the name is another owner's, or this owner has 20 names)
//   is remembered for the session and not tried again.
// - Unshare (the switch off): `DELETE` of the same family, which removes
//   every row of the owner. `releaseDevice()` is the take-over at login: the
//   key's rows go just before the login, and the account reports after it.
// - Ask: names gathered for GATHER_MS, at most LOOK_FIND_MAX a call; answers
//   cached in memory and in `localStorage` (`wc.lookDir`), a hit for 24 h and
//   a miss for 1 h, at most CACHE_MAX names. The caller never asks for NPCs.

import { LOOK_FIND_MAX, LOOK_KEY_PATTERN, LOOK_NAME_PATTERN, LOOK_RACES, LOOK_SEXES, LOOK_SUBRACES, type LookReport } from '../../shared/cloud/api';
import type { RaceKind, SubraceKind } from '../gmcp/race';
import type { DirectoryLook } from './resolve';

// The kinds are race.ts's (tests/unit/looks-library.test.ts checks the lists too).
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const kindsInStep: [Same<RaceKind, (typeof LOOK_RACES)[number]>, Same<SubraceKind, keyof typeof LOOK_SUBRACES>] = [true, true];
void kindsInStep;

export const LOOK_KEY_STORAGE = 'wc.lookKey';
export const LOOK_CACHE_STORAGE = 'wc.lookDir';
export const HIT_MS = 24 * 3_600_000;
export const MISS_MS = 3_600_000;
export const CACHE_MAX = 300;
export const GATHER_MS = 300;
export const RETRY_MS = 5 * 60_000;
export const TIMEOUT_MS = 4000;

export type LookSpace = 'device' | 'account';

/** What a report says of your character (the key and the route are the directory's). */
export type SelfReport = Omit<LookReport, 'key'>;

type FetchFn = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface DirectoryOptions {
  /** May the directory make a request now (see the file header). */
  enabled: () => boolean | Promise<boolean>;
  /** The space the page is in: `account` reports through the session. */
  space: () => LookSpace;
  fetch?: FetchFn | null;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
  /** Runs `fn` when the page is idle (requestIdleCallback; tests: at once). */
  idle?: (fn: () => void) => void;
  timer?: (fn: () => void, ms: number) => unknown;
  /** A random UUID (crypto.randomUUID). */
  uuid?: () => string;
}

interface Cached {
  at: number;
  look: DirectoryLook | null;
}

const isRace = (v: unknown): v is RaceKind => typeof v === 'string' && (LOOK_RACES as readonly string[]).includes(v);
const isSubrace = (v: unknown): v is SubraceKind => typeof v === 'string' && Object.hasOwn(LOOK_SUBRACES, v);
const isSex = (v: unknown): v is 'male' | 'female' => typeof v === 'string' && (LOOK_SEXES as readonly string[]).includes(v);
const TOKEN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A row from the server or the cache, checked (null: not one). */
export function rowOf(v: unknown): DirectoryLook | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const race = r.race === null || isRace(r.race) ? (r.race as RaceKind | null) : undefined;
  const subrace = r.subrace === null || isSubrace(r.subrace) ? (r.subrace as SubraceKind | null) : undefined;
  const sex = r.sex === null || isSex(r.sex) ? (r.sex as 'male' | 'female' | null) : undefined;
  const token = r.token === null || (typeof r.token === 'string' && r.token.length <= 64 && TOKEN.test(r.token)) ? (r.token as string | null) : undefined;
  if (race === undefined || subrace === undefined || sex === undefined || token === undefined) return null;
  return { race, subrace, sex, token };
}

const defaultIdle = (fn: () => void): void => {
  const w = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => unknown };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 2000 });
  else setTimeout(fn, 0);
};

export class LookDirectory {
  private readonly o: DirectoryOptions;
  private readonly now: () => number;
  private readonly idle: (fn: () => void) => void;
  private readonly timer: (fn: () => void, ms: number) => unknown;
  private readonly cache = new Map<string, Cached>();
  private readonly pending = new Set<string>();
  private readonly asking = new Set<string>();
  /** Names whose ask failed, and when: not asked again before RETRY_MS. */
  private readonly failed = new Map<string, number>();
  private gathering = false;
  /** What was last sent per `space|name`, as a signature. */
  private readonly sent = new Map<string, string>();
  /** `space|name` refused with a 409 this session. */
  private readonly refusedNames = new Set<string>();
  /** The report to send (the newest), and whether a send or a retry is under way. */
  private want: { space: LookSpace; r: SelfReport } | null = null;
  private unshareWanted: LookSpace | null = null;
  private busy = false;
  private retrying = false;
  private readonly listeners = new Set<() => void>();

  constructor(o: DirectoryOptions) {
    this.o = o;
    this.now = o.now ?? Date.now;
    this.idle = o.idle ?? defaultIdle;
    this.timer = o.timer ?? ((fn, ms) => setTimeout(fn, ms));
    this.loadCache();
  }

  // --- The cache ---

  private loadCache(): void {
    let raw: unknown = null;
    try {
      const text = this.o.storage?.getItem(LOOK_CACHE_STORAGE);
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = null;
    }
    const names = raw && typeof raw === 'object' ? (raw as { v?: unknown; names?: unknown }) : null;
    if (!names || names.v !== 1 || !names.names || typeof names.names !== 'object') return;
    const now = this.now();
    for (const [k, v] of Object.entries(names.names as Record<string, unknown>)) {
      if (!LOOK_NAME_PATTERN.test(k) || !v || typeof v !== 'object') continue;
      const e = v as { at?: unknown; look?: unknown };
      if (typeof e.at !== 'number' || !Number.isFinite(e.at) || e.at > now) continue;
      const look = e.look === null ? null : rowOf(e.look);
      if (look === null && e.look !== null) continue;
      if (now - e.at >= (look ? HIT_MS : MISS_MS)) continue;
      this.cache.set(k.toLowerCase(), { at: e.at, look });
    }
    this.trim();
  }

  private saveCache(): void {
    if (!this.o.storage) return;
    const names: Record<string, Cached> = {};
    for (const [k, v] of this.cache) names[k] = v;
    try {
      this.o.storage.setItem(LOOK_CACHE_STORAGE, JSON.stringify({ v: 1, names }));
    } catch {
      // Full or blocked: the memory holds it for the session.
    }
  }

  /** At most CACHE_MAX names: the oldest answers go first. */
  private trim(): void {
    if (this.cache.size <= CACHE_MAX) return;
    const old = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
    for (const [k] of old.slice(0, this.cache.size - CACHE_MAX)) this.cache.delete(k);
  }

  private fresh(name: string): boolean {
    const c = this.cache.get(name);
    return !!c && this.now() - c.at < (c.look ? HIT_MS : MISS_MS);
  }

  /** The directory's row for `name` (lower case or not), or null: none known. */
  lookup(name: string | null | undefined): DirectoryLook | null {
    if (!name) return null;
    return this.cache.get(name.toLowerCase())?.look ?? null;
  }

  // --- Ask ---

  /** Asks for the names it has no fresh answer for (players only: the caller leaves NPCs out). */
  wantNames(names: Iterable<string>): void {
    const now = this.now();
    let added = false;
    for (const raw of names) {
      if (!LOOK_NAME_PATTERN.test(raw)) continue;
      const n = raw.toLowerCase();
      if (this.fresh(n) || this.asking.has(n) || this.pending.has(n)) continue;
      const f = this.failed.get(n);
      if (f !== undefined && now - f < RETRY_MS) continue;
      this.pending.add(n);
      added = true;
    }
    if (!added || this.gathering) return;
    this.gathering = true;
    this.timer(() => this.idle(() => void this.ask()), GATHER_MS);
  }

  private async ask(): Promise<void> {
    this.gathering = false;
    const names = [...this.pending];
    this.pending.clear();
    if (names.length === 0 || !(await this.allowed())) return;
    for (let i = 0; i < names.length; i += LOOK_FIND_MAX) {
      const part = names.slice(i, i + LOOK_FIND_MAX);
      for (const n of part) this.asking.add(n);
      const res = await this.call('POST', '/api/look/find', { names: part }, 'omit');
      for (const n of part) this.asking.delete(n);
      const looks = res?.status === 200 ? ((await res.json().catch(() => null)) as { looks?: unknown } | null)?.looks : undefined;
      const now = this.now();
      if (!looks || typeof looks !== 'object') {
        for (const n of part) this.failed.set(n, now);
        continue;
      }
      let changed = false;
      for (const n of part) {
        this.failed.delete(n);
        const got = Object.hasOwn(looks, n) ? rowOf((looks as Record<string, unknown>)[n]) : null;
        const before = this.cache.get(n)?.look ?? null;
        this.cache.set(n, { at: now, look: got });
        if (JSON.stringify(before) !== JSON.stringify(got)) changed = true;
      }
      this.trim();
      this.saveCache();
      if (changed) this.emit();
    }
  }

  // --- Report and unshare ---

  /** Whether `name`'s report was refused this session (another device or account shares it). */
  refused(name: string | null | undefined): boolean {
    return !!name && this.refusedNames.has(`${this.o.space()}|${name.toLowerCase()}`);
  }

  /** Reports your character (sent on idle time when it differs from what was sent). */
  report(r: SelfReport): void {
    if (!LOOK_NAME_PATTERN.test(r.name)) return;
    const space = this.o.space();
    const name = r.name.toLowerCase();
    const key = `${space}|${name}`;
    const next = { ...r, name };
    if (this.refusedNames.has(key) || this.sent.get(key) === JSON.stringify(next)) return;
    this.want = { space, r: next };
    this.unshareWanted = null;
    this.kick();
  }

  /** The switch turned off: the owner's rows go (and nothing is reported until `report` again). */
  unshare(): void {
    const space = this.o.space();
    this.want = null;
    for (const k of [...this.sent.keys()]) if (k.startsWith(`${space}|`)) this.sent.delete(k);
    // Without a key no row of the device can exist.
    if (space === 'device' && !this.storedKey()) return;
    this.unshareWanted = space;
    this.kick();
  }

  /**
   * The take-over at login (spec §9): the device's rows go just before the
   * login, so the account's report after it is not refused. Awaited by the
   * login flow (never the game's), at most TIMEOUT_MS; never rejects.
   */
  async releaseDevice(): Promise<void> {
    for (const k of [...this.sent.keys()]) if (k.startsWith('device|')) this.sent.delete(k);
    for (const k of [...this.refusedNames]) if (k.startsWith('device|')) this.refusedNames.delete(k);
    const key = this.storedKey();
    if (!key || !(await this.allowed())) return;
    await this.call('DELETE', '/api/look', { key }, 'omit');
  }

  private kick(): void {
    if (this.busy) return;
    this.busy = true;
    this.idle(() => void this.flush());
  }

  private async flush(): Promise<void> {
    try {
      if (!(await this.allowed())) {
        this.want = null;
        this.unshareWanted = null;
        return;
      }
      while (this.unshareWanted || this.want) {
        if (this.unshareWanted) {
          const space = this.unshareWanted;
          const key = space === 'device' ? this.storedKey() : null;
          const res = space === 'account' ? await this.call('DELETE', '/api/u/look', undefined, 'same-origin') : key ? await this.call('DELETE', '/api/look', { key }, 'omit') : { status: 204 };
          if (this.unshareWanted !== space) continue;
          if (res && res.status === 204) this.unshareWanted = null;
          else return this.retryLater();
          continue;
        }
        const w = this.want!;
        const sig = JSON.stringify(w.r);
        const res =
          w.space === 'account' ? await this.call('PUT', '/api/u/look', w.r, 'same-origin') : await this.call('PUT', '/api/look', { key: this.key(), ...w.r }, 'omit');
        const key = `${w.space}|${w.r.name}`;
        if (res && res.status === 204) this.sent.set(key, sig);
        else if (res && res.status === 409) {
          this.refusedNames.add(key);
          this.emit();
        } else {
          if (this.want === w) return this.retryLater();
          continue;
        }
        if (this.want === w) this.want = null;
      }
    } finally {
      this.busy = false;
    }
  }

  /** One retry after RETRY_MS for what is still wanted; a newer change sends at once anyway. */
  private retryLater(): void {
    if (this.retrying) return;
    this.retrying = true;
    this.timer(() => {
      this.retrying = false;
      if (this.want || this.unshareWanted) this.kick();
    }, RETRY_MS);
  }

  // --- The network ---

  private async allowed(): Promise<boolean> {
    try {
      return (await this.o.enabled()) === true;
    } catch {
      return false;
    }
  }

  private storedKey(): string | null {
    try {
      const k = this.o.storage?.getItem(LOOK_KEY_STORAGE) ?? null;
      return k && LOOK_KEY_PATTERN.test(k) ? k : null;
    } catch {
      return null;
    }
  }

  /** The look key, made when first needed. */
  private key(): string {
    const have = this.storedKey();
    if (have) return have;
    const k = (this.o.uuid ?? (() => crypto.randomUUID()))();
    try {
      this.o.storage?.setItem(LOOK_KEY_STORAGE, k);
    } catch {
      // Not kept: a new key next session (the old rows expire).
    }
    return k;
  }

  private async call(method: string, url: string, body: unknown, credentials: RequestCredentials): Promise<{ status: number; json(): Promise<unknown> } | null> {
    const f = this.o.fetch ?? (globalThis.fetch?.bind(globalThis) as FetchFn | undefined);
    if (!f) return null;
    try {
      const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
      const headers: Record<string, string> = { Accept: 'application/json', 'X-WC': '1' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      return await f(url, { method, credentials, cache: 'no-store', headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
    } catch {
      return null;
    }
  }

  // --- Listeners ---

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  /** Told when an answer changed a name's row, or a report was refused. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
