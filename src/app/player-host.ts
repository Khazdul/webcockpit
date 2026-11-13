// The log player in the app (ADR 0018 "Log player"): History → Run log
// opens a session here (Shell.openRunLog; the host then moves into the Run
// log page in History's big box, src/chrome/frames/run-log.tsx, ADR 0130).
// One `PlayerHost` per open:
//
//   .wc-player                  fills its parent (the box's window, or the
//                               page for Shell.openPlayer); the recorded
//                               theme and the cell size are custom
//                               properties on it; the element the control
//                               box's Fullscreen puts in fullscreen
//     .wc-player-stage          the window left of the rail
//       .wc-app                 a player App (src/app/app.ts `player: true`)
//     .wc-player-chrome         src/player/view.ts
//
// The engine (src/player/engine.ts) builds the App through `build(clock)`:
// offline, no profile, never captured, on the replay clock, with its own
// settings store (in memory, never saved) holding the viewer's settings;
// VIEW records replace their parts as they pass (src/player/fit.ts), so
// after a seek the settings are those of the latest VIEW before it. The
// stage is the window left of the rail, laid out by the cockpit at the
// recorded font size (smaller only when the grid would be below the
// cockpit's minimum): docks keep their recorded cell sizes, the game pane
// takes the rest and the text reflows, as live. SIZE records are not used
// (owner decision 2026-09-28: no letterboxing). The App's output and side
// panes paint through a gate the engine closes while it fast-forwards.
//
// Stage 7 (ADR 0019): `openChain` takes options, so the HTML replay and
// the Spotlights reel use the same host: timeline edits (comments, cuts,
// spotlight windows), their own markers and the view's mode options
// (header, keys, overlay …). The target shows comments as wrapped `## `
// rows and blanks as `.wc-blank` rows in the output pane.
//
// Stage 8 (ADR 0021): the viewer's own choices — font size, colour theme,
// pane on/off and layout (src/player/viewer.ts) — live here, not in a
// player App, so they survive the rebuild of a backward seek. Each App's
// settings are composed as the viewer's settings → the VIEW records so far
// (`base`) → the overrides (`applyViewer`). A layout change the host did
// not make itself is the viewer dragging or resizing in the player
// cockpit; it becomes the layout override. A pane hidden with its close
// cross becomes a pane override, as the settings toggle. The control box's
// Panes and Display popups show the controls (`ViewerControls`, PlayerView;
// ADR 0114); the Spotlights reel gets Display only.
//
// Stage 11 (ADR 0053 P1): SPANE records build the script panes as the
// player saw them, without Lua: a `ScriptPane` per pane id on the
// recorded content (`applyPaneRecord`), added to the player cockpit while
// the run has it. Links are inert (no `onLink`); tooltips show. A run's
// connect drops the previous run's panes (each run starts with the
// present ones in full). Placement and on/off come from the VIEW records;
// the viewer's pane toggles list the script panes of the whole log.
// A temporary pane (`<script>/~<id>`, feedback round 1) carries its size,
// place and on/off in its records (`temp`): it floats where the player saw
// it, is not in the viewer's toggles, and its close cross hides it until
// it goes away. Spotlights hide temporary panes too (`hideTempPanes`).
//
// The player core (stage 42f, ADR 0127): `open` fails (rejects) on a
// session whose logs are not stored or hold nothing, so the shell can say
// why (`PlayerOpenResult`). The view options `hours`, `back` and `bare`
// pass through `opts.view`; a bare view keeps no rail, so the stage takes
// the whole width. `viewerControls(displayOnly)` hands a page its own
// Display controls over the same overrides (the Spotlights viewer, stage
// 46), and `setPaletteTweak` changes ANSI colours while the viewer's
// theme is Default (the Spotlights viewer's brighter red). A host can
// live in any element (`Shell.embedPlayer`): it fills it and follows its
// size.
//
// On a phone or tablet (stage 55): the shell hands in the phone layer's
// module (`PlayerHostOptions.phone`; this file is also bundled into the
// HTML replay and imports nothing of src/phone but types). The player App
// is then built with the phone's game layout over a replay (`phoneReplay`),
// and the font is kept at the recorded size down to the phone layout's
// least grid. The run log player gets the phone layer over each App it
// builds, in its replay mode (lens, strip, Comm read-only, bands; no keys):
// the layer's `phone.*` settings are a store of the host's own, in memory,
// seeded from the viewer's and never written back (the ADR 0021 invariant),
// and what is open in the layer is kept here across the rebuild of a
// backward seek. The control box is docked as a bar where the phone's
// command row is (`PlayerViewOptions.dock`), with Close first as the way
// out: no Back at the top left, no Panes popup. A bare view (the Spotlights
// viewer) gets the layout without a bar and without a layer: the game text
// alone.

