// The settings object (ADR 0010 "Settings"). One typed object with one
// default; `migrateSettings` (migrate.ts) fills missing keys from
// `DEFAULT_SETTINGS` and clamps every value, so stored data from any
// older version loads.

import {
  type BuiltinPaneId,
  type LayoutModel,
  MAPSEARCH_PANE,
  type PaneColor,
  type PaneId,
  type ScriptPaneId,
  defaultLayout,
} from '../layout/types';
import { DEFAULT_INPUT_COLOR, DEFAULT_TERM_BG, DEFAULT_TERM_FG, DOS_PALETTE, type InputColor } from '../theme/presets';
import type { TimerGroup } from '../timers/entry';

/**
 * Terminal font families (src/theme/fonts.ts, ADR 0049): the bundled ones
 * (public/fonts), plus Lucida Console, which is never shipped and only
 * used where it is installed.
 */
export type FontId =
  | 'agave'
  | 'anonymous'
  | 'cascadia'
  | 'dejavu'
  | 'fantasque'
  | 'firacode'
  | 'gomono'
  | 'hack'
  | 'hermit'
  | 'ibm3270'
  | 'plex'
  | 'inconsolata'
  | 'jetbrains'
  | 'mononoki'
  | 'notomono'
  | 'lucida';
/** Every font id, in the font picker's order: by label, Lucida Console last. */
export const FONT_IDS: readonly FontId[] = [
  'agave',
  'anonymous',
  'cascadia',
  'dejavu',
  'fantasque',
  'firacode',
  'gomono',
  'hack',
  'hermit',
  'ibm3270',
  'plex',
  'inconsolata',
  'jetbrains',
  'mononoki',
  'notomono',
  'lucida',
];

export type CursorStyle = 'block' | 'beam' | 'underline';
export const CURSOR_STYLES: readonly CursorStyle[] = ['block', 'beam', 'underline'];

/** Font size range in CSS px (Inv §10.1). */
export const FONT_SIZE_MIN = 6;
export const FONT_SIZE_MAX = 32;
/** Padding around the whole app in CSS px, even steps (Inv §3.7). */
export const PADDING_MIN = 0;
export const PADDING_MAX = 40;
export const PADDING_STEP = 2;

export interface AppearanceSettings {
  font: FontId;
  /** CSS px, 6–32. */
  size: number;
  /** CSS px around the whole app, 0–40, even. */
  padding: number;
  /** Terminal default foreground, `#rrggbb`. */
  fg: string;
  /** Terminal / page background, `#rrggbb`. */
  bg: string;
  /** ANSI colours 0–15, `#rrggbb` each. */
  ansi: string[];
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  /**
   * Colour of the command echo and the input line (ADR 0035). Recorded
   * with the appearance in VIEW records, so logs replay with it.
   */
  inputColor: InputColor;
  /**
   * SGR bold also brightens: colours 0–7 show as 8–15 and the default
   * foreground as a stronger one (ADR 0060). Off: bold is weight only.
   */
  boldBright: boolean;
}

export interface PaneSettings {
  /** Shown. Allocation never changes this (ADR 0010). */
  on: boolean;
  color: PaneColor;
  /** Draw the half-block frame. */
  border: boolean;
  /**
   * Glass background (ADR 0095): the pane's fill inside the frame, over a
   * blur with weather on. Off, the pane is clear: no fill and no blur, so
   * what lies behind it shows sharp (a frame keeps its glass rim).
   */
  glass: boolean;
}

/**
 * Pane toggles: every built-in pane, and the script panes (ADR 0053) that
 * were ever created. A script pane's entry stays while its script is not
 * running, so it comes back as it was.
 */
export type PaneSettingsMap = Record<BuiltinPaneId, PaneSettings> & { [id: ScriptPaneId]: PaneSettings | undefined };

/** A script pane's toggles before the user changes them: on, no tint, framed, glass. */
export const SCRIPT_PANE_DEFAULTS: Readonly<PaneSettings> = Object.freeze({ on: true, color: 'black', border: true, glass: true });

/** The toggles of pane `id` (a script pane without an entry: the defaults). */
export function paneSettingsOf(panes: Readonly<PaneSettingsMap>, id: PaneId): PaneSettings {
  return (panes as Readonly<Record<string, PaneSettings | undefined>>)[id] ?? SCRIPT_PANE_DEFAULTS;
}

/** Which unlabeled NPCs the Group pane shows (Inv §2.3, ADR 0016). */
export type GroupNpcMode = 'off' | 'labeled' | 'all';
export const GROUP_NPC_MODES: readonly GroupNpcMode[] = ['off', 'labeled', 'all'];

