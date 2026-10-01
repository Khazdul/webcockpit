// The settings object (ADR 0010 "Settings"). One typed object with one
// default; `migrateSettings` (migrate.ts) fills missing keys from
// `DEFAULT_SETTINGS` and clamps every value, so stored data from any
// older version loads.

import { type LayoutModel, type PaneColor, type PaneId, defaultLayout } from '../layout/types';
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
}

export interface PaneSettings {
  /** Shown. Allocation never changes this (ADR 0010). */
  on: boolean;
  color: PaneColor;
  /** Draw the half-block frame. */
  border: boolean;
}

/** Which unlabeled NPCs the Group pane shows (Inv §2.3, ADR 0016). */
export type GroupNpcMode = 'off' | 'labeled' | 'all';
export const GROUP_NPC_MODES: readonly GroupNpcMode[] = ['off', 'labeled', 'all'];

/** Options → Panes → Group. */
export interface GroupSettings {
  /** Show player allies. */
  showPlayers: boolean;
  /** `off`: no NPCs; `labeled`: labeled NPCs only; `all`: unlabeled ones too. */
  npcMode: GroupNpcMode;
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

/** The seven Timers swatches (Inv §2.6.3), in the Options column order. */
export type TimerColor = 'blue' | 'green' | 'red' | 'magenta' | 'cyan' | 'violet' | 'orange';
export const TIMER_COLOR_ORDER: readonly TimerColor[] = ['blue', 'green', 'red', 'magenta', 'cyan', 'violet', 'orange'];
/** Swatch colours (bar fill; charm name colour). */
export const TIMER_COLOR_HEX: Readonly<Record<TimerColor, string>> = {
  blue: '#66b2ff',
  green: '#00d900',
  red: '#d90000',
  magenta: '#ff66ff',
  cyan: '#00cccc',
  violet: '#b388ff',
  orange: '#ff9933',
};
/** Swatch labels (the Options header row). */
export const TIMER_COLOR_LABELS: Readonly<Record<TimerColor, string>> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  magenta: 'Magenta',
  cyan: 'Cyan',
  violet: 'Violet',
  orange: 'Orange',
};
/** Column caps: 1–6, Charmies 1–2 (Inv §2.6.3). */
export const TIMER_COLS_MIN = 1;
export const TIMER_COLS_MAX = 6;
export const TIMER_CHARM_COLS_MAX = 2;

/** The column cap limit of a group. */
export function timerColsMax(g: TimerGroup): number {
  return g === 'charm' ? TIMER_CHARM_COLS_MAX : TIMER_COLS_MAX;
}

/** One Timers group's look (Options → Panes → Timers). */
export interface TimerGroupSettings {
  /** Shown (a swatch is checked); the colour is remembered while off. */
  enabled: boolean;
  color: TimerColor;
  /** Column cap, a ceiling (1–6, Charmies 1–2). */
  cols: number;
  /** Countdown over the bar (never on Charmies). */
  clock: boolean;
  /** Drain bar; off paints the name in the group colour (Charmies never have one). */
  bar: boolean;
}

/** Options → Panes → Timers (Inv §2.6.3, ADR 0017), global. */
export interface TimersSettings {
  groups: Record<TimerGroup, TimerGroupSettings>;
  /** A dim `Group:` header row above each group. */
  headers: boolean;
  /** No blank row between groups. */
  compact: boolean;
}

/** Options → Spotlights (Inv §3.8, ADR 0019): event kinds shown in the reel and Credits, global. */
export interface SpotlightSettings {
  achievements: boolean;
  deaths: boolean;
  levelUps: boolean;
  pvp: boolean;
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
}

export interface Settings {
  /** Schema version of the stored object (bumped only for non-additive changes). */
  version: number;
  appearance: AppearanceSettings;
  panes: Record<PaneId, PaneSettings>;
  layout: LayoutModel;
  /** Selected profile name. */
  profile: string;
  group: GroupSettings;
  comm: CommSettings;
  timers: TimersSettings;
  spotlights: SpotlightSettings;
  output: OutputSettings;
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

export const SETTINGS_VERSION = 1;

/** The single default. Treat as read-only; `defaultSettings()` returns a fresh copy. */
export const DEFAULT_SETTINGS: Readonly<Settings> = deepFreeze(defaultSettings());

/** A fresh, mutable copy of the defaults. */
export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    appearance: {
      font: 'dejavu',
      size: 15,
      padding: 0,
      fg: DEFAULT_TERM_FG,
      bg: DEFAULT_TERM_BG,
      ansi: DOS_PALETTE.slice(),
      cursorStyle: 'beam',
      cursorBlink: true,
      inputColor: DEFAULT_INPUT_COLOR,
    },
    panes: {
      character: { on: true, color: 'black', border: true },
      timers: { on: true, color: 'black', border: true },
      group: { on: true, color: 'black', border: true },
      comm: { on: true, color: 'black', border: true },
      ui: { on: true, color: 'black', border: true },
      map: { on: true, color: 'black', border: true },
    },
    layout: defaultLayout(),
    profile: 'default',
    group: { showPlayers: true, npcMode: 'labeled' },
    comm: { filters: {}, showHeader: true },
    timers: defaultTimersSettings(),
    spotlights: { achievements: true, deaths: true, levelUps: true, pvp: true },
    output: { scrollback: DEFAULT_SCROLLBACK_ROWS },
  };
}

/** Timers defaults (Inv §2.6.3): all on, cols 4/4/4/4/2/1, no clock, bars on. */
export function defaultTimersSettings(): TimersSettings {
  const g = (color: TimerColor, cols: number): TimerGroupSettings => ({
    enabled: true,
    color,
    cols,
    clock: false,
    bar: true,
  });
  return {
    groups: {
      spell: g('blue', 4),
      buff: g('green', 4),
      debuff: g('red', 4),
      stored: g('magenta', 4),
      blind: g('cyan', 2),
      charm: g('violet', 1),
    },
    headers: true,
    compact: true,
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
