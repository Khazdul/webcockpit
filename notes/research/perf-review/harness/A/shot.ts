// Screenshot of the `?bench` page after a payload (headless), and a DOM census.
//   node perf/shot.ts [--browser firefox] [--payload p24a] [--port 4206] [--out file.png]
import { launch, openBench, pause, startServer, type BrowserName } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const PORT = Number(arg('port', '4206'));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const variant = arg('variant', '');
const server = await startServer(variant ? new URL('./dists/', import.meta.url).pathname : arg('dist', 'dist'), PORT);
const l = await launch(arg('browser', 'firefox') as BrowserName);
try {
  const page = await openBench(l, `http://127.0.0.1:${PORT}/${variant ? variant + '/' : ''}?bench`);
  await page.evaluate(installPerf);
  await page.evaluate(() => (window as any).__perf.connect());
  const pre = playLines(400);
  await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(pre)));
  for (const name of arg('payload', 'p24a').split(',')) {
    const p = payloads().find((x) => x.name === name)!;
    await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(p.lines)));
  }
  await page.evaluate(() => (window as any).__perf.drained());
  await pause(300);
  const census = await page.evaluate(() => {
    const all = document.querySelectorAll('*').length;
    const panes = [...document.querySelectorAll('.wc-pane')].map((p) => ({
      cls: p.className,
      hidden: (p as HTMLElement).hidden,
      rect: (() => {
        const r = p.getBoundingClientRect();
        return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      })(),
      nodes: p.querySelectorAll('*').length,
      canvas: p.querySelectorAll('canvas').length,
    }));
    const anims = document.getAnimations().map((a) => `${(a as any).animationName ?? a.id} on ${((a.effect as KeyframeEffect)?.target as Element)?.className}`);
    return { all, panes, anims, rows: document.querySelectorAll('.wc-row').length };
  });
  console.log(JSON.stringify(census, null, 1));
  await page.screenshot({ path: arg('out', '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/A/shot.png') });
} finally {
  await l.browser.close();
  server.close();
}
