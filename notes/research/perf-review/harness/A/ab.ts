// Interleaved A/B of output-pane variants in the same browser session.
//
// Each variant is a build in perf/dists/<dist>/ (built with --base /<dist>/,
// see perf/build-variant.sh), optionally with a CSS override from
// perf/css/<name>.css injected into the page, and optionally page setup:
//   --variants base,cssText,base+nounderscore,label=cssText+prewrap
// Every round opens a fresh page per variant (shuffled order), prefills
// 2000 rows of ordinary play, warms up each payload once, then injects each
// payload `--reps` times (shuffled). Flush phases come from the harness
// timing patch (globalThis.__wcFlushT): build = rows built; append =
// appendRows + trimTop + partial; read = scrollHeight read (forced style +
// layout); write = scrollTop write. frame = rAF start → after rendering.
//
//   node perf/ab.ts --variants base,cssText [--browsers firefox,chromium] [--rounds 5]
//        [--reps 2] [--payloads p24a,p24s,info,combat] [--port 4207] [--map on|off]
//        [--prefill 2000] [--out result.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { type BrowserName, f2, launch, loadavg, maxOf, median, minOf, openBench, pause, startServer } from './lib.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const ROUNDS = Number(arg('rounds', '5'));
const REPS = Number(arg('reps', '2'));
const PORT = Number(arg('port', '4207'));
const MAP = arg('map', 'on');
const PREFILL = Number(arg('prefill', '2000'));
const names = arg('payloads', 'p24a,p24s,info,combat').split(',');
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const shots = payloads()
  .filter((p) => names.includes(p.name))
  .map((p) => ({ name: p.name, b64: b64(oneShot(p.lines)) }));
const NEXT = process.argv.includes('--next');
const combatB64 = b64(oneShot(payloads().find((p) => p.name === 'combat')!.lines));
const pre = playLines(PREFILL);
const preChunks: string[] = [];
for (let i = 0; i < pre.length; i += 200) preChunks.push(b64(oneShot(pre.slice(i, i + 200))));

interface Variant {
  label: string;
  dist: string;
  css: string;
}
const variants: Variant[] = arg('variants', 'base')
  .split(',')
  .map((spec) => {
    const [label0, rest0] = spec.includes('=') ? spec.split('=') : [spec, spec];
    const [dist, ...cssNames] = rest0!.split('+');
    const css = cssNames.map((n) => readFileSync(new URL(`./css/${n}.css`, import.meta.url), 'utf8')).join('\n');
    if (!existsSync(new URL(`./dists/${dist}/index.html`, import.meta.url))) throw new Error(`no build perf/dists/${dist}`);
    return { label: label0!, dist: dist!, css };
  });

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const inject = (page: import('@playwright/test').Page, s: string) =>
  page.evaluate((x) => (window as any).__perf.inject(Uint8Array.from(atob(x), (c) => c.charCodeAt(0))), s) as Promise<any>;

const server = await startServer(new URL('./dists/', import.meta.url).pathname, PORT);
type Rec = Record<string, number>;
const data: Record<string, Record<string, Record<string, Rec[]>>> = {};
const loads: string[] = [];
try {
  for (const bname of browsers) {
    const l = await launch(bname);
    try {
      for (let round = 0; round < ROUNDS; round++) {
        loads.push(`${bname} r${round}: ${loadavg()}`);
        for (const v of shuffle(variants)) {
          const page = await openBench(l, `http://127.0.0.1:${PORT}/${v.dist}/?bench`);
          if (MAP === 'off') {
            await page.evaluate(() => (window as any).__wcBench.settings.update({ panes: { map: { on: false } } }));
            await pause(300);
          }
          if (v.css) {
            await page.evaluate((css) => {
              const st = document.createElement('style');
              st.textContent = css;
              document.head.appendChild(st);
            }, v.css);
          }
          await page.evaluate(() => ((globalThis as any).__wcFlushT = []));
          await page.evaluate(installPerf);
          await page.evaluate(() => (window as any).__perf.connect());
          for (const c of preChunks) await inject(page, c);
          await page.evaluate(() => (window as any).__perf.drained());
          for (const s of shots) {
            await inject(page, s.b64);
            await pause(60);
          }
          await pause(200);
          for (let rep = 0; rep < REPS; rep++) {
            for (const s of shuffle(shots)) {
              const r = await inject(page, s.b64);
              const ph: Rec | undefined = await page.evaluate((st) => (globalThis as any).__wcFlushT.find((x: any) => Math.abs(x.start - st) < 0.5), r.flushStart);
              const rec: Rec = { script: r.script, frame: r.frame, toPaint: r.toPaint, post: r.frame - r.script, ingest: r.ingest, ...(ph ?? {}) };
              (((data[bname] ??= {})[v.label] ??= {})[s.name] ??= []).push(rec);
              if (NEXT && s.name !== 'combat') {
                // The frame after: one combat round while these rows are on screen.
                await pause(60);
                const n = await inject(page, combatB64);
                (((data[bname] ??= {})[v.label] ??= {})[`${s.name}+next`] ??= []).push({ script: n.script, frame: n.frame, toPaint: n.toPaint, post: n.frame - n.script });
              }
              await pause(150);
            }
          }
          await page.close();
        }
      }
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}

const keys = ['script', 'build', 'append', 'read', 'write', 'post', 'frame', 'toPaint'];
for (const [bname, byV] of Object.entries(data)) {
  console.log(`\n== ${bname} (medians, ms; [min–max] for frame)`);
  for (const s of shots) {
    console.log(`  ${s.name}`);
    const base = byV[variants[0]!.label]?.[s.name] ?? [];
    for (const v of variants) {
      const xs = byV[v.label]?.[s.name] ?? [];
      const line = keys.map((k) => `${k} ${f2(median(xs.map((x) => x[k] ?? NaN)))}`).join('  ');
      const fr = xs.map((x) => x.frame!);
      const rel = v === variants[0] ? '' : `  Δframe ${f2(median(fr) - median(base.map((x) => x.frame!)))} (${((median(fr) / median(base.map((x) => x.frame!)) - 1) * 100).toFixed(0)}%)`;
      console.log(`    ${v.label.padEnd(18)} ${line}  [${f2(minOf(fr))}–${f2(maxOf(fr))}] n=${xs.length}${rel}`);
    }
  }
}
console.log('\nloadavg:', loads.join(' | '));
const out = arg('out', '');
if (out) writeFileSync(out, JSON.stringify({ variants, data, loads }, null, 1));
