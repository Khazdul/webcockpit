// Colour data (Inv §10.2, §10.3, §10.4). Pure data, no DOM.

import type { PaneColor } from '../layout/types';

/** A named colour choice. */
export interface NamedColor {
  name: string;
  hex: string;
}

/** The DOS palette, ANSI indices 0–15 (normal 0–7, bright 8–15), Inv §10.2. */
export const DOS_PALETTE: readonly string[] = [
  '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
  '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
];

/**
 * The palette Options → Appearance sets with the `paper` background: the
 * same hues in dark ink, every colour at least 4.5:1 on #f4ecd8. White and
 * bright white become dark grey and black; bright black stays a mid grey.
 */
export const PAPER_PALETTE: readonly string[] = [
  '#000000', '#a01c1c', '#2a6e1a', '#7a5c00', '#1c3c9a', '#8a2a8a', '#106a72', '#4a4538',
  '#6e6858', '#c42020', '#2f7a14', '#846400', '#2a56c8', '#a828a8', '#00737e', '#000000',
];

/** ANSI colour names, index 0–15, for the palette editor. */
export const ANSI_NAMES: readonly string[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'bright black', 'bright red', 'bright green', 'bright yellow',
  'bright blue', 'bright magenta', 'bright cyan', 'bright white',
];

/** Default terminal foreground and background (Inv §10.2). */
export const DEFAULT_TERM_FG = '#c0c0c0';
export const DEFAULT_TERM_BG = '#000000';

/**
 * Font colour presets, in cycle order (`TERMINAL_FG`). Silver and ink are
 * the black and paper defaults; mist, wheat, lavender and frost are the
 * dark background themes' font colours (ADR 0062).
 */
export const TERMINAL_FG_PRESETS: readonly NamedColor[] = [
  { name: 'sage', hex: '#778a8d' },
  { name: 'silver', hex: '#c0c0c0' },
  { name: 'mist', hex: '#93a1a1' },
  { name: 'wheat', hex: '#d5c4a1' },
  { name: 'lavender', hex: '#a9b1d6' },
  { name: 'frost', hex: '#d8dee9' },
  { name: 'ink', hex: '#000000' },
];

/** Background presets, in cycle order (`TERMINAL_BG_ORDER`). */
export const TERMINAL_BG_PRESETS: readonly NamedColor[] = [
  { name: 'black', hex: '#000000' },
  { name: 'red', hex: '#1a0e0e' },
  { name: 'green', hex: '#0e1a0e' },
  { name: 'blue', hex: '#0e141c' },
  { name: 'grey', hex: '#161616' },
  { name: 'orange', hex: '#1c140a' },
  { name: 'purple', hex: '#16101c' },
  { name: 'teal', hex: '#002b36' },
  { name: 'sepia', hex: '#2b1b12' },
  { name: 'slate', hex: '#1c2128' },
  { name: 'paper', hex: '#f4ecd8' },
];

/** The preset name for a hex colour, or null for an off-palette value. */
export function presetName(list: readonly NamedColor[], hex: string): string | null {
  const h = hex.toLowerCase();
  return list.find((c) => c.hex === h)?.name ?? null;
}

/** The font colour and ANSI palette that go with a background (ADR 0061). */
export interface BackgroundTheme {
  fg: string;
  ansi: readonly string[];
}

/**
 * The theme Options → Appearance sets with each background preset (ADR
 * 0058, 0061). `black` keeps the DOS palette and silver (the Cockpit look);
 * `paper` has ink and PAPER_PALETTE; every dark preset has its own palette
 * after an established terminal theme, lifted where needed so colours 1–15
 * read at 4.5:1 or better. Colour 0 is the theme's black, a shade above
 * the background; the font colour is colour 7, so bold brightens it to 15.
 */
