// Real keys under load, and key → wire over a loopback WebSocket, for
// bench/browser-bench.ts (performance review §7, report #15). Adapted from
// the input review's harness (notes/research/perf-review/harness/C:
// c-common.ts, c-load.ts, c-ws.ts).
//
// Keys are real Playwright key presses at random 40–250 ms gaps: typed
// letters, Enter (sends the line), F1 (macro `hit $target`) and ` (a
// printable-key macro), with the khazdul profile. Per key (page clock):
// the first keydown listener (window, capture), the first `net.bytesOut`
// after it (right after socket.send), the next frame rendered after the
// keydown and after a typed letter's `input` event, and the echo row of
// an Enter rendered.
//
// - Chromium sets `event.timeStamp` when the browser process creates the
//   event, so listener − timeStamp is the input delay. Playwright's
//   Firefox creates the event in the content process (timeStamp ≈
//   listener), so there the delay is measured from Node's clock just
//   before the press (min-RTT clock sync): an upper bound with ~1–2 ms of
//   protocol in it.
// - Event Timing (both browsers) reports keydowns of 16 ms or more:
//   their input delay (processingStart − startTime).
//
// Loads (fake socket): `colour` (MUME's colour help pages, one every
// 150–450 ms), `burst` (the fixture replayed at speed 0 through
// ReplaySocket, again 300 ms after each drain), `play` (a busy window of
// the fixture with synthesized GMCP at speed 1 after a GMCP login).
//
// WebSocket (ws): a loopback server in this process plays MUME over a real
// WebSocket (the app's WebSocketTransport): GMCP login (so the session is
// live-like: playing, not a replay, and the run recorder captures), then
// `burst` (the whole fixture in 16 KB messages, the next one only after
// the page acknowledged the end marker, then 1 s) or `play`. Node's press
// time and the server's receive time share a clock: key → wire. Chromium
// records a DevTools trace for the longest main-thread tasks (GC, the
// recorder's chunk write …); Firefox reports what is measurable without
// the Gecko profiler (WebSocket message task durations, rAF gaps).

import type { Page } from '@playwright/test';
import { b64Bytes, busyWindow, colourPages, framesOf, keyProfile, loginLog, playLog } from './feeds';
import { type Dist, type Target, TRACE_CATEGORIES, clockOffset, closePage, dist, mapSetting, max, nodeEpoch, openBench, pause, traceTasks } from './lib';
import type { Ctx } from './owner';
import { fakeLogin, waitMap } from './owner';
import { type WsConn, startWsServer } from './ws-server';

// ---------------------------------------------------------------- in page

interface PageKey {
  ts: number;
  t0: number;
  send: number;
  sendText: string;
  paint: number;
  input: number;
  ipaint: number;
}

