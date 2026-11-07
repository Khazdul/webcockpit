// TUI kit: the frame stack (Inv §3, §4). One frame is visible at a time;
// sub-pages are pushed and popped, ESC pops one level. Frames below the
// top stay mounted (hidden), so a frame keeps its cursor while a sub-page
// is open and has it again on return.
//
// Keys: while `active`, the stack routes every key to the top frame's
// handler (`useKeys`) from a window keydown listener in the capture phase
// and stops it there, so the game input (which listens on the document)
// never sees keys meant for the chrome. One listener per window serves
// every active stack and hands a key to the most recently activated one
// only, so two stacks never both handle a key (ADR 0103). A key whose
// target is inside a `data-wc-own-keys` element within the stack (a popup
// drawn in a frame, ADR 0110) is left to that element. Unhandled ESC
// pops (or calls `onRootBack` on the root frame; so does `nav.pop()`
// there, e.g. a root frame's Back). Focus: the stack host is focused on
// every frame change unless the frame focused something of its own (a
// text field), and focus is trapped inside the host while active, unless
// `trap` is false (a window, ADR 0103).
//
// Close requests (ADR 0103): `control.requestClose()` leaves the stack the
// way Esc would, frame by frame: it sends Esc to the top frame, and goes on
// with the next frame after every pop, until the root frame's Esc calls
// `onRootBack`. A frame that asks first (`useUnsaved(dirty, prompting)`,
// the editors' Apply / Discard / Keep editing) holds the request while its
// prompt is up; the request goes on when the frame leaves (Apply,
// Discard) and is dropped when the prompt closes with the frame still
// there (Keep editing). `control.unsaved()` asks the frames' `dirty`.

import type { ComponentChildren, JSX, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type NavKey, navKey } from './nav';
import { OWN_KEYS_ATTR } from '../../ui/input-pane';

/** A frame's key handler: true = consumed (the default action is prevented). */
export type KeyHandler = (e: KeyboardEvent, nav: NavKey | null) => boolean;

export type FlashKind = 'ok' | 'fail';

export interface Flash {
  text: string;
  kind: FlashKind;
  /** Changes on every flash, so an identical message restarts. */
  seq: number;
}

/** How long a flash stays (Inv §3.4 feedback row, ~3 s). */
export const FLASH_MS = 3000;

export interface Nav {
  /**
   * Pushes a frame. `overlay`: the frame below stays drawn, veiled and
   * inert (a dialog over the page; stage 42c, ADR 0127). 42-0 stub: the
   * option is accepted and the push is a normal one.
   */
  push(node: VNode, opts?: { overlay?: boolean }): void;
  /** Pops `n` frames (never the root; on the root it calls the stack's `onRootBack`). */
  pop(n?: number): void;
  /** Replaces the top frame. */
  replace(node: VNode): void;
  /** A transient message on the flash row (success in C_ACCENT, failure in C_HINT). */
  flash(text: string, kind?: FlashKind): void;
  /** Number of frames on the stack. */
  depth(): number;
}

interface Entry {
  id: number;
  node: VNode;
  keys: { current: KeyHandler | null };
  /** `useUnsaved`: whether the frame holds changes that would be lost. */
  dirty: { current: (() => boolean) | null };
  /** `useUnsaved`: the frame shows its unsaved-changes prompt (or is saving). */
  prompting: boolean;
}

interface FrameCtxValue {
  entry: Entry;
  nav: Nav;
  isTop: boolean;
  /** Top of the stack, whether or not the stack is active. */
  topFrame: boolean;
  flash: Flash | null;
  /** The stack's close request bookkeeping (`useUnsaved`). */
  promptClosed: (entry: Entry) => void;
}

const FrameCtx = createContext<FrameCtxValue | null>(null);

function useFrameCtx(): FrameCtxValue {
  const c = useContext(FrameCtx);
  if (!c) throw new Error('chrome: not inside a frame');
  return c;
}

