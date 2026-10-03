// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Cockpit } from '../../src/layout/cockpit';
import { frameBottom, frameEdge, frameText, frameTop } from '../../src/panes/frame';
import { Bus } from '../../src/core/bus';
import type { ConnState } from '../../src/core/types';
import { createPaneContext, lazyDb } from '../../src/panes/context';
import { PaneShell } from '../../src/panes/pane';
import { SettingsStore } from '../../src/settings';
import { movePane, moveToNewLane, setLaneSize } from '../../src/layout/model';

describe('frame', () => {
  it('draws the top row with the label after ▀▀ and fills to the width', () => {
    expect(frameTop(20, 'Timers')).toBe('▛▀▀ Timers ▀▀▀▀▀▀▀▀▜');
    expect(frameTop(20, 'Timers')).toHaveLength(20);
    expect(frameTop(6, 'Timers')).toBe('▛▀▀ T▜');
    expect(frameTop(2, 'UI')).toBe('▛▜');
    expect(frameTop(1, 'UI')).toBe('▛');
    expect(frameTop(0, 'UI')).toBe('');
  });

  it('draws edges and the bottom row', () => {
    expect(frameEdge(5)).toBe('▌   ▐');
    expect(frameBottom(5)).toBe('▙▄▄▄▟');
  });

  it('builds h rows of w cells', () => {
    const t = frameText(12, 4, 'Comm').split('\n');
    expect(t).toEqual(['▛▀▀ Comm ▀▀▜', '▌          ▐', '▌          ▐', '▙▄▄▄▄▄▄▄▄▄▄▟']);
    for (const row of t) expect([...row]).toHaveLength(12);
    expect(frameText(5, 1, 'X')).toBe('▛▀▀ ▜');
    expect(frameText(0, 3, 'X')).toBe('');
  });

});

describe('PaneShell', () => {
  it('places itself in cells, draws the frame and reports its inner size', () => {
    const p = new PaneShell(createPaneContext({ doc: document }), 'comm');
    const sizes: [number, number][] = [];
    p.onResize((c, r) => sizes.push([c, r]));
    const rect = { x: 2, y: 3, w: 10, h: 5 };
    p.place({ rect, content: { x: 3, y: 4, w: 8, h: 3 }, framed: true }, { w: 9, h: 17 });
    expect(p.el.hidden).toBe(false);
    expect(p.el.style.left).toBe('18px');
    expect(p.el.style.top).toBe('51px');
    expect(p.el.style.width).toBe('90px');
    expect(p.content.style.left).toBe('9px');
    expect(p.content.style.height).toBe('51px');
    expect(p.el.querySelector('.wc-pane-frame')!.textContent!.split('\n')[0]).toBe('▛▀▀ Comm ▜');
    expect([p.cols, p.rows, p.visible]).toEqual([8, 3, true]);
    p.place({ rect, content: rect, framed: false }, { w: 9, h: 17 });
    expect(p.el.querySelector('.wc-pane-frame')!.textContent).toBe('');
    p.place(null, { w: 9, h: 17 });
    expect(p.el.hidden).toBe(true);
    expect(sizes).toEqual([
      [8, 3],
      [10, 5],
      [0, 0],
    ]);
  });
});

