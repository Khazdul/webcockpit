// A script's own pane (spec §2.10 "Panes", ADR 0053): draws a
// `PaneContent` (script-content.ts) with the cell grid (grid.ts) inside
// the usual pane frame, so it docks, floats, toggles and takes the pane
// colour like the built-in panes.
//
//   ▌Mercenaries          ▐
//   ▌Bob   ████████   12m ▐    a gauge row, label centred
//   ▌[tap] [pay] [leave]  ▐    links: pointer cursor, hover band, tooltip
//
// - Content taller than the pane scrolls (ADR 0053 addendum, as ADR 0052's
//   panes): every line is in a native scroller with the bar hidden, moved
//   by the wheel and the touchpad in pixels (also over the frame) and by
//   touch. One pane row is an indicator: `anchor = "bottom"` (the
//   default, a console) keeps it on top, `↑ N more rows`, and follows new
//   lines while the view is at the end; `anchor = "top"` (a list) keeps it
//   at the bottom, `↓ N more rows`, and the view stays where it is.
//   Scrolled away from the anchor it reads `↑ N rows above` / `↓ N rows
//   below`; a click on it goes back to the anchor.
// - Colours: the cecho colours of the spans (palette 0–15 from the user's
//   ANSI palette, the rest as is; a shade role `<@dim>` … from the pane's
//   shade ramp, resolved every render, ADR 0065). Text without a colour takes the
//   terminal fg held to 4.5:1 against the pane (a dark tint on a light
//   terminal gets light text); on a light pane span colours go through
//   `lightShift` and the same contrast floor, as the UI and Comm panes
//   (ADR 0041). Gauges fill with their colour (washed to
//   a pastel on a light pane, as the Group bars) over the pane's track
//   shade, the label in the value shade.
// - Links: the cell under the pointer is looked up in the content, never
//   in the DOM. A hovered link is drawn in its hover style (ADR 0065
//   round 2): `band` (the default) the glow band, text in the `paneBg`
//   shade; `lighten` its own text and background a step lighter
//   (`hoverLift`); `none` as at rest. It shows its hint as a tooltip
//   (`.wc-spane-tip`, one cell row per hint line, under the link, over
//   everything in the cockpit). A click calls `onLink(id)`: a primary
//   press and release on the same link (row, column and length), from
//   pointerdown and pointerup, not the DOM `click`, which the browser
//   drops when the row under the press is rebuilt before the release (a
//   pane redrawn every second lost about one click a minute); without
//   `onLink` (the log player) links are inert but keep their tips. A
//   tooltip-only link (`tip`) shows its hint without band or cursor.
// - Hover tracking (ADR 0065 round 2): the hover is the pointer's position,
//   never an element. A pointermove over the content sets it; while it is
//   set a document listener ends it on a pointermove whose target is not
//   in the content (the close cross, a float handle, another pane: the
//   content's own pointerleave may not come or may be ignored), and on the
//   pointer leaving the window (a root pointerleave whose point is outside
//   the window or off the content: Firefox sends the root one while the
//   pointer is still in the page), pointercancel, window blur and the tab
//   going hidden. A pointerleave whose point is still over the content's
//   own element (Firefox, when the row under the pointer is redrawn) is
//   ignored; one over anything else ends it. Every render and relayout
//   checks the position again, also against what is on top there.
// - Wheel for the script (`pane:onWheel`, ADR 0072): while the host has a
//   handler, a non-passive wheel listener on the whole pane turns every
//   event into whole-cell steps (`wheelSteps`: pixels by the cell width or
//   height, lines as cells, pages as the pane's cols or rows; Shift with a
//   vertical-only wheel is horizontal; the fraction is kept) and hands
//   them over. Only when the handler says it took them is the event
//   prevented (no native scroll, no forwarded scroll); an event too small
//   for a whole step follows the handler's last answer. Ctrl+wheel (zoom,
//   pinch) is never handed over.
// - Grip (ADR 0065 round 1): the cells of `pane:setGrip` show the grab
//   cursor; the cockpit asks `gripAt` on a press and starts a move there.
//   A borderless pane's top screen row (the cockpit's soft grip, ADR 0065)
//   shows it too where no link is (ADR 0084), as a built-in pane's title
//   row does. The close cross sits over that row's last cells (one in from
//   the right edge); while a link or a text field lies under it there the
//   pane is marked `data-no-cross` and shows none (layout.css), so it never
//   covers a button (the pane bar's last one, ADR 0065 round 2).
// - Steady hover (ADR 0056): the hover follows the pointer, not a link id.
//   After every render the link under the pointer is looked up again; one
//   at the same row, column and length is the same link, so the band and
//   the tooltip stay through redraws, and the tooltip text updates in place.
// - Text fields (ADR 0055): a native <input> per field, over its cells in
//   a layer beside the content (the rows are rebuilt freely; the inputs
//   are not, so a focused field keeps its focus). The band under it is
//   drawn in the cells in the pane's `track` shade. Its keys never reach
//   the game or macros: the input line and its macros ignore keys aimed at
//   another text field, and the field itself consumes browser shortcuts
//   (Ctrl+S …) other than editing keys. Enter and Esc give the focus back
//   to the input line, then report submit / cancel; Up, Down, PgUp, PgDn,
//   Tab and Shift+Tab are reported as keys. Without `onField` (the log
//   player) there are no inputs: a snapshot has the value baked in.
// - The content is kept while the connection is not `playing` (like UI).
// - Render is coalesced: callers change the content and call `changed()`,
//   which marks the pane dirty (one render per frame, none while hidden).

