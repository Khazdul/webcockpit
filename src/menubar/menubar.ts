// The menu bar (stage 30 S1, ADR 0099): the right end of the input row on
// desktop and tablet, one cell high, in place of the clock strip.
//
//   [Disconnected  Reconnect Enter]  CLOCK (dot) | PROFILE SCRIPTS PANES SETTINGS | FULLSCREEN EXIT
//
// - Plain DOM in the cockpit chunk (no Preact), so it paints with the
//   cockpit and a click never waits for a chunk.
// - Ghost look (mockup 30a-1): thin grey stroke icons on the terminal
//   background, lit on hover, Exit red on hover. On a light terminal the
//   greys and the hover tint flip (`data-light`).
// - Whole cells: the clock is the 8-cell strip (gutter, 5-cell time, a
//   2-cell sun/moon), the link dot and each separator one cell, each icon
//   2.5 cells; the bar's width is rounded up to whole cells, so the input
//   field keeps the cell grid. Buttons never take the input's focus on a
//   mouse down.
// - Tooltips (src/menubar/tooltip.ts), live: the clock's countdown, the
//   link (`Link: 1.8s · lagging`), `Profile: <name>`, and the rest by name.
// - Link dot (src/menubar/status-text.ts): hidden while the link is fine;
//   yellow while lagging; red when broken or unknown. With the dot hidden
//   the capture state goes in the clock's tooltip.
// - Popups (src/menubar/popup.ts): Panes and Exit, one at a time, above
//   the bar and above floating panes. A click on the icon toggles; Esc
//   closes (in the popup, or in the input once the output is at the
//   bottom); the Panes X closes. The Exit popup takes the keys when it
//   opens; the Panes popup only after a click in it.
// - Adopted popups (ADR 0107): the chrome chunk draws the Settings popup
//   (and the pane gear popups) and hands each one to the bar when it opens
//   (`adopt`), so the one-popup rule, Esc in the input, the ESC menu and
//   hiding the cockpit close it like the bar's own. It tells the bar when
//   it closed itself (`release`). The Settings icon is marked while its
//   popup is open; a click on it is the chrome popup's toggle
//   (`actions.settings`).
// - Profile and Scripts toggle their windows (ADR 0103; the shell's
//   src/chrome/windows.tsx); their icons are marked while the window is
//   open, and a press on them keeps a focused window's focus, so the
//   toggle closes it.
// - Fullscreen (ADR 0103): in the cockpit's fullscreen the bar asks for the
//   Esc key (Keyboard Lock, Chromium), so Esc can open the Exit popup
//   instead of leaving fullscreen (the App's Esc order).
// - Fullscreen where the browser has page fullscreen; removed when a
//   request is refused.
// - The Disconnected notice (ADR 0100) left of the clock: after a live
//   connection dropped, until the next one starts. Its button reconnects;
//   Enter in the input still does too (spec §2.2).

import './menubar.css';
import type { AppStatusState, AppStatusView } from '../app/status';
import type { GameState } from '../gmcp/state';
import type { LiveRuns } from '../runs/live';
import type { SettingsStore } from '../settings';
import {
  canFullscreen,
  isFullscreen,
  lockEscape,
  onFullscreenChange,
  onFullscreenRefused,
  toggleFullscreen,
  unlockEscape,
} from '../core/fullscreen';
import { WINDOW_BTN_ATTR } from '../ui/input-pane';
import { isLight } from '../theme/color';
import { ClockStrip } from '../ui/clock-strip';
import { ExitPopup } from './exit-popup';
import { ICON, strokeIcon } from './icons';
import { PanesPopup, type ScriptPaneSource } from './panes-popup';
import { placePopup } from './popup';
import { type LinkInput, NO_RTT_MS, captureNote, clockTip, linkDot, linkTip, showDisconnected } from './status-text';
import { Tooltip } from './tooltip';

export type PopupId = 'panes' | 'exit';

/**
 * A popup the bar holds: one of its own, or one the chrome drew and handed
 * over (ADR 0107): `settings`, or a pane's gear popup `pane:<id>`.
 */
export type BarPopupKey = PopupId | 'settings' | `pane:${string}`;

