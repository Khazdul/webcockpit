// Options → Panes → Timers (Inv §2.6.3, ADR 0122; interim until stage
// 39c gives it the new settings):
//
//   ─── Timers ───
//             Blue   Green  Red    Magent Cyan   Violet Orange
//   Sanctuary [ ]███ [ ]███ …
//   Spells    [X]███ [ ]███ [ ]███ [ ]███ [ ]███ [ ]███ [ ]███
//   …
//
//      << [X] Display headers >>
//         [X] Time text
//
//      << Back >>
//
// Per row 0 or 1 swatch checked: 0 hides the group (row dim, colour
// remembered). ↑↓ rows, ←→ columns on the grid rows, Enter/click toggles,
// hover moves the cursor. Every change goes to the settings store at once,
// so the pane follows live on both surfaces. The semantics (`colorToggle`,
// `swatchOf`) are shared with the Timers gear popup (../pane-options-model.ts).

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { TIMER_COLOR_HEX, TIMER_COLOR_LABELS, TIMER_COLOR_ORDER, type TimerGroupSettings } from '../../settings';
import { TIMER_GROUPS, TIMER_GROUP_LABELS, type TimerGroup } from '../../timers/entry';
import { useGrid, useServices, useSettings } from '../kit/hooks';
import { centreLeft } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { Blank, CheckCell, Line, type MenuItem, MenuRows, Page } from '../kit/widgets';
import { colorToggle, swatchOf } from '../pane-options-model';

export { colorToggle } from '../pane-options-model';

const LABEL_W = 10;
/** `[X]███` plus one space. */
const CELL_W = 7;
const N_COLORS = TIMER_COLOR_ORDER.length;
const GRID_COLS = N_COLORS;
/** The grid's width in cells (centred as a block). */
export const TIMERS_GRID_W = LABEL_W + N_COLORS * CELL_W;

/** The dim header row over the grid. */
export function timersHeader(): string {
  return ' '.repeat(LABEL_W) + TIMER_COLOR_ORDER.map((c) => TIMER_COLOR_LABELS[c].slice(0, 6).padEnd(CELL_W)).join('');
}

export function TimersOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const { cols } = useGrid();
  const n = TIMER_GROUPS.length;
  // Rows 0..n-1: groups; n: headers; n+1: time text; n+2: Back.
  const ROWS = n + 3;
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const t = s.timers;

  const patch = (g: TimerGroup, p: Partial<TimerGroupSettings>): void =>
    settings.update({ timers: { groups: { [g]: p } } });
  const activateCell = (r: number, c: number): void => {
    const g = TIMER_GROUPS[r]!;
    const cur = settings.get().timers.groups[g];
    if (c < N_COLORS) patch(g, colorToggle(g, cur, TIMER_COLOR_ORDER[c]!));
  };
  const toggleHeaders = (): void => settings.update((d) => void (d.timers.headers = !d.timers.headers));
  const toggleTimeText = (): void => settings.update((d) => void (d.timers.timeText = !d.timers.timeText));
  const tail: MenuItem[] = [
    { key: 'headers', glyph: t.headers ? '[X]' : '[ ]', label: 'Display headers', activate: toggleHeaders },
    { key: 'timetext', glyph: t.timeText ? '[X]' : '[ ]', label: 'Time text', activate: toggleTimeText },
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
        else if (row === n + 1) toggleTimeText();
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
        return (
          <Line at={at} class="wc-grid-row">
            <span class={off ? 'wc-c-off' : 'wc-c-item'} data-group={g}>
              {TIMER_GROUP_LABELS[g].padEnd(LABEL_W)}
            </span>
            {TIMER_COLOR_ORDER.map((c, ci) => (
              <>
                <CheckCell
                  checked={gs.enabled && swatchOf(g, gs.color) === c}
                  cursor={cur(ci)}
                  swatch={TIMER_COLOR_HEX[c]}
                  off={off}
                  title={`${TIMER_GROUP_LABELS[g]}: ${TIMER_COLOR_LABELS[c]}`}
                  {...cell(ci)}
                />{' '}
              </>
            ))}
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
