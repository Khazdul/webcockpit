// The log player in the app (ADR 0018 "Log player"): History → RUN LOG
// opens a session here (Shell.openPlayer). One `PlayerHost` per open:
//
//   .wc-player                  fills the page; the recorded theme and the
//                               cell size are custom properties on it
//     .wc-player-stage          the window left of the strip
//       .wc-app                 a player App (src/app/app.ts `player: true`)
//     .wc-player-chrome         src/player/view.ts
//
// The engine (src/player/engine.ts) builds the App through `build(clock)`:
// offline, no profile, never captured, on the replay clock, with its own
// settings store (in memory, never saved) holding the viewer's settings;
// VIEW records replace their parts as they pass (src/player/fit.ts), so
// after a seek the settings are those of the latest VIEW before it. The
// stage is the window left of the strip, laid out by the cockpit at the
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
// cross becomes a pane override, as the settings toggle. The control box's gear shows
// the controls (`ViewerControls`, PlayerView).
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

import type { RunLibrary } from '../runs/library';
import type { RunEvent } from '../runs/events';
import type { Session } from '../runs/stitch';
import { type Settings, SettingsStore, type ViewSnapshot } from '../settings';
import { paneSettingsOf } from '../settings/types';
import { PANE_IDS, PANE_LABELS, type PaneId, type ScriptPaneId, isScriptPaneId, isTempPaneId, paneScript } from '../layout/types';
import { PaneContent, type PaneSnapshot } from '../panes/script-content';
import { ScriptPane } from '../panes/script-pane';
import { applyPaneRecord, splitPaneRecord } from '../panes/script-record';
import { applyTheme } from '../theme/apply';
import { DEFAULT_INPUT_COLOR } from '../theme/presets';
import { CellMetrics, devicePixelRatioOf, textGridOf } from '../theme/cells';
import { PlayerEngine, type PlayerTarget, type Wall } from '../player/engine';
import { overlayView, parseView, playerFontSize } from '../player/fit';
import { type PlacedMark, STRIP_COLS, markersOf } from '../player/strip';
import { type ChainRun, type Timeline, type TimelineEdits, buildTimeline, playAtLogUs, scriptPaneIdsOf } from '../player/timeline';
import { PlayerView, type PlayerViewOptions, type ViewerControls, runHeader } from '../player/view';
import {
  VIEWER_FONTS,
  VIEWER_THEMES,
  type ViewerOverrides,
  applyViewer,
  cycle,
  hasLayoutOverride,
  noOverrides,
  resetLayout,
  viewerLabel,
  withLayout,
  withPane,
} from '../player/viewer';
import { commentLines } from '../share/edits';
import type { ReplayClock } from '../player/clock';
import type { MapPaneHost } from '../map/protocol';
import { App } from './app';

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
  view?: Partial<Pick<PlayerViewOptions, 'header' | 'keys' | 'overlay' | 'startHidden' | 'stripHoverTime' | 'boxButtons' | 'onEsc'>>;
  /** Start playing at once (default true). */
  autoplay?: boolean;
  /** Runs whose login system line is not printed (HTML replay `hiddenSys`, ADR 0019). */
  hiddenSys?: readonly number[];
  /** The control box's gear and viewer settings (ADR 0021; default true). */
  viewerSettings?: boolean;
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

  /** Loads a History session's logs and events and starts playing. */
  async open(session: Session, lib: RunLibrary): Promise<void> {
    const ids = session.runs.map((r) => r.runId);
    const [chain, events] = await Promise.all([lib.chainLog(ids), lib.events(ids)]);
    if (this.closed) return;
    this.openChain(chain, events, { character: session.character, level: session.level });
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
  openChain(chain: readonly ChainRun[], events: readonly RunEvent[], info: PlayerInfo, opts: PlayerOpenOptions = {}): void {
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
      ...(this.opts.hideMs !== undefined ? { hideMs: this.opts.hideMs } : {}),
      ...(opts.viewerSettings !== false ? { settings: this.controls() } : {}),
      ...opts.view,
    });
    if (opts.autoplay !== false) engine.play();
  }

  /** Closes the player and tells the shell. */
  close(): void {
    if (this.closed) return;
    this.dispose();
    this.opts.onClose();
  }

  /** Tears everything down (no callback). */
  dispose(): void {
    this.closed = true;
    this.view?.dispose();
    this.view = null;
    this.engineRef?.dispose();
    this.engineRef = null;
    this.ro?.disconnect();
    this.cells.dispose();
    this.el.remove();
  }

  // ------------------------------------------------------------------ App

  private build(clock: ReplayClock): PlayerTarget {
    const gate = new FrameGate();
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    void store.load();
    const base = JSON.parse(JSON.stringify(this.opts.settings.get())) as Settings;
    // The input colour is the player's, never the viewer's (ADR 0035): the
    // recorded VIEW appearance carries it, and a log with no VIEW, or one
    // recorded before the setting existed, plays with the default (Steel).
    base.appearance.inputColor = DEFAULT_INPUT_COLOR;
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
        gate.dispose();
        app.dispose();
        if (this.appRef === app) this.appRef = null;
        if (this.base === base) this.base = null;
        if (this.store === store) this.store = null;
      },
    };
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

  /** The current store := the recorded settings (`base`) with the overrides. */
  private compose(): void {
    const store = this.store;
    const base = this.base;
    if (!store || !base) return;
    const o = this.viewer;
    this.applying = true;
    try {
      // Top-level parts replaced whole (a returned patch would merge, and
      // keep sparse keys such as comm filters that a VIEW dropped).
      store.update((draft) => {
        const d = JSON.parse(JSON.stringify(base)) as Settings;
        applyViewer(d, o);
        Object.assign(draft, d);
      });
    } finally {
      this.applying = false;
    }
  }

  /** The control box's settings section (PlayerView), over this host. */
  private controls(): ViewerControls {
    const on = (id: PaneId): boolean => {
      const s = this.store?.get();
      return s ? paneSettingsOf(s.panes, id).on : false;
    };
    const scriptLabel = (id: ScriptPaneId): string => {
      const shown = this.appRef?.cockpit.scriptPanes().find((p) => p.id === id);
      return `${shown?.title ?? id.slice(id.indexOf('/') + 1)} (${paneScript(id)})`;
    };
    return {
      panes: () => [
        ...PANE_IDS.map((id) => ({ id, label: PANE_LABELS[id] as string, on: on(id) })),
        ...this.scriptIds.map((id) => ({ id, label: scriptLabel(id), on: on(id), wide: true })),
      ],
      togglePane: (id) => this.setViewer(withPane(this.viewer, id as PaneId, !on(id as PaneId))),
      font: () => viewerLabel(this.viewer.font),
      cycleFont: (dir) => this.setViewer({ ...this.viewer, font: cycle(VIEWER_FONTS, this.viewer.font, dir) }),
      theme: () => viewerLabel(this.viewer.theme),
      cycleTheme: (dir) => this.setViewer({ ...this.viewer, theme: cycle(VIEWER_THEMES, this.viewer.theme, dir) }),
      canReset: () => hasLayoutOverride(this.viewer),
      reset: () => this.setViewer(resetLayout(this.viewer)),
    };
  }

  // --------------------------------------------------------------- layout

  /** Theme and cell size from the player settings and the window. */
  private relayout(): void {
    const store = this.store;
    if (!store || this.closed) return;
    const s = store.get();
    applyTheme(s, this.el);
    let a = s.appearance;
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    // The strip's columns are kept free, so it never covers a pane.
    if (W > 0 && H > 0) a = { ...a, size: playerFontSize(a, W, H, STRIP_COLS, devicePixelRatioOf(this.el.ownerDocument), textGridOf(this.el.ownerDocument)) };
    const key = JSON.stringify(a);
    if (key !== this.fitKey) {
      this.fitKey = key;
      void this.cells.update(a);
    }
    this.placeStage();
  }

  /** Sizes the stage: the whole player less the strip's columns on the right. */
  private placeStage(): void {
    const st = this.stage.style;
    const c = this.cells.get();
    st.left = '0';
    st.top = '0';
    st.height = '100%';
    st.width = c.w > 0 ? `${Math.max(0, this.el.clientWidth - STRIP_COLS * c.w)}px` : '100%';
  }
}
