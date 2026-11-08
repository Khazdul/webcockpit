// Page flow (ADR 0010 "Page flow", ADR 0013): start page ↔ cockpit, the
// phone's ESC menu and its auto-open on disconnect.
//
//   /                      start page; Enter MUME builds the cockpit (once)
//                          and connects
//   ?replay, ?fixture=,    straight to the cockpit, offline, as in stage 1
//   ?bench
//
// The App is built on the first Enter MUME and reused for every later
// session in the tab (Exit session hides it and shows the start page; the
// output keeps its scrollback). Switching views is synchronous, so there
// is never a blank frame between them.
//
// The chrome (Preact) is a separate chunk. On `/` it is loaded at once
// (the start page is chrome); in the offline modes it is prefetched after
// start-up (not in `?bench`, where it loads on the first window, popup or
// Statistics pane, or the phone's first ESC). The profile
// editor (CodeMirror) is a chunk of its own, imported by the chrome when it
// is opened and prefetched when idle once the start page is up.
//
// ESC menu (Inv §4): the phone only since stage 30f (ADR 0112). Esc in the
// input, `#menu` and the `☰` open it there; where the menu bar exists the
// shell never mounts it, and nothing opens it.
//
// ESC menu auto-open (Inv §4.7), phone only since stage 30 (ADR 0100): on
// a transition from login/playing to disconnected on a live connection,
// unless the user caused it (#reconnect, #disconnect, Exit session, a
// replay starting), unless the menu is already open, and never before the
// first connection reached login. Reconnect is pre-selected then. On
// desktop and tablet the menu bar's Disconnected notice takes its place
// (src/menubar/menubar.ts), and Enter still reconnects.
//
// Menu bar (ADR 0099): desktop and tablet (`device().phone` keeps the
// clock strip and `☰`; a tablet uses the bar by touch, ADR 0112). The
// cockpit's `ui` hands it `exitSession`; its popups close when the cockpit
// is hidden. On the phone `ui.openMenuAt` opens the ESC menu straight at
// the profile editor, Options → Scripts, Options, Panes or Exit (leaving
// that frame closes the menu): the phone's way to `#profile` and the rest.
//
// Windows (ADR 0103): where the bar exists, Profile and Scripts are
// movable windows (src/chrome/windows.tsx), mounted on first use in a
// layer of the cockpit element. The bar and `#profile` / `#scripts` toggle
// them (`toggleWindow`); Esc in the input reaches the topmost one. They
// close with the cockpit (Exit, the start page), unsaved changes
// discarded; the Exit popup warns first.
//
// Settings popups (ADR 0107): where the bar exists, the bar's Settings and
// `#settings` toggle the Settings popup (src/chrome/popups/surface.tsx),
// mounted on first use in the App's element beside the bar's own popups
// and placed above the Settings icon (`placePopup`). The bar adopts it as
// its open popup, so the one-popup rule, Esc and hiding the cockpit close
// it as they close Panes and Exit. The Map, Comm, Timers and
// Group panes' Gear opens their gear popup through the same layer
// (`togglePaneSettings`, the App's `ui.togglePaneSettings`), beside the
// pane (`placeBeside`), placed again after every cockpit layout and closed
// when its pane is no longer shown (hidden by its cross, the Panes popup,
// a setting or Reset layout, or the window too small); the Gear is marked
// while its popup is open (`Cockpit.markGear`).
//
// Statistics pane (ADR 0109): where the bar exists, the App's
// `ui.mountStatsPane` loads the chrome chunk and mounts the pane's view
// (src/chrome/stats-pane.tsx) into the pane's content element on its first
// show. The cockpit chunk holds only the pane's shell.
//
// Runs (ADR 0018): the shell owns one RunLibrary (`runLibrary()`, opened on
// first use) and runs the retention sweep once, when the start page first
// shows (Web Lock `webcockpit-sweep`, so one tab sweeps; errors are silent).
//
// Log player (ADR 0018; src/app/player-host.ts, a chunk of its own). Only
// from the start page, never over the cockpit, and one at a time. The
// player core (stage 42f, ADR 0127): the run log player has the kit's Back
// at the top left and times as `h:mm:ss`, and an open resolves to why it
// did not open (History's error box) instead of only logging a failure.
// - `openRunLog(session)` (History's Run log, via ChromeServices; stage 45
//   owner feedback, ADR 0130) loads the chain into a host parked out of
//   sight in the page root and resolves to it; History moves it into its
//   Run log page in the big box (`RunLogFrame`), over the still sky. The
//   start page stays; the host's close (Esc, Back) disposes it and the page
//   pops itself.
// - `openPlayer(session)` and `openPlayerChain` (the dev hook, the bench,
//   the tests) show the player over the whole window: the start page is
//   hidden without touching its frame stack and shown again as it was
//   (`show({ keep: true })`) when the player closes.
// - `embedPlayer(slot)` mounts a host inside a page of the start surface
//   (the Spotlights viewer, stage 46): the start page stays.
// Each host is the shell's `playerHost` until it is disposed, and no
// second player opens meanwhile.
//
// Map (ADR 0020): `maps` (src/map/store.ts) is the current map, shared by
// the cockpit's Map pane, the log player's and Options → Mapper.
//
// Notices (ADR 0025): the shell's `Notices` (a newer version, a lost chunk,
// superseded storage) are shown in the cockpit's input row and sent to the
// cockpit App's output once; the chrome shows them on the start page and
// in the phone's ESC menu header (`services.notices`).
//
// Spotlights (ADR 0019, 0131): the start page's Spotlights page loads the
// reel itself and plays it in an embedded host (`embedPlayer`).

