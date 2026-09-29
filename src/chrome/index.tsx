// The chrome chunk (ADR 0010 "Chrome", ADR 0013): the start page and the
// ESC menu as Preact surfaces on the cell grid. Loaded with a dynamic
// import from src/app/shell.ts, so Preact never sits on the game's hot
// path (the output and input panes are plain TypeScript).
//
//   const chrome = await import('../chrome');
//   const start = chrome.mountStartPage(host, services, { onEnter });
//   start.hide(); …; start.show({ keep: true });   // back where it was
//   const menu = chrome.mountEscMenu(host, services, { status, close, reconnect, exit });
//   menu.open({ preselect: 'reconnect' });

import './kit/kit.css';
import { type VNode, render } from 'preact';
import { useRef } from 'preact/hooks';
import { noticeIndicators } from '../app/notices';
import { isLive } from '../app/status';
import { CLIENT_VERSION } from '../core/build-info';
import { EscMain, type EscActions } from './frames/esc-main';
import { StartMain } from './frames/start-main';
import { type ChromeServices, GridCtx, ServicesCtx, useHostGrid, useNotices } from './kit/hooks';
import { MIN_COLS, MIN_ROWS, centreLeft, tooSmall, truncate } from './kit/nav';
import { FrameStack } from './kit/stack';
import { type Quote, randomQuote } from './quotes';

export type { ChromeServices } from './kit/hooks';

// ------------------------------------------------------------ start page

