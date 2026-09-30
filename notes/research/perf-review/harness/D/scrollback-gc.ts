// Full scrollback: steady-state flush cost, the whole-chunk drop, and GC
// (perf review D, question 3).
//
//   node perf/scrollback-gc.ts [--browser chromium|firefox] [--sb 20000] [--chunk 200]
//        [--port 4235] [--minutes 2] [--no-build] [--label x]
//
// `--sb` / `--chunk` need the experiment patch exp-scrollback-knob.patch
// (window.__wcScrollback / __wcChunkRows read by src/ui/output-pane.ts);
// without it the defaults (20 000 / 200) apply whatever is passed.
//
// Production `?bench` page, map off (so the page's GC is the output's), no
// profile. The pane is filled past its cap with loop 0 of the soak data at
// max speed, then for `minutes` loop-0 frames are fed at 25–60 ms (≈ live
// PvP spam rate: ~20 lines/s): per flush the script time, the frame time
// (callback → after paint), rows added and whether a chunk was dropped.
// Then the same while scrolled up one page (the keep-view path of trimTop).
// GC: Chromium --trace-gc (page isolate), Firefox JS_GC_PROFILE; the rAF
// gap histogram in the page for both.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { TRACE_CATEGORIES, formatTrace, summarizeTrace } from './trace-summary.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'chromium');
const PORT = Number(opt('port', '4235'));
const SB = Number(opt('sb', '20000'));
const CHUNK = Number(opt('chunk', '200'));
const MINUTES = Number(opt('minutes', '2'));
const LABEL = opt('label', `sb${SB}-c${CHUNK}`);
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
const root = new URL('..', import.meta.url).pathname;
// The knobs need the experiment build: `git apply exp-scrollback-knob.patch`
// then `npx vite build --outDir dist-exp` (or pass --dist dist to measure the
// unpatched default).
const DIST = opt('dist', 'dist-exp');
if (!existsSync(`${root}${DIST}/index.html`)) throw new Error(`${DIST}/ missing: build it first (see the header)`);
if (!existsSync(`${root}${DIST}/__soak/loop0.bin`)) execFileSync('node', ['perf/soak-gen.ts', `${root}${DIST}/__soak`], { cwd: root, stdio: 'inherit' });

const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, build: { outDir: DIST }, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const isChromium = BROWSER === 'chromium';
const gc: Array<{ phase: string; line: string }> = [];
let phase = 'setup';
const bs = isChromium
  ? await chromium.launchServer({ args: ['--js-flags=--trace-gc', '--enable-precise-memory-info'] })
  : await firefox.launchServer({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' }, env: { ...process.env, JS_GC_PROFILE: '0', JS_GC_PROFILE_NURSERY: '1' } });
const carry: Record<string, string> = { out: '', err: '' };
const onOut = (which: 'out' | 'err') => (d: Buffer): void => {
  const parts = (carry[which] + d.toString()).split('\n');
  carry[which] = parts.pop() ?? '';
  for (const line of parts) {
    if (isChromium ? /ms: (Scavenge|Mark-Compact|Minor|Mark-Sweep)/.test(line) : /^(MajorGC|MinorGC): \d/.test(line)) gc.push({ phase, line });
  }
};
bs.process().stdout?.on('data', onOut('out'));
bs.process().stderr?.on('data', onOut('err'));
const browser = await (isChromium ? chromium : firefox).connect(bs.wsEndpoint());
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1050 }, ...(isChromium ? { deviceScaleFactor: 2 } : {}) });
await ctx.addInitScript(`window.__wcScrollback = ${SB}; window.__wcChunkRows = ${CHUNK};`);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const cdp = isChromium ? await ctx.newCDPSession(page) : null;
await page.goto(`http://localhost:${PORT}/?bench`);
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
await page.evaluate(() => (window as any).__wcBench.settings.update({ panes: { map: { on: false } } }));
await page.evaluate(readFileSync(new URL('./soak-page.js', import.meta.url), 'utf8'));
await page.evaluate(() => (window as any).__soak.load(0));
await page.evaluate(() => (window as any).__wcBench.connectFake());
const load = readFileSync('/proc/loadavg', 'utf8').trim();
console.log(`${BROWSER} ${browser.version()} ${LABEL}; loadavg ${load}`);

