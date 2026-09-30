// In-page instrumentation, load drivers, key driver and analysis shared by
// c-load.ts (fake socket / replay) and c-ws.ts (real WebSocket).
import type { Page } from '@playwright/test';
import { f, nodeEpoch, pause, pct, stats, type BrowserName, maxOf } from './lib.ts';

// ------------------------------------------------------------------ in page

/** Installs the per-key instrumentation (runs in the page). */
export function install(profile: string): boolean {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  const app = B.app;
  if (!B.applyProfile(profile)) return false;
  const C: any = {
    profile,
    keys: [],
    sends: [],
    et: [],
    loaf: [],
    lt: [],
    gaps: [],
    inject: [],
    replays: [],
    cur: null,
    last: null,
    run: true,
    timer: 0,
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
    C.sends.push({ t, text: dec.decode(b), gm: b[0] === 255 });
    if (C.cur && C.cur.send === 0) {
      C.cur.send = t;
      C.cur.sendText = dec.decode(b);
    }
  });
  window.addEventListener(
    'keydown',
    (e) => {
      const t0 = performance.now();
      const k = { key: e.key, code: e.code, ts: e.timeStamp, t0, send: 0, sendText: '', end: 0, raf: 0, paint: 0, input: 0, ipaint: 0, rows: app.output.rows };
      C.keys.push(k);
      C.cur = k;
      C.last = k;
    },
    true,
  );
  window.addEventListener('keydown', () => {
    const k = C.cur;
    if (!k) return;
    k.end = performance.now();
    C.cur = null;
    requestAnimationFrame(() => {
      k.raf = performance.now();
      afterPaint(() => (k.paint = performance.now()));
    });
  });
  app.input.input.addEventListener('input', () => {
    const k = C.last;
    if (!k || k.input) return;
    k.input = performance.now();
    requestAnimationFrame(() => afterPaint(() => (k.ipaint = performance.now())));
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as PerformanceEventTiming[]) {
        C.et.push({ name: e.name, st: e.startTime, ps: e.processingStart, pe: e.processingEnd, d: e.duration, id: (e as any).interactionId ?? 0 });
      }
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
  } catch {}
  const types = PerformanceObserver.supportedEntryTypes ?? [];
  if (types.includes('long-animation-frame')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as any[]) {
        C.loaf.push({
          st: e.startTime,
          d: e.duration,
          rs: e.renderStart,
          sls: e.styleAndLayoutStart,
          bd: e.blockingDuration,
          fsl: 0,
          scripts: e.scripts.map((s: any) => ({
            inv: s.invoker,
            it: s.invokerType,
            fn: s.sourceFunctionName,
            url: (s.sourceURL || '').split('/').pop(),
            st: s.startTime,
            d: s.duration,
            fsl: s.forcedStyleAndLayoutDuration,
          })),
        });
      }
    }).observe({ type: 'long-animation-frame' });
  }
  if (types.includes('longtask')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) C.lt.push({ st: e.startTime, d: e.duration });
    }).observe({ type: 'longtask' });
  }
  // Frame gaps.
  let lastRaf = performance.now();
  const tick = () => {
    const now = performance.now();
    if (C.run) C.gaps.push([lastRaf, now - lastRaf]);
    lastRaf = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
}

