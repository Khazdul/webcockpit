// Stage 59 (spec §7.6, ADR 0147): the usage heartbeat. At start when
// visible, every BEAT_MINUTES while visible, paused while hidden (a due
// beat at once when shown again), on a settled change of state; the body
// is exactly the five fields of `Beat`; the device id is kept; another
// tab's recent beat stands in; nothing ever throws.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Beat, BeatState } from '../../shared/cloud/api';
import {
  BEAT_MS,
  BEAT_SETTLE_MS,
  type BeatDocument,
  type BeatOptions,
  DEVICE_KEY,
  SHARED_KEY,
  deviceId,
  randomUuid,
  resetDeviceForTest,
  startBeat,
} from '../../src/cloud/beat';

class MemStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

class Doc implements BeatDocument {
  visibilityState: DocumentVisibilityState = 'visible';
  private fns = new Set<() => void>();
  addEventListener(_t: 'visibilitychange', fn: () => void): void {
    this.fns.add(fn);
  }
  removeEventListener(_t: 'visibilitychange', fn: () => void): void {
    this.fns.delete(fn);
  }
  set(v: DocumentVisibilityState): void {
    this.visibilityState = v;
    for (const fn of this.fns) fn();
  }
  get listeners(): number {
    return this.fns.size;
  }
}

interface Sent {
  url: string;
  init: RequestInit;
  body: Beat;
}

let calls: Sent[];
let storage: MemStorage;
let doc: Doc;
let state: BeatState;
let n = 0;
const uuid = (): string => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const fetchStub = (url: string, init: RequestInit): Promise<unknown> => {
  calls.push({ url, init, body: JSON.parse(init.body as string) as Beat });
  return Promise.resolve({ ok: true });
};

