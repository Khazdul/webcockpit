// Application shell (spec §2.1, §2.2): wires the layers together and owns
// the built-in commands.
//
//   socket → Session (telnet, GMCP, keep-alive) → LineAssembler → bus
//   bus → AppStatus, Recorder, ScriptEngine → text.display → OutputPane
//   InputPane → ScriptEngine (aliases, # commands, client commands)
//             → Session.sendCommand
//   InputPane keydown → macro → ScriptEngine (synchronously, no await)
//
// Script engine (ADR 0015): the selected profile is loaded at start-up (so
// an offline replay runs it too) and again whenever a live session starts.
// `applyProfile(text)` swaps it atomically (the ESC-menu editor). Settings
// typed on the input line, and declared variables a script sets, are
// written to the stored profile (src/app/writeback.ts, ADR 0038).
// Password mode bypasses the engine (InputPane sends secrets directly).
//
// The screen is the Cockpit view (src/layout/cockpit.ts): the output pane
// sits in its game slot, the input pane in its input slot, and the side
// panes in the docks, laid out from the settings (ADR 0010, ADR 0012).
//
// `app.status` is the read-only status observable (connection, character,
// Link, capture, XML) for the ESC menu header. Its text form is also kept
// in `data-status` on the app element for the browser tests.
//
// Live vs replay
// --------------
// A replay (`#replay`, `?fixture=`) runs through the same Session with a
// ReplaySocket. It is never captured: every `conn.state` of a replay
// carries `replay: true` and the Recorder never starts a run for it. A log
// with recorded GMCP (ADR 0016) reaches `playing` from its recorded
// `Char.Name`, so the side panes are active and fill as in the live game; a
// Cockpit log without GMCP stays in `login`. `status.replay` is true
// meanwhile.
//
// Runs (ADR 0018): `runEvents` (src/runs/events.ts) derives the run events
// from the bus and the death lines (a system rule) in every connection,
// replays included, and emits the `◆ KILL/PKILL/DEATH` UI lines; the
// recorder persists them for recorded runs. `app.runs` (LiveRuns) is the
// live run for the ESC menu.
//
// Side panes get a `PaneContext` (src/panes/context.ts) built here: the bus,
// the settings, the cells, a frame scheduler, the session as sender and a
// lazy IndexedDB opener. App also announces the screen settings as
// `view.settings` (at start and on change) for the run capture.
//
// After a replay, or when the page was opened in an offline mode (`?replay`,
// `?fixture=`, `?bench`), Enter on a closed connection does not connect to
// MUME; `#connect` does. After a live disconnect, Enter reconnects.
//
// User scripts (ADR 0051): with a script library (`scripts`), the script
// host (src/scripts/host.ts, a lazy chunk, with the Lua runtime behind it)
// is loaded once any script is enabled, or on the first `#script` / `#lua`
// command. It follows the library from then on. Player Apps run no scripts.
// A small GmcpCache (src/scripts/gmcp-cache.ts) follows the bus from the
// start, so GMCP sent before the host loaded is in the scripts' `gmcp`.
// Script panes go through a RecordingPaneSurface, which emits their
// content as `view.pane` for the run capture (ADR 0053 P1).
//
// Player Apps (ADR 0018, `player: true`): the log player builds an App per
// open (and per backward seek) and `dispose()`s it. Such an App never
// captures, keeps nothing (no clock, pane database or UI ring storage),
// prints no replay `[SYSTEM]` lines (only the login line, which an HTML
// replay can mute per run: `quietLogin`), stamps output rows with their time
// and runs on the player's clock (`now`, `scheduler`, `clockUs`).

import { downloadRun } from '../capture/download';
import { Recorder, type RecorderOptions, STATUS as CAPTURE_STATUS } from '../capture/recorder';
import type { ProfileStore } from '../profiles';
import { type LoadResult, type Scheduler, ScriptEngine, type TypedChange } from '../script/engine';
import { Bus } from '../core/bus';
import { type BusEvents, type Socketish, gmcpKey } from '../core/types';
import type { FetchLike } from '../net/link-probe';
import { ReplaySocket } from '../net/replay-socket';
import { REASON_USER_RECONNECT, Session } from '../net/session';
import { LineAssembler } from '../text/assembler';
import { InputPane } from '../ui/input-pane';
import { CellMetrics } from '../theme/cells';
import { Cockpit } from '../layout/cockpit';
import { type Settings, SettingsStore, viewSnapshot } from '../settings';
import { MapMarkHub } from '../map/marks';
import { createPaneContext, defaultRequestFrame, lazyDb } from '../panes/context';
import { OutputPane } from '../ui/output-pane';
import { ClockStrip } from '../ui/clock-strip';
import { GameState } from '../gmcp/state';
import { AppStatus, type AppStatusView, formatStatus } from './status';
import { ProfileWriteBack } from './writeback';
import { attachUiMessages, uiMsg, uiValue } from './ui-messages';
import { messageRows } from './messages';
import { KEY_ENTER, KEY_MACRO, PerfMonitor } from './perf-monitor';
import { RunEventDeriver } from '../runs/events';
import type { MapPaneHost } from '../map/protocol';
import { LiveRuns } from '../runs/live';
import type { ScriptLibrary } from '../scripts';
import type { ScriptHost } from '../scripts/host';
import { GmcpCache } from '../scripts/gmcp-cache';
import { device } from '../core/device';
import { phoneNawsCols } from '../layout/phone';

