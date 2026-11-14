// Stage 60 (spec §7.3): the KDF worker's client (src/cloud/crypto/
// kdf-client.ts) against a stand-in Worker: started on demand, shared,
// ended when idle, cancelled by terminating, failures reported. The real
// worker in real browsers: tests/e2e/cloud-crypto.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudCryptoError, DEFAULT_KDF, derivePasswordKeys, kdfWorkerAlive, stopKdfWorker } from '../../src/cloud/crypto';
import { KDF_IDLE_MS, type KdfRequest, type KdfResponse } from '../../src/cloud/crypto/kdf-client';

type Listener = (e: { data?: KdfResponse; message?: string }) => void;

class FakeWorker {
  static made: FakeWorker[] = [];
  static failOnStart = false;
  requests: KdfRequest[] = [];
  terminated = false;
  private listeners = new Map<string, Listener[]>();

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    if (FakeWorker.failOnStart) throw new Error('no workers here');
    FakeWorker.made.push(this);
  }

  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  postMessage(req: KdfRequest): void {
    this.requests.push(req);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, e: { data?: KdfResponse; message?: string }): void {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }

  async answer(index: number): Promise<void> {
    const kek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    this.emit('message', { data: { id: this.requests[index]!.id, ok: true, authKey: new Uint8Array(32).fill(index + 1), kek } });
  }
}

const salt = new Uint8Array(16);
const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof CloudCryptoError) return e.code;
    throw e;
  }
  return 'no error';
}

beforeEach(() => {
  FakeWorker.made = [];
  FakeWorker.failOnStart = false;
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  stopKdfWorker();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the KDF worker client', () => {
  it('starts a module worker on the first request, shares it, and ends it when idle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    expect(kdfWorkerAlive()).toBe(false);
    const a = derivePasswordKeys('one', salt, DEFAULT_KDF);
    const b = derivePasswordKeys('two', salt, DEFAULT_KDF);
    await tick();
    expect(FakeWorker.made).toHaveLength(1);
    const w = FakeWorker.made[0]!;
    expect(w.options).toMatchObject({ type: 'module' });
    expect(String(w.url)).toMatch(/kdf\.worker\.ts$/);
    expect(w.requests.map((r) => r.password)).toEqual(['one', 'two']);
    expect(w.requests[0]).toMatchObject({ kdf: DEFAULT_KDF });
    expect(w.requests[0]!.salt).toEqual(salt);

    // Answers are matched by id, in any order.
    await w.answer(1);
    expect((await b).authKey[0]).toBe(2);
    vi.advanceTimersByTime(KDF_IDLE_MS * 2);
    expect(w.terminated).toBe(false); // one request still waits
    await w.answer(0);
    const keys = await a;
    expect(keys.authKey[0]).toBe(1);
    expect(keys.kek.extractable).toBe(false);

    vi.advanceTimersByTime(KDF_IDLE_MS - 1);
    expect(w.terminated).toBe(false);
    // A new request in the idle time keeps the same worker.
    const c = derivePasswordKeys('three', salt, DEFAULT_KDF);
    await tick();
    vi.advanceTimersByTime(KDF_IDLE_MS * 2);
    expect(w.terminated).toBe(false);
    await w.answer(2);
    await c;
    expect(FakeWorker.made).toHaveLength(1);
    vi.advanceTimersByTime(KDF_IDLE_MS);
    expect(w.terminated).toBe(true);
    expect(kdfWorkerAlive()).toBe(false);

    // And the next request starts a new one.
    const d = derivePasswordKeys('four', salt, DEFAULT_KDF);
    await tick();
    expect(FakeWorker.made).toHaveLength(2);
    await FakeWorker.made[1]!.answer(0);
    await d;
  });

  it('cancel: the request rejects and the worker is terminated, unless another request waits on it', async () => {
    const one = new AbortController();
    const a = derivePasswordKeys('one', salt, DEFAULT_KDF, { signal: one.signal });
    await tick();
    const w = FakeWorker.made[0]!;
    one.abort();
    expect(await code(a)).toBe('cancelled');
    expect(w.terminated).toBe(true);
    expect(kdfWorkerAlive()).toBe(false);

    const two = new AbortController();
    const b = derivePasswordKeys('two', salt, DEFAULT_KDF, { signal: two.signal });
    const c = derivePasswordKeys('three', salt, DEFAULT_KDF);
    await tick();
    const w2 = FakeWorker.made[1]!;
    two.abort();
    expect(await code(b)).toBe('cancelled');
    expect(w2.terminated).toBe(false);
    await w2.answer(0); // the cancelled request's answer is dropped
    await w2.answer(1);
    expect((await c).authKey[0]).toBe(2);
  });

  it('reports the worker\'s errors: its own answer, a crash, a worker that cannot start', async () => {
    const a = derivePasswordKeys('one', salt, DEFAULT_KDF);
    await tick();
    const w = FakeWorker.made[0]!;
    w.emit('message', { data: { id: w.requests[0]!.id, ok: false, code: 'bad_kdf', message: 'KDF rounds out of range' } });
    expect(await code(a)).toBe('bad_kdf');

    const b = derivePasswordKeys('two', salt, DEFAULT_KDF);
    const c = derivePasswordKeys('three', salt, DEFAULT_KDF);
    await tick();
    w.emit('error', { message: 'out of memory' });
    await expect(b).rejects.toMatchObject({ code: 'worker_failed', message: 'out of memory' });
    expect(await code(c)).toBe('worker_failed');
    expect(w.terminated).toBe(true);
    expect(kdfWorkerAlive()).toBe(false);

    FakeWorker.failOnStart = true;
    expect(await code(derivePasswordKeys('four', salt, DEFAULT_KDF))).toBe('worker_failed');
    // The caller's way out: the same derivation on its own thread.
    const keys = await derivePasswordKeys('four', salt, DEFAULT_KDF, { inline: true });
    expect(keys.authKey).toHaveLength(32);
    expect(FakeWorker.made).toHaveLength(1);
  });

  it('stopKdfWorker ends it and what waited is cancelled', async () => {
    const a = derivePasswordKeys('one', salt, DEFAULT_KDF);
    await tick();
    stopKdfWorker();
    expect(await code(a)).toBe('cancelled');
    expect(FakeWorker.made[0]!.terminated).toBe(true);
  });
});
