// Pure colour toolkit (Inv §10.4, §10.5; ADR 0010 "Theme").
//
// Colours are `#rrggbb` strings (lower case on output). HSL values use
// h 0–360, s and l 0–100, as floats; only the final hex is rounded.
// Nothing here reads settings or the DOM, and nothing is cached: callers
// re-resolve on every change (Inv §10.5 "Re-resolve every frame").

import { SHADE_ROLE_ORDER, type ShadeRoleName } from '../core/types';
import type { PaneColor } from '../layout/types';
import { PANE_TINTS } from './presets';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** True for `#rgb` / `#rrggbb` (with or without `#`). */
export function isHex(s: unknown): s is string {
  return typeof s === 'string' && HEX_RE.test(s);
}

/** Canonical `#rrggbb`, or null when `s` is not a hex colour. */
export function normalizeHex(s: unknown): string | null {
  if (!isHex(s)) return null;
  let h = s.replace('#', '').toLowerCase();
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  return '#' + h;
}

/** Parses a hex colour; an invalid value reads as black. */
export function hexToRgb(hex: string): Rgb {
  const n = normalizeHex(hex);
  if (!n) return { r: 0, g: 0, b: 0 };
  const v = parseInt(n.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const S = clamp(s, 0, 100) / 100;
  const L = clamp(l, 0, 100) / 100;
  if (S === 0) return { r: L * 255, g: L * 255, b: L * 255 };
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const H = (((h % 360) + 360) % 360) / 360;
  const f = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: f(H + 1 / 3) * 255, g: f(H) * 255, b: f(H - 1 / 3) * 255 };
}

export function hexToHsl(hex: string): Hsl {
  return rgbToHsl(hexToRgb(hex));
}

export function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb({ h, s, l }));
}

/** HSL lightness 0–100. */
export function lightness(hex: string): number {
  return hexToHsl(hex).l;
}

// ----------------------------------------------------------------- lifts

/** Lightness above which a background counts as light (Inv §10.5). */
export const LIGHT_L_THRESHOLD = 58;
/** Per-channel lift of a pane border over its fill (Inv §10.4). */
export const BORDER_LIFT = 0x14;
/** Floor for the None pane's border on a dark terminal (`BORDER_MIN_L_DARK`). */
export const BORDER_MIN_L_DARK = 16;
/** Border lightness on a light effective background (`BORDER_L_LIGHT`). */
export const BORDER_L_LIGHT = 80;

/** A light background: HSL L > 58. */
export function isLight(hex: string): boolean {
  return lightness(hex) > LIGHT_L_THRESHOLD;
}

/** Adds `amount` to each channel (clamped). Cockpit's `lighten`. */
export function lighten(hex: string, amount = BORDER_LIFT): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r + amount, g: g + amount, b: b + amount });
}

/** HSL lightness a `lighten` hover adds to a link's colours (ADR 0065 round 2). */
export const HOVER_LIFT = 8;

/**
 * `hex` a step lighter for a hovered link (ADR 0065 round 2): HSL L +
 * `amount` (capped at 100), hue and saturation kept, so dark and light
 * colours both lift by the same visible step. Not a hex colour: as is.
 */
export function hoverLift(hex: string, amount = HOVER_LIFT): string {
  const n = normalizeHex(hex);
  if (!n) return hex;
  const { h, s, l } = hexToHsl(n);
  return hslToHex(h, s, Math.min(100, l + amount));
}

// ------------------------------------------------------------------ panes

/** The pane's own effective background: its fill, or the terminal bg for None. */
export function paneEffectiveBg(color: PaneColor, termBg: string): string {
  return PANE_TINTS[color]?.fill ?? normalizeHex(termBg) ?? '#000000';
}

/** Whether a pane's content sits on a light background (Inv §10.5). */
export function paneIsLight(color: PaneColor, termBg: string): boolean {
  return isLight(paneEffectiveBg(color, termBg));
}

/** The (h, s) the pane's border and shade ramp use. */
export function paneHs(color: PaneColor, termBg: string): [number, number] {
  const hs = PANE_TINTS[color]?.hs;
  if (hs) return [hs[0], hs[1]];
  const { h, s } = hexToHsl(termBg);
  return [h, s];
}

/**
 * The pane frame colour (docs/pane-frame.md `border_style`):
 * - light effective bg: the pane's (h, s) at L80;
 * - None on a dark terminal: terminal bg + 0x14/channel, floored at L16
 *   with the terminal bg's own (h, s) (≈ `#292929` on black);
 * - a named tint: its fill + 0x14/channel.
 */
export function paneBorder(color: PaneColor, termBg: string): string {
  const eff = paneEffectiveBg(color, termBg);
  if (isLight(eff)) {
    const [h, s] = paneHs(color, termBg);
    return hslToHex(h, s, BORDER_L_LIGHT);
  }
  const named = PANE_TINTS[color]?.border;
  if (named) return named;
  const lifted = lighten(eff);
  if (lightness(lifted) >= BORDER_MIN_L_DARK) return lifted;
  const { h, s } = hexToHsl(eff);
  return hslToHex(h, s, BORDER_MIN_L_DARK);
}