/** How the Group pane shows a member who is not in your room (ADR 0122). */
export type GroupAwayMode = 'room' | 'dim';
export const GROUP_AWAY_MODES: readonly GroupAwayMode[] = ['room', 'dim'];

/**
 * A colour setting (ADR 0122): `auto` follows the background (the dark or
 * the light default, src/panes/palette.ts), else a `#rrggbb` used as is.
 */
export type ColorSetting = 'auto' | string;

/** The Group pane's vital bar colours (ADR 0122). */
export interface GroupVitalColors {
  hp: ColorSetting;
  mana: ColorSetting;
  mp: ColorSetting;
}

/** Options → Panes → Group (ADR 0122). */
export interface GroupSettings {
  /** Show player members (ally, neutral and enemy race). */
  showPlayers: boolean;
  /** `off`: no NPCs; `labeled`: labeled NPCs only; `all`: unlabeled ones too. */
  npcMode: GroupNpcMode;
  /** A member not in your room: the room name after the name, or only dimmed. */
  away: GroupAwayMode;
  colors: GroupVitalColors;
}

/** Longest channel name kept in `CommSettings.filters`. */
export const COMM_FILTER_KEY_MAX = 64;
/** Most entries kept in `CommSettings.filters` (a sanity bound only). */
export const COMM_FILTERS_MAX = 100;

/** Options → Panes → Communication, and the header's channel filters. */
export interface CommSettings {
  /**
   * Channel filters by GMCP channel name, global (not per character).
   * Sparse: a missing channel is enabled. Only `false` entries are kept, so
   * enabling a channel is `{ comm: { filters: { tells: true } } }` and the
   * migration drops the entry.
   */
  filters: Record<string, boolean>;
  /** Show the one-row channel header. */
  showHeader: boolean;
}

/**
 * The seven swatches of the Timers settings before ADR 0122. Kept only to
 * migrate stored settings (a stored swatch name becomes `auto` or its hex).
 */
export type TimerColor = 'blue' | 'green' | 'red' | 'magenta' | 'cyan' | 'violet' | 'orange';
export const TIMER_COLOR_ORDER: readonly TimerColor[] = ['blue', 'green', 'red', 'magenta', 'cyan', 'violet', 'orange'];
/** The old swatch colours (migration only). */
export const TIMER_COLOR_HEX: Readonly<Record<TimerColor, string>> = {
  blue: '#66b2ff',
  green: '#00d900',
  red: '#d90000',
  magenta: '#ff66ff',
  cyan: '#00cccc',
  violet: '#b388ff',
  orange: '#ff9933',
};
/** The old swatch labels (the interim Options page until stage 39c). */
export const TIMER_COLOR_LABELS: Readonly<Record<TimerColor, string>> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  magenta: 'Magenta',
  cyan: 'Cyan',
  violet: 'Violet',
  orange: 'Orange',
};
/** The swatch each group had by default before ADR 0122 (it migrates to `auto`). */
export const TIMER_LEGACY_DEFAULT_COLOR: Readonly<Record<Exclude<TimerGroup, 'sanct'>, TimerColor>> = {
  spell: 'blue',
  buff: 'green',
  debuff: 'red',
  stored: 'magenta',
  blind: 'cyan',
  charm: 'violet',
};

/** How a timer is drawn (ADR 0122): a pill whose fill drains, or a ring. */
export type TimerStyle = 'bars' | 'circles';
export const TIMER_STYLES: readonly TimerStyle[] = ['bars', 'circles'];
/** How a group's timers are laid out: wrapped by width, or in columns. */
export type TimerLayout = 'flow' | 'grid';
export const TIMER_LAYOUTS: readonly TimerLayout[] = ['flow', 'grid'];
/** A group's layout: the global one, or its own. */
export type TimerGroupLayout = 'default' | TimerLayout;
export const TIMER_GROUP_LAYOUTS: readonly TimerGroupLayout[] = ['default', 'flow', 'grid'];
/** Grid columns: as many as fit, or a cap. */
export type TimerCols = 'auto' | number;
/** Grid column cap range. */
export const TIMER_COLS_MIN = 1;
export const TIMER_COLS_MAX = 6;
/** How a timer that ends soon is shown (it keeps its colour). */
export type TimerSignal = 'text' | 'pulse' | 'none';
export const TIMER_SIGNALS: readonly TimerSignal[] = ['text', 'pulse', 'none'];
/** The ending-soon thresholds offered, seconds. */
export type TimerWarnAt = 10 | 20 | 30 | 60;
export const TIMER_WARN_CHOICES: readonly TimerWarnAt[] = [10, 20, 30, 60];

