// Stage 60 (spec §7.3): the account crypto in a real browser, for
// cloud-crypto.spec.ts (desktop) and phone-cloud-crypto.spec.ts.
//
// The app does not load src/cloud/crypto yet, so the page imports it from
// the dev server's module URL; nothing in the app is changed for the test.
// The expected values are tests/fixtures/cloud-crypto-vectors.json, made
// with node:crypto: the browser's WebCrypto must give the same bytes.
import { type Page, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const V = JSON.parse(readFileSync(new URL('../fixtures/cloud-crypto-vectors.json', import.meta.url), 'utf8')) as {
  registration: {
    account: string;
    password: string;
    random: string[];
    recoveryCode: string;
    request: { salt: string; kdf: { name: string; rounds: number }; authKey: string; recoveryAuth: string; wrapPw: string; wrapRc: string };
  };
  ids: { kind: string; localKey: string; id: string }[];
  bodies: { kind: string; id: string; plaintext: string; body: string }[];
};

export interface KdfRun {
  /** Password → keys through the worker, the worker's start included (ms). */
  coldMs: number;
  /** The same with the worker already running (ms). */
  warmMs: number;
  /** The longest the page's 5 ms timer went without firing during the first derivation (ms). */
  maxGapMs: number;
  ticks: number;
}

/**
 * Runs a registration-shaped derivation at 600 000 rounds through the real
 * KDF worker and checks it against the vectors: `authKey`, the `kek` that
 * came across from the worker (it opens the vector's wrap), a whole
 * register request, a body through real streams, and cancel.
 */
export async function kdfThroughWorker(page: Page): Promise<KdfRun> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForLoadState('load');
  const R = V.registration;
  expect(R.request.kdf.rounds).toBe(600000);

  const got = await page.evaluate(
    async ({ R, id, body }) => {
      const path = '/src/cloud/crypto/index.ts';
      const m = await import(/* @vite-ignore */ path);
      const unhex = (s: string): Uint8Array => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
      const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      const salt = m.fromBase64Url(R.request.salt);

      // The page's own timer while the worker works: it must keep firing.
      let ticks = 0;
      let maxGap = 0;
      let last = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        maxGap = Math.max(maxGap, now - last);
        last = now;
        ticks++;
      }, 5);
      const aliveBefore = m.kdfWorkerAlive();
      const t0 = performance.now();
      const { authKey, kek } = await m.derivePasswordKeys(R.password, salt, R.request.kdf);
      const coldMs = performance.now() - t0;
      clearInterval(timer);
      const aliveAfter = m.kdfWorkerAlive();

      // The kek came from the worker by structured clone: a real, non-extractable key that opens the vector's wrap.
      let exported = true;
      try {
        await crypto.subtle.exportKey('raw', kek);
      } catch {
        exported = false;
      }
      const keys = await m.unlockWithPassword(R.account, kek, R.request.wrapPw);
      const opaque = await m.opaqueId(keys.idKey, id.kind, id.localKey);

      // Once more with the worker running. Another password: Firefox's NSS remembers its last PBKDF2
      // answer, and the same input again would time the cache.
      const t1 = performance.now();
      await m.derivePasswordKeys(R.password + '!', salt, R.request.kdf);
      const warmMs = performance.now() - t1;

      // A whole registration with the vector's random values.
      let at = 0;
      const reg = await m.prepareRegistration(R.account, R.password, { random: () => unhex(R.random[at++]!) });

      // A segmented body through the browser's own streams.
      const sealed = unhex(body.body);
      const source = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < sealed.length; i += 9) controller.enqueue(sealed.slice(i, i + 9));
          controller.close();
        },
      });
      const reader = m.decryptBodyStream(reg.keys.dataKey, body.kind, body.id, source).getReader();
      let plain = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        plain += hex(value);
      }
      let cut = '';
      try {
        await m.openBody(reg.keys.dataKey, body.kind, body.id, sealed.slice(0, sealed.length - 44));
      } catch (e) {
        cut = (e as { code?: string }).code ?? String(e);
      }

      // Cancel: the most rounds the client accepts would take many seconds; the worker is terminated instead.
      const abort = new AbortController();
      const slow = m.derivePasswordKeys('x', salt, { name: 'pbkdf2-sha256', rounds: m.MAX_ROUNDS }, { signal: abort.signal });
      setTimeout(() => abort.abort(), 50);
      const t2 = performance.now();
      let cancelled = '';
      try {
        await slow;
      } catch (e) {
        cancelled = (e as { code?: string }).code ?? String(e);
      }
      const cancelMs = performance.now() - t2;
      const aliveAfterCancel = m.kdfWorkerAlive();

      // A refused parameter set comes back as its error.
      let weak = '';
      try {
        await m.derivePasswordKeys('x', salt, { name: 'pbkdf2-sha256', rounds: 1000 });
      } catch (e) {
        weak = (e as { code?: string }).code ?? String(e);
      }

      return {
        authKey: m.toBase64Url(authKey),
        kekIsKey: kek instanceof CryptoKey,
        kekType: kek.type,
        kekAlgorithm: (kek.algorithm as { name: string; length?: number }).name + '-' + String((kek.algorithm as { length?: number }).length),
        kekExtractable: kek.extractable,
        exported,
        aliveBefore,
        aliveAfter,
        opaque,
        request: reg.request,
        recoveryCode: reg.recoveryCode,
        plain,
        cut,
        cancelled,
        cancelMs,
        aliveAfterCancel,
        weak,
        coldMs,
        warmMs,
        maxGap,
        ticks,
      };
    },
    { R, id: V.ids[2]!, body: V.bodies[4]! },
  );

  expect(got.authKey).toBe(R.request.authKey);
  expect(got.aliveBefore).toBe(false);
  expect(got.aliveAfter).toBe(true); // it was the worker that did it
  expect(got.kekIsKey).toBe(true);
  expect(got.kekType).toBe('secret');
  expect(got.kekAlgorithm).toBe('AES-GCM-256');
  expect(got.kekExtractable).toBe(false);
  expect(got.exported).toBe(false);
  expect(got.opaque).toBe(V.ids[2]!.id);
  expect(got.request).toEqual(R.request);
  expect(got.recoveryCode).toBe(R.recoveryCode);
  expect(got.plain).toBe(V.bodies[4]!.plaintext);
  expect(got.cut).toBe('auth');
  expect(got.cancelled).toBe('cancelled');
  expect(got.cancelMs).toBeLessThan(1000);
  expect(got.aliveAfterCancel).toBe(false);
  expect(got.weak).toBe('bad_kdf');
  // The page stayed responsive while the worker worked.
  expect(got.ticks).toBeGreaterThanOrEqual(3);
  expect(got.maxGap).toBeLessThan(400);
  expect(errors).toEqual([]);
  return { coldMs: got.coldMs, warmMs: got.warmMs, maxGapMs: got.maxGap, ticks: got.ticks };
}

/** The run's times as a line in the test output and an annotation in the report. */
export function timingLine(project: string, run: KdfRun): string {
  return (
    `KDF at 600000 rounds in the worker [${project}]: ${Math.round(run.coldMs)} ms with the worker's start, ` +
    `${Math.round(run.warmMs)} ms with it running; page timer: ${run.ticks} ticks, longest gap ${Math.round(run.maxGapMs)} ms`
  );
}
