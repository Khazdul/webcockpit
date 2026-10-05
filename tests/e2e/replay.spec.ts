// Stage 7 P2: the HTML replay. The dev app builds the file from the demo
// backup (Rasta's two-run session, with a title, a comment and a cut); the
// test writes it to disk and opens it from file:// in a fresh context with
// no network, and with IndexedDB, localStorage, sessionStorage, fetch,
// XMLHttpRequest and WebSocket throwing (and counted) on any touch.
import { NO_STATE } from './legacy-state';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { type Browser, type BrowserContext, type Page, expect, test } from '@playwright/test';
import { biggestFixture } from './fixtures';

interface Eng {
  position: number;
  duration: number;
  playing: boolean;
  seeking: boolean;
  speed: number;
}

async function engine(page: Page): Promise<Eng> {
  return page.evaluate(() => {
    const w = window as unknown as { __wcReplay: { host: { engine: Eng } } };
    const e = w.__wcReplay.host.engine;
    return { position: e.position, duration: e.duration, playing: e.playing, seeking: e.seeking, speed: e.speed };
  });
}

/** Everything a file:// page may not have: each touch throws and is counted in `__touched`. */
const NO_STORAGE_NO_NETWORK = (): void => {
  const w = window as unknown as { __touched: string[] };
  w.__touched = [];
  const deny = (name: string): never => {
    w.__touched.push(name);
    throw new DOMException(`${name} is not available`, 'SecurityError');
  };
  for (const name of ['indexedDB', 'localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, { configurable: true, get: () => deny(name) });
  }
  const fn = (name: string) =>
    function () {
      return deny(name);
    };
  Object.defineProperty(window, 'fetch', { configurable: true, value: fn('fetch') });
  Object.defineProperty(window, 'XMLHttpRequest', { configurable: true, value: fn('XMLHttpRequest') });
  Object.defineProperty(window, 'WebSocket', { configurable: true, value: fn('WebSocket') });
};

/** Builds a replay in the dev app (demo backup restored): its HTML and the cut lines' text. */
async function buildHtml(page: Page, withEdits: boolean): Promise<{ html: string; cut: string[] }> {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  return page.evaluate(async (edits) => {
    const w = window as unknown as {
      __wc: {
        runs(): Promise<{
          restore(b: Blob): Promise<unknown>;
          listSessions(now: number): Promise<Array<{ id: string; runs: Array<{ runId: string }> }>>;
          chainLog(ids: string[]): Promise<Array<{ text: string }>>;
        }>;
        replayHtml(o?: unknown): Promise<string>;
      };
    };
    const lib = await w.__wc.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    if (!edits) return { html: await w.__wc.replayHtml(), cut: [] };
    const s = (await lib.listSessions(Date.now() * 1000)).find((x) => x.runs.length > 1)!;
    const text = (await lib.chainLog(s.runs.map((r) => r.runId)))[0]!.text;
    // Inbound text lines (no ESC record, no command) of run 1.
    const lines = [...text.matchAll(/^(\d{16}) (?![\x1b>])(.*)$/gm)].filter((m) => m[2]!.trim() !== '');
    // The comment goes before the 12th text line; lines 30–39 are cut.
    const anchor = Number(lines[12]![1]);
    const cut: [number, number] = [Number(lines[30]![1]), Number(lines[40]![1])];
    const html = await w.__wc.replayHtml({
      session: s.id,
      doc: { title: 'Demo fight', comments: [{ beforeUs: anchor, text: 'Watch the tank here.' }], excludes: [cut] },
    });
    return { html, cut: lines.slice(30, 40).map((m) => m[0]) };
  }, withEdits);
}

/** Opens `html` from a temp file in a context with no network and no storage. */
async function openFile(browser: Browser, html: string, path: string): Promise<{ page: Page; errors: string[] }> {
  writeFileSync(path, html);
  const context = await browser.newContext({ viewport: { width: 1400, height: 820 }, offline: true, storageState: NO_STATE });
  await context.route(/^(https?|wss?):/, (r) => r.abort());
  await context.addInitScript(NO_STORAGE_NO_NETWORK);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push(`request ${r.url()}`);
  });
  await page.goto(`file://${path}`);
  await page.waitForFunction(() => (window as unknown as { __wcReplay?: unknown }).__wcReplay != null);
  return { page, errors };
}