/** One Timers group (Options → Panes → Timers, ADR 0122). */
export interface TimerGroupSettings {
  /** Shown. */
  enabled: boolean;
  color: ColorSetting;
  layout: TimerGroupLayout;
}

/** Options → Panes → Timers (ADR 0122), global. */
export interface TimersSettings {
  groups: Record<TimerGroup, TimerGroupSettings>;
  style: TimerStyle;
  layout: TimerLayout;
  /** Grid columns (the global layout and every `grid` group). */
  cols: TimerCols;
  /** A small header (icon, name, count) above each group. */
  headers: boolean;
  /** The countdown text (off: bars and rings only). */
  timeText: boolean;
  signal: TimerSignal;
  /** Seconds left at which a timer ends soon. */
  warnAt: TimerWarnAt;
  /** Each group sorted by time left. */
  soonestFirst: boolean;
}

/** How far back the Spotlights reel and Credits reach (ADR 0110): a rolling window back from now. */
export type SpotlightPeriod = 'all' | 'year' | '3months' | 'month' | 'week';

/** The periods, in the popup's order. */
export const SPOTLIGHT_PERIODS: readonly SpotlightPeriod[] = ['all', 'year', '3months', 'month', 'week'];

/**
 * What the Spotlights reel and Credits show (Inv §3.8, ADR 0019, ADR 0110):
 * the event kinds, the characters and the period. Global; set from the
 * reel's gear.
 */
export interface SpotlightSettings {
  achievements: boolean;
  deaths: boolean;
  levelUps: boolean;
  pvp: boolean;
  /** Every character, new ones included (the default). */
  allCharacters: boolean;
  /** The checked characters, used while `allCharacters` is off (kept while it is on). */
  characters: string[];
  period: SpotlightPeriod;
}

/**
 * The game window's scrollback depths offered in Options → Appearance
 * (ADR 0046). Each row costs about 4–6 KB of browser memory.
 */
export const SCROLLBACK_CHOICES: readonly number[] = [5000, 10000, 20000, 50000];
/** The default depth (spec §1.3). */
export const DEFAULT_SCROLLBACK_ROWS = 20000;

/** The game window (output pane). Not in `ViewSnapshot`: a log plays with the viewer's own. */
export interface OutputSettings {
  /** Rows kept in the scrollback, one of `SCROLLBACK_CHOICES`. */
  scrollback: number;
  /**
   * The live part of the split game window while scrolled back, as a share
   * of the game window's height (ADR 0117, desktop only). Set by dragging
   * the divider; between `SPLIT_SHARE_MIN` and `SPLIT_SHARE_MAX`.
   */
  splitShare: number;
}

/** The split's default live share (owner, ADR 0117). */
export const DEFAULT_SPLIT_SHARE = 0.3;
/** Bounds of a stored split share (the pane also keeps 2 rows on each side). */
export const SPLIT_SHARE_MIN = 0.02;
export const SPLIT_SHARE_MAX = 0.95;

/**
 * The input line's behaviour (Options hub, ADR 0063). Not in
 * `ViewSnapshot`: a log player has no command line of the recorder's.
 */
export interface InputSettings {
  /** Enter leaves the line empty instead of the sent text, selected (tt++ style). */
  autoClear: boolean;
  /** Grey inline suggestion from history after a space (fish style). */
  autosuggest: boolean;
}

/** The map pane's hover box (ADR 0077): none, name + note, or the full room. */
export type MapHoverMode = 'off' | 'minimal' | 'full';
export const MAP_HOVER_MODES: readonly MapHoverMode[] = ['off', 'minimal', 'full'];

/** The hover box's text size (ADR 0077 rounds 1–2): 0.72 / 0.85 / 1 of the cockpit's font size. */
export type MapHoverSize = 'small' | 'medium' | 'large';
export const MAP_HOVER_SIZES: readonly MapHoverSize[] = ['small', 'medium', 'large'];

/**
 * Options → Mapper (ADR 0077). Not in `ViewSnapshot`: a log plays with the
 * viewer's own.
 */