/** UI pane warnings for capture states that mean runs are not recorded. */
const CAPTURE_WARNINGS: Readonly<Record<string, string>> = {
  [CAPTURE_STATUS.noDb]: 'Run capture is off: no IndexedDB.',
  [CAPTURE_STATUS.noLocks]: 'Run capture is off: no Web Locks.',
  [CAPTURE_STATUS.anotherTab]: 'Run capture is off: another tab records this character.',
};

/** Reason used when a live or replay connection is closed to start a replay. */
export const REASON_REPLAY_START = 'replay started';
/** Reason used when a replay is closed to go live. */
const REASON_REPLAY_STOP = 'replay stopped';
/** Reason ReplaySocket gives when the log is exhausted. */
const REASON_REPLAY_DONE = 'replay finished';

export interface AppOptions {
  /** Element the app is built into. */
  root: HTMLElement;
  /** Socket factory for live connections (default: the MUME WebSocket). */
  socketFactory?: () => Socketish;
  /**
   * `fetch` for the `Link:` probe (ADR 0030; session.ts `linkFetch`).
   * Default none: `Link:` shows the Core.Ping minimum. The shell passes
   * the browser's; tests and player Apps do not.
   */
  linkFetch?: FetchLike | null;
  /** Recorder options (tests inject the store and locks). */
  recorder?: RecorderOptions;
  /** Frame scheduler for the output pane (tests, benchmark). */
  requestFrame?: (cb: () => void) => void;
  /** Start without a live connection path on Enter (`?replay`, `?fixture=`). */
  offline?: boolean;
  /**
   * Cell metrics (src/theme/cells.ts). The output pane measures NAWS with
   * them and the input caret moves by their width. Default: each pane
   * measures its own font.
   */
  cells?: CellMetrics;
  /**
   * The settings store (pane layout, toggles, colours). Default: an
   * in-memory store with the default settings (unit tests).
   */
  settings?: SettingsStore;
  /** ESC in the input when the output is not scrolled: open the ESC menu (src/app/shell.ts). */
  onEscape?: () => void;
  /**
   * The profile store. The selected profile (`settings.profile`) is loaded
   * into the script engine at start-up and when a live session starts, and
   * runtime variables are written back to it. Default: none (no profile).
   */
  profiles?: ProfileStore;
  /** Timer clock for #ticker / #delay and the timers hub tick (tests). */
  scheduler?: Scheduler;
  /** Write-back debounce in ms (tests). */
  writeBackDelayMs?: number;
  /** Frame scheduler for the side panes (tests). Default requestAnimationFrame. */
  paneRequestFrame?: (cb: () => void) => void;
  /**
   * IndexedDB for the side panes' storage (comm history, timers). Default
   * `globalThis.indexedDB`; null = none.
   */
  paneDb?: IDBFactory | null;
  /**
   * Where the game clock is kept (`wc.clock`). Default
   * `globalThis.localStorage`; null = memory only (tests).
   */
  clockStorage?: Storage | null;
  /** Wall clock in ms for the game state and the clock strip (tests). */
  now?: () => number;
  /** Receive-time clock in µs for lines and sent commands (default `nowUs`). */
  clockUs?: () => number;
  /** A log player App (see the file header). */
  player?: boolean;
  /**
   * What the Map pane loads (ADR 0020): the shell's `MapStore.host()` (the
   * imported map or the bundled one), the HTML replay's embedded subset.
   * Default: the bundled map (`defaultMapHost`).
   */
  map?: MapPaneHost;
  /**
   * The script library (ADR 0051). Enabled scripts run in this App; absent
   * (and in player Apps): no scripts, and `#script` / `#lua` say so.
   */
  scripts?: ScriptLibrary;
  /** Hang-guard storage for the script host (tests; default `localStorage`). */
  scriptStorage?: Storage | null;
  /** The Lua runtime loader for the script host (tests). */
  loadLua?: () => Promise<import('../lua').LuaRuntime>;
}

