// Timers pane (Inv §2.6.1–2.6.2, ADR 0017; Cockpit docs/timers-pane.md is
// the knowledge reference). What is on the character and how long it
// lasts, grouped top to bottom:
//
//   Spells:                                       <- dim header (option)
//   SANCTUARY   ▌SHIELD      ▌ARMOUR      ▌BLESS  +  <- corner + (gold)
//   Blinds:
//   2.ORC                   ▌TROLL                ▌
//   Charmies:
//   Huge stone troll                        21m ×   <- charm row, × drops it
//   ↓ 3 more rows                                   <- indicator row
//
// - Grid: n = min(cap, max(1, items)) cells per row; W // n each, the first
//   W % n one wider. A cell is (w−1) chars of the upper-cased name plus a
//   `▌` separator, drawn in the group colour only while the bar is full.
// - Bar: filled = floor(pct·w + 0.5) cells, black on the group colour; the
//   rest of the name in #C0C0C0. Untracked affect: no fill, #3a3a3a.
//   Untracked stored spell: full grey #cccccc. Barless group: the name in
//   the group colour (darkened on a light pane).
// - Clock: countdown right-justified over the bar (ladder A/B/C). A
//   rightmost-column clock cell drops its `▌`; the top row's rightmost
//   clock cell keeps one blank so the corner `+` never covers digits.
// - Charm rows: `Name  21m ×` (count-up; permanent: no minutes).
// - Corner `+` (gold) opens the herblore add-view (`[+] Name` / `[-] Name`),
//   where it becomes `×` (close). It yields when the top row is a charm row.
// - In a log player (`ctx.player`, ADR 0021) the pane is read-only: no
//   corner `+` (no herblore add-view) and no charm `×`.
// - The rows scroll natively by pixels (wheel, touchpad; ADR 0052). When
//   they overflow, the last pane row is a fixed indicator: `↑ N rows above`
//   (click → top) once scrolled, else `↓ N more rows`. The corner belongs
//   to the first row and scrolls with it. Redraw at 1 Hz on wall-clock
//   seconds while something counts; blank while inactive; a disconnect
//   resets the view.
//
// `timersLayout` and `timersIndicator` are pure (unit tested in Node); the
// pane does the DOM: a scroller with all rows plus one transparent hit box
// per clickable zone (charm `×`, herb label, corner) raised above the
// title-row grip, and the indicator row below it.

import { TIMER_GROUPS, TIMER_GROUP_LABELS, type TimerCell, type TimerGroup, type TimersView, barFill, barPct, cellCountdown, charmMinutes } from '../timers/entry';
import { TIMER_COLOR_HEX, type TimersSettings } from '../settings/types';
import { darkInk, lightShift } from '../theme/color';
import { forwardWheel } from './anchored-list';
import { CellLine, INDICATOR_FG, RowList } from './grid';
import type { PaneContext } from './context';
import { PaneShell } from './pane';
import { paneShade } from './shade';

/** Text on a bar fill. */
export const BAR_INK = '#000000';
/** The drained part of a name; charm minutes (Cockpit's status value grey). */
export const DEPLETED_FG = '#c0c0c0';
/** An untracked affect (seen in `stat`/`info` only). */
export const UNTRACKED_FG = '#3a3a3a';
/** An untracked stored spell: full bar in fixed grey. */
export const STORED_UNTRACKED = '#cccccc';
export const CHARM_X_FG = '#cc5555';
export const CHARM_X_HOVER = '#e88888';
/** Corner `+` / `×` (the indicator's gold). */
export const CORNER_FG = INDICATOR_FG;
export const CORNER_HOVER = '#f0c070';
export const HERB_BRACKET = '#666666';
export const HERB_ADD = '#7ed07e';
export const HERB_REMOVE = '#e88888';
export const HERB_NAME = '#999999';
export const HERB_NAME_HOVER = '#cccccc';

/** Cells per row: the cap is a ceiling, a lone item spans the width. */
export function effectiveCols(cap: number, items: number): number {
  return Math.max(1, Math.min(cap, Math.max(1, items)));
}

