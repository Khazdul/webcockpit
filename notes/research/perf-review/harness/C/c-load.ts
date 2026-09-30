// Q2/Q3: input delay under load with real (Playwright) key events.
//
//   node perf/c-load.ts [--browsers chromium,firefox] [--scenarios idle,help,burst,play]
//        [--keys 150] [--dist dist] [--coi 1] [--trace 0|1] [--gecko 0|1] [--tag name]
//
// Loads run in the page on their own timers while Node presses keys at
// random gaps (40–250 ms): typed letters, Enter (sends the line), F1 (macro
// `hit $target`) and ` (printable-key macro `sc`), with the khazdul profile.
//
// - idle:  no load (baseline for the harness's own overhead).
// - help:  MUME's `help 24-bit colours` pages (~45 rows, ~2400 SGR runs
//          each), one page every 150–450 ms, as when paging with Enter.
// - burst: the biggest log replayed at speed 0 (ReplaySocket, as the bench),
//          restarted 300 ms after each drain.
// - play:  a busy 90 s window of the same log at speed 1 through the fake
//          (live-like) socket after a GMCP login (side panes, recorder
//          writing to IndexedDB, timers, map pane), GMCP mixed in.
//
// Per key (page clock, performance.now()):
//   ts      event.timeStamp;  t0  first keydown listener (window capture)
//   send    first net.bytesOut after the keydown (right after socket.send)
//   end     last keydown listener (window bubble)
//   paint   after the next frame rendered (rAF + MessageChannel)
//   input   the `input` event of a typed letter; ipaint its next frame
// Chromium: event.timeStamp is set when the browser process creates the
// event (CDP), so t0 − ts is the input delay (IPC + queueing). Firefox:
// Playwright (Juggler) creates the event inside the content process, so
// timeStamp ≈ t0; there the delay is measured from Node's clock just before
// `keyboard.down` (clock offset by min-RTT sync), which includes ~1–2 ms of
// protocol and queues behind normal-priority tasks (an upper bound).
// Event Timing (durationThreshold 16) and, in Chromium, Long Animation
// Frames are recorded for attribution; --trace records a Chromium trace,
// --gecko a Gecko profile (MOZ_PROFILER_STARTUP) for Firefox.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { f, khazdulProfile, launch, loadavg, openApp, pause, ROOT, startServer, type BrowserName, maxOf } from './lib.ts';
import { analyse, analyseTrace, clockOffset, collect, install, login, reapplyProfile, pressKeys, resetCollect, startBurst, startHelp, startPlay, stopAll, type Collected, type Kind } from './c-common.ts';
import { burstText, framesOf, helpPages, loginLog, playFrames } from './c-feeds.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const scenarios = (args.get('scenarios') ?? 'idle,help,burst,play').split(',');
const KEYS = Number(args.get('keys') ?? 150);
const coi = (args.get('coi') ?? '1') === '1';
const dist = resolve(ROOT, args.get('dist') ?? 'dist');
const doTrace = args.get('trace') === '1';
const doGecko = args.get('gecko') === '1';
const tag = args.get('tag') ?? '';
const OUT = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/C';
const PORT = Number(args.get('port') ?? 4229);

// --------------------------------------------------------------------- main

