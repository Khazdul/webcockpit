// Loading stored settings safely (Inv §3.1 lesson: one default object
// fills missing keys on upgrade). `migrateSettings` accepts anything —
// an old version, a partial object, garbage — and always returns a
// complete, valid `Settings`: missing or invalid values take the
// default, numbers are clamped, enums checked, colours normalised, and a
// damaged layout is repaired so every pane appears exactly once. Script
// panes (ADR 0053) keep their well-formed entries in `panes` and the
// layout, so they return where they were when their script runs again. Keys
// that are no longer part of `Settings` (e.g. `corners`, removed after the
// stage 2 feedback) are dropped silently.

import {
  DEFAULT_PANE_DESIRED,
  DOCK_IDS,
  type DockLane,
  type DockPane,
  type LayoutModel,
  PANE_COLORS,
  PANE_IDS,
  type PaneId,
  appendToDock,
  defaultDockSize,
  defaultMapFloat,
  defaultPaneRows,
  isPaneId,
  isScriptPaneId,
  normalizeDock,
} from '../layout/types';
import { defaultFloatSize } from '../layout/allocate';
import { isNamedMapBg } from '../map/backgrounds';
import { TILESET_IDS } from '../map/tilesets';
import { normalizeHex } from '../theme/color';
import { INPUT_COLOR_IDS } from '../theme/presets';
import {
  type AppearanceSettings,
  COMM_FILTERS_MAX,
  COMM_FILTER_KEY_MAX,
  type CommSettings,
  CURSOR_STYLES,
  GROUP_NPC_MODES,
  type GroupSettings,
  FONT_IDS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type InputSettings,
  MAP_HOVER_MODES,
  MAP_HOVER_SIZES,
  type MapperSettings,
  PADDING_MAX,
  PADDING_MIN,
  PADDING_STEP,
  type OutputSettings,
  type PaneSettings,
  type PaneSettingsMap,
  SCRIPT_PANE_DEFAULTS,
  SCROLLBACK_CHOICES,
  SETTINGS_VERSION,
  type Settings,
  type SpotlightSettings,
  TIMER_COLOR_ORDER,
  TIMER_COLS_MIN,
  type TimersSettings,
  defaultSettings,
  defaultTimersSettings,
  timerColsMax,
  LEGACY_APPEARANCE,
} from './types';
import { TIMER_GROUPS } from '../timers/entry';

/** Largest dock size / desired value kept, in cells (a sanity bound only). */
export const MAX_CELLS = 1000;
/** Most script pane entries kept in `panes` and in the layout (a sanity bound only). */
export const MAX_SCRIPT_PANES = 200;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function oneOf<T>(v: unknown, allowed: readonly T[], dflt: T): T {
  return allowed.includes(v as T) ? (v as T) : dflt;
}

function int(v: unknown, lo: number, hi: number, dflt: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

function bool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}

function hex(v: unknown, dflt: string): string {
  return normalizeHex(v) ?? dflt;
}

/** The pre-ADR 0078 appearance defaults (src/settings/types.ts). */
export { LEGACY_APPEARANCE };

/** A complete, valid appearance from anything (see `LEGACY_APPEARANCE`). */
export function migrateAppearance(raw: unknown): AppearanceSettings {
  const d = isObj(raw) ? { ...defaultSettings().appearance, ...LEGACY_APPEARANCE } : defaultSettings().appearance;
  const a = isObj(raw) ? raw : {};
  const ansiRaw = Array.isArray(a.ansi) ? a.ansi : [];
  let padding = int(a.padding, PADDING_MIN, PADDING_MAX, d.padding);
  padding -= padding % PADDING_STEP;
  return {
    font: oneOf(a.font, FONT_IDS, d.font),
    size: int(a.size, FONT_SIZE_MIN, FONT_SIZE_MAX, d.size),
    padding,
    fg: hex(a.fg, d.fg),
    bg: hex(a.bg, d.bg),
    ansi: d.ansi.map((c, i) => hex(ansiRaw[i], c)),
    cursorStyle: oneOf(a.cursorStyle, CURSOR_STYLES, d.cursorStyle),
    cursorBlink: bool(a.cursorBlink, d.cursorBlink),
    inputColor: oneOf(a.inputColor, INPUT_COLOR_IDS, d.inputColor),
    boldBright: bool(a.boldBright, d.boldBright),
  };
}

function paneEntry(raw: unknown, d: Readonly<PaneSettings>): PaneSettings {
  const x = isObj(raw) ? raw : {};
  return { on: bool(x.on, d.on), color: oneOf(x.color, PANE_COLORS, d.color), border: bool(x.border, d.border) };
}

/**
 * Every built-in pane, then the script panes with a well-formed id (at
 * most MAX_SCRIPT_PANES). Stored toggles never take the new-user script
 * pane entries of `defaultSettings()` (ADR 0078), and a stored map whose
 * UI entry is damaged keeps the UI frame on (the default before ADR 0078).
 * A missing map (a new user, garbage) is the defaults.
 */
