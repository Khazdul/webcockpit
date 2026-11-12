// Loading stored settings safely (Inv §3.1 lesson: one default object
// fills missing keys on upgrade). `migrateSettings` accepts anything —
// an old version, a partial object, garbage — and always returns a
// complete, valid `Settings`: missing or invalid values take the
// default, numbers are clamped, enums checked, colours normalised, and a
// damaged layout is repaired so every pane appears exactly once. Script
// panes (ADR 0053) keep their well-formed entries in `panes` and the
// layout, so they return where they were when their script runs again. Keys
// that are no longer part of `Settings` (e.g. `corners`, removed after the
// stage 2 feedback) are dropped silently. Panes of retired bundled scripts
// (`RETIRED_PANES`) are dropped once, from settings stored before the
// version that retired them.

import {
  DEFAULT_PANE_DESIRED,
  DOCK_IDS,
  type DockLane,
  type DockPane,
  type LayoutModel,
  PANE_COLORS,
  PANE_IDS,
  type PaneId,
  type ScriptPaneId,
  appendToDock,
  defaultDockSize,
  defaultMapFloat,
  defaultStatsFloat,
  defaultPaneRows,
  isPaneId,
  isScriptPaneId,
  normalizeDock,
} from '../layout/types';
import { defaultFloatSize } from '../layout/allocate';
import { MAP_BG_TRANSPARENT, isNamedMapBg } from '../map/backgrounds';
import { TILESET_IDS } from '../map/tilesets';
import { normalizeHex } from '../theme/color';
import { DEFAULT_INPUT_COLOR, INPUT_COLOR_IDS, LEGACY_INPUT_COLOR } from '../theme/presets';
import {
  type AppearanceSettings,
  COMM_FILTERS_MAX,
  COMM_PUBLIC_DEFAULT_OFF,
  COMM_CHAT_WINDOWS,
  COMM_FILTER_KEY_MAX,
  COMM_LIST_WIDTH_MAX,
  COMM_LIST_WIDTH_MIN,
  type CommSettings,
  CURSOR_STYLES,
  type ColorSetting,
  GROUP_AWAY_MODES,
  GROUP_NPC_MODES,
  type GroupSettings,
  FONT_IDS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type InputSettings,
  MAP_HOVER_MODES,
  MAP_HOVER_SIZES,
  type MapperSettings,
  PHONE_COMM_ROWS_MAX,
  PHONE_COMM_ROWS_MIN,
  PHONE_HOTKEY_COMMAND_MAX,
  PHONE_DEFAULTS_MARK,
  PHONE_HOTKEY_COUNT,
  PHONE_HOTKEY_LABEL_MAX,
  PHONE_HOTKEY_SPECIALS,
  PHONE_KEYBOARD_LAYOUTS,
  PHONE_LENS_LEVELS,
  PHONE_STRIP_PANES,
  PHONE_UNREAD_MODES,
  type PhoneHotkey,
  type PhoneLensLevel,
  type PhoneLensWant,
  PHONE_LENS_SIZE_MAX,
  PHONE_LENS_SIZE_MIN,
  type PhoneSettings,
  type PhoneStripEntry,
  type PhoneStripPane,
  defaultPhoneSettings,
  PADDING_MAX,
  PADDING_MIN,
  PADDING_STEP,
  type OutputSettings,
  type PaneSettings,
  type PaneSettingsMap,
  SCRIPT_PANE_DEFAULTS,
  SCROLLBACK_CHOICES,
  SETTINGS_VERSION,
  SPLIT_SHARE_MAX,
  SPLIT_SHARE_MIN,
  SPOTLIGHT_PERIODS,
  type Settings,
  type SpotlightSettings,
  TIMER_COLOR_HEX,
  TIMER_COLOR_ORDER,
  TIMER_COLS_MAX,
  TIMER_COLS_MIN,
  TIMER_GROUP_LAYOUTS,
  TIMER_LAYOUTS,
  TIMER_LEGACY_DEFAULT_COLOR,
  TIMER_SIGNALS,
  TIMER_STYLES,
  TIMER_WARN_CHOICES,
  type TimerColor,
  type TimerCols,
  type TimersSettings,
  WEATHER_CATEGORIES,
  type WeatherSettings,
  WINDOW_IDS,
  type WindowRect,
  type WindowSettings,
  defaultSettings,
  defaultGroupSettings,
  defaultTimersSettings,
  LEGACY_APPEARANCE,
  LEGACY_MAPPER,
} from './types';
import { TIMER_GROUPS, type TimerGroup } from '../timers/entry';

