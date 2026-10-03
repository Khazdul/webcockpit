import { describe, expect, it } from 'vitest';
import { DEFAULT_BOTTOM_DESIRED } from '../../src/layout/allocate';
import {
  findFloat,
  findPane,
  floatPane,
  isNoopMove,
  isNoopNewLane,
  movePane,
  moveToNewLane,
  raisePane,
  resizeRect,
  setDesired,
  setFloatRect,
  setLaneSize,
  shiftBoundary,
  shiftLanes,
  shiftSpanBoundary,
  togglePatch,
  placeScriptPane,
  wantPaneSize,
} from '../../src/layout/model';
import { type DockId, type LayoutModel, PANE_IDS, type PaneId, defaultLayout, defaultMapFloat, dockPanes } from '../../src/layout/types';
import { defaultSettings } from '../../src/settings/types';

const order = (m: LayoutModel, d: DockId) => dockPanes(m.docks[d]).map((p) => p.id);
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
    expect(order(movePane(m, 'ui', 'right', 0, 0), 'right')).toEqual(['ui', 'character', 'timers', 'group', 'comm']);
    expect(order(movePane(m, 'character', 'right', 0, 5), 'right')).toEqual(['timers', 'group', 'comm', 'ui', 'character']);
    expect(order(movePane(m, 'character', 'right', 0, 2), 'right')).toEqual(['timers', 'character', 'group', 'comm', 'ui']);
    expect(order(movePane(m, 'comm', 'right', 0, 1), 'right')).toEqual(['character', 'comm', 'timers', 'group', 'ui']);
  });

  it('moves between docks and keeps every pane exactly once', () => {
    const m = movePane(defaultLayout(), 'group', 'left', 0, 0);
    expect(order(m, 'left')).toEqual(['group']);
    expect(order(m, 'right')).toEqual(['character', 'timers', 'comm', 'ui']);
    everyPaneOnce(m);
    const m2 = movePane(m, 'timers', 'left', 0, 99);
    expect(order(m2, 'left')).toEqual(['group', 'timers']);
    everyPaneOnce(m2);
  });

  it('keeps desired between side docks and resets it across axes', () => {
    let m = setDesired(defaultLayout(), { comm: 14 });
    m = movePane(m, 'comm', 'left', 0, 0);
    expect(dockPanes(m.docks.left)[0]).toEqual({ id: 'comm', desired: 14 });
    m = movePane(m, 'comm', 'bottom', 0, 0);
    expect(dockPanes(m.docks.bottom)[0]).toEqual({ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED });
    m = movePane(m, 'comm', 'right', 0, 0);
    expect(dockPanes(m.docks.right)[0]).toEqual({ id: 'comm', desired: 10 });
    m = movePane(m, 'comm', 'top', 0, 0);
    expect(dockPanes(m.docks.top)[0]).toEqual({ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED });
    m = setDesired(m, { comm: 40 });
    m = movePane(m, 'comm', 'bottom', 0, 0);
    expect(dockPanes(m.docks.bottom)[0]).toEqual({ id: 'comm', desired: 40 });
    everyPaneOnce(m);
  });

  it('does not mutate its input', () => {
    const m = defaultLayout();
    const before = JSON.stringify(m);
    movePane(m, 'ui', 'bottom', 0, 0);
    setLaneSize(m, 'right', 0, 40);
    setDesired(m, { ui: 9 });
    expect(JSON.stringify(m)).toBe(before);
  });

  it('knows a no-op move', () => {
    const m = defaultLayout();
    expect(isNoopMove(m, 'timers', 'right', 0, 1)).toBe(true);
    expect(isNoopMove(m, 'timers', 'right', 0, 2)).toBe(true);
    expect(isNoopMove(m, 'timers', 'right', 0, 3)).toBe(false);
    expect(isNoopMove(m, 'timers', 'left', 0, 0)).toBe(false);
  });

  it('finds a pane', () => {
    expect(findPane(defaultLayout(), 'comm')).toEqual({ dock: 'right', lane: 0, index: 3 });
  });
});

