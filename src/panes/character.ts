// Character pane (Inv §2.2; Cockpit docs/status-pane.md is the knowledge
// reference). Nine rows, no blank separators, every colour from the pane's
// shade ramp (shade.ts), resolved per render:
//
//   ▌           Rasta           L26▐   1  name centred, XP bar as background, level badge
//   ▌▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀          ▐   2  TP thin bar
//   ▌ SNEAK   RIDE    CLIMB   SWIM ▐   3  four filled toggle boxes
//   ▌     MOOD         ALERTNESS   ▐   4–6  gauge: label / value bar / ticks
//   ▌    brave          normal     ▐
//   ▌▀   ▀  ▀   ▀  ▀  ▀  ▀  ▀  ▀  ▀▐
//   ▌   POSITION         WIMPY     ▐   7–9
//   ▌   standing          50       ▐
//   ▌▀    ▀     ▀    ▀     ^       ▐
//
// The layout is the pure `characterLines`; the pane turns the lines into
// DOM once per frame after a change, patching only the rows that changed.
// Char.Vitals arrives with every prompt but mostly changes values the board
// does not show (hp, mana, moves): such a render is skipped. Shorter than nine rows: the first
// H−1 rows and `↓ N more rows`.

import type { Settings } from '../settings/types';
import { ALERTNESS_STEPS, type CharView, MOOD_STEPS, POSITION_STEPS, TOGGLES } from '../gmcp/char';
import type { ShadeRole } from '../theme/color';
import { CellLine, RowList, centre, overflowLine } from './grid';
import { PaneShell } from './pane';
import type { PaneContext } from './context';
import { paneShade } from './shade';

/** Content rows of the full board. */
export const CHARACTER_ROWS = 9;

type Ramp = Readonly<Record<ShadeRole, string>>;

/** Widths of the four toggle columns: (W−3)/4, the remainder to the leftmost. */
export function colWidths(w: number): number[] {
  const inner = Math.max(0, w - 3);
  const base = Math.floor(inner / 4);
  const extra = inner % 4;
  return [0, 1, 2, 3].map((i) => base + (i < extra ? 1 : 0));
}

/** The two gauge columns: cols 1+2 and 3+4 of the toggle grid, each plus a gap. */
export function gaugeWidths(w: number): [number, number] {
  const c = colWidths(w);
  return [c[0]! + c[1]! + 1, c[2]! + c[3]! + 1];
}

/** Tooth positions for `n` ordinal steps across `colW` cells. */
export function toothPositions(n: number, colW: number): number[] {
  if (n <= 1 || colW <= 1) return [0];
  return Array.from({ length: n }, (_, k) => Math.round((k * (colW - 1)) / (n - 1)));
}

interface Gauge {
  label: string;
  value: string | null;
  /** Ordinal steps, or null for the continuous wimpy caret. */
  steps: readonly string[] | null;
  /** Wimpy caret position 0–1, or null to hide it. */
  caret: number | null;
}

function gauges(v: CharView): [Gauge, Gauge, Gauge, Gauge] {
  const caret = v.wimpy !== null && v.maxhp !== null && v.maxhp > 0 ? Math.max(0, Math.min(1, v.wimpy / v.maxhp)) : null;
  return [
    { label: 'MOOD', value: v.mood, steps: MOOD_STEPS, caret: null },
    { label: 'ALERTNESS', value: v.alertness, steps: ALERTNESS_STEPS, caret: null },
    { label: 'POSITION', value: v.position, steps: POSITION_STEPS, caret: null },
    { label: 'WIMPY', value: v.wimpy === null ? null : String(Math.trunc(v.wimpy)), steps: null, caret },
  ];
}

