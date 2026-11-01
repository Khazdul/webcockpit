// Menu surfaces (ADR 0116): the colours of every floating panel — the
// menu bar's popups and tooltip, the settings popups, the gear popups, the
// player chrome, the Spotlights card, the windows' title bar — derived
// from the terminal background, so a menu on Paper is a light card with
// dark ink and a menu on Teal a teal-tinted panel, never a black slab.
//
// The rule (pure, `surfaceColors`):
// - The background's side decides: a background that takes dark ink
//   (`takesDarkInk`, Paper) gets a light panel, every other one a dark
//   panel.
// - The panel: the background a small step toward white (dark side, black
//   → #0a0a0a, the old ghost panel) or halfway to white (light side, a
//   paper card lighter than the page). The panel keeps the background's
//   hue, so its greys do too.
// - Every other level is the panel mixed toward the panel's ink (white on
//   the dark side, a near-black of the background's own hue on the light
//   side) by a fixed share. The text levels are then fitted to a minimum
//   contrast against the panel (`fitContrast`), so an odd custom
//   background stays readable.
// - The accents (danger, warning, gold) are fixed hues fitted to the panel.
//
// Published as `--sf-<role>` on every themed root (apply.ts `rootTokens`:
// <html>, an in-app player, the replay page), with `--sf-scheme` for
// `color-scheme` (native scrollbars and controls on the panel).

import { contrast, fitContrast, hexToRgb, mix, normalizeHex, takesDarkInk } from './color';

/** The surface roles, in `--sf-<role>` order. */
export interface SurfaceColors {
  /** The panel. */
  bg: string;
  /** A sunken field on the panel: toggle track, segmented control, input. */
  field: string;
  /** A raised or selected cell: the selected segment, a pressed button. */
  raised: string;
  /** The hover wash of a row or button. */
  hover: string;
  /** Hairlines inside the panel: header and footer rules. */
  line: string;
  /** The panel's border and a control's border. */
  border: string;
  /** A hovered or focused control's border. */
  borderHot: string;
  /** The brightest text: a question, a hovered label, the selected value. */
  hot: string;
  /** Body text: a row's label. */
  fg: string;
  /** Secondary text: a section title, a value. */
  dim: string;
  /** Faint text: a key hint, a note, an off row's label. */
  faint: string;
  /** Icons at rest. */
  icon: string;
  /** Off things: a toggle's knob, an off star. */
  off: string;
  /** A toggle that is on: track and knob. */
  onTrack: string;
  onKnob: string;
  /** Danger text (Exit), its border and hover fill. */
  danger: string;
  dangerBorder: string;
  dangerHover: string;
  /** Warning text (unsaved changes). */
  warn: string;
  /** Gold (stars, the clock's day). */
  gold: string;
  /** The focus ring. */
  focus: string;
  /** The panel's `box-shadow`. */
  shadow: string;
  /** The panel at 95 % (the player bar, the Spotlights card). */
  glass: string;
  /** `color-scheme` for the panel: `dark` or `light`. */
  scheme: 'dark' | 'light';
}

/** Shares of the way from the panel to its ink, per level (dark side). */
const DARK_SHARES = {
  field: 0.03,
  raised: 0.13,
  hover: 0.055,
  line: 0.075,
  border: 0.14,
  borderHot: 0.32,
  hot: 0.92,
  fg: 0.76,
  dim: 0.52,
  faint: 0.33,
  icon: 0.4,
  off: 0.24,
  onTrack: 0.26,
  onKnob: 0.92,
} as const;

/** The same on the light side (dark ink on a light card). */
const LIGHT_SHARES = {
  field: 0.035,
  raised: 0.1,
  hover: 0.055,
  line: 0.09,
  border: 0.17,
  borderHot: 0.38,
  hot: 0.94,
  fg: 0.82,
  dim: 0.6,
  faint: 0.45,
  icon: 0.52,
  off: 0.26,
  onTrack: 0.72,
  onKnob: 0,
} as const;

