// Area E, long sessions: cost of the UI pane's sessionStorage ring write
// and of a Comm / UI render once their 1000-entry histories are full.
//
//   node perf/e-rings.ts [--browsers firefox,chromium] [--build base] [--port 4248]
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { chromium, firefox } = await import('@playwright/test');
const { serveDir } = await import('./serve.ts');
const { loadavg } = await import('./procstat.ts');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const opt = (n: string, d: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : d;
};
const browsers = opt('browsers', 'firefox,chromium').split(',');
const build = opt('build', 'base');
const port = Number(opt('port', '4248'));
const server = await serveDir(`${ROOT}perf/builds/${build}`, port, true);
const out: Record<string, unknown> = { build, load: loadavg() };
try {
  for (const bname of browsers) {
    const b =
      bname === 'firefox'
        ? await firefox.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } })
        : await chromium.launch({ args: ['--enable-gpu', '--use-angle=vulkan'] });
    const page = await b.newPage({ viewport: { width: 1728, height: 1000 }, ...(bname === 'chromium' ? { deviceScaleFactor: 2 } : {}) });
    await page.goto(`http://127.0.0.1:${port}/?bench`);
    await page.waitForFunction(() => (window as any).__wcBench?.app != null);
    const r = await page.evaluate(async () => {
      const W = window as any;
      const probe = W.__wcBench;
      probe.settings.update({ panes: { map: { on: false } } });
      probe.connectFake();
      const app = probe.app;
      const gmcp = (payload: string): Uint8Array => {
        const body = new TextEncoder().encode(payload);
        const bb = new Uint8Array(body.length + 5);
        bb.set([255, 250, 201]);
        bb.set(body, 3);
        bb.set([255, 240], body.length + 3);
        return bb;
      };
      probe.sock.onData(new Uint8Array([255, 251, 201])); // IAC WILL GMCP
      probe.sock.onData(gmcp('Char.Name {"name":"Rasta","fullname":"Rasta"}'));
      const frames = (n: number) => new Promise<void>((ok) => { const s = (k: number) => (k <= 0 ? ok() : requestAnimationFrame(() => s(k - 1))); s(n); });
      await frames(3);
      const ui = app.cockpit.pane('ui');
      const comm = app.cockpit.pane('comm');
      const time = (fn: () => void, n: number) => {
        const ts: number[] = [];
        for (let i = 0; i < n; i++) {
          const t0 = performance.now();
          fn();
          ts.push(performance.now() - t0);
        }
        ts.sort((a, b) => a - b);
        return { med: ts[Math.floor(n / 2)], max: ts[n - 1] };
      };
      const res: Record<string, unknown> = {};
      for (const fill of [10, 1000]) {
        for (let guard = 0; ui.messages.length < fill && guard < 5000; guard++) app.bus.emit('ui.message', { kind: 'state', tag: 'SPELL', parts: ['Shield ', { value: 'fades' }, ` after ${ui.messages.length} minutes of use, a longer line`] });
        for (let guard = 0; comm.messages.length < fill && guard < 5000; guard++)
          probe.sock.onData(gmcp(`Comm.Channel.Text {"channel":"tales","talker":"Gibur","talker-type":"player","text":"Gibur narrates 'message ${comm.messages.length} with a bit of text to wrap in the pane'"}`));
        await frames(3);
        await new Promise((ok) => setTimeout(ok, 400));
        const json = JSON.stringify(ui.messages).length;
        res[`ui${fill}`] = {
          ringJsonBytes: json,
          flushStorage: time(() => ui.flushStorage(), 30),
          render: time(() => ui.render(), 30),
        };
        res[`comm${fill}`] = { messages: comm.messages.length, render: time(() => comm.render(), 30) };
      }
      return res;
    });
    console.log(bname, b.version(), JSON.stringify(r));
    out[bname] = { version: b.version(), ...r };
    await b.close();
  }
} finally {
  server.close();
}
mkdirSync(`${ROOT}perf/results`, { recursive: true });
writeFileSync(`${ROOT}perf/results/rings-${build}.json`, JSON.stringify(out, null, 1));