function migratePanes(raw: unknown): PaneSettingsMap {
  if (!isObj(raw)) return defaultSettings().panes;
  const d = defaultSettings().panes;
  d.ui = { ...d.ui, border: true };
  const p = raw;
  const out = {} as PaneSettingsMap;
  for (const id of PANE_IDS) out[id] = paneEntry(p[id], d[id]);
  let n = 0;
  for (const [id, x] of Object.entries(p)) {
    if (!isScriptPaneId(id) || !isObj(x)) continue;
    if (++n > MAX_SCRIPT_PANES) break;
    out[id] = paneEntry(x, SCRIPT_PANE_DEFAULTS);
  }
  return out;
}

/**
 * A valid layout from anything: known dock ids only, sizes clamped, each
 * pane id at most once (docks first, each dock's head spans, lane by lane,
 * its tail spans, then `floating`; first occurrence wins), empty lanes
 * removed, spans folded into lane 0 of a dock with fewer than two lanes
 * (ADR 0067; a layout without spans gets empty ones), and any built-in pane missing from
 * every dock and from `floating` appended to lane 0 of the right dock (made
 * at its default size if the dock is empty) with its default height (the map instead
 * floats at its default spot, `defaultMapFloat`). A dock missing from an
 * older layout (the top dock) comes back empty. A dock of the shape before
 * ADR 0064 (`{ size, panes }`) becomes one lane.
 * Script panes with a well-formed id keep their place (at most
 * MAX_SCRIPT_PANES); a missing one is placed again when its script creates
 * it (ADR 0053).
 */
export function migrateLayout(raw: unknown): LayoutModel {
  const d = defaultSettings().layout;
  const docksRaw = isObj(raw) && isObj(raw.docks) ? raw.docks : null;
  if (!docksRaw) return d;
  const seen = new Set<PaneId>();
  let scripts = 0;
  /** True when `id` is a pane id not seen yet (and within the script pane bound). */
  const take = (id: unknown): id is PaneId => {
    if (!isPaneId(id) || seen.has(id)) return false;
    if (isScriptPaneId(id) && ++scripts > MAX_SCRIPT_PANES) return false;
    seen.add(id);
    return true;
  };
  const out = { docks: {}, floating: [] } as unknown as LayoutModel;
  for (const dock of DOCK_IDS) {
    const x = isObj(docksRaw[dock]) ? (docksRaw[dock] as Obj) : {};
    // Before ADR 0064 a dock was one strip `{ size, panes }`: lane 0 now.
    const lanesRaw: unknown[] = Array.isArray(x.lanes) ? x.lanes : [{ size: x.size, panes: x.panes }];
    const list = (raw: unknown): DockPane[] => {
      const panes: DockPane[] = [];
      for (const p of Array.isArray(raw) ? raw : []) {
        if (!isObj(p)) continue;
        const id = p.id;
        if (!take(id)) continue;
        panes.push({ id, desired: int(p.desired, 1, MAX_CELLS, defaultPaneRows(id)) });
      }
      return panes;
    };
    // Spanning panes (ADR 0067): the head wins over the lanes, the lanes over the tail.
    const head = list(x.head);
    const lanes: DockLane[] = [];
    for (const l of lanesRaw) {
      if (!isObj(l)) continue;
      const panes = list(l.panes);
      if (panes.length > 0) lanes.push({ size: int(l.size, 1, MAX_CELLS, defaultDockSize(dock)), panes });
    }
    const tail = list(x.tail);
    out.docks[dock] = { lanes, head, tail };
    normalizeDock(out.docks[dock], dock);
  }
  for (const f of isObj(raw) && Array.isArray(raw.floating) ? raw.floating : []) {
    if (!isObj(f)) continue;
    const id = f.id;
    if (!take(id)) continue;
    const size = defaultFloatSize(id);
    out.floating.push({
      id,
      x: int(f.x, 0, MAX_CELLS, 0),
      y: int(f.y, 0, MAX_CELLS, 0),
      w: int(f.w, 1, MAX_CELLS, size.w),
      h: int(f.h, 1, MAX_CELLS, size.h),
      ...(f.auto === true ? { auto: true } : {}),
      ...(f.auto === true && isPaneId(f.below) && f.below !== id ? { below: f.below } : {}),
    });
  }
  // The map floats at its default spot (ADR 0020); a missing side pane
  // joins the right dock. The map goes first (backmost), under panes the
  // user already floats.
  if (!seen.has('map')) out.floating.unshift(defaultMapFloat());
  for (const id of PANE_IDS) {
    if (!seen.has(id) && id !== 'map') appendToDock(out.docks, 'right', { id, desired: DEFAULT_PANE_DESIRED[id] });
  }
  return out;
}

/** Group pane options from anything. */
export function migrateGroup(raw: unknown): GroupSettings {
  const d = defaultSettings().group;
  const g = isObj(raw) ? raw : {};
  return { showPlayers: bool(g.showPlayers, d.showPlayers), npcMode: oneOf(g.npcMode, GROUP_NPC_MODES, d.npcMode) };
}

