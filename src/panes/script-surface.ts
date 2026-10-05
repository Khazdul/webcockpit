// Where script panes appear (ADR 0053): the script host opens a pane
// through a `ScriptPaneSurface` and edits its `PaneContent`; the surface
// puts a `ScriptPane` on the cockpit and keeps its place in the settings.
//
// - First creation places the pane per its `dock` (end of that dock, or an
//   automatic float) and writes its toggles (on, no tint, framed) when it
//   has none. Later creations find the stored place: the user's placement
//   is remembered per script and pane id.
// - While a pane is open and the layout loses it (Options → Reset layout,
//   repaired settings), it is placed again the same way.
// - `close` takes the pane off the cockpit; its place and toggles stay.
// - A temporary pane (`spec.temporary`, feedback round 1) never touches the
//   settings: the cockpit keeps its place and on/off in memory, its close
//   cross reports `events.onClose` (the host then closes it), and moving
//   it reports `events.onPlace`.
//
// - The pane list (ADR 0065): `states()` is every pane in Options → Panes
//   order (the built-ins, then the running scripts' panes) with its on/off,
//   whether it has a box now and its dock; `setOn` switches any of them;
//   `onStates` is called after every layout (not while a drag runs) and
//   when script panes come or go. A view's `dock()` and `want()` read and
//   ask for its own place and size.
// - `view.wheel(on)` (ADR 0072) turns on reporting the wheel over the pane
//   in whole cells to `events.onWheel` (`pane:onWheel`).
// - `view.hover(on)` (ADR 0065 round 4) turns on reporting the pointer
//   coming over the pane and leaving it to `events.onHover`
//   (`pane:onHover`).
// - A temporary pane can open next to another pane (`temporary.near`) and
//   be a pop-up (`temporary.popup`): a press outside it and that pane, or
//   Esc, closes it as its close cross does (ADR 0065 round 4). Its place
//   is never kept per device.
// - `RecordingPaneSurface` wraps a surface and reports the panes' content
//   for the run capture (`view.pane`, ADR 0053 P1); it forwards the rest.
//
// App builds the surface lazily with the host (a dynamic import), so none
// of this is in the cold-start chunk.

import type { Cockpit } from '../layout/cockpit';
import { type ScriptPanePlace, findFloat, findPane, placeScriptPane, togglePatch, wantPaneSize } from '../layout/model';
import type { TempPaneAt } from '../layout/cockpit';
import { saveTempPlace, tempPlace } from '../layout/temp-places';
import { type DockId, type LayoutModel, PANE_IDS, type PaneId, type ScriptPaneId, isBuiltinPaneId, isScriptPaneId } from '../layout/types';
import type { SettingsStore } from '../settings';
import { SCRIPT_PANE_DEFAULTS, paneSettingsOf } from '../settings/types';
import type { PaneContext } from './context';
import type { PaneContent, PaneSnapshot, PaneTemp } from './script-content';
import { type FieldEvent, ScriptPane } from './script-pane';

export interface ScriptPaneSpec {
  id: ScriptPaneId;
  /** Where it goes the first time (ignored for a temporary pane). */
  place: ScriptPanePlace;
  /**
   * A temporary pane (`<script>/~<id>`): floats at this content size where
   * `at` says (default centred), or where the user last put it on this
   * device; nothing in the settings.
   */
  temporary?: TempPaneSpec;
}

/** A temporary pane's size and place (`createPane{temporary = true, …}`). */
export interface TempPaneSpec {
  rows: number;
  cols: number;
  at?: TempPaneAt;
  group?: { key: string; cols: number };
  /** Opens next to this pane while it has a box (ADR 0065 round 4). */
  near?: PaneId;
  /** A press outside it (and `near`) or Esc closes it as its close cross does. */
  popup?: boolean;
}

export interface ScriptPaneEvents {
  /** A link was clicked (`PaneLink.id`). */
  onLink(id: number): void;
  /** The pane's content size changed (0 × 0 while it is not shown). */
  onResize(cols: number, rows: number): void;
  /** A temporary pane's close cross was clicked: the host closes the view. */
  onClose?(): void;
  /** A temporary pane was moved, resized, shown or hidden (`placement()` changed). */
  onPlace?(): void;
  /** A text field changed, was submitted or cancelled, or got a key (ADR 0055). */
  onField?(id: number, e: FieldEvent): void;
  /**
   * The wheel over the pane in whole cells (positive = right / down) while
   * `view.wheel(true)` is on (ADR 0072). True consumes the event.
   */
  onWheel?(dx: number, dy: number): boolean;
  /** The pointer came over the pane (true) or left it (false) while `view.hover(true)` is on (ADR 0065 round 4). */
  onHover?(inside: boolean): void;
}

