// A window's title and note from its frames (stage 42d, ADR 0127): the
// call carries from a frame of a window's stack to `WindowFrame`
// (src/chrome/kit/window.tsx), as `useScenery` does on the start surface.
//
//   useWindowChrome({ title: 'Import', note: file.name });
//
// - The window shows the chrome of the highest frame on its stack that
//   calls the hook (the one pushed last). A frame pushed over it without a
//   call of its own (a dialog, an old-look sub-page) leaves the chrome as
//   it is; when the caller pops, the chrome reverts to the frame below's
//   call, or to the window's defaults.
// - Each field falls back to the window's default on its own: a frame that
//   sets only `title` keeps the default note. `note: ''` shows no note.
// - Defaults (the window's own, src/chrome/windows.tsx): Profile title
//   "Profile", note the profile name; Scripts title "Scripts".
// - A no-op outside a window (the start page, the ESC menu).
//
// The store (`windowChromeStore`) is the window's: its frames write to it
// through `WindowChromeCtx`; the window's frame reads it with
// `useWindowChromeOf`. Writes happen in layout effects, so the title is
// right before the frame paints.

import { createContext } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface WindowChrome {
  title?: string;
  note?: string;
}

/** Where the frames of one window write their chrome. */
export interface WindowChromeSink {
  /** Sets the chrome of the frame `key` (mounted `seq`-th). */
  put(key: object, seq: number, c: WindowChrome): void;
  /** The frame `key` has gone (popped, or its stack remounted). */
  drop(key: object): void;
}

/** The window's chrome sink; null outside a window. */
export const WindowChromeCtx = createContext<WindowChromeSink | null>(null);

/** Mount order of the frames that call the hook: a frame pushed later mounts later. */
let mounts = 0;

/** Sets the window's title and note while this frame is the highest caller on the window's stack; no-op outside a window. */
export function useWindowChrome(c: WindowChrome): void {
  const sink = useContext(WindowChromeCtx);
  const key = useRef<{ seq: number } | null>(null);
  if (!key.current) key.current = { seq: ++mounts };
  const { title, note } = c;
  useLayoutEffect(() => {
    sink?.put(key.current!, key.current!.seq, { title, note });
  }, [sink, title, note]);
  useLayoutEffect(() => () => sink?.drop(key.current!), [sink]);
}

/** One window's chrome: its frames' calls, and who listens (the window's frame). */
export interface WindowChromeStore {
  readonly sink: WindowChromeSink;
  /** The highest caller's chrome, or null when no frame calls the hook. */
  current(): WindowChrome | null;
  subscribe(fn: () => void): () => void;
}

/** A new, empty store for one window. */
export function windowChromeStore(): WindowChromeStore {
  const calls = new Map<object, { seq: number; c: WindowChrome }>();
  const fns = new Set<() => void>();
  let cur: WindowChrome | null = null;
  const update = (): void => {
    let best: { seq: number; c: WindowChrome } | null = null;
    for (const v of calls.values()) if (!best || v.seq > best.seq) best = v;
    const next = best?.c ?? null;
    if (next === cur || (next && cur && next.title === cur.title && next.note === cur.note)) return;
    cur = next;
    for (const fn of [...fns]) fn();
  };
  return {
    sink: {
      put(key, seq, c) {
        calls.set(key, { seq, c });
        update();
      },
      drop(key) {
        if (calls.delete(key)) update();
      },
    },
    current: () => cur,
    subscribe(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

/** The store's current chrome, re-rendering on change; null without a store or without a caller. */
export function useWindowChromeOf(store: WindowChromeStore | null): WindowChrome | null {
  const [, bump] = useState(0);
  useLayoutEffect(() => {
    if (!store) return;
    bump((n) => n + 1);
    return store.subscribe(() => bump((n) => n + 1));
  }, [store]);
  return store?.current() ?? null;
}
