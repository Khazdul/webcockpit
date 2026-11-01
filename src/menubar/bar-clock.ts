// The menu bar's clock (stage 31a, ADR 0099 addendum 2026-11-01): the
// "ghost sun" in a time-left ring, no countdown text (the tooltip has it).
//
//   minute precision   ␠ ◯           3 cells: a gutter, the 2-cell ring
//   hour precision     ␠ ◯ ~         4 cells: plus a grey `~` (approximate)
//   not synced         ␠ (empty)     3 cells: no icon, the slot keeps its
//                                    tooltip; hovered, a faint dashed circle
//
// - The ring is the part of the period left (`periodLeft`): full as the
//   period begins, it vanishes clockwise from 12 o'clock; the arc left runs
//   from the current point clockwise up to 12 o'clock.
// - Inside: by day a line-drawn sun like the bar's other icons, by night a
//   filled crescent. Colours in menubar.css (`data-light` flips them).
// - Re-rendered just after each wall-clock second boundary while a ring is
//   shown (as the input-line strip, src/ui/clock-strip.ts); no timer while
//   not synced. `day` precision counts as not synced (no countdown).
// - The width changes by a cell between minute and hour precision; the bar
//   is told (`onCells`) so it stays a whole number of cells wide.

import { type Transition, periodLeft } from '../gmcp/clock';
import type { GameState } from '../gmcp/state';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Widths in cells: synced to the minute (or not synced), and synced to the hour only. */
export const CLOCK_CELLS = 3;
export const CLOCK_APPROX_CELLS = 4;

/** Ring radius in the 24-unit box. */
export const RING_R = 11;

const f2 = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The ring's remaining arc for `left` (0–1) of the period: from the point
 * at `1 - left` of a turn clockwise from 12 o'clock, on clockwise to 12
 * o'clock. Full: a whole circle; nothing left: ''.
 */
export function ringPath(left: number, r = RING_R): string {
  if (!(left > 0)) return '';
  const top = `12 ${f2(12 - r)}`;
  if (left >= 0.9995) return `M${top}A${r} ${r} 0 1 1 12 ${f2(12 + r)}A${r} ${r} 0 1 1 ${top}`;
  const a = (1 - left) * 2 * Math.PI - Math.PI / 2;
  return `M${f2(12 + r * Math.cos(a))} ${f2(12 + r * Math.sin(a))}A${r} ${r} 0 ${left > 0.5 ? 1 : 0} 1 ${top}`;
}

/** Circle (cx, cy, r) minus circle (ox, oy, r2) as one path: a crescent. */
export function crescent(cx: number, cy: number, r: number, ox: number, oy: number, r2: number): string {
  const dx = ox - cx;
  const dy = oy - cy;
  const d = Math.hypot(dx, dy);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(r * r - a * a);
  const mx = cx + (a * dx) / d;
  const my = cy + (a * dy) / d;
  const p1 = `${f2(mx + (h * dy) / d)} ${f2(my - (h * dx) / d)}`;
  const p2 = `${f2(mx - (h * dy) / d)} ${f2(my + (h * dx) / d)}`;
  return `M${p1}A${r} ${r} 0 1 0 ${p2}A${r2} ${r2} 0 0 1 ${p1}z`;
}

/** The day glyph: a circle (r 3.4) and 8 rays (5.9–7.9) from 12 o'clock, stroked. */
export const GHOST_SUN = [
  'M12 8.6a3.4 3.4 0 1 1 0 6.8a3.4 3.4 0 1 1 0-6.8z',
  ...Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return `M${f2(12 + 5.9 * c)} ${f2(12 + 5.9 * s)}L${f2(12 + 7.9 * c)} ${f2(12 + 7.9 * s)}`;
  }),
].join('');

/** The night glyph: a filled crescent. */
export const GHOST_MOON = crescent(11.4, 12.6, 6.4, 14.6, 9.4, 5.2);

/** What the clock shows: `minute` and `hour` a ring, `none` the empty slot. */
export type BarClockSync = 'minute' | 'hour' | 'none';

