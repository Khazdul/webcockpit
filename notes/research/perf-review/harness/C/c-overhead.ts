// Q5: what a latency monitor would cost. The burst (biggest log, speed 0,
// as the bench) drains with and without the area-C instrumentation
// (c-common.ts `install`: keydown/input listeners, a net.bytesOut hook,
// Event Timing + LoAF observers and a rAF gap tick; the `?bench` probe's
// per-flush timing and after-paint message are there in both). Fresh page
// per run, A/B interleaved.
//
//   node perf/c-overhead.ts [--browsers chromium,firefox] [--reps 5]
import { f, khazdulProfile, launch, loadavg, openApp, pause, pct, ROOT, startServer, type BrowserName } from './lib.ts';
import { install } from './c-common.ts';
import { burstText } from './c-feeds.ts';
import { resolve } from 'node:path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const REPS = Number(args.get('reps') ?? 5);
const server = await startServer(resolve(ROOT, 'dist'), 4221, true);
const text = burstText();
const profile = khazdulProfile();
console.log(`# monitor overhead: burst drain with / without instrumentation, ${new Date().toISOString()}, loadavg ${loadavg()}`);
try {
  for (const name of browsers) {
    const browser = await launch(name);
    const res: Record<string, { ms: number[]; script: number[] }> = { off: { ms: [], script: [] }, on: { ms: [], script: [] } };
    for (let r = 0; r < REPS; r++) {
      for (const mode of r % 2 ? ['on', 'off'] : ['off', 'on']) {
        const page = await openApp(browser, name, 'http://127.0.0.1:4221');
        // The khazdul profile in both modes (install() applies it; its
        // rules cost ~2 µs per line on their own), so only the
        // instrumentation differs.
        if (mode === 'on') await page.evaluate(install, profile);
        else await page.evaluate((p) => (window as unknown as Record<string, any>).__wcBench.applyProfile(p), profile);
        await page.evaluate((t) => ((window as unknown as Record<string, unknown>).__t = t), text);
        await pause(300);
        const out = await page.evaluate(async () => {
          const B = (window as unknown as Record<string, any>).__wcBench;
          B.flushes.length = 0;
          const r = await B.replay((window as unknown as Record<string, any>).__t, 0);
          const sc = B.flushes.map((x: any) => x.script).sort((a: number, b: number) => a - b);
          return { ms: r.ms, script: sc[Math.floor(sc.length / 2)] };
        });
        res[mode]!.ms.push(out.ms);
        res[mode]!.script.push(out.script);
        await page.context().close();
      }
    }
    console.log(
      `- ${name} ${browser.version()}: drain ms off ${res.off!.ms.map((x) => x.toFixed(0)).join(', ')} (median ${f(pct(res.off!.ms, 50), 0)}); on ${res.on!.ms.map((x) => x.toFixed(0)).join(', ')} (median ${f(pct(res.on!.ms, 50), 0)}); flush script median off ${f(pct(res.off!.script, 50))} / on ${f(pct(res.on!.script, 50))} ms`,
    );
    await browser.close();
  }
} finally {
  server.close();
}
