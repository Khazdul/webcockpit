// Per-thread CPU time of the browser while fixture text arrives under a
// cell of bench/float-frame.ts (stage 50): which Firefox thread does the
// work (main thread, WebRender's scene builder, backend, renderer, SWGL
// workers…). Linux only (/proc).
//
//   node bench/thread-cpu.ts --url http://localhost:5310 [--cells a,b] [--headed]
//
// Prints the threads with the most CPU time (ms) over the text phase of
// each cell (60 frames, 20–80 ms apart).

import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';

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

const L = await import('./lib');
const F = await import('./float-frame');
const { listFixtures } = await import('../tests/e2e/fixtures');

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const base = opt('url', 'http://localhost:5310');
const headed = argv.includes('--headed');
const cells: Record<string, import('./float-frame').Cell> = {
  framed: F.cell({ name: 'framed' }),
  noholes: F.cell({ name: 'noholes', css: '.wc-cockpit > .wc-game, .wc-cockpit > .wc-input-slot { clip-path: none !important; }' }),
  noborder: F.cell({ name: 'noborder', border: false }),
  inset: F.cell({ name: 'inset', css: '.wc-cockpit > .wc-game { clip-path: inset(0 0 60px 0) !important; }' }),
  opacity: F.cell({ name: 'opacity', css: '.wc-cockpit > .wc-game, .wc-cockpit > .wc-input-slot { opacity: 0.999; }' }),
  mozel: F.cell({
    name: 'mozel',
    css: '.wc-cockpit > .wc-game, .wc-cockpit > .wc-input-slot { clip-path: none !important; }',
    script: `(() => {
      const back = document.querySelector('.wc-weather-back'); back.id = 'wcback';
      const root = document.querySelector('.wc-cockpit').getBoundingClientRect();
      for (const el of document.querySelectorAll('.wc-cockpit > .wc-pane[data-floating]')) {
        const r = el.getBoundingClientRect();
        el.style.background = '-moz-element(#wcback) no-repeat';
        el.style.backgroundPosition = (root.left - r.left) + 'px ' + (root.top - r.top) + 'px';
        el.style.backgroundSize = root.width + 'px ' + root.height + 'px';
      }
    })()`,
  }),
  rimless: F.cell({ name: 'rimless', css: '.wc-pane-rim { display: none !important; }' }),
  windowless: F.cell({ name: 'windowless', css: '.wc-pane-frame::before { display: none !important; }' }),
  nofloatclip: F.cell({ name: 'nofloatclip', css: '.wc-pane-rim, .wc-pane-frame::before { clip-path: none !important; }' }),
  dock: F.cell({ name: 'dock', place: 'dock' }),
};
const names = opt('cells', Object.keys(cells).join(',')).split(',');
const fixture = listFixtures().at(-1);
const logText = readFileSync(fixture ? fixture.path : new URL('../tests/fixtures/map-demo.log', import.meta.url).pathname, 'utf8');
const TICK = 1000 / 100; // USER_HZ

/** CPU ms of every thread of every process whose command line names the Playwright Firefox. */
function threads(): Map<string, number> {
  const out = new Map<string, number>();
  for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
    let cmd = '';
    try {
      cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (!cmd.includes('ms-playwright/firefox')) continue;
    const kind = cmd.includes('-contentproc') ? (cmd.includes('-isForBrowser') ? 'content' : 'aux') : 'parent';
    let tasks: string[] = [];
    try {
      tasks = readdirSync(`/proc/${pid}/task`);
    } catch {
      continue;
    }
    for (const tid of tasks) {
      try {
        const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8');
        const comm = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
        const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        const ms = (Number(f[11]) + Number(f[12])) * TICK;
        const key = `${kind}:${comm.replace(/#\d+$/, '#')}`;
        out.set(key, (out.get(key) ?? 0) + ms);
      } catch {
        /* gone */
      }
    }
  }
  return out;
}

const t = await L.launchTarget('firefox', L.OWNER, [], { headless: !headed, firefoxArgs: F.MARIONETTE_ARGS });
console.log(`thread-cpu: ${await F.firefoxCompositor(t.browser)}, load ${L.loadavg()}`);
for (const n of names) {
  const c = cells[n]!;
  const page = await F.openCell(t, c, { base, logText });
  const total = await page.evaluate(([text, k]) => window.__wcBench!.loadFrames(text!, 1, k!), [logText, 60] as const);
  const a = threads();
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    await page.evaluate((k) => window.__wcBench!.inject(k), i);
    await L.pause(20 + Math.random() * 60);
  }
  const dt = performance.now() - t0;
  const b = threads();
  await L.closePage(page);
  const rows = [...b].map(([k, v]) => [k, v - (a.get(k) ?? 0)] as const).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  console.log(`\n${n}: ${(dt / 1000).toFixed(1)} s, CPU ms per thread (top 12):`);
  for (const [k, v] of rows.slice(0, 12)) console.log(`  ${k.padEnd(40)} ${v.toFixed(0).padStart(6)}`);
}
await t.browser.close();
