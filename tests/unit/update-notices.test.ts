// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notices, noticeIndicators } from '../../src/app/notices';
import { installNotices, isChunkLoadError } from '../../src/app/notices-wiring';
import { type FetchLike, UpdateChecker, isOtherRelease, parseRelease } from '../../src/app/update-check';
import { headerParts } from '../../src/chrome/frames/esc-main';
import { startNoticeTokens } from '../../src/chrome';
import { Bus } from '../../src/core/bus';
import { DB_NAME, DB_VERSION, isDbSuperseded, onDbSuperseded, openWebcockpitDb, resetDbSupersededForTests } from '../../src/core/db';
import type { UiMessage } from '../../src/core/types';
import { NoticeIndicator } from '../../src/ui/notice-indicator';

/** A fetch serving `body` (or failing), counting calls. */
function fakeFetch(body: () => unknown) {
  const calls: RequestInit[] = [];
  const fetch: FetchLike = async (_url, init) => {
    calls.push(init);
    const b = body();
    if (b instanceof Error) throw b;
    if (b === 404) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => b };
  };
  return { fetch, calls };
}

describe('release comparison', () => {
  it('parses release.json', () => {
    expect(parseRelease({ version: '0.1.1', commit: 'abc', assets: [] })).toEqual({ version: '0.1.1', commit: 'abc' });
    expect(parseRelease({ version: '0.1.1' })).toEqual({ version: '0.1.1', commit: '' });
    expect(parseRelease({ commit: 'abc' })).toBeNull();
    expect(parseRelease('x')).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('another version or another known commit is another release', () => {
    const cur = { version: '0.1.0', commit: 'aaa1111' };
    expect(isOtherRelease(cur, { version: '0.1.0', commit: 'aaa1111' })).toBe(false);
    expect(isOtherRelease(cur, { version: '0.1.1', commit: 'aaa1111' })).toBe(true);
    expect(isOtherRelease(cur, { version: '0.1.0', commit: 'bbb2222' })).toBe(true);
    expect(isOtherRelease(cur, { version: '0.1.0', commit: '' })).toBe(false);
    expect(isOtherRelease({ version: '0.1.0', commit: 'dev' }, { version: '0.1.0', commit: 'bbb2222' })).toBe(false);
  });
});

describe('UpdateChecker', () => {
  const current = { version: '0.1.0', commit: 'aaa1111' };

  it('fetches without the cache and reports a new release once', async () => {
    let t = 0;
    let served: unknown = { version: '0.1.0', commit: 'aaa1111' };
    const f = fakeFetch(() => served);
    const seen: string[] = [];
    const c = new UpdateChecker({ current, fetch: f.fetch, now: () => t, onNewVersion: (r) => seen.push(r.version) });
    expect(await c.check()).toBeNull();
    expect(f.calls[0]).toEqual({ cache: 'no-store' });
    served = { version: '0.1.1', commit: 'bbb2222' };
    t += 60_000;
    expect(await c.check()).toEqual({ version: '0.1.1', commit: 'bbb2222' });
    t += 60_000;
    await c.check();
    expect(seen).toEqual(['0.1.1']);
    expect(c.latest?.version).toBe('0.1.1');
    served = { version: '0.1.2', commit: 'ccc3333' };
    t += 60_000;
    await c.check();
    expect(seen).toEqual(['0.1.1', '0.1.2']);
  });

  it('throttles to one check a minute unless forced, and shares a check in flight', async () => {
    let t = 1000;
    const f = fakeFetch(() => ({ version: '0.1.0', commit: 'aaa1111' }));
    const c = new UpdateChecker({ current, fetch: f.fetch, now: () => t, onNewVersion: () => {} });
    await Promise.all([c.check(), c.check()]);
    expect(f.calls).toHaveLength(1);
    t += 59_999;
    await c.check();
    expect(f.calls).toHaveLength(1);
    await c.check(true);
    expect(f.calls).toHaveLength(2);
    t += 60_000;
    await c.check();
    expect(f.calls).toHaveLength(3);
  });

  it('is silent on failures', async () => {
    let t = 0;
    let body: unknown = new Error('offline');
    const f = fakeFetch(() => body);
    const onNewVersion = vi.fn();
    const c = new UpdateChecker({ current, fetch: f.fetch, now: () => (t += 60_000), onNewVersion });
    await expect(c.check()).resolves.toBeNull();
    body = 404;
    await expect(c.check()).resolves.toBeNull();
    body = 'not json';
    await expect(c.check()).resolves.toBeNull();
    expect(onNewVersion).not.toHaveBeenCalled();
  });
});

describe('Notices', () => {
  const lines = (bus: Bus) => {
    const sys: string[] = [];
    const ui: UiMessage[] = [];
    bus.on('sys.message', (m) => sys.push(m.text));
    bus.on('ui.message', (m) => ui.push(m));
    return { sys, ui };
  };

  it('says each notice once, replaying earlier ones to an App that attaches later', () => {
    const n = new Notices();
    const states: unknown[] = [];
    n.subscribe((s) => states.push(s));
    n.newVersion({ version: '0.1.3', commit: 'abc' });
    n.newVersion({ version: '0.1.3', commit: 'abc' });
    const bus = new Bus();
    const got = lines(bus);
    n.attach(bus);
    expect(got.sys).toEqual(['WebCockpit 0.1.3 is available – reload (F5) when you are somewhere safe.']);
    n.chunkFailed();
    n.chunkFailed();
    n.storageSuperseded();
    n.storageSuperseded();
    expect(got.sys).toHaveLength(3);
    expect(got.sys[1]).toMatch(/newer version of WebCockpit was published.*Reload \(F5\)/);
    expect(got.sys[2]).toBe(
      'Storage upgraded by a newer version in another tab – changes here are no longer saved. Reload (F5).',
    );
    expect(got.ui.map((m) => m.kind)).toEqual(['warn', 'error', 'error']);
    expect(states).toHaveLength(2);
    expect(n.get()).toEqual({ update: { version: '0.1.3', commit: 'abc' }, storageSuperseded: true });
  });

  it('indicators: update, then storage', () => {
    expect(noticeIndicators({ update: null, storageSuperseded: false }, '0.1.0')).toEqual([]);
    const ind = noticeIndicators({ update: { version: '0.1.3', commit: 'x' }, storageSuperseded: true }, '0.1.0');
    expect(ind.map((i) => i.text)).toEqual(['Update: 0.1.3', 'Storage: not saved']);
    expect(ind[0]!.title).toContain('Reload (F5) when convenient');
    expect(ind[0]!.title).toContain('this tab runs 0.1.0');
  });

  it('the input row indicator follows the notices', () => {
    const n = new Notices();
    const ind = new NoticeIndicator(document, n, '0.1.0');
    expect(ind.el.hidden).toBe(true);
    n.newVersion({ version: '0.1.3', commit: 'x' });
    expect(ind.el.hidden).toBe(false);
    expect(ind.el.textContent).toBe('Update: 0.1.3');
    expect((ind.el.firstChild as HTMLElement).title).toContain('Reload (F5)');
    n.storageSuperseded();
    expect(ind.el.querySelector('.wc-notice-storage')?.textContent).toBe('Storage: not saved');
    ind.dispose();
  });

  it('the ESC header and the start surface show them', () => {
    const st = { conn: 'playing', replay: false, character: '', linkMs: 40, linkSuspect: false, capture: '', xml: false } as const;
    const parts = headerParts('default', st, { update: { version: '0.1.3', commit: 'x' }, storageSuperseded: true }, '0.1.0');
    expect(parts.slice(2).map((p) => [p.text, p.cls])).toEqual([
      ['Update: 0.1.3', 'wc-c-yellow'],
      ['Storage: not saved', 'wc-c-err'],
    ]);
    expect(startNoticeTokens({ update: null, storageSuperseded: false })).toEqual([]);
    const t = startNoticeTokens({ update: { version: '0.1.3', commit: 'x' }, storageSuperseded: true });
    expect(t.map((x) => [x.text, x.cls, typeof x.onClick])).toEqual([
      ['Update 0.1.3 available: reload', 'wc-c-yellow', 'function'],
      ['Storage: not saved', 'wc-c-err', 'undefined'],
    ]);
  });
});

describe('notices wiring', () => {
  afterEach(() => resetDbSupersededForTests());

  it('recognises failed dynamic imports', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true);
    expect(isChunkLoadError(new Error('something else'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('checks on focus and visibility, and after a chunk failure (forced)', async () => {
    const n = new Notices();
    let t = 0;
    const f = fakeFetch(() => ({ version: '9.9.9', commit: 'fff' }));
    const off = installNotices(window as unknown as Window, n, { checkUpdates: true, fetch: f.fetch, now: () => t });
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(n.get().update?.version).toBe('9.9.9'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(f.calls).toHaveLength(1);
    const bus = new Bus();
    const sys: string[] = [];
    bus.on('sys.message', (m) => sys.push(m.text));
    n.attach(bus);
    const ev = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    await vi.waitFor(() => expect(f.calls).toHaveLength(2));
    expect(sys).toHaveLength(2);
    t += 60_000;
    off();
    window.dispatchEvent(new Event('focus'));
    expect(f.calls).toHaveLength(2);
  });

  it('never checks when the check is off', () => {
    const n = new Notices();
    const f = fakeFetch(() => ({ version: '9.9.9', commit: 'fff' }));
    const off = installNotices(window as unknown as Window, n, { checkUpdates: false, fetch: f.fetch });
    window.dispatchEvent(new Event('focus'));
    expect(f.calls).toHaveLength(0);
    off();
  });
});

describe('database superseded (db.ts)', () => {
  afterEach(() => resetDbSupersededForTests());

  it('a newer tab upgrading the open database is reported', async () => {
    const factory = new IDBFactory();
    const seen = vi.fn();
    onDbSuperseded(seen);
    await openWebcockpitDb(factory);
    await new Promise<void>((resolve, reject) => {
      const r = factory.open(DB_NAME, DB_VERSION + 1);
      r.onsuccess = () => {
        r.result.close();
        resolve();
      };
      r.onerror = () => reject(r.error);
    });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(isDbSuperseded()).toBe(true);
    // Reopening now fails with VersionError; still reported once.
    await expect(openWebcockpitDb(factory)).rejects.toMatchObject({ name: 'VersionError' });
    expect(seen).toHaveBeenCalledTimes(1);
    // A late listener hears at once.
    const late = vi.fn();
    onDbSuperseded(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('an open that fails with VersionError is reported', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve) => {
      const r = factory.open(DB_NAME, DB_VERSION + 3);
      r.onsuccess = () => (r.result.close(), resolve());
    });
    const seen = vi.fn();
    onDbSuperseded(seen);
    await expect(openWebcockpitDb(factory)).rejects.toBeTruthy();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('no IndexedDB, other open failures and a deletion are not reported', async () => {
    const seen = vi.fn();
    onDbSuperseded(seen);
    await expect(openWebcockpitDb(null as unknown as IDBFactory)).rejects.toThrow('IndexedDB unavailable');
    const factory = new IDBFactory();
    await openWebcockpitDb(factory);
    await new Promise<void>((resolve) => {
      const r = factory.deleteDatabase(DB_NAME);
      r.onsuccess = () => resolve();
    });
    expect(seen).not.toHaveBeenCalled();
    expect(isDbSuperseded()).toBe(false);
  });
});