export class App {
  readonly bus = new Bus();
  readonly el: HTMLDivElement;
  /** Read-only status observable (connection, character, Link, capture, XML). */
  readonly status: AppStatusView;
  private readonly statusImpl: AppStatus;
  readonly assembler: LineAssembler;
  readonly session: Session;
  /** Game pane, docks with the side panes, input line (src/layout/cockpit.ts). */
  readonly cockpit: Cockpit;
  readonly output: OutputPane;
  readonly input: InputPane;
  readonly recorder: Recorder;
  /** The tt++ script engine (ADR 0015). */
  readonly script: ScriptEngine;
  /** Character, group and clock state (src/gmcp/state.ts), shared with the panes. */
  readonly game: GameState;
  /** The input line's day/night clock. */
  readonly clockStrip: ClockStrip;
  /** Run events of the current connection (src/runs/events.ts). */
  readonly runEvents: RunEventDeriver;
  /** The live run for Statistics and Exit with rating (src/runs/live.ts). */
  readonly runs: LiveRuns;
  /** The latency monitor behind `#perf` (ADR 0047); none in a log player. */
  readonly perf: PerfMonitor | null;
  private readonly settings: SettingsStore;
  private readonly profiles: ProfileStore | null;
  private readonly writeBack: ProfileWriteBack | null;
  /** Bumped by every profile load, so a slow store read cannot undo a newer load. */
  private loadToken = 0;
  /** True while a typed line or a macro runs (it may reconnect). */
  private userAction = false;
  /** The current typed line already reconnected or reported "not connected". */
  private userActionHandled = false;

  /** The current (or last) connection is a replay. */
  private replaying = false;
  /** Enter on a closed connection does not connect live. */
  private offline: boolean;
  /** Opens the ESC menu (`#menu`; the shell's `onEscape`). */
  private readonly onEscape: (() => void) | undefined;
  private replayLabel = '';
  private charName = '';
  private fileInput: HTMLInputElement | null = null;
  private viewJson = '';
  private readonly player: boolean;
  /**
   * Player Apps: the current run's login line is not printed (an HTML
   * replay whose export excluded it, ADR 0019 "System lines"). Set by the
   * player host before each run connects.
   */
  quietLogin = false;
  private readonly unsubs: Array<() => void> = [];
  private disposed = false;
  /** Pending `#help` and `#perf` output, in typed order (see `help`). */
  private helpChain: Promise<void> = Promise.resolve();
  private readonly scriptLib: ScriptLibrary | null;
  private readonly scriptOpts: Pick<AppOptions, 'scriptStorage' | 'loadLua'>;
  /** Script map marks (ADR 0057); the Map pane attaches to it. */
  readonly mapMarks = new MapMarkHub();
  private hostP: Promise<ScriptHost> | null = null;
  private hostRef: ScriptHost | null = null;
  /** The last GMCP values for the scripts' `gmcp` table, kept from the start (no Lua). */
  private readonly gmcpCache: GmcpCache | null;

