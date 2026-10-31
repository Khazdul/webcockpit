// Options → Panes → Timers (Inv §2.6.3; Cockpit ADR 0126 is the
// knowledge reference):
//
//   ─── Timers ───
//            Blue   Green  Red    Magent Cyan   Violet Orange  Cols   Clock  Bar
//   Spells   [X]███ [ ]███ [ ]███ [ ]███ [ ]███ [ ]███ [ ]███  ◄ 4 ►   [ ]  [X]
//   …
//   Charmies [ ]███ …                    [X]███ …              ◄ 1 ►
//
//      << [X] Display headers >>
//         [X] Compact layout
//
//      << Back >>
//
// Per row 0 or 1 swatch checked: 0 hides the group (row dim, colour
// remembered). `◄ N ►` steps the column cap (1–6, Charmies 1–2); Clock and
// Bar are per group, inert blanks for Charmies. ↑↓ rows, ←→ columns on the
// grid rows, Enter/click toggles, hover moves the cursor. Every change goes
// to the settings store at once, so the pane follows live on both surfaces.
// The semantics (`colorToggle`, `stepCols`) are shared with the Timers gear
// popup (../pane-options-model.ts).

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { TIMER_COLOR_HEX, TIMER_COLOR_LABELS, TIMER_COLOR_ORDER, type TimerGroupSettings } from '../../settings';
import { TIMER_GROUPS, TIMER_GROUP_LABELS, type TimerGroup } from '../../timers/entry';
import { useGrid, useServices, useSettings } from '../kit/hooks';
import { centreLeft } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { Blank, CheckCell, Line, type MenuItem, MenuRows, Page } from '../kit/widgets';
import { colorToggle, stepCols } from '../pane-options-model';

export { colorToggle, stepCols } from '../pane-options-model';

const LABEL_W = 9;
/** `[X]███` plus one space. */
const CELL_W = 7;
const N_COLORS = TIMER_COLOR_ORDER.length;
/** Cursor columns on a grid row: the colours, ◄, ►, Clock, Bar. */
export const TIMERS_COL = { dec: N_COLORS, inc: N_COLORS + 1, clock: N_COLORS + 2, bar: N_COLORS + 3 } as const;
const GRID_COLS = N_COLORS + 4;
const STEP_W = 5; // `◄ N ►`
const CLOCK_W = 5;
const BAR_W = 3;
/** The grid's width in cells (centred as a block). */
export const TIMERS_GRID_W = LABEL_W + N_COLORS * CELL_W + 1 + STEP_W + 2 + CLOCK_W + 2 + BAR_W;

/** `text` centred in `w` cells (extra space on the right). */
const centred = (text: string, w: number): string => {
  const t = text.slice(0, w);
  const left = Math.floor((w - t.length) / 2);
  return ' '.repeat(left) + t + ' '.repeat(w - t.length - left);
};

/** The dim header row over the grid. */
export function timersHeader(): string {
  return (
    ' '.repeat(LABEL_W) +
    TIMER_COLOR_ORDER.map((c) => TIMER_COLOR_LABELS[c].slice(0, 6).padEnd(CELL_W)).join('') +
    ' ' +
    centred('Cols', STEP_W) +
    '  ' +
    centred('Clock', CLOCK_W) +
    '  ' +
    centred('Bar', BAR_W)
  );
}

