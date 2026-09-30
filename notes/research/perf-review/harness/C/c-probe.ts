// Environment probe: API support, timer resolution, DPR, and what
// `event.timeStamp` means for Playwright-injected keys in each browser.
//   node perf/c-probe.ts
import { f, launch, loadavg, nodeEpoch, openApp, pause, startServer, ROOT, type BrowserName } from './lib.ts';
import { resolve } from 'node:path';

const dist = resolve(ROOT, 'dist');
const s1 = await startServer(dist, 4221, false);
const s2 = await startServer(dist, 4222, true);
console.log('loadavg', loadavg());
try {
  for (const name of ['chromium', 'firefox'] as BrowserName[]) {
    const browser = await launch(name);
    for (const [label, base] of [['pages (no COI)', 'http://127.0.0.1:4221'], ['coi', 'http://127.0.0.1:4222']] as const) {
      const page = await openApp(browser, name, base, { waitMap: true });
      const info = await page.evaluate(() => {
        const t: number[] = [];
        let last = performance.now();
        for (let i = 0; i < 200000 && t.length < 50; i++) {
          const n = performance.now();
          if (n !== last) {
            t.push(n - last);
            last = n;
          }
        }
        return {
          ua: navigator.userAgent,
          coi: (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated,
          dpr: devicePixelRatio,
          size: [innerWidth, innerHeight],
          types: PerformanceObserver.supportedEntryTypes,
          minStep: Math.min(...t),
          medStep: t.sort((a, b) => a - b)[Math.floor(t.length / 2)],
          timeOrigin: performance.timeOrigin,
          webgl: (() => {
            const c = document.createElement('canvas').getContext('webgl2');
            if (!c) return 'none';
            const e = c.getExtension('WEBGL_debug_renderer_info');
            return String(e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER));
          })(),
        };
      });
      console.log(`\n[${name} ${browser.version()} ${label}]`, JSON.stringify(info, null, 0));
      // Key timeStamp semantics: node time before keyboard.down vs page handler time.
      await page.evaluate(() => {
        const w = window as unknown as { __k: { ts: number; now: number; epoch: number }[] };
        w.__k = [];
        window.addEventListener(
          'keydown',
          (e) => {
            const now = performance.now();
            w.__k.push({ ts: e.timeStamp, now, epoch: performance.timeOrigin + now });
          },
          true,
        );
      });
      // Clock offset page epoch - node epoch by min RTT.
      let best = { rtt: Infinity, off: 0 };
      for (let i = 0; i < 30; i++) {
        const t0 = nodeEpoch();
        const tp = await page.evaluate(() => performance.timeOrigin + performance.now());
        const t1 = nodeEpoch();
        if (t1 - t0 < best.rtt) best = { rtt: t1 - t0, off: tp - (t0 + t1) / 2 };
      }
      const nodeT: number[] = [];
      for (let i = 0; i < 20; i++) {
        nodeT.push(nodeEpoch());
        await page.keyboard.press('F12');
        await pause(30);
      }
      const k = await page.evaluate(() => (window as unknown as { __k: { ts: number; now: number; epoch: number }[] }).__k);
      const inPage = k.map((x) => x.now - x.ts);
      const fromNode = k.map((x, i) => x.epoch - best.off - nodeT[i]!);
      console.log(
        `  clock sync rtt ${f(best.rtt)} ms offset ${f(best.off)} ms; keydown: handler - timeStamp median ${f(inPage.sort((a, b) => a - b)[10]!)} ms; handler - node send median ${f(fromNode.sort((a, b) => a - b)[10]!)} ms (min ${f(Math.min(...fromNode))})`,
      );
      await page.context().close();
    }
    await browser.close();
  }
} finally {
  s1.close();
  s2.close();
}