/** Writes one gauge's three rows at column `x`, width `w`. */
function drawGauge(rows: [CellLine, CellLine, CellLine], x: number, w: number, g: Gauge, ramp: Ramp): void {
  rows[0].put(x, centre(g.label, w), { fg: ramp.dim });
  rows[1].fill(x, x + w, { bg: ramp.track });
  if (g.value !== null) rows[1].put(x, centre(g.value, w), { fg: ramp.vtext });
  if (g.steps) {
    const active = g.value === null ? -1 : g.steps.indexOf(g.value);
    const pos = toothPositions(g.steps.length, w);
    pos.forEach((p, k) => rows[2].put(x + p, '▀', { fg: ramp.track }));
    if (active >= 0) rows[2].put(x + pos[active]!, '▀', { fg: ramp.glow });
  } else if (g.caret !== null && w > 0) {
    rows[2].put(x + Math.round(g.caret * (w - 1)), '^', { fg: ramp.glow });
  }
}

/** The full nine rows for `v` at width `w`. */
export function characterBoard(v: CharView, ramp: Ramp, w: number): CellLine[] {
  // Row 1: name centred over the XP bar, level badge at the right.
  const r1 = new CellLine(w);
  r1.put(0, centre(v.name ?? '—', w), { fg: ramp.label });
  if (v.xp) {
    const base = Math.floor(w * v.xp.baseline);
    const fill = Math.floor(w * v.xp.progress);
    r1.fill(0, base, { bg: ramp.track });
    r1.fill(base, fill, { bg: ramp.dim });
  }
  if (v.level !== null) {
    const badge = `L${v.level}`;
    r1.put(w - badge.length, badge, { fg: ramp.label });
  }
  // Row 2: TP thin bar.
  const r2 = new CellLine(w);
  if (v.tp) {
    const base = Math.floor(w * v.tp.baseline);
    const fill = Math.floor(w * v.tp.progress);
    r2.put(0, '▀'.repeat(base), { fg: ramp.dim });
    r2.put(base, '▀'.repeat(Math.max(0, fill - base)), { fg: ramp.mid });
  }
  // Row 3: toggle boxes.
  const r3 = new CellLine(w);
  let x = 0;
  colWidths(w).forEach((cw, i) => {
    const t = TOGGLES[i]!;
    r3.put(x, centre(t.toUpperCase(), cw), { fg: ramp.paneBg, bg: v.toggles[t] ? ramp.glow : ramp.track });
    x += cw + 1;
  });
  // Rows 4–9: the 2×2 gauges.
  const [gl, gr] = gaugeWidths(w);
  const g = gauges(v);
  const block = (): [CellLine, CellLine, CellLine] => [new CellLine(w), new CellLine(w), new CellLine(w)];
  const top = block();
  const bottom = block();
  drawGauge(top, 0, gl, g[0], ramp);
  drawGauge(top, gl + 1, gr, g[1], ramp);
  drawGauge(bottom, 0, gl, g[2], ramp);
  drawGauge(bottom, gl + 1, gr, g[3], ramp);
  return [r1, r2, r3, ...top, ...bottom];
}

/** The rows shown in a `w` × `h` pane (clipped with the overflow line). */
export function characterLines(v: CharView, ramp: Ramp, w: number, h: number): CellLine[] {
  if (w <= 0 || h <= 0) return [];
  const board = characterBoard(v, ramp, w);
  if (board.length <= h) return board;
  return [...board.slice(0, h - 1), overflowLine(w, board.length - (h - 1), 'rows')];
}

export class CharacterPane extends PaneShell {
  private readonly list = new RowList(this.content);
  /** What the board on screen was drawn from; '' after a blank. */
  private shownKey = '';

  constructor(ctx: PaneContext) {
    super(ctx, 'character');
    this.own(ctx.game.subscribe((part) => part === 'char' && this.markDirty()));
  }

  protected override render(): void {
    const s: Readonly<Settings> = this.ctx.settings.get();
    const { ramp } = paneShade(s, 'character');
    const view = this.ctx.game.char.view();
    const key = JSON.stringify([view, ramp, this.cols, this.rows]);
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.list.update(this.ctx.doc, characterLines(view, ramp, this.cols, this.rows));
  }

  protected override blank(): void {
    this.shownKey = '';
    this.list.reset();
    super.blank();
  }
}