/** Largest dock size / desired value kept, in cells (a sanity bound only). */
export const MAX_CELLS = 1000;
/** Most script pane entries kept in `panes` and in the layout (a sanity bound only). */
export const MAX_SCRIPT_PANES = 200;

/**
 * Panes of bundled scripts that were removed, with the settings version
 * that removed them: settings stored before that version drop the pane
 * from `panes` and from the layout (docks and floats), so no slot is
 * left behind. Settings of that version or newer keep it, so a user
 * script that later takes the name and the pane id is never touched.
 */
export const RETIRED_PANES: readonly { id: ScriptPaneId; version: number }[] = [
  // The pane bar (ADR 0065), replaced by the menu bar's Panes popup (ADR 0111).
  { id: 'panebar/bar', version: 3 },
];

/** The retired panes settings stored at `fromVersion` still hold. */
function retiredPanes(fromVersion: number): ReadonlySet<PaneId> {
  return new Set(RETIRED_PANES.filter((r) => fromVersion < r.version).map((r) => r.id));
}

const NONE: ReadonlySet<PaneId> = new Set();

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

/** The settings version whose stored Steel input colour is a choice, not the old default (ADR 0035). */
const INPUT_COLOR_SWITCH_VERSION = 6;

/**
 * A complete, valid appearance from anything (see `LEGACY_APPEARANCE`).
 *
 * `fromVersion` is the version of the stored settings the appearance came
 * with. Before version 6 the input colour's default was Steel and it was
 * stored with every appearance, so a stored Steel moves to today's default
 * (Amber) once (ADR 0035, addendum "the one-time switch"). Without a
 * version (the localStorage mirror, a recording's VIEW) nothing is switched.
 */
export function migrateAppearance(raw: unknown, fromVersion = SETTINGS_VERSION): AppearanceSettings {
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
    inputColor:
      fromVersion < INPUT_COLOR_SWITCH_VERSION && a.inputColor === LEGACY_INPUT_COLOR ? DEFAULT_INPUT_COLOR : oneOf(a.inputColor, INPUT_COLOR_IDS, d.inputColor),
    boldBright: bool(a.boldBright, d.boldBright),
  };
}

function paneEntry(raw: unknown, d: Readonly<PaneSettings>): PaneSettings {
  const x = isObj(raw) ? raw : {};
  return {
    on: bool(x.on, d.on),
    color: oneOf(x.color, PANE_COLORS, d.color),
    border: bool(x.border, d.border),
    // Before ADR 0095 every pane was glass.
    glass: bool(x.glass, d.glass),
  };
}

/**
 * Every built-in pane, then the script panes with a well-formed id (at
 * most MAX_SCRIPT_PANES). Stored toggles never take the new-user script
 * pane entries of `defaultSettings()` (ADR 0078), and a stored map whose
 * UI entry is damaged keeps the UI frame on (the default before ADR 0078).
 * A missing map (a new user, garbage) is the defaults. Ids in `drop`
 * (retired panes) are left out.
 */