/** One open script pane, as the host sees it. */
export interface ScriptPaneView {
  /** The content (or its title) changed: redraw in the next frame. */
  changed(): void;
  /** Switches the pane on or off (`panes[id].on`, as the close cross and Options do). */
  setOn(on: boolean): void;
  /** True when the pane is switched on (it may still lack room). */
  isOn(): boolean;
  /** The content size in cells now (0 × 0 while not shown). */
  size(): { cols: number; rows: number };
  /** Takes the pane away; its place in the settings stays. */
  close(): void;
  /** A temporary pane's size, place and on/off (for runs); undefined for an ordinary pane. */
  placement?(): PaneTemp | undefined;
  /** Focuses text field `id` (selecting its text when `select`), taking the focus from the input line. */
  focusField?(id: number, select: boolean): void;
  /** Where the pane is placed (`float` for a temporary pane; ADR 0065). */
  dock?(): DockId | 'float';
  /**
   * Asks for a content size (`pane:wantSize`, ADR 0065; `wantPaneSize`).
   * The same request again at the same place changes nothing, so a size
   * the player dragged stays until the script asks for another. True when
   * the request applies where the pane is (a side dock, alone in its
   * top/bottom lane, or `cols` given); false for a float.
   */
  want?(rows: number, cols?: number): boolean;
  /** Starts (true) or stops reporting the wheel to `events.onWheel` (`pane:onWheel`, ADR 0072). */
  wheel?(on: boolean): void;
  /** Starts (true) or stops reporting the pointer over the pane to `events.onHover` (`pane:onHover`). */
  hover?(on: boolean): void;
}

/** One pane in the pane list (ADR 0065). */
export interface PaneState {
  id: PaneId;
  /** Switched on (`panes[id].on`). */
  on: boolean;
  /** Has a box in the last layout (on, and room for it). */
  shown: boolean;
  /** Where the settings place it. */
  dock: DockId | 'float';
}

export interface ScriptPaneSurface {
  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView;
  /** Every pane in Options → Panes order: the built-ins, then the running scripts' panes (ADR 0065). */
  states?(): PaneState[];
  /** Switches pane `id` on or off; false when it is not in `states()`. */
  setOn?(id: PaneId, on: boolean): boolean;
  /** Calls `fn` when `states()` may have changed (never during a drag). Returns the unsubscribe. */
  onStates?(fn: () => void): () => void;
}

/** The surface on the app's cockpit. */
export class CockpitPaneSurface implements ScriptPaneSurface {
  private readonly open_ = new Map<ScriptPaneId, ScriptPanePlace>();
  private unsub: (() => void) | null = null;

  constructor(
    private readonly cockpit: Cockpit,
    private readonly settings: SettingsStore,
    private readonly ctx: PaneContext,
  ) {}

  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView {
    const { id } = spec;
    if (this.open_.has(id)) throw new Error(`script pane ${id} is already open`);
    const pane = new ScriptPane(this.ctx, id, {
      content,
      onLink: (n) => events.onLink(n),
      onTitle: () => this.cockpit.paneRetitled(id),
      onField: (n, e) => events.onField?.(n, e),
      onFocusInput: () => this.cockpit.focusInput(),
    });
    pane.onResize((c, r) => events.onResize(c, r));
    if (spec.temporary) return this.openTemp(spec.id, spec.temporary, pane, events);
    this.open_.set(id, spec.place);
    this.ensurePlaced();
    this.unsub ??= this.settings.subscribe(() => this.ensurePlaced());
    this.cockpit.addPane(pane);
    let closed = false;
    let lastWant = '';
    let lastApplies = false;
    return {
      dock: () => placeOf(this.settings.get().layout, id),
      want: (rows, cols) => {
        const s = this.settings.get();
        const at = findPane(s.layout, id);
        if (!at) return false;
        // A spanning pane (ADR 0067) is never alone in a lane: only `cols` applies in the top/bottom dock.
        const alone = typeof at.lane === 'number' && s.layout.docks[at.dock].lanes[at.lane]!.panes.length === 1;
        const side = at.dock === 'left' || at.dock === 'right';
        const key = `${at.dock}|${at.lane}|${alone}|${rows}|${cols ?? ''}`;
        if (key === lastWant) return lastApplies;
        lastWant = key;
        lastApplies = side || alone || cols !== undefined;
        const m = wantPaneSize(s.layout, id, rows, cols, paneSettingsOf(s.panes, id).border);
        if (m !== s.layout) this.settings.update({ layout: m });
        return lastApplies;
      },
      changed: () => pane.changed(),
      setOn: (on) => {
        if (paneSettingsOf(this.settings.get().panes, id).on === on) return;
        this.settings.update((d) => {
          d.panes[id] = { ...paneSettingsOf(d.panes, id), on };
        });
      },
      isOn: () => paneSettingsOf(this.settings.get().panes, id).on,
      size: () => ({ cols: pane.cols, rows: pane.rows }),
      focusField: (n, select) => pane.focusField(n, select),
      wheel: (on) => pane.setWheel(on ? (dx, dy) => events.onWheel?.(dx, dy) ?? false : null),
      hover: (on) => pane.setInsideWatch(on ? (inside) => events.onHover?.(inside) : null),
      close: () => {
        if (closed) return;
        closed = true;
        this.open_.delete(id);
        this.cockpit.removePane(id);
        pane.dispose();
        if (this.open_.size === 0) {
          this.unsub?.();
          this.unsub = null;
        }
      },
    };
  }

