// Owner-geometry scenarios for bench/browser-bench.ts (performance review
// §7, report #15), adapted from the review harnesses in
// notes/research/perf-review/harness/ (A: render, E: panes, D: long
// sessions, B: ingest):
//
// - caret:   visible, blinking caret; isolated short lines 150–450 ms
//            apart (receipt → rendered), then an idle window (frames/s
//            while nothing arrives).
// - play:    a play log with synthesized GMCP (playing, all panes active,
//            map on); every animation frame classified as output flush
//            only / output flush + pane render / pane render only.
// - colour:  MUME's 24-bit and 256-colour help pages: the page frame and
//            the next 20 small frames.
// - scroll:  full scrollback (20 000 rows): trim frames vs normal frames,
//            enter / leave scroll mode, a width change, dock drag start /
//            drop.
// - rules:   the fixture through the whole ingest path (fake socket →
//            telnet → assembler → script engine → recorder → output queue)
//            with and without the 500 rules, interleaved.
//
// Load after the resolve hook (browser-bench.ts).

import type { Page } from '@playwright/test';
import { colourPages, combatFrame, loginFrames, playLog, busyWindow, synthBatch } from './feeds';
import { type Target, TRACE_CATEGORIES, closePage, dist, mapSetting, max, median, openBench, pause } from './lib';

export interface Ctx {
  base: string;
  /** Scale for sample counts and windows (1 default, smaller with --quick). */
  scale: number;
  logText: string;
  ruleProfile: string;
}

const n = (ctx: Ctx, full: number, min = 3) => Math.max(min, Math.round(full * ctx.scale));

const MAP_CONTENT = '.wc-pane-map .wc-pane-content';
export async function waitMap(page: Page): Promise<void> {
  await page.waitForSelector(`${MAP_CONTENT}[data-map-drawn-ms]`, { state: 'attached', timeout: 60_000 });
}

