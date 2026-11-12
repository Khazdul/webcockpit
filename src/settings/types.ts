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
  /** Draw the frame (the lantern frame, ADR 0123). */
  border: boolean;
  /**
   * Glass background (ADR 0095): the pane's fill inside the frame, over a
   * blur with weather on. Off, the pane is clear: no fill and no blur, so
   * what lies behind it shows sharp (a frame keeps its iron band and hood,
   * ADR 0123).
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
  /** The fight card on top while you fight (ADR 0122 addendum); off by default (owner, 2026-11-05). */
  fight: boolean;
  colors: GroupVitalColors;
}

/** Longest channel name kept in `CommSettings.filters`. */
export const COMM_FILTER_KEY_MAX = 64;
/** Most entries kept in `CommSettings.filters` (a sanity bound only). */
export const COMM_FILTERS_MAX = 100;

/** "Show chats active in the last …" of the Comm pane (ADR 0134): minutes, or every chat. */
export type CommChatWindow = 10 | 30 | 60 | 'all';
export const COMM_CHAT_WINDOWS: readonly CommChatWindow[] = [10, 30, 60, 'all'];
/**
 * Channels off in Public by default (ADR 0134, owner's feedback rounds 1
 * and 2): tells, questions and socials, the talk aimed at you that lives in
 * the chats. In the defaults' filters, and turned off
 * once in settings stored before version 5 (the old pane's filters hid a
 * channel from the whole pane, so their values do not carry over).
 */
export const COMM_PUBLIC_DEFAULT_OFF: readonly string[] = ['tells', 'questions', 'socials'];
/** Narrowest and widest dragged chat column of the Comm pane (CSS px). */
export const COMM_LIST_WIDTH_MIN = 40;
export const COMM_LIST_WIDTH_MAX = 400;