function migratePanes(raw: unknown, drop: ReadonlySet<PaneId> = NONE): PaneSettingsMap {
  if (!isObj(raw)) return defaultSettings().panes;
  const d = defaultSettings().panes;
  // A damaged entry in a stored map takes the defaults before ADR 0078/0092.
  d.ui = { ...d.ui, on: true, border: true };
  d.character = { ...d.character, on: true };
  d.map = { ...d.map, border: true, glass: true };
  const p = raw;
  const out = {} as PaneSettingsMap;
  for (const id of PANE_IDS) out[id] = paneEntry(p[id], d[id]);
  let n = 0;
  for (const [id, x] of Object.entries(p)) {
    if (!isScriptPaneId(id) || !isObj(x) || drop.has(id)) continue;
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
 * floats at its default spot, `defaultMapFloat`, and Statistics at its own,
 * `defaultStatsFloat`). A dock missing from an
 * older layout (the top dock) comes back empty. A dock of the shape before
 * ADR 0064 (`{ size, panes }`) becomes one lane.
 * Script panes with a well-formed id keep their place (at most
 * MAX_SCRIPT_PANES); a missing one is placed again when its script creates
 * it (ADR 0053). Ids in `drop` (retired panes) are left out, and a float
 * `below` one of them loses its anchor.
 */
export function migrateLayout(raw: unknown, drop: ReadonlySet<PaneId> = NONE): LayoutModel {
  const d = defaultSettings().layout;
  const docksRaw = isObj(raw) && isObj(raw.docks) ? raw.docks : null;
  if (!docksRaw) return d;
  const seen = new Set<PaneId>();
  let scripts = 0;
  /** True when `id` is a pane id not seen yet (and within the script pane bound). */
  const take = (id: unknown): id is PaneId => {
    if (!isPaneId(id) || seen.has(id) || drop.has(id)) return false;
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
      ...(f.auto === true && isPaneId(f.below) && f.below !== id && !drop.has(f.below) ? { below: f.below } : {}),
    });
  }
  // The map floats at its default spot (ADR 0020); a missing side pane
  // joins the right dock. The map goes first (backmost), under panes the
  // user already floats.
  if (!seen.has('map')) out.floating.unshift(defaultMapFloat());
  // Statistics (ADR 0109): its auto float, in front, centred over the game pane.
  if (!seen.has('statistics')) out.floating.push(defaultStatsFloat());
  for (const id of PANE_IDS) {
    if (!seen.has(id) && id !== 'map' && id !== 'statistics') appendToDock(out.docks, 'right', { id, desired: DEFAULT_PANE_DESIRED[id] });
  }
  return out;
}

/** A colour setting from anything (ADR 0122): `auto`, or a hex normalised; else `auto`. */
export function colorSetting(v: unknown): ColorSetting {
  if (v === 'auto') return 'auto';
  return normalizeHex(v) ?? 'auto';
}

/** Group pane options from anything (ADR 0122 fields are additive). */
export function migrateGroup(raw: unknown): GroupSettings {
  const d = defaultGroupSettings();
  const g = isObj(raw) ? raw : {};
  const c = isObj(g.colors) ? g.colors : {};
  return {
    showPlayers: bool(g.showPlayers, d.showPlayers),
    npcMode: oneOf(g.npcMode, GROUP_NPC_MODES, d.npcMode),
    away: oneOf(g.away, GROUP_AWAY_MODES, d.away),
    fight: bool(g.fight, d.fight),
    colors: { hp: colorSetting(c.hp), mana: colorSetting(c.mana), mp: colorSetting(c.mp) },
  };
}

/**
 * Comm pane options from anything. Filters keep only disabled channels
 * (`false`) with a sane name; at most `COMM_FILTERS_MAX` of them; stored
 * filters are kept as they are (settings without filters, a new user's,
 * get the defaults). The column width is clamped; anything else is the
 * automatic width. A stored `showHeader` (the pane before ADR 0134) is
 * dropped.
 */
export function migrateComm(raw: unknown, fromVersion = SETTINGS_VERSION): CommSettings {
  const d = defaultSettings().comm;
  const c = isObj(raw) ? raw : {};
  const filters: Record<string, boolean> = isObj(c.filters) ? {} : { ...d.filters };
  if (isObj(c.filters)) {
    let n = 0;
    for (const [k, v] of Object.entries(c.filters)) {
      if (v !== false || k === '' || k === '__proto__' || k.length > COMM_FILTER_KEY_MAX) continue;
      if (++n > COMM_FILTERS_MAX) break;
      filters[k] = false;
    }
  }
  // Settings from before the conversation view (v5): the chat channels go
  // off in Public once (ADR 0134, owner's first test).
  if (isObj(c.filters) && fromVersion < 5) for (const ch of COMM_PUBLIC_DEFAULT_OFF) filters[ch] = false;
  const w = c.listWidth;
  const listWidth =
    typeof w === 'number' && Number.isFinite(w) ? Math.round(Math.min(COMM_LIST_WIDTH_MAX, Math.max(COMM_LIST_WIDTH_MIN, w))) : null;
  return {
    filters,
    npcs: bool(c.npcs, d.npcs),
    chatWindow: oneOf(c.chatWindow, COMM_CHAT_WINDOWS, d.chatWindow),
    folded: bool(c.folded, d.folded),
    listWidth,
  };
}