/** Installs the per-key instrumentation (runs in the page). */
function install(): void {
  const w = window as unknown as Record<string, unknown>;
  const B = window.__wcBench!;
  const app = B.app!;
  const C = {
    keys: [] as PageKey[],
    sends: [] as Array<{ t: number; text: string; gm: boolean }>,
    et: [] as Array<{ name: string; st: number; ps: number; d: number }>,
    loaf: [] as number[],
    gaps: [] as number[],
    cur: null as PageKey | null,
    last: null as PageKey | null,
    run: true,
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
  };
  w.__c = C;
  const mc = new MessageChannel();
  let pq: Array<() => void> = [];
  mc.port1.onmessage = () => {
    const q = pq;
    pq = [];
    for (const fn of q) fn();
  };
  const afterPaint = (fn: () => void) => {
    pq.push(fn);
    if (pq.length === 1) mc.port2.postMessage(0);
  };
  const dec = new TextDecoder();
  app.bus.on('net.bytesOut', (b: Uint8Array) => {
    const t = performance.now();
    const text = b[0] === 255 ? '' : dec.decode(b);
    C.sends.push({ t, text, gm: b[0] === 255 });
    if (C.cur && C.cur.send === 0 && b[0] !== 255) {
      C.cur.send = t;
      C.cur.sendText = text;
    }
  });
  window.addEventListener(
    'keydown',
    (e) => {
      const k: PageKey = { ts: e.timeStamp, t0: performance.now(), send: 0, sendText: '', paint: 0, input: 0, ipaint: 0 };
      C.keys.push(k);
      C.cur = k;
      C.last = k;
    },
    true,
  );
  window.addEventListener('keydown', () => {
    const k = C.cur;
    if (!k) return;
    C.cur = null;
    requestAnimationFrame(() => afterPaint(() => (k.paint = performance.now())));
  });
  app.input.input.addEventListener('input', () => {
    const k = C.last;
    if (!k || k.input) return;
    k.input = performance.now();
    requestAnimationFrame(() => afterPaint(() => (k.ipaint = performance.now())));
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as PerformanceEventTiming[]) C.et.push({ name: e.name, st: e.startTime, ps: e.processingStart, d: e.duration });
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    /* no Event Timing */
  }
  if ((PerformanceObserver.supportedEntryTypes ?? []).includes('long-animation-frame')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) C.loaf.push(e.duration);
    }).observe({ type: 'long-animation-frame' });
  }
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    if (C.run) C.gaps.push(now - last);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Applies the key profile again: connecting reloads the stored profile. Returns whether the macros are bound. */
async function applyKeyProfile(page: Page, profile: string): Promise<boolean> {
  return page.evaluate(async (p) => {
    const B = window.__wcBench!;
    await new Promise((r) => setTimeout(r, 400));
    B.applyProfile(p);
    return B.app!.script.hasMacro('F1') && B.app!.script.hasMacro('Backquote');
  }, profile);
}

function resetCollect(): void {
  const C = (window as unknown as { __c: { keys: unknown[]; sends: unknown[]; et: unknown[]; loaf: unknown[]; gaps: unknown[]; run: boolean } }).__c;
  C.keys = [];
  C.sends = [];
  C.et = [];
  C.loaf = [];
  C.gaps = [];
  C.run = true;
  window.__wcBench!.flushes.length = 0;
}

interface Collected {
  keys: PageKey[];
  sends: Array<{ t: number; text: string; gm: boolean }>;
  et: Array<{ name: string; st: number; ps: number; d: number }>;
  loaf: number[];
  gaps: number[];
  flushes: Array<[number, number, number]>;
  wsTasks: Array<[number, number, number]>;
  state: string;
  recorder: string;
  timeOrigin: number;
}

function collect(): Collected {
  const C = (window as unknown as { __c: Collected & { run: boolean; timer: ReturnType<typeof setTimeout> } }).__c;
  C.run = false;
  clearTimeout(C.timer);
  const B = window.__wcBench!;
  return {
    keys: C.keys,
    sends: C.sends,
    et: C.et,
    loaf: C.loaf,
    gaps: C.gaps,
    flushes: B.flushes.map((r) => [r.start, r.script, r.frame] as [number, number, number]),
    wsTasks: B.wsTasks,
    state: B.app!.session.state,
    recorder: B.app!.recorder.status,
    timeOrigin: performance.timeOrigin,
  };
}

// ------------------------------------------------------------------- keys

type Kind = 'char' | 'Enter' | 'F1' | 'Backquote';
interface NodeKey {
  kind: Kind;
  nodeT: number;
}

async function pressKeys(page: Page, n: number): Promise<NodeKey[]> {
  const keys: NodeKey[] = [];
  let prev: Kind | null = null;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < n; i++) {
    await pause(40 + Math.random() * 210);
    const r = Math.random();
    const kind: Kind = prev !== 'char' && r < 0.35 ? 'char' : r < 0.7 ? 'Enter' : r < 0.85 ? 'F1' : 'Backquote';
    prev = kind;
    const t = nodeEpoch();
    await page.keyboard.press(kind === 'char' ? letters[Math.floor(Math.random() * 26)]! : kind);
    keys.push({ kind, nodeT: t });
  }
  return keys;
}