import { type Color, isAdaptive, shadeRoleOf } from '../core/types';
import { adaptBg, adaptFg, adaptiveHex } from '../theme/adaptive';
import { keyNameFromEvent } from '../script/keys';
import type { PaneId } from '../layout/types';
import { colorToCss } from '../ui/palette';
import type { PaneContext } from './context';
import { forwardWheel } from './anchored-list';
import { CellLine, INDICATOR_FG, RowList, centre } from './grid';
import { PaneShell } from './pane';
import { type HoverStyle, type PaneContent, type PaneField, type PaneLine, type PaneLink } from './script-content';
import { fillFor, paneShade } from './shade';
import { type ShadeRole, fitContrast, hoverLift, lightShift } from '../theme/color';

/** Cells of the close cross (" × ", layout.css), one cell in from the right edge. */
const CROSS_CELLS = 3;

/** A gauge's fill when the script gives no colour (the Group pane's HP green). */
export const DEFAULT_GAUGE_COLOR = '#005a18';

export interface ScriptPaneOptions {
  /** The content to draw (the host edits it). */
  content: PaneContent;
  /** A link was clicked (absent: links are inert). */
  onLink?: (id: number) => void;
  /** The title changed (the cockpit updates its close cross and Options). */
  onTitle?: () => void;
  /** Something happened in a text field (absent: fields are not editable). */
  onField?: (id: number, e: FieldEvent) => void;
  /** Gives the focus back to the game's input line. */
  onFocusInput?: () => void;
}

/** What a text field reports (ADR 0055). */
export type FieldEvent =
  | { type: 'change'; text: string }
  | { type: 'submit'; text: string }
  | { type: 'cancel' }
  | { type: 'blur'; text: string }
  | { type: 'key'; key: string };

/** Keys a focused field reports to the script instead of handling them. */
export const FIELD_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Tab', 'Shift+Tab']);

