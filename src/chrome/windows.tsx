// The movable windows (stage 30 S8, ADR 0103): Profile (the active
// profile's editor, live apply) and Scripts (the Scripts page), over the
// cockpit on desktop and tablet. A Preact surface in the chrome chunk; the
// shell mounts it in the cockpit element and drives it from the menu bar,
// `#profile` / `#scripts` and Esc in the game input.
//
//   const wins = chrome.mountWindows(host, services, { status, commitProfile, flushWriteBack, focusInput });
//   wins.toggle('profile');   // closed → open and focus; open → raise and focus; focused → close request
//
// - Each window holds its own FrameStack in the window kit's Lykta frame
//   (kit/window.tsx, stage 42d, ADR 0127): look frames run in the place
//   `window` and fill the body, old-look frames sit on a whole-cell grid
//   centred in it. Its stack routes keys only while the window has the
//   focus and never traps the focus. The top frames set the title and note
//   (`useWindowChrome`); the defaults are "Profile" with the profile's name
//   as the note, and "Scripts". The Profile window's root frame lives in
//   frames/profile-window.tsx.
// - Focus follows presses, as in a desktop window system: a press in a
//   window focuses and raises it; a press anywhere else (the game text,
//   the input, a pane, the bar, a popup, the other window) takes its focus
//   away, and the keys go to the game input again. A press on a bar
//   button marked `data-wc-window-btn` keeps the focus, so its toggle sees
//   it. A window without focus never takes the DOM focus (a frame that
//   focuses itself on a re-render is sent back). A popup that takes the
//   focus (it opens, ADR 0108) takes it from the windows too: the focused
//   window dims and its stack lets the keys go.
// - The close request (`requestClose`, the X, Esc on the root frame, the
//   toggle) leaves the stack as Esc would, through the frames' own Esc
//   layers and unsaved-changes prompts (kit/stack.tsx `StackControl`), and
//   closes the window at the root.
// - Geometry in whole cells on the cockpit grid (kit/window-geom.ts); a
//   window's place is stored in `settings.windows` when a move or resize
//   ends, and shown fitted to the screen.

import './kit/window.css';
import { Component, type VNode, render } from 'preact';
import { useRef } from 'preact/hooks';
import type { WindowId, WindowRect } from '../settings';
import { isLight } from '../theme/color';
import { OWN_KEYS_ATTR, WINDOW_BTN_ATTR } from '../ui/input-pane';
import type { EscActions } from './frames/profile-window';
import { ProfileRoot } from './frames/profile-window';
import { ScriptsFrame } from './frames/scripts';
import { type ChromeServices, ServicesCtx, useCells, useElementSize, useSettings } from './kit/hooks';
import type { StackControl } from './kit/stack';
import { WindowFrame, WindowStack } from './kit/window';
import { type WindowChromeStore, useWindowChromeOf, windowChromeStore } from './kit/window-chrome';
import { type CellGrid, type CellRect, type WindowBody, defaultRect, fitRect, windowBody } from './kit/window-geom';

export type { WindowId } from '../settings';

export { WINDOW_BTN_ATTR };

export interface WindowsOptions extends Pick<EscActions, 'status' | 'commitProfile' | 'flushWriteBack'> {
  /** Gives the game input its focus (a window lost its focus or closed). */
  focusInput: () => void;
  /** Called after every change of the open windows or the focus (the bar's marks). */
  onChange?: () => void;
}

export interface WindowsHandle {
  /** Closed → open and focus; open without focus → raise and focus; focused → the close request (as X). */
  toggle(id: WindowId): void;
  /** Opens (or raises) `id` and gives it the focus. */
  open(id: WindowId): void;
  /** The close request for `id` (as X): through its frames' Esc layers. */
  requestClose(id: WindowId): void;
  /**
   * Esc in the game input with no popup open: the close request for the
   * topmost window, which takes the focus (so its prompt can be answered).
   * False when no window is open.
   */
  escapeTop(): boolean;
  /** Closes every window at once; unsaved changes are discarded (leaving the cockpit). */
  closeAll(): void;
  /** True while a window holds changes that closing it would lose. */
  unsaved(): boolean;
  /** Open windows, bottom to top. */
  readonly openIds: readonly WindowId[];
  readonly focused: WindowId | null;
  dispose(): void;
}

interface WinState {
  id: WindowId;
  /** Remounts the window's frames on every open. */
  epoch: number;
  /** Cells right and down of the default place (the second window opened beside the first). */
  offset: number;
  /** The rectangle while a drag runs (not yet stored). */
  live: CellRect | null;
  /** The title and note its frames set (`useWindowChrome`); new on every open. */
  chrome: WindowChromeStore;
}

interface SurfaceProps {
  opts: WindowsOptions;
  wins: readonly WinState[];
  focused: WindowId | null;
  control: (id: WindowId, c: StackControl | null) => void;
  onRect: (id: WindowId, r: CellRect, done: boolean) => void;
  requestClose: (id: WindowId) => void;
  close: (id: WindowId) => void;
}