export interface KeyStats {
  keys: number;
  /** Input delay: Chromium event.timeStamp → first listener; Firefox Node press → first listener (upper bound). */
  inputDelay: Dist;
  /** Event Timing keydown entries ≥ 16 ms: count and their input delay (processingStart − startTime). */
  etEntries: number;
  etDelay: Dist;
  keyToSend: Dist;
  letterToRendered: Dist;
  enterToEcho: Dist;
  rafMax: number;
  loafMax: number;
  state: string;
  recorder: string;
  /** Per page command send time (page clock) → its key's Node press time, for key → wire. */
  sendToPress: Map<number, number>;
}

function analyse(t: Target, c: Collected, nk: NodeKey[], off: number): KeyStats {
  const n = Math.min(c.keys.length, nk.length);
  if (c.keys.length !== nk.length) console.log(`    (${c.keys.length} keydowns for ${nk.length} presses)`);
  const toPage = (nodeT: number) => nodeT + off - c.timeOrigin;
  const delay: number[] = [];
  const send: number[] = [];
  const letter: number[] = [];
  const echo: number[] = [];
  const sendToPress = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const k = c.keys[i]!;
    const from = t.isChromium ? k.ts : toPage(nk[i]!.nodeT);
    delay.push(k.t0 - from);
    if (k.send) {
      send.push(k.send - from);
      sendToPress.set(k.send, nk[i]!.nodeT);
    }
    if (nk[i]!.kind === 'char' && k.ipaint) letter.push(k.ipaint - from);
    if (nk[i]!.kind === 'Enter' && k.send && k.sendText.length > 2) {
      const fl = c.flushes.find((x) => x[0] >= k.send);
      if (fl) echo.push(fl[0] + fl[2] - from);
    }
  }
  const kd = c.et.filter((e) => e.name === 'keydown');
  return {
    keys: n,
    inputDelay: dist(delay),
    etEntries: kd.length,
    etDelay: dist(kd.map((e) => e.ps - e.st)),
    keyToSend: dist(send),
    letterToRendered: dist(letter),
    enterToEcho: dist(echo),
    rafMax: max(c.gaps),
    loafMax: c.loaf.length ? max(c.loaf) : t.isChromium ? 0 : NaN,
    state: c.state,
    recorder: c.recorder,
    sendToPress,
  };
}

// ------------------------------------------------------------------ loads

function startColour(pages: string[]): void {
  const B = window.__wcBench!;
  const C = (window as unknown as { __c: { run: boolean; timer: ReturnType<typeof setTimeout> } }).__c;
  const bytes = pages.map((p) => new TextEncoder().encode(p));
  let i = 0;
  const step = () => {
    if (!C.run) return;
    B.deliver(bytes[i++ % bytes.length]!);
    C.timer = setTimeout(step, 150 + Math.random() * 300);
  };
  C.timer = setTimeout(step, 100);
}

function startBurst(): void {
  const B = window.__wcBench!;
  const C = (window as unknown as { __c: { run: boolean; timer: ReturnType<typeof setTimeout> } }).__c;
  const app = B.app!;
  const text = (window as unknown as { __benchText: string }).__benchText;
  const go = () => {
    if (!C.run) return;
    const off = app.bus.on('conn.state', (s) => {
      if (s.state !== 'disconnected') return;
      off();
      C.timer = setTimeout(go, 300);
    });
    app.startReplay(text, 'burst', 0);
  };
  go();
}

export type KeyLoad = 'colour' | 'burst' | 'play';