  constructor(opts: AppOptions) {
    const doc = opts.root.ownerDocument;
    const bus = this.bus;
    this.offline = opts.offline ?? false;
    this.onEscape = opts.onEscape;
    const player = (this.player = opts.player ?? false);

    this.el = doc.createElement('div');
    this.el.className = 'wc-app';
    opts.root.appendChild(this.el);

    const now = opts.now ?? Date.now;
    this.statusImpl = new AppStatus(bus);
    // Before the UI lines and the recorder: a kill folded when the run ends
    // is announced before `logged out`, and its `run_end` is derived from
    // the same `conn.state` that seals the run (the recorder copes with
    // either order).
    this.runEvents = new RunEventDeriver({ now, ...(opts.scheduler ? { scheduler: opts.scheduler } : {}) }).attach(bus);
    attachUiMessages(bus);
    this.status = this.statusImpl;
    this.el.dataset.status = formatStatus(this.status.get());
    this.unsubs.push(
      this.status.subscribe((st) => {
        this.el.dataset.status = formatStatus(st);
      }),
    );
    const cells = opts.cells;
    const openDb = lazyDb(player ? null : opts.paneDb);
    this.game = new GameState({
      now,
      storage: player ? null : opts.clockStorage === undefined ? defaultLocalStorage() : opts.clockStorage,
      timers: {
        openDb,
        win: doc.defaultView,
        ...(opts.scheduler ? { scheduler: opts.scheduler } : {}),
      },
    });
    this.assembler = new LineAssembler(bus);
    const perf = (this.perf = player ? null : new PerfMonitor({ win: doc.defaultView as (Window & typeof globalThis) | null }));
    this.session = new Session({
      bus,
      sink: this.assembler,
      ...(opts.socketFactory ? { socketFactory: opts.socketFactory } : {}),
      ...(opts.linkFetch && !player ? { linkFetch: opts.linkFetch } : {}),
      ...(opts.clockUs ? { clockUs: opts.clockUs } : {}),
      onMssp: (vars) => this.game.mssp(vars),
      ...(perf ? { onSend: (bytes: number, buffered: number) => perf.sent(bytes, buffered) } : {}),
    });
    // Before the panes and the script engine: models are current when
    // they react to the same message.
    this.game.attach(bus);
    this.runEvents.shareGroup(this.game);
    this.settings = opts.settings ?? new SettingsStore({ factory: null, storage: null, win: null });
    this.profiles = opts.profiles ?? null;
    // Before the cockpit, so the recorder sees its first `view.size`.
    const recOpts: RecorderOptions = player
      ? { openStore: () => Promise.reject(new Error('player: no capture')), locks: null, win: null }
      : (opts.recorder ?? {});
    this.recorder = new Recorder(bus, {
      events: this.runEvents,
      ...recOpts,
      onStatus: (s) => {
        if (player) return;
        this.statusImpl.set({ capture: s });
        const warn = CAPTURE_WARNINGS[s];
        if (warn) this.bus.emit('ui.message', uiMsg('warn', warn));
        else if (s === CAPTURE_STATUS.error) this.bus.emit('ui.message', uiMsg('error', 'Run capture failed.'));
        recOpts.onStatus?.(s);
      },
    });
    this.announceView();
    this.unsubs.push(this.settings.subscribe(() => this.announceView()));
    const cellSource = cells ?? new CellMetrics({ doc });
    if (!cells) this.unsubs.push(() => (cellSource as CellMetrics).dispose());
    const paneContext = createPaneContext({
      doc,
      bus,
      settings: this.settings,
      cells: cellSource,
      requestFrame: opts.paneRequestFrame ?? defaultRequestFrame,
      sender: this.session,
      connState: () => this.session.state,
      openDb,
      now,
      game: this.game,
      ...(player ? { localStorage: null, sessionStorage: null, player: true } : {}),
      ...(opts.map ? { map: opts.map } : {}),
      ...(player ? {} : { mapMarks: this.mapMarks }),
    });
    this.cockpit = new Cockpit({
      root: this.el,
      settings: this.settings,
      cells: cellSource,
      onFocusInput: () => this.input.focus(),
      paneContext,
    });
    this.output = new OutputPane(bus, this.cockpit.gameEl, {
      scrollback: this.settings.get().output.scrollback,
      onResize: (cols, rows) => this.session.setWindowSize(device().phone ? phoneNawsCols(cols) : cols, rows),
      onFocusInput: () => this.input.focus(),
      ...(perf
        ? { requestFrame: perf.frames(opts.requestFrame ?? ((cb) => void requestAnimationFrame(() => cb()))) }
        : opts.requestFrame
          ? { requestFrame: opts.requestFrame }
          : {}),
      ...(cells ? { cellSize: () => cells.get() } : {}),
      ...(player ? { stampRows: true, wheelScale: 1 } : {}),
    });
    if (perf) perf.output = this.output;
    this.input = new InputPane(bus, this.cockpit.inputEl, {
      sender: this.session,
      output: this.output,
      onCommand: (text) => this.onCommand(text),
      onMacroKey: (key) => this.onMacroKey(key),
      ...(opts.onEscape ? { onEscape: opts.onEscape } : {}),
      ...(cells ? { cellWidth: () => cells.get().w } : {}),
    });
    this.clockStrip = new ClockStrip(this.input.clockEl, { game: this.game, settings: this.settings, now });
    // The scrollback depth and the input line options apply live (ADR 0046, 0063).
    const applyInput = (s: Readonly<Settings>): void => {
      this.input.setAutoClear(s.input.autoClear);
      this.input.setAutosuggest(s.input.autosuggest);
    };
    applyInput(this.settings.get());
    this.unsubs.push(
      this.settings.subscribe((s) => {
        this.output.setScrollback(s.output.scrollback);
        applyInput(s);
      }),
    );
    if (cells) {
      this.unsubs.push(
        cells.subscribe(() => {
          this.output.remeasure();
          this.input.scheduleCaret();
        }),
      );
    }
    // After the recorder: capture sees a line before the commands its
    // actions send.
    this.script = new ScriptEngine({
      send: (text) => this.sendFromScript(text),
      message: (text) => this.sys(text),
      client: (name, args) => this.runClient(name, args),
      onVariable: (name, value) => {
        if (!this.offline) this.writeBack?.queue(name, value);
      },
      onTyped: (change) => this.persistTyped(change),
      // Confirmations and listings (ADR 0039): straight to the pane, as
      // `#help` rows are, so no rule fires on them and nothing records them.
      report: (r) => this.output.pushStyled(messageRows(r, this.output.measureCells().cols)),
      scriptCommand: (name, args) => this.scriptCommand(name, args),
      ...(opts.scheduler ? { scheduler: opts.scheduler } : {}),
    });
    this.script.attach(bus);
    this.game.installRules(this.script.system);
    this.game.timers.installRules(this.script.system);
    this.runEvents.installRules(this.script.system);
    this.runs = new LiveRuns({ deriver: this.runEvents, recorder: this.recorder });
    this.writeBack = this.profiles
      ? new ProfileWriteBack(this.profiles, {
          ...(opts.writeBackDelayMs !== undefined ? { delayMs: opts.writeBackDelayMs } : {}),
          onError: (m) => {
            this.sys(m);
            this.ui('warn', 'The profile was not saved.');
          },
          onRefused: (m) => this.sys(m),
        })
      : null;
    const win = doc.defaultView;
    if (win) {
      win.addEventListener('pagehide', this.onPageHide);
      this.unsubs.push(() => win.removeEventListener('pagehide', this.onPageHide));
    }
    if (this.profiles) void this.loadSelectedProfile(false);
    this.scriptLib = player ? null : (opts.scripts ?? null);
    this.scriptOpts = { scriptStorage: opts.scriptStorage, loadLua: opts.loadLua };
    this.gmcpCache = this.scriptLib ? new GmcpCache() : null;
    if (this.gmcpCache) this.unsubs.push(this.gmcpCache.attach(bus));
    if (this.scriptLib) void this.watchScripts(this.scriptLib);

    bus.on('gmcp', (m) => {
      if (gmcpKey(m) !== 'char.name') return;
      const n = (m.data as { name?: unknown } | undefined)?.name;
      if (typeof n === 'string' && n) this.charName = n;
    });
    bus.on('conn.state', this.onState);
  }

