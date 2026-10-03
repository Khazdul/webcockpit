// Adaptive colours (ADR 0068): a script names a base colour with a `~`
// prefix (`<~gold>`, `<~#f0c850>`, `highlight("~gold")`) and every
// renderer adjusts its lightness to its own background.
//
// Resolution (pure):
// - As text (`adaptFg`): the base colour unchanged when it already has
//   `ADAPTIVE_MIN_CONTRAST` (4.5:1, ADR 0061's rule) against the
//   background, else mixed toward white (a background that takes light ink)
//   or black (one that takes dark ink) by the smallest step that reaches it.
//   Mixing toward white or black keeps the hue.
// - As a fill (`adaptBg`): the base colour moved the other way, toward the
//   background's side, by the smallest step that gives the font colour
//   4.5:1 on it, so text on the fill stays readable.
//
// Live recolouring (DOM): renderers do not resolve; they write
// `var(--wc-af-rrggbb, #rrggbb)` (text) or `var(--wc-ab-rrggbb, #rrggbb)`
// (fill) as the inline colour. Each themed root (the app's <html>, an
// in-app player, the replay page) holds the resolved value of every base
// colour in use as a custom property, written by `applyAdaptive` whenever
// its theme applies and by `adaptiveCss` the first time a colour is used.
// A background change therefore recolours the scrollback with no
// re-render, and a player resolves against its own background. At most
// `ADAPTIVE_MAX` base colours get a property; beyond that a colour is
// resolved once against the last applied background (no live recolour).

import { type Color, isAdaptive } from '../core/types';
import { fitContrast, normalizeHex, takesDarkInk } from './color';

/** The contrast an adaptive colour keeps against its background. */
export const ADAPTIVE_MIN_CONTRAST = 4.5;

/** Base colours that get a live custom property. */
export const ADAPTIVE_MAX = 1024;

/** The base colour of an adaptive `Color` as `#rrggbb`. */
export function adaptiveHex(c: Color): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

/** An adaptive colour's base as text on `bg` (see the file header). */
export function adaptFg(base: string, bg: string): string {
  const b = normalizeHex(bg) ?? '#000000';
  return fitContrast(base, b, ADAPTIVE_MIN_CONTRAST, takesDarkInk(b) ? '#000000' : '#ffffff');
}

/** An adaptive colour's base as a fill under text in `fg` on a terminal `bg`. */
export function adaptBg(base: string, fg: string, bg: string): string {
  const b = normalizeHex(bg) ?? '#000000';
  const f = normalizeHex(fg) ?? '#c0c0c0';
  return fitContrast(base, f, ADAPTIVE_MIN_CONTRAST, takesDarkInk(b) ? '#ffffff' : '#000000');
}

/** A role: text (`f`) or fill (`b`). */
export type AdaptiveRole = 'f' | 'b';

/** The resolved CSS colour of adaptive `c` in `role` on `bg` with font colour `fg`. */
export function resolveAdaptive(c: Color, role: AdaptiveRole, bg: string, fg = '#c0c0c0'): string {
  const base = adaptiveHex(c);
  return role === 'f' ? adaptFg(base, bg) : adaptBg(base, fg, bg);
}

// ------------------------------------------------------------- registry

interface Root {
  ref: WeakRef<HTMLElement>;
  fg: string;
  bg: string;
}

const used: number[] = [];
const usedSet = new Set<number>();
let roots: Root[] = [];
let lastFg = '#c0c0c0';
let lastBg = '#000000';

function hex6(rgb24: number): string {
  return rgb24.toString(16).padStart(6, '0');
}

function setProps(el: HTMLElement, rgb24: number, fg: string, bg: string): void {
  const h = hex6(rgb24);
  el.style.setProperty(`--wc-af-${h}`, adaptFg('#' + h, bg));
  el.style.setProperty(`--wc-ab-${h}`, adaptBg('#' + h, fg, bg));
}

/**
 * CSS for adaptive colour `c` in `role`: a `var()` the themed roots
 * resolve (registering the colour on first use), or past `ADAPTIVE_MAX`
 * colours the value resolved against the last applied background.
 */
export function adaptiveCss(c: Color, role: AdaptiveRole): string {
  const rgb24 = c & 0xffffff;
  if (!usedSet.has(rgb24)) {
    if (used.length >= ADAPTIVE_MAX) return resolveAdaptive(c, role, lastBg, lastFg);
    usedSet.add(rgb24);
    used.push(rgb24);
    const live: Root[] = [];
    for (const r of roots) {
      const el = r.ref.deref();
      if (!el) continue;
      live.push(r);
      setProps(el, rgb24, r.fg, r.bg);
    }
    roots = live;
  }
  const h = hex6(rgb24);
  return `var(--wc-a${role}-${h}, #${h})`;
}

/**
 * Writes the resolved value of every adaptive colour in use on `root` for
 * a terminal background `bg` and font colour `fg` (theme/apply.ts calls it
 * with the theme), and keeps `root` for colours registered later.
 */
export function applyAdaptive(root: HTMLElement, fg: string, bg: string): void {
  lastFg = fg;
  lastBg = bg;
  let found = false;
  let same = false;
  const live: Root[] = [];
  for (const r of roots) {
    const el = r.ref.deref();
    if (!el) continue;
    if (el === root) {
      same = r.fg === fg && r.bg === bg;
      r.fg = fg;
      r.bg = bg;
      found = true;
    }
    live.push(r);
  }
  if (!found) live.push({ ref: new WeakRef(root), fg, bg });
  roots = live;
  // Unchanged colours on a known root: every property is already right.
  if (same) return;
  for (const rgb24 of used) setProps(root, rgb24, fg, bg);
}

/** True when `c` is adaptive (re-exported for renderers). */
export { isAdaptive };

/** Test hook: forgets every registered colour and root. */
export function resetAdaptive(): void {
  used.length = 0;
  usedSet.clear();
  roots = [];
  lastFg = '#c0c0c0';
  lastBg = '#000000';
}
