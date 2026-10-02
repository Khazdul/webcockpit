// A script's own pane (spec §2.10 "Panes", ADR 0053): draws a
// `PaneContent` (script-content.ts) with the cell grid (grid.ts) inside
// the usual pane frame, so it docks, floats, toggles and takes the pane
// colour like the built-in panes.
//
//   ▌Mercenaries          ▐
//   ▌Bob   ████████   12m ▐    a gauge row, label centred
//   ▌[tap] [pay] [leave]  ▐    links: pointer cursor, hover band, tooltip
//
// - Content taller than the pane shows its end (the newest lines, like a
//   console) with `↑ N more rows` on the first row.
// - Colours: the cecho colours of the spans (palette 0–15 from the user's
//   ANSI palette, the rest as is). Text without a colour takes the
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
// - The content is kept while the connection is not `playing` (like UI).
// - Render is coalesced: callers change the content and call `changed()`,
//   which marks the pane dirty (one render per frame, none while hidden).

import type { Color } from '../core/types';
import type { PaneId } from '../layout/types';
import { colorToCss } from '../ui/palette';
import type { PaneContext } from './context';
import { CellLine, INDICATOR_FG, RowList, centre } from './grid';
import { PaneShell } from './pane';
import { type PaneContent, type PaneLine, type PaneLink } from './script-content';
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
}

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

/** CSS colour of a line-model colour, palette 0–15 from `ansi`. */
export function paneColor(c: Color, ansi: readonly string[]): string {
  return c < 16 ? (ansi[c] ?? colorToCss(c)) : colorToCss(c);
}

/** Which content lines a `h`-row pane shows: from `first`, below `top` indicator rows. */
export function paneView(n: number, h: number): { first: number; top: number } {
  if (n <= h || h <= 0) return { first: 0, top: 0 };
  return { first: n - (h - 1), top: 1 };
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
    line.put(x, s.text, {
      fg: s.fg === undefined ? ink.base : ink.fg(paneColor(s.fg, ansi)),
      bg: s.bg === undefined ? '' : paneColor(s.bg, ansi),
      bold: !!s.bold,
      italic: !!s.italic,
      underline: !!s.underline,
    });
    x += s.text.length;
  }
  return line;
}

/** The rows a `w` × `h` pane shows for `c`, the hovered link drawn in the glow band. */
export function scriptPaneLines(
  c: PaneContent,
  w: number,
  h: number,
  ramp: Ramp,
  light: boolean,
  ansi: readonly string[],
  hover: PaneLink | null = null,
  ink: PaneInk = PLAIN_INK,
): CellLine[] {
  if (w <= 0 || h <= 0) return [];
  const { first, top } = paneView(c.lines.length, h);
  const out: CellLine[] = [];
  if (top) out.push(new CellLine(w).put(0, `↑ ${first} more rows`, { fg: INDICATOR_FG, italic: true }));
  for (let i = first; i < c.lines.length; i++) {
    const line = paneLine(c.lines[i]!, w, ramp, light, ansi, ink);
    if (hover && hover.row === i) line.fill(hover.col, hover.col + hover.len, { fg: ramp.paneBg, bg: ramp.glow });
    out.push(line);
  }
  return out;
}

export class ScriptPane extends PaneShell {
  readonly model: PaneContent;
  private readonly list = new RowList(this.content);
  private readonly onLink: ((id: number) => void) | null;
  private readonly onTitle: () => void;
  /** What the rows on screen were drawn from. */
  private shownKey = '';
  /** The view of the last render. */
  private view = { first: 0, top: 0 };
  private hover: PaneLink | null = null;
  private tipEl: HTMLDivElement | null = null;

  constructor(ctx: PaneContext, id: PaneId, opts: ScriptPaneOptions) {
    super(ctx, id, { label: opts.content.title || id, blankWhenInactive: false });
    this.model = opts.content;
    this.onLink = opts.onLink ?? null;
    this.onTitle = opts.onTitle ?? (() => {});
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
    // The hovered link may have gone with the last change.
    if (this.hover && !c.links.some((l) => l.id === this.hover!.id && l.row === this.hover!.row)) this.setHover(null);
    const key = `${c.version}|${this.cols}x${this.rows}|${this.hover?.id ?? ''}|${JSON.stringify(ramp)}|${light}|${bg}|${fg}|${ansi.join(',')}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.view = paneView(c.lines.length, this.rows);
    this.list.update(this.ctx.doc, scriptPaneLines(c, this.cols, this.rows, ramp, light, ansi, this.hover, paneInk(fg, bg, light)));
  }

  override place(...args: Parameters<PaneShell['place']>): void {
    super.place(...args);
    if (!args[0]) this.setHover(null);
  }

  override dispose(): void {
    this.setHover(null);
    this.tipEl?.remove();
    const c = this.content;
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('click', this.onClick);
    super.dispose();
  }

  /** The content row and column under (`x`, `y`) client px, or null. */
  cellAt(x: number, y: number): { row: number; col: number; screenRow: number } | null {
    const r = this.content.getBoundingClientRect();
    const cell = this.ctx.cells.get();
    if (cell.w <= 0 || cell.h <= 0) return null;
    const col = Math.floor((x - r.left) / cell.w);
    const screenRow = Math.floor((y - r.top) / cell.h);
    if (col < 0 || col >= this.cols || screenRow < this.view.top || screenRow >= this.rows) return null;
    return { row: screenRow - this.view.top + this.view.first, col, screenRow };
  }

  /** The link under (`x`, `y`) client px, or null. */
  linkAt(x: number, y: number): PaneLink | null {
    const at = this.cellAt(x, y);
    return at ? this.model.linkAt(at.row, at.col) : null;
  }

  private readonly onMove = (e: PointerEvent): void => {
    const at = this.cellAt(e.clientX, e.clientY);
    const link = at ? this.model.linkAt(at.row, at.col) : null;
    if (link?.id === this.hover?.id && link?.row === this.hover?.row) return;
    this.setHover(link, at?.screenRow ?? 0);
  };

  private readonly onLeave = (e: PointerEvent): void => {
    // Firefox sends pointerleave when the row under the pointer is redrawn
    // (the hover band replaces its element): ignore it while the pointer is
    // still over the content.
    const r = this.content.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) return;
    this.setHover(null);
  };

  private readonly onClick = (e: MouseEvent): void => {
    if (!this.onLink) return;
    const link = this.linkAt(e.clientX, e.clientY);
    if (link) this.onLink(link.id);
  };

  private setHover(link: PaneLink | null, screenRow = 0): void {
    const was = this.hover;
    this.hover = link;
    this.content.style.cursor = link && this.onLink ? 'pointer' : '';
    if (link?.hint) this.showTip(link, screenRow);
    else this.hideTip();
    if (was !== link) this.markDirty();
  }

  private showTip(link: PaneLink, screenRow: number): void {
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
    let y = top + (screenRow + 1) * cell.h;
    const H = host.clientHeight;
    if (H > 0 && y + lines.length * cell.h > H) y = Math.max(0, top + screenRow * cell.h - lines.length * cell.h);
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
