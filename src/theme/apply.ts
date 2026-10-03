// Settings → CSS custom properties (ADR 0010 "Theme", Inv §10.9).
//
// Root (`applyTheme`, on <html>):
//   --term-fg --term-bg --ansi-0..15       terminal colours
//   --font-mono --pad                      font stack, app padding
//   --c-<role>                              UI roles (presets.ts UI_COLORS, or
//                                           UI_COLORS_LIGHT on a light bg;
//                                           `themeColors`, ADR 0041)
//   --c-line-hl                             editor current-line band
//   --term-echo                             input colour: command echo and
//                                           input line (ADR 0034, 0035)
//   --bold-0..7 --bold-fg --bold-fg-def     bold colours (ADR 0060)
//   --banner-* --star-* --ui-*              banner and UI-message colours
//   --st-*                                  Statistics / History data colours
//                                           (all three light-aware as --c-*)
//   --pane-bg-<tint> --pane-border-<tint>   every tint for swatches
//   data-cursor="block|beam|underline", data-cursor-blink="on|off",
//   data-light (present when the terminal bg is light)
//   --wc-af-<rrggbb> --wc-ab-<rrggbb>       adaptive colours in use, resolved
//                                           for this bg (ADR 0068,
//                                           src/theme/adaptive.ts)
// --font-size, --cell-w and --cell-h are published by src/theme/cells.ts
// (the font size is calibrated to whole-pixel cells there).
//
// Per pane (`applyPaneTheme`, on the pane element; package B calls it on
// every settings change):
//   --pane-bg --pane-border
//   --pane-shade-{track,dim,mid,pane-bg,vtext,label,glow}
//   data-light (present when the pane's effective bg is light)
//
// Everything is recomputed from the settings on every call; nothing is
// cached (Inv §10.5).

import { PANE_COLORS, type PaneId } from '../layout/types';
import { type AppearanceSettings, type Settings, paneSettingsOf } from '../settings/types';
import {
  SHADE_ROLES,
  type ShadeRole,
  contrast,
  fitContrast,
  isLight,
  lightShift,
  lineHighlight,
  mix,
  normalizeHex,
  paneBorder,
  paneEffectiveBg,
  paneIsLight,
  paneShades,
  takesDarkInk,
} from './color';
import { applyAdaptive } from './adaptive';
import { fontInfo } from './fonts';
import {
  BANNER_COLORS,
  BANNER_COLORS_LIGHT,
  BANNER_MIN_CONTRAST,
  DEFAULT_INPUT_COLOR,
  INPUT_COLORS,
  type InputColor,
  STATS_COLORS,
  STATS_COLORS_LIGHT,
  STATS_LIGHT_TRACK,
  STATS_MIN_CONTRAST,
  UI_COLORS,
  UI_COLORS_LIGHT,
  UI_LIGHT_FILLS,
  UI_MIN_CONTRAST,
  UI_MESSAGE_COLORS,
} from './presets';

