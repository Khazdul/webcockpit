// Frame pacing and latency with floating (and docked) panes over the
// weather (stage 50, ADR 0135): the measures, shared by the matrix CLI
// (bench/frame-matrix.ts) and browser-bench's `float` section.
//
// One page per cell, at the owner's geometry, the map off, every setting of
// the cell as a `benchSettings` patch. Per cell:
// - idle:  3 s of our own rAF loop with nothing fed: the frame interval
//          (median / p95) and the frame rate.
// - text:  isolated fixture frames through the fake socket, 20–80 ms apart
//          (after 40 unmeasured ones):
//          receipt → painted (the probe's `inject`: delivery until a
//          MessageChannel message posted from the flush frame runs, i.e.
//          after that frame's main-thread paint).
// - keys:  real Playwright letter presses into the input line, 40–120 ms
//          apart: the keydown listener → the first rAF after the `input`
//          event, then its MessageChannel message (typed letter → rendered).
//
// Firefox's compositor (hardware WebRender or software) is read in the
// browser itself over Marionette (`firefoxCompositor`), so every report
// says which one it measured.

import net from 'node:net';
import type { Browser, Page } from '@playwright/test';
import { PAPER_PALETTE } from '../src/theme/presets';
import { type Dist, type Target, closePage, dist, openBench, pause } from './lib';

// ------------------------------------------------------------- the cells

export type FloatPaneId = 'statistics' | 'comm' | 'group';

export interface Cell {
  /** Short label for the report. */
  name: string;
  weather: boolean;
  /** The pane under test, floating (`float`) or docked in the right dock's tail. */
  pane: FloatPaneId;
  place: 'float' | 'dock';
  /** Outer size of the float in cells (frame included). */
  size: { w: number; h: number };
  border: boolean;
  glass: boolean;
  /** Paper (light) background instead of the dark default. */
  paper?: boolean;
  /** Extra CSS for the page (bisecting the frame's effects). */
  css?: string;
  /** A function body run in the page once the cell is open (prototypes). */
  script?: string;
}

/** The Statistics float's default size (src/layout/types.ts STATS_FLOAT): 80 × 24 content cells. */
export const LARGE = { w: 82, h: 26 } as const;
/** A small float: 14 × 6 content cells. */
export const SMALL = { w: 16, h: 8 } as const;

export const cell = (o: Partial<Cell> & { name: string }): Cell => ({
  weather: true,
  pane: 'statistics',
  place: 'float',
  size: LARGE,
  border: true,
  glass: true,
  ...o,
});

/** Options → Appearance's Paper background (src/theme/presets.ts). */
const PAPER = { bg: '#f4ecd8', fg: '#000000', ansi: PAPER_PALETTE };

/**
 * The settings patch of a cell: the map off, the weather on or off, the
 * pane under test on with the cell's border and glass, and the layout with
 * it either floating at the top-left of the game pane or docked.
 */
export function cellSettings(c: Cell): unknown {
  const dockRight = {
    lanes: [
      { size: 25, panes: c.pane === 'group' ? [] : [{ id: 'group', desired: 80 }] },
      { size: 25, panes: [{ id: 'timers', desired: 80 }] },
    ].filter((l) => l.panes.length > 0),
    head: [{ id: 'character', desired: 9 }],
    tail: [
      ...(c.pane === 'comm' ? [] : [{ id: 'comm', desired: 125 }]),
      { id: 'ui', desired: 31 },
      ...(c.place === 'dock' ? [{ id: c.pane, desired: 125 }] : []),
    ],
  };
  const floating = c.place === 'float' ? [{ id: c.pane, x: 2, y: 2, w: c.size.w, h: c.size.h, auto: false }] : [];
  return {
    panes: {
      map: { on: false },
      [c.pane]: { on: true, border: c.border, glass: c.glass },
    },
    weather: { enabled: c.weather },
    ...(c.paper ? { appearance: PAPER } : {}),
    layout: {
      docks: {
        left: { lanes: [], head: [], tail: [] },
        right: dockRight,
        top: { lanes: [], head: [], tail: [] },
        bottom: { lanes: [], head: [], tail: [] },
      },
      floating,
    },
  };
}