  /**
   * A temporary pane: on the cockpit only, nothing in the settings. A
   * rectangle the user gave it is kept per device (temp-places.ts) and used
   * the next time it opens.
   */
  private openTemp(
    id: ScriptPaneId,
    size: TempPaneSpec,
    pane: ScriptPane,
    events: ScriptPaneEvents,
  ): ScriptPaneView {
    // A grouped pane is tiled by the cockpit, which keeps the group's place.
    const grouped = size.group !== undefined;
    // A pane next to another one is placed by the cockpit each time.
    const kept = !grouped && size.near === undefined;
    let closed = false;
    const view: ScriptPaneView = {
      changed: () => pane.changed(),
      setOn: (on) => {
        if (closed || this.cockpit.tempPane(id)?.on === on) return;
        this.cockpit.setTempPane(id, { on });
        events.onPlace?.();
      },
      isOn: () => this.cockpit.tempPane(id)?.on ?? false,
      size: () => ({ cols: pane.cols, rows: pane.rows }),
      focusField: (n, select) => pane.focusField(n, select),
      close: () => {
        if (closed) return;
        closed = true;
        this.cockpit.removePane(id);
        pane.dispose();
      },
      placement: () => tempPlacement(this.cockpit.tempPane(id) ?? { ...size, rect: null, on: false }),
      dock: () => 'float',
      want: () => false,
      wheel: (on) => pane.setWheel(on ? (dx, dy) => events.onWheel?.(dx, dy) ?? false : null),
      hover: (on) => pane.setInsideWatch(on ? (inside) => events.onHover?.(inside) : null),
    };
    this.cockpit.addPane(pane, {
      ...size,
      rect: kept ? tempPlace(id) : null,
      onClose: () => (events.onClose ? events.onClose() : view.close()),
      onPlace: () => {
        const rect = this.cockpit.tempPane(id)?.rect;
        if (rect && kept) saveTempPlace(id, rect);
        events.onPlace?.();
      },
    });
    return view;
  }

  states(): PaneState[] {
    const s = this.settings.get();
    const boxes = new Set(this.cockpit.layout?.panes.map((p) => p.id) ?? []);
    const ids: PaneId[] = [...PANE_IDS, ...this.cockpit.scriptPanes().map((p) => p.id)];
    return ids.map((id) => ({ id, on: paneSettingsOf(s.panes, id).on, shown: boxes.has(id), dock: placeOf(s.layout, id) }));
  }

  setOn(id: PaneId, on: boolean): boolean {
    const known = isBuiltinPaneId(id) || (isScriptPaneId(id) && this.cockpit.scriptPanes().some((p) => p.id === id));
    if (!known) return false;
    const panes = this.settings.get().panes;
    if (paneSettingsOf(panes, id).on !== on) this.settings.update(togglePatch(panes, id, on));
    return true;
  }

  onStates(fn: () => void): () => void {
    const a = this.cockpit.onLayout(() => {
      if (!this.cockpit.dragging) fn();
    });
    const b = this.cockpit.onScriptPanes(fn);
    return () => {
      a();
      b();
    };
  }