/** Options → Panes → Communication and the Comm gear (ADR 0134). */
export interface CommSettings {
  /**
   * The channels shown in Public, by GMCP channel name, global (not per
   * character). Sparse: a missing channel is enabled. Only `false` entries
   * are kept, so enabling a channel is `{ comm: { filters: { tells: true } } }`
   * and the migration drops the entry. Stored filters are kept as they are;
   * new users start with `COMM_PUBLIC_DEFAULT_OFF` off.
   */
  filters: Record<string, boolean>;
  /** Public shows NPCs' talk (`talker-type` `npc`). Off by default (owner). */
  npcs: boolean;
  /** Private chats shown: active in the last 10 / 30 / 60 min, or all. */
  chatWindow: CommChatWindow;
  /** The chat column is folded away (the spine's fold). */
  folded: boolean;
  /** The chat column's dragged width in CSS px, or null for the automatic width. */
  listWidth: number | null;
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
/** The swatch each group had by default before ADR 0122 (it migrates to `auto`). */
export const TIMER_LEGACY_DEFAULT_COLOR: Readonly<Record<Exclude<TimerGroup, 'sanct' | 'herb'>, TimerColor>> = {
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

/** The lens's three fixed zoom levels (ADR 0136 §4). */
export const PHONE_LENS_LEVELS = ['near', 'middle', 'far'] as const;
export type PhoneLensLevel = (typeof PHONE_LENS_LEVELS)[number];

/** The map lens of the phone's game layout (ADR 0136 §4, §13). */
export interface PhoneLensSettings {
  /** Show the lens (off: no map on the phone's game layout, and no map load). */
  show: boolean;
  /** The zoom level the lens starts at. */
  opensAt: PhoneLensLevel;
}

/**
 * The phone's own settings (ADR 0136 §13): what the phone's layout in the
 * live game keeps. Read only there; a computer ignores the section and
 * keeps it as stored, so a settings file moved between the two behaves on
 * each as before.
 */
export interface PhoneSettings {
  lens: PhoneLensSettings;
  /** The pane strip (ADR 0136 §5): which built-in panes are pages, in their order. */
  strip: PhoneStripSettings;
  /** Comm's height in rows on the phone (ADR 0136 §6); null: the default share of the screen. */
  commRows: number | null;
  /** The pane strip's height in rows (stage 52: its band is dragged); null: the default share of the screen. */
  stripRows: number | null;
  /** What the Comm key's badge counts (ADR 0136 §6): private chats, or Group and Public too. */
  unread: PhoneUnread;
  /** The hot keys' slots K1 to K6, in that order (ADR 0136 §8, stage 52): always `PHONE_HOTKEY_COUNT` of them. */
  hotkeys: PhoneHotkey[];
  /** How many of the slots are in use (1 to `PHONE_HOTKEY_COUNT`): the slots above it are neither shown nor reachable. */
  hotkeyCount: number;
  /** The hot key column is shown (the K key). */
  hotkeysOpen: boolean;
  /**
   * Landscape (stage 52c): the width in columns of the left column that
   * holds the strip and Comm; null: the default share of the screen. The
   * heights above are portrait's only.
   */
  sideCols: number | null;
  /** Keep the screen on while connected and visible (ADR 0136 §10; where the browser can). */
  wakeLock: boolean;
  /** A dead link found on resume reconnects once, with no saved login (ADR 0136 §10). */
  autoReconnect: boolean;
  /**
   * Which of the phone's one-time defaults this device has had (stage 52):
   * 0 none, `PHONE_DEFAULTS_MARK` all. Stored settings from before the mark
   * read as 0; the phone's game layout applies what is missing once at its
   * start and writes the mark (src/phone/phone-defaults.ts). A computer
   * never acts on it.
   */
  defaults: number;
  /** The phone's own keyboard (ADR 0138). */
  keyboard: PhoneKeyboardSettings;
  /**
   * A short vibration on the press of a key of the phone's own keyboard, of
   * the compass and of a hot key (ADR 0138 §7; where the browser has
   * `navigator.vibrate`). Off by default.
   */
  vibrate: boolean;
}

/** The layouts of the phone's own keyboard: by the browser's language, Swedish, English. */
export const PHONE_KEYBOARD_LAYOUTS = ['auto', 'sv', 'en'] as const;
export type PhoneKeyboardLayout = (typeof PHONE_KEYBOARD_LAYOUTS)[number];

/** The phone's own on-screen keyboard (ADR 0138 "Settings keys"). */
export interface PhoneKeyboardSettings {
  /** The digit row is shown (its toggle key folds it up and down). */
  digits: boolean;
  /** The layout: `auto` follows the browser's language (Swedish for `sv`, else English). */
  layout: PhoneKeyboardLayout;
}

/** The newest set of one-time phone defaults (`PhoneSettings.defaults`): 1 is Herblores off, the Timers pane's time text off with the Pulse signal, and Character out of the strip. */
export const PHONE_DEFAULTS_MARK = 1;

/** How many hot key slots the phone stores (stage 52: two columns of three). */
export const PHONE_HOTKEY_COUNT = 6;
/** How many of them are in use by default (ADR 0136 §8: one column). */
export const PHONE_HOTKEY_COUNT_DEFAULT = 3;
/** The longest label of a hot key, in characters. */
export const PHONE_HOTKEY_LABEL_MAX = 4;
/** The longest stored command of a hot key (a line of commands; far above any real one). */
export const PHONE_HOTKEY_COMMAND_MAX = 200;

/** A hot key's special: a command computed at the press (wimpy at a share of the current hit points). */
export const PHONE_HOTKEY_SPECIALS = ['wimpy50', 'wimpy25'] as const;
export type PhoneHotkeySpecial = (typeof PHONE_HOTKEY_SPECIALS)[number];

/** One hot key. It lives in the phone's settings, not in the profile (ADR 0136 §8). */
export interface PhoneHotkey {
  /** What the key shows: one to `PHONE_HOTKEY_LABEL_MAX` characters. */
  label: string;
  /** The line the key sends as if typed; unused while `special` is set. */
  command: string;
  special: PhoneHotkeySpecial | null;
  /** In the column; off, the key keeps what it is set to. */
  shown: boolean;
}

/** The built-in panes that can be pages of the phone's pane strip, in the default order (ADR 0136 §5). */
export const PHONE_STRIP_PANES = ['timers', 'group', 'character', 'statistics'] as const;
export type PhoneStripPane = (typeof PHONE_STRIP_PANES)[number];

/** One built-in page of the strip: shown or not; its place in the list is its order. */
export interface PhoneStripEntry {
  id: PhoneStripPane;
  on: boolean;
}

export interface PhoneStripSettings {
  /** Every pane of `PHONE_STRIP_PANES` exactly once, in page order. Script panes follow them. */
  panes: PhoneStripEntry[];
}

export const PHONE_UNREAD_MODES = ['private', 'all'] as const;
export type PhoneUnread = (typeof PHONE_UNREAD_MODES)[number];

/** The limits of a stored Comm or strip height (the allocator fits it to the screen). */
export const PHONE_COMM_ROWS_MIN = 1;
export const PHONE_COMM_ROWS_MAX = 200;

/**
 * Phone defaults: the lens shown, at the middle zoom (ADR 0136 §4; its
 * size follows the screen, stage 52); the strip's four panes in their
 * order, all on but Character (§5, stage 52), at its default height; Comm
 * at its default height, the badge counting private chats (§6);
 * six hot key slots (assist, bash, wimpy at half of the current hit points,
 * rescue, shoot, recover) of which three are in use, shown (§8, stage 52);
 * the landscape column at its default width; the screen kept on while connected, and no
 * automatic reconnect (§10); the own keyboard's digit row folded away
 * (ADR 0138). The one-time defaults are not marked as had:
 * only `phoneDefaultSettings()` (a new phone) marks them.
 */
export function defaultPhoneSettings(): PhoneSettings {
  return {
    lens: { show: true, opensAt: 'middle' },
    strip: { panes: PHONE_STRIP_PANES.map((id) => ({ id, on: id !== 'character' })) },
    commRows: null,
    stripRows: null,
    unread: 'private',
    hotkeys: [
      { label: 'asst', command: 'assist', special: null, shown: true },
      { label: 'bash', command: 'bash', special: null, shown: true },
      { label: 'wimp', command: '', special: 'wimpy50', shown: true },
      { label: 'resc', command: 'rescue', special: null, shown: true },
      { label: 'shot', command: 'shoot', special: null, shown: true },
      { label: 'rcvr', command: 'recover', special: null, shown: true },
    ],
    hotkeyCount: PHONE_HOTKEY_COUNT_DEFAULT,
    hotkeysOpen: true,
    sideCols: null,
    wakeLock: true,
    autoReconnect: false,
    defaults: 0,
    keyboard: { digits: false, layout: 'auto' },
    vibrate: false,
  };
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
  /** The phone's layout in the live game (ADR 0136 §13); ignored on a computer. */
  phone: PhoneSettings;
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
// 5: the Comm pane's conversation view (ADR 0134): `comm.filters` shape
//    Public only; a stored v4 or older turns `COMM_PUBLIC_DEFAULT_OFF` off.
export const SETTINGS_VERSION = 5;

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
    comm: { filters: Object.fromEntries(COMM_PUBLIC_DEFAULT_OFF.map((c) => [c, false])), npcs: false, chatWindow: 30, folded: false, listWidth: null },
    timers: defaultTimersSettings(),
    spotlights: { achievements: true, deaths: true, levelUps: true, pvp: true, allCharacters: true, characters: [], period: 'all' },
    output: { scrollback: DEFAULT_SCROLLBACK_ROWS, splitShare: DEFAULT_SPLIT_SHARE },
    input: { autoClear: false, autosuggest: false },
    mapper: { notes: true, hover: 'full', hoverSize: 'medium', tileset: 'shimrod', background: 'transparent', backgroundBefore: '' },
    weather: { enabled: true, sky: true, daySky: true, precipitation: true, lightning: true, fog: true, darkness: true, body: true },
    windows: { profile: null, scripts: null },
    phone: defaultPhoneSettings(),
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
  // Stage 52 (the owner's phone defaults): no Herblores timers, no time text; Character is out of the strip
  // (`defaultPhoneSettings`). A new phone has them from the start, so nothing is applied later.
  s.timers.groups.herb.enabled = false;
  // The Timers pane's countdown text is off too: bars only, in the strip's few columns.
  s.timers.timeText = false;
  // Without the text the "Time text" signal would show nothing: ending soon pulses instead.
  s.timers.signal = 'pulse';
  s.phone.defaults = PHONE_DEFAULTS_MARK;
  return s;
}

/** Group defaults (ADR 0122): players, labeled NPCs, the room name when away, no fight card (owner), Auto colours. */
export function defaultGroupSettings(): GroupSettings {
  return { showPlayers: true, npcMode: 'labeled', away: 'room', fight: false, colors: { hp: 'auto', mana: 'auto', mp: 'auto' } };
}

/** Timers defaults (ADR 0122): every group on in Auto colour, bars, flow, headers, time text. */
export function defaultTimersSettings(): TimersSettings {
  const g = (): TimerGroupSettings => ({ enabled: true, color: 'auto', layout: 'default' });
  return {
    groups: { herb: g(), sanct: g(), spell: g(), buff: g(), debuff: g(), stored: g(), blind: g(), charm: g() },
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