/** Connects the fake socket and logs in with GMCP (playing: panes active, recorder on). */
export async function fakeLogin(page: Page): Promise<string> {
  return page.evaluate(async (frames) => {
    const B = window.__wcBench!;
    B.connectFake();
    for (const s of frames) B.deliver(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
    await new Promise((r) => setTimeout(r, 400));
    return B.app!.session.state;
  }, loginFrames());
}

// ------------------------------------------------------------------ caret

/** Chromium trace: main-thread frames (Commit) and compositor BeginFrame / DrawFrame per second. */
function traceFrameRates(buf: Buffer, windowMs: number): { commit: number; begin: number; draw: number } {
  type Ev = { name: string; ph: string; pid: number; tid: number; args?: { name?: string } };
  const ev = (JSON.parse(buf.toString()) as { traceEvents: Ev[] }).traceEvents;
  const names = new Map<string, string>();
  for (const e of ev) if (e.name === 'thread_name' && e.ph === 'M') names.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
  const busy = new Map<string, number>();
  for (const e of ev) {
    const k = `${e.pid}:${e.tid}`;
    if (names.get(k) === 'CrRendererMain') busy.set(k, (busy.get(k) ?? 0) + 1);
  }
  const main = [...busy].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const pid = main.split(':')[0];
  const comp = [...names].find(([k, v]) => v === 'Compositor' && k.split(':')[0] === pid)?.[0] ?? '';
  const count = (thread: string, name: string) => ev.filter((e) => `${e.pid}:${e.tid}` === thread && e.name === name && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i')).length;
  const s = windowMs / 1000;
  return { commit: count(main, 'Commit') / s, begin: count(comp, 'BeginFrame') / s, draw: count(comp, 'DrawFrame') / s };
}

export async function benchCaret(t: Target, ctx: Ctx) {
  const page = await openBench(t, ctx.base, { settings: mapSetting(false), frames: true });
  const state = await fakeLogin(page);
  // A command leaves its text selected (the caret hides); End gives a
  // collapsed, visible, blinking caret, as while composing a command.
  await page.focus('.wc-input-field');
  await page.keyboard.press('End');
  await pause(1500);
  const caret = await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('.wc-caret');
    return {
      present: c !== null,
      hidden: c ? c.hidden || getComputedStyle(c).display === 'none' : true,
      animations: document.getAnimations().length,
      blinkSetting: document.documentElement.dataset.cursorBlink ?? null,
    };
  });
  // Caret toggles (a JS blink changes a class; each toggle renders a frame).
  await page.evaluate(() => {
    const w = window as unknown as { __toggles: number };
    w.__toggles = 0;
    const c = document.querySelector('.wc-caret');
    if (c) new MutationObserver(() => w.__toggles++).observe(c, { attributes: true, attributeFilter: ['class', 'hidden'] });
  });
  const secs = n(ctx, 20, 6);
  const lat: Array<{ toFlush: number; toPaint: number; script: number }> = [];
  const end = Date.now() + secs * 1000;
  for (let k = 0; Date.now() < end; k++) {
    lat.push(await page.evaluate((i) => window.__wcBench!.inject(`A short line of game text number ${i}.\r\n`), k));
    await pause(150 + Math.random() * 300);
  }
  const togglesLat = await page.evaluate(() => (window as unknown as { __toggles: number }).__toggles);
  // Idle: nothing arrives; frames with rAF callbacks, caret toggles and
  // (Chromium) the rendering pipeline's own frame counts.
  await pause(1000);
  const idleS = n(ctx, 10, 5);
  await page.evaluate(() => {
    const B = window.__wcBench!;
    B.animFrames.length = 0;
    B.animLogOn = true;
    (window as unknown as { __toggles: number }).__toggles = 0;
  });
  if (t.isChromium) await t.browser.startTracing(page, { categories: [...TRACE_CATEGORIES, 'disabled-by-default-devtools.timeline.frame', 'cc', 'viz'] });
  const t0 = Date.now();
  await pause(idleS * 1000);
  const idleMs = Date.now() - t0;
  const trace = t.isChromium ? traceFrameRates(await t.browser.stopTracing(), idleMs) : null;
  const idle = await page.evaluate(() => {
    const B = window.__wcBench!;
    B.animLogOn = false;
    return { frames: B.animFrames.length, toggles: (window as unknown as { __toggles: number }).__toggles, flushes: B.animFrames.filter((f) => f.flush > 0).length };
  });
  await closePage(page);
  const wait = lat.map((x) => x.toFlush - x.script);
  return {
    state,
    caret,
    lines: lat.length,
    blinkPerS: togglesLat / secs,
    toPaint: dist(lat.map((x) => x.toPaint)),
    wait: dist(wait),
    idleS: idleMs / 1000,
    idleRafPerS: idle.frames / (idleMs / 1000),
    idleTogglesPerS: idle.toggles / (idleMs / 1000),
    /** Frames with rAF callbacks plus caret toggles (each renders a frame): an upper bound. */
    idleFramesPerS: (idle.frames + idle.toggles) / (idleMs / 1000),
    trace,
  };
}

// ------------------------------------------------------------------- play

const SPEED = 2;

