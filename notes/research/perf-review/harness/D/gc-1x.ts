// GC pauses and main-thread stalls at the live rate with a full scrollback
// (perf review D): the owner's log played at 1× for `windows` × `seconds`.
//
//   node perf/gc-1x.ts [--browser chromium|firefox] [--windows 4] [--seconds 300] [--port 4237] [--no-build]
//
// Production `?bench`, khazdul, all panes on (map too), commands typed. The
// scrollback is filled first (loop 0 to 30 % at 300×), then loop 0 plays on
// at 1×. Per window: Chromium — a DevTools trace (MajorGC / MinorGC / CppGC
// on the page's main thread, long tasks); Firefox — JS_GC_PROFILE major
// slices and minor GCs of the page's content process. Both: the rAF gap
// histogram (stalls of any cause, incl. Firefox's cycle collector).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TRACE_CATEGORIES, formatTrace, summarizeTrace } from './trace-summary.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'chromium');
const PORT = Number(opt('port', '4237'));
const WINDOWS = Number(opt('windows', '4'));
const SECONDS = Number(opt('seconds', '300'));
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
const root = new URL('..', import.meta.url).pathname;
if (!args.includes('--no-build')) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });
if (!existsSync(`${root}dist/__soak/loop0.bin`)) execFileSync('node', ['perf/soak-gen.ts'], { cwd: root, stdio: 'inherit' });

const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const isChromium = BROWSER === 'chromium';
const gc: Array<{ w: number; line: string }> = [];
let win = -1;
const bs = isChromium
  ? await chromium.launchServer({ args: ['--enable-gpu', '--use-angle=vulkan'] })
  : await firefox.launchServer({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' }, env: { ...process.env, JS_GC_PROFILE: '0', JS_GC_PROFILE_NURSERY: '1' } });
const carry: Record<string, string> = { out: '', err: '' };
const onOut = (which: 'out' | 'err') => (d: Buffer): void => {
  const parts = (carry[which] + d.toString()).split('\n');
  carry[which] = parts.pop() ?? '';
  for (const line of parts) if (/^(MajorGC|MinorGC): \d/.test(line)) gc.push({ w: win, line });
};
bs.process().stdout?.on('data', onOut('out'));
bs.process().stderr?.on('data', onOut('err'));
const browser = await (isChromium ? chromium : firefox).connect(bs.wsEndpoint());
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, ...(isChromium ? { deviceScaleFactor: 2 } : {}) });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${PORT}/?bench`);
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
await page.waitForFunction(async () => ((await (window as any).__wcBench.app.profiles?.get('khazdul')) ?? null) !== null);
await page.evaluate(() => (window as any).__wcBench.settings.update({ profile: 'khazdul' }));
await page.evaluate(readFileSync(new URL('./soak-page.js', import.meta.url), 'utf8'));
await page.evaluate(() => (window as any).__soak.load(0));
await page.evaluate(() => {
  const B = (window as any).__wcBench;
  B.connectFake();
  B.app.offline = false;
});
await page.waitForFunction(() => (window as any).__wcBench.app.writeBack?.target === 'khazdul', undefined, { timeout: 10000 });
console.log(`${BROWSER} ${browser.version()} loadavg ${readFileSync('/proc/loadavg', 'utf8').trim()}`);
const n = await page.evaluate(() => (window as any).__soak.loops[0].n);
let at = Math.floor(n * 0.3);
await page.evaluate(([to]) => (window as any).__soak.play(0, 300, 0, to), [at]);
await page.evaluate(() => (window as any).__wcBench.drained());
await page.evaluate(() => new Promise((r) => setTimeout(r, 5000)));
const out: unknown[] = [];
for (let w = 0; w < WINDOWS; w++) {
  win = w;
  if (isChromium) await browser.startTracing(page, { categories: TRACE_CATEGORIES });
  await page.evaluate(() => (window as any).__soak.sample());
  const r = await page.evaluate(
    async ({ from, seconds }) => {
      const S = (window as any).__soak;
      const L = S.loops[0];
      let to = from;
      while (to < L.n && L.at[to] - L.at[from] < seconds * 1000) to++;
      await S.play(0, 1, from, to);
      const s = S.sample();
      return { to, gaps: s.gaps, flush: s.flush, frame: s.frame, key: s.key, rows: s.rows };
    },
    { from: at, seconds: SECONDS },
  );
  at = r.to;
  const row: Record<string, unknown> = { w, load: readFileSync('/proc/loadavg', 'utf8').split(' ')[0], ...r };
  if (isChromium) {
    const t = summarizeTrace(await browser.stopTracing(), `1x window ${w}`);
    row.trace = t;
    console.log(formatTrace(t));
  } else {
    await new Promise((res) => setTimeout(res, 1500)); // let stderr flush
    const pids = new Map<string, number>();
    for (const g of gc) {
      const f = g.line.trim().split(/\s+/);
      pids.set(f[1]!, (pids.get(f[1]!) ?? 0) + 1);
    }
    const pid = [...pids.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const slices: number[] = [];
    const minor: number[] = [];
    for (const g of gc.filter((x) => x.w === w)) {
      const f = g.line.trim().split(/\s+/);
      if (f[1] !== pid) continue;
      if (f[0] === 'MajorGC:') {
        let j = f.indexOf('->') + 2;
        if (!/^\d/.test(f[j]!)) j++;
        slices.push(Number(f[j + 6]));
      } else minor.push(Number(f[9]) / 1000);
    }
    slices.sort((a, b) => a - b);
    row.ff = { slices: slices.length, sliceP95: slices[Math.floor(slices.length * 0.95)] ?? 0, sliceMax: slices[slices.length - 1] ?? 0, minorOver1ms: minor.length, minorMax: Math.max(0, ...minor) };
    console.log(`1x window ${w}: GC ${JSON.stringify(row.ff)}`);
  }
  const g = r.gaps as any;
  console.log(
    `   window ${w}: rows ${r.rows}; rAF gaps >20 ${g.over20}, >34 ${g.over34}, >50 ${g.over50}, >100 ${g.over100}, max ${g.max.toFixed(1)} of ${g.n}; flush med ${r.flush?.med?.toFixed(2)} p95 ${r.flush?.p95?.toFixed(2)} max ${r.flush?.max?.toFixed(1)}; frame med ${r.frame?.med?.toFixed(2)} p95 ${r.frame?.p95?.toFixed(2)} max ${r.frame?.max?.toFixed(1)}; key med ${r.key?.med?.toFixed(3)} p99 ${r.key?.p99?.toFixed(3)} max ${r.key?.max?.toFixed(2)}; load ${row.load}`,
  );
  out.push(row);
}
writeFileSync(`${SCRATCH}/gc-1x-${BROWSER}.json`, JSON.stringify(out, null, 1));
await browser.close();
await bs.close();
await new Promise<void>((res) => server.httpServer.close(() => res()));