export async function benchKeysLoad(t: Target, ctx: Ctx, load: KeyLoad) {
  const page = await openBench(t, ctx.base, { settings: mapSetting(true) });
  await waitMap(page);
  await page.evaluate(install);
  if (load === 'burst') {
    await page.evaluate((text) => {
      (window as unknown as { __benchText: string }).__benchText = text;
    }, ctx.logText);
    await page.evaluate(() => window.__wcBench!.connectFake());
  } else {
    const st = await fakeLogin(page);
    if (st !== 'playing') console.warn(`  keys/${load}: session ${st}`);
  }
  if (!(await applyKeyProfile(page, keyProfile()))) console.warn(`  keys/${load}: F1 / Backquote macros not bound`);
  if (load === 'play') {
    const log = playLog(ctx.logText, { fromLine: busyWindow(ctx.logText, 90), login: false, maxMs: 200_000 });
    // The load is the server's side only: drop the recorded commands.
    await page.evaluate((text) => window.__wcBench!.loadPlay(text), log.text.split('\n').filter((l) => !/^\d{16} >( |$)/.test(l)).join('\n'));
  }
  await page.focus('.wc-input-field');
  await pause(500);
  const off0 = await clockOffset(page);
  await page.evaluate(resetCollect);
  let playing: Promise<unknown> | null = null;
  if (load === 'colour') await page.evaluate(startColour, [...colourPages('24-bit'), ...colourPages('256')]);
  else if (load === 'burst') await page.evaluate(startBurst);
  else playing = page.evaluate(() => window.__wcBench!.play(1)).catch(() => null);
  await pause(load === 'burst' ? 200 : 600);
  const nk = await pressKeys(page, Math.max(20, Math.round(100 * ctx.scale)));
  if (playing) {
    await page.evaluate(() => window.__wcBench!.stopPlay());
    await playing;
  }
  const off1 = await clockOffset(page);
  const c = await page.evaluate(collect);
  await closePage(page);
  return analyse(t, c, nk, (off0.off + off1.off) / 2);
}

// --------------------------------------------------------------------- ws

export type WsLoad = 'burst' | 'play';

export interface WsBench {
  run(t: Target, ctx: Ctx, load: WsLoad): Promise<WsResult>;
  close(): Promise<void>;
}

export interface WsResult extends Omit<KeyStats, 'sendToPress'> {
  keyToWire: Dist;
  sendToWire: Dist;
  wsTaskMax: number;
  wsTasks: number;
  bursts: number;
  /** Chromium: the longest main-thread tasks (ms and what ran in them); null in Firefox. */
  tasks: { ms: number; label: string }[] | null;
}

