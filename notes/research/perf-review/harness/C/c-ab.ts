// A/B of two builds under one load scenario, interleaved in the same
// browser (A, B, A, B … pages), real Playwright keys as in c-load.ts.
//
//   node perf/c-ab.ts --a dist --b dist-budget [--browsers chromium,firefox]
//        [--scenario help] [--reps 4] [--keys 50]
//
// Prints, per build, the pooled per-key metrics (from analyse() in
// c-common.ts) and the output flush / frame statistics.
import { resolve } from 'node:path';
import { f, khazdulProfile, launch, loadavg, openApp, pause, pct, ROOT, startServer, stats, type BrowserName, maxOf } from './lib.ts';
import { analyse, clockOffset, collect, install, login, reapplyProfile, pressKeys, resetCollect, startBurst, startHelp, startPlay, stopAll, type Collected } from './c-common.ts';
import { burstText, framesOf, helpPages, loginLog, playFrames } from './c-feeds.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const scen = args.get('scenario') ?? 'help';
const REPS = Number(args.get('reps') ?? 4);
const KEYS = Number(args.get('keys') ?? 50);
const builds = [args.get('a') ?? 'dist', args.get('b') ?? 'dist-budget'];
const servers = await Promise.all(builds.map((d, i) => startServer(resolve(ROOT, d), 4223 + i, true)));
const profile = khazdulProfile();
const help = helpPages();
const play = playFrames(90);
const loginFrames = framesOf(loginLog(1790449200000000)).map((x) => x.b64);
const burst = scen === 'burst' ? burstText() : '';
console.log(`# A/B ${builds.join(' vs ')} on ${scen}, ${REPS} reps × ${KEYS} keys, ${new Date().toISOString()}, loadavg ${loadavg()}`);
try {
  for (const name of browsers) {
    const browser = await launch(name);
    console.log(`\n## ${name} ${browser.version()}`);
    const pooled = builds.map(() => new Map<string, number[]>());
    const flushes = builds.map(() => ({ script: [] as number[], frame: [] as number[], gaps: [] as number[], n: 0 }));
    for (let r = 0; r < REPS; r++) {
      for (let bi = 0; bi < builds.length; bi++) {
        const page = await openApp(browser, name, `http://127.0.0.1:${4223 + bi}`);
        await page.evaluate(install, profile);
        if (scen === 'burst') await page.evaluate((t) => ((window as unknown as Record<string, unknown>).__burstText = t), burst);
        else await page.evaluate(login, loginFrames);
        if (!(await page.evaluate(reapplyProfile))) console.warn('profile: F1/Backquote macros not bound');
        await pause(800);
        const off = await clockOffset(page);
        await page.evaluate(resetCollect);
        if (scen === 'help') await page.evaluate(startHelp, help);
        else if (scen === 'burst') await page.evaluate(startBurst);
        else if (scen === 'play') await page.evaluate(startPlay, play.frames);
        await pause(400);
        const nk = await pressKeys(page, KEYS);
        await page.evaluate(stopAll);
        const off2 = await clockOffset(page);
        const c = (await page.evaluate(collect)) as Collected;
        const res = analyse(name, scen, c, nk, (off.off + off2.off) / 2, () => {}) as { rows: Record<string, number[]> };
        for (const [k, v] of Object.entries(res.rows)) pooled[bi]!.set(k, [...(pooled[bi]!.get(k) ?? []), ...v]);
        const fl = flushes[bi]!;
        for (const x of c.flushes) {
          fl.script.push(x[1]);
          fl.frame.push(x[2]);
        }
        fl.gaps.push(...c.gaps.map((g) => g[1]));
        fl.n += c.flushes.length;
        await page.context().close();
      }
    }
    const metrics: [string, string][] =
      name === 'chromium'
        ? [
            ['tsDelay', 'input delay (timeStamp → listener)'],
            ['keyToSend', 'key → socket.send'],
            ['keyToPaint', 'key → next frame rendered'],
            ['charToPaint', 'typed letter → rendered'],
            ['enterToEcho', 'Enter → echo rendered'],
          ]
        : [
            ['nodeDelay', 'Node press → listener'],
            ['keyToSendNode', 'Node press → socket.send'],
            ['keyToPaintNode', 'Node press → next frame rendered'],
            ['charToPaintNode', 'Node press → typed letter rendered'],
            ['enterToEchoNode', 'Node press → Enter echo rendered'],
          ];
    for (const [k, label] of metrics) {
      console.log(`- ${label}: ${builds.map((b, bi) => {
        const s = stats(pooled[bi]!.get(k) ?? []);
        return `${b} ${f(s.median)} / p95 ${f(s.p95)} / p99 ${f(s.p99)} / max ${f(s.max)} (n=${s.n})`;
      }).join('  |  ')}`);
    }
    for (let bi = 0; bi < builds.length; bi++) {
      const fl = flushes[bi]!;
      console.log(`- ${builds[bi]} flushes ${fl.n}: script median ${f(pct(fl.script, 50))} / p95 ${f(pct(fl.script, 95))} / max ${f(maxOf(fl.script))}; frame median ${f(pct(fl.frame, 50))} / p95 ${f(pct(fl.frame, 95))} / max ${f(maxOf(fl.frame))}; rAF gaps p95 ${f(pct(fl.gaps, 95))} / max ${f(maxOf(fl.gaps))}, > 50 ms ${fl.gaps.filter((g) => g > 50).length} of ${fl.gaps.length}`);
    }
    await browser.close();
  }
} finally {
  for (const s of servers) s.close();
}