const player = (page: Page) => page.locator('.wc-player');
const chrome = (page: Page) => page.locator('.wc-player-chrome');

test('the HTML replay plays from file:// with no network and no storage', async ({ page, browser }, info) => {
  const { html, cut } = await buildHtml(page, true);
  // One file: doctype, GPL notice, fonts inline, payload, script; nothing fetched.
  expect(html.startsWith('<!doctype html>\n<!--')).toBe(true);
  expect(html).toContain('GNU General Public License');
  expect(html).toContain('src:url(data:font/woff2;base64,');
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).toContain('<title>Demo fight</title>');
  console.log(`replay size (demo, Rasta session): ${html.length} bytes`);

  const { page: p, errors } = await openFile(browser, html, info.outputPath('replay.html'));
  await expect(p).toHaveTitle('Demo fight');
  // The cut lines are not in the file.
  const texts = await p.evaluate(() =>
    (window as unknown as { __wcReplay: { payload: { runs: Array<{ text: string }> } } }).__wcReplay.payload.runs.map((r) => r.text).join(''),
  );
  expect(cut.length).toBe(10);
  for (const line of cut) expect(texts).not.toContain(line);

  // Header, hints, the panes, text, markers, no input line.
  await expect(chrome(p).locator('.wc-player-header')).toContainText('Demo fight · Rasta (L42) · 2026-09-26');
  await expect(chrome(p).locator('.wc-player-hints')).toHaveText('Space Play · ↑↓ Scroll · 1–6 Speed · F Fullscreen');
  await expect(player(p).locator('.wc-output')).toContainText('Rivendell Stables');
  await expect(player(p).locator('.wc-pane[data-pane="character"]')).toContainText('Rasta');
  await expect(chrome(p).locator('.wc-player-mark')).toHaveText(['AL►', 'K►', 'D►']);
  await chrome(p).locator('.wc-player-mark', { hasText: 'D►' }).hover();
  await expect(chrome(p).locator('.wc-player-tip')).toHaveText('Died (level 42)');
  await expect(player(p).locator('.wc-input-slot')).toBeHidden();
  await expect(chrome(p).locator('.wc-player-strip')).toBeVisible();
  // The font came from the file, the underscore face (ADR 0043) too.
  expect(await p.evaluate(() => document.fonts.check('15px "DejaVu Sans Mono"'))).toBe(true);
  expect(html.match(/font-family:"WebCockpit Underscore";src:url\(data:font\/woff2;base64,[^)]+\) format\("woff2"\);font-weight:(normal|bold);font-style:normal;font-display:block;unicode-range:U\+5F\}/g)).toHaveLength(2);
  await expect
    .poll(() => p.evaluate(() => [...document.fonts].filter((f) => f.family.includes('WebCockpit Underscore')).map((f) => f.status)))
    .toEqual(['loaded', 'loaded']);

  // The comment holds playback, whatever the speed: at 8x nothing follows it for seconds.
  await p.keyboard.press('6');
  await expect(chrome(p).locator('[data-act="speed"]')).toHaveText('8x   ');
  const comment = player(p).locator('.wc-output .wc-comment');
  await expect(comment).toHaveText('## Watch the tank here.', { timeout: 15_000 });
  const rows = player(p).locator('.wc-output .wc-rows .wc-row');
  await p.waitForTimeout(2000);
  await expect(rows.last()).toHaveText('## Watch the tank here.');
  expect((await engine(p)).playing).toBe(true);

  // Play / pause, and the speed keys.
  await p.keyboard.press(' ');
  await expect(chrome(p).locator('[data-act="play"]')).toHaveText('► Play  ');
  await p.keyboard.press(' ');
  await expect(chrome(p).locator('[data-act="play"]')).toHaveText('▌▌ Pause');
  await p.keyboard.press('1');
  await expect(chrome(p).locator('[data-act="speed"]')).toHaveText('0.25x');
  expect((await engine(p)).speed).toBe(0.25);

  // Strip hover shows MM:SS; a click seeks.
  const strip = (await chrome(p).locator('.wc-player-strip').boundingBox())!;
  await p.mouse.move(strip.x + strip.width / 2, strip.y + strip.height / 2);
  await expect(chrome(p).locator('.wc-player-hint')).toHaveText(/^\s*\d\d:\d\d\s*$/);
  await p.mouse.click(strip.x + strip.width / 2, strip.y + strip.height * 0.8);
  await expect.poll(async () => (await engine(p)).seeking).toBe(false);
  const e = await engine(p);
  expect(e.position / e.duration).toBeGreaterThan(0.7);

  // F and the box button toggle fullscreen; ESC does not close the replay.
  const fsButton = chrome(p).locator('.wc-player-box .wc-player-btn', { hasText: 'Fullscreen' });
  await expect(fsButton).toHaveText('Fullscreen');
  await p.keyboard.press('f');
  await expect.poll(() => p.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(fsButton).toHaveText('Exit fullscreen');
  await p.keyboard.press('F');
  await expect.poll(() => p.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(fsButton).toHaveText('Fullscreen');
  await p.keyboard.press('Escape');
  await expect(player(p)).toBeVisible();

  expect(await p.evaluate(() => (window as unknown as { __touched: string[] }).__touched)).toEqual([]);
  expect(errors).toEqual([]);
  await p.context().close();
});

