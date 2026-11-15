// The chrome chunk (ADR 0010 "Chrome", ADR 0013): the start page (free
// DOM over the sky, ADR 0125) and the phone's ESC overlay (Profile and
// Scripts, opened from the phone's menu sheet; ADR 0112, stage 55) as
// Preact surfaces, and the cockpit's windows and popups where the menu bar
// exists, and the Statistics pane. Loaded with a dynamic
// import from src/app/shell.ts, so Preact never sits on the game's hot
// path (the output and input panes are plain TypeScript).
//
//   const chrome = await import('../chrome');
//   const start = chrome.mountStartPage(host, services, { onEnter });
//   start.hide(); …; start.show({ keep: true });   // back where it was
//   const run = start.leave();   // Enter MUME's transition, over the cockpit
//   const menu = chrome.mountEscMenu(host, services, { status, close });
//   menu.open({ target: 'scripts' });   // at a page (ADR 0099)
//   const wins = chrome.mountWindows(host, services, { … });        // ADR 0103
//   const pops = chrome.mountSettingsPopups(host, services, { … }); // ADR 0107
//   const stats = chrome.mountStatsPane(host, services, { runs, status }); // ADR 0109

import './kit/kit.css';
import './kit/look.css';
import { type ComponentChildren, type VNode, render } from 'preact';
import { useRef } from 'preact/hooks';
import { type EscActions, ProfileEntry } from './frames/profile-window';
import { ScriptsFrame } from './frames/scripts';
import { StartMain } from './frames/start-main';
import { type ChromeServices, GridCtx, ServicesCtx, useHostGrid, useSettings } from './kit/hooks';
import { device } from '../core/device';
import { isLight } from '../theme/color';
import { LookPlaceCtx, isLookFrame } from './kit/look';
import { FrameStack } from './kit/stack';
import { randomQuote } from './quotes';
import { StartSurface } from './start-surface';
import { type EnterRun, playEnter } from './enter-transition';

export { StartNotices, type StartNoticeToken, TooSmall, startNoticeTokens } from './start-surface';

export type { ChromeServices } from './kit/hooks';
export { WINDOW_BTN_ATTR, type WindowId, type WindowsHandle, type WindowsOptions, mountWindows } from './windows';
export {
  GEAR_POPUPS,
  type PopupPlace,
  type SettingsPopupKey,
  type SettingsPopupTarget,
  type SettingsPopupsHandle,
  type SettingsPopupsOptions,
  mountSettingsPopups,
} from './popups/surface';
export { type StatsPaneHandle, type StatsPaneOptions, mountStatsPane } from './stats-pane';
// The look kit's controls the phone layer's settings page uses (ADR 0136 §10): handed to it by the
// shell, so the phone chunk does not import the kit and split it out of this chunk.
export { Seg, Toggle } from './kit/look-controls';

// ------------------------------------------------------------ start page

export interface StartPageOptions {
  /** Enter MUME. */
  onEnter: () => void;
  /**
   * The sky engine mounts once this settles (the first boot passes the
   * reveal, ADR 0083: the engine's canvases then fade in on screen over
   * the first paint's sky). Default: as soon as its chunk is in.
   */
  skyHold?: Promise<unknown>;
}

export interface StartPageShowOptions {
  /**
   * Show the frame stack as it was when hidden (the log player returning
   * to History, ADR 0018) instead of a fresh one on the main frame. The
   * frames were never unmounted, so they keep their state (cursor, filter,
   * sort, scroll); the top frame gets its keys and focus back.
   */
  keep?: boolean;
}

/** Enter MUME's transition (src/chrome/enter-transition.ts). */
export interface StartLeave {
  /** Resolves true when the page has faded out (the caller hides it), false when it was cancelled. */
  readonly finished: Promise<boolean>;
}