/**
 * Comm pane options from anything. Filters keep only disabled channels
 * (`false`) with a sane name; at most `COMM_FILTERS_MAX` of them.
 */
export function migrateComm(raw: unknown): CommSettings {
  const d = defaultSettings().comm;
  const c = isObj(raw) ? raw : {};
  const filters: Record<string, boolean> = {};
  if (isObj(c.filters)) {
    let n = 0;
    for (const [k, v] of Object.entries(c.filters)) {
      if (v !== false || k === '' || k === '__proto__' || k.length > COMM_FILTER_KEY_MAX) continue;
      if (++n > COMM_FILTERS_MAX) break;
      filters[k] = false;
    }
  }
  return { filters, showHeader: bool(c.showHeader, d.showHeader) };
}

/**
 * Timers options from anything: every key falls back to its own default
 * (Inv §2.6.3), `cols` is clamped (1–6, Charmies 1–2).
 */
export function migrateTimers(raw: unknown): TimersSettings {
  const d = defaultTimersSettings();
  const t = isObj(raw) ? raw : {};
  const groups = isObj(t.groups) ? t.groups : {};
  for (const id of TIMER_GROUPS) {
    const x = isObj(groups[id]) ? (groups[id] as Obj) : {};
    const dg = d.groups[id];
    d.groups[id] = {
      enabled: bool(x.enabled, dg.enabled),
      color: oneOf(x.color, TIMER_COLOR_ORDER, dg.color),
      cols: int(x.cols, TIMER_COLS_MIN, timerColsMax(id), dg.cols),
      clock: bool(x.clock, dg.clock),
      bar: bool(x.bar, dg.bar),
    };
  }
  return { groups: d.groups, headers: bool(t.headers, d.headers), compact: bool(t.compact, d.compact) };
}

/** Spotlights filters from anything (every kind defaults to shown). */
export function migrateSpotlights(raw: unknown): SpotlightSettings {
  const d = defaultSettings().spotlights;
  const x = isObj(raw) ? raw : {};
  return {
    achievements: bool(x.achievements, d.achievements),
    deaths: bool(x.deaths, d.deaths),
    levelUps: bool(x.levelUps, d.levelUps),
    pvp: bool(x.pvp, d.pvp),
  };
}

/** Game window options from anything (a depth not offered takes the default). */
export function migrateOutput(raw: unknown): OutputSettings {
  const d = defaultSettings().output;
  const x = isObj(raw) ? raw : {};
  return { scrollback: oneOf(x.scrollback, SCROLLBACK_CHOICES, d.scrollback) };
}

/** Input line options from anything (both default off, ADR 0063). */
export function migrateInput(raw: unknown): InputSettings {
  const d = defaultSettings().input;
  const x = isObj(raw) ? raw : {};
  return { autoClear: bool(x.autoClear, d.autoClear), autosuggest: bool(x.autosuggest, d.autosuggest) };
}

/**
 * Mapper options from anything (notes on, full hover, medium hover text;
 * ADR 0077; the default tileset, also for an unknown id, ADR 0082; the
 * default background for anything but a hex colour, ADR 0085; the
 * remembered colour code, '' for none, ADR 0085 addendum).
 * Stored before version 2, 'minimal' was the default and moves to the
 * new default 'full' once (ADR 0080).
 */
export function migrateMapper(raw: unknown, fromVersion = SETTINGS_VERSION): MapperSettings {
  const d = defaultSettings().mapper;
  const x = isObj(raw) ? raw : {};
  const hover = fromVersion < 2 && x.hover === 'minimal' ? 'full' : x.hover;
  const background = hex(x.background, d.background);
  return {
    notes: bool(x.notes, d.notes),
    hover: oneOf(hover, MAP_HOVER_MODES, d.hover),
    hoverSize: oneOf(x.hoverSize, MAP_HOVER_SIZES, d.hoverSize),
    tileset: oneOf(x.tileset, TILESET_IDS, d.tileset),
    background,
    // A typed colour from before the code row (stage 25 round 1) becomes the remembered code.
    backgroundCode: hex(x.backgroundCode, '') || (isNamedMapBg(background) ? '' : background),
  };
}

/** A complete, valid `Settings` from anything (stored data of any version). */
export function migrateSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const s = isObj(raw) ? raw : {};
  const profile = typeof s.profile === 'string' && s.profile !== '' ? s.profile : d.profile;
  return {
    version: SETTINGS_VERSION,
    appearance: migrateAppearance(s.appearance),
    panes: migratePanes(s.panes),
    layout: migrateLayout(s.layout),
    profile,
    group: migrateGroup(s.group),
    comm: migrateComm(s.comm),
    timers: migrateTimers(s.timers),
    spotlights: migrateSpotlights(s.spotlights),
    output: migrateOutput(s.output),
    input: migrateInput(s.input),
    mapper: migrateMapper(s.mapper, typeof s.version === 'number' ? s.version : 0),
  };
}
