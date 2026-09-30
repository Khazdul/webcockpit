// IndexedDB and storage writers over a long session (perf review D).
//
//   node perf/idb-growth.ts [--browser chromium|firefox] [--port 4232] [--chunks 10800] [--comm 20000] [--no-build]
//
// In the production `?bench` page, using the app's own stores:
// - RunStore.append (the recorder's 2 s chunk write, with an event and the
//   summary now and then) for `chunks` chunks of ~800 bytes: a 6-hour run
//   at the real 2 s cadence is 10 800 chunks. Per 1000 appends: median /
//   p95 / max wall time of the awaited append and the main-thread time of
//   the call itself.
// - Afterwards: lastChunk, getChunks (the player's chainLog), sealRun,
//   listRuns, latestSealedRun on that store.
// - CommArchive.append for `comm` messages (one transaction each, as the
//   Comm pane writes), then loadRecent(1000) and prune().
// - The UI pane's sessionStorage ring write (flushStorage) with 1000 lines.
// - navigator.storage.estimate() along the way.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const BROWSER = opt('browser', 'chromium');
const PORT = Number(opt('port', '4232'));
const CHUNKS = Number(opt('chunks', '10800'));
const COMM = Number(opt('comm', '20000'));
const SCRATCH = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/D';
const root = new URL('..', import.meta.url).pathname;
if (!args.includes('--no-build')) execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'ignore' });

const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const type = BROWSER === 'firefox' ? firefox : chromium;
const browser = await type.launch(BROWSER === 'firefox' ? { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } } : {});
const page = await browser.newPage({ viewport: { width: 1728, height: 1050 } });
await page.goto(`http://localhost:${PORT}/?bench`);
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
console.log(`${BROWSER} ${browser.version()} loadavg ${readFileSync('/proc/loadavg', 'utf8').trim()}`);

