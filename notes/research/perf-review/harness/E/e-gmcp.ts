// Area E: synchronous main-thread cost of GMCP messages, per bus handler
// (the pane models, the map forwarder, the timers hub …), and the map
// worker round trip on a move.
//
//   node perf/e-gmcp.ts [--browsers firefox,chromium] [--build base] [--port 4246] [--reps 200]
//
// The play log is fed for 15 s at speed 3 (session `playing`, panes filled,
// map located). Then each GMCP package of the log (Char.Vitals, Group.Update,
// Room.Info, Event.Moved, Comm.Channel.Text) is delivered `reps` times
// through the fake socket, and every `gmcp` / `gmcp.raw` bus handler is
// timed separately (performance.now around each call; cross-origin isolated
// pages have 5–20 µs timer resolution, so sums over many calls are used).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});

const { logToFrames } = await import('../src/net/replay-socket.ts');
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
const port = Number(opt('port', '4246'));
const reps = Number(opt('reps', '200'));
const logPath = opt('log', 'perf/play-88000-3m.log');
const out = opt('out', `perf/results/gmcp-${build}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);

const logText = readFileSync(logPath, 'utf8');
const events: Array<{ at: number; b?: string; sent?: string }> = [];
for (const f of logToFrames(logText, { speed: 1, sends: true })) {
  if (f.sent !== undefined) events.push({ at: f.atMs, sent: f.sent });
  else if (f.bytes.length) events.push({ at: f.atMs, b: Buffer.from(f.bytes).toString('base64') });
}
// Samples per package from the log (payload after "\x1bGMCP ").
const samples: Record<string, string[]> = {};
for (const l of logText.split('\n')) {
  const k = l.indexOf('\x1bGMCP ');
  if (k < 0) continue;
  const payload = l.slice(k + 6);
  const pkg = payload.slice(0, payload.indexOf(' '));
  (samples[pkg] ??= []).push(payload);
}
const PKGS = ['Char.Vitals', 'Group.Update', 'Room.Info', 'Event.Moved', 'Comm.Channel.Text'];

const server = await serveDir(`${ROOT}perf/builds/${build}`, port, true);
const results: Record<string, unknown> = { build, reps, load: loadavg() };
try {
  for (const bname of browsers) {
    const browser =
      bname === 'firefox'
        ? await firefox.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } })
        : await chromium.launch({ args: ['--enable-gpu', '--use-angle=vulkan'] });
    const version = browser.version();
    const ctx = await browser.newContext({ viewport: { width: 1728, height: 1000 }, ...(bname === 'chromium' ? { deviceScaleFactor: 2 } : {}) });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.goto(`http://127.0.0.1:${port}/?bench`);
    await page.waitForFunction(() => (window as any).__wcBench?.app != null);
    await page.evaluate(() => (window as any).__wcBench.connectFake());
    await page.waitForSelector('.wc-pane-map .wc-pane-content[data-map-drawn-ms]', { state: 'attached', timeout: 60_000 });
    await page.evaluate(
      ([evs]) =>
        new Promise<void>((resolve) => {
          const probe = (window as any).__wcBench;
          const dec = evs.map((e) => (e.b !== undefined ? { at: e.at, bytes: Uint8Array.from(atob(e.b), (c) => c.charCodeAt(0)) } : e));
          let i = 0;
          const t0 = performance.now();
          const step = (): void => {
            const now = performance.now() - t0;
            while (i < dec.length && dec[i].at / 3 <= now) {
              const e = dec[i++];
              if (e.sent !== undefined) probe.keyToSend(e.sent);
              else probe.sock.onData(e.bytes);
            }
            if (now > 15000 || i >= dec.length) return resolve();
            setTimeout(step, 20);
          };
          step();
        }),
      [events] as const,
    );
    const res = await page.evaluate(
      async ([samples, pkgs, reps]) => {
        const W = window as any;
        const probe = W.__wcBench;
        const app = probe.app;
        const handlers: Map<string, Array<{ fn: (p: unknown) => void; active: boolean }>> = app.bus.handlers;
        // Label every handler of the GMCP-related bus types by its source.
        const acc = new Map<string, { n: number; ms: number }>();
        let curPkg = '';
        for (const type of ['gmcp', 'gmcp.raw']) {
          const list = handlers.get(type) ?? [];
          list.forEach((e, idx) => {
            const src = String(e.fn).replace(/\s+/g, ' ').slice(0, 90);
            const label = `${type}#${idx} ${src}`;
            const fn = e.fn;
            e.fn = (p: unknown) => {
              const t0 = performance.now();
              try {
                fn(p);
              } finally {
                const k = `${curPkg} | ${label}`;
                const a = acc.get(k) ?? { n: 0, ms: 0 };
                a.n++;
                a.ms += performance.now() - t0;
                acc.set(k, a);
              }
            };
          });
        }
        const gmcp = (payload: string): Uint8Array => {
          const body = new TextEncoder().encode(payload);
          const b = new Uint8Array(body.length + 5);
          b.set([255, 250, 201]);
          b.set(body, 3);
          b.set([255, 240], body.length + 3);
          return b;
        };
        // Map worker round trip: time from a Room.Info delivery to the
        // worker's next `status` message on the main thread.
        const worker = app.cockpit.pane('map').client?.worker as Worker | undefined;
        const total: Record<string, { n: number; ms: number; perMsgUs: number; rtMs?: number[] }> = {};
        for (const pkg of pkgs) {
          const list: string[] = samples[pkg] ?? [];
          if (!list.length) continue;
          const bytes = list.map(gmcp);
          const rts: number[] = [];
          let t = 0;
          for (let r = 0; r < reps; r++) {
            const b = bytes[r % bytes.length]!;
            curPkg = pkg;
            let wait: Promise<void> | null = null;
            if (pkg === 'Room.Info' && worker && r % 10 === 0) {
              const t1 = performance.now();
              wait = new Promise<void>((ok) => {
                const on = (e: MessageEvent) => {
                  if (e.data?.t === 'status' || e.data?.t === 'drawn') {
                    worker.removeEventListener('message', on);
                    rts.push(performance.now() - t1);
                    ok();
                  }
                };
                worker.addEventListener('message', on);
                setTimeout(ok, 500);
              });
            }
            const t0 = performance.now();
            probe.sock.onData(b);
            t += performance.now() - t0;
            if (wait) await wait;
            if (r % 20 === 19) await new Promise((ok) => requestAnimationFrame(() => ok(null)));
          }
          total[pkg] = { n: reps, ms: t, perMsgUs: (t / reps) * 1000, ...(rts.length ? { rtMs: rts } : {}) };
        }
        const rows = [...acc].map(([k, v]) => ({ k, n: v.n, usPer: (v.ms / v.n) * 1000, ms: v.ms })).sort((a, b) => b.ms - a.ms);
        return { total, rows };
      },
      [samples, PKGS, reps] as const,
    );
    console.log(`\n${bname} ${version}: per message (sock.onData → all sync handlers), µs:`);
    for (const [pkg, t] of Object.entries(res.total)) {
      const rt = t.rtMs ? ` ; worker round trip ms median ${[...t.rtMs].sort((a, b) => a - b)[Math.floor(t.rtMs.length / 2)]!.toFixed(2)}` : '';
      console.log(`  ${pkg.padEnd(18)} ${t.perMsgUs.toFixed(1)}${rt}`);
    }
    console.log('  top handlers (µs per call):');
    for (const r of res.rows.slice(0, 25)) console.log(`   ${r.usPer.toFixed(1).padStart(7)}  n=${r.n}  ${r.k.slice(0, 150)}`);
    results[bname] = { version, ...res };
    await browser.close();
  }
} finally {
  server.close();
}
mkdirSync(`${ROOT}perf/results`, { recursive: true });
writeFileSync(`${ROOT}${out}`, JSON.stringify(results, null, 1));
console.log(`wrote ${out}`);
