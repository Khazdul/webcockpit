// Quick check of memory/GC APIs available in the Playwright browsers.
//   node perf/probe-apis.ts   (after npm run build)
const { chromium, firefox } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ preview: { port: 4231, strictPort: true }, logLevel: 'warn' });
const base = 'http://localhost:4231';
for (const [name, type, opts] of [
  ['chromium', chromium, {}],
  ['firefox', firefox, { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': '2' } }],
] as const) {
  const b = await type.launch(opts as never);
  const ctx = await b.newContext({ viewport: { width: 1728, height: 1050 }, ...(name === 'chromium' ? { deviceScaleFactor: 2 } : {}) });
  const p = await ctx.newPage();
  await p.goto(`${base}/?bench`);
  await p.waitForFunction(() => (window as any).__wcBench?.app != null);
  const r = await p.evaluate(async () => {
    const out: Record<string, unknown> = {
      ua: navigator.userAgent,
      coi: (globalThis as any).crossOriginIsolated,
      dpr: devicePixelRatio,
      memory: (performance as any).memory ? JSON.stringify({ u: (performance as any).memory.usedJSHeapSize }) : null,
      muasm: typeof (performance as any).measureUserAgentSpecificMemory,
      locks: typeof navigator.locks,
      idb: typeof indexedDB,
      estimate: JSON.stringify(await navigator.storage.estimate()),
      nodes: document.getElementsByTagName('*').length,
      busTotal: (window as any).__wcBench.app.bus.total(),
    };
    if (typeof (performance as any).measureUserAgentSpecificMemory === 'function') {
      try {
        const m = await (performance as any).measureUserAgentSpecificMemory();
        out.muasmBytes = m.bytes;
      } catch (e) {
        out.muasmErr = String(e);
      }
    }
    return out;
  });
  console.log(name, b.version(), JSON.stringify(r));
  await b.close();
}
await new Promise<void>((r) => server.httpServer.close(() => r()));