/** Registers the frame's key handler (latest closure wins). */
export function useKeys(handler: KeyHandler): void {
  useFrameCtx().entry.keys.current = handler;
}

/**
 * A key layer over the frame's handler (a popover, an inline dialog): while
 * `active` (default true) it gets the frame's keys first, the top layer
 * first; true = consumed. Stage 42c, ADR 0127. 42-0 stub: not routed yet.
 */
export function useKeyLayer(_handler: KeyHandler, _active = true): void {
  useFrameCtx();
}

export function useNav(): Nav {
  return useFrameCtx().nav;
}

/** True while this frame is the visible one (top of an active, shown stack). */
export function useIsTop(): boolean {
  return useFrameCtx().isTop;
}

/** True while this frame is the stack's top frame, active or not (a window without focus). */
export function useIsTopFrame(): boolean {
  return useFrameCtx().topFrame;
}

/** The current flash message (shared by the stack). */
export function useFlash(): Flash | null {
  return useFrameCtx().flash;
}

/**
 * Registers the frame's unsaved state (ADR 0103): `dirty` tells whether
 * leaving now would lose changes (the Exit popup's warning); `prompting`
 * is true while the frame shows its unsaved-changes prompt or saves, so a
 * close request waits for the answer. The prompt closing with the frame
 * still on the stack (Keep editing) drops the close request.
 */
export function useUnsaved(dirty: () => boolean, prompting: boolean): void {
  const c = useFrameCtx();
  const was = c.entry.prompting;
  c.entry.dirty.current = dirty;
  c.entry.prompting = prompting;
  useLayoutEffect(() => {
    if (was && !prompting) c.promptClosed(c.entry);
  }, [prompting]);
}

/** What the owner of a stack can ask of it (a window, ADR 0103). */
export interface StackControl {
  /** Leaves the stack as Esc would, frame by frame, through the frames' prompts. */
  requestClose(): void;
  /** True while a frame on the stack would lose changes. */
  unsaved(): boolean;
  /** True while the top frame shows its unsaved-changes prompt. */
  prompting(): boolean;
}

// One capture-phase keydown listener per window; the most recently
// activated stack gets the key.
type Router = (e: KeyboardEvent) => void;
const routers = new WeakMap<Window, { list: Router[]; listener: (e: KeyboardEvent) => void }>();

function claimKeys(win: Window, fn: Router): () => void {
  let r = routers.get(win);
  if (!r) {
    const list: Router[] = [];
    const listener = (e: KeyboardEvent): void => list[list.length - 1]?.(e);
    r = { list, listener };
    routers.set(win, r);
  }
  if (r.list.length === 0) win.addEventListener('keydown', r.listener, true);
  r.list.push(fn);
  const reg = r;
  return () => {
    const i = reg.list.lastIndexOf(fn);
    if (i >= 0) reg.list.splice(i, 1);
    if (reg.list.length === 0) win.removeEventListener('keydown', reg.listener, true);
  };
}

/** Close requests: how many Esc steps that neither pop nor prompt are tried before giving up. */
const CLOSE_TRIES = 6;

export interface FrameStackProps {
  root: VNode;
  /** Routes keys (and traps focus, unless `trap` is false). */
  active: boolean;
  /** Keep the focus inside the host while active (default true; a window: false). */
  trap?: boolean;
  /** Receives the stack's control (a window's close request, ADR 0103). */
  control?: (c: StackControl | null) => void;
  /** Keys are swallowed but not handled (the too-small notice is shown). */
  paused?: boolean;
  /** ESC on the root frame (start page: nothing; ESC menu: close). */
  onRootBack?: () => void;
  /**
   * Draws each frame's node inside a wrapper component (the start surface
   * marks old-look frames, ADR 0125). Called on every render; must give a
   * frame the same wrapper type every time.
   */
  wrap?: (node: VNode) => VNode;
  /** Extra class and style for a frame's element (the start surface places old-look frames on the cell grid). */
  frameAttrs?: (node: VNode) => { class?: string; style?: JSX.CSSProperties } | null;
  /** Extra content inside the host (e.g. a size notice). */
  children?: ComponentChildren;
  /**
   * The hold (stage 42c, ADR 0127): ms the frame below (a push) or the
   * popped frame (a pop) stays drawn, inert and out of the key path, so
   * the surface's fades are real. 42-0 stub: accepted, not used yet.
   */
  hold?: (from: VNode, to: VNode, dir: 'push' | 'pop') => number;
}