describe('lanes (ADR 0064)', () => {
  const lanes = (m: LayoutModel, d: DockId) => m.docks[d].lanes.map((l) => [l.size, l.panes.map((p) => p.id)]);
  /** Right dock: lane 0 = character, timers, comm, ui; lane 1 (inner, 20 wide) = group. */
  const twoLanes = () => moveToNewLane(defaultLayout(), 'group', 'right', 1, 20);

  it('moves a pane into a new lane at a lane position, with its size', () => {
    const m = twoLanes();
    expect(lanes(m, 'right')).toEqual([
      [33, ['character', 'timers', 'comm', 'ui']],
      [20, ['group']],
    ]);
    // At the screen edge (position 0).
    const e = moveToNewLane(m, 'ui', 'right', 0, 25.6);
    expect(lanes(e, 'right')).toEqual([
      [26, ['ui']],
      [33, ['character', 'timers', 'comm']],
      [20, ['group']],
    ]);
    everyPaneOnce(e);
  });

  it('moves a pane into a lane, before an index of that lane', () => {
    const m = movePane(twoLanes(), 'timers', 'right', 1, 0);
    expect(lanes(m, 'right')).toEqual([
      [33, ['character', 'comm', 'ui']],
      [20, ['timers', 'group']],
    ]);
    // Reordering within a lane: the index counts the moving pane.
    const r = movePane(m, 'timers', 'right', 1, 2);
    expect(lanes(r, 'right')[1]).toEqual([20, ['group', 'timers']]);
    everyPaneOnce(r);
  });

  it('removes a lane its last pane leaves, and keeps lane order', () => {
    const m = twoLanes();
    const back = movePane(m, 'group', 'right', 0, 2);
    expect(lanes(back, 'right')).toEqual([[33, ['character', 'timers', 'group', 'comm', 'ui']]]);
    const floated = floatPane(m, 'group', { x: 1, y: 1, w: 20, h: 8 });
    expect(lanes(floated, 'right')).toHaveLength(1);
    // Out of lane 0 into a new lane: lane 0 goes, the old lane 1 is lane 0 now.
    let only = moveToNewLane(defaultLayout(), 'group', 'right', 1, 20);
    for (const id of ['character', 'timers', 'comm', 'ui'] as const) only = movePane(only, id, 'left', 0, 99);
    expect(lanes(only, 'right')).toEqual([[20, ['group']]]);
    expect(lanes(only, 'left')).toEqual([[33, ['character', 'timers', 'comm', 'ui']]]);
    everyPaneOnce(only);
  });

  it('creates lane 0 at the default size when a pane enters an empty dock', () => {
    const m = movePane(defaultLayout(), 'comm', 'bottom', 0, 0);
    expect(m.docks.bottom.lanes).toEqual([{ size: 10, panes: [{ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED }] }]);
    // Lane indices past the end go into the last lane.
    const t = movePane(twoLanes(), 'ui', 'right', 7, 99);
    expect(lanes(t, 'right')[1]).toEqual([20, ['group', 'ui']]);
  });

  it('knows no-op moves into a lane and into a new lane', () => {
    const m = twoLanes();
    expect(isNoopMove(m, 'group', 'right', 1, 0)).toBe(true);
    expect(isNoopMove(m, 'group', 'right', 0, 0)).toBe(false);
    expect(movePane(m, 'group', 'right', 1, 1)).toBe(m);
    // Alone in its lane: a new lane right beside it changes nothing.
    expect(isNoopNewLane(m, 'group', 'right', 1)).toBe(true);
    expect(isNoopNewLane(m, 'group', 'right', 2)).toBe(true);
    expect(isNoopNewLane(m, 'group', 'right', 0)).toBe(false);
    expect(isNoopNewLane(m, 'group', 'left', 0)).toBe(false);
    expect(moveToNewLane(m, 'group', 'right', 2, 30)).toBe(m);
    // Not alone: a new lane beside its own lane is a real move.
    expect(isNoopNewLane(m, 'ui', 'right', 0)).toBe(false);
    expect(isNoopNewLane(m, 'ui', 'right', 1)).toBe(false);
  });

  it('keeps desired along the same axis across lanes and resets it across axes', () => {
    let m = setDesired(defaultLayout(), { comm: 14 });
    m = moveToNewLane(m, 'comm', 'left', 0, 30);
    expect(dockPanes(m.docks.left)[0]).toEqual({ id: 'comm', desired: 14 });
    m = moveToNewLane(m, 'comm', 'right', 1, 30);
    expect(m.docks.right.lanes[1]!.panes[0]).toEqual({ id: 'comm', desired: 14 });
    m = moveToNewLane(m, 'comm', 'bottom', 0, 6);
    expect(m.docks.bottom.lanes[0]).toEqual({ size: 6, panes: [{ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED }] });
    m = setDesired(m, { comm: 40 });
    m = moveToNewLane(m, 'comm', 'top', 0, 6);
    expect(m.docks.top.lanes[0]!.panes[0]).toEqual({ id: 'comm', desired: 40 });
    expect(m.docks.bottom.lanes).toEqual([]);
    // A floating pane docks into a new lane with the default for the axis.
    const f = moveToNewLane(m, 'map', 'right', 1, 30);
    expect(f.docks.right.lanes[1]!.panes[0]).toEqual({ id: 'map', desired: 20 });
    everyPaneOnce(f);
  });

  it('shifts cells between two lanes within the lane minimum, sum constant', () => {
    const m = twoLanes();
    const a = { lane: 0, size: 33 };
    const b = { lane: 1, size: 20 };
    expect(lanes(shiftLanes(m, 'right', a, b, 5), 'right').map((l) => l[0])).toEqual([38, 15]);
    expect(lanes(shiftLanes(m, 'right', a, b, 50), 'right').map((l) => l[0])).toEqual([43, 10]);
    expect(lanes(shiftLanes(m, 'right', a, b, -50), 'right').map((l) => l[0])).toEqual([10, 43]);
    expect(shiftLanes(m, 'right', a, b, 0)).toBe(m);
    expect(shiftLanes(m, 'right', a, { lane: 5, size: 3 }, 1)).toBe(m);
    // Top/bottom lanes: minimum 3 rows.
    let t = moveToNewLane(defaultLayout(), 'comm', 'bottom', 0, 10);
    t = moveToNewLane(t, 'ui', 'bottom', 1, 6);
    expect(lanes(shiftLanes(t, 'bottom', { lane: 0, size: 10 }, { lane: 1, size: 6 }, 99), 'bottom').map((l) => l[0])).toEqual([13, 3]);
    const before = JSON.stringify(m);
    shiftLanes(m, 'right', a, b, 5);
    moveToNewLane(m, 'ui', 'right', 0, 20);
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe('sizes', () => {
  it('sets a lane size (whole cells, at least 1)', () => {
    expect(setLaneSize(defaultLayout(), 'right', 0, 40.4).docks.right.lanes[0]!.size).toBe(40);
    expect(setLaneSize(defaultLayout(), 'right', 0, -3).docks.right.lanes[0]!.size).toBe(1);
    const m = defaultLayout();
    expect(setLaneSize(m, 'right', 0, 33)).toBe(m);
    // No such lane: unchanged.
    expect(setLaneSize(m, 'bottom', 0, 5)).toBe(m);
    expect(setLaneSize(m, 'right', 1, 5)).toBe(m);
  });

  it('sets desired sizes clamped to the minimum', () => {
    const m = setDesired(defaultLayout(), { character: 1, ui: 12 });
    expect(dockPanes(m.docks.right).find((p) => p.id === 'character')!.desired).toBe(3);
    expect(dockPanes(m.docks.right).find((p) => p.id === 'ui')!.desired).toBe(12);
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
    expect(isNoopMove(m, 'comm', 'right', 0, 0)).toBe(false);
    const right = movePane(m, 'comm', 'right', 0, 1);
    expect(order(right, 'right')).toEqual(['character', 'comm', 'timers', 'group', 'ui']);
    expect(dockPanes(right.docks.right)[1]).toEqual({ id: 'comm', desired: 10 });
    expect(right.floating).toEqual([MAP]);
    everyPaneOnce(right);
    m = movePane(m, 'comm', 'top', 0, 99);
    expect(dockPanes(m.docks.top)).toEqual([{ id: 'comm', desired: DEFAULT_BOTTOM_DESIRED }]);
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

describe('pane bar placement and sizes (ADR 0065)', () => {
  const BAR = 'panebar/bar' as PaneId;
  const own = { rows: 1, cols: 80, lane: 'own' as const };

  it("lane 'own' opens a new lane 0 at the screen edge of every dock, sized to the pane and frame", () => {
    const b = placeScriptPane(defaultLayout(), BAR, { dock: 'bottom', ...own, border: false });
    expect(b.docks.bottom.lanes).toEqual([{ size: 1, panes: [{ id: BAR, desired: 80 }] }]);
    const t = placeScriptPane(moveToNewLane(defaultLayout(), 'comm', 'top', 0, 6), BAR, { dock: 'top', ...own, border: true });
    expect(t.docks.top.lanes.map((l) => [l.size, l.panes.map((p) => p.id)])).toEqual([[3, [BAR]], [6, ['comm']]]);
    const r = placeScriptPane(defaultLayout(), BAR, { dock: 'right', rows: 6, cols: 8, lane: 'own', border: false });
    expect(r.docks.right.lanes.map((l) => [l.size, l.panes.map((p) => p.id)])).toEqual([[10, [BAR]], [33, ['character', 'timers', 'group', 'comm', 'ui']]]);
    expect(r.docks.right.lanes[0]!.panes[0]!.desired).toBe(6);
    const l = placeScriptPane(defaultLayout(), BAR, { dock: 'left', rows: 6, cols: 20, lane: 'own' });
    expect(l.docks.left.lanes).toEqual([{ size: 22, panes: [{ id: BAR, desired: 6 }] }]);
    // Placed already: nothing changes. A float ignores the lane.
    expect(placeScriptPane(b, BAR, { dock: 'top', ...own })).toBe(b);
    const f = placeScriptPane(defaultLayout(), BAR, { dock: 'float', ...own });
    expect(f.floating[0]).toMatchObject({ id: BAR, auto: true, w: 82, h: 3 });
  });

  it('shiftLanes keeps each lane at its own minimum', () => {
    let m = placeScriptPane(defaultLayout(), BAR, { dock: 'bottom', ...own, border: false });
    m = moveToNewLane(m, 'comm', 'bottom', 1, 6);
    const r = shiftLanes(m, 'bottom', { lane: 0, size: 3, min: 1 }, { lane: 1, size: 6, min: 3 }, -5);
    expect(r.docks.bottom.lanes.map((l) => l.size)).toEqual([1, 8]);
    const g = shiftLanes(m, 'bottom', { lane: 0, size: 1, min: 1 }, { lane: 1, size: 6, min: 3 }, 9);
    expect(g.docks.bottom.lanes.map((l) => l.size)).toEqual([4, 3]);
  });

  it('wantPaneSize: side dock rows, a lane alone in top/bottom, cols along the lane; no-ops', () => {
    const b = placeScriptPane(defaultLayout(), BAR, { dock: 'bottom', ...own, border: false });
    const two = wantPaneSize(b, BAR, 2, undefined, false);
    expect(two.docks.bottom.lanes[0]!.size).toBe(2);
    expect(wantPaneSize(two, BAR, 2, undefined, false)).toBe(two);
    expect(wantPaneSize(b, BAR, 2, undefined, true).docks.bottom.lanes[0]!.size).toBe(4);
    expect(wantPaneSize(b, BAR, 1, 50, false).docks.bottom.lanes[0]).toEqual({ size: 1, panes: [{ id: BAR, desired: 50 }] });
    // Shared lane: the rows are the lane's, not the pane's.
    const shared = movePane(b, 'comm', 'bottom', 0, 1);
    expect(wantPaneSize(shared, BAR, 4, undefined, false)).toBe(shared);
    // Side dock: desired rows.
    const side = movePane(b, BAR, 'right', 0, 0);
    expect(wantPaneSize(side, BAR, 7, undefined, false).docks.right.lanes[0]!.panes[0]).toEqual({ id: BAR, desired: 7 });
    // A float or an unknown pane: unchanged.
    const fl = floatPane(b, BAR, { x: 1, y: 1, w: 20, h: 2 });
    expect(wantPaneSize(fl, BAR, 3, 5, false)).toBe(fl);
    expect(wantPaneSize(b, 'x/y' as PaneId, 3, 5, false)).toBe(b);
  });
});

describe('spanning panes (ADR 0067)', () => {
  const ids = (l: readonly { id: PaneId }[]) => l.map((p) => p.id);
  const shape = (m: LayoutModel, d: DockId) => ({
    head: ids(m.docks[d].head),
    lanes: m.docks[d].lanes.map((l) => ids(l.panes)),
    tail: ids(m.docks[d].tail),
  });
  /** Right dock: lane 0 = character, timers, comm, ui; lane 1 = group; the map floats. */
  const twoLanes = () => moveToNewLane(defaultLayout(), 'group', 'right', 1, 20);

  it('moves a pane into the head and tail spans, and within them', () => {
    let m = movePane(twoLanes(), 'map', 'right', 'head', 0);
    expect(shape(m, 'right')).toEqual({ head: ['map'], lanes: [['character', 'timers', 'comm', 'ui'], ['group']], tail: [] });
    // A floating pane gets the side axis default.
    expect(m.docks.right.head[0]).toEqual({ id: 'map', desired: 20 });
    expect(findPane(m, 'map')).toEqual({ dock: 'right', lane: 'head', index: 0 });
    m = movePane(m, 'ui', 'right', 'head', 1);
    m = movePane(m, 'timers', 'right', 'tail', 0);
    expect(shape(m, 'right')).toEqual({ head: ['map', 'ui'], lanes: [['character', 'comm'], ['group']], tail: ['timers'] });
    // Reordering within a span: the index counts the moving pane.
    m = movePane(m, 'map', 'right', 'head', 2);
    expect(m.docks.right.head.map((p) => p.id)).toEqual(['ui', 'map']);
    expect(findPane(m, 'timers')).toEqual({ dock: 'right', lane: 'tail', index: 0 });
    everyPaneOnce(m);
  });

  it('moves a pane out of a span into a lane or another dock, keeping desired along the axis', () => {
    let m = movePane(twoLanes(), 'map', 'right', 'head', 0);
    m = setDesired(m, { map: 17 });
    const back = movePane(m, 'map', 'right', 1, 0);
    expect(shape(back, 'right')).toEqual({ head: [], lanes: [['character', 'timers', 'comm', 'ui'], ['map', 'group']], tail: [] });
    expect(back.docks.right.lanes[1]!.panes[0]).toEqual({ id: 'map', desired: 17 });
    const left = movePane(m, 'map', 'left', 0, 0);
    expect(left.docks.left.lanes[0]!.panes[0]).toEqual({ id: 'map', desired: 17 });
    const bottom = movePane(m, 'map', 'bottom', 0, 0);
    expect(bottom.docks.bottom.lanes[0]!.panes[0]).toEqual({ id: 'map', desired: DEFAULT_BOTTOM_DESIRED });
    everyPaneOnce(bottom);
  });

  it('floats a span pane', () => {
    const m = movePane(twoLanes(), 'ui', 'right', 'tail', 0);
    const f = floatPane(m, 'ui', { x: 2, y: 3, w: 20, h: 8 });
    expect(shape(f, 'right').tail).toEqual([]);
    expect(f.floating.at(-1)).toEqual({ id: 'ui', x: 2, y: 3, w: 20, h: 8 });
    everyPaneOnce(f);
  });

  it('folds the spans into lane 0 when the dock goes down to one lane, and does not restore them', () => {
    let m = movePane(twoLanes(), 'map', 'right', 'head', 0);
    m = movePane(m, 'ui', 'right', 'tail', 0);
    const folded = { head: [], lanes: [['map', 'character', 'timers', 'comm', 'ui']], tail: [] };
    // The only pane of lane 1 leaves: one lane is left, the spans fold into it.
    const one = movePane(m, 'group', 'left', 0, 0);
    expect(shape(one, 'right')).toEqual(folded);
    expect(shape(floatPane(m, 'group', { x: 0, y: 0, w: 20, h: 8 }), 'right')).toEqual(folded);
    // A second lane coming back does not restore them.
    const again = moveToNewLane(one, 'comm', 'right', 1, 20);
    expect(shape(again, 'right').head).toEqual([]);
    everyPaneOnce(again);
  });

  it('a span target that empties the second lane folds at once', () => {
    // group is alone in lane 1: moving it to the head leaves one lane.
    const m = movePane(twoLanes(), 'group', 'right', 'head', 0);
    expect(shape(m, 'right')).toEqual({ head: [], lanes: [['group', 'character', 'timers', 'comm', 'ui']], tail: [] });
  });

  it('keeps the spans when a new lane is made; new lanes go into the region only', () => {
    let m = movePane(twoLanes(), 'map', 'right', 'head', 0);
    m = moveToNewLane(m, 'ui', 'right', 0, 25);
    expect(shape(m, 'right')).toEqual({ head: ['map'], lanes: [['ui'], ['character', 'timers', 'comm'], ['group']], tail: [] });
    // A span pane into a new lane.
    const out = moveToNewLane(m, 'map', 'right', 3, 20);
    expect(shape(out, 'right')).toEqual({ head: [], lanes: [['ui'], ['character', 'timers', 'comm'], ['group'], ['map']], tail: [] });
    // A span pane is never "alone in its lane": a new lane is always a real move.
    expect(isNoopNewLane(m, 'map', 'right', 0)).toBe(false);
    everyPaneOnce(out);
  });

  it('knows no-op moves within a span', () => {
    let m = movePane(twoLanes(), 'map', 'right', 'head', 0);
    m = movePane(m, 'ui', 'right', 'head', 1);
    expect(isNoopMove(m, 'map', 'right', 'head', 0)).toBe(true);
    expect(isNoopMove(m, 'map', 'right', 'head', 1)).toBe(true);
    expect(isNoopMove(m, 'map', 'right', 'head', 2)).toBe(false);
    expect(isNoopMove(m, 'map', 'right', 'tail', 0)).toBe(false);
    expect(isNoopMove(m, 'map', 'right', 0, 0)).toBe(false);
    expect(movePane(m, 'ui', 'right', 'head', 2)).toBe(m);
  });

  it('sets desired sizes of span panes', () => {
    const m = movePane(twoLanes(), 'map', 'right', 'head', 0);
    expect(setDesired(m, { map: 12 }).docks.right.head[0]).toEqual({ id: 'map', desired: 12 });
    // Clamped to the side-dock minimum (3 rows for the map).
    expect(setDesired(m, { map: 1 }).docks.right.head[0]!.desired).toBe(3);
  });

  it('shifts the span boundary, clamped to every minimum', () => {
    const span = { id: 'map' as PaneId, size: 10 };
    const edge = [
      { id: 'character' as PaneId, size: 9 },
      { id: 'group' as PaneId, size: 4 },
    ];
    expect(shiftSpanBoundary(span, edge, 'right', 2)).toEqual({ map: 12, character: 7, group: 2 });
    // group keeps 1 row: the shift stops at 3.
    expect(shiftSpanBoundary(span, edge, 'right', 9)).toEqual({ map: 13, character: 6, group: 1 });
    // The map keeps 3 rows.
    expect(shiftSpanBoundary(span, edge, 'right', -20)).toEqual({ map: 3, character: 16, group: 11 });
    // The top/bottom dock: 8 columns each.
    expect(shiftSpanBoundary({ id: 'map', size: 30 }, [{ id: 'comm', size: 10 }], 'bottom', 5)).toEqual({ map: 32, comm: 8 });
  });

  it('wantPaneSize: a span pane is never alone in its lane', () => {
    const BAR = 'bar/bar' as PaneId;
    let m = placeScriptPane(defaultLayout(), BAR, { dock: 'bottom', rows: 1, cols: 40, border: false });
    m = moveToNewLane(m, 'comm', 'bottom', 1, 6);
    m = moveToNewLane(m, 'ui', 'bottom', 2, 6);
    m = movePane(m, BAR, 'bottom', 'head', 0);
    expect(shape(m, 'bottom').head).toEqual([BAR]);
    const sizes = m.docks.bottom.lanes.map((l) => l.size);
    // Rows do not change any lane; cols set its desired columns.
    expect(wantPaneSize(m, BAR, 4, undefined, false)).toBe(m);
    const w = wantPaneSize(m, BAR, 4, 50, false);
    expect(w.docks.bottom.lanes.map((l) => l.size)).toEqual(sizes);
    expect(w.docks.bottom.head[0]).toEqual({ id: BAR, desired: 50 });
    // In a side dock rows still become its desired rows.
    let s = movePane(twoLanes(), 'map', 'right', 'tail', 0);
    s = wantPaneSize(s, 'map', 11, undefined, true);
    expect(s.docks.right.tail[0]).toEqual({ id: 'map', desired: 11 });
  });

  it('places script panes in lane 0, and "own" lanes in the region', () => {
    const id = 's/p' as PaneId;
    const m = movePane(twoLanes(), 'map', 'right', 'head', 0);
    const a = placeScriptPane(m, id, { dock: 'right', rows: 4, cols: 9 });
    expect(shape(a, 'right')).toEqual({ head: ['map'], lanes: [['character', 'timers', 'comm', 'ui', id], ['group']], tail: [] });
    const o = placeScriptPane(m, id, { dock: 'right', rows: 4, cols: 20, lane: 'own' });
    expect(shape(o, 'right')).toEqual({ head: ['map'], lanes: [[id], ['character', 'timers', 'comm', 'ui'], ['group']], tail: [] });
  });
});