export const BACKGROUND_THEMES: Readonly<Record<string, BackgroundTheme>> = {
  black: { fg: DEFAULT_TERM_FG, ansi: DOS_PALETTE },
  paper: { fg: '#000000', ansi: PAPER_PALETTE },
  red: {
    // Kanagawa Dragon
    fg: '#d5c4a1',
    ansi: [
      '#2a1d1d', '#c4746e', '#87a987', '#c4b28a', '#8ba4b0', '#a292a3', '#8ea4a2', '#d5c4a1',
      '#a6a69c', '#e6717e', '#a3c79a', '#e6c384', '#7fb4ca', '#a69fb8', '#8cb4ac', '#e8e2c8',
    ],
  },
  green: {
    // Everforest
    fg: '#d5c4a1',
    ansi: [
      '#1f2e1f', '#e67e80', '#a7c080', '#dbbc7f', '#7fbbb3', '#d699b6', '#83c092', '#d5c4a1',
      '#859289', '#f4a0a2', '#bfd69a', '#ecd29a', '#9fd4cc', '#e8b4cc', '#a2d6ad', '#f2ead4',
    ],
  },
  blue: {
    // Tokyo Night
    fg: '#a9b1d6',
    ansi: [
      '#1c2433', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6',
      '#7f87ad', '#ff9eae', '#b9f27c', '#ffc777', '#9dbcff', '#d2bcff', '#b4f9f8', '#d6dcf8',
    ],
  },
  grey: {
    // Tomorrow Night
    fg: '#c0c0c0',
    ansi: [
      '#282a2e', '#cc6666', '#b5bd68', '#f0c674', '#81a2be', '#b294bb', '#8abeb7', '#c0c0c0',
      '#969896', '#ff8080', '#d0d87e', '#ffd98a', '#a3c4e0', '#d0b0d8', '#a8dcd4', '#eaeaea',
    ],
  },
  orange: {
    // Ayu
    fg: '#c0c0c0',
    ansi: [
      '#2c2216', '#f07178', '#aad94c', '#e6b450', '#59c2ff', '#d2a6ff', '#95e6cb', '#c0c0c0',
      '#8a8986', '#ff9a9f', '#c4ee6e', '#ffcf6e', '#8ad4ff', '#e4c6ff', '#b8f4e0', '#ece9e0',
    ],
  },
  purple: {
    // Dracula
    fg: '#d8dee9',
    ansi: [
      '#282236', '#ff5555', '#50fa7b', '#f1fa8c', '#8a9cff', '#ff79c6', '#8be9fd', '#d8dee9',
      '#8a87a8', '#ff8a8a', '#86ffa4', '#fbffb0', '#b4c0ff', '#ffa6da', '#b6f3ff', '#f8f8f2',
    ],
  },
  teal: {
    // Solarized
    fg: '#93a1a1',
    ansi: [
      '#073642', '#e56462', '#859900', '#b58900', '#3694d5', '#dd629e', '#2aa198', '#93a1a1',
      '#839496', '#f2706b', '#a4bb1e', '#d9a81e', '#5aaef0', '#ec6ca7', '#4cc4b9', '#fdf6e3',
    ],
  },
  sepia: {
    // Gruvbox
    fg: '#d5c4a1',
    ansi: [
      '#3c2a1e', '#da5e59', '#98971a', '#d79921', '#548f92', '#b86f90', '#689d6a', '#d5c4a1',
      '#a89984', '#fb5946', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#fbf1c7',
    ],
  },
  slate: {
    // Nord
    fg: '#d8dee9',
    ansi: [
      '#2e3440', '#c46e76', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#d8dee9',
      '#7b88a1', '#d98a92', '#bfd8a8', '#f5dca8', '#a3c0e0', '#ccaacb', '#a8dce8', '#eceff4',
    ],
  },
};

/** The theme for a background preset, or null for an off-palette colour. */
export function backgroundTheme(bg: string): BackgroundTheme | null {
  const name = presetName(TERMINAL_BG_PRESETS, bg);
  return name ? (BACKGROUND_THEMES[name] ?? null) : null;
}

/** One pane tint (Inv §10.4 "Pane tints"). */
export interface PaneTint {
  /** Fill colour, or null for `black` (Plain): the terminal background. */
  fill: string | null;
  /** Border on a dark effective background (fill + 0x14/channel), or null for None. */
  border: string | null;
  /** Hue and saturation of the shade ramp, or null for None (from the terminal bg). */
  hs: readonly [number, number] | null;
  /** Label in the Options → Panes grid. */
  label: string;
}

export const PANE_TINTS: Readonly<Record<PaneColor, PaneTint>> = {
  black: { fill: null, border: null, hs: null, label: 'Plain' },
  red: { fill: '#1a0e0e', border: '#2e2222', hs: [2, 60], label: 'Red' },
  green: { fill: '#0e1a0e', border: '#222e22', hs: [130, 42], label: 'Green' },
  blue: { fill: '#0e141c', border: '#222830', hs: [210, 58], label: 'Blue' },
  grey: { fill: '#161616', border: '#2a2a2a', hs: [0, 0], label: 'Grey' },
  orange: { fill: '#1c140a', border: '#30281e', hs: [28, 62], label: 'Orange' },
  purple: { fill: '#16101c', border: '#2a2430', hs: [278, 46], label: 'Purple' },
};

