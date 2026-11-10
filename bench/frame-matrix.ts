// Frame pacing and latency matrix: floating and docked panes over the
// weather (stage 50, ADR 0135). The measures are in bench/float-frame.ts.
//
//   node bench/frame-matrix.ts [--url http://localhost:5310] [--port 5310]
//     [--modes headed,headed-sw,headless] [--browsers firefox,chromium] [--runs 3]
//     [--cells a,b,…] [--out bench/results/frame-matrix.md] [--quick]
//
// Without --url it builds the app and serves it with `vite preview` on
// --port. `headed` opens real windows (needs a display); a headed Firefox
// runs hardware WebRender where the machine allows it, and every Firefox
// row records the compositor it ran (about:support's "Compositing", read
// over Marionette). Runs are interleaved: each round measures every cell
// once, in order, in every mode and browser.
//
// Writes a Markdown report (default bench/results/frame-matrix.md).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const { f1, loadavg, launchTarget, OWNER } = L;
type Cell = import('./float-frame').Cell;
type CellResult = import('./float-frame').CellResult;
type TargetName = import('./lib').TargetName;

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const QUICK = argv.includes('--quick');
const PORT = Number(opt('port', '5310'));
const RUNS = Number(opt('runs', '1'));
/**
 * headed: a real window (hardware WebRender where the machine has it);
 * headed-sw: a real window with Firefox's software WebRender, forced by
 * Mesa's software GL (`LIBGL_ALWAYS_SOFTWARE=1`: Firefox falls back as on
 * a machine without a usable GPU); headless: no window (software WebRender).
 */
type Mode = 'headed' | 'headed-sw' | 'headless';
const MODES = opt('modes', 'headed,headless').split(',').filter(Boolean) as Mode[];
const BROWSERS = opt('browsers', 'firefox').split(',').filter(Boolean) as TargetName[];
const OUT = opt('out', new URL('./results/frame-matrix.md', import.meta.url).pathname);