describe('PaneShell render and active state', () => {
  class TestPane extends PaneShell {
    renders = 0;
    blanks = 0;
    changes: boolean[] = [];
    protected override render(): void {
      this.renders++;
      this.content.textContent = `r${this.renders} ${this.cols}x${this.rows}`;
    }
    protected override blank(): void {
      this.blanks++;
      super.blank();
    }
    protected override onActiveChange(active: boolean): void {
      this.changes.push(active);
    }
  }

  function make(id: 'group' | 'ui', state: ConnState = 'idle') {
    const bus = new Bus();
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({ doc: document, bus, requestFrame: (cb) => frames.push(cb), connState: () => state });
    const p = new TestPane(ctx, id);
    const flush = () => {
      while (frames.length) frames.shift()!();
    };
    const show = (w = 10, h = 4) =>
      p.place({ rect: { x: 0, y: 0, w, h }, content: { x: 0, y: 0, w, h }, framed: false }, { w: 8, h: 16 });
    const conn = (s: ConnState) => bus.emit('conn.state', { state: s, prev: 'login' });
    return { p, bus, frames, flush, show, conn };
  }

  it('starts active when the connection is already playing', () => {
    expect(make('group', 'playing').p.active).toBe(true);
    const t = make('group');
    expect(t.p.active).toBe(false);
    expect(t.p.el.hasAttribute('data-active')).toBe(false);
  });

  it('renders once per frame after markDirty, only while visible', () => {
    const t = make('group', 'playing');
    t.p.markDirty();
    expect(t.frames).toHaveLength(0); // hidden: nothing scheduled
    t.show();
    t.p.markDirty();
    t.p.markDirty();
    expect(t.frames).toHaveLength(1);
    t.flush();
    expect(t.p.renders).toBe(1);
    expect(t.p.content.textContent).toBe('r1 10x4');
    t.show(12, 4); // resize → render
    t.flush();
    expect(t.p.content.textContent).toBe('r2 12x4');
    t.flush();
    expect(t.p.renders).toBe(2);
  });

  it('blanks while inactive, renders when playing, and blanks again after disconnect', () => {
    const t = make('group');
    t.show();
    t.flush();
    expect([t.p.renders, t.p.blanks]).toEqual([0, 1]);
    t.p.markDirty();
    t.flush();
    expect(t.p.blanks).toBe(1); // already blank: not redone
    t.conn('playing');
    expect(t.p.active).toBe(true);
    expect(t.p.el.hasAttribute('data-active')).toBe(true);
    t.flush();
    expect(t.p.renders).toBe(1);
    expect(t.p.content.textContent).toBe('r1 10x4');
    t.conn('disconnected');
    t.flush();
    expect(t.p.content.textContent).toBe('');
    expect(t.p.changes).toEqual([true, false]);
    t.conn('connecting');
    t.conn('login');
    expect(t.p.changes).toEqual([true, false]);
  });

  it('the UI pane keeps rendering while inactive', () => {
    const t = make('ui');
    t.show();
    t.flush();
    expect([t.p.renders, t.p.blanks]).toEqual([1, 0]);
    expect(t.p.blankWhenInactive).toBe(false);
  });

  it('re-renders on a colour change but not on a layout-only settings change', () => {
    const t = make('group', 'playing');
    const s = t.p['ctx'].settings;
    t.p.applyTheme(s.get());
    t.show();
    t.flush();
    const n = t.p.renders;
    s.update({ layout: { docks: { right: { lanes: [{ size: 40, panes: [{ id: 'group', desired: 6 }] }] } } } });
    t.p.applyTheme(s.get());
    t.flush();
    expect(t.p.renders).toBe(n);
    s.update({ panes: { group: { color: 'blue' } } });
    t.p.applyTheme(s.get());
    t.flush();
    expect(t.p.renders).toBe(n + 1);
  });

  it('dispose stops following the connection', () => {
    const t = make('group');
    t.p.dispose();
    t.conn('playing');
    expect(t.p.active).toBe(false);
    expect(t.bus.count('conn.state')).toBe(0);
  });

  it('lazyDb rejects without IndexedDB', async () => {
    await expect(lazyDb(null)()).rejects.toThrow('IndexedDB unavailable');
  });
});