/** Shade roles (Inv §10.4 "Shade ramp"). */
export type ShadeRole = ShadeRoleName;

/** In ramp order; a role's index is also its shade-role colour's (core/types.ts, ADR 0065). */
export const SHADE_ROLES: readonly ShadeRole[] = SHADE_ROLE_ORDER;

/** (L, Δs) per role on a dark effective background. */
export const RAMP_DARK: Readonly<Record<ShadeRole, readonly [number, number]>> = {
  track: [15, -8],
  dim: [27, 0],
  mid: [42, 0],
  paneBg: [8, 0],
  vtext: [72, -30],
  label: [60, -22],
  glow: [64, -18],
};

/** (L, Δs) per role on a light effective background. */
export const RAMP_LIGHT: Readonly<Record<ShadeRole, readonly [number, number]>> = {
  track: [80, -10],
  dim: [55, -6],
  mid: [40, -4],
  paneBg: [25, -2],
  vtext: [22, -18],
  label: [34, -14],
  glow: [60, 0],
};

/** The seven-step ramp for one (h, s): each shade is hsl(h, clamp(s + Δs), L). */
export function shadeRamp(h: number, s: number, light: boolean): Record<ShadeRole, string> {
  const ramp = light ? RAMP_LIGHT : RAMP_DARK;
  const out = {} as Record<ShadeRole, string>;
  for (const role of SHADE_ROLES) {
    const [L, ds] = ramp[role];
    out[role] = hslToHex(h, clamp(s + ds, 0, 100), L);
  }
  return out;
}

/** A pane's shade ramp (dark or light by its own effective bg). */
export function paneShades(color: PaneColor, termBg: string): Record<ShadeRole, string> {
  const [h, s] = paneHs(color, termBg);
  return shadeRamp(h, s, paneIsLight(color, termBg));
}

// ------------------------------------------------------- light transforms

/**
 * Coloured text on a light background: caps L at `lMax`, floors S at
 * `sMin`. Achromatic colours (S < 10) are returned unchanged.
 */
export function lightShift(hex: string, lMax = 45, sMin = 55): string {
  const { h, s, l } = hexToHsl(hex);
  if (s < 10) return normalizeHex(hex) ?? hex;
  return hslToHex(h, Math.max(s, sMin), Math.min(l, lMax));
}

/** A dark saturated fill as a pastel: same hue, S × `sScale`, L = `l`. */
export function washout(hex: string, l = 70, sScale = 0.45): string {
  const c = hexToHsl(hex);
  return hslToHex(c.h, c.s * sScale, l);
}

/** Faded base ink tinted toward `bg`: bg's hue, S × `sScale`, L = `l`. */
export function darkInk(bg: string, l = 40, sScale = 0.85): string {
  const c = hexToHsl(bg);
  return hslToHex(c.h, c.s * sScale, l);
}

/** Mixes `a` toward `b` by `t` (0–1) in RGB. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** How far the hover outline moves from the background: black → #292929 (ADR 0084 addendum). */
export const OUTLINE_MIX_DARK = 0.161;
/** The same on a light background, toward black (paper → a darker paper shade). */
export const OUTLINE_MIX_LIGHT = 0.12;

/**
 * The hover outline of a borderless pane (ADR 0084 addendum): the main
 * window background a small step toward white (dark bg) or black (light
 * bg). Grey on black, a lighter blue on blue, a darker paper on paper.
 */
export function paneOutline(termBg: string): string {
  const bg = normalizeHex(termBg) ?? '#000000';
  return isLight(bg) ? mix(bg, '#000000', OUTLINE_MIX_LIGHT) : mix(bg, '#ffffff', OUTLINE_MIX_DARK);
}

/** Editor current-line band: bg 12 % toward white (dark bg) or black (light bg). */
export function lineHighlight(termBg: string): string {
  return mix(termBg, isLight(termBg) ? '#000000' : '#ffffff', 0.12);
}

// --------------------------------------------------------------- contrast

/** WCAG 2 relative luminance, 0–1. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio of two colours, 1–21. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Luminance at which black and white ink contrast equally (≈ 4.58:1).
 * Above it dark ink reads better, below it light ink.
 */
export const INK_FLIP_LUMINANCE = 0.1791;

/** True when dark ink reads better than light ink on `bg`. */
export function takesDarkInk(bg: string): boolean {
  return luminance(bg) >= INK_FLIP_LUMINANCE;
}

/**
 * `fg` with at least `min` contrast against `bg`: unchanged when it already
 * has it, else mixed toward `toward` (black or white; the hue is kept) by
 * the smallest step that reaches `min`, or `toward` itself when nothing
 * does.
 */
export function fitContrast(fg: string, bg: string, min: number, toward: string): string {
  const base = normalizeHex(fg) ?? fg;
  if (min <= 1 || contrast(base, bg) >= min) return base;
  if (contrast(toward, bg) < min) return normalizeHex(toward) ?? toward;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2;
    if (contrast(mix(base, toward, t), bg) >= min) hi = t;
    else lo = t;
  }
  return mix(base, toward, hi);
}