export interface MapperSettings {
  /** Show the map file's room notes in the game window (MMapper `showNotes`). */
  notes: boolean;
  /** The map pane's hover box: off, room name and note, or the full room. */
  hover: MapHoverMode;
  /** The hover box's text size. */
  hoverSize: MapHoverSize;
  /**
   * The map's tileset (ADR 0082): a `TILESET_CHOICES` id from
   * src/map/tilesets.ts (`default`, a set, or a seasonal family).
   */
  tileset: string;
  /**
   * The map's background colour, `#rrggbb` (ADR 0085): MMapper's
   * `#2e3436` by default, one of the named choices of
   * src/map/backgrounds.ts.
   */
  background: string;
  /**
   * The background the user had before choosing a tileset with a
   * recommended background (ADR 0088), restored when they choose a set
   * without one; `''`: none remembered.
   */
  backgroundBefore: string;
}

/**
 * Options → Weather effects (stage 28 trial, ADR 0091): the master switch
 * (default off; off = the engine is not even loaded) and the six effect
 * categories. Not in `ViewSnapshot`: a log plays with the viewer's own.
 */
export interface WeatherSettings {
  enabled: boolean;
  /** Sky gradient, clouds, sun moments, moon, stars. */
  sky: boolean;
  /** The blue day sky (under Sky); off: the page background by day, everything else stays (owner feedback 36). */
  daySky: boolean;
  /** Rain, drips, snow. */
  precipitation: boolean;
  /** The bolt on a lightning message. */
  lightning: boolean;
  fog: boolean;
  /** The darkness sky and Event.Darkness. */
  darkness: boolean;
  /** Sleeping, stunned, incapacitated, dying. */
  body: boolean;
}

/** The six categories, in the Options page's order. */
export const WEATHER_CATEGORIES = ['sky', 'precipitation', 'lightning', 'fog', 'darkness', 'body'] as const;

/**
 * A window's place in whole cells on the cockpit grid (stage 30 S8, ADR
 * 0103): the outer box, as last moved or resized. Shown fitted to the
 * screen (src/chrome/kit/window-geom.ts `fitRect`).
 */
export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The ids of the movable windows (ADR 0103). */
export const WINDOW_IDS = ['profile', 'scripts'] as const;
export type WindowId = (typeof WINDOW_IDS)[number];

/**
 * Where each window was last placed (ADR 0103); null: never moved or
 * resized, so it opens at the default place. Global, not per profile.
 */
export type WindowSettings = Record<WindowId, WindowRect | null>;

export interface Settings {
  /** Schema version of the stored object (bumped only for non-additive changes). */
  version: number;
  appearance: AppearanceSettings;
  panes: PaneSettingsMap;
  layout: LayoutModel;
  /** Selected profile name. */
  profile: string;
  group: GroupSettings;
  comm: CommSettings;
  timers: TimersSettings;
  spotlights: SpotlightSettings;
  output: OutputSettings;
  input: InputSettings;
  mapper: MapperSettings;
  weather: WeatherSettings;
  windows: WindowSettings;
}

/**
 * The settings a log player needs to rebuild the screen (everything but the
 * input line's behaviour and the profile). Recorded in the run capture as a
 * `VIEW` record (ADR 0016).
 */
export type ViewSnapshot = Pick<Settings, 'appearance' | 'panes' | 'layout' | 'group' | 'comm' | 'timers'>;

/** The `ViewSnapshot` of `s` (shares its objects; serialise, do not mutate). */
export function viewSnapshot(s: Readonly<Settings>): ViewSnapshot {
  return {
    appearance: s.appearance,
    panes: s.panes,
    layout: s.layout,
    group: s.group,
    comm: s.comm,
    timers: s.timers,
  };
}

// 2: the hover default became Full (ADR 0080); a stored v1 'minimal' moves to 'full'.
// 3: the bundled pane bar script was removed (ADR 0111); a stored v2 or older
//    drops its pane `panebar/bar` from `panes` and the layout.
// 4: Group and Timers redesign (ADR 0122): timer colours became `auto` or a
//    hex (an old swatch name migrates by value, any version), the per-group
//    cols/clock/bar and `compact` went.
export const SETTINGS_VERSION = 4;

/**
 * The appearance values that were the defaults before ADR 0078 (DejaVu
 * Sans Mono 15, bold is weight only). A stored appearance that lacks one
 * of these keys (or holds an invalid value) takes the old value, so an
 * existing user's look never changes with the new-user defaults. Only a
 * missing appearance (a new user, garbage) takes `defaultSettings()`.
 */
export const LEGACY_APPEARANCE: Readonly<Pick<AppearanceSettings, 'font' | 'size' | 'boldBright'>> = Object.freeze({
  font: 'dejavu',
  size: 15,
  boldBright: false,
});

