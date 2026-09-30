// How does Chromium collect old, detached DOM (dropped scrollback chunks)?
// Builds 20 000 rows in 100 chunks (like the output pane), lets them age
// through minor GCs, then keeps appending/dropping chunks; watches the
// renderer's Nodes metric and the --trace-gc lines. No forced GC.
//   node perf/probe-oilpan.ts
const { chromium } = await import('@playwright/test');
const server = await chromium.launchServer({ args: ['--js-flags=--trace-gc'] });
const lines: string[] = [];
let carry = '';
const onData = (d: Buffer): void => {
  const parts = (carry + d.toString()).split('\n');
  carry = parts.pop() ?? '';
  for (const l of parts) if (/ms: (Scavenge|Mark-Compact|Minor)/.test(l)) lines.push(`${Date.now()} ${l}`);
};
server.process().stdout?.on('data', onData);
server.process().stderr?.on('data', onData);
const b = await chromium.connect(server.wsEndpoint());
const page = await b.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await page.setContent('<div id=rows style="height:600px;overflow:auto"></div>');
const nodes = async (): Promise<number> => {
  const m = (await cdp.send('Performance.getMetrics')) as { metrics: Array<{ name: string; value: number }> };
  return m.metrics.find((x) => x.name === 'Nodes')!.value;
};
await page.evaluate(() => {
  const rows = document.getElementById('rows')!;
  (window as any).__k = 0;
  (window as any).__chunk = () => {
    const c = document.createElement('div');
    c.style.contain = 'content';
    for (let i = 0; i < 200; i++) {
      const r = document.createElement('div');
      const s = document.createElement('span');
      s.className = 'c' + (i % 7);
      s.textContent = 'coloured part ' + (window as any).__k++;
      r.append(s, document.createTextNode(' and the rest of the line, some seventy characters long.'));
      c.appendChild(r);
    }
    rows.appendChild(c);
    if (rows.childElementCount > 100) rows.firstElementChild!.remove();
    rows.scrollTop = rows.scrollHeight;
  };
});
// Fill 100 chunks.
await page.evaluate(async () => {
  for (let i = 0; i < 100; i++) {
    (window as any).__chunk();
    await new Promise((r) => requestAnimationFrame(r));
  }
});
console.log('filled', await nodes());
// Churn: one chunk per 50 ms (≈ 4000 rows/s) for 60 s, sample Nodes every 5 s.
const t0 = Date.now();
const churn = page.evaluate(async () => {
  const end = performance.now() + 60000;
  while (performance.now() < end) {
    (window as any).__chunk();
    await new Promise((r) => setTimeout(r, 50));
  }
});
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const n = await nodes();
  const mc = lines.filter((l) => /Mark-Compact/.test(l)).length;
  const sc = lines.filter((l) => /Scavenge|Minor/.test(l)).length;
  console.log(`t ${((Date.now() - t0) / 1000).toFixed(0)} s: Nodes ${n}, mark-compacts ${mc}, scavenges ${sc}`);
}
await churn;
for (const l of lines.filter((l) => /Mark-Compact/.test(l)).slice(0, 10)) console.log(l.slice(0, 260));
await b.close();
await server.close();