function start(o: Partial<BeatOptions> = {}) {
  return startBeat({
    state: () => state,
    version: '0.9.3',
    type: 'desktop',
    browser: 'firefox',
    fetch: fetchStub,
    storage,
    doc,
    now: () => Date.now(),
    uuid,
    ...o,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  calls = [];
  storage = new MemStorage();
  doc = new Doc();
  state = 'menu';
  n = 0;
  resetDeviceForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startBeat', () => {
  it('sends at start: POST, no credentials, keepalive, JSON, exactly the five fields', () => {
    start();
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe('/api/beat');
    expect(c.init.method).toBe('POST');
    expect(c.init.credentials).toBe('omit');
    expect(c.init.keepalive).toBe(true);
    expect(c.init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(Object.keys(c.body).sort()).toEqual(['browser', 'device', 'state', 'type', 'version']);
    expect(c.body).toEqual({ device: storage.getItem(DEVICE_KEY), version: '0.9.3', type: 'desktop', browser: 'firefox', state: 'menu' });
    expect(c.body.device).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('beats every period while visible', () => {
    start();
    vi.advanceTimersByTime(BEAT_MS - 1);
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(calls).toHaveLength(2);
    vi.advanceTimersByTime(BEAT_MS * 3);
    expect(calls).toHaveLength(5);
    // The same device every time.
    expect(new Set(calls.map((c) => c.body.device)).size).toBe(1);
  });

  it('pauses while hidden; a due beat goes when shown again, one not yet due waits for its time', () => {
    start();
    doc.set('hidden');
    vi.advanceTimersByTime(BEAT_MS * 3);
    expect(calls).toHaveLength(1);
    doc.set('visible');
    expect(calls).toHaveLength(2);
    // Hidden and shown again before the period is over: no extra beat.
    vi.advanceTimersByTime(60_000);
    doc.set('hidden');
    doc.set('visible');
    expect(calls).toHaveLength(2);
    vi.advanceTimersByTime(BEAT_MS - 60_000);
    expect(calls).toHaveLength(3);
  });

  it('a page loaded hidden sends nothing until it is shown', () => {
    doc.visibilityState = 'hidden';
    start();
    vi.advanceTimersByTime(BEAT_MS * 2);
    expect(calls).toHaveLength(0);
    doc.set('visible');
    expect(calls).toHaveLength(1);
  });

  it('sends a settled change of state; a passing one or no change sends nothing', () => {
    const b = start();
    state = 'playing';
    b.stateChanged();
    vi.advanceTimersByTime(BEAT_SETTLE_MS - 1);
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(calls.map((c) => c.body.state)).toEqual(['menu', 'playing']);
    // The period starts again from the state's beat.
    vi.advanceTimersByTime(BEAT_MS - 1);
    expect(calls).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(calls).toHaveLength(3);
    // Playing → menu → playing within the settle: nothing.
    state = 'menu';
    b.stateChanged();
    vi.advanceTimersByTime(500);
    state = 'playing';
    b.stateChanged();
    vi.advanceTimersByTime(BEAT_SETTLE_MS);
    expect(calls).toHaveLength(3);
    // A change without a change.
    b.stateChanged();
    vi.advanceTimersByTime(BEAT_SETTLE_MS);
    expect(calls).toHaveLength(3);
  });

  it('a change of state while hidden goes when the page shows again', () => {
    const b = start();
    doc.set('hidden');
    state = 'replay';
    b.stateChanged();
    vi.advanceTimersByTime(BEAT_SETTLE_MS * 2);
    expect(calls).toHaveLength(1);
    doc.set('visible');
    expect(calls.map((c) => c.body.state)).toEqual(['menu', 'replay']);
  });

  it('stop ends the timers and the listener', () => {
    const b = start();
    b.stop();
    vi.advanceTimersByTime(BEAT_MS * 3);
    b.stateChanged();
    vi.advanceTimersByTime(BEAT_SETTLE_MS);
    expect(calls).toHaveLength(1);
    expect(doc.listeners).toBe(0);
  });

  it('never throws: a failing fetch, a throwing fetch, throwing storage, a throwing state', async () => {
    const reject = vi.fn(() => Promise.reject(new Error('offline')));
    expect(() => start({ fetch: reject })).not.toThrow();
    expect(reject).toHaveBeenCalledTimes(1);
    const boom = vi.fn(() => {
      throw new Error('boom');
    });
    expect(() => start({ fetch: boom })).not.toThrow();
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => start({ storage: bad })).not.toThrow();
    // Storage blocked: the page's own id, the same for every beat of the page.
    const last = calls.at(-1)!;
    expect(last.body.device).toMatch(/^[0-9a-f-]{36}$/);
    const h = start({
      state: () => {
        throw new Error('no view');
      },
    });
    expect(() => h.stateChanged()).not.toThrow();
    expect(() => vi.advanceTimersByTime(BEAT_MS * 2)).not.toThrow();
    await Promise.resolve();
  });
});

describe('several tabs', () => {
  it('a tab skips its beat while another tab has sent one of an equal or higher state', () => {
    start({ state: () => 'playing' });
    expect(calls).toHaveLength(1);
    // A second tab on the start page: the game tab's beat stands for it.
    start({ state: () => 'menu' });
    expect(calls).toHaveLength(1);
    // Over three periods the game tab beats; the menu tab never overwrites it.
    vi.advanceTimersByTime(BEAT_MS * 3 + 60_000);
    expect(calls.map((c) => c.body.state)).toEqual(['playing', 'playing', 'playing', 'playing']);
    // Two tabs in the game: about one beat per period between them.
    start({ state: () => 'playing' });
    const before = calls.length;
    vi.advanceTimersByTime(BEAT_MS * 4);
    expect(calls.length - before).toBeLessThanOrEqual(5);
  });

  it('a tab of a higher state is never held back by a lower one', () => {
    start({ state: () => 'menu' });
    start({ state: () => 'playing' });
    expect(calls.map((c) => c.body.state)).toEqual(['menu', 'playing']);
  });

  it("a tab's own earlier beat does not stand in for its change of state", () => {
    state = 'playing';
    const a = start();
    state = 'menu';
    a.stateChanged();
    vi.advanceTimersByTime(BEAT_SETTLE_MS);
    expect(calls.map((c) => c.body.state)).toEqual(['playing', 'menu']);
  });

  it('a stale note of another tab stands in for nothing', () => {
    storage.setItem(SHARED_KEY, JSON.stringify({ tab: 'other', at: Date.now() - BEAT_MS, state: 'playing' }));
    start();
    expect(calls).toHaveLength(1);
    storage.setItem(SHARED_KEY, '{not json');
    start();
    expect(calls).toHaveLength(2);
  });
});

describe('deviceId', () => {
  it('makes one id, keeps it and reads it back', () => {
    const id = deviceId(storage, uuid);
    expect(storage.getItem(DEVICE_KEY)).toBe(id);
    expect(deviceId(storage, uuid)).toBe(id);
  });

  it('replaces a kept value that is not a UUID', () => {
    storage.setItem(DEVICE_KEY, 'hello');
    const id = deviceId(storage, uuid);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(storage.getItem(DEVICE_KEY)).toBe(id);
  });

  it('works without storage', () => {
    expect(deviceId(null, uuid)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('randomUuid makes v4 UUIDs', () => {
    const a = randomUuid();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomUuid()).not.toBe(a);
  });
});