export async function benchPlay(t: Target, ctx: Ctx) {
  const page = await openBench(t, ctx.base, { settings: mapSetting(true), frames: true });
  await waitMap(page);
  const warmS = 5;
  const secs = n(ctx, 30, 8);
  const log = playLog(ctx.logText, { fromLine: busyWindow(ctx.logText, 90), maxMs: (warmS + secs + 5) * SPEED * 1000 });
  await page.evaluate(() => window.__wcBench!.connectFake());
  await page.evaluate((text) => window.__wcBench!.loadPlay(text), log.text);
  await page.evaluate((s) => window.__wcBench!.play(s, 5000), SPEED);
  const out = await page.evaluate(
    async ([s, ms]) => {
      const B = window.__wcBench!;
      B.animFrames.length = 0;
      B.flushes.length = 0;
      B.animLogOn = true;
      const r = await B.play(s!, ms!);
      B.animLogOn = false;
      await new Promise((res) => setTimeout(res, 100));
      return { r, frames: B.animFrames, state: B.app!.session.state };
    },
    [SPEED, secs * 1000] as const,
  );
  await closePage(page);
  const fr = out.frames.filter((f) => f.after >= 0);
  const O = fr.filter((f) => f.flush > 0 && f.panes.length === 0);
  const OP = fr.filter((f) => f.flush > 0 && f.panes.length > 0);
  const P = fr.filter((f) => f.flush === 0 && f.panes.length > 0);
  const perPane: Record<string, number> = {};
  for (const f of fr) for (const p of f.panes) perPane[p] = (perPane[p] ?? 0) + 1;
  const windowS = out.r.ms / 1000;
  return {
    state: out.state,
    counts: log.counts,
    windowS,
    frames: fr.length,
    O: dist(O.map((f) => f.after)),
    OP: dist(OP.map((f) => f.after)),
    P: dist(P.map((f) => f.after)),
    flushO: median(O.map((f) => f.flush)),
    flushOP: median(OP.map((f) => f.flush)),
    paneOP: dist(OP.map((f) => f.paneMs)),
    panesPerS: Object.fromEntries(Object.entries(perPane).map(([k, v]) => [k, v / windowS])),
    keys: out.r.keys.length,
  };
}

// ----------------------------------------------------------------- colour

export async function benchColour(t: Target, ctx: Ctx) {
  const page = await openBench(t, ctx.base, { settings: mapSetting(false) });
  await page.evaluate(() => window.__wcBench!.connectFake());
  for (let i = 0; i < 2; i++) await page.evaluate((s) => window.__wcBench!.inject(s), synthBatch(1000, 900 + i));
  await page.evaluate(() => window.__wcBench!.drained());
  const pages = { '24-bit': colourPages('24-bit')[0]!, '256': colourPages('256')[0]! };
  type R = { pageFrame: number[]; pageScript: number[]; pagePaint: number[]; next: number[] };
  const res: Record<'24-bit' | '256', R> = {
    '24-bit': { pageFrame: [], pageScript: [], pagePaint: [], next: [] },
    '256': { pageFrame: [], pageScript: [], pagePaint: [], next: [] },
  };
  const reps = n(ctx, 8, 2);
  let k = 0;
  for (let rep = 0; rep < reps; rep++) {
    const order: Array<'24-bit' | '256'> = rep % 2 === 0 ? ['24-bit', '256'] : ['256', '24-bit'];
    for (const kind of order) {
      await pause(300);
      const r = await page.evaluate((s) => window.__wcBench!.inject(s), pages[kind]);
      const x = res[kind];
      x.pageFrame.push(r.toPaint - (r.toFlush - r.script));
      x.pageScript.push(r.script);
      x.pagePaint.push(r.toPaint);
      for (let i = 0; i < 20; i++) {
        await pause(25 + Math.random() * 35);
        const c = await page.evaluate((s) => window.__wcBench!.inject(s), combatFrame(k++));
        x.next.push(c.toPaint - (c.toFlush - c.script));
      }
    }
  }
  await closePage(page);
  const out = (x: R) => ({ pageFrame: dist(x.pageFrame), pageScript: dist(x.pageScript), pagePaint: dist(x.pagePaint), next: dist(x.next) });
  return { reps, c24: out(res['24-bit']), c256: out(res['256']) };
}

// ----------------------------------------------------------------- scroll