/** A popup drawn outside the bar (the chrome's Settings and gear popups, ADR 0107). */
export interface AdoptedPopup {
  key: Exclude<BarPopupKey, PopupId>;
  /** Its panel: focus in it counts as focus in the popup. */
  el: HTMLElement;
  /** Closes it without telling the bar back (the bar already let go). */
  close(): void;
}

/** What the bar's buttons do outside the bar (the shell, the app). */
export interface MenuBarActions {
  /** The Profile window (ADR 0103; the ESC menu's profile editor on a page without windows). */
  profile(): void;
  /** The Scripts window (ADR 0103). */
  scripts(): void;
  /** The Settings popup's toggle (ADR 0107; the ESC menu at Options without it). */
  settings(): void;
  /** Exit to the start page (the shell's exitSession). */
  exit(): void;
  /** Reconnect (the Disconnected notice's button). */
  reconnect(): void;
  /** True while a window holds unsaved changes: the Exit popup warns (ADR 0103). */
  unsaved?(): boolean;
}

export interface MenuBarOptions {
  /** The input row's clock element; the bar takes its place in the row. */
  clockEl: HTMLElement;
  /** Where the popups and the tooltip go (the cockpit element). */
  layer: HTMLElement;
  game: GameState;
  settings: SettingsStore;
  status: AppStatusView;
  runs?: LiveRuns | undefined;
  scriptPanes: ScriptPaneSource;
  /** Gives the game input its focus back. */
  focusInput: () => void;
  actions: MenuBarActions;
  /** Wall clock (tests). */
  now?: () => number;
  /** Told the bar's width in whole cells when it is built and whenever it changes (the cockpit's layout, ADR 0102). */
  onCells?: (cells: number) => void;
}

/** Widths in cells (see the header). */
export const CLOCK_CELLS = 8;
export const DOT_CELLS = 1;
export const SEP_CELLS = 1;
export const BUTTON_CELLS = 2.5;

/** The bar's width in whole cells, with or without the fullscreen button. */
export function barCells(fullscreen: boolean): number {
  const buttons = 4 + (fullscreen ? 2 : 1);
  return Math.ceil(CLOCK_CELLS + DOT_CELLS + 2 * SEP_CELLS + buttons * BUTTON_CELLS);
}

interface ButtonSpec {
  id: string;
  label: string;
  icon: string;
  tip: () => string;
  click: () => void;
  popup?: BarPopupKey;
  /** A window's toggle: a press keeps the window's focus (ADR 0103). */
  window?: boolean;
}

interface OpenPopup {
  id: BarPopupKey;
  el: HTMLElement;
  dispose(): void;
  /** Drawn and placed by the bar (Panes, Exit); false for an adopted one. */
  own: boolean;
}

export class MenuBar {
  /** The bar's row element: the Disconnected notice and the bar. */
  readonly el: HTMLSpanElement;
  readonly bar: HTMLSpanElement;
  readonly clock: ClockStrip;
  readonly tooltip: Tooltip;
  readonly notice: HTMLSpanElement;
  private readonly o: MenuBarOptions;
  private readonly doc: Document;
  private readonly dotWrap: HTMLSpanElement;
  private readonly dot: HTMLSpanElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private fsPath: SVGPathElement | null = null;
  private pop: OpenPopup | null = null;
  /** The current or last connection is live (not a replay). */
  private live = false;
  private prevConn: AppStatusState['conn'] = 'idle';
  private rttOverdue = false;
  private rttTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly offs: Array<() => void> = [];
  /** The cockpit is the visible view (the shell's `setShown`). */
  private shown = true;
  /** Esc is asked for (Keyboard Lock) while shown in fullscreen. */
  private keyLocked = false;