export interface StartPageHandle {
  /** Shows the start page: on its main frame (a fresh frame stack), or as it was with `keep`. */
  show(opts?: StartPageShowOptions): void;
  hide(): void;
  /**
   * Plays Enter MUME's transition (ADR 0125): the page stays visible and
   * its sky keeps running, its frame stack lets go of the keys and the
   * focus, its pointer events stop, and its scenery fades away, the sky zooms and it fades out.
   * The caller shows the cockpit under it and hides the page once
   * `finished` resolves true. `show()` and `hide()` cancel it and put
   * every element back. Null when the page is not visible or the browser
   * has no Web Animations: the caller switches at once. A second call
   * during the transition returns the running one.
   */
  leave(): StartLeave | null;
  readonly visible: boolean;
  dispose(): void;
}

/** Mounts the start page into `host` (hidden until `show()`). */
export function mountStartPage(host: HTMLElement, services: ChromeServices, opts: StartPageOptions): StartPageHandle {
  // Once per page load (Inv §3.2).
  const quote = randomQuote();
  let visible = false;
  let epoch = 0;
  let leaving: EnterRun | null = null;
  const draw = (): void =>
    render(
      <ServicesCtx.Provider value={services}>
        <StartSurface
          visible={visible}
          leaving={!!leaving}
          epoch={epoch}
          skyHold={opts.skyHold}
          root={<StartMain onEnter={opts.onEnter} quote={quote} />}
        />
      </ServicesCtx.Provider>,
      host,
    );
  // A transition stops when the page shows or hides: its animations are
  // cancelled after the render, in the same task, so no frame shows the
  // page put back before it is hidden.
  const redraw = (): void => {
    const was = leaving;
    leaving = null;
    draw();
    was?.cancel();
  };
  return {
    show(o = {}) {
      visible = true;
      if (!o.keep) epoch++;
      redraw();
    },
    hide() {
      visible = false;
      redraw();
    },
    leave() {
      if (leaving) return leaving;
      const el = host.querySelector<HTMLElement>('.wc-start');
      if (!visible || !el || typeof el.animate !== 'function') return null;
      leaving = playEnter(el, reducedMotion());
      draw();
      return leaving;
    },
    get visible() {
      return visible;
    },
    dispose() {
      leaving?.cancel();
      leaving = null;
      render(null, host);
    },
  };
}

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------- ESC menu
// The phone's only since stage 30f (ADR 0112): where the menu bar exists the
// shell never mounts it. Since stage 55 it has no main frame, Options or
// Exit page (the phone's menu sheet, settings page and Exit confirmation
// are the phone layer's, ADR 0136 §10): it is the overlay the sheet's
// Profile and Scripts open in.

export type EscMenuOptions = EscActions;

/**
 * The page the overlay opens at (the menu sheet's rows, `#profile` and
 * `#scripts`, ADR 0099): the profile editor or Scripts. Leaving that page
 * (Esc or Back on it) closes the overlay.
 */
export type EscMenuTarget = 'profile' | 'scripts';