function WindowsSurface(p: SurfaceProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const c = useCells();
  const settings = useSettings();
  const grid: CellGrid = {
    cols: c.w > 0 ? Math.floor(size.w / c.w + 1e-6) : 0,
    rows: c.h > 0 ? Math.floor(size.h / c.h + 1e-6) : 0,
  };
  return (
    <div class="wc-windows" ref={ref} data-light={isLight(settings.appearance.bg) ? '' : undefined}>
      {grid.cols > 0 &&
        grid.rows > 0 &&
        p.wins.map((w, i) => {
          const stored: WindowRect | null = settings.windows[w.id];
          const rect = w.live ?? (stored ? fitRect(stored, grid) : defaultRect(grid, w.offset));
          return (
            <Win
              key={w.id}
              w={w}
              profile={settings.profile}
              rect={rect}
              grid={grid}
              cellW={c.w}
              cellH={c.h}
              z={i + 1}
              focused={p.focused === w.id}
              surface={p}
            />
          );
        })}
    </div>
  );
}

/** A window's own title and note, until one of its frames sets them (`useWindowChrome`). */
export function windowDefaults(id: WindowId, profile: string): { title: string; note?: string } {
  return id === 'profile' ? { title: 'Profile', note: profile } : { title: 'Scripts' };
}

interface WinProps {
  w: WinState;
  profile: string;
  rect: CellRect;
  grid: CellGrid;
  cellW: number;
  cellH: number;
  z: number;
  focused: boolean;
  surface: SurfaceProps;
}

/** One window: the Lykta frame, its title and note (its frames' `useWindowChrome`, else the defaults), its stack. */
function Win(p: WinProps): VNode {
  const { w, rect, surface: s } = p;
  const set = useWindowChromeOf(w.chrome);
  const def = windowDefaults(w.id, p.profile);
  const title = set?.title ?? def.title;
  const note = set?.note ?? def.note;
  return (
    <WindowFrame
      id={w.id}
      title={title}
      {...(note ? { titleNote: note } : {})}
      rect={rect}
      grid={p.grid}
      cellW={p.cellW}
      cellH={p.cellH}
      z={p.z}
      focused={p.focused}
      onRect={(r, done) => s.onRect(w.id, r, done)}
      onClose={() => s.requestClose(w.id)}
    >
      <WinStack
        id={w.id}
        epoch={w.epoch}
        focused={p.focused}
        body={windowBody(rect, p.cellW, p.cellH)}
        cellW={p.cellW}
        cellH={p.cellH}
        chrome={w.chrome}
        opts={s.opts}
        control={s.control}
        close={s.close}
      />
    </WindowFrame>
  );
}

interface WinStackProps {
  id: WindowId;
  epoch: number;
  focused: boolean;
  body: WindowBody;
  cellW: number;
  cellH: number;
  chrome: WindowChromeStore;
  opts: WindowsOptions;
  control: (id: WindowId, c: StackControl | null) => void;
  close: (id: WindowId) => void;
}

const sameBody = (a: WindowBody, b: WindowBody): boolean =>
  a.w === b.w && a.h === b.h && a.cols === b.cols && a.rows === b.rows && a.left === b.left && a.top === b.top;

/**
 * A window's frame stack in its body (kit/window.tsx `WindowStack`).
 * Rendered again only when its focus, size or open changes, not on every
 * move of a window, change of its title or change of the other one: frames
 * re-render on every stack render (the frame context), and some focus
 * themselves when they do.
 */
class WinStack extends Component<WinStackProps> {
  override shouldComponentUpdate(n: WinStackProps): boolean {
    const p = this.props;
    return (
      p.id !== n.id ||
      p.epoch !== n.epoch ||
      p.focused !== n.focused ||
      p.chrome !== n.chrome ||
      p.cellW !== n.cellW ||
      p.cellH !== n.cellH ||
      !sameBody(p.body, n.body)
    );
  }

  override render(): VNode {
    const p = this.props;
    return (
      <WindowStack
        key={p.epoch}
        body={p.body}
        cellW={p.cellW}
        cellH={p.cellH}
        root={p.id === 'profile' ? <ProfileRoot opts={p.opts} close={() => p.close('profile')} /> : <ScriptsFrame />}
        active={p.focused}
        onRootBack={() => p.close(p.id)}
        control={(ctl) => p.control(p.id, ctl)}
        chrome={p.chrome.sink}
      />
    );
  }
}

