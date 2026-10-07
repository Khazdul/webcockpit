// The start page under a slow link (ADR 0083). Takes a screenshot series
// and logs what the page shows, and samples every menu row's opacity per
// frame (the selected row must never lead the others).
//
//   node scripts/throttled-start.ts [--profile 3g|4g|none] [--browser chromium|firefox]
//       [--via cdp|proxy] [--kbit n] [--latency ms] [--dev] [--gzip]
//       [--every 500] [--video] [--out test-results/throttled/...] [--url http://...]
//
// --via cdp (default for Chromium): Chromium's own network emulation
// (`Network.emulateNetworkConditions`, cache disabled). --via proxy (the
// only way for Firefox): scripts/throttle-proxy.ts in front of the server,
// `--kbit`/`--latency` default to the profile's. The server: dist/ on
// scripts/static-server.ts (port 4187; `npm run build` first), or with
// --dev a vite dev server (port 5199), or --url. --gzip makes the proxy
// compress text like GitHub Pages.
// Profiles: 3g = Regular 3G (750 kbit/s down, 100 ms latency), 4g = Regular
// 4G (4 Mbit/s, 20 ms), none = unthrottled.
// Screenshots wait for the web fonts, so they never show text that a
// loading face hides; --video records what is really on screen (Playwright's
// recording; cut frames out of it with ffmpeg).
// Each line: ms since navigation, banner (first paint / app), loader %,
// the start page's opacity and every menu row's opacity (the selected
// one marked *). At the end: the fade of each row and the largest lead of
// any row over the others during the reveal.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Server } from 'node:http';
import { chromium, firefox } from '@playwright/test';
import { startProxy } from './throttle-proxy.ts';

const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const PROFILES = {
  '3g': { latency: 100, downloadThroughput: (750 * 1000) / 8, uploadThroughput: (250 * 1000) / 8 },
  '4g': { latency: 20, downloadThroughput: (4000 * 1000) / 8, uploadThroughput: (3000 * 1000) / 8 },
  none: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
} as const;
const KBIT = { '3g': 750, '4g': 4000, none: 0 } as const;

const profile = arg('profile', '3g') as keyof typeof PROFILES;
const browserName = arg('browser', 'chromium') as 'chromium' | 'firefox';
const via = arg('via', browserName === 'firefox' ? 'proxy' : 'cdp');
const dev = flag('dev');
const every = Number(arg('every', '500'));
const out = arg('out', `test-results/throttled/${browserName}-${dev ? 'dev' : 'prod'}-${via}-${profile}`);
let url = arg('url', '');
mkdirSync(out, { recursive: true });

