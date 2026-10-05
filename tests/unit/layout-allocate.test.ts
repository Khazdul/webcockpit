import { legacyLayout } from './legacy-defaults';
import { describe, expect, it } from 'vitest';
import {
  type AllocateInput,
  type AxisItem,
  GAME_MIN_COLS,
  allocate,
  allocateAxis,
  clampFloat,
  floatMin,
  minRows,
  paneCrossMin,
  shrinkLanes,
  SIDE_DOCK_MIN,
} from '../../src/layout/allocate';
import { type BuiltinPaneId, DOCKED_BY_DEFAULT, type LayoutModel, PANE_IDS, type PaneId, defaultLayout } from '../../src/layout/types';
import { floatPane, movePane, moveToNewLane, placeScriptPane, setDesired, setFloatRect, setLaneSize } from '../../src/layout/model';

const MIN: Record<BuiltinPaneId, number> = { character: 3, timers: 1, group: 1, comm: 1, ui: 1, map: 3 };
const DES: Record<BuiltinPaneId, number> = { character: 9, timers: 8, group: 6, comm: 10, ui: 5, map: 20 };

const items = (ids: BuiltinPaneId[] = [...DOCKED_BY_DEFAULT], frame = 2): AxisItem[] =>
  ids.map((id) => ({ id, desired: DES[id], min: MIN[id], frame }));

const sizes = (r: ReturnType<typeof allocateAxis>): Record<string, number> =>
  Object.fromEntries(r.sizes.map((s) => [s.id, s.size]));

const total = (r: ReturnType<typeof allocateAxis>, frame = 2): number =>
  r.sizes.reduce((a, s) => a + s.size + frame, 0);

/** Every pane on except `off` and the map (off by default, ADR 0020) unless `mapOn`. */
function toggles(off: PaneId[] = [], noBorder: PaneId[] = [], mapOn = false): AllocateInput['panes'] {
  return Object.fromEntries(
    PANE_IDS.map((id) => [id, { on: (id !== 'map' || mapOn) && !off.includes(id), border: !noBorder.includes(id) }]),
  ) as AllocateInput['panes'];
}

const input = (cols: number, rows: number, layout: LayoutModel = legacyLayout(), panes = toggles()): AllocateInput => ({
  layout,
  panes,
  cols,
  rows,
});

describe('allocateAxis', () => {
  it('gives desired sizes and the leftover to the UI pane when everything fits', () => {
    const r = allocateAxis(items(), 60);
    expect(r.mode).toBe('fit');
    expect(sizes(r)).toEqual({ character: 9, timers: 8, group: 6, comm: 10, ui: 5 + (60 - 48) });
    expect(total(r)).toBe(60);
  });

  it('gives the leftover to Character when UI is not shown, then comm', () => {
    expect(sizes(allocateAxis(items(['timers', 'character', 'group']), 40)).character).toBe(9 + 40 - 29);
    expect(sizes(allocateAxis(items(['group', 'comm']), 30)).comm).toBe(10 + 30 - 20);
  });

  it('reserves a script pane its rows after Character in a full dock, if the others keep their minimums', () => {
    const even = (['character', 'timers', 'group', 'comm', 'ui'] as BuiltinPaneId[]).map((id) => ({
      id: id as PaneId,
      desired: id === 'character' ? 9 : 200,
      min: MIN[id],
      frame: 2,
    }));
    const merc = { id: 'mercenaries/main' as PaneId, desired: 9, min: 1, frame: 2 };
    const r = allocateAxis([...even, merc], 40);
    expect(r.mode).toBe('scaled');
    expect(sizes(r)).toMatchObject({ character: 9, 'mercenaries/main': 9 });
    expect(total(r)).toBe(40);
    // No room for both: the script pane scales with the rest.
    const tight = sizes(allocateAxis([...even, merc], 30));
    expect(tight.character).toBe(9);
    expect(tight['mercenaries/main']).toBeLessThan(9);
  });

  it('keeps exact desired sizes when they sum to the length', () => {
    const r = allocateAxis(items(), 48);
    const { map: _map, ...docked } = DES;
    expect(sizes(r)).toEqual(docked);
    expect(r.mode).toBe('fit');
  });

  it('reserves Character first and scales the others between min and desired', () => {
    const r = allocateAxis(items(), 40);
    expect(r.mode).toBe('scaled');
    const s = sizes(r);
    expect(s.character).toBe(9);
    expect(total(r)).toBe(40);
    for (const id of ['timers', 'group', 'comm', 'ui'] as const) {
      expect(s[id]).toBeGreaterThanOrEqual(MIN[id]);
      expect(s[id]).toBeLessThanOrEqual(DES[id]);
    }
    // Linear: comm (span 9) keeps more than group (span 5).
    expect(s.comm!).toBeGreaterThan(s.group!);
  });

  it('scales Character too when reserving it would starve the others', () => {
    // frames 10 + others' mins 4 + character 9 = 23 > 20.
    const r = allocateAxis(items(), 20);
    const s = sizes(r);
    expect(r.dropped).toEqual([]);
    expect(s.character).toBeLessThan(9);
    expect(s.character).toBeGreaterThanOrEqual(3);
    expect(total(r)).toBe(20);
  });

  it('drops panes in order group, timers, comm, character, ui when minimums do not fit', () => {
    // mins+frames: character 5, timers 3, group 3, comm 3, ui 3 = 17.
    expect(allocateAxis(items(), 17).dropped).toEqual([]);
    expect(allocateAxis(items(), 16).dropped).toEqual(['group']);
    expect(allocateAxis(items(), 13).dropped).toEqual(['group', 'timers']);
    expect(allocateAxis(items(), 10).dropped).toEqual(['group', 'timers', 'comm']);
    expect(allocateAxis(items(), 4).dropped).toEqual(['group', 'timers', 'comm', 'character']);
    const last = allocateAxis(items(), 3);
    expect(sizes(last)).toEqual({ ui: 1 });
    const none = allocateAxis(items(), 2);
    expect(none.mode).toBe('empty');
    expect(none.sizes).toEqual([]);
  });

  it('counts frames only for framed panes', () => {
    const r = allocateAxis(items(['character', 'ui'], 0), 20);
    expect(sizes(r)).toEqual({ character: 9, ui: 11 });
  });

  it('fills the length exactly in every mode', () => {
    for (let len = 17; len <= 80; len++) {
      const r = allocateAxis(items(), len);
      expect(total(r)).toBe(len);
      for (const s of r.sizes) expect(s.size).toBeGreaterThanOrEqual(minRows(s.id));
    }
  });

  it('treats a desired size below the minimum as the minimum', () => {
    const r = allocateAxis([{ id: 'character', desired: 1, min: 3, frame: 2 }, { id: 'ui', desired: 1, min: 1, frame: 2 }], 8);
    expect(sizes(r)).toEqual({ character: 3, ui: 1 });
  });
});

