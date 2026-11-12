// Key → echo on the phone (stage 53e; intent Goal 1, ADR 0138 §8): how
// long it takes from a key to the frame that paints the character in the
// command field, with our own keyboard and with the device keyboard's path
// as far as it can be emulated here.
//
//   node bench/phone-keyboard-bench.ts [--quick] [--out <file.md>] [--no-build]
//                                      [--throttle N] [--keys N] [--rounds N]
//
// Builds the app, serves the production bundle with `vite preview` on a
// free port and drives one Chromium page as a phone (360 × 800 CSS px,
// ratio 3, mobile + touch, `?bench&phone=1`) with the CPU throttled 4×
// (CDP `Emulation.setCPUThrottlingRate`; `--throttle 1` turns it off).
//
// Three ways a character reaches the field:
//
// - **own**: a real touch (CDP `Input.dispatchTouchEvent`) on a letter key
//   of our keyboard. Start: the `pointerdown`.
// - **device (insertText)**: `?kbd=0`, the field focused, the text committed
//   as an IME does it (CDP `Input.insertText`: a native `beforeinput` and
//   `input`). Start: the `beforeinput`. What the device's keyboard itself
//   takes before it commits (its own touch handling, prediction, the IPC to
//   the browser) is NOT in this number and cannot be had here: the row is a
//   lower bound for the device's path.
// - **key event**: `?kbd=0`, a physical key (CDP `Input.dispatchKeyEvent`:
//   `keydown`, `beforeinput`, `input`). Start: the `keydown`. The path of a
//   hardware keyboard, for reference.
//
// For each, per key:
//
// - event → painted: from the first event's `timeStamp` (the browser's own
//   time for the input, before the page's handlers were scheduled) to after
//   the frame that painted the changed field was rendered (a message posted
//   from inside that frame's animation callback, as the `?bench` probe does
//   for text);
// - handler → painted: the same end, from the moment the page's first
//   listener for the event ran;
// - script: from that listener to the field's value having changed (the
//   app's own synchronous work for the key).
//
// Each is measured idle and while text arrives (fixture frames delivered
// through the fake socket every 25 ms). The modes alternate round by round
// so drift on the machine falls on all of them alike.
//
// A last pass counts what one key of ours touches: the cockpit's layouts and
// the DOM nodes mutated per key (ADR 0138 §3: only the key and the field).
//
//   --quick        a quarter of the keys (a smoke run)
//   --out FILE     the report (default bench/results/phone-53-keyboard.md)
//   --no-build     serve the existing dist/
//   --throttle N   the CPU slowdown (default 4)
//   --keys N       keys per mode, condition and round (default 120; the
//                  first 15 of each are warm-up and dropped)
//   --rounds N     rounds (default 2: at least 200 keys per cell)

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createServer } from 'node:net';
import { dirname } from 'node:path';

// Extensionless relative imports (the repo's style) resolve to .ts files.
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

const { listFixtures } = await import('../tests/e2e/fixtures');
const L = await import('./lib');
const { build, preview } = await import('vite');
const { pct, median, max, f1, f2, pause, loadavg, closePage } = L;
type Geometry = import('./lib').Geometry;
type Target = import('./lib').Target;
type Page = import('@playwright/test').Page;
type CDPSession = import('@playwright/test').CDPSession;

const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const NO_BUILD = argv.includes('--no-build');
const opt = (flag: string): string | null => {
  const at = argv.indexOf(flag);
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1]! : null;
};
const OUT = opt('--out') ?? new URL('./results/phone-53-keyboard.md', import.meta.url).pathname;
const THROTTLE = Math.max(1, Number(opt('--throttle') ?? 4) || 4);
const WARM = 15;
const KEYS = Math.max(WARM + 10, Math.round((Number(opt('--keys') ?? 120) || 120) * (QUICK ? 0.25 : 1)));
const ROUNDS = Math.max(1, Number(opt('--rounds') ?? 2) || 2);
const flagsText = argv.length ? argv.join(' ') : '(none)';

/** The owner's phone (Samsung S21), CSS px. */
const PHONE: Geometry = { width: 360, height: 800, dpr: 3 };
const TARGET = process.env.WC_BENCH_GPU === '0' ? 'chromium' : 'chromium-gpu';