/**
 * The mapper values that were the defaults before ADR 0092 (the MMapper
 * tileset on the default dark grey). A stored mapper section that lacks
 * one (or holds an invalid value) takes these, so an existing user's map
 * does not change with the new-player defaults (Shimrod, Transparent).
 */
export const LEGACY_MAPPER: Readonly<Pick<MapperSettings, 'tileset' | 'background'>> = Object.freeze({
  tileset: 'default',
  background: '#2e3436',
});

/** The single default. Treat as read-only; `defaultSettings()` returns a fresh copy. */
export const DEFAULT_SETTINGS: Readonly<Settings> = deepFreeze(defaultSettings());

/** A fresh, mutable copy of the defaults. */
export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    appearance: {
      font: 'hack',
      size: 17,
      padding: 0,
      fg: DEFAULT_TERM_FG,
      bg: DEFAULT_TERM_BG,
      ansi: DOS_PALETTE.slice(),
      cursorStyle: 'beam',
      cursorBlink: true,
      inputColor: DEFAULT_INPUT_COLOR,
      boldBright: true,
    },
    panes: {
      character: { on: false, color: 'black', border: true, glass: true },
      timers: { on: true, color: 'black', border: true, glass: true },
      group: { on: true, color: 'black', border: true, glass: true },
      comm: { on: true, color: 'black', border: true, glass: true },
      ui: { on: false, color: 'black', border: false, glass: true },
      map: { on: true, color: 'black', border: false, glass: false },
      // Off for everyone until switched on in the Panes popup (ADR 0109).
      statistics: { on: false, color: 'black', border: true, glass: true },
      // The pre-placed bundled script pane (ADR 0078): Map search starts
      // off (its script runs, the pane waits).
      [MAPSEARCH_PANE]: { on: false, color: 'black', border: true, glass: true },
    },
    layout: defaultLayout(),
    profile: 'default',
    group: defaultGroupSettings(),
    comm: { filters: {}, showHeader: true },
    timers: defaultTimersSettings(),
    spotlights: { achievements: true, deaths: true, levelUps: true, pvp: true, allCharacters: true, characters: [], period: 'all' },
    output: { scrollback: DEFAULT_SCROLLBACK_ROWS, splitShare: DEFAULT_SPLIT_SHARE },
    input: { autoClear: false, autosuggest: false },
    mapper: { notes: true, hover: 'full', hoverSize: 'medium', tileset: 'shimrod', background: 'transparent', backgroundBefore: '' },
    weather: { enabled: true, sky: true, daySky: true, precipitation: true, lightning: true, fog: true, darkness: true, body: true },
    windows: { profile: null, scripts: null },
  };
}

/** Font size a new phone starts with (ADR 0081): the banner fits with a margin. */
export const PHONE_FONT_SIZE = 14;

/**
 * The defaults on a phone (ADR 0081, ADR 0092): `defaultSettings()` with a
 * smaller font, the UI pane off, Character on and the weather off. Used only where the store starts from the
 * defaults (a new user, reset); stored settings never take it.
 */
export function phoneDefaultSettings(): Settings {
  const s = defaultSettings();
  s.appearance.size = PHONE_FONT_SIZE;
  s.panes.ui.on = false;
  // ADR 0092 is desktop only: a phone keeps its Character tab and no weather (battery).
  s.panes.character.on = true;
  s.weather.enabled = false;
  return s;
}

/** Group defaults (ADR 0122): players, labeled NPCs, the room name when away, Auto colours. */
export function defaultGroupSettings(): GroupSettings {
  return { showPlayers: true, npcMode: 'labeled', away: 'room', colors: { hp: 'auto', mana: 'auto', mp: 'auto' } };
}

/** Timers defaults (ADR 0122): every group on in Auto colour, bars, flow, headers, time text. */
export function defaultTimersSettings(): TimersSettings {
  const g = (): TimerGroupSettings => ({ enabled: true, color: 'auto', layout: 'default' });
  return {
    groups: { sanct: g(), spell: g(), buff: g(), debuff: g(), stored: g(), blind: g(), charm: g() },
    style: 'bars',
    layout: 'flow',
    cols: 'auto',
    headers: true,
    timeText: true,
    signal: 'text',
    warnAt: 20,
    soonestFirst: true,
  };
}

/** A recursive partial, for `SettingsStore.update`. Arrays are replaced whole. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type SettingsPatch = DeepPartial<Settings>;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}
