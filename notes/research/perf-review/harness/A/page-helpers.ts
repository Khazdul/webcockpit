// Page-side helpers (serialised into the `?bench` page with page.evaluate).
// They use the bench probe's (private at compile time, reachable at run
// time) fake socket and flush waiters, so the app's own path runs:
// socket bytes → telnet → assembler → bus → script engine → output pane.

export interface InjectResult {
  /** Synchronous ingest time: onData() call, ms. */
  ingest: number;
  /** Receipt → end of the flush that rendered it, ms. */
  toFlush: number;
  /** Receipt → after that frame's rendering (MessageChannel after rAF), ms. */
  toPaint: number;
  /** Flush script time, ms. */
  script: number;
  /** rAF callback start → after rendering, ms. */
  frame: number;
  /** performance.now() at the flush's rAF start. */
  flushStart: number;
  rowsAdded: number;
  /** Long animation frames overlapping the flush (Chromium). */
  loaf: Array<{ start: number; duration: number; renderStart: number; styleAndLayoutStart: number; blocking: number }>;
}

/** Installs window.__perf. Self-contained: serialised by Playwright. */
export function installPerf(): void {
  type Probe = {
    sock: { onData: (b: Uint8Array) => void };
    waiters: Array<(r: { start: number; script: number; frame: number }) => void>;
    flushes: Array<{ start: number; script: number; frame: number }>;
    app: { output: { rows: number; scroller: HTMLElement } };
    connectFake(): void;
    drained(): Promise<void>;
  };
  const probe = (window as unknown as { __wcBench: Probe }).__wcBench;
  const loaf: Array<{ start: number; duration: number; renderStart: number; styleAndLayoutStart: number; blocking: number }> = [];
  const types = PerformanceObserver.supportedEntryTypes ?? [];
  if (types.includes('long-animation-frame')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as Array<PerformanceEntry & { renderStart: number; styleAndLayoutStart: number; blockingDuration: number }>) {
        loaf.push({ start: e.startTime, duration: e.duration, renderStart: e.renderStart, styleAndLayoutStart: e.styleAndLayoutStart, blocking: e.blockingDuration });
        if (loaf.length > 2000) loaf.splice(0, 1000);
      }
    }).observe({ type: 'long-animation-frame' });
  }
  const mon = { deltas: [] as number[], stamps: [] as number[], run: false };
  const perf = {
    probe,
    loaf,
    mon,
    connect(): void {
      probe.connectFake();
    },
    /** Feeds bytes as one socket frame; resolves after the frame that rendered them. */
    inject(bytes: Uint8Array): Promise<unknown> {
      return new Promise((resolve) => {
        let t0 = 0;
        let ingest = 0;
        const rows0 = probe.app.output.rows;
        probe.waiters.push((rec) => {
          // Let a trailing LoAF entry arrive.
          setTimeout(() => {
            const end = rec.start + rec.frame;
            resolve({
              ingest,
              toFlush: rec.start + rec.script - t0,
              toPaint: rec.start + rec.frame - t0,
              script: rec.script,
              frame: rec.frame,
              flushStart: rec.start,
              rowsAdded: probe.app.output.rows - rows0,
              loaf: loaf.filter((e) => e.start <= end && e.start + e.duration >= rec.start),
            });
          }, 60);
        });
        t0 = performance.now();
        probe.sock.onData(bytes);
        ingest = performance.now() - t0;
      });
    },
    /** Feeds frames at their times (ms after now); resolves when drained. */
    async timed(frames: Array<{ atMs: number; bytes: Uint8Array }>): Promise<unknown> {
      const f0 = probe.flushes.length;
      const t0 = performance.now();
      perf.monStart();
      await new Promise<void>((resolve) => {
        let i = 0;
        const next = (): void => {
          while (i < frames.length && performance.now() - t0 >= frames[i]!.atMs) probe.sock.onData(frames[i++]!.bytes);
          if (i < frames.length) setTimeout(next, Math.max(0, frames[i]!.atMs - (performance.now() - t0)));
          else resolve();
        };
        next();
      });
      await probe.drained();
      const deltas = perf.monStop();
      const fl = probe.flushes.slice(f0);
      const last = fl.length ? fl[fl.length - 1]! : null;
      return {
        flushes: fl.map((f) => ({ script: f.script, frame: f.frame })),
        maxScript: Math.max(0, ...fl.map((f) => f.script)),
        maxFrame: Math.max(0, ...fl.map((f) => f.frame)),
        // First delivery → end of the last frame with a flush.
        total: last ? last.start + last.frame - t0 : 0,
        maxGap: Math.max(0, ...deltas),
        gaps: deltas,
      };
    },
    monStart(): void {
      mon.deltas = [];
      mon.run = true;
      let last = performance.now();
      const tick = (): void => {
        const now = performance.now();
        mon.deltas.push(now - last);
        last = now;
        if (mon.run) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    monStop(): number[] {
      mon.run = false;
      return mon.deltas.slice(1);
    },
    drained(): Promise<void> {
      return probe.drained();
    },
    counts(): { rows: number; spans: number; nodes: number; chunks: number } {
      const rows = document.querySelectorAll('.wc-rows .wc-row').length;
      const spans = document.querySelectorAll('.wc-rows span').length;
      const chunks = document.querySelectorAll('.wc-rows .wc-chunk').length;
      let nodes = 0;
      const w = document.createTreeWalker(document.querySelector('.wc-rows')!);
      while (w.nextNode()) nodes++;
      return { rows, spans, nodes, chunks };
    },
  };
  (window as unknown as { __perf: typeof perf }).__perf = perf;
}
