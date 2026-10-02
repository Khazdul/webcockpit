import { describe, expect, it } from 'vitest';
import { DEFAULT_BOTTOM_DESIRED } from '../../src/layout/allocate';
import {
  findFloat,
  findPane,
  floatPane,
  isNoopMove,
  movePane,
  raisePane,
  resizeRect,
  setDesired,
  setDockSize,
  setFloatRect,
  shiftBoundary,
  togglePatch,
} from '../../src/layout/model';
import { type DockId, type LayoutModel, PANE_IDS, defaultLayout, defaultMapFloat } from '../../src/layout/types';
import { defaultSettings } from '../../src/settings/types';

const order = (m: LayoutModel, d: DockId) => m.docks[d].panes.map((p) => p.id);
/** The map's default floating entry (ADR 0020). */
const MAP = defaultMapFloat();

function everyPaneOnce(m: LayoutModel): void {
  const ids = [
    ...order(m, 'left'),
    ...order(m, 'right'),
    ...order(m, 'top'),
    ...order(m, 'bottom'),
    ...m.floating.map((f) => f.id),
  ];
  expect(ids.sort()).toEqual([...PANE_IDS].sort());
}

describe('movePane', () => {
  it('reorders within a dock (index = insertion point in the current list)', () => {
    const m = defaultLayout();
    expect(order(movePane(m, 'ui', 'right', 0), 'right')).toEqual(['ui', 'character', 'timers', 'group', 'comm']);
    expect(order(movePane(m, 'character', 'right', 5), 'right')).toEqual(['timers', 'group', 'comm', 'ui', 'character']);
    expect(order(movePane(m, 'character', 'right', 2), 'right')).toEqual(['timers', 'character', 'group', 'comm', 'ui']);
    expect(order(movePane(m, 'comm', 'right', 1), 'right')).toEqual(['character', 'comm', 'timers', 'group', 'ui']);
  });

  it('moves between docks and keeps every pane exactly once', () => {
    const m = movePane(defaultLayout(), 'group', 'left', 0);
    expect(order(m, 'left')).toEqual(['group']);
    expect(order(m, 'right')).toEqual(['character', 'timers', 'comm', 'ui']);
    everyPaneOnce(m);
    const m2 = movePane(m, 'timers', 'left', 99);
    expect(order(m2, 'left')).toEqual(['group', 'timers']);
    everyPaneOnce(m2);
  });

  it('keeps desired between side docks and resets it across axes', () => {
    let m = setDesired(defaultLayout(), { comm: 14 });
    m = movePane(m, 'comm', 'left', 0);
    expect(m.docks.left.panes[0]).toEqual({ id: 'comm', desired: 14 });
    m = movePane(m, 'comm', 'bottom', 0);
    expect(m.docks.bottom.panes[0]).toEqual({ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED });
    m = movePane(m, 'comm', 'right', 0);
    expect(m.docks.right.panes[0]).toEqual({ id: 'comm', desired: 10 });
    m = movePane(m, 'comm', 'top', 0);
    expect(m.docks.top.panes[0]).toEqual({ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED });
    m = setDesired(m, { comm: 40 });
    m = movePane(m, 'comm', 'bottom', 0);
    expect(m.docks.bottom.panes[0]).toEqual({ id: 'comm', desired: 40 });
    everyPaneOnce(m);
  });

  it('does not mutate its input', () => {
    const m = defaultLayout();
    const before = JSON.stringify(m);
    movePane(m, 'ui', 'bottom', 0);
    setDockSize(m, 'right', 40);
    setDesired(m, { ui: 9 });
    expect(JSON.stringify(m)).toBe(before);
  });

  it('knows a no-op move', () => {
    const m = defaultLayout();
    expect(isNoopMove(m, 'timers', 'right', 1)).toBe(true);
    expect(isNoopMove(m, 'timers', 'right', 2)).toBe(true);
    expect(isNoopMove(m, 'timers', 'right', 3)).toBe(false);
    expect(isNoopMove(m, 'timers', 'left', 0)).toBe(false);
  });

  it('finds a pane', () => {
    expect(findPane(defaultLayout(), 'comm')).toEqual({ dock: 'right', index: 3 });
  });
});