  /** Places every open pane the settings do not place (first creation, a reset layout). */
  private ensurePlaced(): void {
    const s = this.settings.get();
    const missing = [...this.open_].filter(
      ([id]) => (findPane(s.layout, id) === null && findFloat(s.layout, id) < 0) || !(id in s.panes),
    );
    if (missing.length === 0) return;
    this.settings.update((d) => {
      for (const [id, place] of missing) {
        d.layout = placeScriptPane(d.layout, id, place);
        d.panes[id] ??= { ...SCRIPT_PANE_DEFAULTS, border: place.border ?? true };
      }
    });
  }
}

/** Where `id` is placed in `m`: its dock, or `float` (also when it has no place yet). */
function placeOf(m: LayoutModel, id: PaneId): DockId | 'float' {
  return findPane(m, id)?.dock ?? 'float';
}

/** A temporary pane's state as runs record it. */
export function tempPlacement(t: { rows: number; cols: number; at?: TempPaneAt; rect: { x: number; y: number; w: number; h: number } | null; on: boolean }): PaneTemp {
  const out: PaneTemp = { rows: t.rows, cols: t.cols };
  if (t.at && t.at !== 'center') out.at = t.at;
  if (t.rect) out.rect = { x: t.rect.x, y: t.rect.y, w: t.rect.w, h: t.rect.h };
  if (!t.on) out.off = true;
  return out;
}

/** Coalescing interval of recorded pane content, ms (one frame). */
export const PANE_RECORD_MS = 16;

/**
 * A surface that reports what its panes show, for the run capture (ADR
 * 0053 P1): `emit(id, snapshot)` at most once per `PANE_RECORD_MS` per
 * changed pane, and `emit(id, null)` when a pane closes. A timer, not an
 * animation frame: frames stop in a hidden tab while the run goes on.
 */
export class RecordingPaneSurface implements ScriptPaneSurface {
  private readonly dirty = new Map<string, { content: PaneContent; view: ScriptPaneView }>();
  private timer: unknown = null;

  states?: () => PaneState[];
  setOn?: (id: PaneId, on: boolean) => boolean;
  onStates?: (fn: () => void) => () => void;

  constructor(
    private readonly inner: ScriptPaneSurface,
    private readonly emit: (id: ScriptPaneId, snap: PaneSnapshot | null) => void,
    private readonly after: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms),
  ) {
    // The pane list goes straight through (ADR 0065).
    if (inner.states) this.states = () => inner.states!();
    if (inner.setOn) this.setOn = (id, on) => inner.setOn!(id, on);
    if (inner.onStates) this.onStates = (fn) => inner.onStates!(fn);
  }

  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView {
    const { id } = spec;
    let closed = false;
    // A temporary pane's place is part of its record: a move marks it too.
    const mark = (): void => {
      if (!closed) this.mark(id, content, view);
    };
    const view = this.inner.open(spec, content, {
      ...events,
      onPlace: () => {
        events.onPlace?.();
        mark();
      },
    });
    mark();
    const out: ScriptPaneView = {
      changed: () => {
        view.changed();
        mark();
      },
      setOn: (on) => view.setOn(on),
      isOn: () => view.isOn(),
      size: () => view.size(),
      close: () => {
        view.close();
        if (closed) return;
        closed = true;
        this.dirty.delete(id);
        this.emit(id, null);
      },
    };
    if (view.placement) out.placement = () => view.placement!();
    if (view.focusField) out.focusField = (n, select) => view.focusField!(n, select);
    if (view.dock) out.dock = () => view.dock!();
    if (view.want) out.want = (rows, cols) => view.want!(rows, cols);
    if (view.wheel) out.wheel = (on) => view.wheel!(on);
    if (view.hover) out.hover = (on) => view.hover!(on);
    return out;
  }

  private mark(id: string, content: PaneContent, view: ScriptPaneView): void {
    this.dirty.set(id, { content, view });
    this.timer ??= this.after(this.flush, PANE_RECORD_MS);
  }

  private readonly flush = (): void => {
    this.timer = null;
    const panes = [...this.dirty];
    this.dirty.clear();
    for (const [id, { content, view }] of panes) {
      const snap = content.snapshot();
      const temp = view.placement?.();
      if (temp) snap.temp = temp;
      this.emit(id as ScriptPaneId, snap);
    }
  };
}
