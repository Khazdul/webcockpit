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

/** ANSI colour names, index 0–15, for the palette editor. */
export const ANSI_NAMES: readonly string[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'bright black', 'bright red', 'bright green', 'bright yellow',
  'bright blue', 'bright magenta', 'bright cyan', 'bright white',
];

/** Default terminal foreground and background (Inv §10.2). */
export const DEFAULT_TERM_FG = '#c0c0c0';
export const DEFAULT_TERM_BG = '#000000';

/** Font colour presets, in cycle order (`TERMINAL_FG`). */
export const TERMINAL_FG_PRESETS: readonly NamedColor[] = [
  { name: 'sage', hex: '#778a8d' },
  { name: 'silver', hex: '#c0c0c0' },
  { name: 'ash', hex: '#a0a0a0' },
  { name: 'stone', hex: '#808080' },
  { name: 'shadow', hex: '#606060' },
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

/** One pane tint (Inv §10.4 "Pane tints"). */
export interface PaneTint {
  /** Fill colour, or null for `black` (None): the terminal background. */
  fill: string | null;
  /** Border on a dark effective background (fill + 0x14/channel), or null for None. */
  border: string | null;
  /** Hue and saturation of the shade ramp, or null for None (from the terminal bg). */
  hs: readonly [number, number] | null;
  /** Label in the Options → Panes grid. */
  label: string;
}

export const PANE_TINTS: Readonly<Record<PaneColor, PaneTint>> = {
  black: { fill: null, border: null, hs: null, label: 'None' },
  red: { fill: '#1a0e0e', border: '#2e2222', hs: [2, 60], label: 'Red' },
  green: { fill: '#0e1a0e', border: '#222e22', hs: [130, 42], label: 'Green' },
  blue: { fill: '#0e141c', border: '#222830', hs: [210, 58], label: 'Blue' },
  grey: { fill: '#161616', border: '#2a2a2a', hs: [0, 0], label: 'Grey' },
  orange: { fill: '#1c140a', border: '#30281e', hs: [28, 62], label: 'Orange' },
  purple: { fill: '#16101c', border: '#2a2430', hs: [278, 46], label: 'Purple' },
};

/**
 * UI colour roles (Inv §10.3, §10.9). Static: they assume a dark canvas.
 * Set on :root by src/theme/apply.ts as `--c-<key>`. Weight and style
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

/** Banner colours (Inv §10.7), set on :root as `--banner-*` / `--star-*`. */
export const BANNER_COLORS: Readonly<Record<string, string>> = {
  'banner-word': '#00d0d0',
  'banner-word-dim': '#0a9a9c',
  'star-dim': '#1f595b',
  'star-mid': '#2f9092',
  'star-bright': '#74e8e8',
};

/** UI-messages pane prefix colours (Inv §10.3), set as `--ui-<key>`. */
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
