// Stage 64 B2 (ADR 0154 "The watch page", "Hardening the replay runtime"):
// the shared replay plays in `<iframe sandbox="allow-scripts">` from
// /r/frame, a document with its own CSP. A hostile payload's markup stays
// text; script that does run inside the frame (here: evaluated in the
// frame's context, as if a payload ever got one in) cannot reach the app's
// DOM, storage, cookies, the network or the top navigation; the page
// around the frame is untouched.
import { type Frame, type Page, expect, test } from '@playwright/test';

const POLICY =
  /^default-src 'none'; script-src 'sha256-[A-Za-z0-9+/]+=*'; style-src 'sha256-[A-Za-z0-9+/]+=*' 'unsafe-inline'; img-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'$/;

/** The frame's console lines that report a CSP violation (Chromium and Firefox word them differently). */
function cspLog(page: Page): string[] {
  const out: string[] = [];
  page.on('console', (m) => {
    if (/Content[- ]Security[- ]Policy|Refused to/i.test(m.text())) out.push(m.text());
  });
  return out;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__wc !== undefined);
}

/** The sandboxed frame once it is playing. */
async function playingFrame(page: Page): Promise<Frame> {
  const el = page.locator('#wc-dev-watch iframe');
  await expect(el).toHaveAttribute('sandbox', 'allow-scripts');
  const frame = (await el.elementHandle())!.contentFrame();
  const f = (await frame)!;
  await expect(f.locator('.wc-player')).toBeVisible({ timeout: 20_000 });
  return f;
}

const T0 = 1_790_000_000_000_000;
const ts = (s: number): string => String(T0 + Math.round(s * 1e6));
const HTML = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script><a href="javascript:window.__pwned=3">x</a>`;

/** A payload whose every text field tries markup (it passes validatePayload: it is well formed). */
function hostilePayload(): unknown {
  const spane = {
    title: `T ${HTML}`,
    lines: [{ spans: [{ text: `pane ${HTML}` }] }],
    links: [{ row: 0, col: 0, len: 4, hint: `hint ${HTML}`, tip: true }],
  };
  const text = [
    `${ts(0)} \x1bGMCP Char.Name {"name":"Evil","fullname":"Evil ${HTML.replace(/"/g, '\\"')}"}`,
    `${ts(0.1)} \x1bVIEW {"panes":{"comm":{"on":true},"ui":{"on":true}}}`,
    `${ts(0.5)} game ${HTML}`,
    `${ts(0.6)} \x1b[31mred\x1b]8;;javascript:alert(1)\x07link\x1b]8;;\x07 \x1b[999;999;999m broken`,
    `${ts(0.7)} \x1bGMCP Comm.Channel.Text {"channel":"tells","talker":"Evil","text":"tell ${HTML.replace(/"/g, '\\"')}"}`,
    `${ts(0.8)} \x1bGMCP Comm.Channel.Text {"channel":"__proto__","talker":"constructor","text":"proto"}`,
    `${ts(0.9)} \x1bGMCP Room.Info {"name":"${HTML.replace(/"/g, '\\"')}","id":1}`,
    `${ts(1)} \x1bSPANE evil/pane ${JSON.stringify(spane)}`,
    `${ts(1.1)} \x1bGMCP Broken.Json {not json`,
    `${ts(2)} the end`,
    '',
  ].join('\n');
  return {
    schema: 1,
    title: `Title ${HTML}`,
    character: `Char ${HTML}`,
    level: 3,
    startUs: T0,
    settings: { appearance: { bg: 'url(https://example.invalid/x)', fg: '<b>' } },
    runs: [{ meta: { startedUs: T0 }, text }],
    comments: [{ beforeUs: T0 + 500_000, text: `comment ${HTML}`, holdMs: 2500 }],
    cuts: [],
    markers: [{ us: T0 + 1_500_000, kind: 'K', tip: `tip ${HTML}` }],
  };
}

test('the map demo plays in the sandboxed frame, map and all, with no CSP violation', async ({ page }) => {
  const csp = cspLog(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 820 });
  await boot(page);
  // The map subset of the bundled map around the log's rooms is embedded (ADR 0020).
  const r = await page.evaluate(() => window.__wc!.watchFrame({ logs: ['map-demo.log'], character: 'Rasta' }));
  expect(r).toEqual({ ok: true });
  const f = await playingFrame(page);
  // The map worker started from a blob: and drew the embedded subset.
  await f.waitForFunction(() => (window as unknown as { __wcReplay?: unknown }).__wcReplay != null);
  await f.evaluate(() =>
    (window as unknown as { __wcReplay: { host: { store: { update(p: object): void } } } }).__wcReplay.host.store.update({ panes: { map: { on: true } } }),
  );
  const map = f.locator('.wc-pane-map .wc-pane-content');
  await expect(map).toHaveAttribute('data-map-state', 'loaded', { timeout: 20_000 });
  expect(Number(await map.getAttribute('data-map-rooms'))).toBeGreaterThan(0);
  await expect(map).toHaveAttribute('data-map-drawn-ms', /\d+/, { timeout: 20_000 });
  // The fonts came as bytes and were registered (FontFace).
  expect(await f.evaluate(() => [...document.fonts].filter((x) => x.status === 'loaded').length)).toBeGreaterThan(0);
  expect(csp).toEqual([]);
  expect(errors).toEqual([]);
});