export async function benchScrollActions(t: Target, ctx: Ctx) {
  const page = await openBench(t, ctx.base, { settings: mapSetting(false) });
  await page.evaluate(() => window.__wcBench!.connectFake());
  for (let i = 0; i < 22; i++) await page.evaluate((s) => window.__wcBench!.inject(s), synthBatch(1000, 2000 + i));
  await page.evaluate(() => window.__wcBench!.drained());
  await pause(500);
  // Trim frames: 10-row flushes at the cap; a 200-row chunk is dropped
  // from the top every 20th.
  const flushes = n(ctx, 300, 60);
  const trimRun = await page.evaluate(
    async ([count, texts]) => {
      const B = window.__wcBench!;
      const out: Array<{ frame: number; script: number; trimmed: boolean }> = [];
      for (let i = 0; i < count!; i++) {
        const before = B.rows;
        const r = await B.inject((texts as string[])[i % (texts as string[]).length]!);
        out.push({ frame: r.toPaint - (r.toFlush - r.script), script: r.script, trimmed: B.rows < before + 10 });
        await new Promise((res) => setTimeout(res, 30));
      }
      return { out, rows: B.rows, elements: document.getElementsByTagName('*').length };
    },
    [flushes, Array.from({ length: 50 }, (_, i) => synthBatch(10, 9000 + i))] as const,
  );
  // Scroll mode, width change: from the call until after the next frame.
  const reps = n(ctx, 8, 3);
  const actions = await page.evaluate(async (count) => {
    const out = window.__wcBench!.app!.output;
    const ch = new MessageChannel();
    const afterPaint = () =>
      new Promise<number>((res) => {
        requestAnimationFrame(() => {
          ch.port1.onmessage = () => res(performance.now());
          ch.port2.postMessage(null);
        });
      });
    const time = async (f: () => void) => {
      await new Promise((res) => setTimeout(res, 300));
      const t0 = performance.now();
      f();
      return (await afterPaint()) - t0;
    };
    const enter: number[] = [];
    const leave: number[] = [];
    for (let k = 0; k < count; k++) {
      enter.push(await time(() => out.pageUp()));
      leave.push(await time(() => out.toTail()));
    }
    // A width change of the game pane (as a window resize or a dock drag):
    // every row re-wraps. Forced layout and the whole frame.
    const game = document.querySelector<HTMLElement>('.wc-game')!;
    const sc = document.querySelector<HTMLElement>('.wc-scroller')!;
    const layout: number[] = [];
    const frame: number[] = [];
    const w0 = game.style.width;
    for (let k = 0; k < count; k++) {
      await new Promise((res) => setTimeout(res, 300));
      await new Promise<void>((res) =>
        requestAnimationFrame(() => {
          const t0 = performance.now();
          const w = game.getBoundingClientRect().width;
          game.style.width = `${w + (k % 2 ? 9 : -9)}px`;
          void sc.scrollHeight;
          layout.push(performance.now() - t0);
          ch.port1.onmessage = () => {
            frame.push(performance.now() - t0);
            res();
          };
          ch.port2.postMessage(null);
        }),
      );
    }
    game.style.width = w0;
    return { enter, leave, layout, frame };
  }, reps);
  await pause(500);
  // Dock drag (real pointer events on the right dock's handle): the frame
  // after the press, each move (live preview) and the drop.
  await page.evaluate(() => {
    const w = window as unknown as { __drag: Record<string, number[]> };
    w.__drag = { down: [], move: [], up: [] };
    const ch = new MessageChannel();
    let q: Array<() => void> = [];
    ch.port1.onmessage = () => {
      const x = q;
      q = [];
      for (const f of x) f();
    };
    const track = (type: 'pointerdown' | 'pointermove' | 'pointerup', key: 'down' | 'move' | 'up') =>
      window.addEventListener(
        type,
        (e) => {
          if (key === 'move' && (e as PointerEvent).buttons === 0) return;
          const t0 = performance.now();
          requestAnimationFrame(() => {
            q.push(() => w.__drag[key]!.push(performance.now() - t0));
            if (q.length === 1) ch.port2.postMessage(null);
          });
        },
        true,
      );
    track('pointerdown', 'down');
    track('pointermove', 'move');
    track('pointerup', 'up');
  });
  const h = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.wc-handle[data-dock="right"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + Math.min(200, r.height / 2) };
  });
  const dragReps = n(ctx, 6, 2);
  if (h) {
    for (let k = 0; k < dragReps; k++) {
      const dx = k % 2 === 0 ? -40 : 40;
      const x0 = h.x + (k % 2 === 0 ? 0 : -40);
      await page.mouse.move(x0, h.y);
      await page.mouse.down();
      await page.mouse.move(x0 + dx, h.y, { steps: 5 });
      await page.mouse.up();
      await pause(600);
    }
  }
  const drag = await page.evaluate(() => (window as unknown as { __drag: Record<string, number[]> }).__drag);
  await closePage(page);
  const trim = trimRun.out.filter((x) => x.trimmed);
  const rest = trimRun.out.filter((x) => !x.trimmed);
  return {
    rows: trimRun.rows,
    elements: trimRun.elements,
    normal: dist(rest.map((x) => x.frame)),
    trim: dist(trim.map((x) => x.frame)),
    trimScript: dist(trim.map((x) => x.script)),
    enter: dist(actions.enter),
    leave: dist(actions.leave),
    widthLayout: dist(actions.layout),
    widthFrame: dist(actions.frame),
    dragFound: h !== null,
    dragDown: dist(drag.down ?? []),
    dragMove: dist(drag.move ?? []),
    dragUp: dist(drag.up ?? []),
  };
}

