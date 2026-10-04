// TUI kit: pure navigation and layout helpers (Inv §3.3, §10.6). No DOM,
// no Preact; unit tested.

import { device } from '../../core/device';

/** What a key means to a chrome frame (Inv §3.3 navigation grammar). */
export type NavKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'tab'
  | 'backtab'
  | 'activate'
  | 'back'
  | 'pgup'
  | 'pgdn'
  | 'home'
  | 'end';

/** Minimal keyboard event shape (tests pass plain objects). */
export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/** The navigation meaning of a key, or null (a character, a shortcut…). */
export function navKey(e: KeyLike): NavKey | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'Tab':
      return e.shiftKey ? 'backtab' : 'tab';
    case 'Enter':
    case ' ':
      return 'activate';
    case 'Escape':
      return 'back';
    case 'PageUp':
      return 'pgup';
    case 'PageDown':
      return 'pgdn';
    case 'Home':
      return 'home';
    case 'End':
      return 'end';
  }
  return null;
}

export interface StepOptions {
  /** Wrap around the ends (menus) instead of clamping (tables, grids). */
  wrap?: boolean;
  /** Selectable items; the rest are skipped. Default: all. */
  enabled?: (i: number) => boolean;
}

/**
 * The next selectable index from `cur` moving `delta` (±1, or ±n for a
 * page), skipping disabled items. Clamps (or wraps); returns `cur` when
 * nothing else is selectable.
 */
export function step(count: number, cur: number, delta: number, opts: StepOptions = {}): number {
  if (count <= 0) return -1;
  const ok = opts.enabled ?? (() => true);
  const dir = delta < 0 ? -1 : 1;
  if (Math.abs(delta) > 1 && !opts.wrap) {
    // A page: land on the target (clamped), then the nearest selectable.
    const target = Math.max(0, Math.min(count - 1, cur + delta));
    for (let i = target; i >= 0 && i < count; i -= dir) if (ok(i)) return i === cur ? cur : i;
    return cur;
  }
  let i = cur;
  for (let n = 0; n < count; n++) {
    i += dir;
    if (i < 0 || i >= count) {
      if (!opts.wrap) return cur;
      i = (i + count) % count;
    }
    if (ok(i)) return i;
  }
  return cur;
}

/** The first selectable index at or after `from` (wrapping), or -1. */
export function firstEnabled(count: number, enabled: (i: number) => boolean, from = 0): number {
  for (let n = 0; n < count; n++) {
    const i = (from + n) % count;
    if (enabled(i)) return i;
  }
  return -1;
}

/** The value `delta` steps from `cur` in `list`, wrapping. An unknown `cur` starts at 0. */
export function cycle<T>(list: readonly T[], cur: T, delta: number): T {
  const n = list.length;
  const i = list.indexOf(cur);
  const from = i < 0 ? (delta > 0 ? -1 : 0) : i;
  return list[(((from + delta) % n) + n) % n]!;
}

/** A stepper value: `v + delta·stepSize` clamped to [min, max], snapped to the step grid. */
export function stepValue(v: number, delta: number, min: number, max: number, stepSize = 1): number {
  const snapped = Math.round((v - min) / stepSize) * stepSize + min;
  return Math.max(min, Math.min(max, snapped + delta * stepSize));
}

/** The left offset in cells that centres `width` in `total` (never negative). */
export function centreLeft(total: number, width: number): number {
  return Math.max(0, Math.floor((total - width) / 2));
}

/** Footer tokens joined the Cockpit way (Inv §10.6): `↑↓ Navigate · Enter Select`. */
export function footerText(tokens: readonly string[]): string {
  return tokens.join(' · ');
}

/** `s` cut to `n` cells with `…` when longer. */
export function truncate(s: string, n: number): string {
  if (n <= 0) return '';
  const cps = [...s];
  return cps.length <= n ? s : cps.slice(0, n - 1).join('') + '…';
}

/** Length in cells (code points; every glyph the chrome uses is one cell). */
export function cellLen(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Word-wraps `text` to lines of at most `width` cells (long words are split). */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(1, width);
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      while (cellLen(word) > w) {
        if (line) {
          out.push(line);
          line = '';
        }
        const cps = [...word];
        out.push(cps.slice(0, w).join(''));
        word = cps.slice(w).join('');
      }
      if (!line) line = word;
      else if (cellLen(line) + 1 + cellLen(word) <= w) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Keeps `cursor` inside a window of `visible` rows starting at `top`; returns the new top. */
export function scrollToShow(top: number, cursor: number, visible: number, count: number): number {
  if (visible <= 0) return 0;
  let t = top;
  if (cursor < t) t = cursor;
  if (cursor >= t + visible) t = cursor - visible + 1;
  return Math.max(0, Math.min(t, Math.max(0, count - visible)));
}

/**
 * Scrollbar cells for a list: `count` rows shown `visible` at a time from
 * `top`, drawn in `visible` cells. Returns per cell true = thumb. Empty
 * when everything fits.
 */
export function scrollbar(count: number, visible: number, top: number): boolean[] {
  if (count <= visible || visible <= 0) return [];
  const size = Math.max(1, Math.round((visible * visible) / count));
  const maxTop = count - visible;
  const pos = Math.round((top / maxTop) * (visible - size));
  return Array.from({ length: visible }, (_, i) => i >= pos && i < pos + size);
}

/** Minimum window for any chrome or the cockpit (Inv §3.1). */
export const MIN_COLS = 60;
export const MIN_ROWS = 18;

/** The phone's minimum (ADR 0075 §3), as the cockpit's (src/layout/phone.ts). */
export const PHONE_MIN_COLS = 30;
export const PHONE_MIN_ROWS = 8;

/** The minimum window for this device: 60 × 18, or 30 × 8 on a phone. */
export function minView(): { cols: number; rows: number } {
  return device().phone ? { cols: PHONE_MIN_COLS, rows: PHONE_MIN_ROWS } : { cols: MIN_COLS, rows: MIN_ROWS };
}

export function tooSmall(cols: number, rows: number): boolean {
  const m = minView();
  return cols < m.cols || rows < m.rows;
}

/**
 * Packs items of the given widths (cells) into rows of at most `width`
 * cells, `gap` cells between neighbours, in order. Returns the item indices
 * per row. An item wider than `width` gets a row of its own. Used on a
 * phone to wrap button bars and footers instead of cutting them (ADR 0075
 * §3.2).
 */
export function packRows(widths: readonly number[], width: number, gap: number): number[][] {
  const out: number[][] = [];
  let row: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    if (row.length > 0 && used + gap + w > width) {
      out.push(row);
      row = [];
      used = 0;
    }
    used += (row.length > 0 ? gap : 0) + w;
    row.push(i);
  });
  if (row.length > 0) out.push(row);
  return out;
}

/** Footer tokens packed into rows of at most `width` cells (joined by ` · `). */
export function footerRows(tokens: readonly string[], width: number): string[][] {
  return packRows(tokens.map(cellLen), width, 3).map((r) => r.map((i) => tokens[i]!));
}
