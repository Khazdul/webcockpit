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
} from '../../src/layout/allocate';
import { type BuiltinPaneId, DOCKED_BY_DEFAULT, type LayoutModel, PANE_IDS, type PaneId, defaultLayout } from '../../src/layout/types';
import { floatPane, movePane, setDockSize, setFloatRect } from '../../src/layout/model';

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

const input = (cols: number, rows: number, layout: LayoutModel = defaultLayout(), panes = toggles()): AllocateInput => ({
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
    const r = allocate(input(120, 50, defaultLayout(), toggles([], ['timers'])));
    const t = r.panes.find((p) => p.id === 'timers')!;
    expect(t.framed).toBe(false);
    expect(t.content).toEqual(t.rect);
  });

  it('leaves out panes that are off and hides a dock with no pane on', () => {
    const r = allocate(input(120, 50, defaultLayout(), toggles(['group', 'comm'])));
    expect(r.panes.map((p) => p.id)).toEqual(['character', 'timers', 'ui']);
    const all = allocate(input(120, 50, defaultLayout(), toggles([...PANE_IDS])));
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
    let m = movePane(defaultLayout(), 'comm', 'left', 0);
    m = setDockSize(m, 'left', 20);
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
    let m = setDockSize(defaultLayout(), 'right', 50);
    m = movePane(m, 'ui', 'left', 0);
    m = setDockSize(m, 'left', 12);
    const r = allocate(input(70, 30, m));
    expect(r.collapsed).toEqual(['right']);
    expect(r.docks.left!.rect.w).toBe(12);
  });

  it('lays out the bottom dock under the input line, side by side', () => {
    let m = movePane(defaultLayout(), 'comm', 'bottom', 0);
    m = movePane(m, 'ui', 'bottom', 1);
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
    const m = movePane(defaultLayout(), 'comm', 'bottom', 0);
    const r = allocate(input(120, 18, setDockSize(m, 'bottom', 20)));
    // 18 rows: game 5 + input 1 + gap 1 leave 11 for the bottom dock.
    expect(r.game.h).toBe(5);
    expect(r.input).toEqual({ x: 0, y: 5, w: 86, h: 1 });
    expect(r.docks.bottom!.rect).toEqual({ x: 0, y: 7, w: 86, h: 11 });
    const small = allocate(input(120, 18, setDockSize(m, 'bottom', 2)));
    expect(small.collapsed).toEqual(['bottom']);
    expect(small.hidden).toContain('comm');
  });

  it('lays out the top dock above the game pane, side by side, between the side docks', () => {
    let m = movePane(defaultLayout(), 'comm', 'top', 0);
    m = movePane(m, 'group', 'left', 0);
    m = setDockSize(m, 'left', 20);
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
    let m = movePane(defaultLayout(), 'comm', 'top', 0);
    m = movePane(m, 'ui', 'bottom', 0);
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
    // A top dock that cannot get its minimum collapses; the bottom dock stays.
    const t = allocate(input(120, 18, setDockSize(setDockSize(m, 'bottom', 8), 'top', 2)));
    expect(t.collapsed).toEqual(['top']);
    expect(t.hidden).toContain('comm');
    expect(t.docks.bottom!.rect.h).toBe(8);
    expect(t.game).toEqual({ x: 0, y: 0, w: 86, h: 17 - 9 });
  });

  it('stacks the centre column: top dock, game, input, bottom dock; input as wide as the game', () => {
    let m = movePane(defaultLayout(), 'comm', 'top', 0);
    m = movePane(m, 'ui', 'bottom', 0);
    m = movePane(m, 'group', 'left', 0);
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
    let m = movePane(defaultLayout(), 'comm', 'top', 0);
    m = movePane(m, 'ui', 'bottom', 0);
    m = setDockSize(setDockSize(m, 'top', 40), 'bottom', 40);
    const r = allocate(input(60, 18, m));
    expect(r.input).toEqual({ x: 0, y: r.game.y + 5, w: r.game.w, h: 1 });
    expect(r.game.h).toBe(5);
  });

  it('never makes a side dock narrower than 10 cells', () => {
    const r = allocate(input(120, 30, setDockSize(defaultLayout(), 'right', 3)));
    expect(r.docks.right!.rect.w).toBe(10);
  });

  it('reports the model index of every shown pane', () => {
    const r = allocate(input(120, 50, defaultLayout(), toggles(['timers'])));
    expect(r.panes.map((p) => p.index)).toEqual([0, 2, 3, 4]);
  });

  it('lays floating panes over the game, in z-order, without changing the docks', () => {
    let m = floatPane(defaultLayout(), 'comm', { x: 10, y: 5, w: 30, h: 12 });
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
    const m = floatPane(defaultLayout(), 'comm', { x: 100, y: 45, w: 40, h: 30 });
    const r = allocate(input(120, 50, m));
    expect(r.panes.find((p) => p.id === 'comm')!.rect).toEqual({ x: 80, y: 20, w: 40, h: 30 });
    const small = allocate(input(60, 18, m));
    expect(small.panes.find((p) => p.id === 'comm')!.rect).toEqual({ x: 20, y: 0, w: 40, h: 18 });
    // It may lie over the input row.
    const low = allocate(input(120, 50, floatPane(defaultLayout(), 'comm', { x: 0, y: 45, w: 36, h: 14 })));
    expect(low.panes.find((p) => p.id === 'comm')!.rect).toEqual({ x: 0, y: 36, w: 36, h: 14 });
    // The model is untouched.
    expect(m.floating.find((f) => f.id === 'comm')).toEqual({ id: 'comm', x: 100, y: 45, w: 40, h: 30 });
    expect(allocate(input(59, 18, m)).tooSmall).toBe(true);
    expect(allocate(input(59, 18, m)).hidden).toContain('comm');
  });

  it('places the map at its default spot until it is moved (ADR 0020)', () => {
    const r = allocate(input(200, 60, defaultLayout(), toggles([], [], true)));
    const map = r.panes.find((p) => p.id === 'map')!;
    expect(map.dock).toBe('float');
    // Top-right corner of the game pane, 25 % × 27 % of the window.
    expect(r.game).toEqual({ x: 0, y: 0, w: 166, h: 59 });
    expect(map.rect).toEqual({ x: 116, y: 0, w: 50, h: 16 });
    // A narrow window: shifted inside, never off screen.
    const narrow = allocate(input(70, 20, defaultLayout(), toggles([], [], true)));
    const n = narrow.panes.find((p) => p.id === 'map')!.rect;
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.x + n.w).toBeLessThanOrEqual(70);
    // Moved or resized: a stored rectangle without `auto`.
    const moved = setFloatRect(defaultLayout(), 'map', { x: 3, y: 4, w: 50, h: 20 });
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
