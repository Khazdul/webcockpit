// The panes of a shared run (stage 65, owner's feedback 13; ADR 0155 "As
// built (stage 65, owner's feedback: W3)"). A run posted to the Hall of
// Fame, shared by link or exported as an HTML replay carries the panes
// Map, Timers and Group only, and the replay starts with every pane off:
// the viewer sees the game text and turns a pane on in the Panes popup.
//
// `sharedPayload` is applied twice: by the exporter (`buildReplayPayload`),
// so nothing of another pane leaves the device, and by the replay runtime
// (src/replay/page.ts `openReplay`) on the validated payload, so a schema-1
// payload published before this plays the same way. It is idempotent and
// the result is still schema 1 (an older site plays it, every pane off).
//
// What goes:
// - SPANE records (script panes' content) and every `Comm.*` GMCP record
//   (the Comm pane's channel text and channel list; the game prints the
//   channel lines itself, and those stay);
// - from `settings` and every VIEW record: the panes' entries are every
//   built-in pane with `on: false` (Map, Timers and Group keep their tint,
//   frame and glass; the others get the defaults), no script pane entry;
//   the layout without script panes; the Comm pane's options (the
//   settings' are the defaults, a VIEW's `comm` part goes).
// Pure.

import { RECORD, formatRecord } from '../capture/format';
import { type BuiltinPaneId, PANE_COLORS, PANE_IDS, type PaneColor, type PaneId, isBuiltinPaneId } from '../layout/types';
import type { LayoutModel } from '../layout/types';
import { parseView } from '../player/fit';
import { defaultSettings } from '../settings/types';
import type { PaneSettings, PaneSettingsMap } from '../settings/types';
import { migrateLayout } from '../settings/migrate';
import { captureEntries } from './capture';
import type { ReplaySettings } from './replay-settings';
import type { ReplayPayload } from './payload';

/** The panes a shared run carries, in the Panes popup's order. */
export const SHARED_PANES: readonly BuiltinPaneId[] = ['timers', 'group', 'map'];

const SHARED: ReadonlySet<string> = new Set(SHARED_PANES);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every built-in pane off; the shared ones keep their look from `raw`. No script pane. */
export function sharedPanes(raw: unknown): PaneSettingsMap {
  const d = defaultSettings().panes;
  const src = isObj(raw) ? raw : {};
  const out = {} as PaneSettingsMap;
  for (const id of PANE_IDS) {
    const def: PaneSettings = d[id];
    const x = SHARED.has(id) && Object.hasOwn(src, id) && isObj(src[id]) ? src[id] : {};
    out[id] = {
      on: false,
      color: PANE_COLORS.includes(x.color as PaneColor) ? (x.color as PaneColor) : def.color,
      border: typeof x.border === 'boolean' ? x.border : def.border,
      glass: typeof x.glass === 'boolean' ? x.glass : def.glass,
    };
  }
  return out;
}

/** A valid layout of `raw` without script panes (their ids name the scripts). */
export function sharedLayout(raw: unknown): LayoutModel {
  const l = migrateLayout(raw);
  const drop = new Set<PaneId>();
  for (const dock of Object.values(l.docks)) {
    for (const p of [...dock.head, ...dock.lanes.flatMap((x) => x.panes), ...dock.tail]) if (!isBuiltinPaneId(p.id)) drop.add(p.id);
  }
  for (const f of l.floating) if (!isBuiltinPaneId(f.id)) drop.add(f.id);
  return drop.size > 0 ? migrateLayout(l, drop) : l;
}

/** A shared payload's settings (see the file header). */
export function sharedSettings(s: ReplaySettings): ReplaySettings {
  return { ...s, panes: sharedPanes(s.panes), layout: sharedLayout(s.layout), comm: defaultSettings().comm };
}

/** A VIEW record's JSON as a shared run keeps it, or null when nothing is left. */
export function sharedView(json: string): string | null {
  const v = parseView(json) as Record<string, unknown> | null;
  if (!v) return null;
  const out: Record<string, unknown> = {};
  for (const [k, part] of Object.entries(v)) {
    if (k === 'comm') continue;
    out[k] = k === 'panes' ? sharedPanes(part) : k === 'layout' ? sharedLayout(part) : part;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : null;
}

/** A run's capture text as a shared run keeps it. */
export function sharedRunText(text: string): string {
  let out = '';
  for (const e of captureEntries(text)) {
    if (e.kind === 'spane') continue;
    if (e.kind === 'gmcp' && e.pkg!.toLowerCase().startsWith('comm.')) continue;
    if (e.kind === 'view') {
      const v = sharedView(e.body);
      if (v !== null) out += formatRecord(e.ts, RECORD.view, v);
      continue;
    }
    out += e.line;
  }
  return out;
}

/** `p` as a shared run carries it: Map, Timers and Group only, every pane off (see the file header). */
export function sharedPayload(p: ReplayPayload): ReplayPayload {
  return { ...p, settings: sharedSettings(p.settings), runs: p.runs.map((r) => ({ meta: r.meta, text: sharedRunText(r.text) })) };
}
