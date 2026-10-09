// A pane's colours as script panes use them (ADR 0065, ADR 0090): the
// shade ramp, light or dark, the pane's background, the text colour of
// uncoloured text, and the user's ANSI palette. Pure, no DOM, so the
// script host (`pane:theme()`, `pane:fillColor()`), the surface (which
// tells a script when they change, `pane:onTheme`) and the ScriptPane's
// render share one definition.
//
// - `paneTheme(settings, id)` resolves it now (nothing cached; it is a few
//   HSL conversions, as `paneShade`).
// - `themeKey` is equal for two themes that draw the same: the surface
//   compares it after every settings change.
// - `paneInk` is ADR 0041's 4.5:1 rule for text on the pane; `paneColor`
//   is the CSS colour of a line-model colour (palette, truecolor, shade
//   role, adaptive).

import { type Color, isAdaptive, shadeRoleOf } from '../core/types';
import type { PaneId } from '../layout/types';
import type { Settings } from '../settings/types';
import { adaptiveHex } from '../theme/adaptive';
import { type ShadeRole, fitContrast, lightShift } from '../theme/color';
import { colorToCss } from '../ui/palette';
import { fillFor, paneShade } from './shade';

type Ramp = Readonly<Record<ShadeRole, string>>;

/** A gauge's fill when the script gives no colour (the Group pane's HP green). */
export const DEFAULT_GAUGE_COLOR = '#005a18';

/** How text colours meet the pane: `base` for uncoloured text, `fg` maps a span colour. */
export interface PaneInk {
  base: string;
  fg(css: string): string;
  /** The pane's background and font colour, for adaptive colours (ADR 0068). */
  bg?: string;
  text?: string;
}

/** Colours as given; uncoloured text inherits (tests, the default). */
export const PLAIN_INK: PaneInk = { base: '', fg: (c) => c };

/** Text colours for a pane on `bg` (ADR 0041's 4.5:1 rule on a light pane). */
export function paneInk(termFg: string, bg: string, light: boolean): PaneInk {
  const toward = light ? '#000000' : '#ffffff';
  const base = fitContrast(termFg, bg, 4.5, toward);
  return {
    base,
    fg: light ? (c) => fitContrast(lightShift(c), bg, 4.5, toward) : (c) => c,
    bg,
    text: base,
  };
}

/**
 * CSS colour of a line-model colour, palette 0–15 from `ansi`; a shade-role
 * colour (ADR 0065) from `ramp` (empty without one: the default colour).
 */
export function paneColor(c: Color, ansi: readonly string[], ramp?: Ramp): string {
  const role = shadeRoleOf(c);
  if (role) return ramp?.[role] ?? '';
  if (isAdaptive(c)) return adaptiveHex(c);
  return c < 16 ? (ansi[c] ?? colorToCss(c)) : colorToCss(c);
}

/** Everything a script pane draws its colours from, resolved now. */
export interface PaneTheme {
  /** The pane's effective background is light (paper). */
  light: boolean;
  /** The pane's effective background. */
  bg: string;
  /** Uncoloured text (the terminal's text colour held to 4.5:1 on `bg`). */
  fg: string;
  /** The seven shades by role. */
  ramp: Record<ShadeRole, string>;
  /** The user's ANSI palette (0–15). */
  ansi: readonly string[];
}

/** The theme of pane `id` under `s`. */
export function paneTheme(s: Readonly<Settings>, id: PaneId): PaneTheme {
  const { ramp, light, bg } = paneShade(s, id);
  return { light, bg, fg: paneInk(s.appearance.fg, bg, light).base, ramp, ansi: s.appearance.ansi };
}

/** Equal for two themes that draw the same. */
export function themeKey(t: PaneTheme): string {
  return `${t.light}|${t.bg}|${t.fg}|${Object.values(t.ramp).join(',')}|${t.ansi.join(',')}`;
}

/** `#rrggbb` in lower case for a CSS hex colour (`#rgb` expanded); anything else as is. */
export function hex6(css: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css);
  if (!m) return css;
  const h = m[1]!.toLowerCase();
  return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
}

/** A gauge's fill for colour `c` on theme `t`: washed to a pastel on a light pane (`fillFor`). */
export function themeFill(t: PaneTheme, c: Color | undefined): string {
  return hex6(fillFor(c === undefined ? DEFAULT_GAUGE_COLOR : paneColor(c, t.ansi, t.ramp), t.light));
}