/** Connects the fake socket and logs in with GMCP (side panes, recorder). */
export async function login(b64: string[]): Promise<string> {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  B.connectFake();
  for (const s of b64) B.sock.onData(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  await new Promise((r) => setTimeout(r, 300));
  return B.app.session.state;
}

export function startHelp(pages: string[]): void {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  const C = w.__c;
  const enc = new TextEncoder();
  const bytes = pages.map((p) => enc.encode(p));
  let i = 0;
  const step = () => {
    if (!C.run) return;
    const t = performance.now();
    B.sock.onData(bytes[i++ % bytes.length]);
    C.inject.push([t, performance.now() - t]);
    C.timer = setTimeout(step, 150 + Math.random() * 300);
  };
  C.timer = setTimeout(step, 100);
}

export function startBurst(): void {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  const C = w.__c;
  const app = B.app;
  const text = w.__burstText as string;
  const go = () => {
    if (!C.run) return;
    const t = performance.now();
    const off = app.bus.on('conn.state', (s: any) => {
      if (s.state !== 'disconnected') return;
      off();
      C.replays.push([t, performance.now() - t]);
      C.timer = setTimeout(go, 300);
    });
    app.startReplay(text, 'burst', 0);
    // Time every frame the replay delivers (its 8 ms slices are runs of these).
    const sock = app.session.socket;
    if (sock && sock.onData) {
      const orig = sock.onData;
      sock.onData = (b: Uint8Array) => {
        const t1 = performance.now();
        orig(b);
        C.inject.push([t1, performance.now() - t1]);
      };
    }
  };
  go();
}

export function startPlay(frames: { atMs: number; b64: string }[]): void {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  const C = w.__c;
  const bytes = frames.map((fr) => Uint8Array.from(atob(fr.b64), (c) => c.charCodeAt(0)));
  const span = frames[frames.length - 1]!.atMs + 1000;
  const t0 = performance.now();
  let i = 0;
  const step = () => {
    if (!C.run) return;
    const lap = Math.floor(i / frames.length);
    const k = i % frames.length;
    const due = t0 + lap * span + frames[k]!.atMs;
    const wait = due - performance.now();
    if (wait > 1) {
      C.timer = setTimeout(step, wait);
      return;
    }
    const t = performance.now();
    B.sock.onData(bytes[k]);
    C.inject.push([t, performance.now() - t]);
    i++;
    step();
  };
  step();
}

export async function stopAll(): Promise<void> {
  const w = window as unknown as Record<string, any>;
  const C = w.__c;
  C.run = false;
  clearTimeout(C.timer);
  await new Promise((r) => setTimeout(r, 600));
}

export function collect(): unknown {
  const w = window as unknown as Record<string, any>;
  const C = w.__c;
  const B = w.__wcBench;
  const out = {
    keys: C.keys,
    sends: C.sends.map((s: any) => ({ t: s.t, n: s.text.length, gm: s.gm, text: s.gm ? '' : s.text })),
    et: C.et,
    loaf: C.loaf,
    lt: C.lt,
    gaps: C.gaps,
    inject: C.inject,
    replays: C.replays,
    msgs: C.msgs ?? [],
    flushes: B.flushes.map((r: any) => [r.start, r.script, r.frame]),
    rows: B.app.output.rows,
    state: B.app.session.state,
    recorder: B.app.recorder.status,
    timeOrigin: performance.timeOrigin,
  };
  return out;
}

export function resetCollect(): void {
  const w = window as unknown as Record<string, any>;
  const C = w.__c;
  const B = w.__wcBench;
  C.keys = [];
  C.sends = [];
  C.et = [];
  C.loaf = [];
  C.lt = [];
  C.gaps = [];
  C.inject = [];
  C.replays = [];
  C.msgs = [];
  C.run = true;
  B.flushes.length = 0;
}

// -------------------------------------------------------------------- node

export async function clockOffset(page: Page): Promise<{ off: number; rtt: number }> {
  let best = { rtt: Infinity, off: 0 };
  for (let i = 0; i < 40; i++) {
    const t0 = nodeEpoch();
    const tp = await page.evaluate(() => performance.timeOrigin + performance.now());
    const t1 = nodeEpoch();
    if (t1 - t0 < best.rtt) best = { rtt: t1 - t0, off: tp - (t0 + t1) / 2 };
  }
  return best;
}

export type Kind = 'char' | 'Enter' | 'F1' | 'Backquote';
export function pickKind(prev: Kind | null): Kind {
  const r = Math.random();
  if (prev !== 'char' && r < 0.35) return 'char';
  if (r < 0.7) return 'Enter';
  if (r < 0.85) return 'F1';
  return 'Backquote';
}

export interface NodeKey {
  kind: Kind;
  nodeT: number;
  pressMs: number;
}

export async function pressKeys(page: Page, n: number): Promise<NodeKey[]> {
  const keys: NodeKey[] = [];
  let prev: Kind | null = null;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < n; i++) {
    await pause(40 + Math.random() * 210);
    const kind = pickKind(prev);
    prev = kind;
    const k = kind === 'char' ? letters[Math.floor(Math.random() * 26)]! : kind;
    const t = nodeEpoch();
    await page.keyboard.press(k);
    keys.push({ kind, nodeT: t, pressMs: nodeEpoch() - t });
  }
  return keys;
}

// ------------------------------------------------------------------ analysis

export interface PageKey {
  key: string;
  code: string;
  ts: number;
  t0: number;
  send: number;
  end: number;
  raf: number;
  paint: number;
  input: number;
  ipaint: number;
  rows: number;
}