type Mode = 'own' | 'insert' | 'key' | 'own-mouse' | 'own-insert' | 'touch-insert';
type Cond = 'idle' | 'burst';
/** `--diag`: three more rows that tell the page's part from the input pipeline's (see the report). */
const DIAG = argv.includes('--diag');
const MODES: Mode[] = ['own', 'insert', 'key', ...(DIAG ? (['own-mouse', 'own-insert', 'touch-insert'] as Mode[]) : [])];
const MODE_NAME: Record<Mode, string> = {
  own: 'our keyboard (touch on a key)',
  insert: 'device path (`Input.insertText`, `?kbd=0`)',
  key: 'key event (`Input.dispatchKeyEvent`, `?kbd=0`)',
  'own-mouse': 'diag: our keyboard, the key pressed with a mouse pointer',
  'own-insert': 'diag: our keyboard open, the text by `Input.insertText`',
  'touch-insert': 'diag: `?kbd=0`, `Input.insertText` 3 ms after a finger went down on a compass key',
};
/** The page has our keyboard (else `?kbd=0`). */
const ours = (m: Mode): boolean => m === 'own' || m === 'own-mouse' || m === 'own-insert';
/** The character comes from a press on one of our keys (else from an input event). */
const pressed = (m: Mode): boolean => m === 'own' || m === 'own-mouse';

interface Sample {
  /** The first event's timeStamp, the first listener's start, the value changed, the frame rendered (all `performance.now()` ms). */
  ts: number;
  h: number;
  edit: number;
  /** The animation callback of the frame that paints it started. */
  raf: number;
  paint: number;
}

const fixture = (() => {
  const owner = listFixtures().at(-1);
  if (owner) return { name: owner.rel, path: owner.path, size: owner.size };
  const dir = new URL('../tests/fixtures/', import.meta.url).pathname;
  const repo = readdirSync(dir)
    .filter((n) => n.endsWith('.log'))
    .map((n) => ({ name: `tests/fixtures/${n}`, path: dir + n, size: statSync(dir + n).size }))
    .sort((a, b) => a.size - b.size);
  return repo.at(-1)!;
})();
// The burst loops over the first frames of the log: a slice is enough.
const logText = readFileSync(fixture.path, 'utf8').slice(0, 400_000);

// ------------------------------------------------------------------- page