  constructor(o: MenuBarOptions) {
    this.o = o;
    const doc = (this.doc = o.clockEl.ownerDocument);
    this.el = doc.createElement('span');
    this.el.className = 'wc-menubar';
    this.bar = doc.createElement('span');
    this.bar.className = 'wc-mb-bar';
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', 'Menu bar');
    this.tooltip = new Tooltip(o.layer);

    // Disconnected notice (ADR 0100).
    this.notice = doc.createElement('span');
    this.notice.className = 'wc-mb-disc';
    this.notice.hidden = true;
    const nt = doc.createElement('span');
    nt.className = 'wc-mb-disc-t';
    nt.textContent = 'Disconnected';
    const rc = doc.createElement('button');
    rc.type = 'button';
    rc.className = 'wc-mb-rc';
    rc.textContent = 'Reconnect ';
    const k = doc.createElement('span');
    k.className = 'wc-mb-k';
    k.textContent = 'Enter';
    rc.append(k);
    rc.addEventListener('mousedown', (e) => e.preventDefault());
    rc.addEventListener('click', (e) => {
      e.stopPropagation();
      o.actions.reconnect();
    });
    this.notice.append(nt, rc);

    // Clock and link dot.
    o.clockEl.replaceWith(this.el);
    o.clockEl.classList.add('wc-mb-clock');
    this.clock = new ClockStrip(o.clockEl, {
      game: o.game,
      settings: o.settings,
      svg: true,
      onUpdate: () => this.refreshTip(o.clockEl),
      ...(o.now ? { now: o.now } : {}),
    });
    this.tooltip.attach(o.clockEl, () => this.clockText());
    this.dotWrap = doc.createElement('span');
    this.dotWrap.className = 'wc-mb-dotw';
    this.dot = doc.createElement('span');
    this.dot.className = 'wc-mb-dot';
    this.dot.hidden = true;
    this.dotWrap.append(this.dot);
    this.tooltip.attach(this.dotWrap, () => linkTip(this.linkInput()), () => !this.dot.hidden);

    const specs: Array<ButtonSpec | 'sep'> = [
      'sep',
      { id: 'profile', label: 'Profile', icon: ICON.profile, tip: () => `Profile: ${o.settings.get().profile}`, click: () => this.run(o.actions.profile), window: true },
      { id: 'scripts', label: 'Scripts', icon: ICON.scripts, tip: () => 'Scripts', click: () => this.run(o.actions.scripts), window: true },
      { id: 'panes', label: 'Panes', icon: ICON.panes, tip: () => 'Panes', click: () => this.toggle('panes'), popup: 'panes' },
      // The chrome's popup (ADR 0107): its toggle closes the bar's own popup when it opens.
      { id: 'settings', label: 'Settings', icon: ICON.settings, tip: () => 'Settings', click: () => o.actions.settings(), popup: 'settings' },
      'sep',
    ];
    if (canFullscreen(doc)) {
      specs.push({
        id: 'fullscreen',
        label: 'Fullscreen',
        icon: ICON.fullscreen,
        tip: () => (isFullscreen(doc) ? 'Exit fullscreen' : 'Fullscreen'),
        click: () => this.toggleFullscreen(),
      });
    }
    specs.push({ id: 'exit', label: 'Exit', icon: ICON.exit, tip: () => 'Exit to main menu', click: () => this.toggle('exit'), popup: 'exit' });

    this.bar.append(o.clockEl, this.dotWrap);
    for (const s of specs) {
      if (s === 'sep') {
        const sep = doc.createElement('span');
        sep.className = 'wc-mb-sep';
        sep.setAttribute('aria-hidden', 'true');
        this.bar.append(sep);
        continue;
      }
      this.bar.append(this.button(s));
    }
    this.el.append(this.notice, this.bar);
    this.fsPath = this.buttons.get('fullscreen')?.querySelector('path') ?? null;
    this.sizeBar();

    const paintInk = (): void => void this.el.toggleAttribute('data-light', isLight(o.settings.get().appearance.bg));
    paintInk();
    this.offs.push(
      o.status.subscribe((s) => this.onStatus(s)),
      o.settings.subscribe(() => {
        paintInk();
        this.tooltip.refresh();
      }),
      onFullscreenChange(() => this.onFullscreen(), doc),
      onFullscreenRefused(() => this.dropFullscreen()),
    );
    this.onStatus(o.status.get());
    const win = doc.defaultView;
    if (win) {
      win.addEventListener('resize', this.place);
      this.offs.push(() => win.removeEventListener('resize', this.place));
    }
  }

  // ---------------------------------------------------------------- popups