/** Mounts the windows layer into `host` (none open). */
export function mountWindows(host: HTMLElement, services: ChromeServices, opts: WindowsOptions): WindowsHandle {
  const doc = host.ownerDocument;
  /** Open windows, bottom to top. */
  let wins: WinState[] = [];
  let focused: WindowId | null = null;
  let epoch = 0;
  const controls = new Map<WindowId, StackControl>();

  const find = (id: WindowId): WinState | undefined => wins.find((w) => w.id === id);
  const winEl = (t: EventTarget | null): HTMLElement | null =>
    (t as Element | null)?.closest?.<HTMLElement>('.wc-win[data-win]') ?? null;
  const inWindows = (n: Node | null): boolean => !!n && host.contains(n);

  const draw = (): void => {
    render(
      <ServicesCtx.Provider value={services}>
        <WindowsSurface
          opts={opts}
          wins={wins}
          focused={focused}
          control={(id, c) => {
            if (c) controls.set(id, c);
            else controls.delete(id);
          }}
          onRect={onRect}
          requestClose={requestClose}
          close={close}
        />
      </ServicesCtx.Provider>,
      host,
    );
    opts.onChange?.();
  };

  const onRect = (id: WindowId, r: CellRect, done: boolean): void => {
    const w = find(id);
    if (!w) return;
    w.live = done ? null : r;
    if (done) services.settings.update({ windows: { [id]: { ...r } } });
    draw();
  };

  const raise = (id: WindowId): void => {
    const w = find(id);
    if (!w) return;
    wins = [...wins.filter((x) => x !== w), w];
  };

  const focus = (id: WindowId): void => {
    if (!find(id)) return;
    const top = wins[wins.length - 1]?.id === id;
    if (focused === id && top) return;
    raise(id);
    focused = id;
    draw();
  };

  const unfocus = (): void => {
    if (focused === null) return;
    focused = null;
    const hadDom = inWindows(doc.activeElement);
    draw();
    if (hadDom || doc.activeElement === doc.body) opts.focusInput();
  };

  const open = (id: WindowId): void => {
    if (!find(id)) {
      const stored = services.settings.get().windows[id];
      // The second window opened at the default place stands a cell beside the first.
      const offset = !stored && wins.length > 0 && !services.settings.get().windows[wins[0]!.id] ? 1 : 0;
      wins = [...wins, { id, epoch: ++epoch, offset, live: null, chrome: windowChromeStore() }];
    }
    focus(id);
    draw();
  };

  const close = (id: WindowId): void => {
    if (!find(id)) return;
    const hadFocus = focused === id;
    wins = wins.filter((w) => w.id !== id);
    controls.delete(id);
    if (hadFocus) focused = null;
    draw();
    if (hadFocus) opts.focusInput();
  };

  const requestClose = (id: WindowId): void => {
    const c = controls.get(id);
    if (!c) return close(id);
    c.requestClose();
  };

  // Focus follows presses (see the header). Capture phase, ahead of
  // everything below (the popups take their own focus on mousedown).
  const onPointerDown = (e: PointerEvent): void => {
    const el = winEl(e.target);
    if (el && host.contains(el)) {
      focus(el.dataset.win as WindowId);
      return;
    }
    if ((e.target as Element | null)?.closest?.(`[${WINDOW_BTN_ATTR}]`)) return;
    unfocus();
  };
  doc.addEventListener('pointerdown', onPointerDown, true);

  // A window without focus never takes the DOM focus.
  const onFocusIn = (e: FocusEvent): void => {
    const el = winEl(e.target);
    if (!el || el.dataset.win === focused) return;
    // Back where it was: outside the windows, or in the focused one.
    const back = e.relatedTarget as HTMLElement | null;
    const ok = !!back && back.isConnected && (!inWindows(back) || winEl(back)?.dataset.win === focused);
    if (ok) back!.focus({ preventScroll: true });
    else if (focused === null) opts.focusInput();
  };
  host.addEventListener('focusin', onFocusIn);

  // A popup taking the focus (ADR 0108) takes it from the windows; the
  // DOM focus stays in the popup.
  const onDocFocusIn = (e: FocusEvent): void => {
    if (focused === null) return;
    const t = e.target as Element | null;
    if (!t || inWindows(t) || !t.closest?.(`[${OWN_KEYS_ATTR}]`)) return;
    focused = null;
    draw();
  };
  doc.addEventListener('focusin', onDocFocusIn);

  draw();
  return {
    toggle(id) {
      if (!find(id)) open(id);
      else if (focused !== id) focus(id);
      else requestClose(id);
    },
    open,
    requestClose,
    escapeTop() {
      const top = wins[wins.length - 1];
      if (!top) return false;
      focus(top.id);
      requestClose(top.id);
      return true;
    },
    closeAll() {
      if (wins.length === 0) return;
      const hadFocus = focused !== null;
      wins = [];
      focused = null;
      controls.clear();
      draw();
      if (hadFocus) opts.focusInput();
    },
    unsaved() {
      return wins.some((w) => controls.get(w.id)?.unsaved() === true);
    },
    get openIds() {
      return wins.map((w) => w.id);
    },
    get focused() {
      return focused;
    },
    dispose() {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      host.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusin', onDocFocusIn);
      render(null, host);
    },
  };
}