describe('sizes', () => {
  it('sets a dock size (whole cells, at least 1)', () => {
    expect(setDockSize(defaultLayout(), 'right', 40.4).docks.right.size).toBe(40);
    expect(setDockSize(defaultLayout(), 'bottom', -3).docks.bottom.size).toBe(1);
    const m = defaultLayout();
    expect(setDockSize(m, 'right', 33)).toBe(m);
  });

  it('sets desired sizes clamped to the minimum', () => {
    const m = setDesired(defaultLayout(), { character: 1, ui: 12 });
    expect(m.docks.right.panes.find((p) => p.id === 'character')!.desired).toBe(3);
    expect(m.docks.right.panes.find((p) => p.id === 'ui')!.desired).toBe(12);
  });

  it('shifts a boundary between two panes within their minimums', () => {
    const a = { id: 'character' as const, size: 9 };
    const b = { id: 'timers' as const, size: 8 };
    expect(shiftBoundary(a, b, 'right', 2)).toEqual({ a: 11, b: 6 });
    expect(shiftBoundary(a, b, 'right', 20)).toEqual({ a: 16, b: 1 });
    expect(shiftBoundary(a, b, 'right', -20)).toEqual({ a: 3, b: 14 });
    // Bottom dock minimum is 8 columns each.
    expect(shiftBoundary(a, b, 'bottom', 20)).toEqual({ a: 9, b: 8 });
    expect(shiftBoundary(a, b, 'bottom', -20)).toEqual({ a: 8, b: 9 });
  });
});