async function open(t: Target, base: string, mode: Mode): Promise<{ page: Page; cdp: CDPSession }> {
  const ctx = await t.browser.newContext({ viewport: { width: PHONE.width, height: PHONE.height }, deviceScaleFactor: PHONE.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(`${base}/?bench&phone=1${ours(mode) ? '' : '&kbd=0'}`);
  await page.waitForFunction(() => window.__wcBench !== undefined && window.__wcBench.app !== null);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForFunction(() => document.querySelector('.wc-cockpit[data-phone-game] > .wc-ph-layer') !== null, undefined, { timeout: 15_000 });
  // The lens's map: loaded (or not shown) before anything is measured, as for a player a few seconds in.
  await page
    .waitForFunction(
      () => {
        const lens = document.querySelector<HTMLElement>('.wc-ph-lens');
        if (!lens || lens.hidden) return true;
        const st = document.querySelector<HTMLElement>('.wc-pane-map .wc-pane-content')?.dataset.mapState;
        return st === 'loaded' || st === 'error' || st === 'none';
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => {});
  await pause(500);
  const cdp = await page.context().newCDPSession(page);
  // The field focused by a real tap; with our keyboard that opens it.
  const f = (await page.locator('.wc-input-slot .wc-input-field').boundingBox())!;
  const pt = { x: f.x + f.width / 2, y: f.y + f.height / 2, id: 0 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  if (ours(mode)) await page.locator('.wc-ph-okb').waitFor({ state: 'visible' });
  else if (await page.evaluate(() => document.querySelector('.wc-ph-okb') !== null)) throw new Error('?kbd=0 still has our keyboard');
  await page.waitForFunction(() => document.activeElement?.classList.contains('wc-input-field') === true);
  await page.evaluate(() => window.__wcBench!.connectFake());
  await page.evaluate(
    ([text]) => {
      const w = window as unknown as { __kbFrames: number };
      w.__kbFrames = window.__wcBench!.loadFrames(text!, 1, 400);
    },
    [logText],
  );
  // The probe: see the file header.
  await page.evaluate((mode) => {
    interface S {
      ts: number;
      h: number;
      edit: number;
      raf: number;
      paint: number;
    }
    const kb = ((window as unknown as { __kb: { samples: S[]; missed: number; pending: S | null } }).__kb = { samples: [] as S[], missed: 0, pending: null as S | null });
    const field = document.querySelector<HTMLTextAreaElement>('.wc-input-slot .wc-input-field')!;
    const ch = new MessageChannel();
    let painting: S | null = null;
    ch.port1.onmessage = () => {
      const p = painting;
      painting = null;
      if (!p) return;
      p.paint = performance.now();
      kb.samples.push(p);
    };
    let len = 0;
    const start = (e: Event): void => {
      if (kb.pending || painting) {
        kb.missed++;
        return;
      }
      len = field.value.length;
      kb.pending = { ts: e.timeStamp, h: performance.now(), edit: 0, raf: 0, paint: 0 };
    };
    const edited = (): void => {
      const p = kb.pending;
      if (!p) return;
      kb.pending = null;
      if (field.value.length === len) {
        kb.missed++;
        return;
      }
      p.edit = performance.now();
      requestAnimationFrame(() => {
        p.raf = performance.now();
        painting = p;
        ch.port2.postMessage(null);
      });
    };
    if (mode === 'own' || mode === 'own-mouse') {
      // The key acts in the keyboard's own `pointerdown` listener: the capture one here runs before it, the bubble one after.
      document.addEventListener('pointerdown', (e) => (e.target as Element | null)?.closest?.('.wc-ph-okb') && start(e), true);
      document.addEventListener('pointerdown', (e) => (e.target as Element | null)?.closest?.('.wc-ph-okb') && edited(), false);
    } else {
      document.addEventListener(mode === 'key' ? 'keydown' : 'beforeinput', start, true);
      document.addEventListener('input', edited, false);
    }
  }, mode);
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  return { page, cdp };
}

const LETTERS = ['a', 's', 'd', 'f', 'j', 'k', 'l', 'e', 'o', 'n'];

/** Types `n` keys in `mode` and returns the samples after the warm-up. */
async function typeKeys(page: Page, cdp: CDPSession, mode: Mode, cond: Cond, n: number): Promise<{ samples: Sample[]; missed: number }> {
  await page.evaluate(() => {
    const kb = (window as unknown as { __kb: { samples: unknown[]; missed: number; pending: unknown } }).__kb;
    kb.samples = [];
    kb.missed = 0;
    kb.pending = null;
  });
  const boxes = new Map<string, { x: number; y: number }>();
  // (`touch-insert`: the finger goes down on a compass key, which keeps the focus where it is and sends nothing outside play.)
  let kPt = { x: 0, y: 0 };
  if (mode === 'touch-insert') {
    const b = (await page.locator('.wc-ph-pad .wc-ph-key[data-cmd="north"]').boundingBox())!;
    kPt = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  if (pressed(mode)) {
    for (const ch of LETTERS) {
      const b = (await page.locator(`.wc-ph-okb-k[data-ch="${ch}"]`).boundingBox())!;
      boxes.set(ch, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
  }
  if (cond === 'burst') {
    await page.evaluate(() => {
      const w = window as unknown as { __kbFrames: number; __kbFeed: number };
      let i = 0;
      w.__kbFeed = window.setInterval(() => window.__wcBench!.deliverFrame(i++ % w.__kbFrames), 25);
    });
    await pause(300);
  }
  for (let i = 0; i < n; i++) {
    const ch = LETTERS[i % LETTERS.length]!;
    if (mode === 'own') {
      const p = boxes.get(ch)!;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 0 }] });
      await pause(25);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else if (mode === 'own-mouse') {
      const p = boxes.get(ch)!;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
      await pause(25);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
    } else if (mode === 'insert' || mode === 'own-insert') {
      await cdp.send('Input.insertText', { text: ch });
      await pause(25);
    } else if (mode === 'touch-insert') {
      // A finger goes down elsewhere, and the text is committed while it is down.
      void cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...kPt, id: 0 }] });
      await pause(3);
      await cdp.send('Input.insertText', { text: ch });
      await pause(25);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      const code = `Key${ch.toUpperCase()}`;
      const vk = ch.toUpperCase().charCodeAt(0);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk });
      await pause(25);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk });
    }
    // A typing rhythm (about 8 keys a second), not in step with the frames.
    await pause(70 + Math.random() * 50);
    // A short line, as commands are: emptied now and then (outside any measured key).
    if (i % 12 === 11) {
      await page.evaluate(() => {
        const f = document.querySelector<HTMLTextAreaElement>('.wc-input-slot .wc-input-field')!;
        f.setRangeText('', 0, f.value.length, 'end');
      });
      await pause(40);
    }
  }
  if (cond === 'burst') await page.evaluate(() => window.clearInterval((window as unknown as { __kbFeed: number }).__kbFeed));
  await pause(200);
  const r = await page.evaluate(() => {
    const kb = (window as unknown as { __kb: { samples: Sample[]; missed: number } }).__kb;
    return { samples: kb.samples, missed: kb.missed };
  });
  return { samples: r.samples.slice(WARM), missed: r.missed };
}

