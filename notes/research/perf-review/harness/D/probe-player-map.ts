// Does a player App start its own map worker? (perf review D)
//   node perf/probe-player-map.ts
import { readdirSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const chunk = readdirSync(`${root}dist/assets`).find((f) => /^player-host-.*\.js$/.test(f))!;
const { chromium } = await import('@playwright/test');
const { preview } = await import('vite');
const server = await preview({ root, preview: { port: 4236, strictPort: true }, logLevel: 'warn' });
const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=vulkan'] });
const ctx = await b.newContext({ viewport: { width: 1728, height: 1050 }, deviceScaleFactor: 2 });
await ctx.addInitScript({ path: new URL('./instrument.js', import.meta.url).pathname });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => console.log('console:', m.text().slice(0, 200)));
await page.goto('http://localhost:4236/?bench');
await page.waitForFunction(() => (window as any).__wcBench?.app != null);
const r = await page.evaluate(async (chunk) => {
  const B = (window as any).__wcBench;
  B.app.el.style.display = 'none';
  await new Promise((res, rej) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `/assets/${chunk.replace(/-[^-]+\.js$/, '')}` + '-C3OpFCpP.css';
    l.onload = res;
    l.onerror = rej;
    document.head.appendChild(l);
  });
  const mod = await import(`/assets/${chunk}`);
  const text = await fetch('/__soak/loop2.log').then((r) => r.text());
  const us = Number(text.slice(0, 16));
  const host = new mod.PlayerHost({ root: document.getElementById('app'), settings: B.settings, onClose: () => {} });
  host.openChain([{ meta: { runId: 'R/p', character: 'Rasta', startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 }, text }], [], { character: 'Rasta' });
  await new Promise((r) => setTimeout(r, 4000));
  const map = document.querySelector('.wc-player .wc-pane-map') as HTMLElement | null;
  const out = {
    settingsMapOn: B.settings.get().panes.map.on,
    playerMap: !!map,
    hidden: map?.hidden,
    state: (map?.querySelector('.wc-pane-content') as HTMLElement | null)?.dataset.mapState,
    workers: (window as any).__inst.counts().workers,
    panes: [...document.querySelectorAll('.wc-player .wc-pane')].map((p) => `${(p as HTMLElement).dataset.pane}:${(p as HTMLElement).hidden ? 'hidden' : 'shown'}`),
    cockpit: { ...((document.querySelector('.wc-player .wc-cockpit') as HTMLElement | null)?.dataset ?? {}) },
    playerBox: (() => {
      const r = document.querySelector('.wc-player')!.getBoundingClientRect();
      return [r.width, r.height];
    })(),
    stageBox: (() => {
      const r = document.querySelector('.wc-player-stage')!.getBoundingClientRect();
      return [r.width, r.height];
    })(),
    cellVars: getComputedStyle(document.querySelector('.wc-player')!).getPropertyValue('--cell-w') + ' ' + getComputedStyle(document.querySelector('.wc-player')!).getPropertyValue('--cell-h'),
    layout: JSON.stringify(B.settings.get().layout).slice(0, 300),
  };
  host.close();
  return out;
}, chunk);
console.log(JSON.stringify(r));
await b.close();
await new Promise<void>((res) => server.httpServer.close(() => res()));