/**
 * UI colour roles (Inv §10.3, §10.9) on a dark terminal background. Set on
 * :root by src/theme/apply.ts as `--c-<key>`; on a light background the
 * roles come from UI_COLORS_LIGHT instead (ADR 0041). Weight and style
 * (bold, italic) belong to the components that use them.
 */
export const UI_COLORS: Readonly<Record<string, string>> = {
  title: '#00d7d7',
  section: '#008787',
  header: '#ffd060',
  active: '#ffffff',
  item: '#bcbcbc',
  hover: '#dadada',
  body: '#8a8a8a',
  hint: '#585858',
  off: '#3a3a3a',
  accent: '#ffaf00',
  cursor: '#ffaf00',
  yellow: '#ffd75f',
  err: '#ff5f5f',
  danger: '#a04030',
  ok: '#7ac46f',
  note: '#b8923c',
  quote: '#8a8a8a',
  'quote-attr': '#87af87',
  'sel-fg': '#000000',
  'sel-bg': '#bcbcbc',
  'focus-bg': '#ffaf00',
  'scroll-thumb': '#ffffff',
  'scroll-track': '#585858',
  'syn-cmd': '#5fafaf',
  'syn-brace': '#8290a0',
  'syn-delim': '#c8a060',
  'syn-var': '#87af87',
  'syn-code': '#9b86b3',
  'brace-match-bg': '#3a3a3a',
};

/**
 * The UI roles on a light terminal background (ADR 0041): the same roles in
 * dark ink, tuned on `paper` (#f4ecd8). src/theme/apply.ts `themeColors`
 * darkens a text role further when another light background needs it
 * (UI_MIN_CONTRAST) and derives the fills from the background itself:
 * `sel-fg` is the background (a selected row is a dark bar with the
 * background's colour as ink), `off`, `scroll-track` and `brace-match-bg`
 * are the background mixed toward black.
 */
export const UI_COLORS_LIGHT: Readonly<Record<string, string>> = {
  title: '#006068',
  section: '#2f7474',
  header: '#7a5200',
  active: '#000000',
  item: '#3a362e',
  hover: '#1c1a15',
  body: '#5c564a',
  hint: '#797160',
  accent: '#9a5400',
  cursor: '#9a5400',
  yellow: '#6e5a00',
  err: '#b3261e',
  danger: '#9c3a2a',
  ok: '#2e6b26',
  note: '#7a5a10',
  quote: '#797160',
  'quote-attr': '#4a6e4a',
  'sel-bg': '#5a5448',
  'focus-bg': '#8a4c00',
  'scroll-thumb': '#2a261e',
  'syn-cmd': '#1f6f78',
  'syn-brace': '#5a6878',
  'syn-delim': '#8a5a12',
  'syn-var': '#3a7030',
  'syn-code': '#6a4a90',
};

/** Light-background fills: the terminal bg mixed toward black by this much. */
export const UI_LIGHT_FILLS: Readonly<Record<string, number>> = {
  off: 0.3,
  'scroll-track': 0.3,
  'brace-match-bg': 0.16,
};

/**
 * Least WCAG contrast of a UI text role against a light terminal
 * background (`sel-bg` and `focus-bg`: against `sel-fg`). Roles not listed
 * are fills or deliberately faint (`off`).
 */
export const UI_MIN_CONTRAST: Readonly<Record<string, number>> = {
  title: 4.5,
  section: 4.5,
  header: 4.5,
  active: 4.5,
  item: 4.5,
  hover: 4.5,
  body: 4.5,
  hint: 3,
  accent: 4.5,
  cursor: 4.5,
  yellow: 4.5,
  err: 4.5,
  danger: 4.5,
  ok: 4.5,
  note: 4.5,
  quote: 3,
  'quote-attr': 4.5,
  'sel-bg': 4.5,
  'focus-bg': 4.5,
  'scroll-thumb': 4.5,
  'syn-cmd': 4.5,
  'syn-brace': 4.5,
  'syn-delim': 4.5,
  'syn-var': 4.5,
  'syn-code': 4.5,
};

/** Banner colours (Inv §10.7), set on :root as `--banner-*` / `--star-*`. */
export const BANNER_COLORS: Readonly<Record<string, string>> = {
  'banner-word': '#00d0d0',
  'banner-word-dim': '#0a9a9c',
  'star-dim': '#1f595b',
  'star-mid': '#2f9092',
  'star-bright': '#74e8e8',
};

