// Same-page lab runner (Q2 per-span cost, Q3 CSS, Q4 scrolling): configs
// (row builder × CSS toggle × scroll mode) are interleaved on one `?bench`
// page per browser; see perf/lab-page.ts.
//
//   node perf/lab.ts [--browsers firefox,chromium] [--rounds 6] [--set span|css|scroll|all]
//        [--payloads p24a,p256x,p16x,p24s,info,combat] [--port 4208] [--dist dist]
//        [--map on|off] [--out result.json]
//
// Per config and round: 400 filler rows (heavy rows of earlier configs leave
// the cull rect / display port), then each payload once (timed: build,
// append, scroll, post = after the rAF callback until after rendering,
// frame = rAF start → after rendering), and after each payload one `combat`
// frame with the base builder ("+next": what the new rows cost the next frame).
import { writeFileSync } from 'node:fs';
import { type BrowserName, f2, launch, loadavg, maxOf, median, minOf, openBench, pause, startServer } from './lib.ts';
import { installLab } from './lab-page.ts';
import { installPerf } from './page-helpers.ts';
import { oneShot, payloads, playLines } from './payloads.ts';

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1]! : d;
};
const browsers = arg('browsers', 'firefox,chromium').split(',') as BrowserName[];
const ROUNDS = Number(arg('rounds', '6'));
const PORT = Number(arg('port', '4208'));
const SET = arg('set', 'span');
const names = arg('payloads', 'p24a,p256x,p16x,p24s,info,combat').split(',');
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
const all = payloads();
const shots = all.filter((p) => names.includes(p.name) || p.name === 'combat').map((p) => ({ name: p.name, b64: b64(oneShot(p.lines)) }));

interface Config {
  label: string;
  builder: string;
  css?: string;
  rootVar?: [string, string];
  scroll?: string;
  colrev?: boolean;
}
const SPAN: Config[] = [
  { label: 'base', builder: 'base' },
  { label: 'cssText', builder: 'cssText' },
  { label: 'attr', builder: 'attr' },
  { label: 'cls256', builder: 'cls256' },
  { label: 'rowfg', builder: 'rowfg' },
  { label: 'tccls', builder: 'tccls' },
  { label: 'html(ref)', builder: 'html' },
  { label: 'gradient(ref)', builder: 'gradient' },
];
const CSS: Config[] = [
  { label: 'base', builder: 'base' },
  { label: 'nounderscore', builder: 'base', rootVar: ['--font-mono', '"DejaVu Sans Mono", monospace'] },
  { label: 'pre', builder: 'base', css: '.wc-row{white-space:pre}' },
  { label: 'breakword', builder: 'base', css: '.wc-row{overflow-wrap:break-word}' },
  { label: 'nooverflowwrap', builder: 'base', css: '.wc-row{overflow-wrap:normal}' },
  { label: 'optSpeed', builder: 'base', css: '.wc-output{text-rendering:optimizeSpeed}' },
  { label: 'nokern', builder: 'base', css: '.wc-output{font-kerning:none}' },
  { label: 'cv-auto', builder: 'base', css: '.wc-chunk{content-visibility:auto;contain-intrinsic-size:auto 3400px}' },
  { label: 'contain-none', builder: 'base', css: '.wc-chunk{contain:none}' },
  { label: 'contain-strict-rows', builder: 'base', css: '.wc-row{contain:layout paint style}' },
  { label: 'opaque-scroller', builder: 'base', css: '.wc-scroller{background:var(--term-bg)}' },
];
const ANCHOR_CSS =
  '.wc-scroller{overflow-anchor:auto}.wc-scroller>.wc-rows,.wc-scroller>.wc-partial,.wc-rows *{overflow-anchor:none}#lab-anchor{overflow-anchor:auto;height:1px}';
