// @vitest-environment happy-dom
import { legacySettings } from './legacy-defaults';
import { describe, expect, it } from 'vitest';
import { Cockpit } from '../../src/layout/cockpit';
import { PLATE_PAD, TITLE_SCALE, frameGeometry, frameHolePath, frameInset, frameLabel, framePlate, frameRimPath, frameSeams, frameThickness } from '../../src/panes/frame';
import { Bus } from '../../src/core/bus';
import type { ConnState } from '../../src/core/types';
import { createPaneContext, lazyDb } from '../../src/panes/context';
import { PaneShell } from '../../src/panes/pane';
import { SettingsStore } from '../../src/settings';
import { movePane, moveToNewLane, setLaneSize } from '../../src/layout/model';

describe('frame', () => {
  it('puts the label from the fourth cell, chopped before the top-right corner', () => {
    expect(frameLabel(20, 'Timers')).toBe(' Timers ');
    expect(frameLabel(7, 'Timers')).toBe(' Ti');
    expect(frameLabel(5, 'UI')).toBe(' ');
    expect(frameLabel(4, 'UI')).toBe('');
    expect(frameLabel(20, '')).toBe('');
  });

  it('puts an equal-thickness rim the same inset from every edge, a third of the cell height thick', () => {
    expect(frameGeometry({ x: 0, y: 0, w: 90, h: 85 }, 9, 17)).toEqual({ t: 6, l: 2, r: 2, top: 2, b: 2 });
    expect(frameGeometry({ x: 0, y: 0, w: 140, h: 280 }, 14, 28)).toEqual({ t: 9, l: 3, r: 3, top: 3, b: 3 });
    expect(frameGeometry({ x: 0, y: 0, w: 70, h: 120 }, 7, 12, 2)).toEqual({ t: 4, l: 1.5, r: 1.5, top: 1.5, b: 1.5 });
    // The default cell (Hack 17: 10 × 19): a 6 px rim, 2 px in from the edges (4 px between two frames, as in the mockup).
    expect(frameThickness(19)).toBe(6);
    expect(frameInset(10, 19)).toBeCloseTo(2.22, 2);
    expect(frameGeometry({ x: 400, y: 209, w: 200, h: 209 }, 10, 19)).toEqual({ t: 6, l: 2, r: 2, top: 2, b: 2 });
    // At least 1 px between the rim and the content cells.
    for (const [w, h] of [[9, 17], [10, 19], [7.2, 14], [6, 10], [12, 24]] as const) expect(frameInset(w, h) + frameThickness(h) / 1).toBeLessThanOrEqual(w - 1 + 1e-9);
  });

  it('snaps every edge of the rim to a whole device pixel of the page, at any position and ratio', () => {
    for (const dpr of [1, 1.25, 1.5, 1.75, 2, 3]) {
      for (const [cw, chh] of [
        [9.03125, 17],
        [8.8, 17.6],
        [7.2, 14],
      ] as const) {
        for (const [col, row, w, h] of [
          [0, 0, 33, 11],
          [67, 12, 33, 20],
          [101, 3, 7, 5],
        ] as const) {
          const box = { x: 3 + col * cw, y: 0.6 + row * chh, w: w * cw, h: h * chh };
          const g = frameGeometry(box, cw, chh, dpr);
          const whole = (v: number): void => expect(Math.abs(v * dpr - Math.round(v * dpr))).toBeLessThan(1e-3);
          whole(g.t);
          whole(box.x + g.l);
          whole(box.x + box.w - g.r);
          whole(box.y + g.top);
          whole(box.y + box.h - g.b);
          // Inside the outer cells, the same inset on every side (within the snapping).
          const i = frameInset(cw, chh, dpr);
          for (const [ins, cell] of [
            [g.l, cw],
            [g.r, cw],
            [g.top, chh],
            [g.b, chh],
          ] as const) {
            expect(ins).toBeGreaterThanOrEqual(0);
            expect(ins + g.t).toBeLessThanOrEqual(cell);
            expect(Math.abs(ins - i)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
          }
        }
      }
    }
  });
});

describe('frame nameplate', () => {
  it('hangs the plate from the rim round the title from the fourth cell, every edge on a device pixel', () => {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      for (const [cw, chh] of [
        [10, 19],
        [9.03125, 17],
        [7.2, 14],
      ] as const) {
        const box = { x: 3 + 40 * cw, y: 0.6 + 7 * chh, w: 33 * cw, h: 12 * chh };
        const g = frameGeometry(box, cw, chh, dpr);
        const p = framePlate(box, g, cw, chh, ' Character '.length, dpr)!;
        expect(p).not.toBeNull();
        const whole = (v: number): void => expect(Math.abs(v * dpr - Math.round(v * dpr))).toBeLessThan(1e-3);
        whole(box.x + g.l + p.x0);
        whole(box.x + g.l + p.x1);
        whole(box.y + g.top + p.y0);
        whole(box.y + g.top + p.y1);
        whole(p.r);
        // its sides PLATE_PAD title advances outside the label's spaces, the same either side
        const s = cw * TITLE_SCALE, xt = box.x + 3 * cw;
        const left = xt - (box.x + g.l + p.x0), right = box.x + g.l + p.x1 - (xt + 11 * s);
        expect(Math.abs(left - PLATE_PAD * s)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
        expect(Math.abs(right - PLATE_PAD * s)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
        // under the rim's lip at the top, hanging below the rim, clear of the first content row
        expect(p.y0).toBeGreaterThan(0);
        expect(p.y0).toBeLessThan(g.t);
        expect(p.y1).toBeGreaterThan(g.t + p.r);
        expect(g.top + p.y1).toBeLessThan(chh);
      }
    }
  });

  it('has no plate without a title or room for one; it stays clear of the corners', () => {
    const box = { x: 0, y: 0, w: 90, h: 85 };
    const g = frameGeometry(box, 9, 17);
    expect(framePlate(box, g, 9, 17, 0)).toBeNull();
    expect(framePlate(box, g, 9, 17, 1)).toBeNull();
    // a long title clamps clear of the right corner: the fillet and a px of rim before it
    const narrow = { x: 0, y: 0, w: 63, h: 85 };
    const gn = frameGeometry(narrow, 9, 17);
    const pn = framePlate(narrow, gn, 9, 17, 12)!;
    expect(63 - 2 - 2 - 6 - pn.x1).toBe(pn.r + 1);
  });

  it('cuts the plate and its fillets out of the hole; the rim is the outer edge and the hole', () => {
    const p = { x0: 24, x1: 63, y0: 2, y1: 15, r: 4 };
    expect(frameHolePath(86, 81, 6, null)).toBe('M6 6H80V75H6Z');
    expect(frameHolePath(86, 81, 6, p)).toBe('M6 6H20A4 4 0 0 1 24 10V11A4 4 0 0 0 28 15H59A4 4 0 0 0 63 11V10A4 4 0 0 1 67 6H80V75H6Z');
    expect(frameHolePath(86, 81, 6, null, -6, -6)).toBe('M0 0H74V69H0Z');
    expect(frameRimPath(86, 81, 6, null)).toBe('M4 0H82A4 4 0 0 1 86 4V77A4 4 0 0 1 82 81H4A4 4 0 0 1 0 77V4A4 4 0 0 1 4 0ZM6 6H80V75H6Z');
    // The seam: dark left, top and round the plate; light the plate's bottom, right and bottom.
    const s = frameSeams(86, 81, 6, p);
    expect(s.dark).toBe('M6 75V6H20A4 4 0 0 1 24 10V11A4 4 0 0 0 28 15M59 15A4 4 0 0 0 63 11V10A4 4 0 0 1 67 6H80');
    expect(s.light).toBe('M28 15H59M80 6V75H6');
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
    expect(p.el.querySelector('.wc-pane-frame')!.textContent).toBe(' Comm ');
    expect(p.el.hasAttribute('data-framed')).toBe(true);
    expect(p.el.style.getPropertyValue('--frame-t')).toBe('6px');
    expect(['l', 'r', 'top', 'b'].map((k) => p.el.style.getPropertyValue(`--frame-${k}`))).toEqual(['2px', '2px', '2px', '2px']);
    // The nameplate for ' Comm ' (frame-box px), the fill's clip round it and the rim's clip.
    expect(['x0', 'x1', 'y0', 'y1', 'r'].map((k) => p.el.style.getPropertyValue(`--plate-${k}`))).toEqual(['24px', '63px', '2px', '13px', '3px']);
    const hole = 'M6 6H21A3 3 0 0 1 24 9V10A3 3 0 0 0 27 13H60A3 3 0 0 0 63 10V9A3 3 0 0 1 66 6H80V75H6Z';
    expect(p.el.style.getPropertyValue('--frame-hole')).toBe(`path("${hole}")`);
    const rim = p.el.querySelector<HTMLElement>('.wc-pane-rim')!;
    expect(rim.style.clipPath).toContain(hole);
    expect(rim.querySelector('.wc-seam-light')!.getAttribute('d')).toBe('M27 13H60M80 6V75H6');
    expect([p.cols, p.rows, p.visible]).toEqual([8, 3, true]);
    p.place({ rect, content: rect, framed: false }, { w: 9, h: 17 });
    expect(p.el.querySelector('.wc-pane-frame')!.textContent).toBe('');
    expect(p.el.hasAttribute('data-framed')).toBe(false);
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
    // The layout these tests were written for (before ADR 0078).
    settings.update((d) => {
      Object.assign(d, legacySettings());
    });
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
