// The start page under real network throttling (ADR 0083): Chromium's
// own emulation over CDP (`Network.emulateNetworkConditions`, cache
// disabled), not route delays, against a production build. Takes a
// screenshot series and logs, per frame, what the page shows.
//
//   npm run build && node scripts/throttled-start.ts [--profile 3g|4g|none]
//       [--every 500] [--out test-results/throttled] [--url http://...]
//
// Without --url it serves dist/ with scripts/static-server.ts on port 4187.
// Profiles: 3g = Regular 3G (750 kbit/s down, 250 up, 100 ms latency),
// 4g = Regular 4G (4 Mbit/s down, 3 up, 20 ms), none = unthrottled.
// Each line: ms since navigation, banner (first paint / app), loader %,
// the start page's opacity and the first menu row's opacity. What to look
// for: the banner from the first frames on, the bar moving, no menu row
// before the reveal, then the fade over about 2 s.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};

const PROFILES = {
  '3g': { latency: 100, downloadThroughput: (750 * 1000) / 8, uploadThroughput: (250 * 1000) / 8 },
  '4g': { latency: 20, downloadThroughput: (4000 * 1000) / 8, uploadThroughput: (3000 * 1000) / 8 },
  none: { latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
} as const;

const profile = arg('profile', '3g') as keyof typeof PROFILES;
const every = Number(arg('every', '500'));
const out = arg('out', `test-results/throttled/${profile}`);
let url = arg('url', '');
mkdirSync(out, { recursive: true });

let server: ReturnType<typeof spawn> | null = null;
if (!url) {
  server = spawn(process.execPath, ['scripts/static-server.ts', 'dist', '--port', '4187'], { stdio: 'ignore' });
  url = 'http://127.0.0.1:4187/';
  await new Promise((r) => setTimeout(r, 600));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...PROFILES[profile] });
  // Per frame from the reveal on: the first menu row's opacity (is the fade drawn, and how long).
  await page.addInitScript(() => {
    const log: [number, number][] = [];
    (window as unknown as { __fade: typeof log }).__fade = log;
    const tick = (): void => {
      if (document.documentElement.dataset.wcBoot === 'ready') {
        let el: Element | null = document.querySelector('.wc-start-main .wc-mrow');
        while (el && el.parentElement && !el.parentElement.classList.contains('wc-start-main')) el = el.parentElement;
        log.push([performance.now(), el ? Number(getComputedStyle(el).opacity) : -1]);
        if (log.length > 1 && log[log.length - 1]![0] - log[0]![0] > 3000) return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  let readyAt = 0;
  for (let n = 0; ; n++) {
    const ms = Date.now() - t0;
    const s = await page
      .evaluate(() => {
        const first = !!document.querySelector('#wc-first .wcf-banner');
        const app = !!document.querySelector('.wc-start .wc-banner');
        const bar = document.getElementById('wc-boot');
        const mount = document.querySelector<HTMLElement>('.wc-start-main')?.closest('.wc-start-host > div');
        const main = document.querySelector('.wc-start-main');
        const row = document.querySelector('.wc-start-main .wc-mrow');
        let rowEl: Element | null = row;
        while (rowEl && rowEl.parentElement !== main) rowEl = rowEl.parentElement;
        return {
          first,
          app,
          pct: bar ? bar.getAttribute('aria-valuenow') : null,
          label: bar?.querySelector('.l')?.textContent ?? null,
          mount: mount ? getComputedStyle(mount).opacity : null,
          row: rowEl ? getComputedStyle(rowEl).opacity : null,
          ready: document.documentElement.dataset.wcBoot === 'ready',
        };
      })
      .catch(() => null);
    await page.screenshot({ path: join(out, `${String(n).padStart(3, '0')}-${ms}ms.png`) }).catch(() => undefined);
    console.log(`${String(ms).padStart(6)} ms`, JSON.stringify(s));
    if (s?.ready && !readyAt) readyAt = Date.now();
    if (readyAt && Date.now() - readyAt > 2600) break;
    if (ms > 120_000) break;
    await new Promise((r) => setTimeout(r, every));
  }
  const paints = await page.evaluate(() =>
    performance.getEntriesByType('paint').map((e) => `${e.name} ${Math.round(e.startTime)} ms`),
  );
  console.log(paints.join(', '));
  const fade = await page.evaluate(() => (window as unknown as { __fade: [number, number][] }).__fade);
  if (fade.length) {
    const start = fade[0]![0];
    const at = (o: number): string => {
      const f = fade.find(([, v]) => v >= o);
      return f ? `${Math.round(f[0] - start)} ms` : 'never';
    };
    let gap = 0;
    for (let i = 1; i < fade.length; i++) gap = Math.max(gap, fade[i]![0] - fade[i - 1]![0]);
    console.log(
      `fade of the first menu row: ${fade.length} frames, longest gap ${Math.round(gap)} ms; ` +
        `opacity 0.1 at ${at(0.1)}, 0.5 at ${at(0.5)}, 0.99 at ${at(0.99)} after the reveal`,
    );
  }
  console.log(`screenshots in ${out}`);
} finally {
  await browser.close();
  server?.kill();
}