/** What one key of ours touches: cockpit layouts and mutated DOM nodes over `n` keys. */
async function touched(page: Page, cdp: CDPSession, n: number): Promise<{ layouts: number; nodes: Record<string, number>; styleRecalcs: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __kbT: { layouts: number; nodes: Record<string, number>; mo: MutationObserver; off: () => void } };
    const cockpit = window.__wcBench!.app!.cockpit;
    const t = { layouts: 0, nodes: {} as Record<string, number>, mo: null as unknown as MutationObserver, off: () => {} };
    t.off = cockpit.onLayout(() => t.layouts++);
    const name = (n: Node): string => {
      const el = n instanceof Element ? n : n.parentElement;
      if (!el) return '(detached)';
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
    };
    t.mo = new MutationObserver((recs) => {
      for (const r of recs) {
        const k = `${name(r.target)} [${r.type}${r.attributeName ? ` ${r.attributeName}` : ''}]`;
        t.nodes[k] = (t.nodes[k] ?? 0) + 1;
      }
    });
    t.mo.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
    w.__kbT = t;
  });
  const b = (await page.locator('.wc-ph-okb-k[data-ch="a"]').boundingBox())!;
  await cdp.send('Performance.enable');
  const before = (await cdp.send('Performance.getMetrics')).metrics;
  for (let i = 0; i < n; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 }] });
    await pause(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await pause(90);
  }
  const after = (await cdp.send('Performance.getMetrics')).metrics;
  const metric = (m: { name: string; value: number }[], k: string): number => m.find((x) => x.name === k)?.value ?? NaN;
  const r = await page.evaluate(() => {
    const t = (window as unknown as { __kbT: { layouts: number; nodes: Record<string, number>; mo: MutationObserver; off: () => void } }).__kbT;
    t.mo.disconnect();
    t.off();
    return { layouts: t.layouts, nodes: t.nodes };
  });
  return { ...r, styleRecalcs: metric(after, 'RecalcStyleCount') - metric(before, 'RecalcStyleCount') };
}

// ------------------------------------------------------------------- main

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

