// The chrome chunk (ADR 0010 "Chrome", ADR 0013): the start page (free
// DOM over the sky with old-look frames on the cell grid, ADR 0125) and the
// phone's ESC menu (ADR 0112) as Preact surfaces, and the
// cockpit's windows, popups and Statistics pane where the menu bar exists. Loaded with a dynamic
// import from src/app/shell.ts, so Preact never sits on the game's hot
// path (the output and input panes are plain TypeScript).
//
//   const chrome = await import('../chrome');
//   const start = chrome.mountStartPage(host, services, { onEnter });
//   start.hide(); …; start.show({ keep: true });   // back where it was
//   const run = start.leave();   // Enter MUME's transition, over the cockpit
//   const menu = chrome.mountEscMenu(host, services, { status, close, reconnect, exit });
//   menu.open({ preselect: 'reconnect' });
//   menu.open({ target: 'scripts' });   // straight at a frame (ADR 0099)
//   const wins = chrome.mountWindows(host, services, { … });        // ADR 0103
//   const pops = chrome.mountSettingsPopups(host, services, { … }); // ADR 0107
//   const stats = chrome.mountStatsPane(host, services, { runs, status }); // ADR 0109

import './kit/kit.css';
import './kit/look.css';
import { type VNode, render } from 'preact';
import { useRef } from 'preact/hooks';
import { isLive } from '../app/status';
import { EscMain, type EscActions, ExitConfirm, ProfileEntry } from './frames/esc-main';
import { OptionsHub, PanesFrame } from './frames/options';
import { ScriptsFrame } from './frames/scripts';
import { StartMain } from './frames/start-main';
import { type ChromeServices, GridCtx, ServicesCtx, useHostGrid } from './kit/hooks';
import { device } from '../core/device';
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
// shell never mounts it.

export type EscMenuOptions = EscActions;

/**
 * A frame the menu can open at instead of its main frame (the menu bar
 * and `#profile` …, ADR 0099): the profile editor, Options → Scripts,
 * Options, Options → Panes → Appearance, Exit session. Leaving that frame
 * (Esc or Back on it) closes the menu. The phone's way to them since the
 * bar has windows (ADR 0103) and the Settings popup (ADR 0107).
 */
export type EscMenuTarget = 'profile' | 'scripts' | 'settings' | 'panes' | 'exit';

export interface EscMenuHandle {
  /**
   * Opens the menu (no-op when open). `preselect` defaults by connection
   * state; `target` opens it at that frame.
   */
  open(opts?: { preselect?: 'continue' | 'reconnect'; target?: EscMenuTarget }): void;
  close(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

interface MenuSurfaceProps extends EscActions {
  open: boolean;
  epoch: number;
  preselect: 'continue' | 'reconnect';
  target: EscMenuTarget | null;
}

/** The menu's root frame: the main frame, or the frame it was opened at. */
function menuRoot(p: MenuSurfaceProps): VNode {
  switch (p.target) {
    case 'profile':
      return <ProfileEntry {...p} />;
    case 'scripts':
      return <ScriptsFrame />;
    case 'settings':
      return <OptionsHub />;
    case 'panes':
      return <PanesFrame />;
    case 'exit':
      return <ExitConfirm exit={p.exit} runs={p.runs} />;
    default:
      return <EscMain {...p} />;
  }
}

/** Share of the window the menu covers (Inv §4.1); the whole screen on a phone (ADR 0075 §3). */
const MENU_SHARE = 0.8;
const menuShare = (): number => (device().phone ? 1 : MENU_SHARE);

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
              <FrameStack key={p.epoch} root={menuRoot(p)} active={p.open} onRootBack={p.close} />
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
  let preselect: 'continue' | 'reconnect' = 'continue';
  let target: EscMenuTarget | null = null;
  const draw = (): void =>
    render(
      <ServicesCtx.Provider value={services}>
        <MenuSurface {...opts} open={open} epoch={epoch} preselect={preselect} target={target} />
      </ServicesCtx.Provider>,
      host,
    );
  draw();
  return {
    open(o = {}) {
      if (open) return;
      const live = isLive(opts.status.get());
      preselect = o.preselect ?? (live ? 'continue' : 'reconnect');
      target = o.target ?? null;
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
