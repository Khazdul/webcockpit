// Cloudflare Turnstile on the account pages (stage 60, spec §7.10, ADR
// 0145 "Turnstile"; the CSP's source for it is ADR 0144 "As built (stage
// 60): the CSP"). Plain DOM, no Preact: the component over it is
// turnstile-box.tsx (`useTurnstile`), which is what a page uses.
//
// - Cloudflare's script is loaded only when a page mounts a widget: never
//   at start, never with the flag off, never on Log in before the server
//   asked for a check. One `<script src>` element (no inline script, no
//   `eval`: the CSP), explicit rendering (`?render=explicit`), and the
//   script element's own `load` / `error` events instead of a global
//   callback. A load that failed (an extension blocked it, offline) is
//   forgotten, so `retry()` loads it again.
// - The widget is rendered with the site key of `/api/config`
//   (`accountConfig().turnstileSiteKey`), dark, `normal` (300 × 65) or
//   `compact` (150 × 140) where the page is narrower than 300 px.
// - A token works once and for five minutes. `take()` hands the token out
//   and resets the widget at once, so the next submit gets a new one;
//   Turnstile renews an expired token by itself (`refresh-expired: auto`)
//   and tells us through the callbacks.
// - `dispose()` removes the widget (`turnstile.remove`) and makes every
//   later callback a no-op. The script element stays for the next page.
//
// Checked against Cloudflare's client-side documentation on 2026-11-14
// (render, reset, remove; `callback`, `error-callback` whose truthy return
// means "handled", `expired-callback`, `timeout-callback`,
// `unsupported-callback`; sizes; `retry: auto`).
//
// Under e2e the script is a stub (tests/e2e/turnstile-stub.ts).

export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The script gives up after this long (ms). */
export const TURNSTILE_LOAD_MS = 15_000;

/** The part of `window.turnstile` that is used. */
export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  reset(id: string): void;
  remove(id: string): void;
}

/**
 * `loading`  the script (or the site key) is on its way
 * `waiting`  the widget is up and has no token yet (it works by itself, or waits for the person)
 * `passed`   a token is ready
 * `expired`  the token ran out; the widget is making a new one
 * `blocked`  the script could not be loaded (an extension, offline): `retry()`
 * `error`    the widget reported an error (`detail`: its code); it retries by itself, `retry()` resets it
 * `unsupported`  Turnstile does not support this browser
 * `nokey`    the server has no site key: registration and recovery cannot work
 */
export type TurnstileState = 'loading' | 'waiting' | 'passed' | 'expired' | 'blocked' | 'error' | 'unsupported' | 'nokey';

export interface TurnstileWidget {
  readonly state: TurnstileState;
  /** The token, once: the widget is reset for the next one. Null when none is ready. */
  take(): string | null;
  /** After `blocked`: loads the script again. After `error` or `expired`: resets the widget. */
  retry(): void;
  dispose(): void;
}

let loading: Promise<TurnstileApi> | null = null;

const apiOf = (win: Window): TurnstileApi | null => {
  const t = (win as unknown as { turnstile?: Partial<TurnstileApi> }).turnstile;
  return t && typeof t.render === 'function' && typeof t.reset === 'function' && typeof t.remove === 'function' ? (t as TurnstileApi) : null;
};

/** Loads Cloudflare's script once per page (again after a failure). Rejects when it does not arrive. */
export function loadTurnstile(doc: Document = document): Promise<TurnstileApi> {
  const win = doc.defaultView;
  if (!win) return Promise.reject(new Error('turnstile: no window'));
  const have = apiOf(win);
  if (have) return Promise.resolve(have);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const el = doc.createElement('script');
    let timer = 0;
    const fail = (why: string): void => {
      win.clearTimeout(timer);
      el.remove();
      loading = null;
      reject(new Error(`turnstile: ${why}`));
    };
    el.src = TURNSTILE_SRC;
    el.async = true;
    el.addEventListener('load', () => {
      win.clearTimeout(timer);
      const api = apiOf(win);
      if (api) resolve(api);
      else fail('no api');
    });
    el.addEventListener('error', () => fail('not loaded'));
    timer = win.setTimeout(() => fail('timeout'), TURNSTILE_LOAD_MS);
    doc.head.append(el);
  });
  return loading;
}