/**
 * A timer group's colour from anything (ADR 0122): a swatch name of the
 * old settings becomes `auto` when it was that group's default swatch,
 * else its hex; `auto` and a hex are kept; anything else is `auto`.
 */
function timerColor(group: TimerGroup, v: unknown): ColorSetting {
  if (TIMER_COLOR_ORDER.includes(v as TimerColor)) {
    const name = v as TimerColor;
    return group !== 'sanct' && group !== 'herb' && TIMER_LEGACY_DEFAULT_COLOR[group] === name ? 'auto' : TIMER_COLOR_HEX[name];
  }
  return colorSetting(v);
}

/** Grid columns from anything: `auto`, or a whole number clamped 1–6. */
function timerCols(v: unknown, d: TimerCols): TimerCols {
  if (v === 'auto') return 'auto';
  return typeof v === 'number' && Number.isFinite(v) ? int(v, TIMER_COLS_MIN, TIMER_COLS_MAX, 1) : d;
}

/**
 * Timers options from anything (ADR 0122): every key falls back to its
 * default; the old per-group `cols`, `clock`, `bar` and the global
 * `compact` are dropped; a stored swatch name migrates by value
 * (`timerColor`), so it works from any version and in old VIEW records.
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
      color: timerColor(id, x.color),
      layout: oneOf(x.layout, TIMER_GROUP_LAYOUTS, dg.layout),
    };
  }
  return {
    groups: d.groups,
    style: oneOf(t.style, TIMER_STYLES, d.style),
    layout: oneOf(t.layout, TIMER_LAYOUTS, d.layout),
    cols: timerCols(t.cols, d.cols),
    headers: bool(t.headers, d.headers),
    timeText: bool(t.timeText, d.timeText),
    signal: oneOf(t.signal, TIMER_SIGNALS, d.signal),
    warnAt: oneOf(t.warnAt, TIMER_WARN_CHOICES, d.warnAt),
    soonestFirst: bool(t.soonestFirst, d.soonestFirst),
  };
}

/**
 * Spotlights filters from anything (every kind shown, all characters, all
 * time by default; the character and period fields are additive, ADR 0110).
 */
export function migrateSpotlights(raw: unknown): SpotlightSettings {
  const d = defaultSettings().spotlights;
  const x = isObj(raw) ? raw : {};
  const names = Array.isArray(x.characters) ? x.characters.filter((n): n is string => typeof n === 'string' && n !== '') : [];
  return {
    achievements: bool(x.achievements, d.achievements),
    deaths: bool(x.deaths, d.deaths),
    levelUps: bool(x.levelUps, d.levelUps),
    pvp: bool(x.pvp, d.pvp),
    allCharacters: bool(x.allCharacters, d.allCharacters),
    characters: [...new Set(names)],
    period: oneOf(x.period, SPOTLIGHT_PERIODS, d.period),
  };
}

/**
 * Game window options from anything (a depth not offered takes the
 * default; a split share that is not a number takes the default, one out
 * of bounds is clamped, ADR 0117).
 */
export function migrateOutput(raw: unknown): OutputSettings {
  const d = defaultSettings().output;
  const x = isObj(raw) ? raw : {};
  const share =
    typeof x.splitShare === 'number' && Number.isFinite(x.splitShare)
      ? Math.min(SPLIT_SHARE_MAX, Math.max(SPLIT_SHARE_MIN, x.splitShare))
      : d.splitShare;
  return { scrollback: oneOf(x.scrollback, SCROLLBACK_CHOICES, d.scrollback), splitShare: share };
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
 * default background for anything but a named colour, ADR 0085 and its
 * stage 25 round 3 addendum; a stored `backgroundCode` is dropped; the
 * remembered background a named colour or none, ADR 0088).
 * Stored before version 2, 'minimal' was the default and moves to the
 * new default 'full' once (ADR 0080).
 */
/** A map background: a hex colour, normalised, or Transparent (ADR 0085 addendum); else `dflt`. */
function mapBg(raw: unknown, dflt: string): string {
  return raw === MAP_BG_TRANSPARENT ? MAP_BG_TRANSPARENT : hex(raw, dflt);
}