describe('floating panes', () => {
  const zOrder = (m: LayoutModel) => m.floating.map((f) => f.id);

  it('floats a docked pane in front, in whole cells, and keeps every pane once', () => {
    const m0 = defaultLayout();
    const m = floatPane(m0, 'comm', { x: 10.4, y: 3, w: 33, h: 12 });
    expect(order(m, 'right')).toEqual(['character', 'timers', 'group', 'ui']);
    // The map's default entry stays backmost (ADR 0020).
    expect(m.floating).toEqual([MAP, { id: 'comm', x: 10, y: 3, w: 33, h: 12 }]);
    expect(findPane(m, 'comm')).toBeNull();
    expect(findFloat(m, 'comm')).toBe(1);
    everyPaneOnce(m);
    const m2 = floatPane(m, 'ui', { x: -4, y: 0, w: 0, h: 5 });
    expect(m2.floating.at(-1)).toEqual({ id: 'ui', x: 0, y: 0, w: 1, h: 5 });
    expect(zOrder(m2)).toEqual(['map', 'comm', 'ui']);
    everyPaneOnce(m2);
    expect(JSON.stringify(m0)).toBe(JSON.stringify(defaultLayout()));
  });

  it('moves a floating pane (floatPane again) to the front', () => {
    let m = floatPane(defaultLayout(), 'comm', { x: 1, y: 1, w: 20, h: 8 });
    m = floatPane(m, 'ui', { x: 5, y: 5, w: 20, h: 8 });
    m = floatPane(m, 'comm', { x: 7, y: 2, w: 20, h: 8 });
    expect(m.floating).toEqual([
      MAP,
      { id: 'ui', x: 5, y: 5, w: 20, h: 8 },
      { id: 'comm', x: 7, y: 2, w: 20, h: 8 },
    ]);
    everyPaneOnce(m);
  });

  it('sets a floating rectangle in place and knows no-ops', () => {
    let m = floatPane(defaultLayout(), 'comm', { x: 1, y: 1, w: 20, h: 8 });
    m = floatPane(m, 'ui', { x: 5, y: 5, w: 20, h: 8 });
    const r = setFloatRect(m, 'comm', { x: 2, y: 3, w: 25, h: 9 });
    expect(r.floating).toEqual([
      MAP,
      { id: 'comm', x: 2, y: 3, w: 25, h: 9 },
      { id: 'ui', x: 5, y: 5, w: 20, h: 8 },
    ]);
    expect(setFloatRect(m, 'comm', { x: 1, y: 1, w: 20, h: 8 })).toBe(m);
    expect(setFloatRect(m, 'timers', { x: 1, y: 1, w: 20, h: 8 })).toBe(m);
  });

  it('raises a floating pane to the front and persists the z-order', () => {
    let m = floatPane(defaultLayout(), 'comm', { x: 1, y: 1, w: 20, h: 8 });
    m = floatPane(m, 'ui', { x: 5, y: 5, w: 20, h: 8 });
    m = floatPane(m, 'group', { x: 9, y: 9, w: 20, h: 8 });
    const r = raisePane(m, 'comm');
    expect(zOrder(r)).toEqual(['map', 'ui', 'group', 'comm']);
    expect(raisePane(r, 'comm')).toBe(r);
    expect(raisePane(r, 'timers')).toBe(r);
  });

  it('docks a floating pane with the default size for the axis', () => {
    let m = floatPane(defaultLayout(), 'comm', { x: 1, y: 1, w: 20, h: 8 });
    expect(isNoopMove(m, 'comm', 'right', 0)).toBe(false);
    const right = movePane(m, 'comm', 'right', 1);
    expect(order(right, 'right')).toEqual(['character', 'comm', 'timers', 'group', 'ui']);
    expect(right.docks.right.panes[1]).toEqual({ id: 'comm', desired: 10 });
    expect(right.floating).toEqual([MAP]);
    everyPaneOnce(right);
    m = movePane(m, 'comm', 'top', 99);
    expect(m.docks.top.panes).toEqual([{ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED }]);
    everyPaneOnce(m);
  });

  it('keeps floating panes when desired sizes are set', () => {
    const m = floatPane(defaultLayout(), 'comm', { x: 1, y: 1, w: 20, h: 8 });
    expect(setDesired(m, { comm: 3 })).toBe(m);
  });

  it('resizes from edges and corners within the minimum and the area', () => {
    const r = { x: 10, y: 5, w: 20, h: 10 };
    const min = { w: 10, h: 5 };
    expect(resizeRect(r, 'e', 4, 9, min, 100, 40)).toEqual({ x: 10, y: 5, w: 24, h: 10 });
    expect(resizeRect(r, 's', 4, 3, min, 100, 40)).toEqual({ x: 10, y: 5, w: 20, h: 13 });
    expect(resizeRect(r, 'w', -3, 0, min, 100, 40)).toEqual({ x: 7, y: 5, w: 23, h: 10 });
    expect(resizeRect(r, 'n', 0, -2, min, 100, 40)).toEqual({ x: 10, y: 3, w: 20, h: 12 });
    expect(resizeRect(r, 'se', 2, 2, min, 100, 40)).toEqual({ x: 10, y: 5, w: 22, h: 12 });
    expect(resizeRect(r, 'nw', 1, 1, min, 100, 40)).toEqual({ x: 11, y: 6, w: 19, h: 9 });
    // Minimum: the opposite edge stays put.
    expect(resizeRect(r, 'w', 50, 0, min, 100, 40)).toEqual({ x: 20, y: 5, w: 10, h: 10 });
    expect(resizeRect(r, 'n', 0, 50, min, 100, 40)).toEqual({ x: 10, y: 10, w: 20, h: 5 });
    expect(resizeRect(r, 'se', -50, -50, min, 100, 40)).toEqual({ x: 10, y: 5, w: 10, h: 5 });
    // The area: up to the window edges.
    expect(resizeRect(r, 'se', 500, 500, min, 100, 40)).toEqual({ x: 10, y: 5, w: 90, h: 35 });
    expect(resizeRect(r, 'nw', -500, -500, min, 100, 40)).toEqual({ x: 0, y: 0, w: 30, h: 15 });
  });
});

describe('togglePatch', () => {
  it('flips one pane', () => {
    const s = defaultSettings();
    expect(togglePatch(s.panes, 'group')).toEqual({ panes: { group: { color: 'black', border: true, on: false } } });
  });
});