describe('allocate', () => {
  it('lays out the default: game left, input under it, right dock 33 wide and full height', () => {
    const r = allocate(input(120, 50));
    expect(r.tooSmall).toBe(false);
    expect(r.input).toEqual({ x: 0, y: 49, w: 86, h: 1 });
    expect(r.docks.right!.rect).toEqual({ x: 87, y: 0, w: 33, h: 50 });
    expect(r.game).toEqual({ x: 0, y: 0, w: 86, h: 49 });
    expect(r.panes.map((p) => p.id)).toEqual([...DOCKED_BY_DEFAULT]);
    const heights = r.panes.map((p) => p.content.h);
    expect(heights).toEqual([9, 8, 7, 8, 8]); // Character 9, the other 31 rows split about evenly (ADR 0023)
    let y = 0;
    for (const p of r.panes) {
      expect(p.rect.y).toBe(y);
      expect(p.rect.x).toBe(87);
      expect(p.content).toEqual({ x: 88, y: y + 1, w: 31, h: p.rect.h - 2 });
      y += p.rect.h;
    }
    expect(y).toBe(50);
    expect(r.hidden).toEqual([]);
  });

  it('gives an unframed pane its full rectangle as content', () => {
    const r = allocate(input(120, 50, legacyLayout(), toggles([], ['timers'])));
    const t = r.panes.find((p) => p.id === 'timers')!;
    expect(t.framed).toBe(false);
    expect(t.content).toEqual(t.rect);
  });

  it('leaves out panes that are off and hides a dock with no pane on', () => {
    const r = allocate(input(120, 50, legacyLayout(), toggles(['group', 'comm'])));
    expect(r.panes.map((p) => p.id)).toEqual(['character', 'timers', 'ui']);
    const all = allocate(input(120, 50, legacyLayout(), toggles([...PANE_IDS])));
    expect(all.docks).toEqual({});
    expect(all.game).toEqual({ x: 0, y: 0, w: 120, h: 49 });
    expect(all.collapsed).toEqual([]);
  });

  it('drops panes when the window is short, without touching the toggles', () => {
    const r = allocate(input(120, 18));
    // 18 rows = every minimum with frames (17) plus one, to UI.
    expect(r.hidden).toEqual([]);
    expect(r.panes.map((p) => p.content.h)).toEqual([3, 1, 1, 1, 2]);
    const r17 = allocate(input(120, 17));
    expect(r17.tooSmall).toBe(true);
  });

  it('shows the too-small state below 60 × 18', () => {
    expect(allocate(input(59, 40)).tooSmall).toBe(true);
    expect(allocate(input(100, 17)).tooSmall).toBe(true);
    const r = allocate(input(60, 18));
    expect(r.tooSmall).toBe(false);
  });

  it('collapses the side dock when the game pane would get fewer than 30 columns', () => {
    const wide = allocate(input(64, 30));
    expect(wide.game.w).toBe(GAME_MIN_COLS);
    expect(wide.docks.right).toBeDefined();
    const narrow = allocate(input(63, 30));
    expect(narrow.docks.right).toBeUndefined();
    expect(narrow.collapsed).toEqual(['right']);
    expect(narrow.hidden).toEqual([...DOCKED_BY_DEFAULT]);
    expect(narrow.game).toEqual({ x: 0, y: 0, w: 63, h: 29 });
    expect(narrow.input).toEqual({ x: 0, y: 29, w: 63, h: 1 });
  });

  it('keeps the right dock and collapses the left one first', () => {
    let m = movePane(legacyLayout(), 'comm', 'left', 0, 0);
    m = setLaneSize(m, 'left', 0, 20);
    const both = allocate(input(120, 40, m));
    expect(both.docks.left!.rect).toEqual({ x: 0, y: 0, w: 20, h: 40 });
    expect(both.game).toEqual({ x: 21, y: 0, w: 120 - 21 - 34, h: 39 });
    // The input line lies between the side docks, as wide as the game pane.
    expect(both.input).toEqual({ x: 21, y: 39, w: 120 - 21 - 34, h: 1 });
    const r = allocate(input(80, 40, m));
    expect(r.collapsed).toEqual(['left']);
    expect(r.docks.right).toBeDefined();
    expect(r.game.x).toBe(0);
    expect(r.hidden).toEqual(['comm']);
  });

  it('keeps the left dock when only it fits', () => {
    let m = setLaneSize(legacyLayout(), 'right', 0, 50);
    m = movePane(m, 'ui', 'left', 0, 0);
    m = setLaneSize(m, 'left', 0, 12);
    const r = allocate(input(70, 30, m));
    expect(r.collapsed).toEqual(['right']);
    expect(r.docks.left!.rect.w).toBe(12);
  });

  it('lays out the bottom dock under the input line, side by side', () => {
    let m = movePane(legacyLayout(), 'comm', 'bottom', 0, 0);
    m = movePane(m, 'ui', 'bottom', 0, 1);
    const r = allocate(input(120, 50, m));
    const b = r.docks.bottom!;
    // Game rows 0–37, input row 38, gap row 39, bottom dock rows 40–49.
    expect(b.rect).toEqual({ x: 0, y: 40, w: 86, h: 10 });
    expect(r.game).toEqual({ x: 0, y: 0, w: 86, h: 38 });
    expect(r.input).toEqual({ x: 0, y: 38, w: 86, h: 1 });
    expect(r.docks.right!.rect).toEqual({ x: 87, y: 0, w: 33, h: 50 });
    const [comm, ui] = r.panes.filter((p) => p.dock === 'bottom');
    expect(comm!.rect).toEqual({ x: 0, y: 40, w: 32, h: 10 });
    // UI takes the leftover columns.
    expect(ui!.rect).toEqual({ x: 32, y: 40, w: 86 - 32, h: 10 });
    expect(ui!.content.h).toBe(8);
  });

  it('shrinks the bottom dock to keep the game pane 5 rows high, then hides it', () => {
    const m = movePane(legacyLayout(), 'comm', 'bottom', 0, 0);
    const r = allocate(input(120, 18, setLaneSize(m, 'bottom', 0, 20)));
    // 18 rows: game 5 + input 1 + gap 1 leave 11 for the bottom dock.
    expect(r.game.h).toBe(5);
    expect(r.input).toEqual({ x: 0, y: 5, w: 86, h: 1 });
    expect(r.docks.bottom!.rect).toEqual({ x: 0, y: 7, w: 86, h: 11 });
    // A lane below the minimum is shown at the minimum (ADR 0064).
    const small = allocate(input(120, 18, setLaneSize(m, 'bottom', 0, 2)));
    expect(small.docks.bottom!.rect.h).toBe(3);
    // A dock whose lanes cannot all get their minimum collapses: 4 lanes × 3 > 11.
    let four = m;
    for (const [k, id] of (['ui', 'group', 'timers'] as const).entries()) four = moveToNewLane(four, id, 'bottom', k + 1, 3);
    expect(four.docks.bottom.lanes).toHaveLength(4);
    const c = allocate(input(120, 18, four));
    expect(c.collapsed).toEqual(['bottom']);
    expect(c.hidden).toEqual(expect.arrayContaining(['comm', 'ui', 'group', 'timers']));
    expect(c.game.h).toBe(17);
  });

  it('lays out the top dock above the game pane, side by side, between the side docks', () => {
    let m = movePane(legacyLayout(), 'comm', 'top', 0, 0);
    m = movePane(m, 'group', 'left', 0, 0);
    m = setLaneSize(m, 'left', 0, 20);
    const r = allocate(input(120, 50, m));
    const t = r.docks.top!;
    expect(t.rect).toEqual({ x: 21, y: 0, w: 120 - 21 - 34, h: 10 });
    expect(r.game).toEqual({ x: 21, y: 11, w: 120 - 21 - 34, h: 49 - 11 });
    expect(r.docks.left!.rect).toEqual({ x: 0, y: 0, w: 20, h: 50 });
    const comm = r.panes.find((p) => p.id === 'comm')!;
    expect(comm).toMatchObject({ dock: 'top', index: 0, rect: t.rect });
    expect(r.panes.map((p) => p.dock)).toEqual(['left', 'right', 'right', 'right', 'top']);
    expect(r.input).toEqual({ x: 21, y: 49, w: 120 - 21 - 34, h: 1 });
  });

  it('fits top and bottom docks together and keeps the game pane 5 rows high', () => {
    let m = movePane(legacyLayout(), 'comm', 'top', 0, 0);
    m = movePane(m, 'ui', 'bottom', 0, 0);
    const r = allocate(input(120, 50, m));
    expect(r.docks.top!.rect).toEqual({ x: 0, y: 0, w: 86, h: 10 });
    expect(r.docks.bottom!.rect).toEqual({ x: 0, y: 40, w: 86, h: 10 });
    expect(r.game).toEqual({ x: 0, y: 11, w: 86, h: 27 });
    expect(r.input).toEqual({ x: 0, y: 38, w: 86, h: 1 });
    // 18 rows: game 5 + input 1 leave 12 for docks and gaps.
    const s = allocate(input(120, 18, m));
    expect(s.game.h).toBe(5);
    expect(s.docks.top!.rect.h).toBe(3);
    expect(s.docks.bottom!.rect.h).toBe(7);
    expect(s.game.y).toBe(4);
    expect(s.input.y).toBe(9);
    expect(s.docks.bottom!.rect.y).toBe(11);
    // The bottom dock gives up rows so the top dock gets its minimum
    // (a lane of 2 counts as 3, ADR 0064).
    const t = allocate(input(120, 18, setLaneSize(setLaneSize(m, 'bottom', 0, 8), 'top', 0, 2)));
    expect(t.docks.top!.rect.h).toBe(3);
    expect(t.docks.bottom!.rect.h).toBe(7);
    // A top dock that cannot get its minimum collapses; the bottom dock stays.
    let tt = setLaneSize(m, 'bottom', 0, 8);
    tt = moveToNewLane(tt, 'group', 'top', 1, 3);
    tt = moveToNewLane(tt, 'timers', 'top', 2, 3);
    const u = allocate(input(120, 18, tt));
    expect(u.collapsed).toEqual(['top']);
    expect(u.hidden).toEqual(expect.arrayContaining(['comm', 'group', 'timers']));
    expect(u.docks.bottom!.rect.h).toBe(8);
    expect(u.game).toEqual({ x: 0, y: 0, w: 86, h: 17 - 9 });
  });

  it('stacks the centre column: top dock, game, input, bottom dock; input as wide as the game', () => {
    let m = movePane(legacyLayout(), 'comm', 'top', 0, 0);
    m = movePane(m, 'ui', 'bottom', 0, 0);
    m = movePane(m, 'group', 'left', 0, 0);
    for (const [cols, rows] of [[120, 50], [100, 30], [70, 18], [200, 80]] as const) {
      const r = allocate(input(cols, rows, m));
      const t = r.docks.top;
      const b = r.docks.bottom;
      expect(r.input.h).toBe(1);
      expect(r.input.x).toBe(r.game.x);
      expect(r.input.w).toBe(r.game.w);
      expect(r.input.y).toBe(r.game.y + r.game.h);
      expect(r.game.h).toBeGreaterThanOrEqual(5);
      expect(r.game.w).toBeGreaterThanOrEqual(GAME_MIN_COLS);
      if (t) expect(t.rect.y + t.rect.h + 1).toBe(r.game.y);
      if (b) {
        expect(r.input.y + 1 + 1).toBe(b.rect.y);
        expect(b.rect.y + b.rect.h).toBe(rows);
      } else {
        expect(r.input.y + 1).toBe(rows);
      }
      for (const side of ['left', 'right'] as const) {
        const d = r.docks[side];
        if (d) expect(d.rect).toMatchObject({ y: 0, h: rows });
      }
    }
  });

  it('never drops the input row, even when every dock is crowded', () => {
    let m = movePane(legacyLayout(), 'comm', 'top', 0, 0);
    m = movePane(m, 'ui', 'bottom', 0, 0);
    m = setLaneSize(setLaneSize(m, 'top', 0, 40), 'bottom', 0, 40);
    const r = allocate(input(60, 18, m));
    expect(r.input).toEqual({ x: 0, y: r.game.y + 5, w: r.game.w, h: 1 });
    expect(r.game.h).toBe(5);
  });

  it('never makes a side dock narrower than 10 cells', () => {
    const r = allocate(input(120, 30, setLaneSize(legacyLayout(), 'right', 0, 3)));
    expect(r.docks.right!.rect.w).toBe(10);
  });

  it('reports the model index of every shown pane', () => {
    const r = allocate(input(120, 50, legacyLayout(), toggles(['timers'])));
    expect(r.panes.map((p) => p.index)).toEqual([0, 2, 3, 4]);
  });

  it('lays floating panes over the game, in z-order, without changing the docks', () => {
    let m = floatPane(legacyLayout(), 'comm', { x: 10, y: 5, w: 30, h: 12 });
    m = floatPane(m, 'group', { x: 20, y: 8, w: 20, h: 6 });
    const r = allocate(input(120, 50, m));
    // The right dock holds the other three; the game pane is unchanged.
    expect(r.game).toEqual({ x: 0, y: 0, w: 86, h: 49 });
    expect(r.docks.right!.panes).toEqual(['character', 'timers', 'ui']);
    const floats = r.panes.filter((p) => p.dock === 'float');
    // Index 0 is the map's default entry (off, ADR 0020).
    expect(floats.map((p) => [p.id, p.index])).toEqual([
      ['comm', 1],
      ['group', 2],
    ]);
    expect(floats[0]!.rect).toEqual({ x: 10, y: 5, w: 30, h: 12 });
    expect(floats[0]!.content).toEqual({ x: 11, y: 6, w: 28, h: 10 });
    expect(r.panes.slice(0, 3).every((p) => p.dock === 'right')).toBe(true);
    // Off: not shown and not hidden-for-space.
    const off = allocate(input(120, 50, m, toggles(['comm'], ['group'])));
    expect(off.panes.filter((p) => p.dock === 'float').map((p) => p.id)).toEqual(['group']);
    expect(off.panes.find((p) => p.id === 'group')!.content).toEqual({ x: 20, y: 8, w: 20, h: 6 });
    expect(off.hidden).toEqual([]);
  });

  it('clamps floating panes into the whole window, shrinking them if needed', () => {
    const m = floatPane(legacyLayout(), 'comm', { x: 100, y: 45, w: 40, h: 30 });
    const r = allocate(input(120, 50, m));
    expect(r.panes.find((p) => p.id === 'comm')!.rect).toEqual({ x: 80, y: 20, w: 40, h: 30 });
    const small = allocate(input(60, 18, m));
    expect(small.panes.find((p) => p.id === 'comm')!.rect).toEqual({ x: 20, y: 0, w: 40, h: 18 });
    // It may lie over the input row.
    const low = allocate(input(120, 50, floatPane(legacyLayout(), 'comm', { x: 0, y: 45, w: 36, h: 14 })));
    expect(low.panes.find((p) => p.id === 'comm')!.rect).toEqual({ x: 0, y: 36, w: 36, h: 14 });
    // The model is untouched.
    expect(m.floating.find((f) => f.id === 'comm')).toEqual({ id: 'comm', x: 100, y: 45, w: 40, h: 30 });
    expect(allocate(input(59, 18, m)).tooSmall).toBe(true);
    expect(allocate(input(59, 18, m)).hidden).toContain('comm');
  });

  it('places the map at its default spot until it is moved (ADR 0020)', () => {
    const r = allocate(input(200, 60, legacyLayout(), toggles([], [], true)));
    const map = r.panes.find((p) => p.id === 'map')!;
    expect(map.dock).toBe('float');
    // Top-right corner of the game pane, 21 % × 27 % of the window (ADR 0078).
    expect(r.game).toEqual({ x: 0, y: 0, w: 166, h: 59 });
    expect(map.rect).toEqual({ x: 124, y: 0, w: 42, h: 16 });
    // A narrow window: shifted inside, never off screen.
    const narrow = allocate(input(70, 20, legacyLayout(), toggles([], [], true)));
    const n = narrow.panes.find((p) => p.id === 'map')!.rect;
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.x + n.w).toBeLessThanOrEqual(70);
    // Moved or resized: a stored rectangle without `auto`.
    const moved = setFloatRect(legacyLayout(), 'map', { x: 3, y: 4, w: 50, h: 20 });
    expect(moved.floating[0]).toEqual({ id: 'map', x: 3, y: 4, w: 50, h: 20 });
    const again = allocate(input(200, 60, moved, toggles([], [], true)));
    expect(again.panes.find((p) => p.id === 'map')!.rect).toEqual({ x: 3, y: 4, w: 50, h: 20 });
  });

  it('keeps a floating pane at least the frame plus its minimum content', () => {
    expect(floatMin('character', true)).toEqual({ w: 10, h: 5 });
    expect(floatMin('comm', false)).toEqual({ w: 8, h: 1 });
    expect(clampFloat({ x: 5, y: 5, w: 2, h: 2 }, floatMin('character', true), 100, 40)).toEqual({ x: 5, y: 5, w: 10, h: 5 });
  });
});

