// Settings → CSS custom properties (ADR 0010 "Theme", Inv §10.9).
//
// Root (`applyTheme`, on <html>):
//   --term-fg --term-bg --ansi-0..15       terminal colours
//   --font-mono --pad                      font stack, app padding
//   --c-<role>                              UI roles (presets.ts UI_COLORS)
//   --c-line-hl                             editor current-line band
//   --term-echo                             input colour: command echo and
//                                           input line (ADR 0034, 0035)
//   --banner-* --star-* --ui-*              banner and UI-message colours
//   --st-*                                  Statistics / History data colours
//   --pane-bg-<tint> --pane-border-<tint>   every tint for swatches
//   data-cursor="block|beam|underline", data-cursor-blink="on|off",
//   data-light (present when the terminal bg is light)
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
import type { AppearanceSettings, Settings } from '../settings/types';
import {
  SHADE_ROLES,
  type ShadeRole,
  isLight,
  lineHighlight,
  paneBorder,
  paneEffectiveBg,
  paneIsLight,
  paneShades,
} from './color';
import { FONTS } from './fonts';
import {
  BANNER_COLORS,
  DEFAULT_INPUT_COLOR,
  INPUT_COLORS,
  type InputColor,
  STATS_COLORS,
  UI_COLORS,
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

/** The root custom properties for `s`. */
export function rootTokens(s: Readonly<Settings>): Record<string, string> {
  const a = s.appearance;
  const t: Record<string, string> = {
    '--term-fg': a.fg,
    '--term-bg': a.bg,
    '--font-mono': FONTS[a.font].stack,
    '--pad': `${a.padding}px`,
    '--c-line-hl': lineHighlight(a.bg),
    '--term-echo': inputColor(a.inputColor, a.bg),
  };
  for (let i = 0; i < 16; i++) t[`--ansi-${i}`] = a.ansi[i]!;
  for (const [k, v] of Object.entries(UI_COLORS)) t[`--c-${k}`] = v;
  for (const [k, v] of Object.entries(BANNER_COLORS)) t[`--${k}`] = v;
  for (const [k, v] of Object.entries(UI_MESSAGE_COLORS)) t[`--ui-${k}`] = v;
  for (const [k, v] of Object.entries(STATS_COLORS)) t[`--st-${k}`] = v;
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
}

/** True when the parts of `a` and `b` that `applyTheme` uses differ. */
export function appearanceChanged(a: Readonly<AppearanceSettings>, b: Readonly<AppearanceSettings>): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

/** The per-pane custom properties for `paneId` under `s`. */
export function paneTokens(s: Readonly<Settings>, paneId: PaneId): Record<string, string> {
  const color = s.panes[paneId].color;
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
  return paneIsLight(s.panes[paneId].color, s.appearance.bg);
}

/** Sets the pane tokens and `data-light` on a pane element. */
export function applyPaneTheme(el: HTMLElement, s: Readonly<Settings>, paneId: PaneId): void {
  for (const [k, v] of Object.entries(paneTokens(s, paneId))) el.style.setProperty(k, v);
  el.toggleAttribute('data-light', paneLight(s, paneId));
}