  /** The open popup, or null. */
  get openPopup(): BarPopupKey | null {
    return this.pop?.id ?? null;
  }

  /** The open popup's element (tests). */
  get popupEl(): HTMLElement | null {
    return this.pop?.el ?? null;
  }

  /** Opens popup `id`, or closes it when it is the open one. */
  toggle(id: PopupId): void {
    if (this.pop?.id === id) this.closePopup();
    else this.open(id);
  }

  /** Opens the bar's own popup `id` (closing any other). */
  open(id: PopupId): void {
    if (this.pop?.id === id) return;
    this.closePopup();
    this.tooltip.hide();
    const o = this.o;
    const close = (refocus: boolean): void => void this.closePopup(refocus);
    const p =
      id === 'panes'
        ? new PanesPopup({ doc: this.doc, settings: o.settings, scriptPanes: o.scriptPanes, close })
        : new ExitPopup({
            doc: this.doc,
            runs: o.runs,
            exit: () => o.actions.exit(),
            close,
            warning: o.actions.unsaved?.() ? 'Unsaved changes in an open window will be lost.' : null,
          });
    this.pop = { id, el: p.el, dispose: () => p.dispose(), own: true };
    o.layer.append(p.el);
    this.buttons.get(id)?.classList.add('is-open');
    this.place();
    // A confirmation takes the keys at once; the Panes popup after a click in it.
    if (id === 'exit') p.el.focus({ preventScroll: true });
  }

  /**
   * A popup drawn outside the bar opened (ADR 0107): the open one closes,
   * and this one is held until it closes itself (`release`) or the bar
   * closes it (another popup, Esc in the input, the ESC menu, hiding).
   */
  adopt(p: AdoptedPopup): void {
    if (this.pop?.id === p.key && this.pop.el === p.el) return;
    this.closePopup();
    this.tooltip.hide();
    this.pop = { id: p.key, el: p.el, dispose: () => p.close(), own: false };
    this.buttons.get(p.key)?.classList.add('is-open');
  }

  /** The adopted popup `key` closed itself (its X, Esc in it, its toggle). */
  release(key: BarPopupKey): void {
    const p = this.pop;
    if (!p || p.own || p.id !== key) return;
    this.pop = null;
    this.buttons.get(key)?.classList.remove('is-open');
  }

  /** A bar button (`settings` …), for anchoring a popup to it. */
  anchor(id: string): HTMLButtonElement | null {
    return this.buttons.get(id) ?? null;
  }

  /**
   * Closes the open popup; true when there was one. The input gets its
   * focus back with `refocus`, or when the focus was in the popup.
   */
  closePopup(refocus = false): boolean {
    const p = this.pop;
    if (!p) return false;
    const hadFocus = p.el.contains(this.doc.activeElement);
    this.pop = null;
    this.buttons.get(p.id)?.classList.remove('is-open');
    p.dispose();
    if (refocus || hadFocus) this.o.focusInput();
    return true;
  }

  /** Closes the popup and the tooltip (the ESC menu opens, the cockpit hides). */
  reset(): void {
    this.closePopup();
    this.tooltip.hide();
  }

  /**
   * The cockpit is shown or hidden (the shell): hidden, the popup closes and
   * the Esc key goes back to the browser; shown in fullscreen, the bar asks
   * for it again.
   */
  setShown(on: boolean): void {
    this.shown = on;
    if (!on) this.reset();
    this.syncKeyLock();
  }

  /** Marks the window toggles whose window is open (ADR 0103). */
  markWindows(open: readonly string[]): void {
    for (const id of ['profile', 'scripts']) this.buttons.get(id)?.classList.toggle('is-open', open.includes(id));
  }

  /** Fullscreen on or off (the button, `#fullscreen`); false when the browser has none. */
  toggleFullscreen(): boolean {
    if (!canFullscreen(this.doc)) return false;
    void toggleFullscreen(this.doc);
    return true;
  }

  /** Esc to the page while the cockpit is shown in fullscreen (Keyboard Lock where there is one). */
  private syncKeyLock(): void {
    const want = this.shown && isFullscreen(this.doc);
    if (want === this.keyLocked) return;
    this.keyLocked = want;
    if (want) lockEscape(this.doc.defaultView?.navigator);
    else unlockEscape(this.doc.defaultView?.navigator);
  }