/** Starts the loopback WebSocket server on `port`; `run` drives one page against it. */
export async function startWsBench(port: number, ctx: Ctx): Promise<WsBench> {
  const loginBytes = framesOf(loginLog()).map((f) => b64Bytes(f.b64));
  const burstBytes = framesOf(ctx.logText, 0).map((f) => b64Bytes(f.b64));
  const play = playLog(ctx.logText, { fromLine: busyWindow(ctx.logText, 90), login: false, maxMs: 200_000 });
  const playBytes = framesOf(play.text, 1).map((f) => ({ atMs: f.atMs, b: b64Bytes(f.b64) }));
  let conn: WsConn | null = null;
  let connected: () => void = () => {};
  let onAck: ((n: number) => void) | null = null;
  let recv: { at: number; text: string }[] = [];
  const server = await startWsServer({
    port,
    onConnect(c) {
      conn = c;
      for (const b of loginBytes) c.send(b);
      connected();
    },
    onMessage(_c, data, at) {
      if (data[0] === 255) return; // telnet / GMCP, not a command
      const text = data.toString('utf8');
      if (text.startsWith('ACK ')) onAck?.(Number(text.slice(4)));
      else recv.push({ at, text });
    },
  });
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let bursts = 0;
  const startLoad = (load: WsLoad): void => {
    running = true;
    const c = conn!;
    if (load === 'burst') {
      // One burst, then wait until the page processed its end marker (it
      // acknowledges), then 1 s, then the next: Firefox buffers everything,
      // so the socket alone does not pace the load.
      const go = () => {
        if (!running) return;
        const k = ++bursts;
        for (const b of burstBytes) c.send(b);
        c.send(new TextEncoder().encode(`BENCH-BURST-END-${k}\r\n`));
        onAck = (a) => {
          if (a !== k) return;
          onAck = null;
          timer = setTimeout(go, 1000);
        };
      };
      go();
    } else {
      const t0 = performance.now();
      const span = (playBytes.at(-1)?.atMs ?? 0) + 1000;
      let i = 0;
      const step = () => {
        if (!running) return;
        for (;;) {
          const lap = Math.floor(i / playBytes.length);
          const fr = playBytes[i % playBytes.length]!;
          const wait = t0 + lap * span + fr.atMs - performance.now();
          if (wait > 1) {
            timer = setTimeout(step, wait);
            return;
          }
          c.send(fr.b);
          i++;
        }
      };
      step();
    }
  };
  const stopLoad = () => {
    running = false;
    onAck = null;
    if (timer) clearTimeout(timer);
  };
  return {
    async run(t, ctx2, load) {
      const page = await openBench(t, ctx2.base, { settings: mapSetting(true) });
      await waitMap(page);
      await page.evaluate(install);
      const up = new Promise<void>((r) => (connected = r));
      await page.evaluate((url) => window.__wcBench!.connectWs(url), `ws://127.0.0.1:${port}`);
      await up;
      await pause(600);
      if (!(await applyKeyProfile(page, keyProfile()))) console.warn(`  ws/${load}: F1 / Backquote macros not bound`);
      await page.evaluate(() => {
        const B = window.__wcBench!;
        B.app!.bus.on('text.line', (l) => {
          if (l.text.startsWith('BENCH-BURST-END-')) B.wsSendText(`ACK ${l.text.slice(16)}`);
        });
      });
      await page.focus('.wc-input-field');
      const off0 = await clockOffset(page);
      await page.evaluate(resetCollect);
      recv = [];
      bursts = 0;
      startLoad(load);
      await pause(load === 'burst' ? 300 : 600);
      if (t.isChromium) await t.browser.startTracing(page, { categories: TRACE_CATEGORIES });
      const nk = await pressKeys(page, Math.max(20, Math.round(80 * ctx2.scale)));
      const traceBuf = t.isChromium ? await t.browser.stopTracing() : null;
      stopLoad();
      await pause(1500);
      const off1 = await clockOffset(page);
      const c = await page.evaluate(collect);
      await closePage(page);
      const off = (off0.off + off1.off) / 2;
      const ks = analyse(t, c, nk, off);
      // Pair the page's command sends with the server's receives (same order).
      const cmd = c.sends.filter((s) => !s.gm && !s.text.startsWith('ACK '));
      const m = Math.min(cmd.length, recv.length);
      if (cmd.length !== recv.length) console.log(`    (${cmd.length} command sends in the page, ${recv.length} received)`);
      const pageToNode = (x: number) => x + c.timeOrigin - off;
      const sendToWire: number[] = [];
      const keyToWire: number[] = [];
      for (let i = 0; i < m; i++) {
        sendToWire.push(recv[i]!.at - pageToNode(cmd[i]!.t));
        const press = ks.sendToPress.get(cmd[i]!.t);
        if (press !== undefined) keyToWire.push(recv[i]!.at - press);
      }
      const { sendToPress: _, ...rest } = ks;
      return {
        ...rest,
        keyToWire: dist(keyToWire),
        sendToWire: dist(sendToWire),
        wsTaskMax: max(c.wsTasks.map((x) => x[1])),
        wsTasks: c.wsTasks.length,
        bursts,
        tasks: traceBuf ? traceTasks(traceBuf) : null,
      };
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export type KeysLoadResult = Awaited<ReturnType<typeof benchKeysLoad>>;
