// Soak for bench/browser-bench.ts (performance review §7, report #15;
// adapted from notes/research/perf-review/harness/D/soak.ts).
//
// All panes on (map on), the fake socket in a live-like session (GMCP
// login, so the panes are active and the recorder captures), the
// scrollback filled to its 20 000-row cap first. Then the owner's logs,
// with synthesized GMCP (bench/feeds.ts playLog), play at 30× log time and
// their recorded commands are typed (Enter keydown on the input).
//
// - Default (short): the first `WC_BENCH_SOAK_S` seconds (default 60) of
//   wall time of the bench fixture.
// - `--soak-long`: the owner's three biggest logs, each played to its end,
//   back to back as one connection.
//
// Checkpoints (playback paused, output drained; Chromium: a forced GC
// first): DOM elements, output rows, bus handlers, live timers and
// window/document listeners (`?benchCounters`), JS heap and listener
// count (Chromium CDP Performance.getMetrics; Firefox has no heap
// figure without about:memory), and a frame probe (60 small frames at
// 25–60 ms: frame callback → rendered). Pass: every counter flat from the
// first checkpoint (full scrollback) to the last (≤ 1.1 × start + a small
// slack), and the probe's median frame ≤ 1.2 × start + 1 ms.

import type { CDPSession, Page } from '@playwright/test';
import { combatFrame, playLog, synthBatch } from './feeds';
import { type Dist, type Target, closePage, dist, mapSetting, openBench, pause } from './lib';
import type { Ctx } from './owner';
import { fakeLogin, waitMap } from './owner';

export const SOAK_SPEED = 30;

export interface Checkpoint {
  label: string;
  rows: number;
  elements: number;
  bus: number;
  timeouts: number | null;
  intervals: number | null;
  listeners: number | null;
  /** Chromium: JS heap used after a forced GC (MB) and DOM listeners (CDP). */
  heapMb: number | null;
  jsListeners: number | null;
  frame: Dist;
}

async function checkpoint(page: Page, cdp: CDPSession | null, label: string): Promise<Checkpoint> {
  await page.evaluate(() => window.__wcBench!.drained());
  await pause(500);
  let heapMb: number | null = null;
  let jsListeners: number | null = null;
  if (cdp) {
    await cdp.send('HeapProfiler.collectGarbage');
    await pause(300);
    const m = (await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
    const get = (k: string) => m.metrics.find((x) => x.name === k)?.value ?? NaN;
    heapMb = get('JSHeapUsedSize') / 2 ** 20;
    jsListeners = get('JSEventListeners');
  }
  const counts = await page.evaluate(() => {
    const B = window.__wcBench!;
    const c = B.counters();
    return {
      rows: B.rows,
      elements: document.getElementsByTagName('*').length,
      bus: B.app!.bus.total(),
      timeouts: c?.timeouts ?? null,
      intervals: c?.intervals ?? null,
      listeners: c?.listeners ?? null,
    };
  });
  const frame = await page.evaluate(async (frames) => {
    const B = window.__wcBench!;
    const out: number[] = [];
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (const f of frames) {
      const r = await B.inject(f);
      out.push(r.toPaint - (r.toFlush - r.script));
      await new Promise((res) => setTimeout(res, 25 + rnd() * 35));
    }
    return out;
  }, Array.from({ length: 60 }, (_, i) => combatFrame(i)));
  return { label, ...counts, heapMb, jsListeners, frame: dist(frame) };
}

export interface SoakResult {
  mode: 'short' | 'long';
  logs: string[];
  wallS: number;
  logMs: number;
  delivered: number;
  typed: number;
  state: string;
  recorder: string;
  checkpoints: Checkpoint[];
}

/**
 * Runs the soak on `logs` (name and text). Short mode plays the first
 * `seconds` of wall time of the first log; long mode plays each to its end.
 */
export async function benchSoak(t: Target, ctx: Ctx, logs: { name: string; text: string }[], long: boolean, seconds: number): Promise<SoakResult> {
  const page = await openBench(t, ctx.base, { settings: mapSetting(true), counters: true });
  const cdp = t.isChromium ? await page.context().newCDPSession(page) : null;
  if (cdp) await cdp.send('Performance.enable');
  await waitMap(page);
  await fakeLogin(page);
  for (let i = 0; i < 22; i++) await page.evaluate((s) => window.__wcBench!.inject(s), synthBatch(1000, 5000 + i));
  const checkpoints: Checkpoint[] = [await checkpoint(page, cdp, 'full scrollback')];
  const t0 = Date.now();
  let logMs = 0;
  let delivered = 0;
  let typed = 0;
  for (const [k, log] of logs.entries()) {
    const play = playLog(log.text, { login: k === 0, ...(long ? {} : { maxMs: seconds * SOAK_SPEED * 1000 + 60_000 }) });
    const loaded = await page.evaluate((text) => window.__wcBench!.loadPlay(text), play.text);
    let done = false;
    while (!done) {
      // Slices of 20 s wall time keep each evaluate short; the play goes on where it stopped.
      const left = long ? 20_000 : Math.min(20_000, seconds * 1000 - (Date.now() - t0));
      if (left <= 0) break;
      const r = await page.evaluate(([s, ms]) => window.__wcBench!.play(s!, ms!), [SOAK_SPEED, left] as const);
      delivered += r.delivered;
      typed += r.keys.length;
      done = r.done;
    }
    logMs += long ? loaded.logMs : Math.min(loaded.logMs, (Date.now() - t0) * SOAK_SPEED);
    if (long || k === logs.length - 1) checkpoints.push(await checkpoint(page, cdp, long ? `after ${log.name}` : 'end'));
    if (!long) break;
  }
  const tail = await page.evaluate(() => ({ state: window.__wcBench!.app!.session.state, recorder: window.__wcBench!.app!.recorder.status }));
  await closePage(page);
  return {
    mode: long ? 'long' : 'short',
    logs: long ? logs.map((l) => l.name) : [logs[0]!.name],
    wallS: (Date.now() - t0) / 1000,
    logMs,
    delivered,
    typed,
    ...tail,
    checkpoints,
  };
}

/** Flat: end ≤ 1.1 × start + slack (null when not measurable). */
export function flat(start: number | null, end: number | null, slack: number): boolean | null {
  if (start === null || end === null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return end <= start * 1.1 + slack;
}

export function soakPass(r: SoakResult): { counters: boolean; frames: boolean } {
  const a = r.checkpoints[0]!;
  const b = r.checkpoints.at(-1)!;
  const checks = [
    flat(a.elements, b.elements, 500),
    flat(a.bus, b.bus, 20),
    flat(a.timeouts, b.timeouts, 10),
    flat(a.intervals, b.intervals, 2),
    flat(a.listeners, b.listeners, 5),
    flat(a.heapMb, b.heapMb, 2),
    flat(a.jsListeners, b.jsListeners, 50),
  ];
  return { counters: checks.every((x) => x !== false), frames: b.frame.median <= a.frame.median * 1.2 + 1 };
}