  private readonly place = (): void => {
    const p = this.pop;
    // An adopted popup places itself.
    if (!p?.own) return;
    const icon = this.buttons.get(p.id);
    if (icon) placePopup(p.el, icon, this.bar);
  };

  // --------------------------------------------------------------- buttons

  private button(s: ButtonSpec): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.className = `wc-mb wc-mb-${s.id}`;
    b.dataset.mb = s.id;
    b.setAttribute('aria-label', s.label);
    b.append(strokeIcon(this.doc, s.icon, 'wc-mb-ic').svg);
    // Keep the input's focus (and its keys) where it is.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tooltip.hide();
      s.click();
    });
    if (s.window) b.setAttribute(WINDOW_BTN_ATTR, '');
    this.tooltip.attach(b, s.tip, () => !s.popup || this.pop?.id !== s.popup);
    this.buttons.set(s.id, b);
    return b;
  }

  /** A button that leaves the bar: any popup closes first. */
  private run(fn: () => void): void {
    this.closePopup();
    fn();
  }

  private sizeBar(): void {
    const cells = barCells(this.buttons.has('fullscreen'));
    this.bar.style.width = `calc(${cells} * var(--cell-w))`;
    this.o.onCells?.(cells);
  }

  private onFullscreen(): void {
    this.syncKeyLock();
    const fs = isFullscreen(this.doc);
    this.fsPath?.setAttribute('d', fs ? ICON.fullscreenExit : ICON.fullscreen);
    this.buttons.get('fullscreen')?.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen');
    this.tooltip.refresh();
  }

  private dropFullscreen(): void {
    const b = this.buttons.get('fullscreen');
    if (!b) return;
    if (this.tooltip.target === b) this.tooltip.hide();
    b.remove();
    this.buttons.delete('fullscreen');
    this.fsPath = null;
    this.sizeBar();
  }

  // ---------------------------------------------------------------- status

  private linkInput(): LinkInput {
    const s = this.o.status.get();
    return {
      conn: s.conn,
      live: this.live,
      linkMs: s.linkMs,
      linkSuspect: s.linkSuspect,
      rttOverdue: this.rttOverdue,
      capture: s.capture,
    };
  }

  private clockText(): string {
    const capture = this.dot.hidden ? captureNote(this.o.status.get().capture) : '';
    return clockTip(this.clock.transition(), this.clock.nowMs(), capture);
  }

  private onStatus(s: Readonly<AppStatusState>): void {
    const prev = this.prevConn;
    this.prevConn = s.conn;
    if (s.conn !== prev) {
      if (s.conn === 'connecting') {
        this.live = !s.replay;
        this.rttOverdue = false;
        this.stopRttTimer();
      } else if ((s.conn === 'login' || s.conn === 'playing') && prev !== 'login' && prev !== 'playing') {
        this.stopRttTimer();
        if (this.live) {
          this.rttTimer = setTimeout(() => {
            this.rttTimer = null;
            this.rttOverdue = true;
            this.drawStatus();
          }, NO_RTT_MS);
        }
      } else if (s.conn === 'disconnected' || s.conn === 'idle') {
        this.stopRttTimer();
      }
    }
    this.drawStatus();
  }

  private drawStatus(): void {
    const s = this.o.status.get();
    const state = linkDot(this.linkInput());
    this.dot.hidden = state === 'off';
    this.dot.dataset.state = state;
    this.notice.hidden = !showDisconnected(s.conn, this.live);
    this.tooltip.refresh();
  }

  private stopRttTimer(): void {
    if (this.rttTimer !== null) clearTimeout(this.rttTimer);
    this.rttTimer = null;
  }

  private refreshTip(target: HTMLElement): void {
    if (this.tooltip.target === target) this.tooltip.refresh();
  }

  dispose(): void {
    this.closePopup();
    this.shown = false;
    this.syncKeyLock();
    this.stopRttTimer();
    for (const off of this.offs.splice(0)) off();
    this.clock.dispose();
    this.tooltip.dispose();
    this.el.remove();
  }
}