/** Tests: forget the script's promise. */
export function resetTurnstileForTest(): void {
  loading = null;
}

export interface TurnstileOptions {
  /** The site key, or a promise of it; null: the server has none (`nokey`). */
  siteKey: string | null | Promise<string | null>;
  /** Called on every change of state (`detail`: the widget's error code). */
  onState(state: TurnstileState, detail?: string): void;
  /** Tests: another loader. */
  load?: (doc: Document) => Promise<TurnstileApi>;
}

/** Mounts a widget in `slot` (an empty element of the page's). */
export function mountTurnstile(slot: HTMLElement, o: TurnstileOptions): TurnstileWidget {
  const doc = slot.ownerDocument;
  const load = o.load ?? loadTurnstile;
  let state: TurnstileState = 'loading';
  let token: string | null = null;
  let api: TurnstileApi | null = null;
  let id: string | null = null;
  let gone = false;

  const set = (next: TurnstileState, detail?: string): void => {
    if (gone) return;
    state = next;
    try {
      o.onState(next, detail);
    } catch {
      /* the page's problem */
    }
  };

  const render = (key: string): void => {
    if (gone || !api) return;
    slot.replaceChildren();
    token = null;
    set('waiting');
    try {
      id =
        api.render(slot, {
          sitekey: key,
          theme: 'dark',
          size: slot.clientWidth > 0 && slot.clientWidth < 300 ? 'compact' : 'normal',
          // The token goes into the flow's request in script: no hidden form field.
          'response-field': false,
          'refresh-expired': 'auto',
          retry: 'auto',
          callback: (t: unknown) => {
            if (gone || typeof t !== 'string' || !t) return;
            token = t;
            set('passed');
          },
          'expired-callback': () => {
            token = null;
            set('expired');
          },
          'timeout-callback': () => {
            token = null;
            set('waiting');
          },
          'error-callback': (code: unknown) => {
            token = null;
            set('error', code === undefined || code === null ? undefined : String(code));
            // Handled here: Turnstile logs nothing more (and retries by itself).
            return true;
          },
          'unsupported-callback': () => {
            token = null;
            set('unsupported');
          },
        }) ?? null;
    } catch {
      id = null;
      set('error');
    }
  };

  const start = (): void => {
    set('loading');
    void Promise.all([load(doc), Promise.resolve(o.siteKey)]).then(
      ([a, key]) => {
        if (gone) return;
        api = a;
        if (!key) set('nokey');
        else render(key);
      },
      () => set('blocked'),
    );
  };
  start();

  return {
    get state() {
      return state;
    },
    take() {
      const t = token;
      if (t === null) return null;
      token = null;
      // Used: the widget makes the next one now, ready if this try fails.
      if (api && id !== null) {
        set('waiting');
        try {
          api.reset(id);
        } catch {
          /* the widget is gone: `retry` renders anew */
        }
      }
      return t;
    },
    retry() {
      if (gone) return;
      if (!api || id === null) {
        start();
        return;
      }
      token = null;
      set('waiting');
      try {
        api.reset(id);
      } catch {
        id = null;
        start();
      }
    },
    dispose() {
      if (gone) return;
      gone = true;
      token = null;
      if (api && id !== null) {
        try {
          api.remove(id);
        } catch {
          /* already gone */
        }
      }
      id = null;
      slot.replaceChildren();
    },
  };
}

/** What the page says beside the widget, or null (the widget speaks for itself). */
export function turnstileWords(state: TurnstileState, detail?: string): string | null {
  switch (state) {
    case 'loading':
      return 'Loading the check that you are a person…';
    case 'expired':
      return 'The check ran out. It is being done again.';
    case 'blocked':
      return 'The check that you are a person could not be loaded. It comes from Cloudflare (challenges.cloudflare.com): an extension may be blocking it, or the network is down.';
    case 'error':
      return `The check could not be done${detail ? ` (${detail})` : ''}. It tries again by itself.`;
    case 'unsupported':
      return 'The check that you are a person does not work in this browser. Try another browser.';
    case 'nokey':
      return 'The server has no check set up, so this cannot be done right now. Try again later.';
    default:
      return null;
  }
}
