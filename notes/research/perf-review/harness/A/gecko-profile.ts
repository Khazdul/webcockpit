// Q1/Q4 Firefox breakdown with the Gecko profiler (startup env vars).
// Runs one-shot injections of each payload (plus a combat frame right after
// each, to see what the heavy rows cost the next frames), then quits the
// browser so the shutdown profile is written, and sums the content main
// thread's markers per refresh-driver tick: script (rAF), styles, reflow,
// display list, WebRender transaction, plus Renderer/RenderBackend work.
//
//   node perf/gecko-profile.ts [--port 4205] [--dist dist] [--reps 4] [--only p24a,combat]
//        [--profile /path/profile.json] [--parse-only /path/profile.json]
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { f2, launch, loadavg, median, openBench, pageFacts, pause, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const PORT = Number(arg('port', '4205'));
const REPS = Number(arg('reps', '4'));
const only = arg('only', '');
const PROFILE = arg('profile', '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/A/gecko-profile.json');
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

const marks: Array<{ name: string; t: number }> = [];

if (!process.argv.includes('--parse-only')) {
  if (existsSync(PROFILE)) rmSync(PROFILE);
  const shots = payloads()
    .filter((p) => !only || only.split(',').includes(p.name))
    .map((p) => ({ name: p.name, b64: b64(oneShot(p.lines)) }));
  const combat = b64(oneShot(payloads().find((p) => p.name === 'combat')!.lines));
  const VARIANT = arg('variant', '');
  const server = await startServer(VARIANT ? new URL('./dists/', import.meta.url).pathname : arg('dist', 'dist'), PORT);
  const l = await launch('firefox', {
    env: {
      MOZ_PROFILER_STARTUP: '1',
      MOZ_PROFILER_STARTUP_ENTRIES: '100000000',
      MOZ_PROFILER_STARTUP_INTERVAL: '1',
      MOZ_PROFILER_STARTUP_FEATURES: arg('features', 'nostacksampling,markersallthreads,nomarkerstacks'),
      MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,RenderBackend,SceneBuilder,WRWorker,StyleThread,Paint,CanvasRenderer',
      MOZ_PROFILER_SHUTDOWN: PROFILE,
    },
  });
  try {
    const page = await openBench(l, `http://127.0.0.1:${PORT}/${VARIANT ? VARIANT + '/' : ''}?bench`);
    await page.evaluate(installPerf);
    await page.evaluate(() => (window as any).__perf.connect());
    const pre = playLines(2000);
    for (let i = 0; i < pre.length; i += 200) {
      await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(pre.slice(i, i + 200))));
    }
    await page.evaluate(() => (window as any).__perf.drained());
    console.log(JSON.stringify(await pageFacts(page)));
    for (let r = 0; r < REPS; r++) {
      for (const s of shots) {
        // performance.mark → UserTiming markers in the profile, to find the frames.
        await page.evaluate((n) => performance.mark(`inj:${n}`), s.name);
        const x: any = await page.evaluate((v) => (window as any).__perf.inject(Uint8Array.from(atob(v), (c) => c.charCodeAt(0))), s.b64);
        await pause(120);
        await page.evaluate(() => performance.mark('inj:after'));
        const y: any = await page.evaluate((v) => (window as any).__perf.inject(Uint8Array.from(atob(v), (c) => c.charCodeAt(0))), combat);
        marks.push({ name: s.name, t: x.frame }, { name: `${s.name}+combat`, t: y.frame });
        await pause(200);
      }
    }
    console.log(`loadavg ${loadavg()}`);
    await page.close();
  } finally {
    await l.browser.close();
    server.close();
  }
  for (let i = 0; i < 50 && !existsSync(PROFILE); i++) await pause(200);
}

// ------------------------------------------------------------------ parse
type Thread = any;
const prof = JSON.parse(readFileSync(PROFILE, 'utf8'));
const allThreads: Array<{ proc: string; t: Thread; strings: string[]; meta: any }> = [];
const collect = (p: any, proc: string) => {
  const shared = p.shared?.stringArray as string[] | undefined;
  for (const t of p.threads ?? [])
    allThreads.push({ proc, t, strings: shared ?? t.stringArray ?? (Array.isArray(t.stringTable) ? t.stringTable : t.stringTable?._array) ?? [], meta: p.meta });
  for (const c of p.processes ?? []) collect(c, `${c.meta?.product ?? 'child'}:${(c.threads?.[0]?.pid ?? '')}`);
};
collect(prof, 'parent');
console.log('threads:', allThreads.map((x) => `${x.proc}/${x.t.name}(${x.t.processType ?? ''})`).join(', '));