/** CSS name of a shade role: `paneBg` → `--pane-shade-pane-bg`. */
export function shadeVar(role: ShadeRole): string {
  return '--pane-shade-' + role.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/**
 * The input colour (ADR 0035; "steel" is ADR 0034): the colour of the
 * command echo and of the input line. The terminal fg mixed with the
 * option's tint, a lighter tint on a dark terminal bg and a darker one on a
 * light bg; `none` is the plain fg. It refers to `--term-fg`, so it follows
 * whatever element the root tokens are set on (<html>, the player).
 */
export function inputColor(id: InputColor, termBg: string): string {
  const mix = (INPUT_COLORS[id] ?? INPUT_COLORS[DEFAULT_INPUT_COLOR]).mix;
  if (!mix) return 'var(--term-fg)';
  const tint = isLight(termBg) ? mix.light : mix.dark;
  return `color-mix(in oklab, var(--term-fg) ${mix.pct}%, ${tint})`;
}

/**
 * The stronger default foreground that bold shows when bold brightens
 * (ADR 0060). A font colour that is one of the palette's colours 0–7 takes
 * its bright twin (silver → bright white); any other is mixed halfway
 * toward the ink the background takes (white on dark, black on light). The
 * result never has less contrast with the background than the font colour
 * itself: on `paper`, where ink is already black, it stays black.
 */
export function boldFg(a: Readonly<AppearanceSettings>): string {
  const fg = normalizeHex(a.fg) ?? '#c0c0c0';
  const bg = normalizeHex(a.bg) ?? '#000000';
  const i = a.ansi.slice(0, 8).findIndex((c) => normalizeHex(c) === fg);
  const twin = i >= 0 ? normalizeHex(a.ansi[i + 8]) : null;
  const bright = twin ?? mix(fg, takesDarkInk(bg) ? '#000000' : '#ffffff', 0.5);
  return contrast(bright, bg) > contrast(fg, bg) ? bright : fg;
}

/**
 * The bold colour tokens (ADR 0060). The renderers mark bold runs with
 * classes only; these decide what the classes show, so a change applies
 * to the rows already drawn, and each themed root (the app, an in-app
 * player) has its own.
 *
 * - `--bold-<i>`, i 0–7: bold palette colour i (`ansi[i + 8]` when on).
 * - `--bold-fg`: bold text in the default foreground (`currentcolor`, i.e.
 *   unchanged, when off).
 * - `--bold-fg-def`: the same inside a background row whose own colour is
 *   another (the font colour when off).
 */
export function boldTokens(a: Readonly<AppearanceSettings>): Record<string, string> {
  const t: Record<string, string> = {};
  for (let i = 0; i < 8; i++) t[`--bold-${i}`] = a.ansi[a.boldBright ? i + 8 : i]!;
  const fg = a.boldBright ? boldFg(a) : null;
  t['--bold-fg'] = fg ?? 'currentcolor';
  t['--bold-fg-def'] = fg ?? a.fg;
  return t;
}

/** The colour families of the chrome and the client's own rows. */
export interface ThemeColors {
  /** `--c-<role>` */
  ui: Record<string, string>;
  /** `--banner-*`, `--star-*` */
  banner: Record<string, string>;
  /** `--ui-<key>` */
  messages: Record<string, string>;
  /** `--st-<key>` */
  stats: Record<string, string>;
}

/**
 * The UI colours for a terminal background (ADR 0041).
 *
 * - A dark background (`isLight` false): the dark tables, exactly.
 * - A light background that takes dark ink: the light tables, each text
 *   role darkened as far as its least contrast asks for on this
 *   background (nothing changes on `paper`), the fills derived from the
 *   background.
 * - A background that counts as light but is dark to the eye (a saturated
 *   blue or violet): the dark tables, each text role lightened to the same
 *   contrasts.
 */
export function themeColors(termBg: string): ThemeColors {
  if (!isLight(termBg)) {
    return { ui: { ...UI_COLORS }, banner: { ...BANNER_COLORS }, messages: { ...UI_MESSAGE_COLORS }, stats: { ...STATS_COLORS } };
  }
  const bg = normalizeHex(termBg) ?? '#ffffff';
  const dark = takesDarkInk(bg);
  const ink = dark ? '#000000' : '#ffffff';
  const fit = (
    table: Readonly<Record<string, string>>,
    min: Readonly<Record<string, number>>,
    against: (role: string) => string = () => bg,
  ): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(table)) out[k] = fitContrast(v, against(k), min[k] ?? 0, ink);
    return out;
  };

  let ui: Record<string, string>;
  let stats: Record<string, string>;
  if (dark) {
    const selFg = bg;
    ui = fit({ ...UI_COLORS_LIGHT, 'sel-fg': selFg }, UI_MIN_CONTRAST, (k) =>
      k === 'sel-bg' || k === 'focus-bg' ? selFg : bg,
    );
    for (const [k, amount] of Object.entries(UI_LIGHT_FILLS)) ui[k] = mix(bg, '#000000', amount);
    stats = fit(STATS_COLORS_LIGHT, STATS_MIN_CONTRAST);
    stats.track = mix(bg, '#000000', STATS_LIGHT_TRACK);
  } else {
    // The bars keep their light fill and black ink; only text is lifted.
    const { 'sel-bg': _s, 'focus-bg': _f, ...text } = UI_MIN_CONTRAST;
    ui = fit(UI_COLORS, text);
    stats = fit(STATS_COLORS, STATS_MIN_CONTRAST);
  }
  const banner = fit(dark ? BANNER_COLORS_LIGHT : BANNER_COLORS, BANNER_MIN_CONTRAST);
  const messages: Record<string, string> = {};
  for (const [k, v] of Object.entries(UI_MESSAGE_COLORS)) {
    messages[k] = fitContrast(dark ? lightShift(v) : v, bg, 4.5, ink);
  }
  return { ui, banner, messages, stats };
}