const isTextField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable === true;
};

export function FrameStack(props: FrameStackProps): VNode {
  const nextId = useRef(1);
  const mk = (node: VNode): Entry => ({
    id: nextId.current++,
    node,
    keys: { current: null },
    dirty: { current: null },
    prompting: false,
  });
  const [stack, setStack] = useState<Entry[]>(() => [mk(props.root)]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const propsRef = useRef(props);
  propsRef.current = props;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSeq = useRef(0);

  const nav = useMemo<Nav>(
    () => ({
      push: (node) => {
        setFlash(null);
        setStack((s) => [...s, mk(node)]);
      },
      // Popping the root frame leaves the stack (`onRootBack`): the ESC
      // menu opened straight at a frame closes (ADR 0099).
      pop: (n = 1) => {
        if (stackRef.current.length <= 1) propsRef.current.onRootBack?.();
        else setStack((s) => (s.length > 1 ? s.slice(0, Math.max(1, s.length - n)) : s));
      },
      replace: (node) => setStack((s) => [...s.slice(0, -1), mk(node)]),
      flash: (text, kind = 'ok') => {
        if (flashTimer.current) clearTimeout(flashTimer.current);
        setFlash({ text, kind, seq: ++flashSeq.current });
        flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
      },
      depth: () => stackRef.current.length,
    }),
    [],
  );

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  /** An Esc for the top frame: its handler first, else pop (or `onRootBack` on the root). */
  const back = (e: KeyboardEvent): 'handled' | 'popped' | 'root' => {
    const s = stackRef.current;
    const top = s[s.length - 1]!;
    if (top.keys.current?.(e, 'back')) return 'handled';
    if (s.length > 1) {
      nav.pop();
      return 'popped';
    }
    propsRef.current.onRootBack?.();
    return 'root';
  };

  // Keys: capture phase on the window, ahead of the game input's document
  // listener. A layout effect, so keys work from the first painted frame.
  useLayoutEffect(() => {
    if (!props.active) return;
    const win = hostRef.current?.ownerDocument.defaultView;
    if (!win) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing) return;
      // A popup inside a frame keeps its keys (a window's own frame is outside the host).
      const own = (e.target as Element | null)?.closest?.(`[${OWN_KEYS_ATTR}]`);
      if (own && own !== hostRef.current && hostRef.current?.contains(own)) return;
      e.stopPropagation();
      if (propsRef.current.paused) {
        if (navKey(e)) e.preventDefault();
        return;
      }
      const s = stackRef.current;
      const top = s[s.length - 1]!;
      const nk = navKey(e);
      if (top.keys.current?.(e, nk)) {
        e.preventDefault();
        return;
      }
      if (nk === 'back') {
        e.preventDefault();
        if (s.length > 1) nav.pop();
        else propsRef.current.onRootBack?.();
        return;
      }
      if (nk === 'tab' || nk === 'backtab') e.preventDefault();
      else if (nk && !isTextField(e.target)) e.preventDefault();
    };
    return claimKeys(win, onKey);
  }, [props.active, nav]);

  // Close requests (see the header).
  const closing = useRef(false);
  const tries = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  const later = (fn: () => void): void => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      if (alive.current) fn();
    }, 0);
  };
  const closeStep = (): void => {
    if (!closing.current) return;
    const s = stackRef.current;
    const top = s[s.length - 1]!;
    // The prompt is up: the answer decides.
    if (top.prompting) return;
    const depth = s.length;
    const win = hostRef.current?.ownerDocument.defaultView;
    const KE = win?.KeyboardEvent ?? KeyboardEvent;
    // The root's Esc: the owner closes (or keeps) the stack; the request is done.
    if (back(new KE('keydown', { key: 'Escape', code: 'Escape', cancelable: true })) === 'root') {
      closing.current = false;
      return;
    }
    later(() => {
      if (!closing.current) return;
      const now = stackRef.current;
      if (now.length < depth) return; // the pop's own effect goes on
      if (now[now.length - 1]!.prompting) return;
      // Esc closed something inside the frame (a search, a pop-up): again.
      if (++tries.current < CLOSE_TRIES) closeStep();
      else closing.current = false;
    });
  };
  // After every pop during a close request, the next frame's Esc.
  const depthNow = stack.length;
  const lastDepth = useRef(depthNow);
  useLayoutEffect(() => {
    const popped = depthNow < lastDepth.current;
    lastDepth.current = depthNow;
    if (popped && closing.current) {
      tries.current = 0;
      later(closeStep);
    }
  }, [depthNow]);
  const promptClosed = (entry: Entry): void => {
    // Keep editing: the frame is still there.
    if (stackRef.current.includes(entry)) closing.current = false;
  };
  const control = useMemo<StackControl>(
    () => ({
      requestClose: () => {
        closing.current = true;
        tries.current = 0;
        closeStep();
      },
      unsaved: () => stackRef.current.some((e) => e.dirty.current?.() === true),
      prompting: () => stackRef.current[stackRef.current.length - 1]!.prompting,
    }),
    [],
  );
  useLayoutEffect(() => {
    props.control?.(control);
    return () => props.control?.(null);
  }, [props.control, control]);

  // Focus: on every frame change, and trapped while active.
  const topId = stack[stack.length - 1]!.id;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!props.active || !host) return;
    const top = host.querySelector<HTMLElement>(`[data-frame="${topId}"]`);
    if (!top?.contains(host.ownerDocument.activeElement)) host.focus({ preventScroll: true });
  }, [topId, props.active]);

  useEffect(() => {
    const host = hostRef.current;
    if (!props.active || props.trap === false || !host) return;
    const doc = host.ownerDocument;
    const onFocusIn = (e: FocusEvent): void => {
      // A passive effect's cleanup runs only after the next paint: a render
      // that made the stack inactive (Enter MUME's transition hands the
      // focus to the game input in the same task) lets go at once.
      if (!propsRef.current.active || propsRef.current.trap === false) return;
      if (!host.contains(e.target as Node)) host.focus({ preventScroll: true });
    };
    doc.addEventListener('focusin', onFocusIn);
    return () => doc.removeEventListener('focusin', onFocusIn);
  }, [props.active, props.trap]);

  return (
    <div
      ref={hostRef}
      class="wc-stack"
      tabIndex={-1}
      // The game input refocuses itself on document mouseup; not while the
      // chrome is up. Except inside `[data-wc-native-mouse]` (the profile
      // editor's CodeMirror content), whose drag selection ends on a
      // document mouseup; the game input ignores editable targets.
      onMouseUp={(e) => {
        if (!(e.target as Element | null)?.closest?.('[data-wc-native-mouse]')) e.stopPropagation();
      }}
    >
      {stack.map((entry, i) => {
        const isTop = i === stack.length - 1;
        const attrs = props.frameAttrs?.(entry.node);
        return (
          <div
            key={entry.id}
            class={'wc-frame' + (attrs?.class ? ' ' + attrs.class : '')}
            style={attrs?.style}
            data-frame={entry.id}
            hidden={!isTop}
          >
            <FrameCtx.Provider
              value={{ entry, nav, isTop: isTop && props.active, topFrame: isTop, flash: isTop ? flash : null, promptClosed }}
            >
              {props.wrap ? props.wrap(entry.node) : entry.node}
            </FrameCtx.Provider>
          </div>
        );
      })}
      {props.children}
    </div>
  );
}