/** A remembered map background (ADR 0088): a named colour, normalised, or `''`. */
function rememberedBg(raw: unknown): string {
  const h = mapBg(raw, '');
  return h !== '' && isNamedMapBg(h) ? h : '';
}

export function migrateMapper(raw: unknown, fromVersion = SETTINGS_VERSION): MapperSettings {
  // Stored settings keep the defaults before ADR 0092 (default tileset, default background).
  const d = { ...defaultSettings().mapper, ...LEGACY_MAPPER };
  const x = isObj(raw) ? raw : {};
  const hover = fromVersion < 2 && x.hover === 'minimal' ? 'full' : x.hover;
  const bg = mapBg(x.background, d.background);
  return {
    notes: bool(x.notes, d.notes),
    hover: oneOf(hover, MAP_HOVER_MODES, d.hover),
    hoverSize: oneOf(x.hoverSize, MAP_HOVER_SIZES, d.hoverSize),
    tileset: oneOf(x.tileset, TILESET_IDS, d.tileset),
    background: isNamedMapBg(bg) ? bg : d.background,
    backgroundBefore: rememberedBg(x.backgroundBefore),
  };
}

/**
 * Weather effects from anything (additive in stage 28: every category on,
 * the blue day sky on). A missing or invalid `enabled` is on on a desktop
 * and off on a phone (ADR 0092): existing desktop users get the weather
 * with the update, a phone never starts with it; a stored choice is kept.
 */
export function migrateWeather(raw: unknown, phone = false): WeatherSettings {
  const d = { ...defaultSettings().weather, enabled: !phone };
  const x = isObj(raw) ? raw : {};
  const out: WeatherSettings = { ...d, enabled: bool(x.enabled, d.enabled), daySky: bool(x.daySky, d.daySky) };
  for (const k of WEATHER_CATEGORIES) out[k] = bool(x[k], d[k]);
  return out;
}

/** Largest window coordinate or size kept, in cells (a sanity bound only). */
export const MAX_WINDOW_CELLS = 10000;

/** A stored window rectangle from anything: whole cells (size at least 1), else null (ADR 0103). */
function windowRect(raw: unknown): WindowRect | null {
  if (!isObj(raw)) return null;
  const n = (v: unknown, lo: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(MAX_WINDOW_CELLS, Math.round(v))) : null;
  const x = n(raw.x, 0);
  const y = n(raw.y, 0);
  const w = n(raw.w, 1);
  const h = n(raw.h, 1);
  return x === null || y === null || w === null || h === null ? null : { x, y, w, h };
}

/** Window places from anything (additive in stage 30b: none placed yet). */
export function migrateWindows(raw: unknown): WindowSettings {
  const x = isObj(raw) ? raw : {};
  const out = {} as WindowSettings;
  for (const id of WINDOW_IDS) out[id] = windowRect(x[id]);
  return out;
}