  private readonly onPageHide = (): void => {
    void this.writeBack?.flush();
    void this.scriptLib?.flush();
  };

  /**
   * Tears the App down: the connection (silently), every listener, timer
   * and pane, and its DOM. The log player builds and disposes Apps
   * repeatedly (ADR 0018). The App is not used afterwards.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadToken++;
    this.session.dispose();
    for (const u of this.unsubs.splice(0)) u();
    void this.writeBack?.flush();
    this.hostRef?.dispose();
    void this.scriptLib?.flush();
    this.script.dispose();
    this.perf?.dispose();
    this.runEvents.dispose();
    this.game.dispose();
    this.recorder.dispose();
    this.statusImpl.dispose();
    this.clockStrip.dispose();
    this.input.dispose();
    this.output.dispose();
    this.cockpit.dispose();
    this.fileInput?.remove();
    this.fileInput = null;
    this.bus.clear();
    this.el.remove();
  }

  /** True while the replay socket is the connection. */
  get isReplaying(): boolean {
    return this.replaying && this.isConnected;
  }

  private get isConnected(): boolean {
    const s = this.session.state;
    return s === 'connecting' || s === 'login' || s === 'playing';
  }

  // ------------------------------------------------------------ connecting

  /** Connects to MUME (closing a running replay first). */
  connectLive(): void {
    if (this.isConnected) {
      if (!this.replaying) {
        this.sys('Already connected.');
        return;
      }
      this.session.disconnect(REASON_REPLAY_STOP);
    }
    this.replaying = false;
    this.offline = false;
    this.statusImpl.set({ replay: false });
    this.session.connect();
  }

  /**
   * Replays a Cockpit `.log` (Inv §7.1). `speed` 1 = real time with gaps
   * capped at 2 s, 0 = as fast as possible. Any connection is closed first.
   */
  startReplay(logText: string, label: string, speed = 1): void {
    this.replayOn(new ReplaySocket(logText, { speed }), `${label} (speed ${speed === 0 ? 'max' : speed})`);
  }

  /**
   * Connects a replay socket (session.ts `IsReplay`; the log player's
   * PlayerSocket, one per run of the chain). Any connection is closed first.
   */
  replayOn(socket: Socketish, label: string): void {
    if (this.isConnected) this.session.disconnect(REASON_REPLAY_START);
    this.replaying = true;
    this.offline = true;
    this.replayLabel = label;
    this.statusImpl.set({ replay: true });
    this.session.connect(socket);
  }

  private readonly onState = (s: BusEvents['conn.state']): void => {
    this.input.setLeaveGuard(!this.replaying && (s.state === 'login' || s.state === 'playing'));
    switch (s.state) {
      case 'connecting':
        this.assembler.reset();
        if (!this.player) this.sys(this.replaying ? `Replaying ${this.replayLabel}...` : 'Connecting to MUME...');
        if (!this.replaying && this.profiles) void this.loadSelectedProfile(true);
        break;
      case 'login':
        if (!this.replaying) this.sys('Connected.');
        break;
      case 'playing':
        if (!(this.player && this.quietLogin)) this.sys(`${this.charName || 'Character'} logged in.`);
        break;
      case 'disconnected':
        void this.writeBack?.flush();
        this.onDisconnected(s.reason ?? '');
        break;
    }
  };