// ---------------------------------------------------------- the measures

export interface CellResult {
  /** rAF intervals with nothing fed. */
  interval: Dist;
  fps: number;
  /** Worst rAF interval over the whole cell (idle, text and keys). */
  worst: number;
  /** Receipt → painted. */
  text: Dist;
  /** rAF intervals while the text frames arrive. */
  busy: Dist;
  /** Typed letter (keydown listener) → rendered. */
  key: Dist;
  /** The pane's float rectangle as shown (CSS px), to check the cell took. */
  rect: string;
  /** Veils under the floats at the end (ADR 0135), not holes in the text. */
  veils: boolean;
  weatherRunning: boolean;
}

export interface CellOptions {
  base: string;
  /** Fixture log text: the frames `text` injects. */
  logText: string;
  /** Samples per measure. */
  texts?: number;
  keys?: number;
  idleMs?: number;
  /** Settle time after the weather started (ms). */
  settleMs?: number;
}

/** The pane's element: its root carries `data-pane="<id>"`. */
const paneRect = (page: Page, id: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`.wc-pane[data-pane="${id}"]`) as HTMLElement | null;
    if (!el) return 'missing';
    const r = el.getBoundingClientRect();
    return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;
  }, id);

export async function openCell(t: Target, c: Cell, o: CellOptions): Promise<Page> {
  const page = await openBench(t, o.base, { settings: cellSettings(c) });
  if (c.weather) {
    const ok = await page.evaluate(async () => {
      const ctl = await window.__wcBench!.app!.weather?.settled();
      if (!ctl) return false;
      await ctl.engine.ready;
      return true;
    });
    if (!ok) throw new Error(`${t.name} ${c.name}: the weather effects did not start`);
  }
  if (c.css) await page.addStyleTag({ content: c.css });
  if (c.script) await page.evaluate(c.script);
  await page.evaluate(() => window.__wcBench!.connectFake());
  await pause(o.settleMs ?? 2500);
  return page;
}

