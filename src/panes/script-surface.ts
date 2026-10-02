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
//
// App builds the surface lazily with the host (a dynamic import), so none
// of this is in the cold-start chunk.

import type { Cockpit } from '../layout/cockpit';
import { type ScriptPanePlace, findFloat, findPane, placeScriptPane } from '../layout/model';
import type { ScriptPaneId } from '../layout/types';
import type { SettingsStore } from '../settings';
import { SCRIPT_PANE_DEFAULTS, paneSettingsOf } from '../settings/types';
import type { PaneContext } from './context';
import type { PaneContent } from './script-content';
import { ScriptPane } from './script-pane';

export interface ScriptPaneSpec {
  id: ScriptPaneId;
  /** Where it goes the first time. */
  place: ScriptPanePlace;
}

export interface ScriptPaneEvents {
  /** A link was clicked (`PaneLink.id`). */
  onLink(id: number): void;
  /** The pane's content size changed (0 × 0 while it is not shown). */
  onResize(cols: number, rows: number): void;
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
}

export interface ScriptPaneSurface {
  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView;
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
    });
    pane.onResize((c, r) => events.onResize(c, r));
    this.open_.set(id, spec.place);
    this.ensurePlaced();
    this.unsub ??= this.settings.subscribe(() => this.ensurePlaced());
    this.cockpit.addPane(pane);
    let closed = false;
    return {
      changed: () => pane.changed(),
      setOn: (on) => {
        if (paneSettingsOf(this.settings.get().panes, id).on === on) return;
        this.settings.update((d) => {
          d.panes[id] = { ...paneSettingsOf(d.panes, id), on };
        });
      },
      isOn: () => paneSettingsOf(this.settings.get().panes, id).on,
      size: () => ({ cols: pane.cols, rows: pane.rows }),
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
        d.panes[id] ??= { ...SCRIPT_PANE_DEFAULTS };
      }
    });
  }
}
