// A stub of Cloudflare's Turnstile script for the e2e specs of the account
// pages (stage 60). Not a spec (no tests).
//
// The pages load `https://challenges.cloudflare.com/turnstile/v0/api.js`
// only when a form needs a check (src/chrome/frames/account/turnstile.ts).
// `stubTurnstile(page)` answers that address with a small fake
// `window.turnstile` instead, so no spec reaches Cloudflare:
//
//   const ts = await stubTurnstile(page);              // the widget passes when it is clicked
//   const ts = await stubTurnstile(page, { auto: true });   // … or by itself, as a Managed widget mostly does
//   await passTurnstile(page);                         // click it (`.wc-fake-turnstile`)
//   ts.loads()                                         // how often the script was asked for
//   ts.block(true)                                     // the script cannot be loaded (an extension, offline)
//   await ts.expire(page)                              // every widget's token runs out (`expired-callback`)
//   await ts.fail(page, '300030')                      // every widget reports an error (`error-callback`)
//   await ts.state(page)                               // { rendered, removed, resets, tokens, widgets }
//
// The fake hands out tokens `tok-1`, `tok-2`, …; the fake account server
// (cloud-account-fake.ts) takes any token once. A token that starts with
// `bad` is refused there: `ts.nextToken(page, 'bad-1')` makes the next one
// such a token.
//
// Call it before the page is opened (it is a route, and the page loads the
// script late).

import type { Page } from '@playwright/test';

export const TURNSTILE_URL = 'https://challenges.cloudflare.com/**';

export interface TurnstileStubState {
  rendered: number;
  removed: number;
  resets: number;
  tokens: number;
  /** Widgets on the page now. */
  widgets: number;
  /** The options of the last render (without the callbacks). */
  last: Record<string, unknown> | null;
}

export interface TurnstileStub {
  /** Requests for the script so far. */
  loads(): number;
  /** From now on the script cannot be loaded (true) or can (false). */
  block(on: boolean): void;
  expire(page: Page): Promise<void>;
  fail(page: Page, code?: string): Promise<void>;
  nextToken(page: Page, token: string): Promise<void>;
  state(page: Page): Promise<TurnstileStubState>;
}

/** The fake script's text (runs in the page). */
function script(auto: boolean): string {
  return `(() => {
  const st = (window.__ts = window.__ts || { rendered: 0, removed: 0, resets: 0, tokens: 0, widgets: {}, next: null, last: null });
  const AUTO = ${auto ? 'true' : 'false'};
  const arm = (w) => {
    w.b.textContent = 'Verify you are human';
    delete w.b.dataset.done;
    if (AUTO) setTimeout(() => w.pass(), 0);
  };
  window.turnstile = {
    render(el, o) {
      const id = 'w' + ++st.rendered;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wc-fake-turnstile';
      // The real widget is a frame of another origin: its keys never reach the page. The same here.
      b.setAttribute('data-wc-own-keys', '');
      b.style.cssText = 'display:block;box-sizing:border-box;width:' + (o.size === 'compact' ? '150px;height:140px' : '300px;height:65px') + ';margin:0;border:1px solid #5a5a5a;border-radius:3px;background:#232323;color:#d9d9d9;font:14px/1.2 system-ui,sans-serif;text-align:left;padding:0 12px';
      const w = { el, o, b, pass() {
        if (!st.widgets[id]) return;
        const t = st.next || 'tok-' + ++st.tokens;
        st.next = null;
        b.textContent = 'Success!';
        b.dataset.done = '1';
        o.callback(t);
      } };
      b.addEventListener('click', () => { if (!b.dataset.done) w.pass(); });
      el.append(b);
      st.widgets[id] = w;
      st.last = Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'function'));
      arm(w);
      return id;
    },
    reset(id) {
      const w = st.widgets[id];
      if (!w) return;
      st.resets++;
      arm(w);
    },
    remove(id) {
      const w = st.widgets[id];
      if (!w) return;
      w.b.remove();
      delete st.widgets[id];
      st.removed++;
    },
  };
})();`;
}

export async function stubTurnstile(page: Page, o: { auto?: boolean; blocked?: boolean } = {}): Promise<TurnstileStub> {
  let loads = 0;
  let blocked = o.blocked === true;
  await page.route(TURNSTILE_URL, async (route) => {
    loads++;
    if (blocked) return route.abort('blockedbyclient');
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      // The dev server's page is cross-origin isolated: the real script carries this header too.
      headers: { 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'no-store' },
      body: script(o.auto === true),
    });
  });
  type St = { widgets: Record<string, { o: Record<string, (a?: string) => unknown>; b: HTMLElement }>; next: string | null } & Omit<TurnstileStubState, 'widgets'>;
  return {
    loads: () => loads,
    block: (on) => {
      blocked = on;
    },
    expire: (p) =>
      p.evaluate(() => {
        const s = (window as unknown as { __ts: St }).__ts;
        for (const w of Object.values(s.widgets)) {
          w.b.textContent = 'Expired';
          delete w.b.dataset.done;
          w.o['expired-callback']?.();
        }
      }),
    fail: (p, code = '300030') =>
      p.evaluate((c) => {
        const s = (window as unknown as { __ts: St }).__ts;
        for (const w of Object.values(s.widgets)) {
          delete w.b.dataset.done;
          w.o['error-callback']?.(c);
        }
      }, code),
    nextToken: (p, token) =>
      p.evaluate((t) => {
        (window as unknown as { __ts: St }).__ts.next = t;
      }, token),
    state: (p) =>
      p.evaluate(() => {
        const s = (window as unknown as { __ts?: St }).__ts;
        if (!s) return { rendered: 0, removed: 0, resets: 0, tokens: 0, widgets: 0, last: null };
        return { rendered: s.rendered, removed: s.removed, resets: s.resets, tokens: s.tokens, widgets: Object.keys(s.widgets).length, last: s.last };
      }),
  };
}

/** Clicks the fake widget (the visible one) and waits until it has passed. */
export async function passTurnstile(page: Page): Promise<void> {
  const w = page.locator('.wc-frame:not([hidden]) .wc-fake-turnstile');
  await w.click();
  await w.and(page.locator('[data-done="1"]')).waitFor();
}