const SCROLL: Config[] = [
  { label: 'read(base)', builder: 'base', scroll: 'read' },
  { label: 'bigwrite', builder: 'base', scroll: 'big' },
  { label: 'anchor', builder: 'base', scroll: 'none', css: ANCHOR_CSS },
  { label: 'colrev', builder: 'base', scroll: 'none', colrev: true },
];
const configs = SET === 'span' ? SPAN : SET === 'css' ? CSS : SET === 'scroll' ? SCROLL : [...SPAN, ...CSS.slice(1), ...SCROLL.slice(1)];

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const server = await startServer(arg('dist', 'dist'), PORT);
type Rec = Record<string, number>;
const data: Record<string, Record<string, Record<string, Rec[]>>> = {};
const extra: Record<string, unknown> = {};
const loads: string[] = [];
try {
  for (const bname of browsers) {
    const l = await launch(bname);
    try {
      const page = await openBench(l, `http://127.0.0.1:${PORT}/?bench`);
      if (arg('map', 'on') === 'off') {
        await page.evaluate(() => (window as any).__wcBench.settings.update({ panes: { map: { on: false } } }));
        await pause(300);
      }
      await page.evaluate(installPerf);
      await page.evaluate(() => (window as any).__perf.connect());
      const pre = playLines(2000);
      for (let i = 0; i < pre.length; i += 200) {
        await page.evaluate((s) => (window as any).__perf.inject(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))), b64(oneShot(pre.slice(i, i + 200))));
      }
      await page.evaluate(() => (window as any).__perf.drained());
      await page.evaluate(installLab);
      for (const s of shots) {
        const n = await page.evaluate(([name, x]) => (window as any).__lab.capture(name, Uint8Array.from(atob(x!), (c) => c.charCodeAt(0))), [s.name, s.b64] as const);
        if (!n) throw new Error(`no lines for ${s.name}`);
      }
      // Warm every builder on every payload once.
      for (const c of configs) for (const s of names) await page.evaluate(([b, n]) => (window as any).__lab.run(b, n), [c.builder, s] as const);
      let curCss = '';
      let curVar = '';
      let curColrev = false;
      for (let round = 0; round < ROUNDS; round++) {
        loads.push(`${bname} r${round}: ${loadavg()}`);
        for (const c of shuffle(configs)) {
          const css = c.css ?? '';
          const v = c.rootVar ? c.rootVar.join('=') : '';
          if (css !== curCss || v !== curVar || !!c.colrev !== curColrev) {
            await page.evaluate(
              ([cssText, rv, colrev]) => {
                const lab = (window as any).__lab;
                lab.setCss(cssText);
                lab.setRootVar('--font-mono', null);
                if (rv) {
                  const [k, val] = (rv as string).split('=');
                  lab.setRootVar(k, val);
                }
                // Scroll anchor element and column-reverse wrapper.
                const sc = document.querySelector('.wc-scroller') as HTMLElement;
                let a = document.getElementById('lab-anchor');
                if ((cssText as string).includes('#lab-anchor')) {
                  if (!a) {
                    a = document.createElement('div');
                    a.id = 'lab-anchor';
                    sc.appendChild(a);
                  }
                } else a?.remove();
                let w = document.getElementById('lab-colrev');
                if (colrev && !w) {
                  w = document.createElement('div');
                  w.id = 'lab-colrev';
                  w.append(...[...sc.children]);
                  sc.appendChild(w);
                  sc.style.display = 'flex';
                  sc.style.flexDirection = 'column-reverse';
                } else if (!colrev && w) {
                  sc.append(...[...w.children]);
                  w.remove();
                  sc.style.display = '';
                  sc.style.flexDirection = '';
                }
                sc.scrollTop = sc.scrollHeight;
              },
              [css, v, !!c.colrev] as const,
            );
            curCss = css;
            curVar = v;
            curColrev = !!c.colrev;
            await page.evaluate(() => (window as any).__lab.frames(6));
          }
          await page.evaluate(() => (window as any).__lab.filler(400));
          await pause(120);
          for (const s of shuffle(names)) {
            const r: Rec = await page.evaluate(([b, n, sc]) => (window as any).__lab.run(b, n, sc), [c.builder, s, c.scroll ?? 'read'] as const);
            await pause(60);
            const nx: Rec = await page.evaluate(([n, sc]) => (window as any).__lab.run('base', n, sc), ['combat', c.scroll ?? 'read'] as const);
            const atBottom = await page.evaluate(() => {
              const sc = document.querySelector('.wc-scroller') as HTMLElement;
              return Math.abs(sc.scrollHeight - sc.clientHeight - Math.abs(sc.scrollTop)) < 3;
            });
            (((data[bname] ??= {})[c.label] ??= {})[s] ??= []).push({ ...r, nextFrame: nx.frame!, nextPost: nx.post!, atBottom: atBottom ? 1 : 0 });
            await pause(100);
          }
          // Keep the DOM at ~20 000 rows like a full scrollback.
          await page.evaluate(() => {
            const rows = document.querySelector('.wc-rows')!;
            let n = document.querySelectorAll('.wc-rows .wc-row').length;
            while (n > 20000 && rows.firstElementChild) {
              n -= rows.firstElementChild.childElementCount;
              rows.firstElementChild.remove();
            }
          });
        }
      }
      extra[bname] = { dynRules: await page.evaluate(() => (window as any).__lab.dynRules()) };
      await page.close();
    } finally {
      await l.browser.close();
    }
  }
} finally {
  server.close();
}

const keys = ['build', 'append', 'scroll', 'script', 'post', 'frame', 'nextFrame'];
for (const [bname, byC] of Object.entries(data)) {
  console.log(`\n== ${bname}: medians (ms); frame [min–max]; Δ = frame vs first config`);
  for (const s of names) {
    console.log(`  ${s}`);
    const base = byC[configs[0]!.label]?.[s] ?? [];
    const bm = median(base.map((x) => x.frame!));
    for (const c of configs) {
      const xs = byC[c.label]?.[s] ?? [];
      const fr = xs.map((x) => x.frame!);
      const bottom = xs.every((x) => x.atBottom === 1) ? '' : ` NOT-AT-BOTTOM(${xs.filter((x) => !x.atBottom).length})`;
      console.log(
        `    ${c.label.padEnd(20)} ${keys.map((k) => `${k} ${f2(median(xs.map((x) => x[k] ?? NaN)))}`).join('  ')}  [${f2(minOf(fr))}–${f2(maxOf(fr))}] n=${xs.length}` +
          (c === configs[0] ? '' : `  Δ ${((median(fr) / bm - 1) * 100).toFixed(0)}%`) +
          bottom,
      );
    }
  }
}
console.log('\n', JSON.stringify(extra));
console.log('loadavg:', loads.join(' | '));
const out = arg('out', '');
if (out) writeFileSync(out, JSON.stringify({ configs, data, loads, extra }, null, 1));
