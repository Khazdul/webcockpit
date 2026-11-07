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
//
// Stage 42c (ADR 0127), for the lantern look:
//
// - Overlay frames: `nav.push(node, { overlay: true })` keeps the frame
//   below drawn (inert, `data-under`) under the overlay, which gets the
//   keys (a dialog, look-overlay.tsx). Chains stack up (a dialog over a
//   dialog: the page and the first dialog stay drawn). The stack's flash
//   belongs to the page (the topmost frame that is not an overlay), so a
//   flash a dialog makes before it pops shows on the page after the pop.
//   An overlay frame must be a look frame (`lookFrame`).
// - The hold (`hold` prop, asked on a push or a pop between two pages,
//   never for an overlay): the frame below a push stays drawn for that
//   many ms (`data-held="push"`), a popped frame stays mounted for that
//   many ms (`data-held="pop"`, after the frames), both inert and out of
//   the key path, so the start surface's fades are real. One hold at a
//   time: the next push or pop ends the last one.
// - Only the top frame lacks the `hidden` attribute; a frame drawn under
//   an overlay or held keeps it and is shown by its `data-under` /
//   `data-held` (look-overlay.css), so `.wc-frame:not([hidden])` stays
//   "the top frame".
// - Key layers (`useKeyLayer`): a popover or an inline dialog gets the top
//   frame's keys before the frame's handler, the most recent layer first.
// - The Esc rule (look frames and overlays only): an Esc that no layer and
//   not the frame's handler consumes, pressed in a text field inside the
//   frame, blurs the field and gives the focus back to the host; it does
//   not pop. Old-look frames keep Esc = back from anywhere.

import type { ComponentChildren, JSX, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type NavKey, navKey } from './nav';
import { inTextField } from './look-keys';
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
   * Pushes a frame. `overlay`: the frame below stays drawn and inert under
   * it, and keeps the stack's flash (a dialog over the page; it must be a
   * look frame and bring its own veil, as `Dialog` does; ADR 0127).
   */
  push(node: VNode, opts?: { overlay?: boolean }): void;
  /** Pops `n` frames (never the root; on the root it calls the stack's `onRootBack`). */
  pop(n?: number): void;
  /** Replaces the top frame (an overlay stays an overlay). */
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
  /** Pushed with `{ overlay: true }`: the frames below stay drawn. */
  overlay: boolean;
  /** `useKeyLayer`: the layers over the frame's handler, the most recent last. */
  layers: { run: KeyHandler }[];
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
 * `active` (default true) and its frame is the top frame, it gets the keys
 * before the frame's handler, the most recently activated layer first;
 * true = consumed, false = the next layer (then the frame) gets the key.
 * Latest closure wins. Stage 42c, ADR 0127.
 */
export function useKeyLayer(handler: KeyHandler, active = true): void {
  const { entry } = useFrameCtx();
  const latest = useRef(handler);
  latest.current = handler;
  useLayoutEffect(() => {
    if (!active) return;
    const layer = { run: (e: KeyboardEvent, nk: NavKey | null): boolean => latest.current(e, nk) };
    entry.layers.push(layer);
    return () => {
      const i = entry.layers.indexOf(layer);
      if (i >= 0) entry.layers.splice(i, 1);
    };
  }, [active, entry]);
}

/**
 * A frame that shows an embedded player (`services.embedPlayer`, a bare
 * view) gives it the keys while `on`: the stack's key listener and the
 * view's are both capture listeners on the window, and the stack's runs
 * first, so both would see every key (Space would toggle playback and
 * press the page's button; Esc would pop the page and then call the
 * view's `onEsc`). This layer swallows every key for the frame; the view
 * handles them, and its `onEsc` leaves. Off (the player parked or not
 * ready yet): the frame's keys as usual. Stage 42 wave 3, ADR 0127.
 */
export function usePlayerKeys(on: boolean): void {
  useKeyLayer(() => true, on);
}