export interface EscMenuHandle {
  /** Opens the overlay at `target` (no-op when open). */
  open(opts: { target: EscMenuTarget }): void;
  close(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

interface MenuSurfaceProps extends EscActions {
  open: boolean;
  epoch: number;
  target: EscMenuTarget;
}

/** The overlay's root frame: the page it was opened at. */
function menuRoot(p: MenuSurfaceProps): VNode {
  return p.target === 'profile' ? <ProfileEntry {...p} /> : <ScriptsFrame />;
}

/** Share of the window the menu covers (Inv §4.1); the whole screen on a phone (ADR 0075 §3). */
const MENU_SHARE = 0.8;
const menuShare = (): number => (device().phone ? 1 : MENU_SHARE);

/**
 * Where the menu's frames are drawn (stage 42d, ADR 0127): an old-look
 * frame on the TUI grid inside the border, as before; a look frame over the
 * whole screen on the opaque game background (window.css `.wc-menu-look`),
 * in a `.wc-look` page (the kit's tokens, Paper on a light game background),
 * where the kit's Box draws the Lykta frame (place `menu`).
 */
const menuFrameAttrs = (node: VNode): { class: string } | null => (isLookFrame(node) ? { class: 'wc-menu-look' } : null);
const menuWrap = (node: VNode): VNode => (isLookFrame(node) ? <MenuLookPage>{node}</MenuLookPage> : node);

/** A look frame's page in the menu: the tokens, dark or Paper as the game background. */
function MenuLookPage(p: { children: ComponentChildren }): VNode {
  const settings = useSettings();
  return (
    <div class="wc-look wc-menu-page" data-light={isLight(settings.appearance.bg) ? '' : undefined}>
      {p.children}
    </div>
  );
}

/** The menu's frame stack: look frames in the place `menu`, full screen; old-look frames on the grid. */
export function MenuStack(p: { root: VNode; active: boolean; onRootBack: () => void }): VNode {
  return (
    <LookPlaceCtx.Provider value="menu">
      <FrameStack
        root={p.root}
        active={p.active}
        onRootBack={p.onRootBack}
        wrap={menuWrap}
        frameAttrs={menuFrameAttrs}
      />
    </LookPlaceCtx.Provider>
  );
}

function MenuSurface(p: MenuSurfaceProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const g = useHostGrid(ref);
  const share = menuShare();
  const W = Math.max(3, Math.floor(g.cols * share));
  const H = Math.max(3, Math.floor(g.rows * share));
  const left = g.left + Math.floor((g.cols - W) / 2) * g.cellW;
  const top = g.top + Math.floor((g.rows - H) / 2) * g.cellH;
  const cw = g.cellW;
  const ch = g.cellH;
  return (
    <div class="wc-overlay" ref={ref} hidden={!p.open} role="dialog" aria-modal="true" aria-label="Menu">
      {p.open && g.cols > 0 && (
        <div class="wc-overlay-box" style={{ left, top, width: W * cw, height: H * ch }}>
          <div class="wc-overlay-border" style={{ left: 0, top: 0, width: W * cw, height: ch }}>
            {'┌' + '─'.repeat(W - 2) + '┐'}
          </div>
          <div class="wc-overlay-border" style={{ left: 0, top: (H - 1) * ch, width: W * cw, height: ch }}>
            {'└' + '─'.repeat(W - 2) + '┘'}
          </div>
          <div class="wc-overlay-border" style={{ left: 0, top: ch, width: cw, height: (H - 2) * ch }}>
            {'│\n'.repeat(H - 2)}
          </div>
          <div class="wc-overlay-border" style={{ left: (W - 1) * cw, top: ch, width: cw, height: (H - 2) * ch }}>
            {'│\n'.repeat(H - 2)}
          </div>
          <div class="wc-overlay-inner" style={{ left: cw, top: ch, width: (W - 2) * cw, height: (H - 2) * ch }}>
            <GridCtx.Provider value={{ cols: W - 2, rows: H - 2, surface: 'menu' }}>
              <MenuStack key={p.epoch} root={menuRoot(p)} active={p.open} onRootBack={p.close} />
            </GridCtx.Provider>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mounts the ESC menu overlay into `host` (closed). */
export function mountEscMenu(host: HTMLElement, services: ChromeServices, opts: EscMenuOptions): EscMenuHandle {
  let open = false;
  let epoch = 0;
  let target: EscMenuTarget = 'profile';
  const draw = (): void =>
    render(
      <ServicesCtx.Provider value={services}>
        <MenuSurface {...opts} open={open} epoch={epoch} target={target} />
      </ServicesCtx.Provider>,
      host,
    );
  draw();
  return {
    open(o) {
      if (open) return;
      target = o.target;
      open = true;
      epoch++;
      draw();
    },
    close() {
      if (!open) return;
      open = false;
      draw();
    },
    get isOpen() {
      return open;
    },
    dispose() {
      render(null, host);
    },
  };
}