export interface StartPageOptions {
  /** Enter MUME. */
  onEnter: () => void;
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

export interface StartPageHandle {
  /** Shows the start page: on its main frame (a fresh frame stack), or as it was with `keep`. */
  show(opts?: StartPageShowOptions): void;
  hide(): void;
  readonly visible: boolean;
  dispose(): void;
}

interface StartSurfaceProps extends StartPageOptions {
  visible: boolean;
  epoch: number;
  quote: Quote;
}

function StartSurface(p: StartSurfaceProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const g = useHostGrid(ref);
  const small = g.cols > 0 && tooSmall(g.cols, g.rows);
  return (
    <div class="wc-chrome wc-start" ref={ref} hidden={!p.visible}>
      {g.cols > 0 && (
        <GridCtx.Provider value={{ cols: g.cols, rows: g.rows, surface: 'start' }}>
          <div
            class="wc-screen"
            hidden={small}
            style={{ left: g.left, top: g.top, width: g.cols * g.cellW, height: g.rows * g.cellH }}
          >
            <FrameStack
              key={p.epoch}
              root={<StartMain onEnter={p.onEnter} quote={p.quote} />}
              active={p.visible}
              paused={small}
            />
            <StartNotices cols={g.cols} />
          </div>
          {small && <TooSmall cols={g.cols} rows={g.rows} />}
        </GridCtx.Provider>
      )}
    </div>
  );
}

/**
 * The client notices on the start surface (ADR 0025, amended): right-aligned
 * on the top row, which every start frame leaves blank, so they show on the
 * main menu and on every sub-frame. `Update 0.1.3 available: reload`
 * (C_YELLOW) reloads on click (no game is connected here); superseded
 * storage adds `Storage: not saved` (C_ERR).
 */
export function StartNotices(p: { cols: number }): VNode | null {
  const items = startNoticeTokens(useNotices());
  if (items.length === 0) return null;
  const full = items.map((t) => t.text).join('  ');
  const text = truncate(full, Math.max(0, p.cols - 2));
  return (
    <div class="wc-line wc-start-notices" role="status">
      {text !== full ? (
        <span class={items[0]!.cls} title={items[0]!.title} onClick={items[0]!.onClick}>
          {text}
        </span>
      ) : (
        items.map((t, i) => (
          <>
            {i > 0 && '  '}
            <span class={t.cls + (t.onClick ? ' wc-start-notice-btn' : '')} title={t.title} onClick={t.onClick}>
              {t.text}
            </span>
          </>
        ))
      )}
    </div>
  );
}

export interface StartNoticeToken {
  text: string;
  title: string;
  cls: string;
  onClick?: () => void;
}

/** The start surface's notice tokens for `s`, update first. */
export function startNoticeTokens(s: Parameters<typeof noticeIndicators>[0]): StartNoticeToken[] {
  return noticeIndicators(s, CLIENT_VERSION).map((n) =>
    n.key === 'update'
      ? {
          text: `Update ${s.update!.version} available: reload`,
          title: `WebCockpit ${s.update!.version} is available (this tab runs ${CLIENT_VERSION}). Click to reload.`,
          cls: 'wc-c-yellow',
          onClick: () => globalThis.location?.reload(),
        }
      : { text: n.text, title: n.title, cls: 'wc-c-err' },
  );
}

/** The minimum-size notice (Inv §3.1). */
export function TooSmall(p: { cols: number; rows: number }): VNode {
  const lines = [
    { text: 'Window too small', cls: 'wc-c-yellow' },
    { text: `Needs ${MIN_COLS}×${MIN_ROWS} cells, has ${p.cols}×${p.rows}.`, cls: 'wc-c-body' },
    { text: 'Enlarge the window, zoom out, or open with ?safe.', cls: 'wc-c-hint' },
  ];
  const top = Math.max(0, Math.floor((p.rows - lines.length) / 2));
  return (
    <div class="wc-start-too-small">
      {Array.from({ length: top }, () => (
        <div class="wc-line" />
      ))}
      {lines.map((l) => (
        <div class="wc-line" style={{ paddingLeft: `calc(var(--cell-w) * ${centreLeft(p.cols, l.text.length)})` }}>
          <span class={l.cls}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Mounts the start page into `host` (hidden until `show()`). */
export function mountStartPage(host: HTMLElement, services: ChromeServices, opts: StartPageOptions): StartPageHandle {
  const quote = randomQuote(); // once per page load (Inv §3.2)
  let visible = false;
  let epoch = 0;
  const draw = (): void =>
    render(
      <ServicesCtx.Provider value={services}>
        <StartSurface visible={visible} epoch={epoch} quote={quote} onEnter={opts.onEnter} />
      </ServicesCtx.Provider>,
      host,
    );
  return {
    show(o = {}) {
      visible = true;
      if (!o.keep) epoch++;
      draw();
    },
    hide() {
      visible = false;
      draw();
    },
    get visible() {
      return visible;
    },
    dispose() {
      render(null, host);
    },
  };
}

// --------------------------------------------------------------- ESC menu

export type EscMenuOptions = EscActions;

export interface EscMenuHandle {
  /** Opens the menu (no-op when open). `preselect` defaults by connection state. */
  open(opts?: { preselect?: 'continue' | 'reconnect' }): void;
  close(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

interface MenuSurfaceProps extends EscActions {
  open: boolean;
  epoch: number;
  preselect: 'continue' | 'reconnect';
}

/** Share of the window the menu covers (Inv §4.1). */
const MENU_SHARE = 0.8;

function MenuSurface(p: MenuSurfaceProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const g = useHostGrid(ref);
  const W = Math.max(3, Math.floor(g.cols * MENU_SHARE));
  const H = Math.max(3, Math.floor(g.rows * MENU_SHARE));
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
              <FrameStack
                key={p.epoch}
                root={<EscMain {...p} />}
                active={p.open}
                onRootBack={p.close}
              />
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
  const draw = (): void =>
    render(
      <ServicesCtx.Provider value={services}>
        <MenuSurface {...opts} open={open} epoch={epoch} preselect={preselect} />
      </ServicesCtx.Provider>,
      host,
    );
  draw();
  return {
    open(o = {}) {
      if (open) return;
      const live = isLive(opts.status.get());
      preselect = o.preselect ?? (live ? 'continue' : 'reconnect');
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