test('without a title the file is named by the character and date', async ({ page }) => {
  const { html: plain } = await buildHtml(page, false);
  expect(plain).toContain('<title>Rasta · 2026-09-26</title>');
});

test('replay file size of the longest Cockpit log', async ({ page }) => {
  const f = biggestFixture();
  test.skip(!f, 'no Cockpit fixtures');
  test.setTimeout(120_000);
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const size = await page.evaluate(
    async (rel) => (await (window as unknown as { __wc: { replayHtml(o: unknown): Promise<string> } }).__wc.replayHtml({ logs: [rel] })).length,
    f!.rel,
  );
  console.log(`replay size (${f!.rel}, ${f!.size} bytes of log): ${size} bytes`);
  expect(size).toBeGreaterThan(0);
});

test('?replayhtml= builds the demo replay and opens it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?replayhtml=runs-demo.jsonl.gz');
  await expect.poll(() => page.url()).toMatch(/^blob:/);
  await expect(chrome(page).locator('.wc-player-header')).toContainText('Rasta (L42) · 2026-09-26');
  await expect(player(page).locator('.wc-output')).toContainText('Rivendell Stables');
  expect(errors).toEqual([]);
});

/** Seeks a replay page or the in-app player to its end; resolves when the text is there. */
async function toEnd(page: Page, which: 'replay' | 'player'): Promise<void> {
  await page.waitForFunction((w) => {
    const g = window as unknown as {
      __wcReplay?: { host: { engine: { duration: number } | null } };
      __wc?: { shell: { playerHost: { engine: { duration: number } | null } | null } };
    };
    const e = w === 'replay' ? g.__wcReplay?.host.engine : g.__wc?.shell.playerHost?.engine;
    return !!e && e.duration > 0;
  }, which);
  await page.evaluate((w) => {
    const g = window as unknown as {
      __wcReplay?: { host: { engine: { duration: number; seek(p: number): void } } };
      __wc?: { shell: { playerHost: { engine: { duration: number; seek(p: number): void } } } };
    };
    const e = w === 'replay' ? g.__wcReplay!.host.engine : g.__wc!.shell.playerHost.engine;
    e.seek(e.duration);
  }, which);
  await page.waitForFunction((w) => {
    const g = window as unknown as {
      __wcReplay?: { host: { engine: { seeking: boolean; position: number; duration: number } } };
      __wc?: { shell: { playerHost: { engine: { seeking: boolean; position: number; duration: number } } } };
    };
    const e = w === 'replay' ? g.__wcReplay!.host.engine : g.__wc!.shell.playerHost.engine;
    return !e.seeking && e.position >= e.duration;
  }, which);
  await page.waitForTimeout(300);
}

/** The game text rows: `<class marks> | <text>` (prompt, echoed, system, comment). */
function outputRows(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.wc-output .wc-rows .wc-row')].map((r) => {
      const c = r.classList;
      const marks = ['wc-prompt', 'wc-echoed', 'wc-sys', 'wc-comment'].filter((k) => c.contains(k)).join(' ');
      return `${marks} | ${r.textContent ?? ''}`;
    }),
  );
}

