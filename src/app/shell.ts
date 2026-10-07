// Page flow (ADR 0010 "Page flow", ADR 0013): start page ↔ cockpit, the
// ESC menu and its auto-open on disconnect.
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
// start-up (not in `?bench`, where it loads on the first ESC). The profile
// editor (CodeMirror) is a chunk of its own, imported by the chrome when it
// is opened and prefetched when idle once the start page is up.
//
// ESC menu auto-open (Inv §4.7): on a transition from login/playing to
// disconnected on a live connection, unless the user caused it (#reconnect,
// #disconnect, Exit session, a replay starting), unless the menu is
// already open, and never before the first connection reached login.
// Reconnect is pre-selected then.
//
// Runs (ADR 0018): the shell owns one RunLibrary (`runLibrary()`, opened on
// first use) and runs the retention sweep once, when the start page first
// shows (Web Lock `webcockpit-sweep`, so one tab sweeps; errors are silent).
//
// Log player (ADR 0018): `openPlayer(session)` (History's RUN LOG, via
// ChromeServices) loads the chain, hides the start page without touching
// its frame stack and shows the player (src/app/player-host.ts, a chunk of
// its own); its ESC closes it and shows the start page as it was
// (`show({ keep: true })`). Only from the start page, never over the
// cockpit.
//
// Map (ADR 0020): `maps` (src/map/store.ts) is the current map, shared by
// the cockpit's Map pane, the log player's and Options → Mapper.
//
// Notices (ADR 0025): the shell's `Notices` (a newer version, a lost chunk,
// superseded storage) are shown in the cockpit's input row and sent to the
// cockpit App's output once; the chrome shows them in the ESC menu header
// and on the start page (`services.notices`).
//
// Spotlights (ADR 0019): `openSpotlights()` (the start page's Spotlights)
// loads the reel (src/player/spotlight-reel.ts) and opens it in the same
// player host (src/player/spotlight-mode.ts); ESC returns to the start
// page's main menu the same way.

import type { BenchProbe } from './bench-hook';
import type { ChromeServices, EscMenuHandle, StartPageHandle } from '../chrome';
import type { PlayerHost, PlayerInfo } from './player-host';
import type { Session } from '../runs/stitch';
import type { RunEvent } from '../runs/events';
import type { ChainRun } from '../player/timeline';
import type { ApplyResult } from '../editor';
import type { ConnState } from '../core/types';
import { CLIENT_COMMIT, CLIENT_VERSION } from '../core/build-info';
import { defaultLinkFetch } from '../net/link-probe';
import { REASON_USER_DISCONNECT, REASON_USER_RECONNECT } from '../net/session';
import { DEFAULT_PROFILE, ProfileStore } from '../profiles';
import type { SettingsStore } from '../settings';
import type { CellMetrics } from '../theme/cells';
import { App, REASON_REPLAY_START } from './app';
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
import { bootDone, bootStep, revealStart } from './boot-progress';

type ChromeModule = typeof import('../chrome');