/** Modifier keys a field leaves to the browser: editing. Every other Ctrl/Alt/Meta key is consumed. */
const FIELD_EDIT_KEYS: ReadonlySet<string> = new Set(
  ['A', 'C', 'V', 'X', 'Z', 'Y', 'Shift+Z', 'ArrowLeft', 'ArrowRight', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Backspace', 'Delete', 'Home', 'End', 'Shift+Home', 'Shift+End']
    .flatMap((k) => [`Ctrl+${k}`, `Meta+${k}`])
    .concat(['Alt+Backspace']),
);

type Ramp = Readonly<Record<ShadeRole, string>>;

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

/** The part of a wheel scroll not yet given out as whole cells, per axis (ADR 0072). */
export interface WheelRest {
  x: number;
  y: number;
}

/**
 * Wheel event `e` as whole-cell steps (positive = right / down; ADR 0072):
 * pixels divided by the cell width (x) or height (y), lines taken as cells,
 * pages as the pane's `cols` / `rows`. A vertical-only wheel with Shift is
 * horizontal. The fraction stays in `rest` for the next event and is
 * dropped when the direction turns.
 */
export function wheelSteps(
  e: { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean },
  cell: { w: number; h: number },
  size: { cols: number; rows: number },
  rest: WheelRest,
): { dx: number; dy: number } {
  let x = e.deltaX;
  let y = e.deltaY;
  if (e.shiftKey && x === 0) {
    x = y;
    y = 0;
  }
  const ux = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? Math.max(1, size.cols) : 1 / (cell.w || 8);
  const uy = e.deltaMode === 1 ? 1 : e.deltaMode === 2 ? Math.max(1, size.rows) : 1 / (cell.h || 16);
  const step = (d: number, k: 'x' | 'y'): number => {
    if (d === 0) return 0;
    if (Math.sign(d) !== Math.sign(rest[k])) rest[k] = 0;
    rest[k] += d;
    const n = Math.trunc(rest[k] + Math.sign(d) * 1e-9) || 0;
    rest[k] -= n;
    return n;
  };
  return { dx: step(x * ux, 'x'), dy: step(y * uy, 'y') };
}

/** Cells of a gauge `w` wide that are filled. */
export function gaugeFill(value: number, max: number, w: number): number {
  if (!(max > 0) || w <= 0) return 0;
  return Math.max(0, Math.min(w, Math.round((value / max) * w)));
}

/** One content line as a row of `w` cells. */
export function paneLine(l: PaneLine, w: number, ramp: Ramp, light: boolean, ansi: readonly string[], ink: PaneInk = PLAIN_INK): CellLine {
  const line = new CellLine(w);
  if ('gauge' in l) {
    const g = l.gauge;
    const fill = fillFor(g.color === undefined ? DEFAULT_GAUGE_COLOR : paneColor(g.color, ansi), light);
    line.fill(0, w, { bg: ramp.track });
    line.fill(0, gaugeFill(g.value, g.max, w), { bg: fill });
    if (g.label) line.put(0, centre(g.label, w), { fg: ramp.vtext });
    return line;
  }
  let x = 0;
  for (const s of l.spans) {
    if (x >= w) break;
    // A shade role is the pane's own shade as is: the ramp is already
    // made for the pane's light or dark background (no light shift).
    // An adaptive colour (ADR 0068) resolves against the pane's own
    // background, as is (it is already made to read there).
    line.put(x, s.text, {
      fg:
        s.fg === undefined
          ? ink.base
          : isAdaptive(s.fg)
            ? adaptFg(adaptiveHex(s.fg), ink.bg ?? ramp.paneBg)
            : shadeRoleOf(s.fg)
              ? paneColor(s.fg, ansi, ramp)
              : ink.fg(paneColor(s.fg, ansi)),
      bg:
        s.bg === undefined
          ? ''
          : isAdaptive(s.bg)
            ? adaptBg(adaptiveHex(s.bg), ink.text || ramp.vtext, ink.bg ?? ramp.paneBg)
            : paneColor(s.bg, ansi, ramp),
      bold: !!s.bold,
      italic: !!s.italic,
      underline: !!s.underline,
    });
    x += s.text.length;
  }
  return line;
}

/**
 * Blanks the cells under the fields on content row `row` and fills them
 * with the field band: the text there is never drawn while a field
 * covers it (the input on top is opaque too).
 */
export function fieldBands(line: CellLine, fields: readonly PaneField[], row: number, w: number, ramp: Ramp): void {
  for (const f of fields) {
    if (f.row !== row || f.col >= w) continue;
    const end = Math.min(w, f.col + f.len);
    line.put(f.col, ' '.repeat(end - f.col), { bg: ramp.track });
  }
}

/**
 * Draws the hover of cells [`x0`, `x1`) of `line` in `style` (ADR 0065
 * round 2). `lighten` lifts each cell's text and background; a cell in
 * the pane's own colours lifts `fg` (its text) and `bg` (the pane).
 */
export function hoverCells(line: CellLine, x0: number, x1: number, style: HoverStyle, ramp: Ramp, fg: string, bg: string): void {
  if (style === 'none') return;
  if (style === 'band') {
    line.fill(x0, x1, { fg: ramp.paneBg, bg: ramp.glow });
    return;
  }
  for (let c = Math.max(0, x0); c < Math.min(line.w, x1); c++) {
    line.fill(c, c + 1, { fg: hoverLift(line.fg[c] || fg), bg: hoverLift(line.bg[c] || bg) });
  }
}

/**
 * Every content line as a row of `w` cells (the scroller's rows), the
 * hovered link in its hover style. `bg` is the pane's background (for a
 * `lighten` hover over cells without their own; default the `paneBg` shade).
 */
export function scriptPaneRows(
  c: PaneContent,
  w: number,
  ramp: Ramp,
  light: boolean,
  ansi: readonly string[],
  hover: PaneLink | null = null,
  ink: PaneInk = PLAIN_INK,
  bg = '',
): CellLine[] {
  if (w <= 0) return [];
  const out: CellLine[] = [];
  for (let i = 0; i < c.lines.length; i++) {
    const line = paneLine(c.lines[i]!, w, ramp, light, ansi, ink);
    if (c.fields.length > 0) fieldBands(line, c.fields, i, w, ramp);
    if (hover && hover.row === i && !hover.tip) {
      hoverCells(line, hover.col, hover.col + hover.len, c.hoverOf(hover), ramp, ink.base || ramp.vtext, bg || ramp.paneBg);
    }
    out.push(line);
  }
  return out;
}

/**
 * The indicator of a `h`-row pane with `n` lines scrolled `above` lines
 * down, or null when they fit: the rows hidden away from the anchor, or,
 * scrolled away from it, the rows hidden on the anchor's side.
 */
export function paneIndicator(n: number, h: number, above: number, anchor: 'top' | 'bottom'): { text: string; away: boolean } | null {
  if (h <= 0 || n <= h) return null;
  const listH = h - 1;
  const top = Math.max(0, Math.min(n - listH, above));
  const below = n - listH - top;
  const rows = (k: number): string => `${k} ${k === 1 ? 'row' : 'rows'}`;
  if (anchor === 'top') return top > 0 ? { text: `↑ ${rows(top)} above`, away: true } : { text: `↓ ${below} more ${below === 1 ? 'row' : 'rows'}`, away: false };
  return below > 0 ? { text: `↓ ${rows(below)} below`, away: true } : { text: `↑ ${top} more ${top === 1 ? 'row' : 'rows'}`, away: false };
}

export class ScriptPane extends PaneShell {
  readonly model: PaneContent;
  /** The native scroller with every line, and the indicator row (ADR 0053 addendum). */
  private readonly scroller: HTMLDivElement;
  private readonly rowsEl: HTMLDivElement;
  private readonly moreEl: HTMLDivElement;
  private readonly list: RowList;
  /** At the end of a bottom-anchored pane: new lines are followed. */
  private live = true;
  /** Lines and list height of the last render. */
  private shown = { n: 0, listH: 0, over: false };
  private moreKey = '';
  private readonly onLink: ((id: number) => void) | null;
  private readonly onTitle: () => void;
  /** What the rows on screen were drawn from. */
  private shownKey = '';
  private hover: PaneLink | null = null;
  /** The pointer over the content (client px), for re-resolving the hover after a change. */
  private pointer: { x: number; y: number } | null = null;
  private tipEl: HTMLDivElement | null = null;
  private readonly onField: ((id: number, e: FieldEvent) => void) | null;
  private readonly onFocusInput: () => void;
  /** The text fields' inputs, in a layer beside the content (ADR 0055). */
  private readonly fieldsEl: HTMLDivElement;
  private readonly inputs = new Map<number, HTMLInputElement>();
  /** A focus asked for before the field's input exists. */
  private pendingFocus: { id: number; select: boolean } | null = null;
  /** The script's wheel handler (ADR 0072), or null: the wheel is left alone. */
  private wheelFn: ((dx: number, dy: number) => boolean) | null = null;
  private wheelRest: WheelRest = { x: 0, y: 0 };
  /** The handler's last answer, for events too small for a whole step. */
  private wheelTaken = false;

  constructor(ctx: PaneContext, id: PaneId, opts: ScriptPaneOptions) {
    super(ctx, id, { label: opts.content.title || id, blankWhenInactive: false });
    this.model = opts.content;
    this.onLink = opts.onLink ?? null;
    this.onTitle = opts.onTitle ?? (() => {});
    this.onField = opts.onField ?? null;
    this.onFocusInput = opts.onFocusInput ?? (() => {});
    const doc = ctx.doc;
    const div = (cls: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = cls;
      return d;
    };
    this.scroller = div('wc-spane-scroll');
    this.rowsEl = div('wc-spane-rows');
    this.fieldsEl = div('wc-spane-fields');
    this.moreEl = div('wc-spane-more');
    this.scroller.append(this.rowsEl, this.fieldsEl);
    this.list = new RowList(this.rowsEl);
    this.content.append(this.scroller, this.moreEl);
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.own(forwardWheel(this.el, () => this.scroller, () => ctx.cells.get().h));
    this.el.classList.add('wc-pane-script');
    const c = this.content;
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerleave', this.onLeave);
    c.addEventListener('pointercancel', this.onCancel);
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('click', this.onClick);
  }

  /** The content changed: draw it in the next frame. */
  changed(): void {
    const label = this.model.title || this.id;
    if (label !== this.label) {
      this.setLabel(label);
      this.onTitle();
    }
    this.markDirty();
  }

  /**
   * Hands the wheel over the pane to `fn` in whole cells (`pane:onWheel`,
   * ADR 0072); null stops it. True from `fn` consumes the event.
   */
  setWheel(fn: ((dx: number, dy: number) => boolean) | null): void {
    // Capture: before the frame's forwarded scroll (forwardWheel) on the same element.
    if (fn && !this.wheelFn) this.el.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    if (!fn && this.wheelFn) this.el.removeEventListener('wheel', this.onWheel, { capture: true });
    this.wheelFn = fn;
    this.wheelRest = { x: 0, y: 0 };
    this.wheelTaken = false;
  }

  private readonly onWheel = (e: WheelEvent): void => {
    const fn = this.wheelFn;
    // Ctrl+wheel (and a touchpad pinch) zooms: never the script's.
    if (!fn || e.ctrlKey) return;
    const { dx, dy } = wheelSteps(e, this.ctx.cells.get(), { cols: this.cols, rows: this.rows }, this.wheelRest);
    if (dx !== 0 || dy !== 0) this.wheelTaken = fn(dx, dy);
    if (this.wheelTaken) e.preventDefault();
  };

  /** The link under the pointer now (tests). */
  get hovered(): PaneLink | null {
    return this.hover;
  }

  protected override render(): void {
    const s = this.ctx.settings.get();
    const { ramp, light, bg } = paneShade(s, this.id);
    const ansi = s.appearance.ansi;
    const fg = s.appearance.fg;
    const c = this.model;
    const key = `${c.version}|${this.cols}x${this.rows}|${this.hover ? `${this.hover.row},${this.hover.col},${this.hover.len},${c.hoverOf(this.hover)}` : ''}|${JSON.stringify(ramp)}|${light}|${bg}|${fg}|${ansi.join(',')}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    const n = c.lines.length;
    const h = this.rows;
    const over = n > h && h > 0;
    const listH = over ? h - 1 : h;
    const cellH = this.ctx.cells.get().h || 16;
    const bottom = c.anchor === 'bottom';
    const sst = this.scroller.style;
    const top = over && bottom ? 'var(--cell-h)' : '0px';
    if (sst.top !== top) sst.top = top;
    const height = `calc(var(--cell-h) * ${listH})`;
    if (sst.height !== height) sst.height = height;
    this.moreEl.style.top = bottom ? '0px' : `calc(var(--cell-h) * ${listH})`;
    this.moreEl.hidden = !over;
    const ink = paneInk(fg, bg, light);
    this.list.update(this.ctx.doc, scriptPaneRows(c, this.cols, ramp, light, ansi, this.hover, ink, bg));
    this.shown = { n, listH, over };
    // A console follows new lines while it is at the end.
    if (bottom && this.live) this.scroller.scrollTop = Math.max(0, n - listH) * cellH;
    this.updateMore();
    this.syncFields(ramp);
    this.updateCross();
    this.resolveHover();
  }

  /**
   * Marks a borderless pane `data-no-cross` while a link or a text field
   * lies under its close cross: the top screen row's cells from four in
   * from the right edge up to the last one (ADR 0084).
   */
  private updateCross(): void {
    let covered = false;
    const cols = this.cols;
    const c = this.model;
    if (this.soft && cols > 0 && !(this.shown.over && c.anchor === 'bottom')) {
      const cellH = this.ctx.cells.get().h || 16;
      const row = Math.floor(this.scroller.scrollTop / cellH + 0.01);
      const from = Math.max(0, cols - 1 - CROSS_CELLS);
      const hits = (x: { row: number; col: number; len: number }): boolean => x.row === row && x.col < cols - 1 && x.col + x.len > from;
      covered = c.links.some(hits) || c.fields.some(hits);
    }
    if (this.el.hasAttribute('data-no-cross') !== covered) this.el.toggleAttribute('data-no-cross', covered);
  }

  /**
   * The link under the pointer again, after a change (ADR 0056): the same
   * place keeps the band and the tooltip (its text updated in place);
   * another link or none moves or ends the hover.
   */
  private resolveHover(): void {
    const p = this.pointer;
    if (!p) {
      if (this.hover) this.setHover(null);
      return;
    }
    // Something else is on top there now (the close cross, a float), or
    // the pane moved away from under the pointer: the hover ends.
    if (!this.over(p.x, p.y)) {
      this.clearPointer();
      return;
    }
    const at = this.cellAt(p.x, p.y);
    const link = at ? this.model.linkAt(at.row, at.col) : null;
    const was = this.hover;
    if (link && was && link.row === was.row && link.col === was.col && link.len === was.len && !link.tip === !was.tip) {
      this.hover = link;
      if (link.hint !== was.hint) {
        if (link.hint) this.showTip(link, at!.y);
        else this.hideTip();
      }
      return;
    }
    if (link !== was) this.setHover(link, at?.y ?? 0);
  }

  /** Lines scrolled off the top (partly scrolled ones count). */
  private above(): number {
    const cellH = this.ctx.cells.get().h || 16;
    return Math.max(0, Math.ceil(this.scroller.scrollTop / cellH - 0.01));
  }

  private updateMore(): void {
    const { n, listH, over } = this.shown;
    const ind = over ? paneIndicator(n, listH + 1, this.above(), this.model.anchor) : null;
    const key = ind ? `${ind.text}|${this.cols}` : '';
    if (key === this.moreKey) return;
    this.moreKey = key;
    this.moreEl.toggleAttribute('data-away', ind?.away === true);
    if (ind) this.moreEl.replaceChildren(new CellLine(this.cols).put(0, ind.text, { fg: INDICATOR_FG, italic: true }).toElement(this.ctx.doc));
    else this.moreEl.replaceChildren();
  }

  private readonly onScroll = (): void => {
    const s = this.scroller;
    const { n, listH } = this.shown;
    const cellH = this.ctx.cells.get().h || 16;
    // Live: at the end within 2 px (a layout-free model when the browser has none).
    const end = s.scrollHeight > 0 ? s.scrollHeight - s.clientHeight : Math.max(0, n - listH) * cellH;
    this.live = s.scrollTop >= end - 2;
    this.updateCross();
    // The content moved under the pointer: whatever is there now.
    this.resolveHover();
    this.updateMore();
  };

  /** Scrolls back to the anchor: the top of a list, the end of a console. */
  scrollToAnchor(): void {
    const { n, listH } = this.shown;
    const cellH = this.ctx.cells.get().h || 16;
    this.live = true;
    this.scroller.scrollTop = this.model.anchor === 'top' ? 0 : Math.max(0, n - listH) * cellH;
    this.updateMore();
  }

  /** The scroller (tests). */
  get scrollEl(): HTMLDivElement {
    return this.scroller;
  }

  /** Puts an input over every field on screen and drops the others. */
  private syncFields(ramp?: Ramp): void {
    const c = this.model;
    if (!this.onField || (c.fields.length === 0 && this.inputs.size === 0)) return;
    if (!ramp) ramp = paneShade(this.ctx.settings.get(), this.id).ramp;
    // The value shade on the band, as a gauge label on its track: readable
    // in light and dark tints (ADR 0055 feedback).
    const color = ramp.vtext;
    const cell = this.ctx.cells.get();
    const seen = new Set<number>();
    for (const f of c.fields) {
      if (!this.visible || f.row >= c.lines.length || f.col >= this.cols) continue;
      let el = this.inputs.get(f.id);
      if (!el) {
        el = this.makeInput(f.id);
        this.inputs.set(f.id, el);
        this.fieldsEl.append(el);
      }
      seen.add(f.id);
      const st = el.style;
      st.left = `${f.col * cell.w}px`;
      st.top = `${f.row * cell.h}px`;
      st.width = `${Math.min(f.len, this.cols - f.col) * cell.w}px`;
      st.color = color;
      st.background = ramp.track;
      st.caretColor = color;
      st.setProperty('--spane-ph', ramp.label);
      st.setProperty('--spane-sel-fg', ramp.paneBg);
      st.setProperty('--spane-sel-bg', ramp.glow);
      if (el.value !== f.value) el.value = f.value;
      if (el.placeholder !== f.placeholder) el.placeholder = f.placeholder;
      if (el.maxLength !== f.maxLength) el.maxLength = f.maxLength;
    }
    for (const [id, el] of [...this.inputs]) if (!seen.has(id)) this.dropInput(id, el);
    if (this.pendingFocus && this.inputs.has(this.pendingFocus.id)) this.applyFocus();
  }

  private makeInput(id: number): HTMLInputElement {
    const el = this.ctx.doc.createElement('input');
    el.type = 'text';
    el.className = 'wc-spane-field';
    el.spellcheck = false;
    el.autocomplete = 'off';
    el.setAttribute('autocapitalize', 'off');
    el.dataset.field = String(id);
    el.addEventListener('input', () => this.onField?.(id, { type: 'change', text: el.value }));
    el.addEventListener('keydown', (e) => this.onFieldKey(id, el, e));
    el.addEventListener('blur', () => {
      // Not for Enter or Esc (they report themselves), a field going away,
      // or the window losing the focus (the field keeps it for later).
      if (this.leaving === el || !el.isConnected || !this.ctx.doc.hasFocus()) return;
      this.onField?.(id, { type: 'blur', text: el.value });
    });
    return el;
  }

  /** The input that Enter or Esc is moving the focus away from. */
  private leaving: HTMLInputElement | null = null;

  /** Gives the focus back to the input line without reporting a blur for `el`. */
  private leave(el: HTMLInputElement): void {
    this.leaving = el;
    try {
      this.onFocusInput();
    } finally {
      this.leaving = null;
    }
  }

  private dropInput(id: number, el: HTMLInputElement): void {
    const focused = this.ctx.doc.activeElement === el;
    this.inputs.delete(id);
    this.leaving = el;
    try {
      el.remove();
      if (focused) this.onFocusInput();
    } finally {
      this.leaving = null;
    }
  }

  private onFieldKey(id: number, el: HTMLInputElement, e: KeyboardEvent): void {
    if (e.isComposing || e.key === 'Dead') return;
    const name = keyNameFromEvent(e);
    if (!name) return;
    if (name === 'Enter' || name === 'NumpadEnter') {
      e.preventDefault();
      const text = el.value;
      this.leave(el);
      this.onField?.(id, { type: 'submit', text });
      return;
    }
    if (name === 'Escape') {
      e.preventDefault();
      this.leave(el);
      this.onField?.(id, { type: 'cancel' });
      return;
    }
    if (FIELD_KEYS.has(name)) {
      e.preventDefault();
      this.onField?.(id, { type: 'key', key: name });
      return;
    }
    // AltGr (Ctrl+Alt on Windows) types characters.
    if (e.getModifierState?.('AltGraph') || (e.ctrlKey && e.altKey && e.key.length === 1)) return;
    if ((e.ctrlKey || e.altKey || e.metaKey) && !FIELD_EDIT_KEYS.has(name)) e.preventDefault();
  }

  /**
   * Focuses field `id` (all of its text selected when `select`); a field
   * not on screen yet is focused once it is drawn.
   */
  focusField(id: number, select: boolean): void {
    this.pendingFocus = { id, select };
    if (!this.inputs.has(id)) this.syncFields();
    if (this.inputs.has(id)) this.applyFocus();
  }

  private applyFocus(): void {
    const p = this.pendingFocus;
    const el = p && this.inputs.get(p.id);
    if (!p || !el) return;
    this.pendingFocus = null;
    el.focus({ preventScroll: true });
    if (p.select) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }

  /** The input of field `id` (tests). */
  fieldInput(id: number): HTMLInputElement | null {
    return this.inputs.get(id) ?? null;
  }

  override place(...args: Parameters<PaneShell['place']>): void {
    super.place(...args);
    const p = args[0];
    this.soft = !!p && !p.framed;
    this.updateCross();
    // Hidden: no hover. Moved or resized: whatever is under the pointer now.
    if (!args[0]) this.clearPointer();
    else if (this.pointer) this.resolveHover();
  }

  override dispose(): void {
    this.setWheel(null);
    this.clearPointer();
    this.tipEl?.remove();
    for (const [id, el] of [...this.inputs]) this.dropInput(id, el);
    const c = this.content;
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('click', this.onClick);
    this.endPress();
    this.scroller.removeEventListener('scroll', this.onScroll);
    super.dispose();
  }

  /** The content row and column under (`x`, `y`) client px, or null. */
  cellAt(x: number, y: number): { row: number; col: number; y: number } | null {
    const r = this.content.getBoundingClientRect();
    const cell = this.ctx.cells.get();
    if (cell.w <= 0 || cell.h <= 0) return null;
    const col = Math.floor((x - r.left) / cell.w);
    const { over, listH } = this.shown;
    const top = over && this.model.anchor === 'bottom' ? cell.h : 0;
    const inList = y - r.top - top;
    if (col < 0 || col >= this.cols || inList < 0 || inList >= listH * cell.h) return null;
    const row = Math.floor((inList + this.scroller.scrollTop) / cell.h);
    // The row's top, in px from the content's top (for the tooltip).
    return { row, col, y: top + row * cell.h - this.scroller.scrollTop };
  }

  override gripAt(x: number, y: number): boolean {
    if (!this.model.grip) return false;
    const at = this.cellAt(x, y);
    return !!at && this.model.gripAt(at.row, at.col);
  }

  /** The link under (`x`, `y`) client px, or null. */
  linkAt(x: number, y: number): PaneLink | null {
    const at = this.cellAt(x, y);
    return at ? this.model.linkAt(at.row, at.col) : null;
  }

  private readonly onMove = (e: PointerEvent): void => {
    this.pointer = { x: e.clientX, y: e.clientY };
    this.watch(true);
    const at = this.cellAt(e.clientX, e.clientY);
    const link = at ? this.model.linkAt(at.row, at.col) : null;
    const was = this.hover;
    this.grabbing = !link && !!at && (this.model.gripAt(at.row, at.col) || this.softRow(e.clientY));
    if (link && was && link.row === was.row && link.col === was.col && link.len === was.len) return;
    if (!link && !was) {
      this.setCursor();
      return;
    }
    this.setHover(link, at?.y ?? 0);
  };

  /** The pointer is on the grip or the soft grip row (not on a link). */
  private grabbing = false;

  /** Placed without a frame: the top screen row is a soft grip (ADR 0065, 0084). */
  private soft = false;

  /** `y` client px lies in the top screen row of a borderless pane. */
  private softRow(y: number): boolean {
    if (!this.soft) return false;
    const dy = y - this.content.getBoundingClientRect().top;
    return dy >= 0 && dy < this.ctx.cells.get().h;
  }

  private setCursor(): void {
    const link = this.hover;
    const c = link && !link.tip && this.onLink ? 'pointer' : this.grabbing ? 'grab' : '';
    if (this.content.style.cursor !== c) this.content.style.cursor = c;
  }

  private readonly onLeave = (e: PointerEvent): void => {
    // Firefox sends pointerleave when the row under the pointer is redrawn
    // (the hover band replaces its element): ignore it while the pointer is
    // still over the content itself. Over the close cross, a float handle
    // or another pane (inside the content's box, on top of it) it ends.
    const r = this.content.getBoundingClientRect();
    const inBox = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
    if (inBox && this.over(e.clientX, e.clientY)) return;
    this.clearPointer();
  };

  private readonly onCancel = (): void => this.clearPointer();

  /**
   * True when (`x`, `y`) client px is inside the content's box and nothing
   * else is on top there (where the browser can tell: `elementFromPoint`).
   */
  private over(x: number, y: number): boolean {
    const r = this.content.getBoundingClientRect();
    // A box without a size: no layout to tell by (a test DOM).
    if ((r.width > 0 || r.height > 0) && !(x >= r.left && x < r.right && y >= r.top && y < r.bottom)) return false;
    const top = typeof this.ctx.doc.elementFromPoint === 'function' ? this.ctx.doc.elementFromPoint(x, y) : null;
    return !top || this.content.contains(top);
  }

  /** The pointer is gone from the content: no hover, no grab cursor, no watching. */
  private clearPointer(): void {
    this.pointer = null;
    this.grabbing = false;
    this.watch(false);
    if (this.hover) this.setHover(null);
    else this.setCursor();
  }

  /** The document listeners that end the hover (see the file header) are on. */
  private watching = false;

  private watch(on: boolean): void {
    if (on === this.watching) return;
    this.watching = on;
    const doc = this.ctx.doc;
    const win = doc.defaultView;
    const add = on ? 'addEventListener' : 'removeEventListener';
    doc[add]('pointermove', this.onDocMove, true);
    doc[add]('pointercancel', this.onDocGone, true);
    doc[add]('visibilitychange', this.onDocGone);
    doc.documentElement[add]('pointerleave', this.onDocGone);
    win?.[add]('blur', this.onDocGone);
  }

  /** A pointermove anywhere: one outside the content ends the hover. */
  private readonly onDocMove = (e: Event): void => {
    const t = e.target;
    // A row the redraw just replaced is no longer in the document.
    if (t instanceof Node && (!t.isConnected || this.content.contains(t))) return;
    this.clearPointer();
  };

  /** The pointer left the window, was cancelled, or the window lost the focus or went hidden. */
  private readonly onDocGone = (e: Event): void => {
    if (e.type === 'visibilitychange' && this.ctx.doc.visibilityState === 'visible') return;
    // Firefox also sends the root a pointerleave while the pointer is in
    // the page: it counts only with a point outside the window or off the
    // content.
    if (e.type === 'pointerleave' && e instanceof MouseEvent) {
      const win = this.ctx.doc.defaultView;
      const inWindow = !!win && e.clientX >= 0 && e.clientY >= 0 && e.clientX < win.innerWidth && e.clientY < win.innerHeight;
      if (inWindow && this.over(e.clientX, e.clientY)) return;
    }
    this.clearPointer();
  };

  /** The indicator row (`↑ N more rows`) goes back to the anchor. Links are pressed, not clicked (onDown). */
  private readonly onClick = (e: MouseEvent): void => {
    if (this.shown.over && this.moreEl.contains(e.target as Node)) this.scrollToAnchor();
  };

  /** A primary press on a link, until its release (document listeners: a rebuilt row or a pointer capture elsewhere still releases). */
  private press: PaneLink | null = null;

  private readonly onDown = (e: PointerEvent): void => {
    this.endPress();
    if (e.button !== 0 || !e.isPrimary || !this.onLink || this.moreEl.contains(e.target as Node)) return;
    const link = this.linkAt(e.clientX, e.clientY);
    if (!link || link.tip) return;
    this.press = link;
    const doc = this.ctx.doc;
    doc.addEventListener('pointerup', this.onUp, true);
    doc.addEventListener('pointercancel', this.onPressCancel, true);
  };

  private readonly onUp = (e: PointerEvent): void => {
    const was = this.press;
    this.endPress();
    if (!was || e.button !== 0 || !this.onLink) return;
    // The same link where it was pressed (its id may be new after a redraw).
    const link = this.linkAt(e.clientX, e.clientY);
    if (link && !link.tip && link.row === was.row && link.col === was.col && link.len === was.len) this.onLink(link.id);
  };

  private readonly onPressCancel = (): void => this.endPress();

  override cancelPress(): void {
    this.endPress();
  }

  private endPress(): void {
    if (!this.press) return;
    this.press = null;
    const doc = this.ctx.doc;
    doc.removeEventListener('pointerup', this.onUp, true);
    doc.removeEventListener('pointercancel', this.onPressCancel, true);
  }

  private setHover(link: PaneLink | null, rowY = 0): void {
    const was = this.hover;
    this.hover = link;
    this.setCursor();
    if (link?.hint) this.showTip(link, rowY);
    else this.hideTip();
    if (was !== link) this.markDirty();
  }

  private showTip(link: PaneLink, rowY: number): void {
    const host = this.el.parentElement;
    if (!host) return;
    const doc = this.ctx.doc;
    const tip = (this.tipEl ??= doc.createElement('div'));
    tip.className = 'wc-spane-tip';
    tip.setAttribute('role', 'tooltip');
    const lines = link.hint.split('\n');
    tip.replaceChildren(
      ...lines.map((l) => {
        const d = doc.createElement('div');
        d.textContent = ` ${l} `;
        return d;
      }),
    );
    if (tip.parentElement !== host) host.append(tip);
    const cell = this.ctx.cells.get();
    const px = (v: string): number => parseFloat(v) || 0;
    const left = px(this.el.style.left) + px(this.content.style.left);
    const top = px(this.el.style.top) + px(this.content.style.top);
    let y = top + rowY + cell.h;
    const H = host.clientHeight;
    if (H > 0 && y + lines.length * cell.h > H) y = Math.max(0, top + rowY - lines.length * cell.h);
    const x = left + link.col * cell.w;
    tip.style.top = `${y}px`;
    tip.style.left = `${x}px`;
    tip.hidden = false;
    const W = host.clientWidth;
    const tw = tip.offsetWidth;
    if (W > 0 && tw > 0 && x + tw > W) tip.style.left = `${Math.max(0, W - tw)}px`;
  }

  private hideTip(): void {
    if (this.tipEl) this.tipEl.hidden = true;
  }
}
