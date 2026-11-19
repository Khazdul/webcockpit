// Does the morph's proxy keep flying while the main thread is busy?
// (stage 74 B, ADR 0164)
//
//   node bench/transition-stall.ts --dist DIR [--stall 500] [--at 320] [--out FILE]
//
// Serves the build in `--dist` (`vite preview`; build it first: `npx vite
// build --outDir DIR`), opens the start page as a phone (360 × 800 at
// ratio 2, a frozen sky), taps About and, `--at` ms after the tap (the
// proxy is a little into its flight), blocks the page's main thread for
// `--stall` ms with a busy loop: what a first-use cost of the new page, a
// chunk's evaluation or a garbage collection does at a bad moment.
//
// The page cannot see its own compositor, so the proxy is watched from
// outside: a DevTools screencast (every frame the compositor presents, as
// a picture with its time), and in each picture the row of the proxy's
// top edge. Printed and written: per presented frame its time from the
// first one after the tap and that row; then how many frames were
// presented during the block and how many different rows the edge took in
// them. A proxy that needs the main thread shows one row for the whole
// block and then jumps; one that flies on the compositor moves on every
// frame.
//
// Headless Chromium; the compositor and the GPU are this machine's.

import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});

const L = await import('./lib');
const { preview } = await import('vite');
const sharp = (await import('sharp')).default;

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const DIST = resolve(opt('dist', 'dist'));
const STALL = Number(opt('stall', '500'));
const AT = Number(opt('at', '320'));
const OUT = opt('out', '');

const port = await new Promise<number>((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address() as { port: number };
    s.close(() => res(port));
  });
});
const server = await preview({ preview: { port, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn', build: { outDir: DIST } });
const base = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
const lines: string[] = [];
try {
  const t = await L.launchTarget('chromium', { width: 360, height: 800, dpr: 2 });
  const ctx = await t.browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${base}/?skyHour=19.1&skyMonth=0&skyDay=21&skyYear=3040&skyFreeze&phone=1`);
  await page.waitForSelector('html[data-wc-boot="ready"]', { timeout: 60_000 });
  await L.pause(2500);
  const cdp = await ctx.newCDPSession(page);
  const frames: { data: string; ts: number; got: number }[] = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, ts: f.metadata.timestamp ?? 0, got: Date.now() });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  await L.pause(300);
  const t0 = Date.now();
  await page.evaluate(
    ({ at, stall }) => {
      document.querySelector<HTMLElement>('.wc-start .wc-sm-item[data-key="about"]')!.click();
      setTimeout(() => {
        const t = performance.now();
        while (performance.now() - t < stall) {
          // the main thread is busy
        }
      }, at);
    },
    { at: AT, stall: STALL },
  );
  await L.pause(AT + STALL + 1200);
  await cdp.send('Page.stopScreencast');
  await t.browser.close();

  const after = frames.filter((f) => f.got >= t0);
  const first = after[0]?.ts ?? 0;
  const rows: { ms: number; top: number }[] = [];
  for (const f of after) {
    const { data, info } = await sharp(Buffer.from(f.data, 'base64')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // The proxy's top edge, right of the hood: from the top, the first row where the iron's lit line stands out
    // from the night sky above it (a moving edge lies between pixel rows: its black border is then grey).
    const x = Math.round(info.width * 0.8);
    const sum = (y: number): number => data[(y * info.width + x) * 3]! + data[(y * info.width + x) * 3 + 1]! + data[(y * info.width + x) * 3 + 2]!;
    let top = -1;
    for (let y = 3; y < info.height; y++) {
      if (sum(y) - sum(y - 3) > 150) {
        top = y;
        break;
      }
    }
    rows.push({ ms: Math.round((f.ts - first) * 1000), top });
  }
  const during = rows.filter((r) => r.ms >= AT + 30 && r.ms <= AT + STALL - 30);
  const seen = new Set(during.filter((r) => r.top >= 0).map((r) => r.top));
  lines.push(`# The proxy during a ${STALL} ms block of the main thread, ${AT} ms after the tap`, '');
  lines.push(`Build: ${DIST}. Phone 360 × 800 at ratio 2, menu → About. Frames the compositor presented (a DevTools screencast), with the row of the proxy's top edge in each (—: no edge found).`, '');
  lines.push(`**During the block: ${during.length} frames presented, the edge on ${seen.size} different rows.**`, '');
  lines.push('| ms | edge row |', '|---|---|', ...rows.filter((r) => r.ms <= AT + STALL + 300).map((r) => `| ${r.ms} | ${r.top < 0 ? '—' : r.top} |`), '');
  console.log(`${DIST}: during the block ${during.length} frames presented, the proxy's top edge on ${seen.size} different rows`);
  console.log(rows.filter((r) => r.ms <= AT + STALL + 300).map((r) => `${r.ms}:${r.top}`).join(' '));
} finally {
  await new Promise<void>((res) => server.httpServer.close(() => res()));
}
if (OUT) writeFileSync(OUT, lines.join('\n'));
