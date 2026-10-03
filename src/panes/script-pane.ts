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
//   in the DOM. A hovered link is drawn in the glow band and shows its
//   hint as a tooltip (`.wc-spane-tip`, one cell row per hint line, under
//   the link, over everything in the cockpit). A click calls `onLink(id)`;
//   without `onLink` (the log player) links are inert but keep their tips.
//   A tooltip-only link (`tip`) shows its hint without band or cursor.
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

import { type Color, shadeRoleOf } from '../core/types';
import { keyNameFromEvent } from '../script/keys';
import type { PaneId } from '../layout/types';
import { colorToCss } from '../ui/palette';
import type { PaneContext } from './context';
import { forwardWheel } from './anchored-list';
import { CellLine, INDICATOR_FG, RowList, centre } from './grid';
import { PaneShell } from './pane';
import { type PaneContent, type PaneField, type PaneLine, type PaneLink } from './script-content';
import { fillFor, paneShade } from './shade';
import { type ShadeRole, fitContrast, lightShift } from '../theme/color';

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
}

/** Colours as given; uncoloured text inherits (tests, the default). */
export const PLAIN_INK: PaneInk = { base: '', fg: (c) => c };

/** Text colours for a pane on `bg` (ADR 0041's 4.5:1 rule on a light pane). */
export function paneInk(termFg: string, bg: string, light: boolean): PaneInk {
  const toward = light ? '#000000' : '#ffffff';
  return {
    base: fitContrast(termFg, bg, 4.5, toward),
    fg: light ? (c) => fitContrast(lightShift(c), bg, 4.5, toward) : (c) => c,
  };
}

/**
 * CSS colour of a line-model colour, palette 0–15 from `ansi`; a shade-role
 * colour (ADR 0065) from `ramp` (empty without one: the default colour).
 */
export function paneColor(c: Color, ansi: readonly string[], ramp?: Ramp): string {
  const role = shadeRoleOf(c);
  if (role) return ramp?.[role] ?? '';
  return c < 16 ? (ansi[c] ?? colorToCss(c)) : colorToCss(c);
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
    line.put(x, s.text, {
      fg: s.fg === undefined ? ink.base : shadeRoleOf(s.fg) ? paneColor(s.fg, ansi, ramp) : ink.fg(paneColor(s.fg, ansi)),
      bg: s.bg === undefined ? '' : paneColor(s.bg, ansi, ramp),
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

/** Every content line as a row of `w` cells (the scroller's rows), the hovered link in the glow band. */
export function scriptPaneRows(
  c: PaneContent,
  w: number,
  ramp: Ramp,
  light: boolean,
  ansi: readonly string[],
  hover: PaneLink | null = null,
  ink: PaneInk = PLAIN_INK,
): CellLine[] {
  if (w <= 0) return [];
  const out: CellLine[] = [];
  for (let i = 0; i < c.lines.length; i++) {
    const line = paneLine(c.lines[i]!, w, ramp, light, ansi, ink);
    if (c.fields.length > 0) fieldBands(line, c.fields, i, w, ramp);
    if (hover && hover.row === i && !hover.tip) line.fill(hover.col, hover.col + hover.len, { fg: ramp.paneBg, bg: ramp.glow });
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
    const key = `${c.version}|${this.cols}x${this.rows}|${this.hover ? `${this.hover.row},${this.hover.col},${this.hover.len}` : ''}|${JSON.stringify(ramp)}|${light}|${bg}|${fg}|${ansi.join(',')}`;
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
    this.list.update(this.ctx.doc, scriptPaneRows(c, this.cols, ramp, light, ansi, this.hover, ink));
    this.shown = { n, listH, over };
    // A console follows new lines while it is at the end.
    if (bottom && this.live) this.scroller.scrollTop = Math.max(0, n - listH) * cellH;
    this.updateMore();
    this.syncFields(ramp);
    this.resolveHover();
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
    if (!args[0]) this.setHover(null);
  }

  override dispose(): void {
    this.setHover(null);
    this.tipEl?.remove();
    for (const [id, el] of [...this.inputs]) this.dropInput(id, el);
    const c = this.content;
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('click', this.onClick);
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

  /** The link under (`x`, `y`) client px, or null. */
  linkAt(x: number, y: number): PaneLink | null {
    const at = this.cellAt(x, y);
    return at ? this.model.linkAt(at.row, at.col) : null;
  }

  private readonly onMove = (e: PointerEvent): void => {
    this.pointer = { x: e.clientX, y: e.clientY };
    const at = this.cellAt(e.clientX, e.clientY);
    const link = at ? this.model.linkAt(at.row, at.col) : null;
    const was = this.hover;
    if (link && was && link.row === was.row && link.col === was.col && link.len === was.len) return;
    if (!link && !was) return;
    this.setHover(link, at?.y ?? 0);
  };

  private readonly onLeave = (e: PointerEvent): void => {
    // Firefox sends pointerleave when the row under the pointer is redrawn
    // (the hover band replaces its element): ignore it while the pointer is
    // still over the content.
    const r = this.content.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) return;
    this.pointer = null;
    this.setHover(null);
  };

  private readonly onClick = (e: MouseEvent): void => {
    if (this.shown.over && this.moreEl.contains(e.target as Node)) {
      this.scrollToAnchor();
      return;
    }
    if (!this.onLink) return;
    const link = this.linkAt(e.clientX, e.clientY);
    if (link && !link.tip) this.onLink(link.id);
  };

  private setHover(link: PaneLink | null, rowY = 0): void {
    const was = this.hover;
    this.hover = link;
    this.content.style.cursor = link && !link.tip && this.onLink ? 'pointer' : '';
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