export async function measureCell(t: Target, c: Cell, o: CellOptions): Promise<CellResult> {
  const page = await openCell(t, c, o);
  const rect = await paneRect(page, c.pane);
  const weatherRunning = await page.evaluate(() => document.querySelector('.wc-cockpit[data-weather]') !== null);
  // A rAF loop for the whole cell.
  await page.evaluate(() => {
    const m = { d: [] as number[], run: true, mark: 0 };
    (window as unknown as { __ff: typeof m }).__ff = m;
    let last = performance.now();
    const f = () => {
      const now = performance.now();
      m.d.push(now - last);
      last = now;
      if (m.run) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await pause(o.idleMs ?? 3000);
  const idle = await page.evaluate(() => (window as unknown as { __ff: { d: number[] } }).__ff.d.slice(2));

  // Text receipt → painted.
  const N = o.texts ?? 60;
  // A warm-up long enough for App's FloatVeilWatch (ADR 0135) to decide
  // (24 judged frames): the measured frames are the steady state.
  const WARM = 40;
  const total = await page.evaluate(([text, k]) => window.__wcBench!.loadFrames(text!, 1, k!), [o.logText, N + WARM] as const);
  const text: number[] = [];
  let mark = 0;
  for (let i = 0; i < total; i++) {
    if (i === WARM) mark = await page.evaluate(() => (window as unknown as { __ff: { d: number[] } }).__ff.d.length);
    const r = await page.evaluate((k) => window.__wcBench!.inject(k), i);
    if (i >= WARM) text.push(r.toPaint);
    await pause(20 + Math.random() * 60);
  }

  const busy = await page.evaluate((m) => (window as unknown as { __ff: { d: number[] } }).__ff.d.slice(m), mark);

  // Typed letter → rendered.
  await page.evaluate(() => {
    const app = window.__wcBench!.app!;
    const el = app.input.input as HTMLElement;
    el.focus();
    const C = { keys: [] as Array<{ t0: number; paint: number }>, last: null as null | { t0: number; paint: number; input: boolean } };
    (window as unknown as { __kk: typeof C }).__kk = C;
    const mc = new MessageChannel();
    let q: Array<() => void> = [];
    mc.port1.onmessage = () => {
      const qq = q;
      q = [];
      for (const fn of qq) fn();
    };
    window.addEventListener(
      'keydown',
      () => {
        const k = { t0: performance.now(), paint: 0, input: false };
        C.last = k;
        C.keys.push(k);
      },
      true,
    );
    el.addEventListener('input', () => {
      const k = C.last;
      if (!k || k.input) return;
      k.input = true;
      requestAnimationFrame(() => {
        q.push(() => (k.paint = performance.now()));
        if (q.length === 1) mc.port2.postMessage(0);
      });
    });
  });
  const K = o.keys ?? 40;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < K; i++) {
    await page.keyboard.press(letters[i % 26]!);
    await pause(40 + Math.random() * 80);
  }
  await pause(200);
  const keys = await page.evaluate(() => {
    const C = (window as unknown as { __kk: { keys: Array<{ t0: number; paint: number }> } }).__kk;
    return C.keys.filter((k) => k.paint > 0).map((k) => k.paint - k.t0);
  });
  const veils = await page.evaluate(() => document.querySelector('.wc-float-veil') !== null);
  const all = await page.evaluate(() => {
    const m = (window as unknown as { __ff: { d: number[]; run: boolean } }).__ff;
    m.run = false;
    return m.d.slice(2);
  });
  await closePage(page);
  const iv = dist(idle);
  const mean = idle.reduce((a, b) => a + b, 0) / Math.max(1, idle.length);
  return { interval: iv, fps: 1000 / mean, worst: Math.max(...all), text: dist(text), busy: dist(busy), key: dist(keys), rect, weatherRunning, veils };
}

// ------------------------------------------------------------ compositor

/**
 * Launch arguments that let `firefoxCompositor` ask the browser over
 * Marionette (port 2828, chrome scope). Harmless otherwise.
 */
export const MARIONETTE_ARGS = ['-marionette', '-remote-allow-system-access'];

/**
 * Firefox's compositor as about:support shows it ("WebRender", "WebRender
 * (Software)"), the window protocol and the GPU, read over Marionette from
 * the browser launched with MARIONETTE_ARGS. "unknown: …" when Marionette
 * is not reachable.
 */
export async function firefoxCompositor(browser: Browser, port = 2828): Promise<string> {
  // Marionette's session waits for a browser window: hold a page open while asking.
  const page = await browser.newPage();
  try {
    return await Promise.race([askCompositor(port), pause(15000).then(() => 'unknown: Marionette timed out')]);
  } finally {
    await page.close();
  }
}

async function askCompositor(port: number): Promise<string> {
  try {
    const s = net.connect(port, '127.0.0.1');
    let buf = '';
    const waiters: Array<(m: unknown) => void> = [];
    s.on('data', (d) => {
      buf += d.toString();
      for (;;) {
        const i = buf.indexOf(':');
        if (i < 0) return;
        const n = Number(buf.slice(0, i));
        if (buf.length < i + 1 + n) return;
        const msg = JSON.parse(buf.slice(i + 1, i + 1 + n)) as unknown;
        buf = buf.slice(i + 1 + n);
        waiters.shift()?.(msg);
      }
    });
    const next = () => new Promise<unknown>((r, j) => (waiters.push(r), s.once('error', j)));
    let id = 0;
    const send = (name: string, params: unknown) => {
      const body = JSON.stringify([0, ++id, name, params]);
      s.write(`${Buffer.byteLength(body)}:${body}`);
      return next();
    };
    await next();
    await send('WebDriver:NewSession', {});
    await send('Marionette:SetContext', { value: 'chrome' });
    const r = (await send('WebDriver:ExecuteScript', {
      script: `const w = Services.wm.getMostRecentWindow('navigator:browser');
        const gi = Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo);
        return w.windowUtils.layerManagerType + ', ' + gi.windowProtocol + ', ' + gi.adapterDescription;`,
      args: [],
    })) as [number, number, { message?: string } | null, { value: string } | null];
    await send('WebDriver:DeleteSession', {});
    s.end();
    return r[3]?.value ?? `unknown: ${r[2]?.message ?? 'no answer'}`;
  } catch (e) {
    return `unknown: ${(e as Error).message}`;
  }
}