/** The phone's settings from anything (additive in stage 51, ADR 0136 §13: absent is the defaults). */
export function migratePhone(raw: unknown): PhoneSettings {
  const d = defaultPhoneSettings();
  const p = isObj(raw) ? raw : {};
  const l = isObj(p.lens) ? p.lens : {};
  const k = isObj(p.keyboard) ? p.keyboard : {};
  return {
    lens: {
      show: bool(l.show, d.lens.show),
      // A stored `size` (0.5.0's S/M/L) is dropped: the size follows the screen (stage 52).
      opensAt: migrateLensLevel(l.opensAt, d.lens.opensAt),
      // Additive (round 53k): absent (settings from 0.6.1) is a lens never moved or resized.
      portrait: migrateLensWant(l.portrait),
      landscape: migrateLensWant(l.landscape),
    },
    strip: { panes: migrateStripPanes(isObj(p.strip) ? p.strip.panes : undefined, d.strip.panes) },
    commRows: typeof p.commRows === 'number' && Number.isFinite(p.commRows) ? int(p.commRows, PHONE_COMM_ROWS_MIN, PHONE_COMM_ROWS_MAX, PHONE_COMM_ROWS_MIN) : null,
    stripRows: typeof p.stripRows === 'number' && Number.isFinite(p.stripRows) ? int(p.stripRows, PHONE_COMM_ROWS_MIN, PHONE_COMM_ROWS_MAX, PHONE_COMM_ROWS_MIN) : null,
    unread: oneOf(p.unread, PHONE_UNREAD_MODES, d.unread),
    hotkeys: migrateHotkeys(p.hotkeys, d.hotkeys),
    hotkeyCount: int(p.hotkeyCount, 1, PHONE_HOTKEY_COUNT, d.hotkeyCount),
    hotkeysOpen: bool(p.hotkeysOpen, d.hotkeysOpen),
    // (The same limits as the heights: the allocator fits it to the screen.) A stored `compassSize`
    // (0.5.0's S/M/L) is dropped: the keys are small in portrait and large in landscape (stage 52).
    sideCols: typeof p.sideCols === 'number' && Number.isFinite(p.sideCols) ? int(p.sideCols, PHONE_COMM_ROWS_MIN, PHONE_COMM_ROWS_MAX, PHONE_COMM_ROWS_MIN) : null,
    wakeLock: bool(p.wakeLock, d.wakeLock),
    autoReconnect: bool(p.autoReconnect, d.autoReconnect),
    // Absent (settings from 0.5.0, or a computer's): none had yet.
    defaults: int(p.defaults, 0, PHONE_DEFAULTS_MARK, 0),
    // Additive (ADR 0138): absent is the digit row folded away and the layout of the browser's language.
    keyboard: {
      digits: bool(k.digits, d.keyboard.digits),
      layout: oneOf(k.layout, PHONE_KEYBOARD_LAYOUTS, d.keyboard.layout),
    },
    // Additive (ADR 0138 §7; the key of 0.5.0, gone in 0.6.0, is read again): absent is off.
    vibrate: bool(p.vibrate, d.vibrate),
    // Additive (round 53k): absent (settings from 0.6.1) is the card shown, as it always was.
    fightCard: bool(p.fightCard, d.fightCard),
  };
}

/**
 * The lens's zoom level from anything (round 53k). 0.6.1 stored `near`,
 * `middle` or `far`; its nearest level is gone and the others moved up one
 * place: `near` and `middle` are the new nearest (`z1`, the same scale as
 * the old middle), `far` is `z2` (the same scale as the old far).
 */
export function migrateLensLevel(raw: unknown, dflt: PhoneLensLevel): PhoneLensLevel {
  if (raw === 'near' || raw === 'middle') return 'z1';
  if (raw === 'far') return 'z2';
  return oneOf(raw, PHONE_LENS_LEVELS, dflt);
}

/**
 * The lens's wanted place and size in one orientation from anything (round
 * 53k): the centre's two shares within 0 to 1, both or neither; the
 * diameter a whole number of px within its limits; anything else is unset.
 */
export function migrateLensWant(raw: unknown): PhoneLensWant {
  const w = isObj(raw) ? raw : {};
  const share = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null);
  const x = share(w.x);
  const y = share(w.y);
  const at = x !== null && y !== null;
  return {
    x: at ? x : null,
    y: at ? y : null,
    size: typeof w.size === 'number' && Number.isFinite(w.size) ? int(w.size, PHONE_LENS_SIZE_MIN, PHONE_LENS_SIZE_MAX, PHONE_LENS_SIZE_MIN) : null,
  };
}

/**
 * The hot keys from anything: always `PHONE_HOTKEY_COUNT`, slot by slot (a
 * short list, such as the three of 0.5.0, is filled with the defaults of
 * the missing slots; a long one is cut). A label is cut to its length and a command to one line; a key
 * that would send nothing (no command and no known special) or show
 * nothing (no label) is the slot's default instead, so a stored key is
 * never a dead control.
 */
/**
 * A label's characters as a reader counts them: grapheme clusters where
 * `Intl.Segmenter` exists, else code points (as src/phone/hotkey-model.ts
 * `characters`, which the phone's own chunk keeps for itself).
 */