/** The banner on a light background: the word in dark teal, stars fading into the paper. */
export const BANNER_COLORS_LIGHT: Readonly<Record<string, string>> = {
  'banner-word': '#00727a',
  'banner-word-dim': '#3a9aa0',
  'star-dim': '#b9cfc8',
  'star-mid': '#6aa6a6',
  'star-bright': '#0a6f74',
};

export const BANNER_MIN_CONTRAST: Readonly<Record<string, number>> = {
  'banner-word': 4.5,
  'star-bright': 3,
};

/**
 * UI-messages pane prefix colours (Inv §10.3), set as `--ui-<key>`. On a
 * light background each is `lightShift`ed and held to 4.5:1 (ADR 0041).
 */
export const UI_MESSAGE_COLORS: Readonly<Record<string, string>> = {
  script: '#26c6da',
  system: '#42a5f5',
  warn: '#ffb300',
  err: '#e53935',
  spell: '#7aa9d6',
  buff: '#8fbc8f',
  debuff: '#c97070',
  store: '#b39ddb',
  blind: '#00cccc',
  charm: '#b388ff',
  herb: '#9ccc65',
  value: '#ffee58',
};

/**
 * Statistics and History data colours (Inv §7.3, §7.4; Cockpit's private
 * statistics palette), set on :root as `--st-<key>`.
 */
export const STATS_COLORS: Readonly<Record<string, string>> = {
  value: '#ffffff',
  label: '#909090',
  gained: '#6fe060',
  loss: '#e03c3c',
  tp: '#ffc847',
  track: '#1f1f1f',
  thumb: '#707070',
  total: '#b0b0b0',
  arrow: '#b0b0b0',
  hint: '#5c5c5c',
  pvp: '#ff5f5f',
  ally: '#00d7d7',
  star: '#ffd060',
};

/** The Statistics / History colours on a light background (ADR 0041). */
export const STATS_COLORS_LIGHT: Readonly<Record<string, string>> = {
  value: '#000000',
  label: '#5c564a',
  gained: '#26731b',
  loss: '#b3261e',
  tp: '#8a5a00',
  thumb: '#7c7564',
  total: '#3a362e',
  arrow: '#3a362e',
  hint: '#797160',
  pvp: '#b3261e',
  ally: '#006068',
  star: '#8a5e00',
};

/** `--st-track` on a light background: the terminal bg this far toward black. */
export const STATS_LIGHT_TRACK = 0.12;

export const STATS_MIN_CONTRAST: Readonly<Record<string, number>> = {
  value: 4.5,
  label: 4.5,
  gained: 4.5,
  loss: 4.5,
  tp: 4.5,
  thumb: 3,
  total: 4.5,
  arrow: 4.5,
  hint: 3,
  pvp: 4.5,
  ally: 4.5,
  star: 4.5,
};

/** Input color choices (ADR 0035), in the Appearance cycle order. */
export type InputColor = 'none' | 'steel' | 'bright' | 'sand' | 'sage' | 'cyan' | 'amber';
export const INPUT_COLOR_IDS: readonly InputColor[] = ['none', 'steel', 'bright', 'sand', 'sage', 'cyan', 'amber'];
/** The default for new users, and for recordings made before ADR 0035. */
export const DEFAULT_INPUT_COLOR: InputColor = 'steel';

/**
 * One input colour: `color-mix(in oklab, <terminal fg> pct%, tint)`, the
 * tint chosen by the terminal bg (`dark` on a dark bg, `light` on a light
 * one). `none` has no mix: the plain terminal fg.
 */
export interface InputColorPreset {
  label: string;
  mix: { pct: number; dark: string; light: string } | null;
}

export const INPUT_COLORS: Readonly<Record<InputColor, InputColorPreset>> = {
  none: { label: 'None', mix: null },
  steel: { label: 'Steel', mix: { pct: 55, dark: '#7fb2e6', light: '#1f5f9e' } },
  bright: { label: 'Bright', mix: { pct: 55, dark: '#ffffff', light: '#000000' } },
  sand: { label: 'Sand', mix: { pct: 55, dark: '#e2bf7e', light: '#8a5a12' } },
  sage: { label: 'Sage', mix: { pct: 50, dark: '#9fd08c', light: '#2f6e25' } },
  // The two drastic ones: mostly the tint.
  cyan: { label: 'Cyan', mix: { pct: 15, dark: '#00d7d7', light: '#007a8a' } },
  amber: { label: 'Amber', mix: { pct: 15, dark: '#ffaf00', light: '#9a5a00' } },
};
