// Link probe: the `Link:` readout as an HTTPS round trip to mume.org
// (ADR 0030).
//
// MUME answers GMCP `Core.Ping` only on its ~250 ms game pulse, so a
// Core.Ping round trip is the network RTT plus a pulse wait. The probe
// times a tiny HTTPS request to the web server on the game's host
// instead, which on a warm keep-alive connection matches ICMP
// `ping mume.org` (what Cockpit shows) within a few ms.
//
// - Each tick (every `intervalMs`, 10 s; the first right after `start()`)
//   sends a warm-up request and then a timed one. The warm-up (re)opens
//   the keep-alive connection (Apache closes an idle one after ~5 s), so
//   the timed request pays one round trip and no TCP/TLS handshake. Only
//   the timed request is measured, from the `fetch` call to its promise
//   resolving. The first tick after `start()` sends two warm-ups: a fresh
//   Firefox profile pays extra on its second request to a new host.
// - The readout is the lower median of the last `samples` (3) timed
//   samples, so a single slow sample does not move it.
// - Every request has its own timeout (`timeoutMs`, 5 s, via
//   AbortController). A failed tick (network error, timeout, blocked,
//   by an extension or a firewall) clears the samples and reports null:
//   the caller then falls back to the Core.Ping readout. Under COEP (the
//   dev server) the probe does not run at all (`defaultLinkFetch`).
// - One tick at a time: the next tick is armed when the current one ends.
// - `stop()` cancels the timer, aborts the requests in flight and drops
//   any result that arrives later.

import type { Timers } from './keepalive';
import { realTimers } from './keepalive';

/**
 * The probe target. `favicon.ico` is a static file that has been there
 * for years; `HEAD` returns only headers (no 15 KB body); the query
 * string (`?lp=…`, unique per request) and `cache: 'no-store'` make sure
 * every request reaches the server instead of a cache.
 */
export const LINK_PROBE_URL = 'https://mume.org/favicon.ico';

/** The request options: opaque (`no-cors`), uncached, no cookies, no referrer. */
export const LINK_PROBE_INIT: Readonly<RequestInit> = Object.freeze({
  method: 'HEAD',
  mode: 'no-cors',
  cache: 'no-store',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
});

/** The part of `fetch` the probe uses. */
export type FetchLike = (url: string, init: RequestInit) => Promise<unknown>;

/**
 * The browser's `fetch`, or null where there is none or where the probe
 * cannot work: a cross-origin isolated page (COEP `require-corp`, the dev
 * server) blocks the opaque response, because mume.org sends no
 * `Cross-Origin-Resource-Policy`. There the readout stays on Core.Ping
 * and no requests go out (this also keeps the e2e suite off the network).
 */
export function defaultLinkFetch(): FetchLike | null {
  const g = globalThis as { fetch?: typeof fetch; crossOriginIsolated?: boolean };
  const f = g.fetch;
  if (typeof f !== 'function' || g.crossOriginIsolated === true) return null;
  return (url, init) => f.call(globalThis, url, init);
}

export interface LinkProbeOptions {
  fetch: FetchLike;
  /** The readout in ms after every tick, or null when the tick failed. */
  onReadout: (ms: number | null) => void;
  timers?: Timers;
  /** Tick interval in ms (default 10 000). */
  intervalMs?: number;
  /** Per-request timeout in ms (default 5 000). */
  timeoutMs?: number;
  /** The readout is the lower median of this many latest samples (default 3). */
  samples?: number;
  /** Probe URL (default `LINK_PROBE_URL`). */
  url?: string;
}

export class LinkProbe {
  private readonly o: LinkProbeOptions;
  private readonly t: Timers;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly keep: number;
  private readonly url: string;
  private readonly tag = Math.floor(Math.random() * 36 ** 4).toString(36);

  private running = false;
  /** Bumped by start/stop; a tick from an older run drops its result. */
  private run = 0;
  private tickTimer: unknown = null;
  private firstTick = true;
  private seq = 0;
  private recent: number[] = [];
  private readonly inFlight = new Set<AbortController>();
  private last: number | null = null;

  constructor(opts: LinkProbeOptions) {
    this.o = opts;
    this.t = opts.timers ?? realTimers;
    this.intervalMs = opts.intervalMs ?? 10_000;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.keep = Math.max(1, opts.samples ?? 3);
    this.url = opts.url ?? LINK_PROBE_URL;
  }

  get active(): boolean {
    return this.running;
  }

  /** The latest readout in ms, or null (none yet, or the last tick failed). */
  get readout(): number | null {
    return this.last;
  }

  /** Starts probing; the first tick runs right away. Resets the samples. */
  start(): void {
    this.stop();
    this.running = true;
    this.firstTick = true;
    this.recent = [];
    this.last = null;
    this.arm(0);
  }

  /** Stops probing and aborts the requests in flight. */
  stop(): void {
    this.running = false;
    this.run++;
    if (this.tickTimer !== null) this.t.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    for (const ac of this.inFlight) ac.abort();
    this.inFlight.clear();
  }

  private arm(ms: number): void {
    this.tickTimer = this.t.setTimeout(this.onTick, ms);
  }

  private readonly onTick = (): void => {
    this.tickTimer = null;
    if (!this.running) return;
    const run = this.run;
    const warmups = this.firstTick ? 2 : 1;
    this.firstTick = false;
    void this.tick(warmups).then((ms) => {
      if (run !== this.run) return; // stopped or restarted meanwhile
      if (ms === null) {
        this.recent = [];
      } else {
        this.recent.push(ms);
        if (this.recent.length > this.keep) this.recent.shift();
      }
      this.last = ms === null ? null : lowerMedian(this.recent);
      this.o.onReadout(this.last);
      this.arm(this.intervalMs);
    });
  };

  /** Warm-ups, then the timed request. Resolves to its ms, or null on any failure. */
  private async tick(warmups: number): Promise<number | null> {
    try {
      for (let i = 0; i < warmups; i++) await this.request();
      const t0 = this.t.now();
      await this.request();
      return Math.max(0, Math.round(this.t.now() - t0));
    } catch {
      return null;
    }
  }

  /** One probe request with its own timeout. Rejects on error or timeout. */
  private request(): Promise<void> {
    const ac = new AbortController();
    this.inFlight.add(ac);
    const url = `${this.url}?lp=${this.tag}${(++this.seq).toString(36)}`;
    return new Promise<void>((resolve, reject) => {
      const timer = this.t.setTimeout(() => {
        ac.abort();
        reject(new Error('link probe timeout'));
      }, this.timeoutMs);
      const done = (): void => {
        this.t.clearTimeout(timer);
        this.inFlight.delete(ac);
      };
      let p: Promise<unknown>;
      try {
        p = this.o.fetch(url, { ...LINK_PROBE_INIT, signal: ac.signal });
      } catch (e) {
        done();
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      p.then(
        () => {
          done();
          if (ac.signal.aborted) reject(new Error('link probe aborted'));
          else resolve();
        },
        (e: unknown) => {
          done();
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });
  }
}

/** The lower median: the middle value, or the lower of the two middle ones. */
export function lowerMedian(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}