const res = await page.evaluate(
  async ({ CHUNKS, COMM }) => {
    const B = (window as any).__wcBench;
    const out: Record<string, unknown> = {};
    const stats = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return { n: s.length, med: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], sum: s.reduce((a, b) => a + b, 0) };
    };
    const est = async () => (await navigator.storage.estimate()).usage;
    out.usage0 = await est();

    // ---------------------------------------------------------- run chunks
    const store = await B.app.recorder.getStore();
    const runId = 'Soak/2026-09-30T00-00-00';
    const t0us = Date.now() * 1000;
    await store.putRun({ runId, character: 'Soak', startedUs: t0us, endedUs: null, sealed: false, bytes: 0, lines: 0, summary: null });
    const line = (i: number) => `${String(t0us + i * 2e6).padStart(16, '0')} Some game text for chunk ${i}, about seventy characters of it, more or less.\n`;
    let body = '';
    for (let k = 0; k < 10; k++) body += line(k);
    const per: Array<{ at: number; wall: ReturnType<typeof stats>; sync: ReturnType<typeof stats> }> = [];
    let wall: number[] = [];
    let sync: number[] = [];
    let summary: any = { startUs: t0us, lastEventUs: t0us, kills: 0, pkills: 0, deaths: 0 };
    for (let i = 0; i < CHUNKS; i++) {
      const a: any = { chunk: { runId, seq: i, firstUs: t0us + i * 2e6, lastUs: t0us + i * 2e6 + 1e6, text: body }, bytes: body.length, lines: 10 };
      if (i % 50 === 0) {
        summary = { ...summary, lastEventUs: t0us + i * 2e6, kills: summary.kills + 1 };
        a.events = [{ runId, seq: i / 50, event: { type: 'kill', us: t0us + i * 2e6, logUs: t0us + i * 2e6, mobName: 'an orc', xpDelta: 1000 } }];
        a.summary = summary;
      }
      const s0 = performance.now();
      const p = store.append(runId, a);
      const s1 = performance.now();
      await p;
      const s2 = performance.now();
      sync.push(s1 - s0);
      wall.push(s2 - s0);
      if ((i + 1) % 1000 === 0 || i === CHUNKS - 1) {
        per.push({ at: i + 1, wall: stats(wall), sync: stats(sync) });
        wall = [];
        sync = [];
      }
    }
    out.append = per;
    out.usageAfterChunks = await est();
    const time = async (f: () => Promise<unknown>) => {
      const a = performance.now();
      const r = await f();
      return { ms: performance.now() - a, r };
    };
    out.lastChunk = (await time(() => store.lastChunk(runId))).ms;
    const gc = await time(() => store.getChunks(runId));
    out.getChunks = { ms: gc.ms, n: (gc.r as unknown[]).length };
    out.sealRun = (await time(() => store.sealRun(runId, t0us + CHUNKS * 2e6))).ms;
    out.listRuns = (await time(() => store.listRuns())).ms;
    out.latestSealedRun = (await time(() => store.latestSealedRun('Soak'))).ms;
    out.getEvents = (await time(() => store.getEvents(runId))).ms;

    // ---------------------------------------------------------------- comm
    const comm = B.app.cockpit.pane('comm');
    await comm.whenReady();
    const archive = comm.archive;
    const cper: Array<{ at: number; wall: ReturnType<typeof stats> }> = [];
    let cw: number[] = [];
    for (let i = 0; i < COMM; i++) {
      const s0 = performance.now();
      await archive.append({ character: 'Soak', ts: Date.now(), channel: 'tales', talker: 'Gibur', talkerType: 'player', destination: null, text: `Gibur narrates 'message number ${i} with some words in it'` });
      cw.push(performance.now() - s0);
      if ((i + 1) % 2000 === 0) {
        cper.push({ at: i + 1, wall: stats(cw) });
        cw = [];
      }
    }
    out.commAppend = cper;
    const lr = await time(() => archive.loadRecent('Soak', 1000));
    out.commLoadRecent = { ms: lr.ms, n: (lr.r as unknown[]).length };
    out.commPrune = (await time(() => archive.prune())).ms;
    out.usageAfterComm = await est();

    // ----------------------------------------------------- UI ring write
    const ui = B.app.cockpit.pane('ui');
    const msgs = [];
    for (let i = 0; i < 1000; i++) msgs.push({ kind: 'state', tag: 'SPELL', parts: [{ value: 'sanctuary' }, ' up.'] });
    ui.lines = msgs;
    const uw: number[] = [];
    for (let k = 0; k < 50; k++) {
      const a = performance.now();
      ui.flushStorage();
      uw.push(performance.now() - a);
    }
    out.uiRingWrite = { ...stats(uw), bytes: (sessionStorage.getItem('wc.ui.messages') ?? '').length };
    return out;
  },
  { CHUNKS, COMM },
);
const file = `${SCRATCH}/idb-growth-${BROWSER}.json`;
writeFileSync(file, JSON.stringify(res, null, 1));
const r = res as any;
console.log('run chunk append (per 1000): at  wall med/p95/max   sync med/max');
for (const p of r.append) console.log(`  ${String(p.at).padStart(6)}  ${p.wall.med.toFixed(2)}/${p.wall.p95.toFixed(2)}/${p.wall.max.toFixed(1)}   ${p.sync.med.toFixed(3)}/${p.sync.max.toFixed(2)}`);
console.log(`after ${CHUNKS} chunks: lastChunk ${r.lastChunk.toFixed(1)} ms, getChunks ${r.getChunks.ms.toFixed(0)} ms (${r.getChunks.n}), sealRun ${r.sealRun.toFixed(1)} ms, listRuns ${r.listRuns.toFixed(1)} ms, latestSealedRun ${r.latestSealedRun.toFixed(1)} ms, getEvents ${r.getEvents.toFixed(1)} ms`);
console.log('comm append (per 2000): ' + r.commAppend.map((p: any) => `${p.at}:${p.wall.med.toFixed(2)}/${p.wall.p95.toFixed(2)}`).join(' '));
console.log(`comm loadRecent ${r.commLoadRecent.ms.toFixed(1)} ms (${r.commLoadRecent.n}), prune ${r.commPrune.toFixed(1)} ms`);
console.log(`UI ring write (1000 lines, ${r.uiRingWrite.bytes} chars): med ${r.uiRingWrite.med.toFixed(2)} ms, max ${r.uiRingWrite.max.toFixed(2)} ms`);
console.log(`storage usage: start ${(r.usage0 / 1e6).toFixed(2)} MB, after chunks ${(r.usageAfterChunks / 1e6).toFixed(2)} MB, after comm ${(r.usageAfterComm / 1e6).toFixed(2)} MB`);
console.log(`wrote ${file}`);
await browser.close();
await new Promise<void>((r2) => server.httpServer.close(() => r2()));