export interface Collected {
  keys: PageKey[];
  sends: { t: number; n: number; gm: boolean; text: string }[];
  et: { name: string; st: number; ps: number; pe: number; d: number; id: number }[];
  loaf: { st: number; d: number; rs: number; sls: number; bd: number; scripts: { inv: string; it: string; fn: string; url: string; st: number; d: number; fsl: number }[] }[];
  lt: { st: number; d: number }[];
  gaps: [number, number][];
  inject: [number, number][];
  replays: [number, number][];
  flushes: [number, number, number][];
  msgs: [number, number, number][];
  rows: number;
  state: string;
  recorder: string;
  timeOrigin: number;
}

export function analyse(name: BrowserName, scen: string, c: Collected, nk: NodeKey[], off: number, L: (s: string) => void): Record<string, unknown> {
  // Pair page keydowns with node presses by order (every press gives exactly one keydown).
  const n = Math.min(c.keys.length, nk.length);
  if (c.keys.length !== nk.length) L(`  (warning: ${c.keys.length} keydowns for ${nk.length} presses)`);
  const toPage = (nodeT: number) => nodeT + off - c.timeOrigin; // node epoch → page clock
  const rows: Record<string, number[]> = {
    tsDelay: [],
    nodeDelay: [],
    handler: [],
    keyToSend: [],
    keyToSendNode: [],
    keyToPaint: [],
    keyToPaintNode: [],
    charToPaint: [],
    charToPaintNode: [],
    inputToPaint: [],
    enterToEcho: [],
    enterToEchoNode: [],
  };
  const flushes = c.flushes;
  const perKey: { i: number; kind: Kind; delay: number; nodeDelay: number; ts: number; t0: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = c.keys[i]!;
    const kind = nk[i]!.kind;
    const nt = toPage(nk[i]!.nodeT);
    rows.tsDelay!.push(k.t0 - k.ts);
    rows.nodeDelay!.push(k.t0 - nt);
    rows.handler!.push(k.end - k.t0);
    if (k.send) {
      rows.keyToSend!.push(k.send - k.ts);
      rows.keyToSendNode!.push(k.send - nt);
    }
    if (k.paint) {
      rows.keyToPaint!.push(k.paint - k.ts);
      rows.keyToPaintNode!.push(k.paint - nt);
    }
    if (kind === 'char' && k.ipaint) {
      rows.charToPaint!.push(k.ipaint - k.ts);
      rows.charToPaintNode!.push(k.ipaint - nt);
      rows.inputToPaint!.push(k.ipaint - k.input);
    }
    if (kind === 'Enter' && k.send && k.sendText.length > 2) {
      const fl = flushes.find((x) => x[0] >= k.send);
      if (fl) {
        rows.enterToEcho!.push(fl[0] + fl[2] - k.ts);
        rows.enterToEchoNode!.push(fl[0] + fl[2] - nt);
      }
    }
    perKey.push({ i, kind, delay: k.t0 - k.ts, nodeDelay: k.t0 - nt, ts: k.ts, t0: k.t0 });
  }
  const S = (xs: number[]) => stats(xs);
  const line = (label: string, xs: number[]) => {
    const s = S(xs);
    L(`  - ${label}: median ${f(s.median)} / p95 ${f(s.p95)} / max ${f(s.max)} ms (n=${s.n})`);
  };
  const chromium = name === 'chromium';
  L(`  keys ${n}; sends ${c.sends.length}; rows at end ${c.rows}; session ${c.state}; ${c.recorder}`);
  if (chromium) {
    line('input delay: event.timeStamp → first listener', rows.tsDelay!);
    line('key → socket.send (from timeStamp)', rows.keyToSend!);
    line('key → next frame rendered (from timeStamp)', rows.keyToPaint!);
    line('typed letter → next frame rendered (from timeStamp)', rows.charToPaint!);
    line('Enter → echo row rendered (from timeStamp)', rows.enterToEcho!);
  }
  line('Node press → first listener', rows.nodeDelay!);
  line('Node press → socket.send', rows.keyToSendNode!);
  line('Node press → next frame rendered', rows.keyToPaintNode!);
  line('Node press → typed letter rendered', rows.charToPaintNode!);
  line('input event → its frame rendered', rows.inputToPaint!);
  line('Node press → Enter echo rendered', rows.enterToEchoNode!);
  line('keydown handler duration (all listeners)', rows.handler!);
  // Event Timing (both browsers): keydown entries ≥ 16 ms.
  const kd = c.et.filter((e) => e.name === 'keydown');
  const etDelay = kd.map((e) => e.ps - e.st);
  const mx = (xs: number[]) => (xs.length ? maxOf(xs) : NaN);
  L(`  - Event Timing keydown entries (duration ≥ 16 ms): ${kd.length} of ${n}; input delay (processingStart − startTime) median ${f(pct(etDelay, 50))} / p95 ${f(pct(etDelay, 95))} / max ${f(mx(etDelay))}; duration median ${f(pct(kd.map((e) => e.d), 50))} / max ${f(mx(kd.map((e) => e.d)))}`);
  const other = new Map<string, number>();
  for (const e of c.et) if (e.name !== 'keydown') other.set(e.name, (other.get(e.name) ?? 0) + 1);
  if (other.size) L(`    other Event Timing entries: ${[...other].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  // Frames.
  const g = c.gaps.map((x) => x[1]);
  const fl = c.flushes;
  L(`  - rAF gaps: median ${f(pct(g, 50))} / p95 ${f(pct(g, 95))} / max ${f(maxOf(g))} ms; > 50 ms: ${g.filter((x) => x > 50).length} of ${g.length}`);
  L(`  - output flushes: ${fl.length}; script median ${f(pct(fl.map((x) => x[1]), 50))} / max ${f(maxOf(fl.map((x) => x[1])))} ms; frame (callback → rendered) median ${f(pct(fl.map((x) => x[2]), 50))} / p95 ${f(pct(fl.map((x) => x[2]), 95))} / max ${f(maxOf(fl.map((x) => x[2])))} ms`);
  if (c.inject.length) L(`  - injections: ${c.inject.length}; sync ingest per injection median ${f(pct(c.inject.map((x) => x[1]), 50))} / max ${f(maxOf(c.inject.map((x) => x[1])))} ms`);
  if (c.replays.length) L(`  - burst replays: ${c.replays.length}; drain median ${f(pct(c.replays.map((x) => x[1]), 50))} ms`);
  // Own-task attribution (both browsers): what of ours was running when the
  // key arrived (Chromium: event.timeStamp; Firefox: Node press mapped to the
  // page clock plus the scenario's floor, the 5th percentile of Node → listener).
  {
    const floor = chromium ? 0 : pct(perKey.map((p) => p.nodeDelay), 5);
    const tasks: { s: number; e: number; k: string }[] = [];
    for (const x of flushes) {
      tasks.push({ s: x[0], e: x[0] + x[1], k: 'output flush (rAF script)' });
      tasks.push({ s: x[0] + x[1], e: x[0] + x[2], k: 'rendering after an output flush' });
    }
    for (const x of c.inject) tasks.push({ s: x[0], e: x[0] + x[1], k: 'ingest (socket data → lines → panes queue)' });
    for (const x of c.msgs ?? []) tasks.push({ s: x[0], e: x[0] + x[1], k: 'ingest (WebSocket message task)' });
    const cls = new Map<string, { n: number; ms: number }>();
    let delayedN = 0;
    for (const p of perKey) {
      const arrive = chromium ? p.ts : p.t0 - (p.nodeDelay - floor);
      const d = p.t0 - arrive;
      if (d <= 4) continue;
      delayedN++;
      const hit = tasks.find((t) => t.s <= arrive && t.e >= arrive);
      const key = hit ? hit.k : 'other (not a flush, render or ingest of ours: GC, timers, panes, recorder, …)';
      const e = cls.get(key) ?? { n: 0, ms: 0 };
      e.n++;
      e.ms += d;
      cls.set(key, e);
    }
    L(`  - keys waiting > 4 ms${chromium ? '' : ` (beyond the ${f(floor)} ms floor)`}: ${delayedN} of ${n}; what was running when they arrived (keys, total wait ms):`);
    for (const [k, v] of [...cls].sort((a, b) => b[1].ms - a[1].ms)) L(`      ${k}: ${v.n}, ${f(v.ms, 1)}`);
  }
  // Attribution from LoAF (Chromium): for keys delayed > 4 ms, the LoAF covering ts.
  if (chromium && c.loaf.length) {
    const delayed = perKey.filter((p) => p.delay > 4);
    const cls = new Map<string, { n: number; ms: number }>();
    const add = (k: string, ms: number) => {
      const e = cls.get(k) ?? { n: 0, ms: 0 };
      e.n++;
      e.ms += ms;
      cls.set(k, e);
    };
    for (const p of delayed) {
      const lf = c.loaf.find((x) => x.st <= p.ts && x.st + x.d >= p.ts);
      if (!lf) {
        add('no LoAF (task < 50 ms or between frames)', p.delay);
        continue;
      }
      // Which part of the LoAF was running at ts?
      const inScript = lf.scripts.find((s) => s.st <= p.ts && s.st + s.d >= p.ts);
      if (inScript) add(`script: ${inScript.inv} (${inScript.fn || '?'}@${inScript.url || '?'})`, p.delay);
      else if (p.ts >= lf.rs && lf.rs > 0) add(p.ts >= lf.sls && lf.sls > 0 ? 'rendering: style/layout/paint of a frame' : 'rendering: rAF callbacks', p.delay);
      else add('in LoAF, not in a script (task gap or unattributed work)', p.delay);
    }
    L(`  - keys delayed > 4 ms: ${delayed.length} of ${n}; LoAF attribution (count, total delay ms):`);
    for (const [k, v] of [...cls].sort((a, b) => b[1].ms - a[1].ms)) L(`      ${k}: ${v.n}, ${f(v.ms, 1)}`);
    // LoAF summary for the scenario.
    const inv = new Map<string, { n: number; ms: number; max: number }>();
    for (const lf of c.loaf) {
      for (const s of lf.scripts) {
        const k = `${s.inv} (${s.fn || '?'}@${s.url || '?'})`;
        const e = inv.get(k) ?? { n: 0, ms: 0, max: 0 };
        e.n++;
        e.ms += s.d;
        e.max = Math.max(e.max, s.d);
        inv.set(k, e);
      }
    }
    const lfd = c.loaf.map((x) => x.d);
    const render = c.loaf.map((x) => (x.rs > 0 ? x.st + x.d - x.rs : 0));
    L(`  - LoAFs: ${c.loaf.length}; duration median ${f(pct(lfd, 50))} / max ${f(maxOf(lfd))} ms; render part (renderStart → end) median ${f(pct(render, 50))} / max ${f(maxOf(render))} ms`);
    L(`    top LoAF scripts by total ms: ${[...inv].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([k, v]) => `${k} ×${v.n} ${f(v.ms, 0)} ms (max ${f(v.max, 1)})`).join('; ')}`);
  }
  return { rows, perKey };
}

// -------------------------------------------------------------------- trace

export async function analyseTrace(buf: Buffer, syncPageMs: number, perKey: { delay: number; ts: number; t0: number; kind: Kind }[], L: (s: string) => void): Promise<void> {
  const lines = { push: L };
  type Ev = { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: any };
  const all = (JSON.parse(buf.toString()) as { traceEvents: Ev[] }).traceEvents;
  const mark = all.find((e) => e.name === 'c-sync');
  if (!mark) {
    lines.push('  (trace: no sync mark)');
    return;
  }
  const mainKeys = new Set(all.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
  const main = `${mark.pid}:${mark.tid}`;
  if (!mainKeys.has(main)) lines.push('  (trace: sync mark not on CrRendererMain?)');
  const ev = all.filter((e) => `${e.pid}:${e.tid}` === main && e.ph === 'X' && e.dur !== undefined);
  const toTrace = (pageMs: number) => mark.ts + (pageMs - syncPageMs) * 1000;
  const tasks = ev.filter((e) => e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask').sort((a, b) => a.ts - b.ts);
  const kids = ev.filter((e) => e.name !== 'ThreadControllerImpl::RunTask' && e.name !== 'RunTask');
  const label = (t: Ev): string => {
    const inside = kids.filter((k) => k.ts >= t.ts && k.ts + (k.dur ?? 0) <= t.ts + (t.dur ?? 0));
    const by = new Map<string, number>();
    for (const k of inside) {
      let n = k.name;
      if (n === 'FunctionCall') n = `FunctionCall ${k.args?.data?.functionName || '?'}@${String(k.args?.data?.url || '').split('/').pop()}`;
      if (n === 'EventDispatch') n = `EventDispatch ${k.args?.data?.type}`;
      if (n === 'TimerFire' || n === 'FireAnimationFrame' || n === 'UpdateLayoutTree' || n === 'Layout' || n === 'Paint' || n === 'PrePaint' || n === 'Layerize' || n === 'Commit' || n.startsWith('FunctionCall') || n.startsWith('EventDispatch') || /GC|Scavenge|MajorGC|MinorGC/.test(n) || n === 'ParseHTML' || n === 'v8.run' || n === 'RunMicrotasks' || n === 'HitTest' || n === 'ScheduleStyleRecalculation' || n === 'UpdateLayer' || n === 'PaintImage' || n === 'Decode Image' || n === 'ResourceReceivedData' || n === 'XHRReadyStateChange') {
        by.set(n, (by.get(n) ?? 0) + (k.dur ?? 0) / 1000);
      }
    }
    return [...by].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
  };
  const delayed = perKey.filter((p) => p.delay > 4);
  const cls = new Map<string, { n: number; ms: number }>();
  const examples: string[] = [];
  for (const p of delayed) {
    const a = toTrace(p.ts);
    const b = toTrace(p.t0);
    const over = tasks.filter((t) => t.ts < b && t.ts + (t.dur ?? 0) > a && (t.dur ?? 0) > 1000);
    const top = over.sort((x, y) => (y.dur ?? 0) - (x.dur ?? 0))[0];
    const key = top ? label(top).split(',')[0]!.replace(/ [\d.]+$/, '') || '(task with no known child)' : '(no task > 1 ms overlapping: IPC / scheduling)';
    const e = cls.get(key) ?? { n: 0, ms: 0 };
    e.n++;
    e.ms += p.delay;
    cls.set(key, e);
    if (examples.length < 12 && top) examples.push(`delay ${p.delay.toFixed(1)} ms, blocking task ${((top.dur ?? 0) / 1000).toFixed(1)} ms: ${label(top)}`);
  }
  lines.push(`  - trace attribution of keys delayed > 4 ms (${delayed.length}), by the longest main-thread task overlapping [timeStamp, handler] (its biggest child):`);
  for (const [k, v] of [...cls].sort((x, y) => y[1].ms - x[1].ms)) lines.push(`      ${k}: ${v.n} keys, ${f(v.ms, 1)} ms total delay`);
  for (const x of examples) lines.push(`      e.g. ${x}`);
  // Longest main-thread tasks overall.
  const longest = [...tasks].sort((x, y) => (y.dur ?? 0) - (x.dur ?? 0)).slice(0, 8);
  lines.push(`  - longest main-thread tasks in the trace: ${longest.map((t) => `${((t.dur ?? 0) / 1000).toFixed(1)} ms [${label(t)}]`).join('; ')}`);
  const durs = tasks.map((t) => (t.dur ?? 0) / 1000);
  const busy = durs.reduce((x, y) => x + y, 0);
  const span = tasks.length ? (tasks.at(-1)!.ts - tasks[0]!.ts) / 1000 : 1;
  lines.push(`  - main thread: ${tasks.length} tasks, busy ${f((busy / span) * 100, 1)} % of ${f(span / 1000, 1)} s; tasks > 16 ms: ${durs.filter((d) => d > 16).length}, > 50 ms: ${durs.filter((d) => d > 50).length}; expected wait for a random key ≈ Σd²/(2T) = ${f(durs.reduce((x, d) => x + d * d, 0) / (2 * span), 2)} ms`);
}


/** Connects the session to a real WebSocket at `url` (a Socketish like WebSocketTransport), timing each message task. */
export function connectWs(url: string): void {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  const C = w.__c;
  C.msgs = [];
  const sock: any = {
    onOpen: null,
    onData: null,
    onClose: null,
    forceUtf8: true,
    ws: null as WebSocket | null,
    connect() {
      const ws = new WebSocket(url, ['binary']);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      ws.onopen = () => this.onOpen?.();
      ws.onmessage = (ev: MessageEvent) => {
        const t = performance.now();
        const b = new Uint8Array(ev.data as ArrayBuffer);
        this.onData?.(b);
        C.msgs.push([t, performance.now() - t, b.length]);
      };
      ws.onclose = (ev: CloseEvent) => this.onClose?.(`closed ${ev.code}`);
    },
    send(b: Uint8Array) {
      const ws = this.ws;
      if (ws && ws.readyState === 1) ws.send(b);
    },
    close() {
      this.ws?.close();
    },
  };
  w.__ws = sock;
  B.app.session.connect(sock);
}

/** Output queue drained (nothing queued, no flush pending). */
export function drained(): boolean {
  const w = window as unknown as Record<string, any>;
  const out = w.__wcBench.app.output;
  return out.queue.length === out.head && !out.frameScheduled;
}

/**
 * Applies the test profile again once a live-like connection has started:
 * connecting reloads the stored profile (App.onState → loadSelectedProfile),
 * which would replace the one `install` applied. Returns whether F1 is bound.
 */
export async function reapplyProfile(): Promise<boolean> {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  await new Promise((r) => setTimeout(r, 400));
  B.applyProfile(w.__c.profile);
  return B.app.script.hasMacro('F1') && B.app.script.hasMacro('Backquote');
}