import type { RunLibrary } from '../runs/library';
import type { RunEvent } from '../runs/events';
import type { Session } from '../runs/stitch';
import { type Settings, SettingsStore, type ViewSnapshot, defaultPhoneLensWant } from '../settings';
import { paneSettingsOf } from '../settings/types';
import { LIVE_ONLY, PANE_IDS, PANE_LABELS, type PaneId, type ScriptPaneId, isScriptPaneId, isTempPaneId, paneScript } from '../layout/types';
import { PaneContent, type PaneSnapshot } from '../panes/script-content';
import { ScriptPane } from '../panes/script-pane';
import { applyPaneRecord, splitPaneRecord } from '../panes/script-record';
import { applyTheme } from '../theme/apply';
import { LEGACY_INPUT_COLOR } from '../theme/presets';
import { CellMetrics, devicePixelRatioOf, textGridOf } from '../theme/cells';
import { PlayerEngine, type PlayerTarget, type Wall } from '../player/engine';
import { kindTokens } from '../player/icons';
import { overlayView, parseView, playerFontSize } from '../player/fit';
import { type PlacedMark, RAIL_W, markersOf } from '../player/strip';
import { type PlayedRun, type Timeline, type TimelineEdits, buildTimeline, playAtLogUs, scriptPaneIdsOf } from '../player/timeline';
import { type DockRect, PlayerView, type PlayerViewOptions, type ViewerControls, runHeader } from '../player/view';
import type { PhoneControls, PhoneKit, PhoneReplayClear, PhoneReplayDeps, PhoneReplayState } from '../phone';
import {
  type ViewerOverrides,
  applyViewer,
  hasLayoutOverride,
  noOverrides,
  resetLayout,
  themeColors,
  withLayout,
  withPane,
} from '../player/viewer';
import { commentLines } from '../share/edits';
import type { ReplayClock } from '../player/clock';
import type { MapPaneHost } from '../map/protocol';
import { App } from './app';
import { canFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../core/fullscreen';

/**
 * The phone layer's module, handed in by the shell on a phone or tablet
 * (see the file header): its mount, and the kit and controls every mount
 * takes.
 */
export interface PlayerPhone {
  mount(deps: PhoneReplayDeps): { dispose(): void; setClear(clear: PhoneReplayClear): void };
  kit: PhoneKit;
  controls: PhoneControls;
}

export interface PlayerHostOptions {
  /** Parent element (the page root); the player fills it. */
  root: HTMLElement;
  /** The viewer's settings (read, never written). */
  settings: SettingsStore;
  /** ESC: the player closes itself, then this runs (the shell shows History). */
  onClose: () => void;
  /** Wall-time services (tests). */
  wall?: Wall;
  /** Chrome auto-hide delay (tests). */
  hideMs?: number;
  /**
   * The Map pane's map (ADR 0020): the app's current map
   * (`MapStore.host()`, the bytes are reused from memory), or the HTML
   * replay's embedded subset. Default: the bundled map.
   */
  map?: MapPaneHost;
  /** A phone or tablet: the player is laid out as the phone's game (stage 55). Absent: the desktop cockpit. */
  phone?: PlayerPhone;
}

/** What the header shows besides the runs (from the History session). */
export interface PlayerInfo {
  character: string;
  level?: number | undefined;
}

/** Mode options of `openChain` (stage 7; none = the in-app log player). */
export interface PlayerOpenOptions {
  edits?: TimelineEdits;
  /** Markers as playback offsets; default: the events' markers (`markersOf`) on `playAtLogUs`. */
  marks?: (tl: Timeline) => PlacedMark[];
  /** View mode options; `header` and `onEsc` replace the log player's. */
  view?: Partial<
    Pick<
      PlayerViewOptions,
      'header' | 'keys' | 'startHidden' | 'railHoverTime' | 'boxButtons' | 'onEsc' | 'closeTitle' | 'shiftSeek' | 'hours' | 'back' | 'bare'
    >
  >;
  /** Start playing at once (default true). */
  autoplay?: boolean;
  /** Runs whose login system line is not printed (HTML replay `hiddenSys`, ADR 0019). */
  hiddenSys?: readonly number[];
  /** The viewer settings (ADR 0021): Panes and Display (default true), Display only, or none. */
  viewerSettings?: boolean | 'display';
}

/**
 * Phone: what the player's chrome lies over at the layer's right edge, px
 * (`PhoneReplayClear.right`; the stage ends where the rail begins): the
 * rail's target for a finger (10 px, player.css) and a marker of one kind
 * left of the rail (to 24 px). The lens's corner key ends there, so the
 * lens stands as far right as it can with its keys free of both. (A marker
 * of two kinds reaches some 15 px further and lies over the edge of the
 * Comm key while the chrome is shown, where the two meet.)
 */
const PHONE_CLEAR_RIGHT = 24;
/** Phone: the air between the header's chip and the lens's corner key, px. */
const PHONE_HEAD_GAP = 4;

/**
 * The phone layer's settings in a player: the viewer's own, but the lens
 * as it comes, never where the viewer dragged it or the size they gave it
 * in the game (the player's lens has its own default size and corner, and
 * what is moved in a player lasts as long as that player).
 */
export function phoneReplaySettings(viewer: Settings): Settings {
  const mine = JSON.parse(JSON.stringify(viewer)) as Settings;
  mine.phone.lens.portrait = defaultPhoneLensWant();
  mine.phone.lens.landscape = defaultPhoneLensWant();
  return mine;
}

/** Paint gate: frame callbacks wait while it is closed. */
class FrameGate {
  private open = true;
  private queue: Array<() => void> = [];
  private dead = false;

  readonly request = (cb: () => void): void => {
    if (this.dead) return;
    if (this.open) requestAnimationFrame(() => !this.dead && cb());
    else this.queue.push(cb);
  };

  set(on: boolean): void {
    if (on === this.open) return;
    this.open = on;
    if (!on) return;
    const q = this.queue;
    this.queue = [];
    if (q.length) requestAnimationFrame(() => !this.dead && q.forEach((f) => f()));
  }

  dispose(): void {
    this.dead = true;
    this.queue = [];
  }
}

export class PlayerHost {
  readonly el: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly opts: PlayerHostOptions;
  private readonly cells: CellMetrics;
  private engineRef: PlayerEngine | null = null;
  private view: PlayerView | null = null;
  private appRef: App | null = null;
  private store: SettingsStore | null = null;
  private readonly ro: ResizeObserver | null = null;
  private fitKey = '';
  private closed = false;
  private hiddenSys: ReadonlySet<number> = new Set();
  /** The viewer's overrides (ADR 0021), kept across App rebuilds. */
  private viewer: ViewerOverrides = noOverrides();
  /** The current App's recorded settings: the viewer's settings with the VIEW records so far. */
  private base: Settings | null = null;
  /** The host is writing the player store (not the viewer's drag). */
  private applying = false;
  /** Script pane ids with records in the open log (the viewer's toggles). */
  private scriptIds: ScriptPaneId[] = [];
  /** Temporary script panes are not shown (Spotlights). */
  private tempHidden = false;
  /** Drops the temporary panes the current build shows. */
  private dropTemps: () => void = () => {};
  /** Run when the host is disposed (a mode's own layers, ADR 0110). */
  private readonly disposers: Array<() => void> = [];
  /** ANSI colours over the recorded ones while the viewer's theme is Default (`setPaletteTweak`). */
  private tweak: Readonly<Record<number, string>> | null = null;
  /** Px kept free at the right for the rail (none for a bare view). */
  private railW = RAIL_W;
  /** Phone (`opts.phone`): the open chain has the docked bar and the phone layer (not a bare view). */
  private phoneBar = false;
  /** Phone: the layer's own settings (`phone.*`), in memory, kept across App rebuilds; made at the first mount. */
  private phoneStore: SettingsStore | null = null;
  /** Phone: what is open in the layer, kept across App rebuilds. */
  private phoneState: PhoneReplayState | undefined;
  /** Phone: the docked bar's rectangle in the player's px (the command row's place), or null. */
  private dock: DockRect | null = null;
  /** Phone: what the chrome lies over at the layer's edges, as last told to the layer. */
  private phoneClear: PhoneReplayClear = { right: PHONE_CLEAR_RIGHT, plate: null };
  /** Phone: the top left corner of the lens with its keys (or of its key row), px of the cockpit; null: neither. */
  private phoneTopRight: { left: number; top: number } | null = null;

  constructor(opts: PlayerHostOptions) {
    this.opts = opts;
    const doc = opts.root.ownerDocument;
    this.el = doc.createElement('div');
    this.el.className = 'wc-player';
    this.stage = doc.createElement('div');
    this.stage.className = 'wc-player-stage';
    this.el.appendChild(this.stage);
    opts.root.appendChild(this.el);
    this.cells = new CellMetrics({ doc, root: this.el });
    this.cells.subscribe(() => this.placeStage());
    // The control box's Fullscreen icon follows the page's state.
    this.disposers.push(onFullscreenChange(() => this.view?.refresh(), doc));
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.relayout());
      this.ro.observe(this.el);
    }
  }

  /** The engine (tests, the dev hook). */
  get engine(): PlayerEngine | null {
    return this.engineRef;
  }

  /** The current player App (it changes on a backward seek). */
  get app(): App | null {
    return this.appRef;
  }

  /**
   * Loads a History session's logs and events and starts playing (`opts`:
   * the mode, as `openChain`). Rejects when the logs cannot be read, are
   * not stored, or hold nothing to play.
   */
  async open(session: Session, lib: RunLibrary, opts: PlayerOpenOptions = {}): Promise<void> {
    const ids = session.runs.map((r) => r.runId);
    const [chain, events] = await Promise.all([lib.chainLog(ids), lib.events(ids)]);
    if (this.closed) return;
    if (chain.length === 0) throw new Error('The run log is not stored.');
    if (chain.every((r) => r.text.length === 0)) throw new Error('The run log is empty.');
    this.openChain(chain, events, { character: session.character, level: session.level }, opts);
  }

  /** Script pane ids with records in the open log, in order of appearance. */
  get scriptPaneIds(): readonly ScriptPaneId[] {
    return this.scriptIds;
  }

  /** Shows no temporary script panes from now on (Spotlights). */
  hideTempPanes(): void {
    this.tempHidden = true;
    this.dropTemps();
  }

  /** The player view (stage 7 modes: refresh, cursor). */
  get playerView(): PlayerView | null {
    return this.view;
  }

  /**
   * Starts playing `chain` (oldest run first) with the chain's events for
   * the markers. `opts` configures another mode (HTML replay, Spotlights).
   */
  openChain(chain: readonly PlayedRun[], events: readonly RunEvent[], info: PlayerInfo, opts: PlayerOpenOptions = {}): void {
    // A reel rebuilt for new settings opens again on the same host (ADR 0110).
    this.clearChain();
    const railW = opts.view?.bare ? 0 : RAIL_W;
    if (railW !== this.railW) {
      this.railW = railW;
      this.fitKey = '';
    }
    this.phoneBar = this.opts.phone !== undefined && !opts.view?.bare;
    this.dock = null;
    const tl = buildTimeline(chain, opts.edits);
    this.scriptIds = scriptPaneIdsOf(tl).filter(isScriptPaneId);
    this.hiddenSys = new Set(opts.hiddenSys ?? []);
    const engine = new PlayerEngine({
      timeline: tl,
      build: (clock) => this.build(clock),
      ...(this.opts.wall ? { wall: this.opts.wall } : {}),
    });
    this.engineRef = engine;
    const marks = opts.marks
      ? opts.marks(tl)
      : markersOf(events).map((m) => ({ letter: m.letter, offset: playAtLogUs(tl, m.us), tip: m.tip }));
    const onEsc = (): void => this.close();
    // Fullscreen in the control box (the run log player) where the page has
    // it; the HTML replay passes its own (with its F key) in `opts.view`. Not
    // on a phone or tablet: it has the corner button (ADR 0097), and the bar
    // has no room for one more key at 360 px. It puts the player's own
    // element in fullscreen (stage 45 owner feedback, ADR 0130): the player
    // in History's box then fills the screen, and any way out of the
    // browser's fullscreen (the button, Esc, F11) puts it back in the box;
    // closing the player removes the element, which leaves fullscreen.
    const doc = this.el.ownerDocument;
    const fsEl = this.el;
    const fullscreen = canFullscreen(doc) && !this.opts.phone
      ? [
          {
            label: () => (isFullscreen(doc, fsEl) ? 'Exit fullscreen' : 'Fullscreen'),
            icon: () => (isFullscreen(doc, fsEl) ? ('fullscreenExit' as const) : ('fullscreen' as const)),
            onClick: () => void toggleFullscreen(doc, fsEl),
          },
        ]
      : [];
    // The docked bar's first key is the way out: a Back at the top left would lie on an open strip or Comm.
    const modeView = { ...opts.view };
    if (this.phoneBar) delete modeView.back;
    this.view = new PlayerView({
      root: this.el,
      engine,
      marks,
      header: (run) => {
        const r = tl.runs[run]?.meta;
        return runHeader(
          {
            character: info.character,
            level: r?.summary?.level ?? info.level,
            run,
            runs: tl.runs.length,
            startUs: r ? (r.summary?.startUs ?? r.startedUs) : 0,
          },
          onEsc,
        );
      },
      output: () => this.appRef?.output ?? null,
      cells: () => this.cells.get(),
      onEsc,
      closeTitle: 'Back to History (Esc)',
      ...(this.opts.hideMs !== undefined ? { hideMs: this.opts.hideMs } : {}),
      // The docked bar has Display only: pane toggles and Reset layout mean nothing in the phone's layout.
      ...(opts.viewerSettings !== false ? { settings: this.viewerControls(opts.viewerSettings === 'display' || this.phoneBar) } : {}),
      boxButtons: fullscreen,
      ...modeView,
      ...(this.phoneBar ? { dock: () => this.dock } : {}),
    });
    if (opts.autoplay !== false) engine.play();
  }

  /** Closes the player and tells the shell. */
  close(): void {
    if (this.closed) return;
    this.dispose();
    this.opts.onClose();
  }

  /** Stops what plays: the view, the engine and its App go; the host stays open. */
  clearChain(): void {
    this.view?.dispose();
    this.view = null;
    this.engineRef?.dispose();
    this.engineRef = null;
  }

  /** Runs `fn` when the host is disposed (closed or torn down). */
  onDispose(fn: () => void): void {
    this.disposers.push(fn);
  }

  /** True once the host is disposed. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Tears everything down (no callback). */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearChain();
    this.ro?.disconnect();
    this.cells.dispose();
    this.el.remove();
    for (const fn of this.disposers.splice(0)) fn();
  }

  // ------------------------------------------------------------------ App

  private build(clock: ReplayClock): PlayerTarget {
    const gate = new FrameGate();
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    void store.load();
    const base = JSON.parse(JSON.stringify(this.opts.settings.get())) as Settings;
    // The input colour is the player's, never the viewer's (ADR 0035): the
    // recorded VIEW appearance carries it, and a log with no VIEW, or one
    // recorded before the setting existed, plays with the default of that time (Steel).
    base.appearance.inputColor = LEGACY_INPUT_COLOR;
    this.base = base;
    this.store = store;
    this.compose();
    const app = new App({
      root: this.stage,
      player: true,
      offline: true,
      settings: store,
      cells: this.cells,
      scheduler: clock,
      now: () => clock.now(),
      clockUs: () => clock.nowUs(),
      requestFrame: gate.request,
      paneRequestFrame: gate.request,
      ...(this.opts.map ? { map: this.opts.map } : {}),
      ...(this.opts.phone ? { phoneReplay: { bar: this.phoneBar } } : {}),
    });
    this.appRef = app;
    const unsub = store.subscribe((next, prev) => {
      if (!this.applying && this.store === store) {
        let viewer = this.viewer;
        // The viewer moved or resized a pane in the player cockpit.
        if (JSON.stringify(next.layout) !== JSON.stringify(prev.layout)) viewer = withLayout(viewer, next.layout);
        // The viewer hid a pane with its close cross: as the settings toggle.
        for (const id of Object.keys(next.panes) as PaneId[]) {
          const on = next.panes[id]?.on;
          if (on !== undefined && on !== prev.panes[id]?.on) viewer = withPane(viewer, id, on);
        }
        if (viewer !== this.viewer) {
          this.viewer = viewer;
          this.view?.refresh();
        }
      }
      this.relayout();
    });
    this.relayout();
    const dropPhone = this.phoneBar ? this.mountPhone(app) : () => {};
    // Script panes (ADR 0053 P1): the recorded content, drawn without Lua.
    const spanes = new Map<ScriptPaneId, { snap: PaneSnapshot; pane: ScriptPane; closed?: boolean }>();
    const dropPane = (id: ScriptPaneId): void => {
      const p = spanes.get(id);
      if (!p) return;
      spanes.delete(id);
      app.cockpit.removePane(id);
      p.pane.dispose();
    };
    this.dropTemps = () => {
      for (const id of [...spanes.keys()]) if (isTempPaneId(id)) dropPane(id);
    };
    const spane = (body: string): void => {
      const rec = splitPaneRecord(body);
      if (!rec) return;
      const temp = isTempPaneId(rec.id);
      if (!temp && !isScriptPaneId(rec.id)) return;
      if (temp && this.tempHidden) return;
      const id = rec.id as ScriptPaneId;
      const cur = spanes.get(id);
      const snap = applyPaneRecord(cur?.snap ?? null, rec.json);
      if (!snap) return dropPane(id);
      // A temporary pane's place and on/off (the size of a new one if the record lacks it).
      const t = snap.temp ?? { rows: 8, cols: 30 };
      if (cur) {
        cur.snap = snap;
        cur.pane.model.load(snap);
        cur.pane.changed();
        if (temp) app.cockpit.setTempPane(id, { on: !t.off && !cur.closed, rect: t.rect ?? null });
        return;
      }
      const pane = new ScriptPane(app.cockpit.paneContext, id, {
        content: PaneContent.fromSnapshot(snap),
        onTitle: () => app.cockpit.paneRetitled(id),
      });
      const entry: { snap: PaneSnapshot; pane: ScriptPane; closed?: boolean } = { snap, pane };
      spanes.set(id, entry);
      if (temp) {
        app.cockpit.addPane(pane, {
          rows: t.rows,
          cols: t.cols,
          ...(t.at ? { at: t.at } : {}),
          rect: t.rect ?? null,
          on: !t.off,
          // The viewer's close cross hides it until it goes away.
          onClose: () => {
            entry.closed = true;
            app.cockpit.setTempPane(id, { on: false });
          },
        });
        return;
      }
      app.cockpit.addPane(pane);
      this.view?.refresh();
    };
    return {
      connect: (sock, run) => {
        // Each run writes its present panes at its start.
        for (const id of [...spanes.keys()]) dropPane(id);
        app.quietLogin = this.hiddenSys.has(run);
        app.replayOn(sock, `run ${run + 1}`);
      },
      spane,
      view: (json) => {
        const v = parseView(json);
        if (!v) return;
        overlayView(base, v as Partial<ViewSnapshot>);
        // A VIEW recorded before the input colour was a setting (ADR 0035): it was Steel then,
        // whatever today's default is (Amber since 2026-11-12).
        const look = (v as { appearance?: Record<string, unknown> }).appearance;
        if (look && !('inputColor' in look)) base.appearance.inputColor = LEGACY_INPUT_COLOR;
        if (this.base === base) this.compose();
      },
      // The recorded size is not used: the player fills the viewer's window.
      size: () => {},
      paint: (on) => gate.set(on),
      comment: (text) => {
        // A leading comment would sit under the player header row.
        if (app.output.empty) app.output.pushRows('blank', ['']);
        app.output.pushRows('comment', commentLines(text), clock.nowUs());
      },
      blank: (lines) => app.output.pushRows('blank', new Array<string>(Math.max(0, lines)).fill('')),
      dispose: () => {
        unsub();
        dropPhone();
        gate.dispose();
        app.dispose();
        if (this.appRef === app) this.appRef = null;
        if (this.base === base) this.base = null;
        if (this.store === store) this.store = null;
      },
    };
  }

  // ---------------------------------------------------------------- phone

  /**
   * The phone layer over `app`'s cockpit, in its replay mode (see the file
   * header), and the docked bar's rectangle after each of the cockpit's
   * layouts. Returns what takes both away again.
   */
  private mountPhone(app: App): () => void {
    const phone = this.opts.phone!;
    const layer = phone.mount({
      kit: phone.kit,
      controls: phone.controls,
      cockpit: app.cockpit,
      game: app.game,
      cells: this.cells,
      settings: this.phoneSettings(),
      replay: {
        // The pages that show the live session, not the recording (Statistics).
        omitPages: [...LIVE_ONLY],
        clear: this.phoneClear,
        state: this.phoneState,
        onState: (s) => {
          this.phoneState = s;
        },
        // (The layer places before `measure` below runs, at every layout.)
        onTopRight: (at) => {
          this.phoneTopRight = at;
        },
      },
    });
    const measure = (): void => {
      if (this.appRef !== app) return;
      // A plate over the player's top edge (it was moved into History's box): the lens goes under it, in one more layout.
      const clear = this.clearOf(app);
      if (JSON.stringify(clear) !== JSON.stringify(this.phoneClear)) {
        this.phoneClear = clear;
        layer.setClear(clear);
      }
      const next = this.dockRect(app);
      if (JSON.stringify(next) === JSON.stringify(this.dock)) return;
      this.dock = next;
      this.view?.refresh();
    };
    const off = app.cockpit.onLayout(measure);
    measure();
    return () => {
      off();
      layer.dispose();
    };
  }

  /**
   * The layer's settings: a copy of the viewer's, in memory, without the
   * lens's place and size from the game (`phoneReplaySettings`); a band's
   * height and a lens moved in the player last while the host does.
   */
  private phoneSettings(): SettingsStore {
    if (this.phoneStore) return this.phoneStore;
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    void store.load();
    const mine = phoneReplaySettings(this.opts.settings.get());
    store.update((draft) => {
      Object.assign(draft, mine);
    });
    return (this.phoneStore = store);
  }

  /**
   * The command row's place in `app`'s cockpit, in the player's px: from
   * its left edge to the player's right and bottom edges (the rail ends
   * above the bar, so the bar has its width too; the cockpit's whole cells
   * end a little short of the bottom edge).
   * Null while the cockpit lays out no command row (too small, not shown).
   */
  private dockRect(app: App): DockRect | null {
    const input = app.cockpit.inputEl;
    if (app.cockpit.el.hasAttribute('data-too-small') || input.offsetHeight < 1 || input.offsetWidth < 1) return null;
    let left = 0;
    let top = 0;
    for (let el: HTMLElement | null = input; el && el !== this.el; el = el.offsetParent as HTMLElement | null) {
      left += el.offsetLeft;
      top += el.offsetTop;
    }
    const width = this.el.clientWidth - left;
    const height = this.el.clientHeight - top;
    if (!(width > 0 && height > 0)) return null;
    // The header's row ends left of the lens's corner key (or its key row) where that stands in the row.
    const at = this.phoneTopRight;
    const cock = app.cockpit.el;
    const headRight = at && at.top < this.cells.get().h ? Math.max(0, cock.offsetLeft + at.left - PHONE_HEAD_GAP) : null;
    return { left, top, width, height, ...(headRight !== null ? { headRight } : {}) };
  }

  /**
   * Phone: what lies over `app`'s cockpit at its edges (`PhoneReplayClear`):
   * the rail and its markers, and the hood plate of a box the player
   * stands in (History's Run log), which hangs over the player's top edge.
   */
  private clearOf(app: App): PhoneReplayClear {
    const hood = this.el.closest('.wc-lk-box')?.querySelector<HTMLElement>(':scope > .wc-lk-hood') ?? null;
    if (!hood) return { right: PHONE_CLEAR_RIGHT, plate: null };
    const h = hood.getBoundingClientRect();
    const c = app.cockpit.el.getBoundingClientRect();
    const bottom = Math.ceil(h.bottom - c.top);
    const right = Math.ceil(h.right - c.left);
    return { right: PHONE_CLEAR_RIGHT, plate: h.width > 0 && bottom > 0 && right > 0 ? { right, bottom } : null };
  }

  // --------------------------------------------------------------- viewer

  /** The viewer's overrides (tests). */
  get viewerOverrides(): Readonly<ViewerOverrides> {
    return this.viewer;
  }

  /** Replaces the overrides and recomposes the current App's settings. */
  setViewer(o: ViewerOverrides): void {
    this.viewer = o;
    this.compose();
    this.view?.refresh();
  }

  /**
   * ANSI colours (index 0–15 → `#rrggbb`) drawn over the recorded palette
   * while the viewer's theme is Default; a chosen theme keeps its own
   * colours. null: none. The Spotlights viewer's brighter red (stage 46).
   */
  setPaletteTweak(t: Readonly<Record<number, string>> | null): void {
    this.tweak = t && Object.keys(t).length > 0 ? { ...t } : null;
    this.compose();
    this.view?.refresh();
  }

  /** The current store := the recorded settings (`base`) with the overrides. */
  private compose(): void {
    const store = this.store;
    const base = this.base;
    if (!store || !base) return;
    const o = this.viewer;
    const tweak = o.theme === 'default' ? this.tweak : null;
    this.applying = true;
    try {
      // Top-level parts replaced whole (a returned patch would merge, and
      // keep sparse keys such as comm filters that a VIEW dropped).
      store.update((draft) => {
        const d = JSON.parse(JSON.stringify(base)) as Settings;
        applyViewer(d, o);
        if (tweak) {
          const ansi = d.appearance.ansi.slice();
          for (const [i, c] of Object.entries(tweak)) {
            const k = Number(i);
            if (Number.isInteger(k) && k >= 0 && k < ansi.length) ansi[k] = c;
          }
          d.appearance.ansi = ansi;
        }
        Object.assign(draft, d);
      });
    } finally {
      this.applying = false;
    }
  }

  /**
   * The viewer settings over this host (ADR 0021): the control box's
   * popups (PlayerView), or a page's own Display controls (the Spotlights
   * viewer). `displayOnly`: font and colours, no Panes. They change the
   * host's overrides, so they hold across the chains it plays.
   */
  viewerControls(displayOnly: boolean): ViewerControls {
    const panes = !displayOnly;
    const on = (id: PaneId): boolean => {
      const s = this.store?.get();
      return s ? paneSettingsOf(s.panes, id).on : false;
    };
    const scriptLabel = (id: ScriptPaneId): string => {
      const shown = this.appRef?.cockpit.scriptPanes().find((p) => p.id === id);
      return `${shown?.title ?? id.slice(id.indexOf('/') + 1)} (${paneScript(id)})`;
    };
    return {
      ...(panes
        ? {
            panes: {
              list: () => [
                ...PANE_IDS.filter((id) => !LIVE_ONLY.has(id)).map((id) => ({ id, label: PANE_LABELS[id] as string, on: on(id) })),
                ...this.scriptIds.map((id) => ({ id, label: scriptLabel(id), on: on(id), wide: true })),
              ],
              toggle: (id: string) => this.setViewer(withPane(this.viewer, id as PaneId, !on(id as PaneId))),
              canReset: () => hasLayoutOverride(this.viewer),
              reset: () => this.setViewer(resetLayout(this.viewer)),
            },
          }
        : {}),
      font: () => this.viewer.font,
      setFont: (font) => this.setViewer({ ...this.viewer, font }),
      theme: () => this.viewer.theme,
      setTheme: (theme) => this.setViewer({ ...this.viewer, theme }),
      // Default: the recorded background (the viewer's own before any VIEW).
      swatch: (t) => themeColors(t)?.bg ?? this.base?.appearance.bg ?? this.opts.settings.get().appearance.bg,
    };
  }

  // --------------------------------------------------------------- layout

  /** Theme and cell size from the player settings and the window. */
  private relayout(): void {
    const store = this.store;
    if (!store || this.closed) return;
    const s = store.get();
    applyTheme(s, this.el);
    for (const [k, v] of Object.entries(kindTokens(s.appearance.bg))) this.el.style.setProperty(k, v);
    let a = s.appearance;
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    // The rail's width is kept free, so it never covers a pane.
    // On a phone the layout's least grid is the phone's: the recorded size is kept far longer.
    const phone = this.opts.phone;
    const min = phone ? { cols: phone.kit.minCols, rows: phone.kit.minRows } : undefined;
    if (W > 0 && H > 0) a = { ...a, size: playerFontSize(a, W, H, this.railW, devicePixelRatioOf(this.el.ownerDocument), textGridOf(this.el.ownerDocument), min) };
    const key = JSON.stringify(a);
    if (key !== this.fitKey) {
      this.fitKey = key;
      void this.cells.update(a);
    }
    this.placeStage();
  }

  /** Sizes the stage: the whole player less the rail on the right (a bare view: all of it). */
  private placeStage(): void {
    const st = this.stage.style;
    st.left = '0';
    st.top = '0';
    st.height = '100%';
    st.width = this.railW > 0 ? `calc(100% - ${this.railW}px)` : '100%';
  }
}