function labelChars(text: string): string[] {
  // Every settings write on every device passes here (six labels): the common label, a few
  // ASCII letters, needs no segmenter, and the one for the rest is made once.
  if (/^[\x20-\x7e]*$/.test(text)) return text.split('');
  const Seg = (Intl as { Segmenter?: SegmenterCtor }).Segmenter;
  if (!Seg) return [...text];
  if (segmenter === null || segmenterCtor !== Seg) {
    segmenterCtor = Seg;
    segmenter = new Seg(undefined, { granularity: 'grapheme' });
  }
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

type SegmenterCtor = new (l?: string, o?: { granularity: 'grapheme' }) => { segment(t: string): Iterable<{ segment: string }> };
/** The one grapheme segmenter, made at its first use (and again only if `Intl.Segmenter` itself was replaced: tests). */
let segmenter: InstanceType<SegmenterCtor> | null = null;
let segmenterCtor: SegmenterCtor | null = null;

function migrateHotkeys(raw: unknown, dflt: PhoneHotkey[]): PhoneHotkey[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: PhoneHotkey[] = [];
  for (let i = 0; i < PHONE_HOTKEY_COUNT; i++) {
    const d = dflt[i]!;
    const e: unknown = list[i];
    if (!isObj(e)) {
      out.push(d);
      continue;
    }
    const special = oneOf(e.special, [...PHONE_HOTKEY_SPECIALS, null], null);
    const command = typeof e.command === 'string' ? e.command.replace(/[\r\n]+/g, ' ').trim().slice(0, PHONE_HOTKEY_COMMAND_MAX) : '';
    const label = typeof e.label === 'string' ? labelChars(e.label.replace(/\s+/g, ' ').trim()).slice(0, PHONE_HOTKEY_LABEL_MAX).join('').trim() : '';
    if (label === '' || (special === null && command === '')) {
      // The stored choice to hide the key is kept.
      out.push({ ...d, shown: bool(e.shown, d.shown) });
      continue;
    }
    out.push({ label, command: special === null ? command : '', special, shown: bool(e.shown, true) });
  }
  return out;
}

/**
 * The strip's panes from anything: every known pane exactly once, the
 * stored ones first in their stored order (a repeat or an unknown id is
 * dropped), then the missing ones in the default order, on or off as by default.
 */
function migrateStripPanes(raw: unknown, dflt: PhoneStripEntry[]): PhoneStripEntry[] {
  const out: PhoneStripEntry[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(raw) ? raw : []) {
    if (!isObj(e) || typeof e.id !== 'string' || seen.has(e.id)) continue;
    if (!(PHONE_STRIP_PANES as readonly string[]).includes(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id as PhoneStripPane, on: bool(e.on, true) });
  }
  for (const id of PHONE_STRIP_PANES) if (!seen.has(id)) out.push({ id, on: dflt.find((e) => e.id === id)?.on ?? true });
  return out;
}

/** Options for `migrateSettings`. */
export interface MigrateOptions {
  /** A phone (ADR 0081): sections that default differently there (the weather, ADR 0092). */
  phone?: boolean;
  /**
   * Settings recorded at a moment (a replay's payload), not a user's stored
   * ones: one-time switches of a stored look (the input colour, ADR 0035)
   * do not apply, so the recording keeps the look it was made with.
   */
  recorded?: boolean;
}

/** A complete, valid `Settings` from anything (stored data of any version). */
export function migrateSettings(raw: unknown, opts: MigrateOptions = {}): Settings {
  const d = defaultSettings();
  const s = isObj(raw) ? raw : {};
  const profile = typeof s.profile === 'string' && s.profile !== '' ? s.profile : d.profile;
  const fromVersion = typeof s.version === 'number' ? s.version : 0;
  const retired = retiredPanes(fromVersion);
  return {
    version: SETTINGS_VERSION,
    appearance: migrateAppearance(s.appearance, opts.recorded ? SETTINGS_VERSION : fromVersion),
    panes: migratePanes(s.panes, retired),
    layout: migrateLayout(s.layout, retired),
    profile,
    group: migrateGroup(s.group),
    comm: migrateComm(s.comm, fromVersion),
    timers: migrateTimers(s.timers),
    spotlights: migrateSpotlights(s.spotlights),
    output: migrateOutput(s.output),
    input: migrateInput(s.input),
    mapper: migrateMapper(s.mapper, fromVersion),
    weather: migrateWeather(s.weather, opts.phone ?? false),
    windows: migrateWindows(s.windows),
    phone: migratePhone(s.phone),
  };
}
