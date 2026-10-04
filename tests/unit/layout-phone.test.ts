import { describe, expect, it } from 'vitest';
import type { AllocateInput } from '../../src/layout/allocate';
import { GAME_TAB, PHONE_MIN_COLS, PHONE_MIN_ROWS, allocatePhone, type PhoneTab } from '../../src/layout/phone';
import { placeScriptPane } from '../../src/layout/model';
import { PANE_IDS, type LayoutModel, type PaneId, defaultLayout } from '../../src/layout/types';

function toggles(off: PaneId[] = [], noBorder: PaneId[] = [], mapOn = false): AllocateInput['panes'] {
  return Object.fromEntries(
    PANE_IDS.map((id) => [id, { on: (id !== 'map' || mapOn) && !off.includes(id), border: !noBorder.includes(id) }]),
  ) as AllocateInput['panes'];
}

const run = (
  cols: number,
  rows: number,
  tab: PhoneTab = GAME_TAB,
  o: { layout?: LayoutModel; panes?: AllocateInput['panes']; present?: Set<PaneId>; guard?: boolean } = {},
) =>
  allocatePhone({
    layout: o.layout ?? defaultLayout(),
    panes: o.panes ?? toggles(),
    present: o.present,
    cols,
    rows,
    tab,
    guard: o.guard,
  });

describe('allocatePhone', () => {
  it('lays out a portrait phone: strip, full-width game view, input at the bottom', () => {
    const r = run(43, 40);
    expect(r.tooSmall).toBe(false);
    expect(r.strip).toEqual({ x: 0, y: 0, w: 43, h: 1 });
    expect(r.game).toEqual({ x: 0, y: 1, w: 43, h: 38 });
    expect(r.view).toEqual(r.game);
    expect(r.input).toEqual({ x: 0, y: 39, w: 43, h: 1 });
    expect(r.panes).toEqual([]);
    expect(r.docks).toEqual({});
    expect(r.collapsed).toEqual([]);
  });

  it('lists GAME, then the panes switched on, in the layout order', () => {
    expect(run(43, 40).tabs).toEqual([GAME_TAB, 'character', 'timers', 'group', 'comm', 'ui']);
    expect(run(43, 40, GAME_TAB, { panes: toggles(['timers'], [], true) }).tabs).toEqual([
      GAME_TAB, 'character', 'group', 'comm', 'ui', 'map',
    ]);
  });

  it('includes a present script pane and leaves out an absent one', () => {
    const layout = placeScriptPane(defaultLayout(), 'demo/bar', { dock: 'right', rows: 4, cols: 20 });
    expect(run(43, 40, GAME_TAB, { layout }).tabs).not.toContain('demo/bar');
    const r = run(43, 40, 'demo/bar', { layout, present: new Set<PaneId>(['demo/bar']) });
    expect(r.tabs).toContain('demo/bar');
    expect(r.tab).toBe('demo/bar');
    expect(r.panes.map((p) => p.id)).toEqual(['demo/bar']);
  });

  it('shows a selected pane full width in the view; the game keeps the view rectangle', () => {
    const r = run(43, 40, 'comm');
    expect(r.tab).toBe('comm');
    expect(r.game).toEqual({ x: 0, y: 1, w: 43, h: 38 });
    expect(r.panes).toHaveLength(1);
    const p = r.panes[0]!;
    expect(p.id).toBe('comm');
    expect(p.dock).toBe('right');
    expect(p.rect).toEqual({ x: 0, y: 1, w: 43, h: 38 });
    expect(p.content).toEqual({ x: 1, y: 2, w: 41, h: 36 });
    expect(p.framed).toBe(true);
    expect(r.hidden.sort()).toEqual(['character', 'group', 'timers', 'ui']);
  });

  it('gives a borderless pane the whole view as content', () => {
    const p = run(43, 40, 'comm', { panes: toggles([], ['comm']) }).panes[0]!;
    expect(p.framed).toBe(false);
    expect(p.content).toEqual(p.rect);
  });

  it('falls back to GAME when the selected pane is off', () => {
    const r = run(43, 40, 'comm', { panes: toggles(['comm']) });
    expect(r.tab).toBe(GAME_TAB);
    expect(r.panes).toEqual([]);
  });

  it('a floating pane (the map) becomes a tab and shows in the view', () => {
    const r = run(93, 20, 'map', { panes: toggles([], [], true) });
    expect(r.panes[0]).toMatchObject({ id: 'map', dock: 'float', rect: { x: 0, y: 1, w: 93, h: 18 } });
  });

  it('is too small below 30 × 8 cells, and only then', () => {
    expect(run(PHONE_MIN_COLS, PHONE_MIN_ROWS).tooSmall).toBe(false);
    expect(run(PHONE_MIN_COLS - 1, 40).tooSmall).toBe(true);
    const r = run(43, PHONE_MIN_ROWS - 1, 'comm');
    expect(r.tooSmall).toBe(true);
    expect(r.panes).toEqual([]);
    expect(r.hidden).toContain('comm');
  });

  it('skips the guard while the keyboard is up; the strip goes first when very short', () => {
    const r = run(93, 5, GAME_TAB, { guard: false });
    expect(r.tooSmall).toBe(false);
    expect(r.game).toEqual({ x: 0, y: 1, w: 93, h: 3 });
    expect(r.input).toEqual({ x: 0, y: 4, w: 93, h: 1 });
    const s = run(93, 2, GAME_TAB, { guard: false });
    expect(s.strip.h).toBe(0);
    expect(s.game).toEqual({ x: 0, y: 0, w: 93, h: 1 });
    expect(s.input).toEqual({ x: 0, y: 1, w: 93, h: 1 });
  });

  it('does not touch the layout model', () => {
    const layout = defaultLayout();
    const before = JSON.stringify(layout);
    run(43, 40, 'comm', { layout });
    expect(JSON.stringify(layout)).toBe(before);
  });
});