import type { BenchProbe } from './bench-hook';
import type {
  ChromeServices,
  EscMenuHandle,
  EscMenuTarget,
  PopupPlace,
  SettingsPopupTarget,
  SettingsPopupsHandle,
  StartLeave,
  StartPageHandle,
  WindowId,
  WindowsHandle,
} from '../chrome';
import { followPane, gearPaneOf, placeBeside, placePopup } from '../menubar/popup';
import type { PaneId } from '../layout/types';
import type { PlayerHost, PlayerInfo, PlayerOpenOptions } from './player-host';
import type { PlayerOpenResult, RunLogOpenResult } from '../chrome/kit/hooks';
import type { Session } from '../runs/stitch';
import type { RunEvent } from '../runs/events';
import type { ChainRun } from '../player/timeline';
import type { ConnState } from '../core/types';
import { CLIENT_COMMIT, CLIENT_VERSION } from '../core/build-info';
import { defaultLinkFetch } from '../net/link-probe';
import { REASON_USER_DISCONNECT, REASON_USER_RECONNECT } from '../net/session';
import { DEFAULT_PROFILE, ProfileStore } from '../profiles';
import type { SettingsStore } from '../settings';
import type { CellMetrics } from '../theme/cells';
import { App, REASON_REPLAY_START, type StatsPaneDeps } from './app';
import { nowUs } from '../core/types';
import { RunLibrary } from '../runs/library';
import { uiValue } from './ui-messages';
import { MapStore } from '../map/store';
import { NEW_USER_SCRIPTS, ScriptLibrary } from '../scripts';
import { lazyDb } from '../panes/context';
import type { Notices } from './notices';
import { NoticeIndicator } from '../ui/notice-indicator';
import { device } from '../core/device';
import { watchResume } from './resume-watch';
import { installWeather } from '../weather/hook';
import { REVEAL_FADE_MS, bootDone, bootStep, revealStart } from './boot-progress';

type ChromeModule = typeof import('../chrome');

/** Delay before the profile editor chunk is prefetched on the start page. */
const EDITOR_PREFETCH_MS = 2000;

/** The run log player's mode (ADR 0127): the kit's Back, times as `h:mm:ss`. */
const RUN_LOG_VIEW: PlayerOpenOptions = { view: { back: { title: 'Back to History (Esc)' }, hours: true } };

/** Why a player did not open, as a sentence. */
const errText = (e: unknown): string => (e instanceof Error && e.message ? e.message : String(e));
const ONLY_START = 'The player opens from the start page only.';

/** Reasons that never auto-open the menu: the user asked for the disconnect. */
const QUIET_REASONS = new Set([REASON_USER_RECONNECT, REASON_USER_DISCONNECT, REASON_REPLAY_START]);

