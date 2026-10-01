// Group pane (Inv §2.3; Cockpit docs/group-pane.md is the knowledge
// reference). One row per member in the room, ascending GMCP id:
//
//   ▌Gibur█████████ ████████ ███████▐   [HP][Mana][Moves], no gaps
//   ▌a citizen mercenary (MERC)█ ███▐   name overlay from column 0
//
// - Bar widths W/3, the remainder to the leftmost; fill = ⌊pct·w + 0.5⌋.
// - Colour: pct ≤ 0.25 red, ≤ 0.45 orange, else the bar's own colour
//   (washed to a pastel on a light pane; red and orange stay vivid).
// - The name overlay is truncated to W, no ellipsis, in the `vtext` shade,
//   on the bar colour inside a fill and on the pane background outside.
// - Display options (Options → Panes → Group, settings `group`) filter
//   what is drawn only; the model keeps the canonical set.
// - More members than rows: the first H−1 and `↓ N more members`.

import { VITAL_KINDS, type VitalKind } from '../gmcp/bands';
import { type GroupDisplay, type Member, memberTitle, vitalPct } from '../gmcp/group';
import { CellLine, RowList, overflowLine } from './grid';
import type { PaneContext } from './context';
import { PaneShell } from './pane';
import { fillFor, paneShade } from './shade';

export const BAR_RED = '#e02020';
export const BAR_ORANGE = '#ff7020';
export const BAR_COLORS: Readonly<Record<VitalKind, string>> = {
  hp: '#005a18',
  mana: '#0000aa',
  mp: '#5a3c1e',
};

/** Widths of the three bars: W/3, the remainder to the leftmost. */
export function barWidths(w: number): [number, number, number] {
  const base = Math.floor(w / 3);
  const extra = w % 3;
  return [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base];
}

/** Cells filled for `pct` in a bar of `w` cells (round half up; null → 0). */
export function barFill(pct: number | null, w: number): number {
  if (pct === null) return 0;
  return Math.max(0, Math.min(w, Math.floor(pct * w + 0.5)));
}

/** Bar colour for `pct` (thresholds shared by all three bars). */
export function barColor(kind: VitalKind, pct: number | null, light: boolean): string {
  if (pct !== null && pct <= 0.25) return BAR_RED;
  if (pct !== null && pct <= 0.45) return BAR_ORANGE;
  return fillFor(BAR_COLORS[kind], light);
}

/** One member row of `w` cells. */
export function memberLine(m: Member, w: number, nameFg: string, light: boolean): CellLine {
  const line = new CellLine(w);
  let x = 0;
  barWidths(w).forEach((bw, i) => {
    const kind = VITAL_KINDS[i]!;
    const { pct } = vitalPct(kind, m[kind]);
    const n = barFill(pct, bw);
    line.fill(x, x + n, { bg: barColor(kind, pct, light) });
    x += bw;
  });
  const title = memberTitle(m);
  if (title) line.put(0, title.slice(0, w), { fg: nameFg });
  return line;
}

/** The rows shown in a `w` × `h` pane for `members`. */
export function groupLines(members: readonly Member[], w: number, h: number, nameFg: string, light: boolean): CellLine[] {
  if (w <= 0 || h <= 0 || members.length === 0) return [];
  const show = members.length <= h ? members : members.slice(0, h - 1);
  const lines = show.map((m) => memberLine(m, w, nameFg, light));
  if (show.length < members.length) lines.push(overflowLine(w, members.length - show.length, 'members'));
  return lines;
}

export class GroupPane extends PaneShell {
  private displayKey = '';
  private readonly list = new RowList(this.content);

  constructor(ctx: PaneContext) {
    super(ctx, 'group');
    this.own(ctx.game.subscribe((part) => part === 'group' && this.markDirty()));
    this.displayKey = JSON.stringify(ctx.settings.get().group);
    this.own(
      ctx.settings.subscribe((s) => {
        const key = JSON.stringify(s.group);
        if (key === this.displayKey) return;
        this.displayKey = key;
        this.markDirty();
      }),
    );
  }

  protected override render(): void {
    const s = this.ctx.settings.get();
    const shade = paneShade(s, 'group');
    const display: GroupDisplay = s.group;
    const members = this.ctx.game.group.displayed(display);
    const lines = groupLines(members, this.cols, this.rows, shade.ramp.vtext, shade.light);
    // Usually one member's bar changed: only that row is rebuilt.
    this.list.update(this.ctx.doc, lines);
  }

  protected override blank(): void {
    this.list.reset();
    super.blank();
  }
}