describe('Cockpit', () => {
  function make(width: number, height: number) {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.append(root);
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const frames: (() => void)[] = [];
    const size = { width, height };
    const c = new Cockpit({
      root,
      settings,
      cells: { get: () => ({ w: 10, h: 20 }), subscribe: () => () => {} },
      requestFrame: (cb) => frames.push(cb),
    });
    Object.defineProperty(c.el, 'clientWidth', { get: () => size.width, configurable: true });
    Object.defineProperty(c.el, 'clientHeight', { get: () => size.height, configurable: true });
    c.relayoutNow();
    const flush = () => {
      while (frames.length) frames.shift()!();
    };
    return { c, settings, size, flush };
  }

  it('emits view.size when the size in cells changes, and builds panes from its context', () => {
    const { c, size, flush } = make(1000, 600);
    const sizes: { cols: number; rows: number }[] = [];
    c.paneContext.bus.on('view.size', (v) => sizes.push(v));
    c.relayoutNow();
    expect(sizes).toEqual([]);
    size.width = 1200;
    c.relayoutNow();
    size.width = 1205; // same cell count
    c.relayoutNow();
    flush();
    expect(sizes).toEqual([{ cols: 120, rows: 30 }]);
    expect(c.pane('group').active).toBe(false);
    c.paneContext.bus.emit('conn.state', { state: 'playing', prev: 'login' });
    expect(c.pane('group').el.hasAttribute('data-active')).toBe(true);
    c.dispose();
    expect(c.paneContext.bus.count('conn.state')).toBe(0);
  });

  it('lays out the default in whole cells', () => {
    const { c } = make(1205, 1010); // 120 × 50 cells, 5 px / 10 px spare
    expect(c.el.dataset.cells).toBe('120x50');
    expect(c.gameEl.style.width).toBe('860px');
    expect(c.inputEl.style.top).toBe('980px');
    expect(c.inputEl.style.left).toBe('0px');
    expect(c.inputEl.style.width).toBe('860px'); // as wide as the game pane
    expect(c.pane('character').el.style.left).toBe('870px');
    expect(c.pane('character').rows).toBe(9);
    expect(c.pane('ui').rows).toBe(8); // the right column runs the full 50 rows
    expect(c.el.querySelectorAll('.wc-handle')).toHaveLength(5); // dock gap + 4 boundaries
  });

  it('relayouts once per frame after settings changes', () => {
    const { c, settings, flush } = make(1200, 1000);
    settings.update({ panes: { ui: { on: false } } });
    settings.update({ panes: { group: { on: false } } });
    expect(c.pane('ui').visible).toBe(true);
    flush();
    expect(c.pane('ui').visible).toBe(false);
    expect(c.pane('group').visible).toBe(false);
    expect(c.pane('character').rows).toBe(9);
    expect(c.pane('timers').rows + c.pane('comm').rows).toBe(44 - 9); // the rest shared without UI and Group
  });

  it('shows the too-small state and makes the view inert', () => {
    const { c, size, flush } = make(1200, 1000);
    size.width = 500;
    c.scheduleRelayout();
    flush();
    expect(c.el.hasAttribute('data-too-small')).toBe(true);
    expect(c.inputEl.inert).toBe(true);
    expect(c.el.querySelector<HTMLElement>('.wc-too-small')!.hidden).toBe(false);
    size.width = 1200;
    c.scheduleRelayout();
    flush();
    expect(c.el.hasAttribute('data-too-small')).toBe(false);
    expect(c.inputEl.inert).toBe(false);
  });

  it('finds drop targets: dock positions, edges of hidden docks, floating over the game', () => {
    const { c } = make(1200, 1000); // 120 × 50, right dock x 87..119
    // Over the top half of Character → before it; no-op for Character itself.
    expect(c.dropTarget(900, 30, 'comm')).toMatchObject({ dock: 'right', index: 0, open: false });
    expect(c.dropTarget(900, 30, 'character')).toBeNull();
    // Below the last pane's middle → after UI.
    expect(c.dropTarget(900, 970, 'character')).toMatchObject({ dock: 'right', index: 5 });
    expect(c.dropTarget(5, 400, 'comm')).toMatchObject({ dock: 'left', index: 0, open: true });
    expect(c.dropTarget(400, 970, 'comm')).toMatchObject({ dock: 'bottom', open: true });
    expect(c.dropTarget(400, 5, 'comm')).toMatchObject({ kind: 'dock', dock: 'top', open: true });
    // The lower half of the top row floats at row 0 instead of docking.
    expect(c.dropTarget(400, 15, 'comm')).toEqual({ kind: 'float', rect: { x: 40, y: 0, w: 36, h: 14 } });
    // Over the game: a docked pane floats at the pointer at the standard size, 36 × 14.
    expect(c.dropTarget(400, 400, 'comm')).toEqual({ kind: 'float', rect: { x: 40, y: 20, w: 36, h: 14 } });
    expect(c.dropTarget(400, 400, 'comm', { x: 5, y: 0 })).toEqual({ kind: 'float', rect: { x: 35, y: 20, w: 36, h: 14 } });
    // A grab offset past the standard width is cut to it.
    expect(c.dropTarget(400, 400, 'comm', { x: 50, y: 0 })).toEqual({ kind: 'float', rect: { x: 5, y: 20, w: 36, h: 14 } });
    // Clamped into the window (it may cover the input row).
    expect(c.dropTarget(850, 900, 'comm')).toEqual({ kind: 'float', rect: { x: 84, y: 36, w: 36, h: 14 } });
  });

  it('finds new-lane targets on the edge bands of a lane (ADR 0064)', () => {
    const { c, settings, flush } = make(1200, 1000); // 120 × 50, right dock x 87..119: bands 3 cells
    // The inner (left) band: a new lane inside lane 0; the outer band: at the screen edge.
    expect(c.dropTarget(880, 400, 'comm')).toMatchObject({ kind: 'lane', dock: 'right', at: 1, size: 33 });
    expect(c.dropTarget(1195, 400, 'comm')).toMatchObject({ kind: 'lane', dock: 'right', at: 0, size: 33 });
    // The bar runs along the whole lane boundary.
    expect(c.dropTarget(880, 400, 'comm')).toMatchObject({ bar: { y: 0, h: 1000 } });
    // Just inside the band: into the lane as before.
    expect(c.dropTarget(900, 30, 'comm')).toMatchObject({ kind: 'dock', dock: 'right', lane: 0, index: 0 });
    settings.update((d) => {
      d.layout = moveToNewLane(d.layout, 'group', 'right', 1, 20);
    });
    flush();
    // Lane 1 is x 67..86 (bands 3 cells): alone there, a new lane beside it is no move.
    expect(c.dropTarget(680, 400, 'group')).toBeNull();
    expect(c.dropTarget(860, 400, 'group')).toBeNull();
    // Its middle: into lane 1; a pane of lane 0 there joins lane 1.
    expect(c.dropTarget(760, 400, 'group')).toBeNull();
    expect(c.dropTarget(760, 900, 'comm')).toMatchObject({ kind: 'dock', dock: 'right', lane: 1, index: 1 });
    // The game pane is 66 wide: a new lane gets 33, then less when room runs out.
    expect(c.dropTarget(680, 400, 'comm')).toMatchObject({ kind: 'lane', at: 2, size: 33 });
    settings.update((d) => {
      d.layout = setLaneSize(d.layout, 'right', 1, 50);
    });
    flush(); // game 36 wide: room for 6 < 10, so the band is no target
    expect(c.dropTarget(380, 400, 'comm')).toMatchObject({ kind: 'dock', dock: 'right', lane: 1 });
  });

  it('finds span targets on the region strips and over span stacks (ADR 0067)', () => {
    const { c, settings, flush } = make(1200, 1000); // 120 × 50, 10 × 20 px cells
    // One lane: no strips, the first row is the in-lane insert.
    expect(c.dropTarget(900, 10, 'comm')).toMatchObject({ kind: 'dock', lane: 0, index: 0 });
    settings.update((d) => {
      d.layout = moveToNewLane(d.layout, 'group', 'right', 1, 20);
    });
    flush(); // dock x 67..119: lane 1 x 67..86, lane 0 x 87..119
    // The region's first row: append to the head spans, a dock-wide bar and the box comm would get.
    const head = c.dropTarget(900, 10, 'comm');
    expect(head).toMatchObject({ kind: 'span', dock: 'right', side: 'head', index: 0 });
    expect(head).toMatchObject({ bar: { x: 670, w: 530 }, ghost: { x: 67, y: 0, w: 53 } });
    // Its last row: first in the tail spans.
    expect(c.dropTarget(760, 990, 'comm')).toMatchObject({ kind: 'span', side: 'tail', index: 0, ghost: { x: 67, w: 53 } });
    // The second row: the in-lane insert as before.
    expect(c.dropTarget(900, 30, 'comm')).toMatchObject({ kind: 'dock', lane: 0, index: 0 });
    // group is alone in lane 1: a span would fold the dock, so no span target.
    expect(c.dropTarget(760, 10, 'group')).toBeNull();
    settings.update((d) => {
      d.layout = movePane(d.layout, 'comm', 'right', 'head', 0);
    });
    flush();
    const r = c.layout!.docks.right!;
    expect(r.spans.map((s) => [s.side, s.panes])).toEqual([['head', ['comm']]]);
    expect(c.pane('comm').el.style.width).toBe('530px');
    // Over the span stack: before comm (upper half) or after it (lower half).
    const comm = r.spans[0]!.rect;
    expect(c.dropTarget(700, comm.y * 20 + 10, 'ui')).toMatchObject({ kind: 'span', side: 'head', index: 0 });
    expect(c.dropTarget(700, (comm.y + comm.h) * 20 - 10, 'ui')).toMatchObject({ kind: 'span', side: 'head', index: 1 });
    expect(c.dropTarget(700, comm.y * 20 + 10, 'comm')).toBeNull();
    // The span ↔ lanes handle, across the dock.
    const handle = c.el.querySelector<HTMLElement>('.wc-handle[data-span="head"]')!;
    expect(handle.dataset.dock).toBe('right');
    expect(handle.style.left).toBe('670px');
    expect(handle.style.width).toBe('530px');
  });

  it('finds span strips at the ends of the bottom dock rows (ADR 0067)', () => {
    const { c, settings, flush } = make(1200, 1000);
    settings.update((d) => {
      let m = moveToNewLane(d.layout, 'comm', 'bottom', 0, 10);
      m = moveToNewLane(m, 'ui', 'bottom', 1, 10);
      d.layout = m;
    });
    flush(); // bottom dock x 0..85 (86 wide: strips 3 columns), rows 30..49
    const b = c.layout!.docks.bottom!;
    expect(b.rect).toMatchObject({ x: 0, w: 86, y: 30, h: 20 });
    expect(c.dropTarget(15, 900, 'group')).toMatchObject({ kind: 'span', dock: 'bottom', side: 'head', index: 0 });
    expect(c.dropTarget(15, 900, 'group')).toMatchObject({ ghost: { x: 0, y: 30, h: 20 } });
    expect(c.dropTarget(835, 650, 'group')).toMatchObject({ kind: 'span', side: 'tail', index: 0 });
    // Inside the strips: the rows as before.
    expect(c.dropTarget(400, 900, 'group')).toMatchObject({ kind: 'dock', dock: 'bottom' });
  });

  it('places floating panes over the rest and docks them only from the screen edges', () => {
    const { c, settings, size, flush } = make(1200, 1000);
    settings.update((d) => {
      const lane = d.layout.docks.right.lanes[0]!;
      lane.panes = lane.panes.filter((p) => p.id !== 'comm' && p.id !== 'ui');
      d.layout.floating = [
        { id: 'comm', x: 80, y: 10, w: 30, h: 12 },
        { id: 'ui', x: 5, y: 5, w: 20, h: 6 },
      ];
    });
    flush();
    const comm = c.pane('comm');
    expect(comm.el.hasAttribute('data-floating')).toBe(true);
    // The map (off) keeps the backmost floating slot (migrateLayout, ADR 0020).
    expect(comm.el.style.zIndex).toBe('11');
    expect(c.pane('ui').el.style.zIndex).toBe('12');
    expect(c.pane('character').el.hasAttribute('data-floating')).toBe(false);
    expect(c.pane('character').el.style.zIndex).toBe('');
    expect([comm.cols, comm.rows]).toEqual([28, 10]);
    expect(comm.el.style.left).toBe('800px');
    expect(comm.el.querySelectorAll('.wc-float-handle')).toHaveLength(8);
    // Over the right dock but not at the screen edge: still floats.
    expect(c.dropTarget(1000, 400, 'comm')).toMatchObject({ kind: 'float' });
    // A docked pane dropped there goes into the dock.
    expect(c.dropTarget(1000, 30, 'group')).toMatchObject({ kind: 'dock', dock: 'right' });
    // The right edge zone docks it into the shown right dock; the left one opens the left dock.
    expect(c.dropTarget(1195, 30, 'comm')).toMatchObject({ kind: 'dock', dock: 'right', index: 0, open: false });
    expect(c.dropTarget(5, 400, 'comm')).toMatchObject({ kind: 'dock', dock: 'left', open: true });
    // Its own place is no move.
    expect(c.dropTarget(800, 200, 'comm')).toBeNull();
    // A floating pane that is moved keeps its size.
    expect(c.dropTarget(400, 300, 'comm', { x: 2, y: 0 })).toEqual({ kind: 'float', rect: { x: 38, y: 15, w: 30, h: 12 } });
    // A smaller window clamps it; toggling it off and on keeps its rectangle.
    size.width = 800;
    c.scheduleRelayout();
    flush();
    expect(comm.el.style.left).toBe(`${(80 - 30) * 10}px`);
    settings.update({ panes: { comm: { on: false } } });
    flush();
    expect(comm.visible).toBe(false);
    settings.update({ panes: { comm: { on: true } } });
    flush();
    expect(settings.get().layout.floating.find((f) => f.id === 'comm')).toEqual({ id: 'comm', x: 80, y: 10, w: 30, h: 12 });
    expect(comm.visible).toBe(true);
  });
});