  private onDisconnected(reason: string): void {
    if (this.replaying) {
      this.statusImpl.set({ replay: false });
      if (reason === REASON_REPLAY_START || this.player) return;
      if (reason === REASON_REPLAY_STOP) return this.sys('Replay stopped.');
      this.sys(reason === REASON_REPLAY_DONE ? 'Replay finished.' : `Replay stopped: ${reason}`);
      return;
    }
    this.sys(`Connection closed: ${reason || 'unknown reason'}`);
    if (reason !== REASON_USER_RECONNECT && reason !== REASON_REPLAY_START) {
      this.sys('Press Enter to reconnect.');
    }
  }

  // --------------------------------------------------------------- profile

  /**
   * Loads the selected profile from the store into the engine. `announce`
   * reports success (a live session start); problems are always reported.
   */
  async loadSelectedProfile(announce: boolean): Promise<void> {
    const store = this.profiles;
    if (!store) return;
    const token = ++this.loadToken;
    const name = this.settings.get().profile;
    let text: string;
    try {
      // The text must hold everything typed so far (ADR 0038): wait for the
      // write-back, and read again when something was typed meanwhile.
      let rec: Awaited<ReturnType<ProfileStore['get']>>;
      do {
        await this.writeBack?.flush();
        rec = await store.get(name);
      } while (this.writeBack?.busy && token === this.loadToken);
      if (token !== this.loadToken) return;
      if (!rec) {
        if (announce) {
          this.sys(`Profile ${name} not found; no profile loaded.`);
          this.ui('warn', `Profile {${uiValue(name)}} not found.`);
        }
        return;
      }
      text = rec.text;
    } catch (err) {
      if (token === this.loadToken) {
        this.sys(`Profile ${name} could not be read: ${err instanceof Error ? err.message : String(err)}`);
        this.ui('error', `Profile {${uiValue(name)}} could not be read.`);
      }
      return;
    }
    // No await from the read to the load: nothing can be typed in between.
    const r = this.script.loadProfile(text);
    if (!r.ok) {
      // The old rules keep running, but their text cannot be edited safely.
      void this.writeBack?.setTarget(null);
      this.sys(`Profile ${name} not loaded: ${r.reason}`);
      this.ui('error', `Profile {${uiValue(name)}} not loaded.`);
      return;
    }
    void this.writeBack?.setTarget(name);
    this.reportLoad(name, r.warnings, announce);
  }

  private reportLoad(name: string, warnings: readonly string[], announce: boolean): void {
    const v = uiValue(name);
    if (warnings.length === 0) {
      if (announce) {
        this.sys(`Profile ${name} loaded.`);
        this.ui('system', `Profile {${v}} loaded.`);
      }
      return;
    }
    this.ui('warn', `Profile {${v}} loaded with {${warnings.length}} warning${warnings.length === 1 ? '' : 's'}.`);
    this.sys(`Profile ${name} loaded with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}:`);
    const MAX = 10;
    for (const w of warnings.slice(0, MAX)) this.sys('  ' + w);
    if (warnings.length > MAX) this.sys(`  … and ${warnings.length - MAX} more.`);
  }

  /**
   * Replaces the live profile with `text` (the ESC-menu editor's Apply).
   * All or nothing: on failure the running profile stays as it was.
   * Variables set later are written back to the loaded profile.
   */
  applyProfile(text: string): { ok: true; warnings: string[] } | { ok: false; reason: string } {
    this.loadToken++;
    const r: LoadResult = this.script.loadProfile(text);
    const name = uiValue(this.settings.get().profile);
    if (!r.ok) {
      this.ui('error', `Profile {${name}} not applied.`);
      return r;
    }
    // Values queued by the rules that were just replaced are stale.
    this.writeBack?.discard();
    if (this.writeBack && this.writeBack.target === null) void this.writeBack.setTarget(this.settings.get().profile);
    const n = r.warnings.length;
    if (n === 0) this.ui('system', `Profile {${name}} applied.`);
    else this.ui('warn', `Profile {${name}} applied with {${n}} warning${n === 1 ? '' : 's'}.`);
    return { ok: true, warnings: r.warnings };
  }

  // --------------------------------------------------------------- scripts

  /** Loads the script host as soon as a script is enabled (now or later). */
  private async watchScripts(lib: ScriptLibrary): Promise<void> {
    try {
      await lib.init();
    } catch {
      return;
    }
    if (this.disposed) return;
    const check = (): void => {
      if (!this.hostP && lib.list().some((s) => s.enabled)) void this.scriptHost().catch(() => {});
    };
    this.unsubs.push(lib.subscribe(check));
    check();
  }