describe('allocate: dock lanes (ADR 0064)', () => {
  /** Right dock: lane 0 (outer) = character, timers, comm, ui; lane 1 (inner, 20 wide) = group. */
  const rightTwo = (): LayoutModel => moveToNewLane(legacyLayout(), 'group', 'right', 1, 20);

  it('puts two lanes of the right dock side by side, lane 0 at the screen edge', () => {
    const r = allocate(input(120, 50, rightTwo()));
    const d = r.docks.right!;
    expect(d.rect).toEqual({ x: 67, y: 0, w: 53, h: 50 });
    expect(d.lanes.map((l) => [l.index, l.rect])).toEqual([
      [0, { x: 87, y: 0, w: 33, h: 50 }],
      [1, { x: 67, y: 0, w: 20, h: 50 }],
    ]);
    expect(d.panes).toEqual(['character', 'timers', 'comm', 'ui', 'group']);
    expect(r.game).toEqual({ x: 0, y: 0, w: 66, h: 49 });
    const group = r.panes.find((p) => p.id === 'group')!;
    expect(group).toMatchObject({ dock: 'right', lane: 1, index: 0, rect: { x: 67, y: 0, w: 20, h: 50 } });
    // Each lane is split along its length on its own: lane 0 fills the height.
    const lane0 = r.panes.filter((p) => p.lane === 0);
    expect(lane0.reduce((n, p) => n + p.rect.h, 0)).toBe(50);
    expect(r.panes.map((p) => p.id)).toEqual(['character', 'timers', 'comm', 'ui', 'group']);
  });

  it('puts two lanes of the left dock side by side, lane 0 at the left edge', () => {
    let m = movePane(legacyLayout(), 'comm', 'left', 0, 0);
    m = moveToNewLane(m, 'ui', 'left', 1, 15);
    const r = allocate(input(140, 50, m));
    const d = r.docks.left!;
    expect(d.rect).toEqual({ x: 0, y: 0, w: 48, h: 50 });
    expect(d.lanes.map((l) => l.rect)).toEqual([
      { x: 0, y: 0, w: 33, h: 50 },
      { x: 33, y: 0, w: 15, h: 50 },
    ]);
    expect(r.game.x).toBe(49);
    expect(r.panes.find((p) => p.id === 'ui')).toMatchObject({ dock: 'left', lane: 1, rect: { x: 33, y: 0, w: 15, h: 50 } });
  });

  it('stacks lanes of the top and bottom docks as rows, lane 0 at the screen edge', () => {
    let m = moveToNewLane(legacyLayout(), 'comm', 'top', 0, 6);
    m = moveToNewLane(m, 'ui', 'top', 1, 4);
    m = moveToNewLane(m, 'group', 'bottom', 0, 5);
    m = moveToNewLane(m, 'timers', 'bottom', 1, 3);
    const r = allocate(input(120, 50, m));
    expect(r.docks.top!.rect).toEqual({ x: 0, y: 0, w: 86, h: 10 });
    expect(r.docks.top!.lanes.map((l) => l.rect)).toEqual([
      { x: 0, y: 0, w: 86, h: 6 },
      { x: 0, y: 6, w: 86, h: 4 },
    ]);
    expect(r.docks.bottom!.rect).toEqual({ x: 0, y: 42, w: 86, h: 8 });
    expect(r.docks.bottom!.lanes.map((l) => l.rect)).toEqual([
      { x: 0, y: 45, w: 86, h: 5 },
      { x: 0, y: 42, w: 86, h: 3 },
    ]);
    expect(r.game).toEqual({ x: 0, y: 11, w: 86, h: 41 - 11 - 1 });
    expect(r.panes.find((p) => p.id === 'timers')).toMatchObject({ dock: 'bottom', lane: 1, rect: { x: 0, y: 42, w: 86, h: 3 } });
    // Dock by dock (left, right, top, bottom), lane by lane.
    expect(r.panes.map((p) => p.id)).toEqual(['character', 'comm', 'ui', 'group', 'timers']);
  });

  it('gives no space to a lane whose panes are all hidden', () => {
    const r = allocate(input(120, 50, rightTwo(), toggles(['group'])));
    expect(r.docks.right!.rect).toEqual({ x: 87, y: 0, w: 33, h: 50 });
    expect(r.docks.right!.lanes.map((l) => l.index)).toEqual([0]);
    expect(r.game.w).toBe(86);
    // The outer lane hidden: the inner one moves to the screen edge.
    const o = allocate(input(120, 50, rightTwo(), toggles(['character', 'timers', 'comm', 'ui'])));
    expect(o.docks.right!.lanes.map((l) => [l.index, l.rect])).toEqual([[1, { x: 100, y: 0, w: 20, h: 50 }]]);
    expect(o.panes.map((p) => [p.id, p.lane])).toEqual([['group', 1]]);
  });

  it('counts a lane below the side dock minimum as the minimum', () => {
    const m = setLaneSize(rightTwo(), 'right', 1, 4);
    expect(allocate(input(120, 50, m)).docks.right!.rect.w).toBe(43);
  });

  it('collapses a side dock with all its lanes when the game pane gets too narrow', () => {
    // 53 + 1 + 30 = 84 columns needed.
    expect(allocate(input(84, 30, rightTwo())).docks.right!.lanes).toHaveLength(2);
    const narrow = allocate(input(83, 30, rightTwo()));
    expect(narrow.docks.right).toBeUndefined();
    expect(narrow.collapsed).toEqual(['right']);
    expect(narrow.hidden).toEqual(['character', 'timers', 'comm', 'ui', 'group']);
    expect(narrow.game.w).toBe(83);
  });

  it('shrinks the inner lanes of the top/bottom dock first, down to their minimum', () => {
    let m = moveToNewLane(legacyLayout(), 'comm', 'bottom', 0, 6);
    m = moveToNewLane(m, 'ui', 'bottom', 1, 6);
    // 20 rows: game 5 + input 1 + gap 1 leave 13 of the wanted 12: fits.
    expect(allocate(input(120, 20, m)).docks.bottom!.lanes.map((l) => l.rect.h)).toEqual([6, 6]);
    // 18 rows leave 11: the inner lane gives up one row.
    const r = allocate(input(120, 18, m));
    expect(r.docks.bottom!.rect).toEqual({ x: 0, y: 7, w: 86, h: 11 });
    expect(r.docks.bottom!.lanes.map((l) => [l.index, l.rect.h])).toEqual([[0, 6], [1, 5]]);
    // Down to the minimum: the inner lane stops at 3, the outer gives up the rest.
    const big = setLaneSize(setLaneSize(m, 'bottom', 0, 6), 'bottom', 1, 4);
    const t = allocate(input(120, 18, moveToNewLane(big, 'group', 'top', 0, 5)));
    expect(t.docks.top!.rect.h).toBe(3);
    expect(t.docks.bottom!.lanes.map((l) => l.rect.h)).toEqual([4, 3]);
    expect(t.game.h).toBe(5);
  });
});