// Fill: loop 0 bytes (no commands) at max speed until the pane holds sb + some.
phase = 'fill';
const filled = await page.evaluate(async (sb) => {
  const B = (window as any).__wcBench;
  const L = (window as any).__soak.loops[0];
  let i = 0;
  while (B.app.output.rows < sb * 1.1 && i < L.n) {
    const stop = performance.now() + 8;
    while (performance.now() < stop && i < L.n) {
      if (L.len[i] > 0) B.sock.onData(L.bytes.subarray(L.off[i], L.off[i] + L.len[i]));
      i++;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  await B.drained();
  return { i, rows: B.app.output.rows, chunks: document.querySelectorAll('.wc-chunk').length, spans: document.querySelectorAll('.wc-output span').length };
}, SB);
let dom: any = null;
if (cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  dom = await cdp.send('Memory.getDOMCounters');
}
console.log(`filled: ${JSON.stringify(filled)} ${dom ? `nodes ${dom.nodes}` : ''}`);

const traces: Record<string, unknown>[] = [];
async function steady(tag: string, scrolled: boolean): Promise<any> {
  phase = tag;
  if (isChromium) await browser.startTracing(page, { categories: TRACE_CATEGORIES });
  const r = await steadyRun(tag, scrolled);
  if (isChromium) {
    const t = summarizeTrace(await browser.stopTracing(), `${LABEL} ${tag}`);
    traces.push(t);
    console.log(formatTrace(t));
  }
  return r;
}
async function steadyRun(tag: string, scrolled: boolean): Promise<any> {
  return page.evaluate(
    async ({ from, ms, scrolled }) => {
      const B = (window as any).__wcBench;
      const S = (window as any).__soak;
      const L = S.loops[0];
      const out = B.app.output;
      if (scrolled) out.pageUp();
      else out.toTail();
      await B.drained();
      S.sample();
      B.flushes.length = 0;
      const recs: Array<{ script: number; frame: number; added: number; drop: boolean }> = [];
      let i = from;
      const end = performance.now() + ms;
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      while (performance.now() < end) {
        while (L.len[i] === 0) i = (i + 1) % L.n;
        const rows0 = out.rows;
        const first0 = out.rowsEl.firstElementChild;
        // A frame with GMCP only makes no output flush: do not wait for it.
        let resolveW: (r: any) => void = () => {};
        const w = new Promise<any>((r) => {
          resolveW = r;
          B.waiters.push(r);
        });
        B.sock.onData(L.bytes.subarray(L.off[i], L.off[i] + L.len[i]));
        i = (i + 1) % L.n;
        const timer = setTimeout(() => {
          const k = B.waiters.indexOf(resolveW);
          if (k >= 0) B.waiters.splice(k, 1);
          resolveW(null);
        }, 200);
        const rec = await w;
        clearTimeout(timer);
        if (!rec) continue;
        const drop = out.rowsEl.firstElementChild !== first0;
        recs.push({ script: rec.script, frame: rec.frame, added: out.rows - rows0, drop });
        await new Promise((r) => setTimeout(r, 25 + rnd() * 35));
      }
      const g = S.sample();
      const st = (xs: number[]) => {
        if (!xs.length) return null;
        const s = [...xs].sort((a, b) => a - b);
        const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
        return { n: s.length, med: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] };
      };
      const nd = recs.filter((r) => !r.drop);
      const d = recs.filter((r) => r.drop);
      return {
        flushes: recs.length,
        linesPerS: recs.reduce((a, r) => a + Math.max(0, r.added), 0) / (ms / 1000),
        noDrop: { script: st(nd.map((r) => r.script)), frame: st(nd.map((r) => r.frame)) },
        drop: { script: st(d.map((r) => r.script)), frame: st(d.map((r) => r.frame)) },
        gaps: g.gaps,
        next: i,
        scrolled: out.isScrolled(),
      };
    },
    { from: filled.i, ms: MINUTES * 60000, scrolled },
  );
}

const live = await steady('live', false);
const back = await steady('scrolled', true);
phase = 'done';
await page.evaluate(() => (window as any).__wcBench.app.output.toTail());

// GC summary for the page's isolate / content process.
function gcSummary(tag: string): string {
  const lines = gc.filter((g) => g.phase === tag).map((g) => g.line);
  if (isChromium) {
    const iso = new Map<string, number>();
    for (const l of gc.map((g) => g.line)) {
      const m = /^\[\d+:(0x[0-9a-f]+)\]/.exec(l);
      if (m) iso.set(m[1]!, (iso.get(m[1]!) ?? 0) + 1);
    }
    // The page isolate: the one that ran forced GCs, else the one with the most lines.
    const forced = gc.map((g) => g.line).find((l) => /low memory notification|heap profiler/.test(l));
    const main = (forced ? /^\[\d+:(0x[0-9a-f]+)\]/.exec(forced)?.[1] : undefined) ?? [...iso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const minor: number[] = [];
    const major: number[] = [];
    const inc: number[] = [];
    for (const l of lines) {
      if (!l.includes(main)) continue;
      const m = /ms: (Scavenge|Minor Mark-Sweep|Mark-Compact|Mark-Sweep)[^,]*?[\d.]+ \([\d.]+\) -> [\d.]+ \([\d.]+\) MB,(?: pooled: [\d.]+ MB,)? ([\d.]+) \/ [\d.]+ ms(?:\s+\(\+ ([\d.]+) ms in \d+ steps)?/.exec(l);
      if (!m) continue;
      if (m[1] === 'Scavenge' || m[1] === 'Minor Mark-Sweep') minor.push(Number(m[2]));
      else {
        major.push(Number(m[2]));
        inc.push(Number(m[3] ?? 0));
      }
    }
    const mx = (xs: number[]) => (xs.length ? Math.max(...xs).toFixed(2) : '—');
    return `minor ${minor.length} (max ${mx(minor)} ms, sum ${minor.reduce((a, b) => a + b, 0).toFixed(1)}), major ${major.length} (atomic max ${mx(major)} ms, incremental sum ${inc.reduce((a, b) => a + b, 0).toFixed(1)} ms)`;
  }
  const pids = new Map<string, number>();
  for (const l of gc.map((g) => g.line)) {
    const f = l.trim().split(/\s+/);
    pids.set(f[1]!, (pids.get(f[1]!) ?? 0) + 1);
  }
  const pid = [...pids.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const slices: number[] = [];
  const minor: number[] = [];
  for (const l of lines) {
    const f = l.trim().split(/\s+/);
    if (f[1] !== pid) continue;
    if (f[0] === 'MajorGC:') {
      let j = f.indexOf('->') + 2;
      if (!/^\d/.test(f[j]!)) j++;
      slices.push(Number(f[j + 6]));
    } else minor.push(Number(f[9]) / 1000);
  }
  const mx = (xs: number[]) => (xs.length ? Math.max(...xs).toFixed(2) : '—');
  return `major slices ${slices.length} (max ${mx(slices)} ms, sum ${slices.reduce((a, b) => a + b, 0).toFixed(1)}), minor ≥1 ms ${minor.length} (max ${mx(minor)} ms)`;
}

const fmt = (s: any) => (s ? `med ${s.med.toFixed(2)} p95 ${s.p95.toFixed(2)} max ${s.max.toFixed(1)} (n ${s.n})` : '—');
for (const [tag, r] of [['live', live], ['scrolled', back]] as const) {
  console.log(
    `${tag}: ${r.flushes} flushes, ${r.linesPerS.toFixed(1)} rows/s; no drop: script ${fmt(r.noDrop.script)}, frame ${fmt(r.noDrop.frame)}; drop: script ${fmt(r.drop.script)}, frame ${fmt(r.drop.frame)}; rAF gaps >34 ${r.gaps.over34}, >50 ${r.gaps.over50}, max ${r.gaps.max.toFixed(1)} of ${r.gaps.n}; GC: ${gcSummary(tag)}`,
  );
}
writeFileSync(`${SCRATCH}/scrollback-gc-${BROWSER}-${LABEL}.json`, JSON.stringify({ browser: BROWSER, sb: SB, chunk: CHUNK, load, filled, dom, live, back, traces, gc }, null, 1));
await browser.close();
await bs.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