const git = (cmd: string) => {
  try {
    return execSync(`git ${cmd}`, { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const commit = (git('rev-parse --short HEAD') || 'unknown') + (git('status --porcelain --untracked-files=no') ? ' (with uncommitted changes)' : '');

if (!NO_BUILD) {
  console.log('phone-keyboard-bench: building…');
  await build({ logLevel: 'warn' });
}
const server = await preview({ preview: { port: await freePort(), strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
const base = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
const loadStart = loadavg();
console.log(`phone-keyboard-bench: ${base}, commit ${commit}, throttle ${THROTTLE}×, ${KEYS} keys × ${ROUNDS} rounds, load ${loadStart}`);

const all = new Map<string, Sample[]>();
const missed = new Map<string, number>();
const perRound = new Map<string, number[]>();
let version = '';
let gl = '';
let touch: Awaited<ReturnType<typeof touched>> | null = null;
try {
  const t = await L.launchTarget(TARGET, PHONE);
  try {
    version = t.browser.version();
    gl = await L.glRenderer(t.browser);
    for (let round = 0; round < ROUNDS; round++) {
      // Alternating: each round starts with another mode.
      const order = MODES.map((_, i) => MODES[(i + round) % MODES.length]!);
      for (const mode of order) {
        const { page, cdp } = await open(t, base, mode);
        try {
          for (const cond of ['idle', 'burst'] as Cond[]) {
            console.log(`  round ${round + 1}: ${mode}, ${cond}…`);
            const r = await typeKeys(page, cdp, mode, cond, KEYS);
            const k = `${mode}|${cond}`;
            all.set(k, [...(all.get(k) ?? []), ...r.samples]);
            missed.set(k, (missed.get(k) ?? 0) + r.missed);
            perRound.set(k, [...(perRound.get(k) ?? []), median(r.samples.map((s) => s.paint - s.ts))]);
          }
          if (mode === 'own' && touch === null) touch = await touched(page, cdp, 20);
        } finally {
          await closePage(page);
        }
      }
    }
  } finally {
    await t.browser.close();
  }
} finally {
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}

// ----------------------------------------------------------------- report

const cell = (xs: number[]): string => `${f1(median(xs))} / ${f1(pct(xs, 95))} / ${f1(max(xs))}`;
const table = (cond: Cond): string[] => [
  `| ${cond === 'idle' ? 'idle' : 'while text arrives (a frame every 25 ms)'} | n | event → painted | handler → painted | script (handler → value changed) | wait for the frame (value changed → its callback) | the frame (callback → rendered) | event → painted, median per round |`,
  '|---|---|---|---|---|---|---|---|',
  ...MODES.map((m) => {
    const s = all.get(`${m}|${cond}`) ?? [];
    const miss = missed.get(`${m}|${cond}`) ?? 0;
    return `| ${MODE_NAME[m]} | ${s.length}${miss ? ` (${miss} not measured)` : ''} | ${cell(s.map((x) => x.paint - x.ts))} | ${cell(s.map((x) => x.paint - x.h))} | ${f2(median(s.map((x) => x.edit - x.h)))} / ${f2(pct(s.map((x) => x.edit - x.h), 95))} / ${f2(max(s.map((x) => x.edit - x.h)))} | ${cell(s.map((x) => x.raf - x.edit))} | ${cell(s.map((x) => x.paint - x.raf))} | ${(perRound.get(`${m}|${cond}`) ?? []).map(f1).join(', ')} |`;
  }),
];

const md = [
  '# Key → echo on the phone: our keyboard against the device keyboard\'s path',
  '',
  `- Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  `- Commit: ${commit}`,
  `- Script: \`node bench/phone-keyboard-bench.ts\`, flags ${flagsText}${QUICK ? ' — a quick run: a smoke test, not numbers to compare' : ''}`,
  `- Browser: Chromium ${version}, headless${TARGET === 'chromium-gpu' ? ` (\`${L.gpuArgs().join(' ')}\`)` : ''}; WebGL: ${gl}; CPU throttled ${THROTTLE}×`,
  `- Page: production build, \`?bench&phone=1\` (our keyboard) and \`?bench&phone=1&kbd=0\` (the device path), ${PHONE.width} × ${PHONE.height} at ratio ${PHONE.dpr}, mobile + touch, default settings`,
  `- Keys: ${KEYS} per cell and round (the first ${WARM} dropped), ${ROUNDS} rounds, the modes alternating; about 8 keys a second`,
  `- Burst fixture: \`${fixture.name}\`, its first 400 frames in a loop`,
  `- Load average: ${loadStart} at the start, ${loadavg()} at the end`,
  '',
  'All times in ms, median / p95 / max.',
  '',
  ...table('idle'),
  '',
  ...table('burst'),
  '',
  touch
    ? `What 20 keys of ours touched: ${touch.layouts} cockpit layouts; ${touch.styleRecalcs} style recalculations (${f1(touch.styleRecalcs / 20)} per key: the press, the release, the caret); DOM mutations: ${Object.entries(touch.nodes)
        .map(([k, v]) => `\`${k}\` × ${v}`)
        .join(', ')}.`
    : '',
  '',
].join('\n');

console.log('\n' + md);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md);
console.log(`wrote ${OUT}`);
console.log(
  `RESULT ${JSON.stringify({
    commit,
    throttle: THROTTLE,
    cells: Object.fromEntries([...all].map(([k, s]) => [k, { n: s.length, median: median(s.map((x) => x.paint - x.ts)), p95: pct(s.map((x) => x.paint - x.ts), 95), handlerMedian: median(s.map((x) => x.paint - x.h)), handlerP95: pct(s.map((x) => x.paint - x.h), 95) }])),
    touch,
  })}`,
);
