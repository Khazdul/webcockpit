// TUI kit: the frame stack (Inv §3, §4). One frame is visible at a time;
// sub-pages are pushed and popped, ESC pops one level. Frames below the
// top stay mounted (hidden), so a frame keeps its cursor while a sub-page
// is open and has it again on return.
//
// Keys: while `active`, one window keydown listener in the capture phase
// routes every key to the top frame's handler (`useKeys`) and stops it
// there, so the game input (which listens on the document) never sees
// keys meant for the chrome. Unhandled ESC pops (or calls `onRootBack`
// on the root frame; so does `nav.pop()` there, e.g. a root frame's Back). Focus: the stack host is focused on every frame
// change unless the frame focused something of its own (a text field),
// and focus is trapped inside the host while active.

import type { ComponentChildren, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type NavKey, navKey } from './nav';

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
  push(node: VNode): void;
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
}

interface FrameCtxValue {
  entry: Entry;
  nav: Nav;
  isTop: boolean;
  flash: Flash | null;
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

export function useNav(): Nav {
  return useFrameCtx().nav;
}

/** True while this frame is the visible one (top of an active, shown stack). */
export function useIsTop(): boolean {
  return useFrameCtx().isTop;
}

/** The current flash message (shared by the stack). */
export function useFlash(): Flash | null {
  return useFrameCtx().flash;
}

export interface FrameStackProps {
  root: VNode;
  /** Routes keys and traps focus. */
  active: boolean;
  /** Keys are swallowed but not handled (the too-small notice is shown). */
  paused?: boolean;
  /** ESC on the root frame (start page: nothing; ESC menu: close). */
  onRootBack?: () => void;
  /** Extra content inside the host (e.g. a size notice). */
  children?: ComponentChildren;
}

const isTextField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable === true;
};

export function FrameStack(props: FrameStackProps): VNode {
  const nextId = useRef(1);
  const mk = (node: VNode): Entry => ({ id: nextId.current++, node, keys: { current: null } });
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

  // Keys: capture phase on the window, ahead of the game input's document
  // listener. A layout effect, so keys work from the first painted frame.
  useLayoutEffect(() => {
    if (!props.active) return;
    const win = hostRef.current?.ownerDocument.defaultView;
    if (!win) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing) return;
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
    win.addEventListener('keydown', onKey, true);
    return () => win.removeEventListener('keydown', onKey, true);
  }, [props.active, nav]);

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
    if (!props.active || !host) return;
    const doc = host.ownerDocument;
    const onFocusIn = (e: FocusEvent): void => {
      if (!host.contains(e.target as Node)) host.focus({ preventScroll: true });
    };
    doc.addEventListener('focusin', onFocusIn);
    return () => doc.removeEventListener('focusin', onFocusIn);
  }, [props.active]);

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
        return (
          <div key={entry.id} class="wc-frame" data-frame={entry.id} hidden={!isTop}>
            <FrameCtx.Provider value={{ entry, nav, isTop: isTop && props.active, flash: isTop ? flash : null }}>
              {entry.node}
            </FrameCtx.Provider>
          </div>
        );
      })}
      {props.children}
    </div>
  );
}