/** Delay before the profile editor chunk is prefetched on the start page. */
const EDITOR_PREFETCH_MS = 2000;

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
  private chromeP: Promise<ChromeModule> | null = null;
  private startHost: HTMLDivElement;
  private startMount: HTMLDivElement;
  private menuHost: HTMLDivElement;
  private start: StartPageHandle | null = null;
  private menu: EscMenuHandle | null = null;
  /** The cockpit is the visible view. */
  private inCockpit = false;
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
        this.start = chrome.mountStartPage(this.startMount, this.services(), { onEnter: () => this.enter() });
        this.startMount.style.opacity = '0';
        this.showStart();
        bootStep(100, 'Ready');
        await revealStart(this.startMount);
      } finally {
        this.startMount.style.opacity = '';
        bootDone();
      }
    }
    // Well after the first paint and the web font, so it never competes
    // with the cold start (spec §1.3).
    setTimeout(() => this.idle(() => void import('../editor').catch(() => undefined)), EDITOR_PREFETCH_MS);
  }

  /** Enter MUME: shows the cockpit and connects. */
  enter(): void {
    const app = this.ensureApp();
    this.showCockpit(app);
    app.connectLive();
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

  /** Opens the ESC menu over the cockpit (no-op elsewhere or when open). */
  async openMenu(preselect?: 'continue' | 'reconnect'): Promise<void> {
    if (!this.inCockpit || !this.appRef) return;
    const menu = await this.ensureMenu(this.appRef);
    if (!this.inCockpit) return;
    menu.open(preselect ? { preselect } : {});
  }

  /** The touch menu button (`☰`); a tap opens the ESC menu without focusing the input. */
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

  // ----------------------------------------------------------- log player

  /** The open log player (tests, the dev hook). */
  get playerHost(): PlayerHost | null {
    return this.player;
  }

  /** Opens the log player on `session` (from the start page only). */
  openPlayer(session: Session): Promise<void> {
    return this.startPlayer(async (host) => host.open(session, await this.runLibrary()));
  }

  /** Opens the log player on logs that are not stored (dev hook, measurements). */
  openPlayerChain(chain: readonly ChainRun[], events: readonly RunEvent[], info: PlayerInfo): Promise<void> {
    return this.startPlayer((host) => host.openChain(chain, events, info));
  }

  /**
   * Loads the Spotlights reel and plays it (from the start page only).
   * Resolves to the empty state when there is nothing to play.
   */
  async openSpotlights(): Promise<'no_data' | 'filtered' | null> {
    if (this.inCockpit || this.player || this.playerOpening) return null;
    const [{ loadReel }, lib] = await Promise.all([import('../player/spotlight-reel'), this.runLibrary()]);
    const reel = await loadReel(lib, this.opts.settings.get().spotlights);
    if ('empty' in reel) return reel.empty;
    const { openSpotlightReel } = await import('../player/spotlight-mode');
    await this.startPlayer((host) => openSpotlightReel(host, reel));
    return null;
  }

  private async startPlayer(load: (host: PlayerHost) => Promise<void> | void): Promise<void> {
    if (this.inCockpit || this.player || this.playerOpening) return;
    this.playerOpening = true;
    try {
      const { PlayerHost } = await import('./player-host');
      if (this.inCockpit) return;
      const host = new PlayerHost({
        root: this.opts.root,
        settings: this.opts.settings,
        onClose: () => this.closePlayer(),
        map: this.maps.host(),
      });
      host.el.style.display = 'none';
      this.player = host;
      await load(host);
      if (this.player !== host) return;
      this.start?.hide();
      this.startHost.style.display = 'none';
      host.el.style.display = '';
    } catch (err) {
      console.error('WebCockpit: the log player could not open', err);
      this.player?.dispose();
      this.player = null;
    } finally {
      this.playerOpening = false;
    }
  }

  private closePlayer(): void {
    this.player = null;
    this.startHost.style.display = '';
    this.start?.show({ keep: true });
  }

  // ------------------------------------------------------------------ views

  private showStart(): void {
    this.inCockpit = false;
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

  private showCockpit(app: App): void {
    this.start?.hide();
    this.startHost.style.display = 'none';
    app.el.style.display = '';
    this.inCockpit = true;
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
      onEscape: () => void this.openMenu(),
      ...(probe ? { requestFrame: probe.requestFrame } : {}),
    });
    // Keep the menu host last, so the overlay is above the cockpit in DOM order too.
    root.appendChild(this.menuHost);
    const notices = this.opts.notices;
    if (notices) {
      app.input.clockEl.before(new NoticeIndicator(root.ownerDocument, notices, CLIENT_VERSION).el);
      notices.attach(app.bus);
    }
    // Touch only (ADR 0075): a `☰` at the end of the input row opens the
    // ESC menu, as Esc does. Desktop has no such control.
    if (device().touch) app.input.clockEl.after(this.menuButton(root.ownerDocument));
    // Phone only (ADR 0075 §3.4): back from the background, check the link
    // at once; a dead one drops with a reason, and onConn opens the menu
    // with Reconnect selected. Desktop installs nothing.
    if (device().phone) {
      const doc = root.ownerDocument;
      watchResume(doc, doc.defaultView ?? window, () => app.session.checkAlive());
    }
    app.bus.on('conn.state', (s) => this.onConn(s.state, s.reason ?? ''));
    this.appRef = app;
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
      openPlayer: (session) => void this.openPlayer(session),
      openSpotlights: () => this.openSpotlights(),
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
      liveApply: (text) => app.applyProfile(text),
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