/**
 * The key `lookFrame` (look.tsx) sets on a look frame's component. It
 * lives here, and look.tsx imports it: importing the kit's barrel from
 * this file would pull the whole lantern kit into the chunk this file
 * shares with the editors.
 */
export const LOOK_MARK = '__wcLook';

/** Whether `node` is a look frame (`lookFrame`). */
function isLookNode(node: VNode): boolean {
  const t = node.type as unknown;
  return typeof t === 'function' && (t as unknown as Record<string, unknown>)[LOOK_MARK] === true;
}

/** The top frame's layers, then its handler: true when one consumed the key. */
function runKeys(entry: Entry, e: KeyboardEvent, nk: NavKey | null): boolean {
  for (let i = entry.layers.length - 1; i >= 0; i--) if (entry.layers[i]!.run(e, nk)) return true;
  return entry.keys.current?.(e, nk) === true;
}

/** Index of the page: the topmost frame that is not an overlay (the root never is one). */
function pageIndex(s: readonly Entry[]): number {
  let i = s.length - 1;
  while (i > 0 && s[i]!.overlay) i--;
  return i;
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

/** True for a frame pushed with `{ overlay: true }` (a dialog over the page). */
export function useIsOverlay(): boolean {
  return useFrameCtx().entry.overlay;
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
   * the surface's fades are real. `from` is the page that was shown, `to`
   * the page shown next (overlays are skipped: an overlay's push or pop
   * asks nothing). 0 or less: no hold.
   */
  hold?: (from: VNode, to: VNode, dir: 'push' | 'pop') => number;
}

/** A field that holds the focus while used: an input, a textarea, a select or contenteditable (look-keys). */
const isTextField = inTextField;

/**
 * The keys a focused select uses itself (stage 42 wave 3, ADR 0127): its
 * arrows, Home / End, PgUp / PgDn and Space go to the select, not to the
 * frame (which would move its own cursor), and are not prevented. Enter,
 * Tab and Esc keep the stack's rules (Esc gives the focus back).
 */
const selectOwns = (e: KeyboardEvent, nk: NavKey | null): boolean =>
  (e.target as HTMLElement | null)?.tagName === 'SELECT' &&
  nk !== null &&
  nk !== 'back' &&
  nk !== 'tab' &&
  nk !== 'backtab' &&
  e.key !== 'Enter';

/** A hold in progress: the frame kept drawn (below a push) or mounted (after a pop). */
interface Hold {
  entry: Entry;
  dir: 'push' | 'pop';
  timer: ReturnType<typeof setTimeout>;
}

export function FrameStack(props: FrameStackProps): VNode {
  const nextId = useRef(1);
  const mk = (node: VNode, overlay = false): Entry => ({
    id: nextId.current++,
    node,
    keys: { current: null },
    dirty: { current: null },
    prompting: false,
    overlay,
    layers: [],
  });
  // The frames live in a ref, changed at once by `nav` (two pushes in one
  // task both count) and drawn by a render that `commit` asks for.
  const stackRef = useRef<Entry[] | null>(null);
  stackRef.current ??= [mk(props.root)];
  const stack = stackRef.current;
  const [, setTick] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSeq = useRef(0);
  const alive = useRef(true);
  const held = useRef<Hold | null>(null);

  const commit = (next: Entry[]): void => {
    stackRef.current = next;
    if (alive.current) setTick((t) => t + 1);
  };
  const endHold = (): void => {
    if (!held.current) return;
    clearTimeout(held.current.timer);
    held.current = null;
  };
  const startHold = (entry: Entry, dir: 'push' | 'pop', ms: number): void => {
    const timer = setTimeout(() => {
      if (held.current?.entry !== entry) return;
      held.current = null;
      if (alive.current) setTick((t) => t + 1);
    }, ms);
    held.current = { entry, dir, timer };
  };

  const nav = useMemo<Nav>(
    () => ({
      push: (node, opts) => {
        const s = stackRef.current!;
        const overlay = opts?.overlay === true;
        if (!overlay) {
          setFlash(null);
          endHold();
          const from = s[pageIndex(s)]!;
          const ms = propsRef.current.hold?.(from.node, node, 'push') ?? 0;
          if (ms > 0) startHold(from, 'push', ms);
        }
        commit([...s, mk(node, overlay)]);
      },
      // Popping the root frame leaves the stack (`onRootBack`): the ESC
      // menu opened straight at a frame closes (ADR 0099).
      pop: (n = 1) => {
        const s = stackRef.current!;
        if (s.length <= 1) {
          propsRef.current.onRootBack?.();
          return;
        }
        const next = s.slice(0, Math.max(1, s.length - n));
        // The page that leaves (the topmost popped frame that is not an overlay), if any.
        const gone = s.slice(next.length).filter((e) => !e.overlay);
        const page = gone[gone.length - 1];
        if (page) {
          endHold();
          const ms = propsRef.current.hold?.(page.node, next[pageIndex(next)]!.node, 'pop') ?? 0;
          if (ms > 0) startHold(page, 'pop', ms);
        }
        commit(next);
      },
      replace: (node) => {
        const s = stackRef.current!;
        const old = s[s.length - 1]!;
        if (held.current?.entry === old) endHold();
        commit([...s.slice(0, -1), mk(node, old.overlay)]);
      },
      flash: (text, kind = 'ok') => {
        if (flashTimer.current) clearTimeout(flashTimer.current);
        setFlash({ text, kind, seq: ++flashSeq.current });
        flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
      },
      depth: () => stackRef.current!.length,
    }),
    [],
  );

  useEffect(
    () => () => {
      alive.current = false;
      if (flashTimer.current) clearTimeout(flashTimer.current);
      endHold();
    },
    [],
  );

  /** An Esc for the top frame: its layers and handler first, else pop (or `onRootBack` on the root). */
  const back = (e: KeyboardEvent): 'handled' | 'popped' | 'root' => {
    const s = stackRef.current!;
    const top = s[s.length - 1]!;
    if (runKeys(top, e, 'back')) return 'handled';
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
      const host = hostRef.current;
      // A popup inside a frame keeps its keys (a window's own frame is outside the host).
      const own = (e.target as Element | null)?.closest?.(`[${OWN_KEYS_ATTR}]`);
      if (own && own !== host && host?.contains(own)) return;
      e.stopPropagation();
      if (propsRef.current.paused) {
        if (navKey(e)) e.preventDefault();
        return;
      }
      const s = stackRef.current!;
      const top = s[s.length - 1]!;
      const nk = navKey(e);
      if (selectOwns(e, nk)) return;
      if (runKeys(top, e, nk)) {
        e.preventDefault();
        return;
      }
      if (nk === 'back') {
        e.preventDefault();
        // The Esc rule (look frames): a text field in the frame lets go of the focus first.
        if ((top.overlay || isLookNode(top.node)) && isTextField(e.target)) {
          const frame = host?.querySelector(`:scope > [data-frame="${top.id}"]`);
          const field = host?.ownerDocument.activeElement as HTMLElement | null;
          if (frame?.contains(e.target as Node) && field) {
            field.blur();
            host?.focus({ preventScroll: true });
            return;
          }
        }
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
  useEffect(
    () => () => {
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
    const s = stackRef.current!;
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
      const now = stackRef.current!;
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
    if (stackRef.current!.includes(entry)) closing.current = false;
  };
  const control = useMemo<StackControl>(
    () => ({
      requestClose: () => {
        closing.current = true;
        tries.current = 0;
        closeStep();
      },
      unsaved: () => stackRef.current!.some((e) => e.dirty.current?.() === true),
      prompting: () => stackRef.current![stackRef.current!.length - 1]!.prompting,
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

  // Overlays sit over the page's box: its rectangle (inside the overlay
  // frame) is `--wc-ov-l/t/w/h` on every overlay frame above the page, kept
  // current by a ResizeObserver (a dialog centres in it, look-overlay.css).
  const page = pageIndex(stack);
  const pageId = stack[page]!.id;
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || page === stack.length - 1) return;
    const pageEl = host.querySelector<HTMLElement>(`:scope > [data-frame="${pageId}"]`);
    const box = pageEl?.querySelector<HTMLElement>('.wc-lk-box') ?? pageEl?.querySelector<HTMLElement>('.wc-lk-win') ?? null;
    const overlays = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>(':scope > .wc-frame[data-overlay]')];
    const place = (): void => {
      const b = box?.getBoundingClientRect();
      for (const el of overlays()) {
        const f = el.getBoundingClientRect();
        if (!b || b.width <= 0 || b.height <= 0 || f.width <= 0) {
          for (const v of ['l', 't', 'w', 'h']) el.style.removeProperty(`--wc-ov-${v}`);
          continue;
        }
        // The box's part inside the overlay frame (a long page may scroll it partly out).
        const l = Math.max(0, b.left - f.left);
        const t = Math.max(0, b.top - f.top);
        const r = Math.min(f.width, b.right - f.left);
        const btm = Math.min(f.height, b.bottom - f.top);
        el.style.setProperty('--wc-ov-l', `${Math.round(l)}px`);
        el.style.setProperty('--wc-ov-t', `${Math.round(t)}px`);
        el.style.setProperty('--wc-ov-w', `${Math.round(Math.max(0, r - l))}px`);
        el.style.setProperty('--wc-ov-h', `${Math.round(Math.max(0, btm - t))}px`);
      }
    };
    place();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(place);
    ro.observe(host);
    if (box) ro.observe(box);
    return () => ro.disconnect();
  }, [topId, pageId, stack.length]);

  const hold = held.current;
  const leaving = hold && hold.dir === 'pop' && !stack.includes(hold.entry) ? hold.entry : null;
  const hasOverlay = page < stack.length - 1;
  const frame = (entry: Entry, i: number): VNode => {
    const isTop = i === stack.length - 1;
    // Drawn below the top: under an overlay, or held by a push or a pop.
    const under = !isTop && i >= page;
    const heldDir = !isTop && !under && hold?.entry === entry ? hold.dir : undefined;
    const attrs = props.frameAttrs?.(entry.node);
    return (
      <div
        key={entry.id}
        class={'wc-frame' + (attrs?.class ? ' ' + attrs.class : '')}
        style={attrs?.style}
        data-frame={entry.id}
        data-overlay={entry.overlay ? '' : undefined}
        data-under={under ? '' : undefined}
        data-held={heldDir}
        hidden={!isTop}
        inert={under || heldDir !== undefined ? true : undefined}
      >
        <FrameCtx.Provider
          value={{
            entry,
            nav,
            isTop: isTop && props.active,
            topFrame: isTop,
            // The page keeps the flash under its overlays.
            flash: i === page ? flash : null,
            promptClosed,
          }}
        >
          {props.wrap ? props.wrap(entry.node) : entry.node}
        </FrameCtx.Provider>
      </div>
    );
  };

  return (
    <div
      ref={hostRef}
      class={'wc-stack' + (hasOverlay ? ' has-overlay' : '')}
      tabIndex={-1}
      // The game input refocuses itself on document mouseup; not while the
      // chrome is up. Except inside `[data-wc-native-mouse]` (the profile
      // editor's CodeMirror content), whose drag selection ends on a
      // document mouseup; the game input ignores editable targets.
      onMouseUp={(e) => {
        if (!(e.target as Element | null)?.closest?.('[data-wc-native-mouse]')) e.stopPropagation();
      }}
    >
      {/* The popped frame while its hold lasts: after the frames (it was on top), in the same keyed list, so it stays mounted. */}
      {leaving ? [...stack.map(frame), frame(leaving, -1)] : stack.map(frame)}
      {props.children}
    </div>
  );
}