/** The root custom properties for `s`. */
export function rootTokens(s: Readonly<Settings>): Record<string, string> {
  const a = s.appearance;
  const t: Record<string, string> = {
    '--term-fg': a.fg,
    '--term-bg': a.bg,
    '--font-mono': fontInfo(a.font).stack,
    '--pad': `${a.padding}px`,
    '--c-line-hl': lineHighlight(a.bg),
    '--term-echo': inputColor(a.inputColor, a.bg),
  };
  for (let i = 0; i < 16; i++) t[`--ansi-${i}`] = a.ansi[i]!;
  Object.assign(t, boldTokens(a));
  const c = themeColors(a.bg);
  for (const [k, v] of Object.entries(c.ui)) t[`--c-${k}`] = v;
  for (const [k, v] of Object.entries(c.banner)) t[`--${k}`] = v;
  for (const [k, v] of Object.entries(c.messages)) t[`--ui-${k}`] = v;
  for (const [k, v] of Object.entries(c.stats)) t[`--st-${k}`] = v;
  for (const c of PANE_COLORS) {
    const name = c === 'black' ? 'none' : c;
    t[`--pane-bg-${name}`] = paneEffectiveBg(c, a.bg);
    t[`--pane-border-${name}`] = paneBorder(c, a.bg);
  }
  return t;
}

/** Applies the whole theme to `root` (default: <html>). */
export function applyTheme(s: Readonly<Settings>, root: HTMLElement = document.documentElement): void {
  const st = root.style;
  for (const [k, v] of Object.entries(rootTokens(s))) st.setProperty(k, v);
  const a = s.appearance;
  root.dataset.cursor = a.cursorStyle;
  root.dataset.cursorBlink = a.cursorBlink ? 'on' : 'off';
  root.toggleAttribute('data-light', isLight(a.bg));
  applyAdaptive(root, a.fg, a.bg);
}

/** True when the parts of `a` and `b` that `applyTheme` uses differ. */
export function appearanceChanged(a: Readonly<AppearanceSettings>, b: Readonly<AppearanceSettings>): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** The per-pane custom properties for `paneId` under `s`. */
export function paneTokens(s: Readonly<Settings>, paneId: PaneId): Record<string, string> {
  const color = paneSettingsOf(s.panes, paneId).color;
  const bg = s.appearance.bg;
  const t: Record<string, string> = {
    '--pane-bg': paneEffectiveBg(color, bg),
    '--pane-border': paneBorder(color, bg),
  };
  const shades = paneShades(color, bg);
  for (const role of SHADE_ROLES) t[shadeVar(role)] = shades[role];
  return t;
}

/** Whether `paneId`'s effective background is light under `s`. */
export function paneLight(s: Readonly<Settings>, paneId: PaneId): boolean {
  return paneIsLight(paneSettingsOf(s.panes, paneId).color, s.appearance.bg);
}

/** Sets the pane tokens and `data-light` on a pane element. */
export function applyPaneTheme(el: HTMLElement, s: Readonly<Settings>, paneId: PaneId): void {
  for (const [k, v] of Object.entries(paneTokens(s, paneId))) el.style.setProperty(k, v);
  el.toggleAttribute('data-light', paneLight(s, paneId));
}