interface M {
  name: string;
  start: number;
  end: number;
  data: any;
}
function markersOf(x: { t: Thread; strings: string[] }): M[] {
  const m = x.t.markers;
  const out: M[] = [];
  if (!m) return out;
  if (m.schema) {
    // Raw (gecko) format: phase 0 instant, 1 interval, 2 start, 3 end.
    const s = m.schema;
    const open = new Map<string, Array<{ start: number; data: any }>>();
    for (const row of m.data) {
      const name = x.strings[row[s.name]]!;
      const ph = row[s.phase];
      const data = row[s.data];
      if (ph === 0) out.push({ name, start: row[s.startTime], end: row[s.startTime], data });
      else if (ph === 1) out.push({ name, start: row[s.startTime], end: row[s.endTime], data });
      else if (ph === 2) {
        const st = open.get(name) ?? [];
        st.push({ start: row[s.startTime], data });
        open.set(name, st);
      } else if (ph === 3) {
        const st = open.get(name);
        const o = st?.pop();
        if (o) out.push({ name, start: o.start, end: row[s.endTime], data: o.data ?? data });
      }
    }
    out.sort((a, b) => a.start - b.start);
  } else {
    for (let i = 0; i < m.length; i++) {
      out.push({ name: x.strings[m.name[i]]!, start: m.startTime[i], end: m.endTime[i] ?? m.startTime[i], data: m.data[i] });
    }
  }
  return out;
}
// The content process main thread: the one with our UserTiming marks.
const content = allThreads.find((x) => x.t.name === 'GeckoMain' && markersOf(x).some((m) => m.name === 'UserTiming' && String(m.data?.name ?? '').startsWith('inj:')));
if (!content) {
  console.log('no content GeckoMain with inj: marks found');
  process.exit(1);
}
const cm = markersOf(content);
const names = new Map<string, number>();
for (const m of cm) names.set(m.name, (names.get(m.name) ?? 0) + 1);
console.log('content main marker names:', [...names].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([n, c]) => `${n}×${c}`).join(', '));
// Per injection: the first RefreshDriverTick after the inj: mark; sum marker durations inside it.
const injs = cm.filter((m) => m.name === 'UserTiming' && String(m.data?.name ?? '').startsWith('inj:')).sort((a, b) => a.start - b.start);
const ticks = cm.filter((m) => m.name === 'RefreshDriverTick').sort((a, b) => a.start - b.start);
const sameProc = allThreads.filter((x) => x.proc === content.proc);
const renderer = allThreads.filter((x) => /Renderer|RenderBackend|SceneBuilder|WRWorker/.test(x.t.name));
const agg: Record<string, Record<string, number[]>> = {};
let cur = '';
for (let i = 0; i < injs.length; i++) {
  const mk = injs[i]!;
  const label = String(mk.data.name).slice(4);
  cur = label === 'after' ? `${cur}+combat` : label;
  // Ticks within 60 ms after the mark; the one with our flush is the longest.
  const cand = ticks.filter((t) => t.start >= mk.start && t.start <= mk.start + 60);
  if (!cand.length) continue;
  const tick = cand.sort((a, b) => b.end - b.start - (a.end - a.start))[0]!;
  const inside = (m: M) => m.start >= tick.start - 0.01 && m.end <= tick.end + 0.01;
  const sum = (pred: (m: M) => boolean) => cm.filter((m) => inside(m) && pred(m)).reduce((a, m) => a + (m.end - m.start), 0);
  const row: Record<string, number> = {
    tick: tick.end - tick.start,
    rAF: sum((m) => m.name === 'requestAnimationFrame callbacks' || m.name === 'RequestAnimationFrame callbacks' || m.name === 'requestAnimationFrame'),
    styles: sum((m) => m.name === 'Styles'),
    reflow: sum((m) => m.name === 'Reflow (interruptible)' || m.name === 'Reflow (sync)' || m.name === 'Reflow'),
    displayList: sum((m) => m.name === 'DisplayList' || m.name === 'Display list building' || m.name === 'DisplayListBuilding'),
    paint: sum((m) => m.name === 'Paint' || m.name === 'PaintForWebRender' || m.name === 'WebRenderPaint'),
    wrBuild: sum((m) => m.name === 'WrDisplayList' || m.name === 'CreateWebRenderCommands'),
  };
  // Renderer-side work in the 100 ms after the tick.
  for (const x of renderer) {
    const ms = markersOf(x).filter((m) => m.start >= tick.start && m.start <= tick.end + 100);
    const k = `${x.t.name}`;
    row[k] = (row[k] ?? 0) + ms.filter((m) => /Composite|Render|Rasteriz|Scene|Frame build|Blob|Glyph/i.test(m.name)).reduce((a, m) => a + (m.end - m.start), 0);
  }
  for (const [k, v] of Object.entries(row)) ((agg[cur] ??= {})[k] ??= []).push(v);
}
const keys = [...new Set(Object.values(agg).flatMap((m) => Object.keys(m)))];
console.log('payload       ' + keys.map((k) => k.slice(0, 11).padStart(12)).join(''));
for (const [n, m] of Object.entries(agg)) console.log(n.padEnd(14) + keys.map((k) => f2(median(m[k] ?? [])).padStart(12)).join(''));
if (marks.length) {
  const by: Record<string, number[]> = {};
  for (const m of marks) (by[m.name] ??= []).push(m.t);
  console.log('probe frame (rAF → after rendering), median:', Object.entries(by).map(([k, v]) => `${k} ${f2(median(v))}`).join(', '));
}
void sameProc;