const server = await startServer(dist, PORT, coi);
const base = `http://127.0.0.1:${PORT}`;
const profile = khazdulProfile();
const help = helpPages();
const play = playFrames(90);
const loginFrames = framesOf(loginLog(1790449200000000)).map((x) => x.b64);
const burst = scenarios.includes('burst') ? burstText() : '';
const report: string[] = [];
const L = (s: string) => {
  console.log(s);
  report.push(s);
};
L(`# Input under load (Q2/Q3), ${new Date().toISOString()}`);
L(`dist ${dist}; coi ${coi}; keys per scenario ${KEYS}; trace ${doTrace}; gecko ${doGecko}; loadavg ${loadavg()}`);
L(`play feed: ${play.info}`);
const raw: Record<string, unknown> = {};
try {
  for (const name of browsers) {
    const geckoOut = `${OUT}/gecko-${tag || 'run'}-${Date.now()}.json`;
    const browser = await launch(
      name,
      name === 'firefox' && doGecko
        ? {
            env: {
              MOZ_PROFILER_STARTUP: '1',
              MOZ_PROFILER_SHUTDOWN: geckoOut,
              MOZ_PROFILER_STARTUP_FEATURES: 'js,ipcmessages',
              MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,DOM Worker',
              MOZ_PROFILER_STARTUP_INTERVAL: '1',
              MOZ_PROFILER_STARTUP_ENTRIES: '200000000',
            },
          }
        : {},
    );
    L(`\n## ${name} ${browser.version()} (headless, DPR 2, 1728×1000${name === 'chromium' ? ', GPU' : ''})`);
    for (const scen of scenarios) {
      const page = await openApp(browser, name, base);
      if (!(await page.evaluate(install, profile))) throw new Error('install failed');
      if (scen === 'burst') await page.evaluate((t) => ((window as unknown as Record<string, unknown>).__burstText = t), burst);
      if (scen === 'help' || scen === 'play' || scen === 'idle') {
        const st = await page.evaluate(login, loginFrames);
        if (st !== 'playing') console.warn(`login: state ${st}`);
      }
      if (!(await page.evaluate(reapplyProfile))) console.warn('profile: F1/Backquote macros not bound');
      await pause(800);
      const off = await clockOffset(page);
      await page.evaluate(resetCollect);
      await page.evaluate(() => performance.mark('c-sync'));
      const syncPage = await page.evaluate(() => performance.getEntriesByName('c-sync').at(-1)!.startTime);
      if (scen === 'help') await page.evaluate(startHelp, help);
      else if (scen === 'burst') await page.evaluate(startBurst);
      else if (scen === 'play') await page.evaluate(startPlay, play.frames);
      await pause(scen === 'burst' ? 200 : 600);
      const tracing = doTrace && name === 'chromium';
      if (tracing) {
        await browser.startTracing(page, {
          categories: [
            'devtools.timeline',
            'disabled-by-default-devtools.timeline',
            'blink.user_timing',
            'toplevel',
            'v8',
            'disabled-by-default-v8.gc',
            'input',
            'latencyInfo',
          ],
        });
        await page.evaluate(() => performance.mark('c-sync'));
      }
      const syncTrace = tracing ? await page.evaluate(() => performance.getEntriesByName('c-sync').at(-1)!.startTime) : syncPage;
      const la0 = loadavg();
      const nk = await pressKeys(page, KEYS);
      const la1 = loadavg();
      const traceBuf = tracing ? await browser.stopTracing() : null;
      await page.evaluate(stopAll);
      const off2 = await clockOffset(page);
      const c = (await page.evaluate(collect)) as Collected;
      L(`\n### ${name} / ${scen}  (loadavg ${la0} → ${la1}; clock sync rtt ${f(off.rtt)}/${f(off2.rtt)} ms, offset drift ${f(off2.off - off.off, 3)} ms)`);
      const res = analyse(name, scen, c, nk, (off.off + off2.off) / 2, L);
      if (traceBuf) {
        writeFileSync(`${OUT}/trace-${name}-${scen}-${tag || 'run'}.json`, traceBuf);
        await analyseTrace(traceBuf, syncTrace, (res as { perKey: { delay: number; ts: number; t0: number; kind: Kind }[] }).perKey, L);
      }
      raw[`${name}/${scen}`] = { c, nk, off, off2, syncPage };
      await page.context().close();
    }
    await browser.close();
    if (name === 'firefox' && doGecko) L(`gecko profile: ${geckoOut}`);
  }
} finally {
  server.close();
}
const stamp = Date.now();
writeFileSync(`${OUT}/load-${tag || 'run'}-${stamp}.md`, report.join('\n') + '\n');
writeFileSync(`${OUT}/load-${tag || 'run'}-${stamp}.json`, JSON.stringify(raw));
console.log(`\nwrote ${OUT}/load-${tag || 'run'}-${stamp}.md`);
