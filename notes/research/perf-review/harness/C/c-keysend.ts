// Q1: the synchronous key → ws.send path with the khazdul profile, in the
// page (synthetic keydown dispatch like bench-hook `keyToSend`), with a
// clean and a dirty DOM, and a breakdown of what runs before the send.
//
//   node perf/c-keysend.ts [--browsers chromium,firefox] [--n 200]
//        [--dist dist] [--dist-b dist-exp] [--coi 1]
//
// With --dist-b, the same cases run on a second build (A/B) in the same
// browser, interleaved batch by batch.
//
// Per sample (performance.now(), 5 µs Chromium / 20 µs Firefox when
// cross-origin isolated):
//   send    dispatch → first `net.bytesOut` (emitted right after socket.send)
//   first   dispatch → first keydown listener (window capture)
//   tail    time inside OutputPane.toTail() before the send (0 if none)
//   handler dispatch → dispatchEvent returned (whole handler)
import { resolve } from 'node:path';
import { f, khazdulProfile, launch, loadavg, logSlice, openApp, pause, pct, RUNS, ROOT, startServer, type BrowserName } from './lib.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const browsers = (args.get('browsers') ?? 'chromium,firefox').split(',') as BrowserName[];
const N = Number(args.get('n') ?? 200);
const coi = (args.get('coi') ?? '1') === '1';
const distA = resolve(ROOT, args.get('dist') ?? 'dist');
const distB = args.get('dist-b') ? resolve(ROOT, args.get('dist-b')!) : null;

const HELP_LOG = `${RUNS}/Rasta/2026-09-30T00-11-08.log`;
const helpPage1 = logSlice(HELP_LOG, 230, 275)
  .split('\n')
  .filter(Boolean)
  .map((l) => l.slice(l.indexOf(' ') + 1))
  .join('\r\n') + '\r\n';

interface Case {
  id: string;
  /** Text typed before Enter, or a macro key code. */
  enter?: string;
  code?: string;
  key?: string;
  /** Dirty state before the dispatch. */
  dirty?: 'typed' | 'rows' | 'help' | 'rootstyle' | 'blur';
}

const CASES: Case[] = [
  { id: 'Enter look (plain), clean', enter: 'look' },
  { id: 'Enter look, input just typed', enter: 'look', dirty: 'typed' },
  { id: 'Enter look, 50 rows appended', enter: 'look', dirty: 'rows' },
  { id: 'Enter look, 24-bit help page appended', enter: 'look', dirty: 'help' },
  { id: 'Enter look, focus elsewhere', enter: 'look', dirty: 'blur' },
  { id: 'Enter bb (alias)', enter: 'bb' },
  { id: 'Enter b2 (pattern alias)', enter: 'b2' },
  { id: 'Enter oo (alias, 2 sends)', enter: 'oo' },
  { id: 'Enter lordf (alias, 10 sends)', enter: 'lordf' },
  { id: 'F1 hit $target', code: 'F1', key: 'F1' },
  { id: 'F2 #if chain → cast', code: 'F2', key: 'F2' },
  { id: 'F8 sc', code: 'F8', key: 'F8' },
  { id: 'Backquote (printable macro) sc', code: 'Backquote', key: '`' },
  { id: 'F1, 24-bit help page appended', code: 'F1', key: 'F1', dirty: 'help' },
  { id: 'F1, focus elsewhere', code: 'F1', key: 'F1', dirty: 'blur' },
];

/** In-page setup: fake socket, profile, instrumentation. */
function setup(profile: string): boolean {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  B.connectFake();
  if (!B.applyProfile(profile)) return false;
  const app = B.app;
  const S: any = { sendT: [] as number[], tail0: 0, tail1: 0, cap: 0, focusT: 0 };
  w.__ks = S;
  app.bus.on('net.bytesOut', () => S.sendT.push(performance.now()));
  const out = app.output;
  const orig = out.toTail.bind(out);
  out.toTail = () => {
    const a = performance.now();
    orig();
    const b = performance.now();
    if (!S.tail0) {
      S.tail0 = a;
      S.tail1 = b;
    }
  };
  window.addEventListener('keydown', () => {
    if (!S.cap) S.cap = performance.now();
  }, true);
  return true;
}

