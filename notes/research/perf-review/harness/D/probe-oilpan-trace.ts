// Which trace events show Chromium's DOM (cppgc/Oilpan) garbage collections
// and how long do their main-thread parts take? Same churn as
// perf/probe-oilpan.ts (100 chunks × 200 rows, a chunk per 50 ms), traced.
//   node perf/probe-oilpan-trace.ts [rowsPerChunk=200] [chunks=100]
const ROWS = Number(process.argv[2] ?? 200);
const CHUNKS = Number(process.argv[3] ?? 100);
const { chromium } = await import('@playwright/test');
const b = await chromium.launch();
const page = await b.newPage();
await page.setContent('<div id=rows style="height:600px;overflow:auto"></div>');
await page.evaluate(({ ROWS, CHUNKS }) => {
  const rows = document.getElementById('rows')!;
  (window as any).__k = 0;
  (window as any).__chunk = () => {
    const c = document.createElement('div');
    c.style.contain = 'content';
    for (let i = 0; i < ROWS; i++) {
      const r = document.createElement('div');
      const s = document.createElement('span');
      s.className = 'c' + (i % 7);
      s.textContent = 'coloured part ' + (window as any).__k++;
      r.append(s, document.createTextNode(' and the rest of the line, some seventy characters long.'));
      c.appendChild(r);
    }
    rows.appendChild(c);
    if (rows.childElementCount > CHUNKS) rows.firstElementChild!.remove();
    rows.scrollTop = rows.scrollHeight;
  };
}, { ROWS, CHUNKS });
await page.evaluate(async (n) => {
  for (let i = 0; i < n; i++) {
    (window as any).__chunk();
    await new Promise((r) => requestAnimationFrame(r));
  }
}, CHUNKS);
await b.startTracing(page, { categories: ['devtools.timeline', 'v8', 'v8.gc', 'disabled-by-default-v8.gc', 'cppgc', 'blink_gc', 'disabled-by-default-cppgc', 'disabled-by-default-blink_gc'] });
await page.evaluate(async () => {
  const end = performance.now() + 30000;
  while (performance.now() < end) {
    (window as any).__chunk();
    await new Promise((r) => setTimeout(r, 50));
  }
});
const buf = await b.stopTracing();
const ev = (JSON.parse(buf.toString()) as { traceEvents: any[] }).traceEvents;
const main = new Set(ev.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`));
const agg = new Map<string, { n: number; sum: number; max: number; mainN: number; mainMax: number }>();
for (const e of ev) {
  if (e.ph !== 'X' || !/GC|gc|Gc|Mark|Sweep|Scaveng|Compact/.test(e.name)) continue;
  const d = (e.dur ?? 0) / 1000;
  const a = agg.get(e.name) ?? agg.set(e.name, { n: 0, sum: 0, max: 0, mainN: 0, mainMax: 0 }).get(e.name)!;
  a.n++;
  a.sum += d;
  a.max = Math.max(a.max, d);
  if (main.has(`${e.pid}:${e.tid}`)) {
    a.mainN++;
    a.mainMax = Math.max(a.mainMax, d);
  }
}
const rows = [...agg.entries()].sort((x, y) => y[1].sum - x[1].sum).slice(0, 40);
console.log(`rows/chunk ${ROWS}, chunks ${CHUNKS}: event, count, sum ms, max ms, on main thread count/max`);
for (const [k, a] of rows) console.log(`${k.padEnd(52)} ${String(a.n).padStart(5)} ${a.sum.toFixed(1).padStart(8)} ${a.max.toFixed(2).padStart(8)}   ${a.mainN}/${a.mainMax.toFixed(2)}`);
await b.close();