test('the runs demo session plays in the frame', async ({ page }) => {
  const csp = cspLog(page);
  await boot(page);
  const r = await page.evaluate(async () => {
    const lib = await window.__wc!.runs();
    await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    return window.__wc!.watchFrame({});
  });
  expect(r).toEqual({ ok: true });
  const f = await playingFrame(page);
  await expect(f.locator('.wc-player-name')).toBeVisible();
  expect(csp).toEqual([]);
});

test('a hostile payload stays text: no element of its markup, no script of its own', async ({ page }) => {
  const csp = cspLog(page);
  await page.setViewportSize({ width: 1400, height: 820 });
  await boot(page);
  const r = await page.evaluate((raw) => window.__wc!.watchFrame({ raw }), hostilePayload());
  expect(r).toEqual({ ok: true });
  const f = await playingFrame(page);
  // Play to the end, past the comment and the marker.
  await f.waitForFunction(() => (window as unknown as { __wcReplay?: unknown }).__wcReplay != null);
  await f.evaluate(() => {
    const e = (window as unknown as { __wcReplay: { host: { engine: { seek(p: number): void; duration: number } } } }).__wcReplay.host.engine;
    e.seek(e.duration);
  });
  await expect.poll(() => f.evaluate(() => document.getElementById('app')!.textContent ?? ''), { timeout: 10_000 }).toContain('the end');
  const seen = await f.evaluate(() => ({
    text: document.getElementById('app')!.textContent ?? '',
    title: document.title,
    pwned: (window as unknown as { __pwned?: number }).__pwned ?? 0,
    // Elements a payload's markup would make: none but the runtime's own script.
    foreign: [...document.querySelectorAll('img, script, iframe, object, embed, a[href], link, base, form, meta[http-equiv]')].map((e) => e.outerHTML.slice(0, 60)),
    // No attribute anywhere names an event handler or a javascript: URL.
    handlers: [...document.querySelectorAll('*')].flatMap((e) =>
      [...e.attributes].filter((a) => /^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /javascript:/i.test(a.value))).map((a) => a.name),
    ),
    urls: [...document.querySelectorAll<HTMLElement>('[style]')].filter((e) => /url\(\s*['"]?(?!data:)/i.test(e.getAttribute('style') ?? '')).length,
  }));
  expect(seen.pwned).toBe(0);
  expect(seen.foreign).toHaveLength(1);
  expect(seen.foreign[0]).toMatch(/^<script>/);
  expect(seen.handlers).toEqual([]);
  expect(seen.urls).toBe(0);
  // The markup is there as text.
  expect(seen.text).toContain('game <img src=x onerror=');
  expect(seen.title).toContain('Title <img');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned ?? 0)).toBe(0);
  expect(csp).toEqual([]);
});