export interface ShellOptions {
  /** The page root (#app). */
  root: HTMLElement;
  settings: SettingsStore;
  cells: CellMetrics;
  /** Offline cockpit mode (`?replay`, `?fixture=`, `?bench`): no start page. */
  offline: boolean;
  /** `?bench`: the probe's frame scheduler, and no chrome prefetch. */
  probe?: BenchProbe | null;
  /** Profile store (tests inject one). */
  profiles?: ProfileStore;
  /** Map store (tests inject one). */
  maps?: MapStore;
  /** Script library (tests inject one). */
  scripts?: ScriptLibrary;
  /** Client notices (ADR 0025). Absent: none are shown. */
  notices?: Notices;
  /**
   * The first boot's font gate (ADR 0083): the start page is held until it
   * resolves, then fades in, and the boot loader advances on the way.
   * Absent (tests): the start page shows at once.
   */
  fontsReady?: Promise<void>;
}

export class Shell {
  private readonly opts: ShellOptions;
  readonly profiles: ProfileStore;
  private appRef: App | null = null;
  private appWaiters: Array<(app: App) => void> = [];
  private chromeP: Promise<ChromeModule> | null = null;
  private startHost: HTMLDivElement;
  private startMount: HTMLDivElement;
  private menuHost: HTMLDivElement;
  private start: StartPageHandle | null = null;
  private menu: EscMenuHandle | null = null;
  /** The windows layer (ADR 0103), mounted on first use. */
  private windows: WindowsHandle | null = null;
  private windowsP: Promise<WindowsHandle> | null = null;
  /** The settings popups' layer (ADR 0107), mounted on first use. */
  private popups: SettingsPopupsHandle | null = null;
  private popupsP: Promise<SettingsPopupsHandle> | null = null;
  /** The cockpit is the visible view. */
  private inCockpit = false;
  /** Enter MUME's transition, while the start page leaves over the cockpit. */
  private entering: { leave: StartLeave; css: string } | null = null;
  /** Some live connection has reached login (the bootstrap guard). */
  private everUp = false;
  private prevConn: ConnState = 'idle';
  /** The current connection is a replay. */
  private connIsReplay = false;
  private libraryP: Promise<RunLibrary> | null = null;
  private swept = false;
  private player: PlayerHost | null = null;
  private playerOpening = false;
  /** The current map (ADR 0020): the cockpit's and the log player's Map pane, Options → Mapper. */
  readonly maps: MapStore;
  /** The script library (ADR 0051): the cockpit's script host and the Scripts page. */
  readonly scripts: ScriptLibrary;

  constructor(opts: ShellOptions) {
    this.opts = opts;
    this.profiles = opts.profiles ?? new ProfileStore();
    this.maps = opts.maps ?? new MapStore({ openDb: lazyDb() });
    this.scripts = opts.scripts ?? new ScriptLibrary();
    const doc = opts.root.ownerDocument;
    // index.html's first paint draws the banner in a start page host of its
    // own (ADR 0083): the start page is mounted beside it, in the same box.
    const first = doc.getElementById('wc-start-host');
    if (first && (opts.offline || first.parentNode !== opts.root)) first.remove();
    if (first && !opts.offline && first.parentNode === opts.root) {
      this.startHost = first as HTMLDivElement;
    } else {
      this.startHost = doc.createElement('div');
      this.startHost.className = 'wc-start-host';
      this.startHost.style.cssText = 'position:relative;height:100%;display:none';
    }
    // The start page renders here; its surface is placed in the host.
    this.startMount = doc.createElement('div');
    this.startHost.append(this.startMount);
    this.menuHost = doc.createElement('div');
    this.menuHost.className = 'wc-menu-host';
    if (this.startHost.parentNode !== opts.root) opts.root.append(this.startHost);
    opts.root.append(this.menuHost);
  }

  /** The run library (History, backups, the sweep); opened on first use. */
  runLibrary(): Promise<RunLibrary> {
    this.libraryP ??= RunLibrary.open();
    this.libraryP.catch(() => (this.libraryP = null));
    return this.libraryP;
  }

  /** The cockpit, once built. */
  get app(): App | null {
    return this.appRef;
  }

  /** Calls `fn` with the cockpit once it is built (at once when it is). */
  onApp(fn: (app: App) => void): void {
    if (this.appRef) fn(this.appRef);
    else this.appWaiters.push(fn);
  }