/** One sample of `c` (runs in the page). */
async function sample(c: Case & { helpText: string; i: number }): Promise<Record<string, number> | null> {
  const w = window as unknown as Record<string, any>;
  const B = w.__wcBench;
  const app = B.app;
  const S = w.__ks;
  const field: HTMLInputElement = app.input.input;
  const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  field.focus();
  if (c.enter !== undefined) {
    field.value = c.enter;
    field.setSelectionRange(c.enter.length, c.enter.length);
  }
  await frames();
  // Dirty state, set in the same task as the dispatch.
  if (c.dirty === 'typed' && c.enter !== undefined) {
    const v = c.enter.slice(0, -1) + (c.i % 2 ? c.enter.slice(-1) : c.enter.slice(-1).toUpperCase());
    field.value = v;
    field.setSelectionRange(v.length, v.length);
  } else if (c.dirty === 'rows' || c.dirty === 'help') {
    // Rows appended without the flush's own `scrollTop = scrollHeight`
    // (which lays out at once): the pane believes it is scrolled back for
    // the one flush, so the rows stay unlaid-out until the key reads.
    let s = c.helpText;
    if (c.dirty === 'rows') {
      s = '';
      for (let k = 0; k < 50; k++) s += `\x1b[3${k % 8}mA line of text number ${c.i}.${k}, about seventy characters long, some colour.\x1b[0m\r\n`;
    }
    B.sock.onData(new TextEncoder().encode(s));
    const out = app.output;
    out.scrolled = true;
    out.flush();
    out.scrolled = false;
    out.newWhileScrolled = 0;
    out.tailBar.hidden = true;
  } else if (c.dirty === 'rootstyle') {
    document.documentElement.style.setProperty('--wc-perf-x', String(c.i));
  } else if (c.dirty === 'blur') {
    field.blur();
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  S.sendT = [];
  S.tail0 = 0;
  S.tail1 = 0;
  S.cap = 0;
  const ev = new KeyboardEvent('keydown', {
    key: c.enter !== undefined ? 'Enter' : c.key!,
    code: c.enter !== undefined ? 'Enter' : c.code!,
    bubbles: true,
    cancelable: true,
  });
  const target = c.dirty === 'blur' ? document.body : field;
  const t0 = performance.now();
  target.dispatchEvent(ev);
  const t1 = performance.now();
  if (S.sendT.length === 0) return null;
  return {
    send: S.sendT[0] - t0,
    last: S.sendT[S.sendT.length - 1] - t0,
    sends: S.sendT.length,
    first: S.cap ? S.cap - t0 : NaN,
    tail: S.tail0 && S.tail0 < S.sendT[0] ? S.tail1 - S.tail0 : 0,
    tailAfter: S.tail0 && S.tail0 >= S.sendT[0] ? S.tail1 - S.tail0 : 0,
    handler: t1 - t0,
  };
}

const servers = [await startServer(distA, 4224, coi)];
if (distB) servers.push(await startServer(distB, 4225, coi));
const bases = distB ? ['http://127.0.0.1:4224', 'http://127.0.0.1:4225'] : ['http://127.0.0.1:4224'];
const profile = khazdulProfile();
const out: string[] = [];
const log = (s: string) => {
  console.log(s);
  out.push(s);
};
log(`# key → send (Q1), ${new Date().toISOString()}, N=${N}, coi=${coi}, loadavg ${loadavg()}`);
log(`builds: A=${distA}${distB ? `, B=${distB}` : ''}`);
try {
  for (const name of browsers) {
    const browser = await launch(name);
    const pages = [];
    for (const base of bases) {
      const p = await openApp(browser, name, base);
      if (!(await p.evaluate(setup, profile))) throw new Error('profile did not load');
      pages.push(p);
    }
    log(`\n## ${name} ${browser.version()} (DPR 2, 1728×1000) loadavg ${loadavg()}`);
    type R = Record<string, number>;
    const res: R[][][] = pages.map(() => CASES.map(() => []));
    const WARM = 20;
    for (let round = 0; round < N + WARM; round++) {
      for (let pi = 0; pi < pages.length; pi++) {
        for (let ci = 0; ci < CASES.length; ci++) {
          const r = await pages[pi]!.evaluate(sample, { ...CASES[ci]!, helpText: helpPage1, i: round });
          if (round >= WARM && r) res[pi]![ci]!.push(r);
        }
      }
      if (round % 50 === 0) await pause(50);
    }
    for (let ci = 0; ci < CASES.length; ci++) {
      for (let pi = 0; pi < pages.length; pi++) {
        const xs = res[pi]![ci]!;
        const col = (k: string) => xs.map((x) => x[k]!).filter((v) => Number.isFinite(v));
        const s = (k: string, d = 3) => `${f(pct(col(k), 50), d)} / ${f(pct(col(k), 99), d)} / ${f(Math.max(...col(k)), d)}`;
        log(
          `- ${pages.length > 1 ? (pi ? 'B ' : 'A ') : ''}${CASES[ci]!.id}: send ${s('send')} ms (med/p99/max); ` +
            `first listener ${f(pct(col('first'), 50))}; toTail before send ${s('tail')}; toTail after send ${f(pct(col('tailAfter'), 50), 3)}; ` +
            `handler ${s('handler')}; sends ${pct(col('sends'), 50)}${CASES[ci]!.enter === 'lordf' ? `, last send ${s('last')}` : ''}; n=${xs.length}`,
        );
      }
    }
    await browser.close();
  }
} finally {
  for (const s of servers) s.close();
}
const { writeFileSync } = await import('node:fs');
writeFileSync(`/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/C/keysend-${distB ? 'ab' : 'a'}-${Date.now()}.md`, out.join('\n') + '\n');