describe('allocate: per-lane minimum (ADR 0065)', () => {
  const BAR = 'panebar/bar' as PaneId;
  /** Built-in toggles plus the bar, present, borderless unless `framed`. */
  const withBar = (framed = false): Pick<AllocateInput, 'panes' | 'present'> => ({
    panes: { ...toggles(), [BAR]: { on: true, border: framed } },
    present: new Set<PaneId>([BAR]),
  });
  const barLayout = (size = 1): LayoutModel =>
    placeScriptPane(legacyLayout(), BAR, { dock: 'bottom', rows: size, cols: 80, border: false, lane: 'own' });

  it('a borderless script pane alone in a bottom lane is one row, the input line right above the gap', () => {
    const r = allocate({ ...input(120, 40, barLayout()), ...withBar() });
    expect(r.docks.bottom!.lanes.map((l) => [l.index, l.rect.h, l.min])).toEqual([[0, 1, 1]]);
    expect(r.docks.bottom!.rect).toEqual({ x: 0, y: 39, w: 86, h: 1 });
    expect(r.panes.find((p) => p.id === BAR)).toMatchObject({ rect: { x: 0, y: 39, w: 86, h: 1 }, content: { h: 1 }, framed: false });
    expect(r.input.y).toBe(37);
  });

  it('a framed script pane lane is at least 3; a lane with a built-in keeps the dock minimum', () => {
    expect(allocate({ ...input(120, 40, barLayout()), ...withBar(true) }).docks.bottom!.lanes[0]!.rect.h).toBe(3);
    // Comm joins the bar's lane: the lane is at least 3 rows again.
    const m = movePane(barLayout(), 'comm', 'bottom', 0, 1);
    const r = allocate({ ...input(120, 40, m), ...withBar() });
    expect(r.docks.bottom!.lanes[0]!.min).toBe(3);
    expect(r.docks.bottom!.lanes[0]!.rect.h).toBe(3);
  });

  it('a dock with a bar lane collapses only below the sum of the lane minimums', () => {
    // Bar (1) + a 3-row lane of Comm: 18 rows leave 11 for the docks.
    let m = moveToNewLane(barLayout(), 'comm', 'bottom', 1, 10);
    const r = allocate({ ...input(120, 18, m), ...withBar() });
    expect(r.docks.bottom!.lanes.map((l) => [l.index, l.rect.h])).toEqual([[0, 1], [1, 10]]);
    m = setLaneSize(m, 'bottom', 1, 20);
    const t = allocate({ ...input(120, 18, m), ...withBar() });
    expect(t.docks.bottom!.lanes.map((l) => [l.index, l.rect.h])).toEqual([[0, 1], [1, 10]]);
    expect(t.collapsed).toEqual([]);
  });

  it('shrinkLanes takes each lane down to its own minimum, inner lanes first', () => {
    expect(shrinkLanes([1, 10, 6], 9, [1, 3, 3])).toEqual([1, 5, 3]);
    expect(shrinkLanes([1, 10], 4, [1, 3])).toEqual([1, 3]);
  });

  it('paneCrossMin: side docks SIDE_DOCK_MIN; built-ins 3; script panes 1 + frame', () => {
    expect(paneCrossMin(BAR, 'right', false)).toBe(SIDE_DOCK_MIN);
    expect(paneCrossMin('comm', 'bottom', false)).toBe(3);
    expect(paneCrossMin('comm', 'top', true)).toBe(3);
    expect(paneCrossMin(BAR, 'top', false)).toBe(1);
    expect(paneCrossMin(BAR, 'bottom', true)).toBe(3);
  });

  it('built-in layouts allocate as before', () => {
    const r = allocate(input(120, 40));
    expect(r.docks.right!.lanes.map((l) => l.min)).toEqual([SIDE_DOCK_MIN]);
    const m = moveToNewLane(legacyLayout(), 'comm', 'bottom', 0, 2);
    expect(allocate(input(120, 40, m)).docks.bottom!.lanes[0]!.rect.h).toBe(3);
  });
});