/** The clock's drawing for `t` at `nowMs`. */
export function barClockView(t: Transition | null, nowMs: number): { sync: BarClockSync; period: '' | 'day' | 'night'; ring: string; glyph: string } {
  if (!t) return { sync: 'none', period: '', ring: '', glyph: '' };
  return {
    sync: t.precision,
    period: t.period,
    ring: ringPath(periodLeft(t, nowMs)),
    glyph: t.period === 'day' ? GHOST_SUN : GHOST_MOON,
  };
}

export interface BarClockOptions {
  game: GameState;
  /** Wall clock in ms. */
  now?: () => number;
  /** Timer (tests). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** Called after every render (the menu bar's live tooltip). */
  onUpdate?: () => void;
  /** Called when the width in cells changes (not for the first render). */
  onCells?: (cells: number) => void;
}

export class BarClock {
  private readonly el: HTMLElement;
  private readonly o: BarClockOptions;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly arc: SVGPathElement;
  private readonly glyph: SVGPathElement;
  private readonly tilde: HTMLSpanElement;
  private timer: unknown = null;
  private width = 0;
  private readonly unsubs: Array<() => void> = [];
  private disposed = false;

  constructor(el: HTMLElement, o: BarClockOptions) {
    this.el = el;
    this.o = o;
    this.now = o.now ?? Date.now;
    const win = el.ownerDocument.defaultView;
    this.setTimer = o.setTimer ?? ((fn, ms) => (win ?? globalThis).setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((h) => (win ?? globalThis).clearTimeout(h as number));
    const doc = el.ownerDocument;
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'wc-mb-ring');
    const slot = doc.createElementNS(SVG_NS, 'circle');
    slot.setAttribute('class', 'wc-mb-ring-slot');
    slot.setAttribute('cx', '12');
    slot.setAttribute('cy', '12');
    slot.setAttribute('r', String(RING_R));
    this.arc = doc.createElementNS(SVG_NS, 'path');
    this.arc.setAttribute('class', 'wc-mb-ring-arc');
    this.glyph = doc.createElementNS(SVG_NS, 'path');
    this.glyph.setAttribute('class', 'wc-mb-ring-glyph');
    svg.append(slot, this.arc, this.glyph);
    this.tilde = doc.createElement('span');
    this.tilde.className = 'wc-mb-tilde';
    this.tilde.textContent = '~';
    this.tilde.setAttribute('aria-hidden', 'true');
    el.replaceChildren(svg, this.tilde);
    el.setAttribute('aria-label', 'Game clock');
    this.unsubs.push(o.game.subscribe((part) => part === 'clock' && this.update()));
    this.update();
  }

  /** The width in cells now. */
  get cells(): number {
    return this.width;
  }

  /** Re-renders now and schedules the next second-boundary render. */
  update(): void {
    if (this.disposed) return;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    const now = this.now();
    const t = this.transition();
    const v = barClockView(t, now);
    if (this.arc.getAttribute('d') !== v.ring) this.arc.setAttribute('d', v.ring);
    if (this.glyph.getAttribute('d') !== v.glyph) this.glyph.setAttribute('d', v.glyph);
    this.el.dataset.sync = v.sync;
    this.el.dataset.period = v.period;
    this.tilde.hidden = v.sync !== 'hour';
    const cells = v.sync === 'hour' ? CLOCK_APPROX_CELLS : CLOCK_CELLS;
    if (cells !== this.width) {
      const first = this.width === 0;
      this.width = cells;
      this.el.style.flex = `0 0 calc(${cells} * var(--cell-w))`;
      this.el.style.width = `calc(${cells} * var(--cell-w))`;
      if (!first) this.o.onCells?.(cells);
    }
    if (t) this.timer = this.setTimer(() => this.update(), 1000 - (now % 1000) + 5);
    this.o.onUpdate?.();
  }

  /** The next day/night change as of now, or null below hour precision. */
  transition(): Transition | null {
    return this.o.game.clock.nextTransition(this.now());
  }

  /** The wall clock the clock renders with. */
  nowMs(): number {
    return this.now();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    for (const u of this.unsubs.splice(0)) u();
  }
}