// ------------------------------------------------------------------ rules

export async function benchRulesIngest(t: Target, ctx: Ctx) {
  const page = await openBench(t, ctx.base, { settings: mapSetting(false) });
  const state = await fakeLogin(page);
  await page.evaluate((text) => {
    (window as unknown as { __benchText: string }).__benchText = text;
  }, ctx.logText);
  const frames = await page.evaluate(() => window.__wcBench!.loadFrames((window as unknown as { __benchText: string }).__benchText, 0));
  await pause(300);
  const order = ctx.scale < 1 ? ['none', 'rules'] : ['none', 'rules', 'rules', 'none'];
  const runs: Array<{ variant: string; lines: number; syncMs: number; maxSyncMs: number; wallMs: number }> = [];
  for (const variant of order) {
    const ok = await page.evaluate((p) => window.__wcBench!.applyProfile(p), variant === 'rules' ? ctx.ruleProfile : '#nop no rules\n');
    if (!ok) throw new Error(`rules ingest: profile (${variant}) did not load`);
    await page.evaluate(() => window.__wcBench!.drained());
    await pause(300);
    runs.push({
      variant,
      ...(await page.evaluate(async (count) => {
        const B = window.__wcBench!;
        let lines = 0;
        const off = B.app!.bus.on('text.line', () => lines++);
        let sync = 0;
        let longest = 0;
        const t0 = performance.now();
        let i = 0;
        while (i < count) {
          const stop = performance.now() + 8;
          while (i < count && performance.now() < stop) {
            const d = B.deliverFrame(i++);
            sync += d;
            if (d > longest) longest = d;
          }
          await new Promise((r) => requestAnimationFrame(r));
        }
        await B.drained();
        off();
        return { lines, syncMs: sync, maxSyncMs: longest, wallMs: performance.now() - t0 };
      }, frames)),
    });
  }
  const recorder = await page.evaluate(() => window.__wcBench!.app!.recorder.status);
  await closePage(page);
  const pick = (v: string) => runs.filter((r) => r.variant === v);
  const usPer = (rs: typeof runs) => median(rs.map((r) => (r.syncMs / r.lines) * 1000));
  return {
    state,
    recorder,
    lines: runs[0]?.lines ?? 0,
    noneUs: usPer(pick('none')),
    rulesUs: usPer(pick('rules')),
    noneWall: median(pick('none').map((r) => r.wallMs)),
    rulesWall: median(pick('rules').map((r) => r.wallMs)),
    maxSync: max(runs.map((r) => r.maxSyncMs)),
    runs: runs.length,
  };
}

export type CaretResult = Awaited<ReturnType<typeof benchCaret>>;
export type PlayResult = Awaited<ReturnType<typeof benchPlay>>;
export type ColourResult = Awaited<ReturnType<typeof benchColour>>;
export type ScrollActionsResult = Awaited<ReturnType<typeof benchScrollActions>>;
export type RulesIngestResult = Awaited<ReturnType<typeof benchRulesIngest>>;