const { cell, LARGE, SMALL } = F;
/** In the page: rewrites every hole clip (`path(evenodd, "M…Z…")` of rects) as `polygon(evenodd, …)`. */
function toPolygon(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.wc-cockpit > *')) {
    const cp = el.style.clipPath;
    if (!cp.startsWith('path(')) continue;
    const rects = [...cp.matchAll(/M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*H\s*(-?[\d.]+)\s*V\s*(-?[\d.]+)\s*H\s*(-?[\d.]+)\s*Z/g)].map((m) => [+m[1]!, +m[2]!, +m[3]!, +m[4]!] as const);
    const [box, ...holes] = rects;
    if (!box) continue;
    const p = (x: number, y: number) => `${x}px ${y}px`;
    const [bx0, by0, bx1, by1] = box;
    const pts = [p(bx0, by0), p(bx1, by0), p(bx1, by1), p(bx0, by1), p(bx0, by0)];
    for (const [x0, y0, x1, y1] of holes) pts.push(p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1), p(x0, y0), p(bx0, by0));
    el.style.clipPath = `polygon(evenodd, ${pts.join(', ')})`;
  }
}
/** In the page: turns the `#perf` overlay on as `#perf` does (App's private `perfOverlayOn`). */
const OVERLAY_ON = `(async () => {
  await window.__wcBench.app.perfOverlayOn(true);
  if (!document.querySelector('.wc-perf-overlay')) throw new Error('no #perf overlay');
})()`;
const BISECT: Record<string, string> = {
  /** The holes under the float: no clip on the game text and the input line. */
  holes: '.wc-cockpit > .wc-game, .wc-cockpit > .wc-input-slot { clip-path: none !important; }',
  /** The iron band's path clip. */
  rimclip: '.wc-pane-rim { clip-path: none !important; }',
  /** The band's gradients (rivets, brackets, sheen): flat iron. */
  rimbg: '.wc-pane-rim { background: var(--iron) !important; }',
  /** The band's edge (::before border and inset shadows). */
  rimedge: '.wc-pane-rim::before { display: none !important; }',
  /** The whole band. */
  rim: '.wc-pane-rim { display: none !important; }',
  /** The seams (SVG). */
  seam: '.wc-pane-seam { display: none !important; }',
  /** The glow round the frame box. */
  glow: '.wc-pane[data-framed] > .wc-pane-frame { box-shadow: none !important; }',
  /** The window's path clip round the hood. */
  winclip: '.wc-pane-frame::before { clip-path: none !important; }',
  /** The window's lamp gradients. */
  winbg: '.wc-pane-frame::before { background: var(--window-base) !important; }',
  /** The window's vignette and lamp hairline (inset shadows). */
  winshadow: '.wc-pane-frame::before { box-shadow: none !important; }',
  /** The whole window layer. */
  window: '.wc-pane-frame::before { display: none !important; }',
  /** The hood: its shadows, clip and the title's glow. */
  hood: '.wc-pane-title { box-shadow: none !important; clip-path: none !important; text-shadow: none !important; }',
};
/** Every cell the matrix knows, by name. */
const CATALOG: Cell[] = [
  cell({ name: 'stats-large' }),
  cell({ name: 'stats-large-noweather', weather: false }),
  cell({ name: 'stats-large-noborder', border: false }),
  cell({ name: 'stats-large-clear', glass: false }),
  cell({ name: 'stats-small', size: SMALL }),
  cell({ name: 'comm-large', pane: 'comm' }),
  cell({ name: 'group-large', pane: 'group' }),
  cell({ name: 'stats-dock', place: 'dock' }),
  cell({ name: 'stats-large-paper', paper: true }),
  // Bisecting the frame's effects (stage 50): the large framed Statistics float over the weather, less one effect each.
  ...Object.entries(BISECT).map(([k, css]) => cell({ name: `bisect-${k}`, css })),
  // Prototypes: the hole clip as a polygon instead of a path; the game text on its own layer.
  cell({ name: 'proto-polygon', script: `(${toPolygon.toString()})()` }),
  cell({ name: 'proto-layer', css: '.wc-cockpit > .wc-game { will-change: transform; }' }),
  // The `#perf` overlay on (ADR 0135): its own cost, against the same cell without it.
  cell({ name: 'overlay-dock', place: 'dock', script: OVERLAY_ON }),
  cell({ name: 'overlay-large', script: OVERLAY_ON }),
  cell({ name: 'proto-plainveil', css: '.wc-float-veil { background-image: none !important; }' }),
  cell({ name: 'proto-floatlayer', css: '.wc-cockpit > .wc-pane[data-floating] { will-change: transform; }' }),
  cell({ name: 'proto-framelayer', css: '.wc-pane-rim, .wc-pane-frame, .wc-pane-title { will-change: transform; }' }),
  cell({ name: 'stats-large-clear-noweather', glass: false, weather: false }),
  cell({ name: 'proto-polygon-check', script: `(${toPolygon.toString()})(); const c = document.querySelector('.wc-cockpit > .wc-game').style.clipPath; if (!c.startsWith('polygon')) throw new Error('no polygon: ' + c.slice(0, 40));` }),
  cell({ name: 'proto-polygon-layer', css: '.wc-cockpit > .wc-game { will-change: transform; }', script: `(${toPolygon.toString()})()` }),
];
const byName = new Map(CATALOG.map((c) => [c.name, c]));
const CELLS = opt('cells', 'stats-large,stats-large-noweather,stats-large-noborder,stats-large-clear,stats-small,comm-large,group-large,stats-dock')
  .split(',')
  .map((n) => {
    const c = byName.get(n);
    if (!c) throw new Error(`unknown cell ${n}; known: ${[...byName.keys()].join(', ')}`);
    return c;
  });

const fixture = listFixtures().at(-1);
const logText = readFileSync(fixture ? fixture.path : new URL('../tests/fixtures/map-demo.log', import.meta.url).pathname, 'utf8');

