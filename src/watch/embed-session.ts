// The address of a run that plays as a frame on the start surface (stage
// 74 A, ADR 0163). A run opened from the Community page or from Published
// runs is pushed on the start page's frame stack (src/watch/embed.tsx), with
// no page load; this file keeps the browser's history in step with it:
//
//   open        `history.pushState` to the run's own address (`watchHref`),
//               so a reload, a copied address and the watch page's Log in
//               (src/watch/return.ts) all see the run; the title becomes
//               the watch page's.
//   Back        one way out, the browser's: the in-app Back (the button, B,
//               Esc) calls `history.back()`, and the `popstate` that follows
//               (as after the browser's own Back, or a swipe) closes the
//               frame (`close`) and puts the title back. The address is the
//               history entry's, so nothing is written on the way out and no
//               stale entry is left behind.
//   Forward     onto a run's entry whose frame has gone: the page steps
//               back again (the address never names a run the page does not
//               show).
//   unmounted   by something else than Back (the start page's stack was made
//               anew): the entry is left the same way.
//
// Where `pushState` is refused the run still opens, without an address of
// its own, and Back closes the frame directly.
//
// No imports and no DOM beyond `history`, `document.title` and `popstate`:
// unit tested with a fake (embed-session.test.ts).

/** The key of a run's history entry state: `{ wcWatch: <token> }`. */
export const WATCH_STATE_KEY = 'wcWatch';

/** What a session needs of the window (tests pass a fake). */
export interface SessionEnv {
  history: { readonly state: unknown; pushState(data: unknown, unused: string, url: string): void; back(): void };
  document: { title: string };
  addEventListener(type: 'popstate', fn: () => void): void;
  removeEventListener(type: 'popstate', fn: () => void): void;
}

export interface WatchSession {
  /** The run's frame is the one the address names (false once it is being left or has gone). */
  live(): boolean;
  /** The in-app Back: the browser's Back (a second call while the first is on its way does nothing). */
  back(): void;
  /** The frame unmounted. After Back: nothing left to do. Otherwise the run's entry is left now. */
  gone(): void;
}

export interface WatchSessionOptions {
  /** The run's address (src/watch/href.ts `watchHref`). */
  href: string;
  /** The title while the run shows, until its meta gives its own. */
  title: string;
  /** Closes the frame (pops it off the stack). Called once, on the way back. */
  close(): void;
  env?: SessionEnv;
}

const tokenOf = (state: unknown): string | null => {
  const t = typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[WATCH_STATE_KEY] : null;
  return typeof t === 'string' ? t : null;
};

/** The entries whose frame is up, and the windows that step back from any other run's entry. */
const liveTokens = new Set<string>();
const guarded = new WeakSet<object>();
let seq = 0;

/** Forward onto a run's entry with no frame: back again (once per window, installed with the first run). */
function guard(env: SessionEnv): void {
  if (guarded.has(env)) return;
  guarded.add(env);
  env.addEventListener('popstate', () => {
    const t = tokenOf(env.history.state);
    if (t !== null && !liveTokens.has(t)) env.history.back();
  });
}

/** Opens a run's history entry; the frame is pushed by the caller right after. */
export function beginWatchSession(o: WatchSessionOptions): WatchSession {
  const env = o.env ?? (globalThis as unknown as SessionEnv);
  const token = `${Date.now().toString(36)}-${++seq}`;
  const titleBefore = env.document.title;
  let live = true;
  let leaving = false;
  let pushed = false;

  const end = (): void => {
    if (!live) return;
    live = false;
    liveTokens.delete(token);
    env.removeEventListener('popstate', onPop);
    env.document.title = titleBefore;
  };
  const onPop = (): void => {
    // Back on the run's own entry (from one made above it): the frame stays.
    if (tokenOf(env.history.state) === token) {
      leaving = false;
      return;
    }
    end();
    o.close();
  };

  guard(env);
  try {
    env.history.pushState({ [WATCH_STATE_KEY]: token }, '', o.href);
    pushed = true;
    liveTokens.add(token);
  } catch {
    /* no address of its own: Back closes the frame directly */
  }
  env.document.title = o.title;
  env.addEventListener('popstate', onPop);

  return {
    live: () => live && !leaving,
    back: () => {
      if (!live || leaving) return;
      if (pushed && tokenOf(env.history.state) === token) {
        leaving = true;
        env.history.back();
        return;
      }
      end();
      o.close();
    },
    gone: () => {
      if (!live) return;
      const onEntry = pushed && tokenOf(env.history.state) === token;
      end();
      // The guard's `popstate` finds no frame for the entry left and does nothing more.
      if (onEntry && !leaving) env.history.back();
    },
  };
}

/** `&fsmode=…` and `&fsdebug` of the start page's `search`, to go after a run's address (src/core/fs-debug.ts reads them there). */
export function carriedQuery(search: string): string {
  const q = new URLSearchParams(search);
  const mode = q.get('fsmode');
  return (mode && /^[a-z]+$/.test(mode) ? `&fsmode=${mode}` : '') + (q.has('fsdebug') ? '&fsdebug' : '');
}