  /** The script host, loaded and started on first use. */
  scriptHost(): Promise<ScriptHost> {
    const lib = this.scriptLib;
    if (!lib) return Promise.reject(new Error('no script library'));
    const chunks = (): Promise<[typeof import('../scripts/host'), typeof import('../panes/script-surface')]> =>
      Promise.all([import('../scripts/host'), import('../panes/script-surface')]);
    this.hostP ??= chunks().then(async ([{ ScriptHost }, { CockpitPaneSurface, RecordingPaneSurface }]) => {
      if (this.disposed) throw new Error('disposed');
      // The panes' content goes to the run capture (ADR 0053 P1).
      const panes = new RecordingPaneSurface(
        new CockpitPaneSurface(this.cockpit, this.settings, this.cockpit.paneContext),
        (id, snap) => {
          if (!this.disposed) this.bus.emit('view.pane', { id, snap });
        },
      );
      const host = new ScriptHost({
        panes,
        engine: this.script,
        bus: this.bus,
        library: lib,
        game: this.game,
        send: (text) => this.sendFromScript(text),
        print: (rows) => this.output.pushStyled(rows),
        message: (text) => this.sys(text),
        cols: () => this.output.measureCells().cols,
        map: this.mapMarks,
        ...(this.gmcpCache ? { gmcp: this.gmcpCache } : {}),
        ...(this.scriptOpts.scriptStorage !== undefined ? { storage: this.scriptOpts.scriptStorage } : {}),
        ...(this.scriptOpts.loadLua ? { loadRuntime: this.scriptOpts.loadLua } : {}),
      });
      this.hostRef = host;
      await host.start();
      return host;
    });
    this.hostP.catch((err: unknown) => {
      this.hostP = null;
      if (!this.disposed) this.ui('error', `Scripts could not start: ${err instanceof Error ? err.message : String(err)}`);
    });
    return this.hostP;
  }

  /** Whether the script host runs `name`; null before the host has started. */
  scriptRunning(name: string): boolean | null {
    return this.hostRef ? this.hostRef.isRunning(name) : null;
  }

  /** `#script <sub>` and `#lua {script} {function}` from the engine (ADR 0051). */
  private scriptCommand(name: 'script' | 'lua', args: string[]): void {
    if (!this.scriptLib) {
      this.sys(`#${name}: scripts are not available here.`);
      return;
    }
    // A running host answers `#lua` synchronously (a macro's call keeps its order).
    if (this.hostRef) {
      this.hostRef.command(name, args);
      return;
    }
    this.scriptHost().then(
      (h) => h.command(name, args),
      () => {},
    );
  }

  /** Everything queued for the profile write-back is saved when this resolves. */
  flushWriteBack(): Promise<void> {
    return this.writeBack?.flush() ?? Promise.resolve();
  }

  /**
   * A typed definition or `#un…` the engine accepted goes into the stored
   * profile at once (ADR 0038). Not in the offline modes and not before a
   * profile has loaded: then it lasts for the session, and the player is told.
   */
  private persistTyped(change: TypedChange): void {
    if (!this.writeBack) return;
    if (this.offline) this.sys('Not saved to the profile: nothing is saved in offline replay mode.');
    else if (!this.writeBack.typed(change)) this.sys('Not saved to the profile: no profile is loaded.');
  }

  // -------------------------------------------------------------- commands

  /**
   * Input hook: runs a typed line through the script engine (aliases, `;`,
   * `#` commands, client commands). Always handled. While disconnected the
   * first command that would go to the game reconnects instead (or, offline,
   * says how to connect).
   */
  onCommand(text: string): boolean {
    this.userAction = true;
    this.userActionHandled = false;
    this.perf?.keyStart(KEY_ENTER);
    try {
      this.script.input(text);
    } finally {
      this.userAction = false;
      this.perf?.keyEnd();
    }
    return true;
  }

  /** Macro hook: runs the macro for a key; false when none is bound. */
  onMacroKey(key: string): boolean {
    if (!this.script.hasMacro(key)) return false;
    this.userAction = true;
    this.userActionHandled = false;
    this.perf?.keyStart(KEY_MACRO);
    try {
      this.script.runMacro(key);
    } finally {
      this.userAction = false;
      this.perf?.keyEnd();
    }
    return true;
  }

  /** The engine's sender: to the game when connected. */
  private sendFromScript(text: string): void {
    const s = this.session.state;
    if (s !== 'disconnected' && s !== 'idle') {
      this.session.sendCommand(text);
      return;
    }
    // Rules and timers do not reconnect; a typed line or key does, once.
    if (!this.userAction || this.userActionHandled) return;
    this.userActionHandled = true;
    if (this.offline) this.sys('Not connected.');
    else this.connectLive();
  }