/** Cell widths of a `w`-cell row split in `n`: W // n, the first W % n one wider. */
export function cellWidths(w: number, n: number): number[] {
  const base = Math.floor(Math.max(0, w) / n);
  const rem = Math.max(0, w) % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * A clock cell's `width` columns (Inv §2.6.1 ladder): A = name, gap, time
 * right-justified; B = name clipped to ≥ 3 chars, time flush; C = name only.
 */
export function clockContent(name: string, time: string, width: number): string {
  if (width <= 0) return '';
  if (width >= name.length + 1 + time.length) return name.padEnd(width - time.length) + time;
  if (width >= 3 + time.length) return name.slice(0, width - time.length) + time;
  return name.slice(0, width).padEnd(width);
}

/** A charm's display name: first letter capitalised, inner case kept. */
export const charmName = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** What a click zone does. `key` is the hover identity. */
export type TimersHit =
  | { kind: 'charm'; id: string }
  | { kind: 'herb'; key: string; active: boolean }
  | { kind: 'corner' };

export const hitKey = (h: TimersHit): string =>
  h.kind === 'charm' ? `charm:${h.id}` : h.kind === 'herb' ? `herb:${h.key}` : h.kind;

/** A clickable span of content row `row`, columns [x0, x1). */
export interface HitZone {
  row: number;
  x0: number;
  x1: number;
  hit: TimersHit;
}

export type TimersMode = 'grid' | 'add';

export interface TimersLayoutInput {
  view: TimersView;
  settings: TimersSettings;
  now: number;
  w: number;
  h: number;
  mode: TimersMode;
  /** The pane's background is light. */
  light: boolean;
  /** The pane's effective background (light-pane inks). */
  bg: string;
  /** The header shade (the pane ramp's `dim`). */
  dim: string;
  /** `hitKey` of the zone under the pointer, or null. */
  hover: string | null;
  /** A log player: no corner `+` and no charm `×` (ADR 0021). */
  readOnly?: boolean;
}

export interface TimersLayout {
  /** Every row of the current view (the pane scrolls them). */
  lines: CellLine[];
  zones: HitZone[];
  /** All rows of the current view. */
  total: number;
  /** Pane rows the scroller takes (the indicator takes the last one on overflow). */
  listH: number;
  /** The corner glyph, or null (yielded to a charm row). */
  corner: '+' | '×' | null;
  /** Something changes with time (drain, countdown, charm minutes). */
  timed: boolean;
}

type RowSpec =
  | { kind: 'blank' }
  | { kind: 'header'; group: TimerGroup }
  | { kind: 'cells'; group: TimerGroup; cells: TimerCell[]; widths: number[] }
  | { kind: 'charms'; cells: TimerCell[]; widths: number[] }
  | { kind: 'herb'; herb: { key: string; name: string; active: boolean } };

function gridRows(view: TimersView, s: TimersSettings, w: number): RowSpec[] {
  const rows: RowSpec[] = [];
  let rendered = 0;
  for (const g of TIMER_GROUPS) {
    const gs = s.groups[g];
    const cells = view.cells[g];
    if (!gs.enabled || cells.length === 0) continue;
    if (!s.compact && rendered > 0) rows.push({ kind: 'blank' });
    rendered++;
    if (s.headers) rows.push({ kind: 'header', group: g });
    const n = effectiveCols(gs.cols, cells.length);
    const widths = cellWidths(w, n);
    for (let i = 0; i < cells.length; i += n) {
      const chunk = cells.slice(i, i + n);
      rows.push(g === 'charm' ? { kind: 'charms', cells: chunk, widths } : { kind: 'cells', group: g, cells: chunk, widths });
    }
  }
  return rows;
}

/** Everything the pane draws, from the view and the options. Pure. */
export function timersLayout(inp: TimersLayoutInput): TimersLayout {
  const { view, settings: s, now, w, h, mode, light, bg, dim, hover } = inp;
  const specs: RowSpec[] = mode === 'add' ? view.herbs.map((herb) => ({ kind: 'herb', herb })) : gridRows(view, s, w);
  const total = specs.length;
  const timed =
    mode === 'grid' &&
    TIMER_GROUPS.some((g) => s.groups[g].enabled && view.cells[g].some((c) => c.expiresAt !== null && c.tracked));

  // The indicator row appears when the rows overflow.
  const listH = Math.max(0, total > h ? h - 1 : h);

  const ro = inp.readOnly ?? false;
  const corner: '+' | '×' | null = mode === 'add' ? '×' : ro || specs[0]?.kind === 'charms' ? null : '+';
  const depleted = light ? darkInk(bg) : DEPLETED_FG;
  const untracked = light ? dim : UNTRACKED_FG;
  const fgOn = (hex: string): string => (light ? lightShift(hex) : hex);

  const lines: CellLine[] = [];
  const zones: HitZone[] = [];

  specs.forEach((spec, row) => {
    const line = new CellLine(w);
    lines.push(line);
    switch (spec.kind) {
      case 'blank':
        return;
      case 'header':
        line.put(0, `${TIMER_GROUP_LABELS[spec.group]}:`, { fg: dim });
        return;
      case 'herb': {
        const { herb } = spec;
        const hot = hover === `herb:${herb.key}`;
        line.put(0, '[', { fg: HERB_BRACKET });
        line.put(1, herb.active ? '-' : '+', { fg: herb.active ? HERB_REMOVE : HERB_ADD });
        line.put(2, ']', { fg: HERB_BRACKET });
        line.put(4, herb.name, { fg: hot ? HERB_NAME_HOVER : HERB_NAME });
        zones.push({ row, x0: 0, x1: Math.min(w, 4 + herb.name.length), hit: { kind: 'herb', key: herb.key, active: herb.active } });
        return;
      }
      case 'charms': {
        const color = fgOn(TIMER_COLOR_HEX[s.groups.charm.color]);
        let x = 0;
        spec.cells.forEach((c, j) => {
          const cw = spec.widths[j]!;
          if (cw > 0) {
            drawCharm(line, x, cw, c, now, color, depleted, hover === `charm:${c.id}`, ro);
            if (!ro) zones.push({ row, x0: x + cw - 1, x1: x + cw, hit: { kind: 'charm', id: c.id } });
          }
          x += cw;
        });
        return;
      }
      case 'cells': {
        const gs = s.groups[spec.group];
        const color = TIMER_COLOR_HEX[gs.color];
        const n = spec.widths.length;
        let x = 0;
        spec.cells.forEach((c, j) => {
          const cw = spec.widths[j]!;
          const opts: CellOpts = {
            color,
            bar: gs.bar,
            clock: gs.clock,
            last: j === n - 1,
            corner: row === 0 && corner === '+' && j === n - 1,
            depleted,
            untracked,
            barless: fgOn(color),
          };
          drawCell(line, x, cw, c, now, opts);
          x += cw;
        });
        return;
      }
    }
  });

  if (corner && w > 0) {
    if (lines.length === 0) lines.push(new CellLine(w));
    lines[0]!.put(w - 1, corner, { fg: hover === 'corner' ? CORNER_HOVER : CORNER_FG, bg: '', bold: false, italic: false });
    zones.push({ row: 0, x0: w - 1, x1: w, hit: { kind: 'corner' } });
  }

  return { lines, zones, total, listH, corner, timed };
}

/**
 * The indicator row of a `w` × `h` pane showing `total` rows with `above`
 * rows (or parts of rows) scrolled off the top, or null when they fit:
 * `↑ N rows above` once scrolled, else `↓ N more rows`.
 */
export function timersIndicator(w: number, h: number, total: number, above: number): { line: CellLine; up: boolean } | null {
  if (h <= 0 || total <= h) return null;
  const up = above > 0;
  const n = up ? above : total - (h - 1);
  const text = up ? `↑ ${n} ${n === 1 ? 'row' : 'rows'} above` : `↓ ${n} more ${n === 1 ? 'row' : 'rows'}`;
  return { line: new CellLine(w).put(0, text, { fg: INDICATOR_FG, italic: true }), up };
}

interface CellOpts {
  color: string;
  bar: boolean;
  clock: boolean;
  /** The rightmost column (reaches the pane's right edge). */
  last: boolean;
  /** Under the corner `+` (top visible row, rightmost column). */
  corner: boolean;
  depleted: string;
  untracked: string;
  barless: string;
}

/** One grid cell of `cw` columns at `x`. */
function drawCell(line: CellLine, x: number, cw: number, c: TimerCell, now: number, o: CellOpts): void {
  if (cw <= 0) return;
  const name = c.name.toUpperCase();
  const countdown = o.clock ? cellCountdown(c, now) : null;
  // A rightmost-column clock cell runs to the edge (no separator), unless
  // it sits under the corner, where its last column stays blank.
  const edge = countdown !== null && o.last && !o.corner;
  const cc = edge ? cw : cw - 1;
  const label = countdown !== null ? clockContent(name, countdown, cc) : name.slice(0, cc).padEnd(cc);
  const storedGrey = c.group === 'stored' && !c.tracked;

  if (!c.tracked && !storedGrey) {
    line.put(x, label, { fg: o.untracked });
    return;
  }
  if (!o.bar) {
    line.put(x, label, { fg: storedGrey ? STORED_UNTRACKED : o.barless });
    return;
  }
  const fill = storedGrey ? STORED_UNTRACKED : o.color;
  const filled = storedGrey ? cw : barFill(barPct(c, now), cw);
  for (let i = 0; i < cc; i++) {
    line.put(x + i, label[i]!, i < filled ? { fg: BAR_INK, bg: fill } : { fg: o.depleted });
  }
  if (!edge && filled >= cw && !(o.corner && countdown !== null)) line.put(x + cw - 1, '▌', { fg: fill });
}

/** One charm cell: `Name  21m ×` (timed) or `Name ×` (permanent / narrow). */
function drawCharm(
  line: CellLine,
  x: number,
  cw: number,
  c: TimerCell,
  now: number,
  color: string,
  minsFg: string,
  hot: boolean,
  noX = false,
): void {
  const name = charmName(c.name);
  const mins = charmMinutes(c, now);
  if (mins !== null && cw >= 7) {
    const nw = cw - 6;
    line.put(x, name.slice(0, nw), { fg: color });
    line.put(x + nw + 1, `${mins}m`.padStart(3), { fg: minsFg });
  } else {
    line.put(x, name.slice(0, Math.max(0, cw - 2)), { fg: color });
  }
  if (!noX) line.put(x + cw - 1, '×', { fg: hot ? CHARM_X_HOVER : CHARM_X_FG });
}

// ------------------------------------------------------------------ pane

/** ms after a wall-clock second boundary at which the 1 Hz redraw runs. */
const TICK_LAG_MS = 5;

export class TimersPane extends PaneShell {
  private mode: TimersMode = 'grid';
  private hover: string | null = null;
  private last: TimersLayout | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  /** The native scroller (all rows), above the indicator row. */
  private readonly scroller: HTMLDivElement;
  private readonly rowsEl: HTMLDivElement;
  private readonly moreEl: HTMLDivElement;
  private readonly hits: HTMLDivElement;
  private readonly list: RowList;
  /** The zones the hit boxes were built from. */
  private hitsKey = '';
  private listHKey = -1;
  private moreKey = '';
  /** Scroll to the top at the next render (a mode switch, a reset). */
  private toTop = false;

  constructor(ctx: PaneContext) {
    super(ctx, 'timers');
    const doc = ctx.doc;
    this.scroller = doc.createElement('div');
    this.scroller.className = 'wc-timers-scroll';
    this.rowsEl = doc.createElement('div');
    this.rowsEl.className = 'wc-timers-rows';
    this.scroller.append(this.rowsEl);
    this.moreEl = doc.createElement('div');
    this.moreEl.className = 'wc-timers-more';
    this.list = new RowList(this.rowsEl);
    this.hits = doc.createElement('div');
    this.hits.className = 'wc-timers-hits';
    this.own(ctx.game.subscribe((part) => part === 'timers' && this.markDirty()));
    this.own(ctx.settings.subscribe((next, prev) => next.timers !== prev.timers && this.markDirty()));
    this.content.addEventListener('mousedown', this.onDown);
    this.content.addEventListener('mousemove', this.onMove);
    this.content.addEventListener('mouseleave', this.onLeave);
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.own(forwardWheel(this.el, () => this.scroller, () => ctx.cells.get().h));
    this.own(() => {
      this.content.removeEventListener('mousedown', this.onDown);
      this.content.removeEventListener('mousemove', this.onMove);
      this.content.removeEventListener('mouseleave', this.onLeave);
      this.scroller.removeEventListener('scroll', this.onScroll);
      this.clearTick();
    });
  }

  /** `grid` or the herblore add-view (tests). */
  get viewMode(): TimersMode {
    return this.mode;
  }

  /** The scroller (tests). */
  get scrollEl(): HTMLDivElement {
    return this.scroller;
  }

  protected override onActiveChange(active: boolean): void {
    if (active) return;
    this.mode = 'grid';
    this.toTop = true;
    this.hover = null;
    this.clearTick();
  }

  protected override blank(): void {
    this.last = null;
    this.list.reset();
    this.listHKey = -1;
    this.moreKey = '';
    this.moreEl.replaceChildren();
    this.content.replaceChildren();
  }

  protected override render(): void {
    if (this.scroller.parentNode !== this.content) this.content.replaceChildren(this.scroller, this.moreEl);
    const s = this.ctx.settings.get();
    const shade = paneShade(s, 'timers');
    const now = this.ctx.now();
    const layout = timersLayout({
      view: this.ctx.game.timers.view(now),
      settings: s.timers,
      now,
      w: this.cols,
      h: this.rows,
      mode: this.mode,
      light: shade.light,
      bg: shade.bg,
      dim: shade.ramp.dim,
      hover: this.hover,
      readOnly: this.ctx.player === true,
    });
    this.last = layout;
    if (this.hover && !layout.zones.some((z) => hitKey(z.hit) === this.hover)) this.hover = null;
    if (layout.listH !== this.listHKey) {
      this.listHKey = layout.listH;
      this.scroller.style.height = `calc(var(--cell-h) * ${layout.listH})`;
    }
    // The 1 Hz tick mostly redraws the same cells: only changed rows are
    // rebuilt, and the hit boxes only when the zones changed.
    const hitsKey = JSON.stringify(layout.zones);
    if (hitsKey !== this.hitsKey) {
      this.hitsKey = hitsKey;
      this.buildHits(layout.zones);
    }
    this.list.update(this.ctx.doc, layout.lines, this.hits);
    if (this.toTop) {
      this.toTop = false;
      this.scroller.scrollTop = 0;
    }
    this.updateMore();
    if (this.content.dataset.mode !== this.mode) this.content.dataset.mode = this.mode;
    this.armTick(layout.timed, now);
  }

  /** The indicator row from the scroll position (rows partly above count). */
  private updateMore(): void {
    const l = this.last;
    if (!l) return;
    const cellH = this.ctx.cells.get().h || 16;
    const above = Math.max(0, Math.ceil(this.scroller.scrollTop / cellH - 0.01));
    const ind = timersIndicator(this.cols, this.rows, l.total, above);
    const key = ind ? ind.line.key() : '';
    if (key === this.moreKey) return;
    this.moreKey = key;
    this.moreEl.toggleAttribute('data-up', ind?.up === true);
    if (ind) this.moreEl.replaceChildren(ind.line.toElement(this.ctx.doc));
    else this.moreEl.replaceChildren();
  }

  private readonly onScroll = (): void => this.updateMore();

  private buildHits(zones: TimersLayout['zones']): void {
    const doc = this.ctx.doc;
    this.hits.replaceChildren(
      ...zones.map((z) => {
        const d = doc.createElement('div');
        d.className = 'wc-timers-hit';
        d.dataset.hit = z.hit.kind;
        if (z.hit.kind === 'charm') d.dataset.id = z.hit.id;
        if (z.hit.kind === 'herb') {
          d.dataset.key = z.hit.key;
          d.dataset.active = String(z.hit.active);
        }
        d.dataset.hitKey = hitKey(z.hit);
        d.style.left = `calc(var(--cell-w) * ${z.x0})`;
        d.style.top = `calc(var(--cell-h) * ${z.row})`;
        d.style.width = `calc(var(--cell-w) * ${z.x1 - z.x0})`;
        return d;
      }),
    );
  }

  /** The next redraw just after the coming wall-clock second, while anything counts. */
  private armTick(timed: boolean, now: number): void {
    if (!timed) return this.clearTick();
    if (this.tickTimer !== null) return;
    const win = this.ctx.doc.defaultView;
    const set = win ? win.setTimeout.bind(win) : setTimeout;
    this.tickTimer = set(() => {
      this.tickTimer = null;
      this.markDirty();
    }, 1000 - (now % 1000) + TICK_LAG_MS);
  }

  private clearTick(): void {
    if (this.tickTimer === null) return;
    const win = this.ctx.doc.defaultView;
    (win ? win.clearTimeout.bind(win) : clearTimeout)(this.tickTimer);
    this.tickTimer = null;
  }

  private zoneOf(e: Event): HTMLElement | null {
    return (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.wc-timers-hit') ?? null;
  }

  private setHover(key: string | null): void {
    if (key === this.hover) return;
    this.hover = key;
    this.markDirty();
  }

  private readonly onMove = (e: MouseEvent): void => {
    this.setHover(this.zoneOf(e)?.dataset.hitKey ?? null);
  };

  private readonly onLeave = (): void => this.setHover(null);

  private readonly onDown = (e: MouseEvent): void => {
    if (e.button !== 0 || !this.active) return;
    // The `↑ N rows above` indicator scrolls to the top (also in a player).
    if (this.moreEl.hasAttribute('data-up') && this.moreEl.contains(e.target as Node)) {
      e.preventDefault();
      e.stopPropagation();
      this.scroller.scrollTop = 0;
      this.updateMore();
      return;
    }
    const z = this.zoneOf(e);
    // Read-only in a player.
    if (this.ctx.player || !z) return;
    e.preventDefault();
    e.stopPropagation();
    const timers = this.ctx.game.timers;
    switch (z.dataset.hit) {
      case 'charm':
        timers.dropCharm(z.dataset.id!);
        break;
      case 'herb':
        if (z.dataset.active === 'true') timers.removeHerb(z.dataset.key!);
        else timers.addHerb(z.dataset.key!);
        break;
      case 'corner':
        this.mode = this.mode === 'grid' ? 'add' : 'grid';
        this.toTop = true;
        this.hover = null;
        break;
    }
    this.markDirty();
  };
}