export function TimersOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const { cols } = useGrid();
  const n = TIMER_GROUPS.length;
  // Rows 0..n-1: groups; n: headers; n+1: compact; n+2: Back.
  const ROWS = n + 3;
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const t = s.timers;

  const patch = (g: TimerGroup, p: Partial<TimerGroupSettings>): void =>
    settings.update({ timers: { groups: { [g]: p } } });
  const activateCell = (r: number, c: number): void => {
    const g = TIMER_GROUPS[r]!;
    const cur = settings.get().timers.groups[g];
    if (c < N_COLORS) patch(g, colorToggle(cur, TIMER_COLOR_ORDER[c]!));
    else if (c === TIMERS_COL.dec || c === TIMERS_COL.inc) {
      patch(g, { cols: stepCols(g, cur.cols, c === TIMERS_COL.dec ? -1 : 1) });
    } else if (g === 'charm') return;
    else if (c === TIMERS_COL.clock) patch(g, { clock: !cur.clock });
    else patch(g, { bar: !cur.bar });
  };
  const toggleHeaders = (): void => settings.update((d) => void (d.timers.headers = !d.timers.headers));
  const toggleCompact = (): void => settings.update((d) => void (d.timers.compact = !d.timers.compact));
  const tail: MenuItem[] = [
    { key: 'headers', glyph: t.headers ? '[X]' : '[ ]', label: 'Display headers', activate: toggleHeaders },
    { key: 'compact', glyph: t.compact ? '[X]' : '[ ]', label: 'Compact layout', activate: toggleCompact },
  ];
  const back: MenuItem[] = [{ key: 'back', label: 'Back', activate: () => nav.pop() }];

  useKeys((_e, nk) => {
    switch (nk) {
      case 'up':
        setRow(Math.max(0, row - 1));
        return true;
      case 'down':
        setRow(Math.min(ROWS - 1, row + 1));
        return true;
      case 'tab':
        setRow((row + 1) % ROWS);
        return true;
      case 'backtab':
        setRow((row + ROWS - 1) % ROWS);
        return true;
      case 'home':
        setRow(0);
        return true;
      case 'end':
        setRow(ROWS - 1);
        return true;
      case 'left':
      case 'right':
        if (row < n) setCol(Math.max(0, Math.min(GRID_COLS - 1, col + (nk === 'left' ? -1 : 1))));
        return true;
      case 'activate':
        if (row < n) activateCell(row, col);
        else if (row === n) toggleHeaders();
        else if (row === n + 1) toggleCompact();
        else nav.pop();
        return true;
    }
    return false;
  });

  const at = centreLeft(cols, TIMERS_GRID_W);
  const cursorStyle = { color: 'var(--c-cursor)', fontWeight: 'bold' } as const;
  return (
    <Page title="Timers" footer={['↑↓←→ Move', 'Enter Toggle', 'ESC Back']}>
      <Line at={at} class="wc-c-hint">
        {timersHeader()}
      </Line>
      {TIMER_GROUPS.map((g, r) => {
        const gs = t.groups[g];
        const off = !gs.enabled;
        const cur = (c: number): boolean => row === r && col === c;
        const cell = (c: number) => ({
          onHover: () => {
            setRow(r);
            setCol(c);
          },
          onClick: () => {
            setRow(r);
            setCol(c);
            activateCell(r, c);
          },
        });
        const arrow = (c: number, glyph: string): VNode => (
          <span
            class={'wc-timers-step' + (off ? ' wc-c-off' : ' wc-c-item')}
            data-step={c === TIMERS_COL.dec ? 'dec' : 'inc'}
            style={cur(c) ? cursorStyle : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={cell(c).onHover}
            onClick={(e) => {
              e.stopPropagation();
              cell(c).onClick();
            }}
          >
            {glyph}
          </span>
        );
        const inert = g === 'charm';
        const flag = (c: number, checked: boolean, w: number, title: string): VNode => {
          const pad = ' '.repeat(Math.floor((w - 3) / 2));
          const padR = ' '.repeat(w - 3 - pad.length);
          if (inert) {
            return (
              <span class="wc-c-off" onMouseEnter={cell(c).onHover} onMouseDown={(e) => e.preventDefault()}>
                {' '.repeat(w)}
              </span>
            );
          }
          return (
            <>
              {pad}
              <CheckCell checked={checked} cursor={cur(c)} off={off} title={`${TIMER_GROUP_LABELS[g]}: ${title}`} {...cell(c)} />
              {padR}
            </>
          );
        };
        return (
          <Line at={at} class="wc-grid-row">
            <span class={off ? 'wc-c-off' : 'wc-c-item'} data-group={g}>
              {TIMER_GROUP_LABELS[g].padEnd(LABEL_W)}
            </span>
            {TIMER_COLOR_ORDER.map((c, ci) => (
              <>
                <CheckCell
                  checked={gs.enabled && gs.color === c}
                  cursor={cur(ci)}
                  swatch={TIMER_COLOR_HEX[c]}
                  off={off}
                  title={`${TIMER_GROUP_LABELS[g]}: ${TIMER_COLOR_LABELS[c]}`}
                  {...cell(ci)}
                />{' '}
              </>
            ))}{' '}
            {arrow(TIMERS_COL.dec, '◄')}
            <span class={off ? 'wc-c-off' : 'wc-c-item'} data-cols={g}>{` ${gs.cols} `}</span>
            {arrow(TIMERS_COL.inc, '►')}
            {'  '}
            {flag(TIMERS_COL.clock, gs.clock, CLOCK_W, 'clock')}
            {'  '}
            {flag(TIMERS_COL.bar, gs.bar, BAR_W, 'bar')}
          </Line>
        );
      })}
      <Blank />
      <MenuRows items={tail} cursor={row - n} setCursor={(i) => setRow(n + i)} hoverMoves />
      <Blank />
      <MenuRows items={back} cursor={row === n + 2 ? 0 : -1} setCursor={() => setRow(n + 2)} hoverMoves />
    </Page>
  );
}