  /** Client commands from the engine (`#connect`, `#help` …). */
  private runClient(name: string, argText: string): void {
    const args = argText.split(/\s+/).filter(Boolean);
    switch (name) {
      case 'connect':
        this.connectLive();
        return;
      case 'disconnect':
        if (!this.isConnected) this.sys('Not connected.');
        else this.session.disconnect();
        return;
      case 'reconnect':
        if (this.replaying && this.isConnected) this.session.disconnect(REASON_REPLAY_STOP);
        this.replaying = false;
        this.offline = false;
        this.statusImpl.set({ replay: false });
        this.session.reconnect();
        return;
      case 'runlog':
        void this.runlog();
        return;
      case 'replay': {
        const speed = args[0] === undefined ? 1 : Number(args[0]);
        if (!Number.isFinite(speed) || speed < 0) {
          this.sys('Usage: #replay [speed]   (1 = real time, 0 = max speed)');
          return;
        }
        this.pickReplayFile(speed);
        return;
      }
      case 'help':
        this.help(argText);
        return;
      case 'menu':
        // Opens the ESC menu (all devices; the phone's main way in, ADR 0075).
        this.onEscape?.();
        return;
      case 'perf':
        this.perfCommand(argText);
        return;
      default:
        this.sys(`Unknown command: #${name}`);
    }
  }

  /**
   * `#help [command | topic]` (ADR 0037). The manual is in a lazy chunk, so
   * the rows arrive a moment later; the chain keeps several `#help` in the
   * order they were typed. The rows go straight to the output pane: they
   * are not on the bus, so nothing records them and no rule fires on them.
   */
  private help(argText: string): void {
    this.helpChain = this.helpChain
      .then(() => import('./help-command'))
      .then((m) => {
        if (this.disposed) return;
        const out = m.helpOutput(argText, this.output.measureCells().cols);
        if (typeof out === 'string') this.sys(out);
        else this.output.pushStyled(out);
      })
      .catch((err: unknown) => this.sys(`#help failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  /**
   * `#perf [worst | reset]` (ADR 0047): the latency monitor's summary as
   * rows, like `#help` (not on the bus: not recorded, no rule fires).
   */
  private perfCommand(argText: string): void {
    const perf = this.perf;
    if (!perf) return;
    this.helpChain = this.helpChain
      .then(() => import('./perf-command'))
      .then((m) => {
        if (this.disposed) return;
        const win = this.el.ownerDocument.defaultView;
        const env = { userAgent: win?.navigator.userAgent ?? '', ratio: win?.devicePixelRatio ?? 1 };
        const out = m.perfOutput(argText, perf, env, this.output.measureCells().cols);
        if (typeof out === 'string') this.sys(out);
        else this.output.pushStyled(out);
      })
      .catch((err: unknown) => this.sys(`#perf failed: ${err instanceof Error ? err.message : String(err)}`));
  }

  private async runlog(): Promise<void> {
    try {
      const name = await downloadRun(this.recorder);
      this.sys(name ? `Downloaded ${name}.` : 'No run to download yet.');
    } catch (err) {
      this.sys(`#runlog failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Opens a file picker (Enter is a user gesture) and replays the chosen log. */
  private pickReplayFile(speed: number): void {
    const doc = this.el.ownerDocument;
    this.fileInput?.remove();
    const fi = doc.createElement('input');
    fi.type = 'file';
    fi.accept = '.log,text/plain';
    fi.hidden = true;
    fi.className = 'wc-replay-file';
    fi.addEventListener('change', () => {
      const file = fi.files?.[0];
      fi.remove();
      if (this.fileInput === fi) this.fileInput = null;
      if (!file) return;
      file.text().then(
        (text) => this.startReplay(text, file.name, speed),
        (err: unknown) => this.sys(`Could not read ${file.name}: ${String(err)}`),
      );
    });
    this.fileInput = fi;
    this.el.appendChild(fi);
    fi.click();
  }

  /** Emits `view.settings` when the screen part of the settings changed. */
  private announceView(): void {
    const json = JSON.stringify(viewSnapshot(this.settings.get()));
    if (json === this.viewJson) return;
    this.viewJson = json;
    this.bus.emit('view.settings', { json });
  }

  private sys(text: string): void {
    this.bus.emit('sys.message', { text });
  }

  /** A UI pane line (template: `{value}` parts, src/app/ui-messages.ts). */
  ui(kind: 'system' | 'warn' | 'error', template: string): void {
    this.bus.emit('ui.message', uiMsg(kind, template));
  }
}

function defaultLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