const children: ChildProcess[] = [];
let proxy: Server | null = null;
const wait = async (u: string): Promise<void> => {
  for (let i = 0; i < 100; i++) {
    if (await fetch(u).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no server at ${u}`);
};
if (!url) {
  if (dev) {
    children.push(spawn('npx', ['vite', '--port', '5199', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' }));
    url = 'http://127.0.0.1:5199/';
  } else {
    children.push(spawn(process.execPath, ['scripts/static-server.ts', 'dist', '--port', '4187'], { stdio: 'ignore' }));
    url = 'http://127.0.0.1:4187/';
  }
  await wait(url);
}
if (via === 'proxy') {
  const port = 4271; // not 4190: browsers block it (ManageSieve)
  proxy = await startProxy({
    target: url,
    port,
    kbit: Number(arg('kbit', String(KBIT[profile]))),
    latency: Number(arg('latency', String(PROFILES[profile].latency))),
    gzip: flag('gzip'),
  });
  url = `http://127.0.0.1:${port}/`;
}

const browser = await (browserName === 'firefox' ? firefox : chromium).launch();
try {
  const video = flag('video');
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    ...(video ? { recordVideo: { dir: out, size: { width: 1280, height: 800 } } } : {}),
  });
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (via === 'cdp') await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[profile] });
  }
  // Per frame, from the first menu row on: every row's effective opacity.
  await page.addInitScript(() => {
    type Sample = { t: number; ready: boolean; rows: number[]; sel: number; loading: number };
    const log: Sample[] = [];
    (window as unknown as { __fade: typeof log }).__fade = log;
    const eff = (el: Element | null): number => {
      let o = 1;
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    // When each web font face starts and ends loading (font-display: block hides text meanwhile).
    const fontLog: string[] = [];
    (window as unknown as { __fontLog: typeof fontLog }).__fontLog = fontLog;
    const seen = new Map<FontFace, string>();
    let readyAt = 0;
    const tick = (): void => {
      for (const f of document.fonts) {
        if (seen.get(f) !== f.status) {
          seen.set(f, f.status);
          if (f.status !== 'unloaded') fontLog.push(`${Math.round(performance.now())} ${f.family.replace(/"/g, '')} ${f.weight} ${f.status}`);
        }
      }
      if (document.documentElement.dataset.wcBoot === 'ready' && !fontLog.some((l) => l.endsWith('reveal'))) {
        fontLog.push(`${Math.round(performance.now())} reveal`);
      }
      const rows = [...document.querySelectorAll('.wc-start-main .wc-mrow')];
      if (rows.length) {
        const ready = document.documentElement.dataset.wcBoot === 'ready';
        if (ready && !readyAt) readyAt = performance.now();
        log.push({
          t: performance.now(),
          ready,
          rows: rows.map((r) => Math.round(eff(r) * 1000) / 1000),
          sel: rows.findIndex((r) => r.classList.contains('is-sel')),
          loading: [...document.fonts].filter((f) => f.status === 'loading').length,
        });
        if (readyAt && performance.now() - readyAt > 3000) return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const videoT0 = Date.now();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  let readyAt = 0;
  for (let n = 0; ; n++) {
    const ms = Date.now() - t0;
    const s = await page
      .evaluate(() => {
        const eff = (el: Element | null): number => {
          let o = 1;
          for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
          return Math.round(o * 100) / 100;
        };
        const bar = document.getElementById('wc-boot');
        const mount = document.querySelector<HTMLElement>('.wc-start-main')?.closest('.wc-start-host > div');
        return {
          first: !!document.querySelector('#wc-first .wcf-banner'),
          app: !!document.querySelector('.wc-start .wc-banner'),
          pct: bar ? bar.getAttribute('aria-valuenow') : null,
          label: bar?.querySelector('.l')?.textContent ?? null,
          mount: mount ? getComputedStyle(mount).opacity : null,
          rows: [...document.querySelectorAll('.wc-start-main .wc-mrow')]
            .map((r) => `${eff(r)}${r.classList.contains('is-sel') ? '*' : ''}`)
            .join(' '),
          loading: [...document.fonts]
            .filter((f) => f.status === 'loading')
            .map((f) => `${f.family.replace(/"/g, '')}${f.weight === 'bold' || f.weight === '700' ? ' bold' : ''}`)
            .join(','),
          ready: document.documentElement.dataset.wcBoot === 'ready',
        };
      })
      .catch(() => null);
    await page.screenshot({ path: join(out, `${String(n).padStart(3, '0')}-${ms}ms.png`) }).catch(() => undefined);
    console.log(`${String(ms).padStart(6)} ms`, JSON.stringify(s));
    if (s?.ready && !readyAt) readyAt = Date.now();
    if (readyAt && Date.now() - readyAt > 2600) break;
    if (ms > 150_000) break;
    await new Promise((r) => setTimeout(r, every));
  }
  const paints = await page.evaluate(() =>
    performance.getEntriesByType('paint').map((e) => `${e.name} ${Math.round(e.startTime)} ms`),
  );
  console.log(paints.join(', '));
  type Sample = { t: number; ready: boolean; rows: number[]; sel: number; loading: number };
  const fade = await page.evaluate(() => (window as unknown as { __fade: Sample[] }).__fade);
  const early = fade.filter((f) => !f.ready && Math.max(...f.rows) > 0);
  const live = fade.filter((f) => f.ready);
  if (live.length) {
    const start = live[0]!.t;
    let gap = 0;
    let lead = 0;
    let leadAt = 0;
    for (let i = 0; i < live.length; i++) {
      if (i) gap = Math.max(gap, live[i]!.t - live[i - 1]!.t);
      const r = live[i]!.rows;
      const d = Math.max(...r) - Math.min(...r);
      if (d > lead) [lead, leadAt] = [d, live[i]!.t - start];
    }
    const at = (o: number, k: number): string => {
      const f = live.find((s) => (s.rows[k] ?? 0) >= o);
      return f ? `${Math.round(f.t - start)}` : 'never';
    };
    console.log(`reveal: ${live.length} frames, longest gap ${Math.round(gap)} ms`);
    for (let k = 0; k < live[0]!.rows.length; k++) {
      console.log(`  row ${k}${k === live[0]!.sel ? '*' : ' '} opacity 0.1 at ${at(0.1, k)} ms, 0.5 at ${at(0.5, k)}, 0.99 at ${at(0.99, k)}`);
    }
    console.log(`largest spread between rows: ${lead.toFixed(3)} at ${Math.round(leadAt)} ms`);
  }
  const fontLog = await page.evaluate(() => (window as unknown as { __fontLog: string[] }).__fontLog);
  console.log(`font faces (ms since navigation):\n  ${fontLog.join('\n  ')}`);
  console.log(`frames with a row visible before the reveal: ${early.length}`);
  // font-display: block hides all text of a style while one of its faces loads; opacity does not show that.
  const hidden = live.filter((f) => f.loading > 0 && Math.max(...f.rows) > 0);
  console.log(`frames of the reveal with a font face still loading (text hidden): ${hidden.length}`);
  console.log(`screenshots in ${out}`);
  if (video) {
    const origin = await page.evaluate(() => performance.timeOrigin).catch(() => 0);
    await page.close();
    const ready = live[0] ? ((origin + live[0].t - videoT0) / 1000).toFixed(2) : '?';
    console.log(`video: ${await page.video()?.path()} (the reveal starts at about ${ready} s of it)`);
  }
} finally {
  await browser.close();
  proxy?.close();
  proxy?.closeAllConnections();
  for (const c of children) c.kill();
}