test('system lines: a top comment plays first; an excluded login line is not printed', async ({ page, browser }, info) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  const { withComment, withExclusion } = await page.evaluate(async () => {
    const w = window as unknown as {
      __wc: {
        runs(): Promise<{
          restore(b: Blob): Promise<unknown>;
          listSessions(now: number): Promise<Array<{ id: string; runs: Array<{ runId: string }> }>>;
          chainLog(ids: string[]): Promise<Array<{ text: string }>>;
        }>;
        replayHtml(o?: unknown): Promise<string>;
      };
    };
    const lib = await w.__wc.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    const s = (await lib.listSessions(Date.now() * 1000)).find((x) => x.runs.length > 1)!;
    const text = (await lib.chainLog(s.runs.map((r) => r.runId)))[0]!.text;
    // The login line's anchor (run 1's Char.Name) and the first game line after it.
    const login = Number(/^(\d{16}) \x1bGMCP Char\.Name /m.exec(text)![1]);
    const next = [...text.matchAll(/^(\d{16}) (?![\x1b>])/gm)].map((m) => Number(m[1])).find((t) => t > login)!;
    return {
      withComment: await w.__wc.replayHtml({ session: s.id, doc: { comments: [{ beforeUs: login, text: 'Before everything.' }] } }),
      withExclusion: await w.__wc.replayHtml({ session: s.id, doc: { excludes: [[login, next]] } }),
    };
  });

  const a = await openFile(browser, withComment, info.outputPath('comment.html'));
  await toEnd(a.page, 'replay');
  const ra = await outputRows(a.page);
  expect(ra.slice(0, 4)).toEqual([' | ', 'wc-comment | ## Before everything.', 'wc-sys | [SYSTEM] Rasta logged in.', ' | Reconnecting.']);
  const logins = ra.filter((r) => r === 'wc-sys | [SYSTEM] Rasta logged in.').length;
  expect(logins).toBeGreaterThan(0);
  expect(a.errors).toEqual([]);
  await a.page.context().close();

  const b = await openFile(browser, withExclusion, info.outputPath('excluded.html'));
  await toEnd(b.page, 'replay');
  const rb = await outputRows(b.page);
  expect(rb[0]).toBe(' | Reconnecting.');
  expect(rb.filter((r) => r === 'wc-sys | [SYSTEM] Rasta logged in.').length).toBe(logins - 1);
  // The panes still got the login state (Char.Name was kept).
  await expect(player(b.page).locator('.wc-pane[data-pane="character"]')).toContainText('Rasta');
  expect(b.errors).toEqual([]);
  await b.page.context().close();
});

test('the HTML replay shows the game text and echoed commands as the log player does', async ({ page, browser }) => {
  // The in-app log player on the demo session.
  await page.setViewportSize({ width: 1400, height: 820 });
  await page.goto('/?player=runs-demo.jsonl.gz');
  await toEnd(page, 'player');
  const inApp = await outputRows(page);
  // The same session as an HTML replay (no edits).
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
  const r = await ctx.newPage();
  await r.goto('/?replayhtml=runs-demo.jsonl.gz');
  await expect.poll(() => r.url()).toMatch(/^blob:/);
  await toEnd(r, 'replay');
  const replay = await outputRows(r);
  // Commands go after their prompt in both, and every row is the same.
  const echoed = inApp.filter((x) => x.startsWith('wc-prompt wc-echoed | '));
  expect(echoed.length).toBeGreaterThan(3);
  expect(echoed).toContain('wc-prompt wc-echoed | *> kill bat');
  expect(replay).toEqual(inApp);
  await ctx.close();
});

/**
 * The first command echo's colour, the mix of the element's `--term-fg` with
 * `tint` (`pct` % fg; ADR 0034 steel: 55 % with #7fb2e6 on a dark bg,
 * #1f5f9e on a light one) and the plain fg, all as computed by the browser.
 */
function echoColours(page: Page, tint: string, pct = 55): Promise<{ got: string; want: string; plain: string }> {
  return page.locator('.wc-output .wc-echo').first().evaluate(
    (el, [t, p]) => {
      const probe = el.ownerDocument.createElement('span');
      const fg = getComputedStyle(el).getPropertyValue('--term-fg').trim();
      probe.style.color = `color-mix(in oklab, ${fg} ${p}%, ${t})`;
      el.parentElement!.appendChild(probe);
      const want = getComputedStyle(probe).color;
      probe.style.color = fg;
      const plain = getComputedStyle(probe).color;
      probe.remove();
      return { got: getComputedStyle(el).color, want, plain };
    },
    [tint, pct] as const,
  );
}

