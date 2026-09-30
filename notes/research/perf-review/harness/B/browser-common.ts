// Area B perf harness: shared browser-side setup (see perf/browser-ingest.ts).

import { readFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { withGmcp } from './gmcp-mix.ts';

const RUNS = process.env.WEBCOCKPIT_FIXTURES ?? '/home/ole/MUME/data/runs';
const bigLog = readFileSync(`${RUNS}/Rasta/2026-09-18T18-11-42.log`, 'utf8');
const reproLog = readFileSync(`${RUNS}/Rasta/2026-09-30T00-11-08.log`, 'utf8').split('\n').slice(225, 364).join('\n') + '\n';
const gmcpLog = readFileSync('tests/fixtures/map-demo.log', 'utf8') + readFileSync('tests/fixtures/gmcp-demo.log', 'utf8');
export const KHAZDUL = readFileSync('src/profiles/khazdul.tin', 'utf8');

/** Scenario logs: text, how often its frames repeat per round, text lines per repeat. */
export const LOGS: Record<string, { text: string; repeat: number; lines: number }> = {
  big: { text: bigLog, repeat: 1, lines: 93883 },
  repro: { text: reproLog, repeat: 40, lines: 136 },
  'repro1': { text: reproLog, repeat: 1, lines: 136 },
  'big-gmcp': { text: withGmcp(bigLog, gmcpLog, 10).text, repeat: 1, lines: 93883 },
};

export const loadavg = (): string => readFileSync('/proc/loadavg', 'utf8').trim();

/** Installs `window.__B` (frames per scenario, the timed delivery loop). Runs in the page. */
export function install(): void {
  type Probe = {
    sock: { onData: (b: Uint8Array) => void };
    frames: Uint8Array[];
    flushes: Array<{ start: number; script: number; frame: number }>;
    loadFrames(t: string, speed: number): number;
  };
  const p = (window as unknown as { __wcBench: Probe }).__wcBench;
  const frames: Record<string, Uint8Array[]> = {};
  const pct = (xs: Float64Array, q: number): number => {
    const s = Array.from(xs).sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
  };
  (window as unknown as { __B: unknown }).__B = {
    load(name: string, text: string, repeat: number): number {
      p.loadFrames(text, 1);
      const one = p.frames.filter((f) => f.length > 0);
      const all: Uint8Array[] = [];
      for (let r = 0; r < repeat; r++) for (const f of one) all.push(f);
      frames[name] = all;
      return all.length;
    },
    raw(bytes: number[]): void {
      p.sock.onData(Uint8Array.from(bytes));
    },
    async run(name: string, sliceMs: number) {
      const fs = frames[name]!;
      const n = fs.length;
      const per = new Float64Array(n);
      const slices: number[] = [];
      const f0 = p.flushes.length;
      const epoch0 = performance.timeOrigin + performance.now();
      const w0 = performance.now();
      let i = 0;
      while (i < n) {
        const s0 = performance.now();
        let s1 = s0;
        while (i < n) {
          p.sock.onData(fs[i]!);
          const t = performance.now();
          per[i++] = t - s1;
          s1 = t;
          if (t - s0 >= sliceMs) break;
        }
        slices.push(s1 - s0);
        await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      }
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
      const wall = performance.now() - w0;
      const epoch1 = performance.timeOrigin + performance.now();
      const fl = p.flushes.slice(f0);
      const script = fl.map((f) => f.script);
      return {
        frames: n,
        ingest: slices.reduce((a, b) => a + b, 0),
        slices: slices.length,
        sliceMax: Math.max(...slices),
        frameP50: pct(per, 0.5),
        frameP95: pct(per, 0.95),
        frameP99: pct(per, 0.99),
        frameMax: per.reduce((m, x) => (x > m ? x : m), 0),
        wall,
        flushes: fl.length,
        flushScript: script.reduce((a, b) => a + b, 0),
        flushScriptMax: script.length ? Math.max(...script) : 0,
        flushFrameMax: fl.length ? Math.max(...fl.map((f) => f.frame)) : 0,
        epoch0,
        epoch1,
      };
    },
  };
}

/** GMCP bytes: IAC SB GMCP <payload> IAC SE. */
export function gmcpBytes(payload: string): number[] {
  return [255, 250, 201, ...new TextEncoder().encode(payload), 255, 240];
}

/** The `?bench` page, live-like: fake socket, khazdul, `playing` (recording), map loaded, scenario frames loaded. */
export async function openPage(browser: Browser, base: string, scenarios: string[]): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${base}/?bench`);
  await page.waitForFunction(() => (window as unknown as { __wcBench?: { app: unknown } }).__wcBench?.app != null);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(install);
  await page.evaluate(() => (window as unknown as { __wcBench: { connectFake(): void } }).__wcBench.connectFake());
  const ok = await page.evaluate((t) => (window as unknown as { __wcBench: { applyProfile(t: string): boolean } }).__wcBench.applyProfile(t), KHAZDUL);
  if (!ok) throw new Error('khazdul did not load');
  const pre = [
    255, 251, 201,
    ...gmcpBytes('Char.Name {"name":"Rasta","fullname":"Rasta Fari the Wanderer"}'),
    ...gmcpBytes('Char.StatusVars {"name":"Rasta","level":25}'),
    ...gmcpBytes('Char.Vitals {"hp":172,"maxhp":172,"mana":40,"maxmana":40,"mp":131,"maxmp":131,"xp":5770000,"tp":41500}'),
  ];
  await page.evaluate((b) => (window as unknown as { __B: { raw(b: number[]): void } }).__B.raw(b), pre);
  await page
    .waitForSelector('.wc-pane-map .wc-pane-content[data-map-state="loaded"]', { state: 'attached', timeout: 60_000 })
    .catch(() => console.log('  (map not loaded)'));
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => {
    const app = (window as unknown as { __wcBench: { app: { session: { state: string }; status: { get(): { capture: string } }; bus: { handlers: Map<string, unknown[]> } } } }).__wcBench.app;
    return { state: app.session.state, capture: app.status.get().capture, textLineHandlers: app.bus.handlers.get('text.line')?.length };
  });
  console.log(`  page ${base}: ${JSON.stringify(st)}`);
  for (const sc of scenarios) {
    const l = LOGS[sc]!;
    await page.evaluate(([n, t, r]) => (window as unknown as { __B: { load(n: string, t: string, r: number): number } }).__B.load(n as string, t as string, r as number), [sc, l.text, l.repeat] as const);
  }
  return page;
}

export type RunResult = Record<string, number>;

export function runRound(page: Page, sc: string, slice: number): Promise<RunResult> {
  return page.evaluate(
    ([n, s]) => (window as unknown as { __B: { run(n: string, s: number): Promise<Record<string, number>> } }).__B.run(n as string, s as number),
    [sc, slice] as const,
  );
}