  /** Shows the first view: the start page, or the cockpit in the offline modes. */
  async boot(): Promise<void> {
    void this.initProfiles();
    void this.newUserScripts();
    if (this.opts.offline) {
      this.showCockpit(this.ensureApp());
      if (!this.opts.probe) this.prefetchChrome();
      return;
    }
    const fonts = this.opts.fontsReady;
    if (!fonts) {
      const chrome = await this.loadChrome();
      this.start = chrome.mountStartPage(this.startMount, this.services(), { onEnter: () => this.enter() });
      this.showStart();
    } else {
      // The chrome chunk and the fonts load side by side (ADR 0083).
      let chromeDone = false;
      let fontsDone = false;
      let reveal!: () => void;
      const revealed = new Promise<void>((r) => (reveal = r));
      const progress = (): void => {
        if (chromeDone && fontsDone) bootStep(90, 'Starting');
        else bootStep(70, chromeDone ? 'Loading fonts' : 'Loading interface');
      };
      try {
        const [chrome] = await Promise.all([
          this.loadChrome().then((c) => {
            chromeDone = true;
            progress();
            return c;
          }),
          fonts.then(() => {
            fontsDone = true;
            progress();
          }),
        ]);
        // The sky engine mounts once the reveal's fade is over, on the first paint's
        // sky (ADR 0083): its canvases fade in on screen, and it judges the
        // device's frame times without the page's own fade in them (ADR 0124).
        this.start = chrome.mountStartPage(this.startMount, this.services(), { onEnter: () => this.enter(), skyHold: revealed });
        this.startMount.style.opacity = '0';
        this.showStart();
        bootStep(100, 'Ready');
        await revealStart(this.startMount);
      } finally {
        this.startMount.style.opacity = '';
        bootDone();
        const still = this.opts.root.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        setTimeout(reveal, still ? 0 : REVEAL_FADE_MS);
      }
    }
    // Well after the first paint and the web font, so it never competes
    // with the cold start (spec §1.3).
    setTimeout(() => this.idle(() => void import('../editor').catch(() => undefined)), EDITOR_PREFETCH_MS);
  }

