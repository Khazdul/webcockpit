// Q3 extra: PageUp / PageDown / Escape → next frame rendered, with an empty
// and a full scrollback. Leaving and returning to the live tail toggles
// `.wc-scrolled` on the scroller, which changes `scrollbar-color` (an
// inherited property) on the ancestor of every row.
//
//   node perf/c-scroll.ts [--browsers chromium,firefox] [--dist dist] [--dist-b dist-exp]
//        [--rows 0,20000] [--reps 20]
import { resolve } from 'node:path';
import { f, khazdulProfile, launch, loadavg, openApp, pause, pct, ROOT, startServer, type BrowserName, maxOf } from './lib.ts';
import { collect, install, resetCollect, type Collected } from './c-common.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const rowsList = (args.get('rows') ?? '0,20000').split(',').map(Number);
const REPS = Number(args.get('reps') ?? 20);
const dists = [resolve(ROOT, args.get('dist') ?? 'dist'), ...(args.get('dist-b') ? [resolve(ROOT, args.get('dist-b')!)] : [])];

function fill(n: number): Promise<number> {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  B.connectFake();
  let s = '';
  let k = 0;
  const enc = new TextEncoder();
  for (let i = 0; i < n; i++) {
    if (i % 10 === 0) s += `\x1b[32mA Room Called Number ${i}\x1b[0m\r\n`;
    else if (i % 7 === 0) s += `\x1b[33mSomeone narrates 'message ${i} with a bit of text to wrap the line'\x1b[0m\r\n`;
    else s += `A line of plain description text, number ${i}, about seventy characters.\r\n`;
    if (++k === 1000) {
      B.sock.onData(enc.encode(s));
      s = '';
      k = 0;
    }
  }
  if (s) B.sock.onData(enc.encode(s));
  return B.drained().then(() => B.app.output.rows);
}

const servers = await Promise.all(dists.map((d, i) => startServer(d, 4221 + i, true)));
const profile = khazdulProfile();
console.log(`# PageUp/PageDown/Escape → rendered, ${new Date().toISOString()}, loadavg ${loadavg()}`);
try {
  for (const name of browsers) {
    const browser = await launch(name);
    console.log(`\n## ${name} ${browser.version()}`);
    for (const rows of rowsList) {
      for (let di = 0; di < dists.length; di++) {
        const page = await openApp(browser, name, `http://127.0.0.1:${4221 + di}`);
        await page.evaluate(install, profile);
        const got = await page.evaluate(fill, rows);
        await pause(500);
        await page.evaluate(resetCollect);
        const seq: string[] = [];
        for (let r = 0; r < REPS; r++) {
          for (const k of ['PageUp', 'PageUp', 'PageDown', 'Escape']) {
            await page.keyboard.press(k);
            seq.push(k);
            await pause(120);
          }
        }
        const c = (await page.evaluate(collect)) as Collected;
        const by = new Map<string, number[]>();
        const et = new Map<string, number[]>();
        for (let i = 0; i < c.keys.length; i++) {
          const k = c.keys[i]!;
          // 1st PageUp leaves the tail (class toggle), 2nd stays scrolled, Escape returns.
          const label = seq[i] === 'PageUp' ? (i % 4 === 0 ? 'PageUp (leave tail)' : 'PageUp (already scrolled)') : seq[i] === 'PageDown' ? 'PageDown' : 'Escape (back to tail)';
          const arr = by.get(label) ?? [];
          if (k.paint) arr.push(name === 'chromium' ? k.paint - k.ts : k.paint - k.t0);
          by.set(label, arr);
          const hd = et.get(label) ?? [];
          hd.push(k.end - k.t0);
          et.set(label, hd);
        }
        const fl = c.gaps.map((g) => g[1]);
        console.log(`- ${dists.length > 1 ? (di ? 'B ' : 'A ') : ''}rows ${got}: ${[...by].map(([k, v]) => `${k} → rendered median ${f(pct(v, 50))} / max ${f(maxOf(v))} ms (handler ${f(pct(et.get(k)!, 50), 3)})`).join('; ')}; longest rAF gap ${f(maxOf(fl))} ms; Event Timing ≥16 ms: ${c.et.filter((e) => e.name === 'keydown').map((e) => `${f(e.d, 0)}`).join(',')}`);
        await page.context().close();
      }
    }
    await browser.close();
  }
} finally {
  for (const s of servers) s.close();
}