let base = opt('url', '');
let server: { close(): Promise<void> | void } | null = null;
if (!base) {
  const { build, preview } = await import('vite');
  console.log('frame-matrix: building…');
  await build({ logLevel: 'warn' });
  const s = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
  server = { close: () => s.close() };
  base = `http://localhost:${PORT}`;
}

interface Row {
  mode: string;
  browser: TargetName;
  compositor: string;
  cell: string;
  run: number;
  load: string;
  r: CellResult;
}
const rows: Row[] = [];
const started = Date.now();
const loadStart = loadavg();
console.log(`frame-matrix: ${base}, ${CELLS.length} cells × ${MODES.join('/')} × ${BROWSERS.join('/')} × ${RUNS} runs, load ${loadStart}`);

for (let run = 1; run <= RUNS; run++) {
  for (const mode of MODES) {
    for (const b of BROWSERS) {
      const t = await launchTarget(b === 'chromium' ? 'chromium-gpu' : b, OWNER, [], {
        headless: mode === 'headless',
        firefoxArgs: b === 'firefox' ? F.MARIONETTE_ARGS : [],
        // The `gfx.webrender.software` pref does not take here (still hardware); no GL does, as on a machine without a usable GPU.
        ...(mode === 'headed-sw' ? { env: { LIBGL_ALWAYS_SOFTWARE: '1' } } : {}),
      });
      const compositor = b === 'firefox' ? await F.firefoxCompositor(t.browser) : `${await L.glRenderer(t.browser)}`;
      console.log(`run ${run} ${mode} ${b}: ${compositor}`);
      for (const c of CELLS) {
        const load = loadavg();
        const r = await F.measureCell(t, c, { base, logText, texts: QUICK ? 20 : 60, keys: QUICK ? 15 : 40 });
        rows.push({ mode, browser: b, compositor, cell: c.name, run, load, r });
        console.log(
          `  ${c.name.padEnd(24)} fps ${f1(r.fps).padStart(5)}  interval ${f1(r.interval.median)}/${f1(r.interval.p95)}  worst ${f1(r.worst)}  busy ${f1(r.busy.median)}/${f1(r.busy.p95)}  text ${f1(r.text.median)}/${f1(r.text.p95)}  key ${f1(r.key.median)}/${f1(r.key.p95)}  [${r.rect}${r.weatherRunning ? ', weather' : ''}${r.veils ? ', veils' : ''}] load ${load}`,
        );
      }
      await t.browser.close();
    }
  }
}
await server?.close();

const head = '| Mode | Browser | Cell | Run | fps | Interval median / p95 | Worst frame | Interval under text median / p95 | Text → painted median / p95 | Letter → rendered median / p95 | Load |';
const sep = '|---|---|---|---|---|---|---|---|---|---|---|';
const md = [
  '# Frame matrix (stage 50)',
  '',
  `Generated by \`node bench/frame-matrix.ts${argv.length ? ' ' + argv.join(' ') : ''}\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC (${((Date.now() - started) / 60000).toFixed(1)} min), load ${loadStart} at the start. Geometry ${L.geometryText(OWNER)}.`,
  '',
  'Compositors:',
  '',
  ...[...new Set(rows.map((r) => `- ${r.mode} ${r.browser}: ${r.compositor}`))],
  '',
  head,
  sep,
  ...rows.map(
    (x) =>
      `| ${x.mode} | ${x.browser} | ${x.cell}${x.r.veils ? " (veils)" : ""} | ${x.run} | ${f1(x.r.fps)} | ${f1(x.r.interval.median)} / ${f1(x.r.interval.p95)} | ${f1(x.r.worst)} | ${f1(x.r.busy.median)} / ${f1(x.r.busy.p95)} | ${f1(x.r.text.median)} / ${f1(x.r.text.p95)} | ${f1(x.r.key.median)} / ${f1(x.r.key.p95)} | ${x.load} |`,
  ),
  '',
];
mkdirSync(new URL('./results/', import.meta.url).pathname, { recursive: true });
writeFileSync(OUT, md.join('\n'));
console.log(`frame-matrix: wrote ${OUT}`);
