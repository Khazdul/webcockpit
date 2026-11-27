// The directory of shared looks, the client (stage 80 part E, spec §9,
// ADR 0173): report, unshare, the take-over, ask, the cache, the 409, the
// switch and the flag; the feed from the game; the resolver's use of a row.
import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../src/gmcp/state';
import { CACHE_MAX, GATHER_MS, HIT_MS, LOOK_CACHE_STORAGE, LOOK_KEY_STORAGE, LookDirectory, MISS_MS, RETRY_MS, rowOf } from '../../src/looks/directory';
import { attachDirectory, memberNames, selfReport } from '../../src/looks/directory-feed';
import { resolveMember } from '../../src/looks/resolve';
import { LooksStore } from '../../src/looks/store';
import { DEFAULT_SETTINGS } from '../../src/settings/types';
import type { Settings } from '../../src/settings/types';

const KEY = '0b7e4d1c-3f2a-4b9e-8c1d-5e6f7a8b9c0d';

interface Call {
  method: string;
  url: string;
  body: unknown;
  credentials: RequestCredentials | undefined;
  headers: Record<string, string>;
}

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

function rig(o: { enabled?: () => boolean | Promise<boolean>; space?: 'device' | 'account'; answer?: (c: Call) => { status: number; body?: unknown } | null; storage?: MemStorage; now?: () => number } = {}) {
  const calls: Call[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const storage = o.storage ?? new MemStorage();
  let t = 1_000_000;
  const dir = new LookDirectory({
    enabled: o.enabled ?? (() => true),
    space: () => o.space ?? 'device',
    storage,
    now: o.now ?? (() => t),
    idle: (fn) => fn(),
    timer: (fn, ms) => timers.push({ fn, ms }),
    uuid: () => KEY,
    fetch: async (url, init) => {
      const c: Call = { method: init.method ?? 'GET', url, body: init.body ? JSON.parse(init.body as string) : undefined, credentials: init.credentials, headers: init.headers as Record<string, string> };
      calls.push(c);
      const a = o.answer ? o.answer(c) : { status: c.url === '/api/look/find' ? 200 : 204, body: { looks: {} } };
      if (!a) throw new Error('offline');
      return { ok: a.status < 300, status: a.status, json: async () => a.body };
    },
  });
  /** Runs the timers due (the gather, a retry). */
  const tick = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const due = timers.splice(0);
    for (const x of due) x.fn();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return { dir, calls, timers, storage, tick, settle, advance: (ms: number) => (t += ms) };
}

const me = { name: 'Rasta', race: 'human' as const, subrace: 'dunadan' as const, sex: 'male' as const, token: null };

describe('report', () => {
  it('logged out: PUT /api/look with the look key, credentials omitted, X-WC; once per character and session', async () => {
    const r = rig();
    r.dir.report(me);
    await r.settle();
    expect(r.calls).toHaveLength(1);
    const c = r.calls[0]!;
    expect([c.method, c.url, c.credentials]).toEqual(['PUT', '/api/look', 'omit']);
    expect(c.headers['X-WC']).toBe('1');
    expect(c.body).toEqual({ key: KEY, name: 'rasta', race: 'human', subrace: 'dunadan', sex: 'male', token: null });
    expect(r.storage.getItem(LOOK_KEY_STORAGE)).toBe(KEY);
    r.dir.report(me);
    r.dir.report({ ...me, name: 'RASTA' });
    await r.settle();
    expect(r.calls).toHaveLength(1);
    // A change is sent again.
    r.dir.report({ ...me, token: 'elf-f-noldor' });
    await r.settle();
    expect(r.calls).toHaveLength(2);
    expect((r.calls[1]!.body as { token: string }).token).toBe('elf-f-noldor');
  });

  it('logged in: PUT /api/u/look with the session, no key', async () => {
    const r = rig({ space: 'account' });
    r.dir.report(me);
    await r.settle();
    expect(r.calls.map((c) => [c.method, c.url, c.credentials])).toEqual([['PUT', '/api/u/look', 'same-origin']]);
    expect(r.calls[0]!.body).not.toHaveProperty('key');
    expect(r.storage.getItem(LOOK_KEY_STORAGE)).toBeNull();
  });

  it('a 409 is remembered for the session: not sent again, and `refused` says so', async () => {
    const r = rig({ answer: () => ({ status: 409, body: { error: 'look_owned' } }) });
    let told = 0;
    r.dir.subscribe(() => told++);
    r.dir.report(me);
    await r.settle();
    expect(r.dir.refused('rasta')).toBe(true);
    expect(told).toBe(1);
    r.dir.report({ ...me, sex: 'female' });
    await r.settle();
    expect(r.calls).toHaveLength(1);
    expect(r.dir.refused('Glorfindel')).toBe(false);
  });

  it('a failure is silent and tried once again later, not in a loop', async () => {
    let fail = true;
    const r = rig({ answer: () => (fail ? null : { status: 204 }) });
    r.dir.report(me);
    await r.settle();
    expect(r.calls).toHaveLength(1);
    expect(r.timers.map((t) => t.ms)).toEqual([RETRY_MS]);
    await r.tick();
    expect(r.calls).toHaveLength(2);
    expect(r.timers).toHaveLength(1);
    fail = false;
    await r.tick();
    expect(r.calls).toHaveLength(3);
    expect(r.timers).toHaveLength(0);
    r.dir.report(me);
    await r.settle();
    expect(r.calls).toHaveLength(3);
  });

  it('refuses to send what is not a name', async () => {
    const r = rig();
    r.dir.report({ ...me, name: 'R2' });
    await r.settle();
    expect(r.calls).toEqual([]);
  });
});

describe('unshare and the take-over', () => {
  it('the switch off: DELETE /api/look with the key; on again reports anew', async () => {
    const r = rig();
    r.dir.report(me);
    await r.settle();
    r.dir.unshare();
    await r.settle();
    expect(r.calls[1]).toMatchObject({ method: 'DELETE', url: '/api/look', body: { key: KEY }, credentials: 'omit' });
    r.dir.report(me);
    await r.settle();
    expect(r.calls.map((c) => c.method)).toEqual(['PUT', 'DELETE', 'PUT']);
  });

  it('without a key nothing of the device can exist: no DELETE', async () => {
    const r = rig();
    r.dir.unshare();
    await r.settle();
    expect(r.calls).toEqual([]);
  });

  it('logged in: DELETE /api/u/look without a body', async () => {
    const r = rig({ space: 'account' });
    r.dir.unshare();
    await r.settle();
    expect(r.calls.map((c) => [c.method, c.url, c.body])).toEqual([['DELETE', '/api/u/look', undefined]]);
  });

  it('releaseDevice deletes the key’s rows (awaited), and nothing without a key or allowed', async () => {
    const storage = new MemStorage();
    const off = rig({ storage, enabled: () => false });
    storage.setItem(LOOK_KEY_STORAGE, KEY);
    await off.dir.releaseDevice();
    expect(off.calls).toEqual([]);
    const r = rig({ storage });
    await r.dir.releaseDevice();
    expect(r.calls.map((c) => [c.method, c.url, c.body, c.credentials])).toEqual([['DELETE', '/api/look', { key: KEY }, 'omit']]);
    const none = rig();
    await none.dir.releaseDevice();
    expect(none.calls).toEqual([]);
  });
});

describe('ask', () => {
  it('gathers the names for a moment, asks once, caches hits and misses, and answers lookup', async () => {
    const r = rig({ answer: (c) => (c.url === '/api/look/find' ? { status: 200, body: { looks: { glorfindel: { race: 'elf', subrace: 'noldo', sex: 'male', token: 'elf-m-mage' } } } } : { status: 204 }) });
    let told = 0;
    r.dir.subscribe(() => told++);
    r.dir.wantNames(['Glorfindel', 'Thorin']);
    r.dir.wantNames(['Glorfindel', 'Bilbo', 'x', 'Two words']);
    expect(r.calls).toEqual([]);
    expect(r.timers.map((t) => t.ms)).toEqual([GATHER_MS]);
    await r.tick();
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatchObject({ method: 'POST', url: '/api/look/find', credentials: 'omit', body: { names: ['glorfindel', 'thorin', 'bilbo'] } });
    expect(r.dir.lookup('Glorfindel')).toEqual({ race: 'elf', subrace: 'noldo', sex: 'male', token: 'elf-m-mage' });
    expect(r.dir.lookup('thorin')).toBeNull();
    expect(told).toBe(1);
    // Fresh answers (a hit and a miss) are not asked again.
    r.dir.wantNames(['Glorfindel', 'Thorin']);
    await r.tick();
    expect(r.calls).toHaveLength(1);
    // A miss is asked again after an hour, a hit after a day.
    r.advance(MISS_MS);
    r.dir.wantNames(['Glorfindel', 'Thorin']);
    await r.tick();
    expect(r.calls[1]!.body).toEqual({ names: ['thorin'] });
    r.advance(HIT_MS);
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    expect(r.calls[2]!.body).toEqual({ names: ['glorfindel'] });
  });

  it('at most 40 names a call', async () => {
    const r = rig();
    const names = Array.from({ length: 45 }, (_, i) => `name${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
    r.dir.wantNames(names);
    await r.tick();
    expect(r.calls.map((c) => (c.body as { names: string[] }).names.length)).toEqual([40, 5]);
  });

  it('the cache is kept in localStorage, read back, and at most 300 names; a stale one is dropped', async () => {
    const storage = new MemStorage();
    const r = rig({ storage, answer: () => ({ status: 200, body: { looks: { glorfindel: { race: 'elf', subrace: null, sex: null, token: null } } } }) });
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    const saved = JSON.parse(storage.getItem(LOOK_CACHE_STORAGE)!) as { v: number; names: Record<string, unknown> };
    expect(saved.v).toBe(1);
    expect(Object.keys(saved.names)).toEqual(['glorfindel']);
    const again = rig({ storage, now: () => 1_000_000 + 1000 });
    expect(again.dir.lookup('glorfindel')).toEqual({ race: 'elf', subrace: null, sex: null, token: null });
    const late = rig({ storage, now: () => 1_000_000 + HIT_MS });
    expect(late.dir.lookup('glorfindel')).toBeNull();
    // A cache that is not ours is ignored; a bad row is dropped.
    storage.setItem(LOOK_CACHE_STORAGE, JSON.stringify({ v: 1, names: { bad: { at: 1_000_000, look: { race: 'Elf', subrace: null, sex: null, token: null } } } }));
    expect(rig({ storage }).dir.lookup('bad')).toBeNull();
    const many: Record<string, unknown> = {};
    for (let i = 0; i < CACHE_MAX + 20; i++) many[`nm${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26) % 26)}${String.fromCharCode(97 + Math.floor(i / 676))}`] = { at: 1_000_000 - (CACHE_MAX + 20 - i), look: null };
    storage.setItem(LOOK_CACHE_STORAGE, JSON.stringify({ v: 1, names: many }));
    const big = rig({ storage });
    big.dir.wantNames(['Newname']);
    await big.tick();
    expect(Object.keys((JSON.parse(storage.getItem(LOOK_CACHE_STORAGE)!) as { names: object }).names).length).toBe(CACHE_MAX);
  });

  it('a failed ask is not asked again before the retry time', async () => {
    const r = rig({ answer: () => null });
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    expect(r.calls).toHaveLength(1);
    r.advance(RETRY_MS);
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    expect(r.calls).toHaveLength(2);
  });

  it('an answer’s row is checked: no free text gets in', () => {
    expect(rowOf({ race: 'elf', subrace: 'noldo', sex: 'female', token: 'elf-f-noldor' })).not.toBeNull();
    expect(rowOf({ race: 'Elf', subrace: null, sex: null, token: null })).toBeNull();
    expect(rowOf({ race: null, subrace: null, sex: 'x', token: null })).toBeNull();
    expect(rowOf({ race: null, subrace: null, sex: null, token: '<a href>' })).toBeNull();
  });
});

describe('the flag off, a replay, no API: no call at all', () => {
  it('nothing is sent while `enabled` is false', async () => {
    let asked = 0;
    const r = rig({ enabled: () => (asked++, false) });
    r.dir.report(me);
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    r.dir.unshare();
    await r.settle();
    expect(r.calls).toEqual([]);
    expect(asked).toBeGreaterThan(0);
  });

  it('an async flag that is off is the same', async () => {
    const r = rig({ enabled: async () => false });
    r.dir.report(me);
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    await r.settle();
    expect(r.calls).toEqual([]);
  });
});

describe('the feed from the game', () => {
  function game(): GameState {
    return new GameState({ storage: null });
  }
  const gmcp = (g: GameState, pkg: string, data: unknown): void => g.take({ pkg, key: pkg.toLowerCase(), data } as never);

  function settingsOf(s: Settings) {
    let cur = s;
    const subs = new Set<(n: Readonly<Settings>, p: Readonly<Settings>) => void>();
    return {
      get: () => cur,
      set(share: boolean) {
        const prev = cur;
        cur = { ...cur, character: { ...cur.character, shareLook: share } };
        for (const f of subs) f(cur, prev);
      },
      subscribe(f: (n: Readonly<Settings>, p: Readonly<Settings>) => void) {
        subs.add(f);
        return () => subs.delete(f);
      },
    };
  }

  function fakeDir() {
    const log: unknown[] = [];
    return {
      log,
      report: (r: unknown) => log.push(['report', r]),
      unshare: () => log.push(['unshare']),
      wantNames: (n: Iterable<string>) => log.push(['want', [...n]]),
      subscribe: () => () => {},
    };
  }

  let g: GameState;
  let looks: LooksStore;
  beforeEach(() => {
    g = game();
    looks = new LooksStore();
  });

  it('reports when the name and race are known, again on a sex or look change; a bear form sends nothing new', () => {
    const d = fakeDir();
    const s = settingsOf(DEFAULT_SETTINGS);
    attachDirectory({ game: g, looks, dir: d, settings: s });
    gmcp(g, 'Char.Name', { name: 'Dubb', fullname: 'Dubb the Bear' });
    expect(d.log).toEqual([]);
    gmcp(g, 'Char.StatusVars', { race: 'Man', subrace: 'Beorning' });
    expect(d.log).toEqual([['report', { name: 'Dubb', race: 'beorning', subrace: null, sex: null, token: null }]]);
    g.applySex('male');
    expect(d.log.at(-1)).toEqual(['report', { name: 'Dubb', race: 'beorning', subrace: null, sex: 'male', token: null }]);
    const n = d.log.length;
    gmcp(g, 'Char.StatusVars', { race: 'Bear', subrace: null });
    gmcp(g, 'Char.Vitals', { hp: 10, maxhp: 20 });
    // The feed may make the report again, but it is the same report.
    for (const e of d.log.slice(n)) expect(e).toEqual(d.log[n - 1]);
    looks.choose('Dubb', { src: 'lib', id: 'bear-m' }, true);
    expect(d.log.at(-1)).toEqual(['report', { name: 'Dubb', race: 'beorning', subrace: null, sex: 'male', token: 'bear-m' }]);
    // An own image sends no token.
    looks.choose('Dubb', { src: 'own', id: 'abc' }, true);
    expect((d.log.at(-1) as [string, { token: unknown }])[1].token).toBeNull();
  });

  it('the switch off: nothing reported, and the DELETE; on: reported again', () => {
    const d = fakeDir();
    const s = settingsOf(DEFAULT_SETTINGS);
    attachDirectory({ game: g, looks, dir: d, settings: s });
    s.set(false);
    gmcp(g, 'Char.Name', { name: 'Rasta', fullname: 'Rasta' });
    gmcp(g, 'Char.StatusVars', { race: 'Man', subrace: 'Dunadan' });
    expect(d.log).toEqual([['unshare']]);
    s.set(true);
    expect(d.log.at(-1)).toEqual(['report', { name: 'Rasta', race: 'human', subrace: 'dunadan', sex: null, token: null }]);
  });

  it('asks for the group’s players only: never an NPC, never yourself', () => {
    const d = fakeDir();
    attachDirectory({ game: g, looks, dir: d, settings: settingsOf(DEFAULT_SETTINGS) });
    gmcp(g, 'Char.Name', { name: 'Rasta', fullname: 'Rasta' });
    gmcp(g, 'Group.Set', [
      { id: 1, type: 'ally', name: 'Rasta' },
      { id: 2, type: 'ally', name: 'Glorfindel' },
      { id: 3, type: 'npc', name: 'a trained horse', label: 'horse' },
    ]);
    expect(d.log.filter((e) => (e as unknown[])[0] === 'want')).toEqual([['want', ['Glorfindel']]]);
    expect(memberNames(g)).toEqual(['Glorfindel']);
  });

  it('selfReport needs the name and the race', () => {
    expect(selfReport(g, looks)).toBeNull();
    gmcp(g, 'Char.Name', { name: 'Rasta', fullname: 'Rasta' });
    expect(selfReport(g, looks)).toBeNull();
    gmcp(g, 'Char.StatusVars', { race: 'Ent' });
    expect(selfReport(g, looks)).toBeNull();
  });

  it('a directory row gives a member its look; the store passes it on', async () => {
    const r = rig({ answer: () => ({ status: 200, body: { looks: { glorfindel: { race: 'elf', subrace: 'noldo', sex: 'female', token: null } } } }) });
    looks.directory = r.dir;
    r.dir.wantNames(['Glorfindel']);
    await r.tick();
    expect(resolveMember({ name: 'Glorfindel', npc: false, dir: looks.dirFor('Glorfindel') })).toMatchObject({ kind: 'drawn', portrait: 'noldo', sex: 'female', from: 'auto' });
    expect(resolveMember({ name: 'Nobody', npc: false, dir: looks.dirFor('Nobody') })).toMatchObject({ kind: 'drawn', portrait: 'neutral', from: 'unknown' });
  });
});