describe('allocate: spanning panes (ADR 0067)', () => {
  const box = (r: ReturnType<typeof allocate>, id: PaneId) => r.panes.find((p) => p.id === id);
  const rect = (r: ReturnType<typeof allocate>, id: PaneId) => box(r, id)?.rect;
  /** Right dock: lane 0 (33) = character 9, timers 8, comm 10, ui 5; lane 1 (20) = group 6. */
  const twoRight = (): LayoutModel => {
    let m = setDesired(legacyLayout(), { character: 9, timers: 8, comm: 10, ui: 5, group: 6 });
    m = moveToNewLane(m, 'group', 'right', 1, 20);
    return m;
  };
  /** The same as allocate's result, without what tells spans apart (for equivalence checks). */
  const plain = (r: ReturnType<typeof allocate>) => ({
    game: r.game,
    input: r.input,
    panes: r.panes.map((p) => [p.id, p.rect]),
    lanes: Object.values(r.docks).map((d) => d.lanes.map((l) => l.rect)),
  });

  it('a layout without a shown span pane allocates exactly as without spans', () => {
    const base = twoRight();
    const withSpan = movePane(base, 'map', 'right', 'head', 0);
    // The map is off: the span takes no part.
    for (const [c, rw] of [[200, 70], [120, 40], [60, 18]] as const) {
      const a = allocate(input(c, rw, base));
      const b = allocate(input(c, rw, withSpan));
      expect(plain(b)).toEqual(plain(a));
      expect(b.docks.right?.spans ?? []).toEqual([]);
    }
    // Default layout: the region is the whole dock.
    const d = allocate(input(120, 40));
    expect(d.docks.right!.region).toEqual(d.docks.right!.rect);
    expect(d.docks.right!.spans).toEqual([]);
  });

  it('right dock: a head span across both columns, the columns below it', () => {
    const m = movePane(twoRight(), 'map', 'right', 'head', 0);
    const r = allocate(input(200, 70, m, toggles([], [], true)));
    const dock = r.docks.right!;
    expect(dock.rect).toEqual({ x: 147, y: 0, w: 53, h: 70 });
    // Region desired 40 (lane 0), map 22: the 8 left over go to the map (it ranks above the region's best, UI).
    expect(rect(r, 'map')).toEqual({ x: 147, y: 0, w: 53, h: 30 });
    expect(dock.spans).toEqual([{ side: 'head', rect: { x: 147, y: 0, w: 53, h: 30 }, panes: ['map'], mode: 'fit' }]);
    expect(dock.region).toEqual({ x: 147, y: 30, w: 53, h: 40 });
    expect(dock.lanes.map((l) => l.rect)).toEqual([
      { x: 167, y: 30, w: 33, h: 40 },
      { x: 147, y: 30, w: 20, h: 40 },
    ]);
    expect(rect(r, 'character')).toEqual({ x: 167, y: 30, w: 33, h: 11 });
    expect(rect(r, 'group')!.y).toBe(30);
    expect(box(r, 'map')).toMatchObject({ dock: 'right', lane: 'head', index: 0, framed: true });
    expect(dock.panes).toEqual(['map', 'character', 'timers', 'comm', 'ui', 'group']);
    expect(r.panes.slice(0, 2).map((p) => p.id)).toEqual(['map', 'character']);
  });

  it('a tail span below the columns, and the region gets the leftover when it holds the map', () => {
    let m = movePane(twoRight(), 'map', 'right', 1, 0);
    m = movePane(m, 'ui', 'right', 'tail', 0);
    const r = allocate(input(200, 70, m, toggles([], [], true)));
    const dock = r.docks.right!;
    // ui: 5 + 2 at the bottom; the region (map in lane 1) takes the rest.
    expect(rect(r, 'ui')).toEqual({ x: 147, y: 63, w: 53, h: 7 });
    expect(dock.region).toEqual({ x: 147, y: 0, w: 53, h: 63 });
    expect(dock.spans.map((s) => s.side)).toEqual(['tail']);
    // In lane 1 the map takes the region's leftover.
    expect(rect(r, 'map')).toEqual({ x: 147, y: 0, w: 20, h: 63 - 8 });
    expect(box(r, 'ui')).toMatchObject({ lane: 'tail', index: 0 });
  });

  it('left dock: spans above and below the columns; top dock: left and right of the rows', () => {
    let m = movePane(twoRight(), 'group', 'left', 0, 0);
    m = movePane(m, 'timers', 'left', 0, 0);
    m = moveToNewLane(m, 'comm', 'left', 1, 15);
    m = movePane(m, 'timers', 'left', 'head', 0);
    m = movePane(m, 'ui', 'left', 'tail', 0);
    const r = allocate(input(200, 60, m));
    const left = r.docks.left!;
    expect(left.rect).toEqual({ x: 0, y: 0, w: 48, h: 60 });
    expect(rect(r, 'timers')).toMatchObject({ x: 0, y: 0, w: 48 });
    expect(rect(r, 'ui')).toMatchObject({ x: 0, w: 48 });
    expect(rect(r, 'ui')!.y + rect(r, 'ui')!.h).toBe(60);
    expect(left.lanes.map((l) => [l.rect.x, l.rect.w])).toEqual([[0, 33], [33, 15]]);
    expect(left.region!.y).toBe(rect(r, 'timers')!.h);

    let t = moveToNewLane(legacyLayout(), 'comm', 'top', 0, 10);
    t = moveToNewLane(t, 'ui', 'top', 1, 6);
    t = movePane(t, 'group', 'top', 'tail', 0);
    const rt = allocate(input(200, 60, t));
    const top = rt.docks.top!;
    expect(top.rect.h).toBe(16);
    // The tail span is at the right end, the full dock height.
    expect(rect(rt, 'group')).toMatchObject({ y: 0, h: 16 });
    expect(rect(rt, 'group')!.x + rect(rt, 'group')!.w).toBe(top.rect.x + top.rect.w);
    expect(top.lanes.map((l) => [l.rect.y, l.rect.h])).toEqual([[0, 10], [10, 6]]);
    expect(top.region).toMatchObject({ x: top.rect.x, y: 0, h: 16 });
  });

  it('bottom dock: a head span at the left end covers both rows', () => {
    let m = moveToNewLane(legacyLayout(), 'comm', 'bottom', 0, 10);
    m = moveToNewLane(m, 'ui', 'bottom', 1, 10);
    m = movePane(m, 'group', 'bottom', 'head', 0);
    const r = allocate(input(200, 60, m));
    const b = r.docks.bottom!;
    expect(b.rect).toEqual({ x: 0, y: 40, w: 166, h: 20 });
    const g = rect(r, 'group')!;
    expect(g).toMatchObject({ x: 0, y: 40, h: 20 });
    // The region's best pane (UI) ranks above Group: the region takes the leftover.
    expect(g.w).toBe(32);
    expect(b.region).toEqual({ x: 32, y: 40, w: 134, h: 20 });
    expect(b.lanes.map((l) => l.rect)).toEqual([
      { x: 32, y: 50, w: 134, h: 10 },
      { x: 32, y: 40, w: 134, h: 10 },
    ]);
  });

  it('drops from the spans and the binding lane only when the minimums do not fit', () => {
    const S = 's/p' as PaneId;
    const A = 'a/x' as PaneId;
    // Head: timers, ui (6); lane 0: character, comm, group, a/x (14, binding); lane 1: s/p (3).
    let m = legacyLayout();
    m = placeScriptPane(m, A, { dock: 'right', rows: 1, cols: 10 });
    m = placeScriptPane(m, S, { dock: 'right', rows: 1, cols: 10 });
    m = moveToNewLane(m, S, 'right', 1, 15);
    m = movePane(m, 'timers', 'right', 'head', 0);
    m = movePane(m, 'ui', 'right', 'head', 1);
    m = setDesired(m, { character: 3, comm: 1, group: 1, timers: 1, ui: 1, [A]: 1, [S]: 1 });
    const r = allocate({ ...input(100, 18, m), present: new Set([S, A]) });
    // Plain DROP_ORDER would drop s/p (the last script pane); it is in a lane that frees nothing.
    expect(r.hidden).toEqual([A]);
    expect(box(r, S)).toBeDefined();
    // The map in a span is dropped first.
    const mm = movePane(twoRight(), 'map', 'right', 'head', 0);
    const rm = allocate(input(100, 18, mm, toggles([], [], true)));
    expect(rm.hidden).toEqual(['map']);
    expect(rm.docks.right!.spans).toEqual([]);
    expect(rm.docks.right!.region).toEqual({ x: 47, y: 0, w: 53, h: 18 });
  });

  it('a span pane that is off or absent takes no part; spans without a shown lane fill the dock', () => {
    const S = 's/p' as PaneId;
    let m = placeScriptPane(twoRight(), S, { dock: 'right', rows: 4, cols: 10 });
    m = movePane(m, S, 'right', 'tail', 0);
    // Not present: no span.
    expect(allocate(input(200, 70, m)).docks.right!.spans).toEqual([]);
    const shown = allocate({ ...input(200, 70, m), present: new Set([S]) });
    expect(shown.docks.right!.spans.map((s) => s.panes)).toEqual([[S]]);
    // Every lane pane off: the span alone, as wide as the stored lanes.
    const off = toggles(['character', 'timers', 'group', 'comm', 'ui']);
    const alone = allocate({ ...input(200, 70, m, off), present: new Set([S]) });
    expect(alone.docks.right!.rect).toEqual({ x: 147, y: 0, w: 53, h: 70 });
    expect(alone.docks.right!.region).toBeNull();
    expect(alone.docks.right!.lanes).toEqual([]);
    expect(rect(alone, S)).toEqual({ x: 147, y: 0, w: 53, h: 70 });
  });

  it('collapses and shrinks a dock with spans as a whole', () => {
    // Narrow: the right dock with its span collapses, the span pane is hidden.
    const m = movePane(twoRight(), 'map', 'right', 'head', 0);
    const narrow = allocate(input(80, 40, m, toggles([], [], true)));
    expect(narrow.collapsed).toEqual(['right']);
    expect(narrow.hidden).toContain('map');
    // Bottom dock with a span: the inner lane gives up rows first; the span covers the dock.
    let b = moveToNewLane(legacyLayout(), 'comm', 'bottom', 0, 10);
    b = moveToNewLane(b, 'ui', 'bottom', 1, 10);
    b = movePane(b, 'group', 'bottom', 'head', 0);
    const r = allocate(input(200, 25, b));
    expect(r.docks.bottom!.rect.h).toBe(18);
    expect(r.docks.bottom!.lanes.map((l) => l.rect.h)).toEqual([10, 8]);
    expect(rect(r, 'group')!.h).toBe(18);
  });

  it('a span wider than the lanes widens the innermost lane', () => {
    const B1 = 'bar/a' as PaneId;
    const B2 = 'bar/b' as PaneId;
    let m = placeScriptPane(legacyLayout(), B1, { dock: 'bottom', rows: 1, cols: 20, border: false, lane: 'own' });
    m = placeScriptPane(m, B2, { dock: 'bottom', rows: 1, cols: 20, border: false, lane: 'own' });
    m = movePane(m, 'comm', 'bottom', 'head', 0);
    const panes = { ...toggles(), [B1]: { on: true, border: false }, [B2]: { on: true, border: false } };
    const r = allocate({ ...input(200, 60, m, panes), present: new Set([B1, B2]) });
    const d = r.docks.bottom!;
    expect(d.rect.h).toBe(3);
    expect(d.lanes.map((l) => l.rect.h)).toEqual([1, 2]);
    expect(rect(r, 'comm')!.h).toBe(3);
  });
});

