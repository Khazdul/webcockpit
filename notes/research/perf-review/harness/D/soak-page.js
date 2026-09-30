// In-page soak driver (perf review D). Evaluated in the `?bench` page by
// perf/soak.ts; talks to the app only through `window.__wcBench` (the
// production bench probe) and plain DOM/IndexedDB reads.
//
// window.__soak:
//   load(k)            fetch /__soak/loop<k>.{bin,json} (kept for the whole run)
//   play(k, speed, stopAt?) deliver loop k at `speed`× log time; commands are
//                      typed (synthetic Enter keydown on the input, i.e.
//                      InputPane → script engine → Session.send), frames go
//                      through the fake socket. Resolves at the end.
//   sample()           cheap counters and the stats since the last sample
//   probe(opts)        checkpoint probe: std frames at 25–60 ms, the 24-bit
//                      colour block, a 2000-line burst, key → send, idle gaps
//   idb()              record counts per store and storage estimate
(() => {
  if (window.__soak) return;
  const B = window.__wcBench;
  const S = {
    loops: [],
    probeData: null,
    playing: false,
    delivered: 0,
    typed: 0,
    // accumulators since the last sample
    acc: null,
  };
  const newAcc = () => ({
    t0: performance.now(),
    frames: 0,
    bytes: 0,
    keys: [],
    keyFail: 0,
    gaps: { n: 0, over20: 0, over34: 0, over50: 0, over100: 0, max: 0, sum: 0 },
    lateTimers: 0,
  });
  S.acc = newAcc();

  // rAF gap monitor: histogram only (no per-frame arrays).
  let lastRaf = performance.now();
  const raf = (t) => {
    const now = performance.now();
    const d = now - lastRaf;
    lastRaf = now;
    const g = S.acc.gaps;
    g.n++;
    g.sum += d;
    if (d > 20) g.over20++;
    if (d > 34) g.over34++;
    if (d > 50) g.over50++;
    if (d > 100) g.over100++;
    if (d > g.max) g.max = d;
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  const stats = (xs) => {
    if (xs.length === 0) return null;
    const s = Float64Array.from(xs).sort();
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, med: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] };
  };

  S.load = async (k) => {
    const [bin, idx] = await Promise.all([
      fetch(`/__soak/loop${k}.bin`).then((r) => r.arrayBuffer()),
      fetch(`/__soak/loop${k}.json`).then((r) => r.json()),
    ]);
    const n = idx.at.length;
    const at = Float64Array.from(idx.at);
    const len = Uint32Array.from(idx.len);
    const off = new Uint32Array(n);
    let o = 0;
    for (let i = 0; i < n; i++) {
      off[i] = o;
      o += len[i];
    }
    const sent = new Map(idx.sent);
    S.loops[k] = { bytes: new Uint8Array(bin), at, len, off, sent, n, lines: idx.lines, logMs: idx.logMs };
    return { n, lines: idx.lines, logMs: idx.logMs, sent: sent.size };
  };

  const sock = () => B.sock;

  const deliver = (L, i) => {
    const t = L.sent.get(i);
    if (t !== undefined) {
      const ms = B.keyToSend(t);
      S.typed++;
      if (ms >= 0) S.acc.keys.push(ms);
      else S.acc.keyFail++;
      return;
    }
    const n = L.len[i];
    if (n === 0) return;
    sock().onData(L.bytes.subarray(L.off[i], L.off[i] + n));
    S.acc.frames++;
    S.acc.bytes += n;
    S.delivered++;
  };

  // Plays loop k from frame `from` (default 0) to `to` (default the end).
  S.play = (k, speed, from = 0, to = Infinity) =>
    new Promise((resolve) => {
      const L = S.loops[k];
      const end = Math.min(L.n, to);
      let i = from;
      const base = L.at[from];
      const t0 = performance.now();
      S.playing = true;
      S.pos = { k, i };
      const step = () => {
        const el = (performance.now() - t0) * speed + base;
        const stop = performance.now() + 8;
        while (i < end && L.at[i] <= el) {
          deliver(L, i++);
          if (performance.now() > stop) break;
        }
        S.pos.i = i;
        if (i >= end) {
          S.playing = false;
          resolve({ frames: i - from, ms: performance.now() - t0 });
          return;
        }
        const wait = Math.max(0, (L.at[i] - el) / speed);
        setTimeout(step, wait);
      };
      step();
    });

  const q = (sel) => document.querySelectorAll(sel).length;

  S.sample = () => {
    const app = B.app;
    const fl = B.flushes;
    const script = [];
    const frame = [];
    for (const r of fl) {
      script.push(r.script);
      frame.push(r.frame);
    }
    fl.length = 0;
    const a = S.acc;
    S.acc = newAcc();
    const comm = app.cockpit.pane('comm');
    const ui = app.cockpit.pane('ui');
    const out = {
      t: performance.now(),
      wallS: (performance.now() - a.t0) / 1000,
      delivered: S.delivered,
      typed: S.typed,
      rows: app.output.rows,
      elements: document.getElementsByTagName('*').length,
      outputSpans: q('.wc-output span'),
      chunks: q('.wc-chunk'),
      bus: app.bus.total(),
      history: app.input.history.length,
      comm: comm.history ? comm.history.length : null,
      ui: ui.lines ? ui.lines.length : null,
      runEvents: app.runEvents.events.length,
      queue: app.output.queue.length - app.output.head,
      flush: stats(script),
      frame: stats(frame),
      key: stats(a.keys),
      keyFail: a.keyFail,
      frames: a.frames,
      bytes: a.bytes,
      gaps: a.gaps,
      mem: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null,
    };
    return out;
  };

  const waitFlush = () =>
    new Promise((resolve) => {
      B.waiters.push((rec) => resolve(rec));
    });

  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  S.probe = async (opts = {}) => {
    if (!S.probeData) {
      const p = await fetch('/__soak/probe.json').then((r) => r.json());
      S.probeData = { std: p.std.map(b64), rgb: b64(p.rgb), burst: p.burst.map(b64) };
    }
    const P = S.probeData;
    await B.drained();
    S.sample(); // reset accumulators
    const res = {};
    // 1. std frames at 25–60 ms (seeded)
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const script = [];
    const frame = [];
    const toPaint = [];
    for (const f of P.std) {
      const t0 = performance.now();
      const w = waitFlush();
      sock().onData(f);
      const rec = await w;
      script.push(rec.script);
      frame.push(rec.frame);
      toPaint.push(rec.start + rec.frame - t0);
      await pause(25 + rnd() * 35);
    }
    res.std = { script: stats(script), frame: stats(frame), toPaint: stats(toPaint) };
    B.flushes.length = 0;
    // 2. 24-bit colour block, 5 times
    const rs = [];
    const rf = [];
    for (let k = 0; k < 5; k++) {
      await pause(300);
      const w = waitFlush();
      sock().onData(P.rgb);
      const rec = await w;
      rs.push(rec.script);
      rf.push(rec.frame);
    }
    res.rgb = { script: stats(rs), frame: stats(rf) };
    // 3. burst: 10 × 16 KB in one task, then rAF gaps until drained
    await pause(300);
    B.flushes.length = 0;
    S.sample();
    const tb = performance.now();
    for (const f of P.burst) sock().onData(f);
    await B.drained();
    const bs = B.flushes.map((r) => r.script);
    const bfr = B.flushes.map((r) => r.frame);
    const g = S.sample();
    res.burst = { ms: performance.now() - tb, flushes: bs.length, script: stats(bs), frame: stats(bfr), gapMax: g.gaps.max, over50: g.gaps.over50 };
    // 4. key → send, 100 samples
    await pause(300);
    const ks = [];
    for (let k = 0; k < 100; k++) {
      ks.push(B.keyToSend('look'));
      if (k % 10 === 0) await pause(20);
    }
    res.key = stats(ks.filter((x) => x >= 0));
    // 5. idle: rAF gaps for `idleMs`
    await B.drained();
    S.sample();
    await pause(opts.idleMs ?? 5000);
    const gi = S.sample();
    res.idle = gi.gaps;
    B.flushes.length = 0;
    return res;
  };

  S.idb = async () => {
    const est = await navigator.storage.estimate();
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('webcockpit');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const counts = {};
    const names = [...db.objectStoreNames];
    await Promise.all(
      names.map(
        (n) =>
          new Promise((res) => {
            const r = db.transaction(n, 'readonly').objectStore(n).count();
            r.onsuccess = () => {
              counts[n] = r.result;
              res();
            };
            r.onerror = () => res();
          }),
      ),
    );
    db.close();
    return { usage: est.usage, details: est.usageDetails ?? null, counts };
  };

  window.__soak = S;
})();