/** Sets the (viewer's own) input colour in the dev app and saves it. */
async function setInputColor(page: Page, id: string): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(async (c) => {
    const s = (window as unknown as { __wc: { settings: { update(p: object): void; flush(): Promise<void> } } }).__wc
      .settings;
    s.update({ appearance: { inputColor: c } });
    await s.flush();
  }, id);
}

/**
 * Serves the demo backup with `inputColor` added to every recorded VIEW
 * appearance, as a log recorded after ADR 0035 carries it.
 */
async function demoWithInputColor(ctx: BrowserContext, id: string): Promise<void> {
  const gz = readFileSync('tests/fixtures/runs-demo.jsonl.gz');
  const text = gunzipSync(gz).toString('utf8');
  const marked = text.replaceAll('\\"cursorBlink\\":true}', `\\"cursorBlink\\":true,\\"inputColor\\":\\"${id}\\"}`);
  expect(marked).not.toBe(text);
  const body = gzipSync(Buffer.from(marked, 'utf8'));
  await ctx.route('**/__fixtures/runs-demo.jsonl.gz', (route) => route.fulfill({ body, contentType: 'application/gzip' }));
}

/** Switches the running player's viewer colour theme. */
async function viewerTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate((t) => {
    const g = window as unknown as {
      __wcReplay?: { host: unknown };
      __wc?: { shell: { playerHost: unknown } };
    };
    const host = (g.__wcReplay?.host ?? g.__wc!.shell.playerHost) as {
      viewerOverrides: object;
      setViewer(o: object): void;
    };
    host.setViewer({ ...host.viewerOverrides, theme: t });
  }, theme);
}

test('the command echo is steel in the log player and the HTML replay, dark and paper', async ({ page, browser }) => {
  // A log recorded before the Input color setting (ADR 0035) plays with
  // Steel, whatever the viewer chose for themselves.
  await page.setViewportSize({ width: 1400, height: 820 });
  await setInputColor(page, 'amber');
  await page.goto('/?player=runs-demo.jsonl.gz');
  await toEnd(page, 'player');
  expect(await page.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('amber');
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
  const r = await ctx.newPage();
  await setInputColor(r, 'amber');
  await r.goto('/?replayhtml=runs-demo.jsonl.gz');
  await expect.poll(() => r.url()).toMatch(/^blob:/);
  await toEnd(r, 'replay');
  for (const p of [page, r]) {
    const dark = await echoColours(p, '#7fb2e6');
    expect(dark.got).toBe(dark.want);
    expect(dark.got).not.toBe(dark.plain);
    await viewerTheme(p, 'paper');
    await expect(p.locator('.wc-player')).toHaveAttribute('data-light', '');
    await expect
      .poll(async () => {
        const c = await echoColours(p, '#1f5f9e');
        return c.got === c.want;
      })
      .toBe(true);
    const light = await echoColours(p, '#1f5f9e');
    expect(light.got).not.toBe(light.plain);
    expect(light.got).not.toBe(dark.got);
  }
  await ctx.close();
});

test('logs replay with the recorded input colour, not the viewer’s (ADR 0035)', async ({ browser }) => {
  const pages: Page[] = [];
  const ctxs: BrowserContext[] = [];
  for (const which of ['player', 'replay'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 820 } });
    ctxs.push(ctx);
    await demoWithInputColor(ctx, 'cyan');
    const p = await ctx.newPage();
    await setInputColor(p, 'none');
    await p.goto(which === 'player' ? '/?player=runs-demo.jsonl.gz' : '/?replayhtml=runs-demo.jsonl.gz');
    if (which === 'replay') await expect.poll(() => p.url()).toMatch(/^blob:/);
    await toEnd(p, which);
    if (which === 'player') expect(await p.evaluate(() => window.__wc!.settings.get().appearance.inputColor)).toBe('none');
    pages.push(p);
  }
  for (const p of pages) {
    const dark = await echoColours(p, '#00d7d7', 15);
    expect(dark.got).toBe(dark.want);
    expect(dark.got).not.toBe(dark.plain);
    // The viewer's colour theme still applies: the recorded choice is resolved against it.
    await viewerTheme(p, 'paper');
    await expect(p.locator('.wc-player')).toHaveAttribute('data-light', '');
    await expect
      .poll(async () => {
        const c = await echoColours(p, '#007a8a', 15);
        return c.got === c.want && c.got !== c.plain;
      })
      .toBe(true);
  }
  for (const c of ctxs) await c.close();
});
