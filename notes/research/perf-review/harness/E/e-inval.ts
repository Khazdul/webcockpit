// Area E: invalidation scope of pane / chrome updates with a full
// 20 000-row scrollback. For each action (a pane render, a status change, a
// settings change, a drag attribute, …) the style recalc element count and
// time, layout objects and time, and paint time in the frames that follow.
//
//   node perf/e-inval.ts [--browsers chromium,firefox] [--reps 5] [--build base] [--port 4245]
//
// Chromium: DevTools trace (UpdateLayoutTree elementCount, Layout
// dirty/total objects, Paint), with --enable-gpu --use-angle=vulkan.
// Firefox: Gecko profiler (Styles markers' elementsStyled, Reflow,
// DisplayList), MOZ_PROFILER_STARTUP. Both at 1728×1000, DPR 2, default
// layout (ADR 0023) with the map, session `playing`, 20 000 rows.

import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
const { contentMarkers, summariseMarkers } = await import('./ffprof.ts');
const { loadavg } = await import('./procstat.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const opt = (n: string, d: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : d;
};
const browsers = opt('browsers', 'chromium,firefox').split(',');
const reps = Number(opt('reps', '5'));
const build = opt('build', 'base');
const port = Number(opt('port', '4245'));
const logPath = opt('log', 'perf/play-88000-3m.log');
const out = opt('out', `perf/results/inval-${build}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);

const events: Array<{ at: number; b?: string; sent?: string }> = [];
for (const f of logToFrames(readFileSync(logPath, 'utf8'), { speed: 1, sends: true })) {
  if (f.sent !== undefined) events.push({ at: f.atMs, sent: f.sent });
  else if (f.bytes.length) events.push({ at: f.atMs, b: Buffer.from(f.bytes).toString('base64') });
}

const ACTIONS = [
  'line',
  'status',
  'clock',
  'char',
  'group',
  'timers',
  'vitals',
  'comm-msg',
  'ui-msg',
  'map-move',
  'relayout',
  'settings-comm',
  'drag',
  'caret-move',
  'cursor-blink',
] as const;

/** In the page: runs one action. */
async function act([name, i]: [string, number]): Promise<void> {
  const W = window as any;
  const probe = W.__wcBench;
  const app = probe.app;
  const gmcp = (payload: string): Uint8Array => {
    const body = new TextEncoder().encode(payload);
    const b = new Uint8Array(body.length + 5);
    b.set([255, 250, 201]);
    b.set(body, 3);
    b.set([255, 240], body.length + 3);
    return b;
  };
  const frames = (n: number) =>
    new Promise<void>((r) => {
      const step = (k: number) => (k <= 0 ? r() : requestAnimationFrame(() => step(k - 1)));
      step(n);
    });
  performance.mark(`A:${name}:${i}:start`);
  switch (name) {
    case 'line':
      probe.sock.onData(new TextEncoder().encode(`A plain line of text number ${i} for the baseline.\r\n`));
      break;
    case 'status':
      app.bus.emit('link.rtt', { ms: 40 + i, suspect: false });
      break;
    case 'clock':
      app.clockStrip.update();
      break;
    case 'char':
      app.cockpit.pane('character').markDirty();
      break;
    case 'group':
      app.cockpit.pane('group').markDirty();
      break;
    case 'timers':
      app.cockpit.pane('timers').markDirty();
      break;
    case 'vitals':
      probe.sock.onData(gmcp(`Char.Vitals {"hp":${200 + i},"hp-string":"Fine","mana":${50 + i},"mp":${90 - i}}`));
      break;
    case 'comm-msg':
      probe.sock.onData(gmcp(`Comm.Channel.Text {"channel":"tales","talker":"Gibur","talker-type":"player","text":"Gibur narrates 'message ${i}'"}`));
      break;
    case 'ui-msg':
      app.bus.emit('ui.message', { kind: 'system', parts: [`UI message ${i}`] });
      break;
    case 'map-move': {
      const walk: string[] = W.__walk;
      probe.sock.onData(gmcp(walk[i % walk.length]!));
      break;
    }
    case 'relayout':
      app.cockpit.relayoutNow();
      break;
    case 'settings-comm': {
      const cur = probe.settings.get().comm.filters.tales !== false;
      probe.settings.update({ comm: { filters: { tales: !cur } } });
      break;
    }
    case 'drag': {
      // As a real drag: the cockpit's own start (base: the data-drag mark;
      // exp-dragshield: setDragCursor) and endDrag().
      const c = app.cockpit;
      if (typeof c.setDragCursor === 'function') c.setDragCursor('move');
      else c.el.dataset.drag = 'move';
      await frames(2);
      c.endDrag();
      break;
    }
    case 'caret-move': {
      const f = app.input.input as HTMLInputElement;
      f.focus();
      f.value = 'look ' + 'x'.repeat(i % 5);
      f.setSelectionRange(f.value.length, f.value.length);
      f.dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }
    case 'cursor-blink': {
      const on = probe.settings.get().appearance.cursorBlink;
      probe.settings.update({ appearance: { cursorBlink: !on } });
      break;
    }
  }
  await frames(3);
  await new Promise((r) => setTimeout(r, 120));
  performance.mark(`A:${name}:${i}:end`);
}

async function prepare(page: import('@playwright/test').Page): Promise<number> {
  await page.goto(`http://127.0.0.1:${port}/?bench`);
  await page.waitForFunction(() => (window as any).__wcBench?.app != null);
  await page.evaluate(() => (window as any).__wcBench.connectFake());
  await page.waitForSelector('.wc-pane-map .wc-pane-content[data-map-drawn-ms]', { state: 'attached', timeout: 60_000 });
  // 15 s of play at speed 3 (panes filled, playing), then 21 000 rows.
  await page.evaluate(
    ([evs]) =>
      new Promise<void>((resolve) => {
        const W = window as any;
        const probe = W.__wcBench;
        const dec = evs.map((e) => (e.b !== undefined ? { at: e.at, bytes: Uint8Array.from(atob(e.b), (c) => c.charCodeAt(0)) } : e));
        W.__walk = [];
        const td = new TextDecoder();
        for (const e of dec) {
          if (!('bytes' in e)) continue;
          const s = td.decode(e.bytes as Uint8Array);
          const m = s.match(/Room\.Info \{[^\ufffd]*/g);
          if (m) for (const x of m) W.__walk.push(x);
        }
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
  await page.evaluate(async () => {
    const probe = (window as any).__wcBench;
    for (let b = 0; b < 21; b++) {
      let s = '';
      for (let k = 0; k < 1000; k++) {
        const n = b * 1000 + k;
        s += k % 10 === 0 ? `\x1b[32mA Room Called Number ${n}\x1b[0m\r\n` : `A line of plain description text, number ${n}, about seventy characters.\r\n`;
      }
      await probe.inject(s);
    }
    await probe.drained();
  });
  return page.evaluate(() => (window as any).__wcBench.rows as number);
}

type TEv = { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any };

function chromiumSlices(buf: Buffer) {
  const ev = (JSON.parse(buf.toString()) as { traceEvents: TEv[] }).traceEvents;
  const marks = ev.filter((e) => e.cat.includes('user_timing') && e.name.startsWith('A:'));
  const main = (() => {
    const c = new Map<string, number>();
    for (const e of ev) if (e.name === 'UpdateLayoutTree') c.set(`${e.pid}:${e.tid}`, (c.get(`${e.pid}:${e.tid}`) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1])[0]?.[0];
  })();
  const on = ev.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X');
  const byAction = new Map<string, Array<Record<string, number>>>();
  const starts = new Map<string, number>();
  for (const m of marks.sort((a, b) => a.ts - b.ts)) {
    const [, name, i, what] = m.name.split(':');
    const key = `${name}:${i}`;
    if (what === 'start') starts.set(key, m.ts);
    else if (what === 'end' && starts.has(key)) {
      const a = starts.get(key)!;
      const b = m.ts;
      const inW = on.filter((e) => e.ts >= a && e.ts <= b);
      const recalc = inW.filter((e) => e.name === 'UpdateLayoutTree');
      const layout = inW.filter((e) => e.name === 'Layout');
      const paint = inW.filter((e) => e.name === 'Paint');
      const sumD = (xs: TEv[]) => xs.reduce((s, e) => s + (e.dur ?? 0), 0) / 1000;
      const row = {
        recalcN: recalc.length,
        recalcEls: recalc.reduce((s, e) => s + Number(e.args?.elementCount ?? 0), 0),
        recalcMs: sumD(recalc),
        layoutN: layout.length,
        layoutObjs: layout.reduce((s, e) => s + Number(e.args?.beginData?.dirtyObjects ?? 0), 0),
        layoutMs: sumD(layout),
        paintMs: sumD(paint),
        prePaintMs: sumD(inW.filter((e) => e.name === 'PrePaint')),
        scriptMs: sumD(inW.filter((e) => e.name === 'FunctionCall' || e.name === 'FireAnimationFrame' || e.name === 'TimerFire')),
      };
      (byAction.get(name!) ?? byAction.set(name!, []).get(name!)!).push(row);
    }
  }
  return byAction;
}

function firefoxSlices(path: string) {
  const cm = contentMarkers(path, 'A:');
  const byAction = new Map<string, Array<Record<string, number>>>();
  if (!cm) return byAction;
  const starts = new Map<string, number>();
  for (const m of cm.marks.sort((a, b) => a.t - b.t)) {
    if (!m.name.startsWith('A:')) continue;
    const [, name, i, what] = m.name.split(':');
    const key = `${name}:${i}`;
    if (what === 'start') starts.set(key, m.t);
    else if (what === 'end' && starts.has(key)) {
      const s = summariseMarkers(cm.markers, [starts.get(key)!, m.t]);
      const row = {
        stylesN: s.Styles?.n ?? 0,
        styled: s.Styles?.styled ?? 0,
        stylesMs: s.Styles?.ms ?? 0,
        reflowMs: (s['Reflow (interruptible)']?.ms ?? 0) + (s['Reflow (sync)']?.ms ?? 0),
        reflowSyncN: s['Reflow (sync)']?.n ?? 0,
        displayListMs: s.DisplayList?.ms ?? 0,
        tickMs: s.RefreshDriverTick?.ms ?? 0,
        ticks: s.RefreshDriverTick?.n ?? 0,
      };
      (byAction.get(name!) ?? byAction.set(name!, []).get(name!)!).push(row);
    }
  }
  return byAction;
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

const server = await serveDir(`${ROOT}perf/builds/${build}`, port, true);
const results: Record<string, unknown> = { build, reps, load: loadavg() };
try {
  for (const bname of browsers) {
    const prof = `${ROOT}perf/results/ffprof-inval-${build}.json`;
    const browser =
      bname === 'firefox'
        ? await firefox.launch({
            firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' },
            env: {
              ...process.env,
              MOZ_PROFILER_STARTUP: '1',
              MOZ_PROFILER_SHUTDOWN: prof,
              MOZ_PROFILER_STARTUP_FEATURES: 'js,cpu,markersallthreads,nomarkerstacks',
              MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain',
              MOZ_PROFILER_STARTUP_INTERVAL: '1',
              MOZ_PROFILER_STARTUP_ENTRIES: '16777216',
            } as Record<string, string>,
          })
        : await chromium.launch({ args: ['--enable-gpu', '--use-angle=vulkan'] });
    const version = browser.version();
    const ctx = await browser.newContext({ viewport: { width: 1728, height: 1000 }, ...(bname === 'chromium' ? { deviceScaleFactor: 2 } : {}) });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    const rows = await prepare(page);
    console.log(`${bname} ${version}: ${rows} rows; load ${loadavg()}`);
    if (bname === 'chromium') await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'toplevel'] });
    const only = opt('actions', '');
    const acts = only ? ACTIONS.filter((a) => only.split(',').includes(a)) : ACTIONS;
    for (let i = 0; i < reps; i++) for (const a of acts) await page.evaluate(act, [a, i] as [string, number]).catch((e) => console.error(a, e));
    let slices: Map<string, Array<Record<string, number>>>;
    if (bname === 'chromium') {
      const tb = await browser.stopTracing();
      if (argv.includes('--savetrace')) writeFileSync(`${ROOT}perf/results/trace-inval-${build}.json`, tb);
      slices = chromiumSlices(tb);
      await browser.close();
    } else {
      await browser.close();
      slices = firefoxSlices(prof);
      rmSync(prof, { force: true });
    }
    const table: Record<string, Record<string, number>> = {};
    for (const [name, rs] of slices) {
      const keys = Object.keys(rs[0] ?? {});
      table[name] = Object.fromEntries(keys.map((k) => [k, Math.round(med(rs.map((r) => r[k]!)) * 1000) / 1000]));
    }
    results[bname] = { version, rows, table };
    console.table(table);
  }
} finally {
  server.close();
}
mkdirSync(`${ROOT}perf/results`, { recursive: true });
writeFileSync(`${ROOT}${out}`, JSON.stringify(results, null, 1));
console.log(`wrote ${out}`);
