// A run as a frame on the start surface (stage 74 A, ADR 0163): the
// history entry that goes with it (src/watch/embed-session.ts), against a
// fake window with a real history stack.
import { describe, expect, it } from 'vitest';
import { type SessionEnv, WATCH_STATE_KEY, beginWatchSession, carriedQuery } from '../../src/watch/embed-session';

/** A window's history, its title and `popstate` (fired at once on a traversal). */
function fakeWindow(o: { refusePush?: boolean } = {}) {
  const entries: { url: string; state: unknown }[] = [{ url: '/?cloudtest', state: null }];
  let at = 0;
  const subs = new Set<() => void>();
  const go = (to: number): void => {
    if (to < 0 || to >= entries.length) return;
    at = to;
    for (const fn of [...subs]) fn();
  };
  const env: SessionEnv = {
    history: {
      get state() {
        return entries[at]!.state;
      },
      pushState: (state, _unused, url) => {
        if (o.refusePush) throw new Error('SecurityError');
        entries.splice(at + 1, entries.length, { url, state });
        at++;
      },
      back: () => go(at - 1),
    },
    document: { title: 'WebCockpit' },
    addEventListener: (_t, fn) => void subs.add(fn),
    removeEventListener: (_t, fn) => void subs.delete(fn),
  };
  return { env, entries, url: () => entries[at]!.url, index: () => at, forward: () => go(at + 1), back: () => go(at - 1), listeners: () => subs.size };
}

const HREF = '/r/Ab3dE5fG7hJk?from=community&cloudtest';

function open(w: ReturnType<typeof fakeWindow>, href = HREF) {
  let closed = 0;
  const s = beginWatchSession({ href, title: 'Shared log · WebCockpit', close: () => closed++, env: w.env });
  return { s, closed: () => closed };
}

describe("a run's history entry", () => {
  it('opens on the run’s address with the watch page’s title', () => {
    const w = fakeWindow();
    const { s, closed } = open(w);
    expect(w.url()).toBe(HREF);
    expect(w.entries).toHaveLength(2);
    expect((w.env.history.state as Record<string, unknown>)[WATCH_STATE_KEY]).toEqual(expect.any(String));
    expect(w.env.document.title).toBe('Shared log · WebCockpit');
    expect(s.live()).toBe(true);
    expect(closed()).toBe(0);
  });

  it('the in-app Back is the browser’s: one step back, the frame closed once, the title put back', () => {
    const w = fakeWindow();
    const { s, closed } = open(w);
    w.env.document.title = 'Clearing the ranger camp · WebCockpit';
    s.back();
    expect(w.url()).toBe('/?cloudtest');
    expect(closed()).toBe(1);
    expect(s.live()).toBe(false);
    expect(w.env.document.title).toBe('WebCockpit');
    // A second Back (a double press) does not leave the start page's entry.
    s.back();
    s.back();
    expect(w.index()).toBe(0);
    expect(closed()).toBe(1);
    // The frame unmounts after its hold: nothing more.
    s.gone();
    expect(w.index()).toBe(0);
  });

  it('the browser’s Back closes the frame the same way', () => {
    const w = fakeWindow();
    const { s, closed } = open(w);
    w.back();
    expect(closed()).toBe(1);
    expect(s.live()).toBe(false);
    expect(w.env.document.title).toBe('WebCockpit');
  });

  it('Back is not live while it is on its way (a late meta does not set the title)', () => {
    const w = fakeWindow();
    // A history whose traversal comes later, as a browser's does.
    let pending: (() => void) | null = null;
    const back = w.env.history.back;
    w.env.history.back = () => void (pending = back);
    const { s, closed } = open(w);
    s.back();
    expect(s.live()).toBe(false);
    expect(closed()).toBe(0);
    s.back();
    pending!();
    expect(closed()).toBe(1);
    expect(w.index()).toBe(0);
  });

  it('Forward onto the run’s entry with no frame steps back again', () => {
    const w = fakeWindow();
    const { closed } = open(w);
    w.back();
    w.forward();
    expect(w.url()).toBe('/?cloudtest');
    expect(closed()).toBe(1);
    // A new run from there replaces the old entry.
    const b = open(w, '/r/Zz3dE5fG7hJk?from=community&cloudtest');
    expect(w.entries.map((e) => e.url)).toEqual(['/?cloudtest', '/r/Zz3dE5fG7hJk?from=community&cloudtest']);
    b.s.back();
    expect(b.closed()).toBe(1);
    expect(w.url()).toBe('/?cloudtest');
  });

  it('a frame unmounted by something else leaves the entry and puts the title back, without closing', () => {
    const w = fakeWindow();
    const { s, closed } = open(w);
    s.gone();
    expect(w.url()).toBe('/?cloudtest');
    expect(w.env.document.title).toBe('WebCockpit');
    expect(closed()).toBe(0);
    s.gone();
    expect(w.index()).toBe(0);
  });

  it('where pushState is refused the run opens without an address and Back closes it directly', () => {
    const w = fakeWindow({ refusePush: true });
    const { s, closed } = open(w);
    expect(w.entries).toHaveLength(1);
    expect(w.env.document.title).toBe('Shared log · WebCockpit');
    s.back();
    expect(closed()).toBe(1);
    expect(w.index()).toBe(0);
    expect(w.env.document.title).toBe('WebCockpit');
  });

  it('keeps one listener per window besides the open run’s', () => {
    const w = fakeWindow();
    const a = open(w);
    expect(w.listeners()).toBe(2);
    a.s.back();
    expect(w.listeners()).toBe(1);
    const b = open(w);
    expect(w.listeners()).toBe(2);
    b.s.back();
    expect(w.listeners()).toBe(1);
  });
});

describe('the start page’s fullscreen switches', () => {
  it('are carried to the run’s address', () => {
    expect(carriedQuery('?cloudtest')).toBe('');
    expect(carriedQuery('?fsmode=fill&cloudtest')).toBe('&fsmode=fill');
    expect(carriedQuery('?fsdebug&fsmode=page')).toBe('&fsmode=page&fsdebug');
    expect(carriedQuery('?fsmode=%22%3E')).toBe('');
  });
});