  /**
   * Enter MUME: shows the cockpit and connects, both at once (ADR 0125):
   * the input has the focus and every key from the first moment, and the
   * game's text may arrive while the start page still leaves over it (it
   * fades away, its sky zooms, it fades out: `StartPageHandle.leave`). A second
   * Enter or click meanwhile is the cockpit's (the start page has let go
   * of its keys and pointer events). Without the transition (no Web
   * Animations) the switch is at once.
   */
  enter(): void {
    if (this.inCockpit) return;
    const app = this.ensureApp();
    const start = this.start;
    const leave = start?.visible ? start.leave() : null;
    if (!leave) {
      this.showCockpit(app);
      app.connectLive();
      return;
    }
    // The page lies over the cockpit where it is now, out of the flow.
    const host = this.startHost;
    const r = host.getBoundingClientRect();
    const css = host.style.cssText;
    Object.assign(host.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      zIndex: '500',
      pointerEvents: 'none',
    });
    const entering = { leave, css };
    this.entering = entering;
    this.showCockpit(app, { keepStart: true });
    app.connectLive();
    void leave.finished.then((done) => {
      if (!done || this.entering !== entering) return;
      this.endEnter();
      this.start?.hide();
      this.startHost.style.display = 'none';
    });
  }

  /** Enter MUME's transition is playing (tests, the dev hook). */
  get enterPlaying(): boolean {
    return !!this.entering;
  }

  /** Puts the start page's host back in the flow after the transition. */
  private endEnter(): void {
    const e = this.entering;
    if (!e) return;
    this.entering = null;
    this.startHost.style.cssText = e.css;
  }

  /** Exit session: closes the connection and returns to the start page. */
  async exitSession(): Promise<void> {
    const app = this.appRef;
    if (app && app.status.get().conn !== 'disconnected' && app.status.get().conn !== 'idle') {
      app.session.disconnect(REASON_USER_DISCONNECT);
    }
    // The start page's editor must read everything typed in the session (ADR 0038).
    await app?.flushWriteBack();
    if (!this.start) {
      const chrome = await this.loadChrome();
      this.start = chrome.mountStartPage(this.startMount, this.services(), { onEnter: () => this.enter() });
    }
    this.menu?.close();
    this.showStart();
  }

  /**
   * Opens the ESC menu over the cockpit (no-op elsewhere or when open), at
   * `target`'s frame when given. The phone only: where the menu bar exists
   * there is no ESC menu (ADR 0112).
   */
  async openMenu(preselect?: 'continue' | 'reconnect', target?: EscMenuTarget): Promise<void> {
    if (!this.inCockpit || !this.appRef || this.appRef.menuBar) return;
    const menu = await this.ensureMenu(this.appRef);
    if (!this.inCockpit) return;
    menu.open({ ...(preselect ? { preselect } : {}), ...(target ? { target } : {}) });
  }

  /** The phone's menu button (`☰`); a tap opens the ESC menu without focusing the input. */
  private menuButton(doc: Document): HTMLSpanElement {
    const b = doc.createElement('span');
    b.className = 'wc-menu-btn';
    b.textContent = '☰';
    b.title = 'Menu';
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', 'Menu');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.openMenu();
    });
    return b;
  }

  /** Closes the ESC menu and gives the input its focus back. */
  closeMenu(): void {
    this.menu?.close();
    if (this.inCockpit) this.appRef?.input.focus();
  }

  get menuOpen(): boolean {
    return this.menu?.isOpen ?? false;
  }

  // -------------------------------------------------------------- windows

  /** The windows layer, once mounted (tests, the dev hook). */
  get windowsHandle(): WindowsHandle | null {
    return this.windows;
  }

  /** The bar's Profile / Scripts and `#profile` / `#scripts`: the window's toggle (ADR 0103). */
  async toggleWindow(id: WindowId): Promise<void> {
    if (!this.inCockpit || !this.appRef) return;
    const w = await this.ensureWindows(this.appRef);
    if (this.inCockpit) w.toggle(id);
  }

  private ensureWindows(app: App): Promise<WindowsHandle> {
    this.windowsP ??= this.loadChrome().then((chrome) => {
      const host = app.el.ownerDocument.createElement('div');
      host.className = 'wc-windows-host';
      app.cockpit.el.append(host);
      this.windows = chrome.mountWindows(host, this.services(), {
        status: app.status,
        commitProfile: (name, build, opts) => app.commitProfile(name, build, opts),
        flushWriteBack: () => app.flushWriteBack(),
        focusInput: () => app.input.focus(),
        onChange: () => app.menuBar?.markWindows(this.windows?.openIds ?? []),
      });
      return this.windows;
    });
    this.windowsP.catch(() => (this.windowsP = null));
    return this.windowsP;
  }

  // ------------------------------------------------------ settings popups

  /** The settings popups' layer, once mounted (tests, the dev hook, 30c part 2). */
  get popupsHandle(): SettingsPopupsHandle | null {
    return this.popups;
  }

  /** The bar's Settings and `#settings`: the Settings popup's toggle, above the Settings icon (ADR 0107). */
  async toggleSettings(): Promise<void> {
    const bar = this.appRef?.menuBar;
    if (!bar) return;
    await this.togglePopup('settings', (el) => {
      const icon = bar.anchor('settings');
      if (icon) placePopup(el, icon, bar.bar);
    });
  }

  /** A pane's Gear: its gear popup's toggle, beside the pane (ADR 0107). */
  async togglePaneSettings(id: PaneId): Promise<void> {
    const app = this.appRef;
    if (!app) return;
    const cockpit = app.cockpit;
    await this.togglePopup({ pane: id }, (el) => {
      if (!cockpit.isShown(id)) return;
      const doc = el.ownerDocument;
      // Over a wide pane: below its title row.
      const cellH = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--cell-h')) || 0;
      placeBeside(el, cockpit.pane(id).el, cockpit.gameEl, cellH);
    });
  }

  /**
   * Toggles the settings popup for `target`, placed by `place` (the Settings
   * popup above its icon; a gear popup beside its pane).
   */
  async togglePopup(target: SettingsPopupTarget, place: PopupPlace): Promise<void> {
    if (!this.inCockpit || !this.appRef?.menuBar) return;
    const p = await this.ensurePopups(this.appRef);
    if (this.inCockpit) p.toggle(target, place);
  }

  private ensurePopups(app: App): Promise<SettingsPopupsHandle> {
    this.popupsP ??= this.loadChrome().then((chrome) => {
      const host = app.el.ownerDocument.createElement('div');
      host.className = 'wc-popups-host';
      app.el.append(host);
      this.popups = chrome.mountSettingsPopups(host, this.services(), {
        focusInput: () => app.input.focus(),
        // The cockpit never opens the reel's `spotlights` popup (ADR 0110).
        onOpen: (key, el, close) => app.menuBar?.adopt({ key, el, close }),
        onClose: (key) => app.menuBar?.release(key),
        onChange: (key) => app.cockpit.markGear(gearPaneOf(key) as PaneId | null),
      });
      // The open gear popup follows its pane, or closes when the pane is no longer shown.
      const popups = this.popups;
      app.cockpit.onLayout(() => followPane(popups, (id) => app.cockpit.isShown(id as PaneId)));
      return this.popups;
    });
    this.popupsP.catch(() => (this.popupsP = null));
    return this.popupsP;
  }

  // ----------------------------------------------------------- log player

  /** The open log player (tests, the dev hook). */
  get playerHost(): PlayerHost | null {
    return this.player;
  }

  /**
   * Loads `session` into a run log player host parked out of sight (from
   * the start page only; ChromeServices.openRunLog): resolves to the
   * playing host, which the caller moves into its page or disposes, or to
   * why it did not open.
   */
  async openRunLog(session: Session): Promise<RunLogOpenResult> {
    const doc = this.opts.root.ownerDocument;
    const park = doc.createElement('div');
    park.className = 'wc-player-park';
    park.style.display = 'none';
    this.opts.root.appendChild(park);
    const host = await this.makeHost(park, () => {});
    if (typeof host === 'string') {
      park.remove();
      return { ok: false, error: host };
    }
    host.onDispose(() => {
      park.remove();
      if (this.player === host) this.player = null;
    });
    try {
      await host.open(session, await this.runLibrary(), RUN_LOG_VIEW);
      if (host.isClosed) return { ok: false, error: 'The player was closed while it opened.' };
      return { ok: true, host };
    } catch (err) {
      console.error('WebCockpit: the log player could not open', err);
      host.dispose();
      return { ok: false, error: errText(err) };
    }
  }

  /** Opens the log player over the whole window on `session` (from the start page only; the dev hook); resolves to how it went. */
  openPlayer(session: Session): Promise<PlayerOpenResult> {
    return this.startPlayer(async (host) => host.open(session, await this.runLibrary(), RUN_LOG_VIEW));
  }

  /** Opens the log player on logs that are not stored (dev hook, measurements), as the run log player. */
  openPlayerChain(chain: readonly ChainRun[], events: readonly RunEvent[], info: PlayerInfo): Promise<PlayerOpenResult> {
    return this.startPlayer((host) => host.openChain(chain, events, info, RUN_LOG_VIEW));
  }

  /**
   * A player host mounted in `slot`, inside a page of the start surface
   * (ChromeServices.embedPlayer): it fills the slot and follows its size,
   * and the start page stays shown. Null while another player is open or
   * opening, over the cockpit, or when the player chunk cannot load. The
   * host is `playerHost` until it is disposed (its `close()` disposes it
   * too, and shows or hides nothing).
   */
  async embedPlayer(slot: HTMLElement): Promise<PlayerHost | null> {
    const host = await this.makeHost(slot, () => {});
    if (typeof host === 'string') return null;
    host.onDispose(() => {
      if (this.player === host) this.player = null;
    });
    return host;
  }

  /**
   * A new player host in `root`, once its chunk is in, as the shell's
   * `playerHost`; or why none may open (over the cockpit, another player
   * open or opening, the chunk lost).
   */
  private async makeHost(root: HTMLElement, onClose: () => void): Promise<PlayerHost | string> {
    if (this.inCockpit) return ONLY_START;
    if (this.player || this.playerOpening) return 'Another player is open.';
    this.playerOpening = true;
    try {
      const { PlayerHost } = await import('./player-host');
      if (this.inCockpit || !root.isConnected) return ONLY_START;
      return (this.player = new PlayerHost({ root, settings: this.opts.settings, onClose, map: this.maps.host() }));
    } catch (err) {
      console.error('WebCockpit: the player could not load', err);
      return errText(err);
    } finally {
      this.playerOpening = false;
    }
  }

  private async startPlayer(load: (host: PlayerHost) => Promise<void> | void): Promise<PlayerOpenResult> {
    const host = await this.makeHost(this.opts.root, () => this.closePlayer());
    if (typeof host === 'string') return { ok: false, error: host };
    host.el.style.display = 'none';
    try {
      await load(host);
      if (this.player !== host) return { ok: false, error: 'The player was closed while it opened.' };
      this.start?.hide();
      this.startHost.style.display = 'none';
      host.el.style.display = '';
      return { ok: true };
    } catch (err) {
      console.error('WebCockpit: the log player could not open', err);
      host.dispose();
      if (this.player === host) this.player = null;
      return { ok: false, error: errText(err) };
    }
  }

  private closePlayer(): void {
    this.player = null;
    this.startHost.style.display = '';
    this.start?.show({ keep: true });
  }

  // ------------------------------------------------------------------ views

  private showStart(): void {
    // Back before the transition was over: the page shows as it was (start.show() cancels it).
    this.endEnter();
    this.inCockpit = false;
    // The windows close with the cockpit; their unsaved changes are discarded (ADR 0103).
    this.windows?.closeAll();
    this.appRef?.menuBar?.setShown(false);
    if (this.appRef) this.appRef.el.style.display = 'none';
    this.startHost.style.display = '';
    this.start?.show();
    if (!this.swept) {
      this.swept = true;
      this.runLibrary()
        .then((lib) => lib.sweep(nowUs()))
        .catch(() => {});
    }
  }

  private showCockpit(app: App, o: { keepStart?: boolean } = {}): void {
    if (!o.keepStart) {
      this.start?.hide();
      this.startHost.style.display = 'none';
    }
    app.el.style.display = '';
    this.inCockpit = true;
    app.menuBar?.setShown(true);
    app.input.focus();
  }

  private ensureApp(): App {
    if (this.appRef) return this.appRef;
    const { root, cells, offline, probe, settings } = this.opts;
    const app = new App({
      root,
      offline,
      cells,
      settings,
      // The `Link:` probe (ADR 0030); offline pages never connect live.
      linkFetch: offline ? null : defaultLinkFetch(),
      profiles: this.profiles,
      scripts: this.scripts,
      map: this.maps.host({ persistIds: true }),
      // The ESC menu is the phone's only (ADR 0112): Esc, `#menu` and the menu targets.
      ...(device().phone ? { onEscape: () => void this.openMenu() } : {}),
      ui: {
        bar: !device().phone,
        exit: () => void this.exitSession(),
        // The windows (ADR 0103) and popups where the bar exists.
        ...(device().phone
          ? { openMenuAt: (target: EscMenuTarget) => void this.openMenu(undefined, target) }
          : {
              toggleWindow: (id: WindowId) => void this.toggleWindow(id),
              toggleSettings: () => void this.toggleSettings(),
              togglePaneSettings: (id: PaneId) => void this.togglePaneSettings(id),
              mountStatsPane: (host: HTMLElement, deps: StatsPaneDeps) =>
                this.loadChrome().then((chrome) => chrome.mountStatsPane(host, this.services(), deps)),
              escapeWindow: () => this.windows?.escapeTop() ?? false,
              windowsUnsaved: () => this.windows?.unsaved() ?? false,
            }),
      },
      weather: installWeather,
      ...(probe ? { requestFrame: probe.requestFrame } : {}),
    });
    // Keep the menu host last, so the overlay is above the cockpit in DOM order too.
    root.appendChild(this.menuHost);
    // The right end of the input row: the menu bar (ADR 0099), or the clock strip on a phone.
    const rowEnd = app.menuBar?.el ?? app.input.clockEl;
    const notices = this.opts.notices;
    if (notices) {
      rowEnd.before(new NoticeIndicator(root.ownerDocument, notices, CLIENT_VERSION).el);
      notices.attach(app.bus);
    }
    // Phone only (ADR 0075, ADR 0112): a `☰` at the end of the input row
    // opens the ESC menu, as Esc does. Desktop and tablet have the bar.
    if (device().phone) rowEnd.after(this.menuButton(root.ownerDocument));
    // Phone only (ADR 0075 §3.4): back from the background, check the link
    // at once; a dead one drops with a reason, and onConn opens the menu
    // with Reconnect selected. Desktop installs nothing.
    if (device().phone) {
      const doc = root.ownerDocument;
      watchResume(doc, doc.defaultView ?? window, () => app.session.checkAlive());
    }
    app.bus.on('conn.state', (s) => this.onConn(s.state, s.reason ?? ''));
    this.appRef = app;
    for (const fn of this.appWaiters.splice(0)) fn(app);
    return app;
  }

  private onConn(state: ConnState, reason: string): void {
    const app = this.appRef!;
    const prev = this.prevConn;
    this.prevConn = state;
    if (state === 'connecting') this.connIsReplay = app.status.get().replay;
    if ((state === 'login' || state === 'playing') && !this.connIsReplay) this.everUp = true;
    if (state !== 'disconnected') return;
    const wasUp = prev === 'login' || prev === 'playing';
    if (!wasUp || !this.everUp || this.connIsReplay || QUIET_REASONS.has(reason)) return;
    if (!this.inCockpit || this.menuOpen) return;
    // Desktop and tablet: the menu bar's Disconnected notice instead (ADR 0100).
    if (!device().phone) return;
    void this.openMenu('reconnect');
  }

  // ----------------------------------------------------------------- chrome

  private services(): ChromeServices {
    return {
      settings: this.opts.settings,
      cells: this.opts.cells,
      profiles: this.profiles,
      version: CLIENT_VERSION,
      commit: CLIENT_COMMIT,
      ...(this.opts.notices ? { notices: this.opts.notices } : {}),
      onProfileSaved: (name) => this.appRef?.ui('system', `Profile {${uiValue(name)}} saved.`),
      runs: () => this.runLibrary(),
      openRunLog: (session) => this.openRunLog(session),
      embedPlayer: (slot) => this.embedPlayer(slot),
      maps: this.maps,
      scripts: this.scripts,
      scriptRunning: (name) => this.appRef?.scriptRunning(name) ?? null,
      scriptPanes: {
        list: () => this.appRef?.cockpit.scriptPanes() ?? [],
        subscribe: (fn) => this.appRef?.cockpit.onScriptPanes(fn) ?? (() => {}),
      },
    };
  }

  private loadChrome(): Promise<ChromeModule> {
    this.chromeP ??= import('../chrome');
    return this.chromeP;
  }

  private prefetchChrome(): void {
    this.idle(() => void this.loadChrome().catch(() => (this.chromeP = null)));
  }

  /** Runs `go` when the page is idle (at most ~2 s later). */
  private idle(go: () => void): void {
    const win = this.opts.root.ownerDocument.defaultView;
    if (win?.requestIdleCallback) win.requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 500);
  }

  private async ensureMenu(app: App): Promise<EscMenuHandle> {
    if (this.menu) return this.menu;
    const chrome = await this.loadChrome();
    this.menu ??= chrome.mountEscMenu(this.menuHost, this.services(), {
      status: app.status,
      close: () => this.closeMenu(),
      reconnect: () => {
        this.closeMenu();
        app.onCommand('#reconnect');
      },
      exit: () => void this.exitSession(),
      commitProfile: (name, build, opts) => app.commitProfile(name, build, opts),
      flushWriteBack: () => app.flushWriteBack(),
      runs: app.runs,
    });
    return this.menu;
  }

  /**
   * A new user (no stored settings, ADR 0078) starts with the bundled
   * scripts of `NEW_USER_SCRIPTS` enabled (none on a phone, ADR 0081);
   * the library makes sure an install that already has script data is
   * never changed. Not in the bench (`probe`), which measures the
   * cockpit without scripts.
   */
  private async newUserScripts(): Promise<void> {
    if (this.opts.probe) return;
    try {
      await this.opts.settings.load();
      if (this.opts.settings.fresh && !device().phone) await this.scripts.enableForNewUser(NEW_USER_SCRIPTS);
    } catch {
      /* the Scripts page reports storage errors */
    }
  }

  /** Seeds `default` and makes sure the selected profile exists. */
  private async initProfiles(): Promise<void> {
    try {
      await this.profiles.init();
      const sel = this.opts.settings.get().profile;
      if (!(await this.profiles.get(sel))) this.opts.settings.update({ profile: DEFAULT_PROFILE });
    } catch {
      /* the profile frame reports storage errors */
    }
  }
}