/** Least contrast of each text level against the panel. */
export const SURFACE_MIN_CONTRAST = { hot: 10, fg: 7, dim: 3.8, faint: 2.6, icon: 3, danger: 4.5, warn: 4.5, gold: 3 } as const;

/** How far the panel moves from the background: toward white on the dark side, toward white on the light side. */
export const PANEL_LIFT_DARK = 0.04;
export const PANEL_LIFT_LIGHT = 0.5;

function rgba(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** The surface colours for a terminal background (see the file header). */
export function surfaceColors(termBg: string): SurfaceColors {
  const bg = normalizeHex(termBg) ?? '#000000';
  const light = takesDarkInk(bg);
  const panel = mix(bg, '#ffffff', light ? PANEL_LIFT_LIGHT : PANEL_LIFT_DARK);
  // The light side's ink: a near-black of the background's hue.
  const ink = light ? mix(bg, '#000000', 0.88) : '#ffffff';
  const toward = light ? '#000000' : '#ffffff';
  const shares = light ? LIGHT_SHARES : DARK_SHARES;
  const at = (k: keyof typeof shares): string => mix(panel, ink, shares[k]);
  const fit = (c: string, k: keyof typeof SURFACE_MIN_CONTRAST): string =>
    fitContrast(c, panel, SURFACE_MIN_CONTRAST[k], toward);

  const danger = fit(light ? '#c0392b' : '#ff8a8a', 'danger');
  const shadowInk = light ? mix(bg, '#000000', 0.72) : '#000000';
  return {
    bg: panel,
    field: light ? mix(bg, '#000000', LIGHT_SHARES.field) : at('field'),
    raised: at('raised'),
    hover: at('hover'),
    line: at('line'),
    border: at('border'),
    borderHot: at('borderHot'),
    hot: fit(at('hot'), 'hot'),
    fg: fit(at('fg'), 'fg'),
    dim: fit(at('dim'), 'dim'),
    faint: fit(at('faint'), 'faint'),
    icon: fit(at('icon'), 'icon'),
    off: at('off'),
    onTrack: at('onTrack'),
    onKnob: light ? panel : at('onKnob'),
    danger,
    dangerBorder: mix(panel, danger, light ? 0.45 : 0.35),
    dangerHover: mix(panel, danger, 0.1),
    warn: fit(light ? '#8a6410' : '#d7af5f', 'warn'),
    gold: fit(light ? '#b07d0a' : '#ffd060', 'gold'),
    focus: at('borderHot'),
    shadow: light
      ? `0 10px 28px ${rgba(shadowInk, 0.22)}, 0 1px 3px ${rgba(shadowInk, 0.12)}`
      : `0 10px 28px ${rgba(shadowInk, 0.7)}, inset 0 1px 0 rgba(255, 255, 255, 0.04)`,
    glass: rgba(panel, 0.95),
    scheme: light ? 'light' : 'dark',
  };
}

/** `--sf-<role>` name of a surface role: `borderHot` → `--sf-border-hot`. */
export function surfaceVar(role: keyof SurfaceColors): string {
  return '--sf-' + role.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/** The `--sf-*` custom properties for a terminal background. */
export function surfaceTokens(termBg: string): Record<string, string> {
  const s = surfaceColors(termBg);
  const t: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) t[surfaceVar(k as keyof SurfaceColors)] = v;
  return t;
}

/** Test and debug aid: the contrast of each text level against the panel. */
export function surfaceContrasts(termBg: string): Record<string, number> {
  const s = surfaceColors(termBg);
  const out: Record<string, number> = {};
  for (const k of Object.keys(SURFACE_MIN_CONTRAST) as (keyof typeof SURFACE_MIN_CONTRAST)[]) {
    out[k] = Math.round(contrast(s[k], s.bg) * 100) / 100;
  }
  return out;
}
