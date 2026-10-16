// Background-adaptive colours for the weather engine (ADR 0091).
//
// The prototype was designed on black. Every effect keeps that look on a
// dark background (black, dark grey). On a light background (paper) a light
// effect would vanish, so "light things" (rain, snow, stars, bolt cores)
// keep their hue and get the inverse lightness, and additive glows become
// multiplicative tints. Pure functions: the worker and the tests use them.

export type Rgb = [number, number, number];

export interface ThemeInfo {
  bg: Rgb;
  /** Relative luminance of the background, 0..1. */
  lum: number;
  /** A light background: effects draw dark on it. */
  light: boolean;
  /** Composite for glows: 'lighter' on dark, 'multiply' on light. */
  add: GlobalCompositeOperation;
}

export function parseHex(hex: string, fallback: Rgb = [0, 0, 0]): Rgb {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(hex.trim());
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : fallback;
  }
  let h = m[1]!;
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance, 0..1. */
export function luminance([r, g, b]: Rgb): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Above this luminance the background counts as light (paper is ~0.85, #2a2a2e ~0.024). */
export const LIGHT_LUM = 0.3;

export function themeInfo(bgHex: string): ThemeInfo {
  const bg = parseHex(bgHex);
  const lum = luminance(bg);
  const light = lum > LIGHT_LUM;
  return { bg, lum, light, add: light ? 'multiply' : 'lighter' };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/**
 * A colour designed for a black background, for `th`: unchanged on a dark
 * background; on a light one the same hue with the inverse lightness
 * (white → near black, pale blue → dark blue), clamped to [lo, hi].
 */
export function adapt(rgb: Readonly<Rgb>, th: Readonly<ThemeInfo>, lo = 0.1, hi = 0.75): Rgb {
  if (!th.light) return [rgb[0], rgb[1], rgb[2]];
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const inv = Math.min(hi, Math.max(lo, 1 - l));
  return hslToRgb(h, s, inv).map((c) => Math.round(c)) as Rgb;
}

/** `rgba()` of `adapt(rgb)`. */
export function adaptCss(r: number, g: number, b: number, a: number, th: Readonly<ThemeInfo>): string {
  const c = adapt([r, g, b], th);
  return `rgba(${c[0]},${c[1]},${c[2]},${+a.toFixed(3)})`;
}