test('script inside the frame reaches neither the app nor the network nor the top', async ({ page, context }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await boot(page);
  // The app's own state, to check afterwards.
  await page.evaluate(() => {
    localStorage.setItem('wc-sandbox-probe', 'app');
    document.cookie = 'wcprobe=app; path=/';
  });
  const outerUrl = page.url();
  const outerTitle = await page.title();
  const r = await page.evaluate((raw) => window.__wc!.watchFrame({ raw }), hostilePayload());
  expect(r).toEqual({ ok: true });
  const f = await playingFrame(page);
  let fetched = false;
  await context.route('**/sandbox-probe*', async (route) => {
    fetched = true;
    await route.fulfill({ body: 'x' });
  });

  const tries = await f.evaluate(async (origin) => {
    const out: Record<string, string> = {};
    const attempt = async (name: string, fn: () => unknown): Promise<void> => {
      try {
        const v = await fn();
        out[name] = `ok:${String(v).slice(0, 40)}`;
      } catch (e) {
        out[name] = `blocked:${(e as Error).name}`;
      }
    };
    await attempt('origin', () => {
      if (window.origin !== 'null') return window.origin;
      throw new DOMException('opaque', 'SecurityError');
    });
    await attempt('parentDocument', () => window.parent.document.title);
    await attempt('parentLocalStorage', () => (window.parent as Window).localStorage.getItem('wc-sandbox-probe'));
    await attempt('localStorage', () => window.localStorage.getItem('wc-sandbox-probe'));
    await attempt('sessionStorage', () => window.sessionStorage.length);
    await attempt('cookie', () => {
      const c = document.cookie;
      if (c.includes('wcprobe')) return c;
      throw new DOMException('no cookie', 'SecurityError');
    });
    await attempt('indexedDB', () =>
      new Promise((ok, no) => {
        const req = indexedDB.open('wc-sandbox-probe');
        req.onsuccess = () => ok('opened');
        req.onerror = () => no(req.error ?? new DOMException('error', 'SecurityError'));
      }),
    );
    await attempt('fetchOrigin', () => fetch(`${origin}/sandbox-probe`).then((x) => x.status));
    await attempt('fetchRelative', () => fetch('/sandbox-probe').then((x) => x.status));
    await attempt('image', () =>
      new Promise((ok, no) => {
        const img = new Image();
        img.onload = () => ok('loaded');
        img.onerror = () => no(new DOMException('img', 'NetworkError'));
        img.src = `${origin}/sandbox-probe.png`;
      }),
    );
    await attempt('topNavigation', () => {
      window.top!.location.href = `${origin}/sandbox-probe-nav`;
      return 'navigated?';
    });
    await attempt('popup', () => {
      const w = window.open(`${origin}/sandbox-probe-popup`);
      if (w) return 'opened';
      throw new DOMException('no popup', 'SecurityError');
    });
    return out;
  }, new URL(page.url()).origin);

  for (const [name, result] of Object.entries(tries)) expect(`${name}=${result}`).toMatch(new RegExp(`^${name}=blocked:`));
  // A beat for anything that would land late (navigation, a request).
  await page.waitForTimeout(500);
  expect(fetched).toBe(false);
  expect(page.url()).toBe(outerUrl);
  expect(await page.title()).toBe(outerTitle);
  expect(context.pages()).toHaveLength(1);
  const outer = await page.evaluate(() => ({
    probe: localStorage.getItem('wc-sandbox-probe'),
    cookie: document.cookie.includes('wcprobe=app'),
    frames: document.querySelectorAll('iframe').length,
    dbs: 'databases' in indexedDB ? undefined : null,
  }));
  expect(outer.probe).toBe('app');
  expect(outer.cookie).toBe(true);
  expect(outer.frames).toBe(1);
  const dbs = await page.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name));
  expect(dbs).not.toContain('wc-sandbox-probe');
});

test('the frame takes only its parent’s first wc-play, and the page only the frame’s messages', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await boot(page);
  const r = await page.evaluate((raw) => window.__wc!.watchFrame({ raw }), hostilePayload());
  expect(r).toEqual({ ok: true });
  const f = await playingFrame(page);
  // A second wc-play (another payload) changes nothing.
  const title = await f.evaluate(() => document.title);
  await page.evaluate(async () => {
    const frame = document.querySelector<HTMLIFrameElement>('#wc-dev-watch iframe')!;
    const gz = await new Response(new Blob(['{"schema":1}']).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    frame.contentWindow!.postMessage({ t: 'wc-play', v: 1, payload: gz, fonts: [] }, '*');
  });
  await page.waitForTimeout(300);
  expect(await f.evaluate(() => document.title)).toBe(title);
  await expect(f.locator('.wc-replay-error')).toHaveCount(0);
});

test('a payload the page refuses never reaches a frame; one the frame refuses shows its one line', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => window.__wc!.watchFrame({ raw: { schema: 1, runs: 'x' } }));
  expect(r.ok).toBe(false);
  expect(await page.locator('#wc-dev-watch iframe').count()).toBe(0);
});

test('/r/frame answers with the frame CSP of ADR 0154, its hashes those of the document', async ({ page, request }) => {
  await boot(page);
  const res = await request.get('/r/frame');
  expect(res.status()).toBe(200);
  const policy = res.headers()['content-security-policy'] ?? '';
  expect(policy).toMatch(POLICY);
  const html = await res.text();
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  expect([scripts.length, styles.length]).toEqual([1, 1]);
  const hash = async (s: string) =>
    page.evaluate(async (t) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))))), s);
  expect(policy).toContain(`script-src 'sha256-${await hash(scripts[0]![1]!)}'`);
  expect(policy).toContain(`style-src 'sha256-${await hash(styles[0]![1]!)}'`);
});
