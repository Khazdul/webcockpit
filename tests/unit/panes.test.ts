// @vitest-environment happy-dom
import { legacySettings } from './legacy-defaults';
import { describe, expect, it } from 'vitest';
import { Cockpit } from '../../src/layout/cockpit';
import { BRACKET, HOOD_MIN_COL, HOOD_PAD, HOOD_R, TITLE_TRACK, fitTitle, frameArm, frameGeometry, frameHolePath, frameInset, framePlate, frameRimPath, frameSeams, frameThickness, hoodRoom, titlePx } from '../../src/panes/frame';
import { estimateTitleWidth, titleWidth } from '../../src/panes/title-font';
import { Bus } from '../../src/core/bus';
import type { ConnState } from '../../src/core/types';
import { createPaneContext, lazyDb } from '../../src/panes/context';
import { PaneShell } from '../../src/panes/pane';
import { SettingsStore } from '../../src/settings';
import { barCells } from '../../src/menubar/menubar';
import { movePane, moveToNewLane, setLaneSize } from '../../src/layout/model';

describe('frame', () => {
  it('puts an equal-thickness band the same inset from every edge, the cell height over BAND_DIV thick', () => {
    expect(frameGeometry({ x: 0, y: 0, w: 90, h: 85 }, 9, 17)).toEqual({ t: 5, l: 2, r: 2, top: 2, b: 2 });
    expect(frameGeometry({ x: 0, y: 0, w: 140, h: 280 }, 14, 28)).toEqual({ t: 8, l: 3, r: 3, top: 3, b: 3 });
    expect(frameGeometry({ x: 0, y: 0, w: 70, h: 120 }, 7, 12, 2)).toEqual({ t: 3.5, l: 1.5, r: 1.5, top: 1.5, b: 1.5 });
    // The default cell (Hack 17: 10 × 19): a 5 px band (ADR 0123), 2 px in from the edges (4 px between two frames).
    expect(frameThickness(19)).toBe(5);
    expect(frameThickness(19, 2)).toBe(11);
    expect(frameInset(10, 19)).toBeCloseTo(2.22, 2);
    expect(frameGeometry({ x: 400, y: 209, w: 200, h: 209 }, 10, 19)).toEqual({ t: 5, l: 2, r: 2, top: 2, b: 2 });
    // At least 1 px between the band and the content cells.
    for (const [w, h] of [[9, 17], [10, 19], [7.2, 14], [6, 10], [12, 24]] as const) expect(frameInset(w, h) + frameThickness(h) / 1).toBeLessThanOrEqual(w - 1 + 1e-9);
    // The corner brackets' arms: BRACKET bands, whole device px.
    expect(frameArm({ t: 5, l: 2, r: 2, top: 2, b: 2 })).toBe(13);
    expect(frameArm({ t: 5.5, l: 2, r: 2, top: 2, b: 2 }, 2)).toBe(14.5);
    expect(frameArm({ t: 4.8, l: 2, r: 2, top: 2, b: 2 }, 1.25) * 1.25 % 1).toBe(0);
  });

  it('snaps every edge of the band to a whole device pixel of the page, at any position and ratio', () => {
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

describe('frame hood', () => {
  it('centres the hood on the frame, the label plus HOOD_PAD cells either side, every edge on a device pixel', () => {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      for (const [cw, chh] of [
        [10, 19],
        [9.03125, 17],
        [7.2, 14],
      ] as const) {
        for (const col of [40, 41, 7]) {
          for (const textW of [61.37, 40, 23.5]) {
            const box = { x: 3 + col * cw, y: 0.6 + 7 * chh, w: 33 * cw, h: 12 * chh };
            const g = frameGeometry(box, cw, chh, dpr);
            const p = framePlate(box, g, cw, chh, textW, dpr)!;
            expect(p).not.toBeNull();
            const whole = (v: number): void => expect(Math.abs(v * dpr - Math.round(v * dpr))).toBeLessThan(1e-3);
            const fx = box.x + g.l, fy = box.y + g.top, fw = box.w - g.l - g.r;
            whole(fx + p.x0);
            whole(fx + p.x1);
            whole(fy + p.y0);
            whole(fy + p.y1);
            whole(p.r);
            // Centred: the same space either side, to the device px.
            expect(Math.abs(p.x0 - (fw - p.x1))).toBeLessThan(1e-3);
            // As wide as the label and its padding, at most two device px more (rounding up, then even).
            const want = textW + 2 * HOOD_PAD * cw;
            expect(p.x1 - p.x0).toBeGreaterThanOrEqual(want - 1e-6);
            expect(p.x1 - p.x0).toBeLessThan(want + 2 / dpr + 1e-6);
            // From the frame's top edge, hanging below the band, clear of the first content row.
            expect(p.y0).toBe(0);
            expect(p.y1).toBeGreaterThan(g.t + p.r);
            expect(g.top + p.y1).toBeLessThan(chh);
            // Its lower corners rounded, the straight sides at least a device px below the band.
            expect(p.r).toBeGreaterThan(0);
            expect(p.r).toBeLessThanOrEqual(HOOD_R + 0.5 / dpr);
            // Clear of the corner brackets.
            expect(p.x0).toBeGreaterThan(BRACKET * g.t);
          }
        }
      }
    }
  });

  it('moves the hood left of the hover buttons when they would reach it, down to the fourth cell (ADR 0123 "Hood position")', () => {
    for (const dpr of [1, 1.25, 2]) {
      for (const [cw, chh] of [
        [10, 19],
        [9.03125, 17],
      ] as const) {
        for (const col of [40, 41, 7]) {
          const textW = 50.3;
          const whole = (v: number): void => expect(Math.abs(v * dpr - Math.round(v * dpr))).toBeLessThan(1e-3);
          const at = (cells: number, clear: number, wide = false) => {
            const box = { x: 3 + col * cw, y: 0.6 + 7 * chh, w: cells * cw, h: 12 * chh };
            const g = frameGeometry(box, cw, chh, dpr);
            const tw = wide ? hoodRoom(box, g, cw) : textW;
            const c = framePlate(box, g, cw, chh, tw, dpr)!;
            const p = framePlate(box, g, cw, chh, tw, dpr, clear)!;
            expect(c).not.toBeNull();
            expect(p).not.toBeNull();
            const fx = box.x + g.l, fw = box.w - g.l - g.r;
            for (const v of [p.x0, p.x1]) whole(fx + v);
            // The same hood, only moved: width, depth and corners.
            expect(p.x1 - p.x0).toBeCloseTo(c.x1 - c.x0, 3);
            expect([p.y0, p.y1, p.r]).toEqual([c.y0, c.y1, c.r]);
            // Never right of centre.
            expect(p.x0).toBeLessThanOrEqual(c.x0 + 1e-6);
            return { box, g, c, p, fw };
          };
          // Room enough: centred, as without buttons.
          {
            const { c, p, fw } = at(40, 40 * cw - 12 * cw);
            expect(p).toEqual(c);
            expect(Math.abs(p.x0 - (fw - p.x1))).toBeLessThan(1e-3);
          }
          // 25 cells, the four buttons and the cross in the last twelve: moved left just enough, its right
          // edge on the device px at or before where they begin.
          {
            const clear = 25 * cw - 12 * cw;
            const { g, c, p } = at(25, clear);
            expect(p.x0).toBeLessThan(c.x0);
            expect(g.l + p.x1).toBeLessThanOrEqual(clear + 1e-6);
            expect(g.l + p.x1).toBeGreaterThan(clear - 1 / dpr - 1e-6);
            expect(g.l + p.x0).toBeGreaterThan(HOOD_MIN_COL * cw);
          }
          // 18 cells: they would reach it even at its leftmost; it stops at the fourth cell, clear of the bracket.
          {
            const clear = 18 * cw - 12 * cw;
            const { g, p } = at(18, clear);
            expect(g.l + p.x1).toBeGreaterThan(clear);
            expect(Math.abs(g.l + p.x0 - HOOD_MIN_COL * cw)).toBeLessThanOrEqual(0.5 / dpr + 1e-6);
            expect(p.x0).toBeGreaterThan(BRACKET * g.t + cw - 1e-6);
          }
          // A hood so wide on its pane that, centred, it begins left of the fourth cell: it stays centred.
          {
            const { g, c, p } = at(14, 0, true);
            expect(g.l + c.x0).toBeLessThan(HOOD_MIN_COL * cw);
            expect(p).toEqual(c);
          }
        }
      }
    }
  });

  it('has no hood without a label or room for one; the label is shortened to fit', () => {
    const box = { x: 0, y: 0, w: 300, h: 85 };
    const g = frameGeometry(box, 10, 19);
    expect(framePlate(box, g, 10, 19, 0)).toBeNull();
    const room = hoodRoom(box, g, 10);
    // 296 px of frame less two brackets (13) and a cell each, and the hood's padding.
    expect(room).toBeCloseTo(296 - 2 * (13 + 10) - 2 * HOOD_PAD * 10, 6);
    expect(framePlate(box, g, 10, 19, room)).not.toBeNull();
    expect(framePlate(box, g, 10, 19, room + 0.5)).toBeNull();
    // A narrow pane has no room: no hood.
    const narrow = { x: 0, y: 0, w: 70, h: 85 };
    expect(hoodRoom(narrow, frameGeometry(narrow, 10, 19), 10)).toBe(0);
    // fitTitle: whole when it fits, else shortened with an ellipsis, never under two letters.
    const m = (s: string): number => [...s].length * 10;
    expect(fitTitle(' Character ', 100, m)).toBe('Character');
    expect(fitTitle('Character', 60, m)).toBe('Chara…');
    expect(fitTitle('Character', 30, m)).toBe('Ch…');
    expect(fitTitle('Character', 29, m)).toBe('');
    expect(fitTitle('', 100, m)).toBe('');
    expect(fitTitle('UI', 0, m)).toBe('');
  });

  it('cuts the hood out of the hole; the band is the outer edge and the hole', () => {
    const p = { x0: 24, x1: 63, y0: 0, y1: 15, r: 6 };
    expect(frameHolePath(86, 81, 5, null)).toBe('M5 5H81V76H5Z');
    expect(frameHolePath(86, 81, 5, p)).toBe('M5 5H24V9A6 6 0 0 0 30 15H57A6 6 0 0 0 63 9V5H81V76H5Z');
    expect(frameHolePath(86, 81, 5, null, -5, -5)).toBe('M0 0H76V71H0Z');
    expect(frameRimPath(86, 81, 5, null)).toBe('M3 0H83A3 3 0 0 1 86 3V78A3 3 0 0 1 83 81H3A3 3 0 0 1 0 78V3A3 3 0 0 1 3 0ZM5 5H81V76H5Z');
    // A hood shallower than its radius: the corners take what there is.
    expect(frameHolePath(86, 81, 5, { ...p, y1: 9 })).toBe('M5 5H24V5A4 4 0 0 0 28 9H59A4 4 0 0 0 63 5V5H81V76H5Z');
    // The seam: dark left, top and all round the hood; light right and bottom.
    const s = frameSeams(86, 81, 5, p);
    expect(s.dark).toBe('M5 76V5H24V9A6 6 0 0 0 30 15H57A6 6 0 0 0 63 9V5H81');
    expect(s.light).toBe('M81 5V76H5');
  });

  it('measures the title in its own font (an estimate until the face loads)', () => {
    expect(titlePx(19)).toBe(11.75);
    expect(titlePx(17)).toBe(10.5);
    expect(estimateTitleWidth('', 12)).toBe(0);
    expect(estimateTitleWidth('Comm', 10)).toBeCloseTo(10 * (4 * 0.66 + 3 * TITLE_TRACK), 6);
    // happy-dom loads no face: the estimate.
    expect(titleWidth(document, 'Comm', 10)).toBeCloseTo(estimateTitleWidth('Comm', 10), 6);
  });
});

describe('PaneShell', () => {
  it('places itself in cells, draws the frame and reports its inner size', () => {
    const p = new PaneShell(createPaneContext({ doc: document }), 'comm');
    const sizes: [number, number][] = [];
    p.onResize((c, r) => sizes.push([c, r]));
    const rect = { x: 2, y: 3, w: 20, h: 5 };
    p.place({ rect, content: { x: 3, y: 4, w: 18, h: 3 }, framed: true }, { w: 9, h: 17 });
    expect(p.el.hidden).toBe(false);
    expect(p.el.style.left).toBe('18px');
    expect(p.el.style.top).toBe('51px');
    expect(p.el.style.width).toBe('180px');
    expect(p.content.style.left).toBe('9px');
    expect(p.content.style.height).toBe('51px');
    expect(p.el.querySelector('.wc-pane-frame')!.textContent).toBe('Comm');
    expect(p.el.hasAttribute('data-framed')).toBe(true);
    expect(p.el.querySelector('.wc-pane-blur')).toBeNull();
    expect(p.el.style.getPropertyValue('--frame-t')).toBe('5px');
    expect(p.el.style.getPropertyValue('--frame-arm')).toBe('13px');
    expect(p.el.style.getPropertyValue('--title-px')).toBe('10.5px');
    expect(['l', 'r', 'top', 'b'].map((k) => p.el.style.getPropertyValue(`--frame-${k}`))).toEqual(['2px', '2px', '2px', '2px']);
    // The hood for 'Comm' (the estimate: 30.24 px) centred on the 176 px frame (frame-box px), the window's clip round it and the band's.
    expect(['x0', 'x1', 'y0', 'y1', 'r'].map((k) => p.el.style.getPropertyValue(`--plate-${k}`))).toEqual(['60px', '116px', '0px', '12px', '6px']);
    expect(p.titleEnd).toBe(118);
    const hole = 'M5 5H60V6A6 6 0 0 0 66 12H110A6 6 0 0 0 116 6V5H171V76H5Z';
    expect(p.el.style.getPropertyValue('--frame-hole')).toBe(`path("${hole}")`);
    expect(p.el.style.getPropertyValue('--frame-window')).toBe('path("M0 0H55V1A6 6 0 0 0 61 7H105A6 6 0 0 0 111 1V0H166V71H0Z")');
    const rim = p.el.querySelector<HTMLElement>('.wc-pane-rim')!;
    expect(rim.style.clipPath).toContain(hole);
    expect(rim.querySelector('.wc-seam-light')!.getAttribute('d')).toBe('M171 5V76H5');
    expect([p.cols, p.rows, p.visible]).toEqual([18, 3, true]);
    // Too narrow for a hood: no title.
    p.place({ rect: { ...rect, w: 8 }, content: { x: 3, y: 4, w: 6, h: 3 }, framed: true }, { w: 9, h: 17 });
    expect(p.el.querySelector('.wc-pane-frame')!.textContent).toBe('');
    expect(p.el.style.getPropertyValue('--plate-x0')).toBe('');
    expect(p.titleEnd).toBe(0);
    p.place({ rect, content: rect, framed: false }, { w: 9, h: 17 });
    expect(p.el.querySelector('.wc-pane-frame')!.textContent).toBe('');
    expect(p.el.hasAttribute('data-framed')).toBe(false);
    p.place(null, { w: 9, h: 17 });
    expect(p.el.hidden).toBe(true);
    expect(sizes).toEqual([
      [18, 3],
      [6, 3],
      [20, 5],
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
    const flush = () => {
      while (frames.length) frames.shift()!();
    };
    // The desktop menu bar's width (ADR 0102 decides the input row's case with it); the first layout.
    c.setBarCells(barCells(true));
    flush();
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

  it('hover buttons (ADR 0095): Colour, Border, Background before the cross; each click changes the setting and its label', () => {
    const { c, settings, flush } = make(1200, 1000);
    const el = c.pane('timers').el;
    const btns = [...el.querySelectorAll<HTMLElement>('.wc-pane-btn')];
    expect(btns.map((b) => b.dataset.look)).toEqual(['color', 'border', 'glass']);
    // In the DOM before the cross; slots 2, 1, 0 from it.
    expect(btns.at(-1)!.nextElementSibling).toBe(el.querySelector('.wc-pane-close'));
    expect(btns.map((b) => b.style.getPropertyValue('--slot'))).toEqual(['2', '1', '0']);
    expect(btns.map((b) => b.title)).toEqual(['Colour: Plain', 'Border: on', 'Background: glass']);
    expect(btns.map((b) => b.getAttribute('aria-label'))).toEqual(['Colour: Plain', 'Border: on', 'Background: glass']);
    expect(btns.map((b) => b.getAttribute('role'))).toEqual(['button', 'button', 'button']);
    btns[0]!.click();
    flush();
    expect(settings.get().panes.timers.color).toBe('red');
    expect(btns[0]!.title).toBe('Colour: Red');
    btns[1]!.click();
    flush();
    expect(settings.get().panes.timers.border).toBe(false);
    expect(btns[1]!.title).toBe('Border: off');
    expect(btns[1]!.hasAttribute('data-on')).toBe(false);
    expect(el.hasAttribute('data-framed')).toBe(false);
    btns[2]!.click();
    flush();
    expect(settings.get().panes.timers).toEqual({ on: true, color: 'red', border: false, glass: false });
    expect(btns[2]!.title).toBe('Background: clear');
    expect(el.hasAttribute('data-clear')).toBe(true);
    // Purple wraps to Plain.
    settings.update({ panes: { timers: { color: 'purple' } } });
    flush();
    btns[0]!.click();
    expect(settings.get().panes.timers.color).toBe('black');
  });

  it('a press on a hover button keeps the focus and starts no drag (ADR 0095)', () => {
    const { c } = make(1200, 1000);
    const b = c.pane('group').el.querySelector<HTMLElement>('.wc-pane-btn-border')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    b.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 1100, clientY: 5 }));
    expect(c.dragging).toBe(false);
  });

  it('a narrow pane moves the hood left, then lays the buttons over it, and drops them, Colour first, only past its left end (ADR 0095, ADR 0123)', () => {
    const { c, settings, flush } = make(1200, 1000);
    const drops = () => [...c.pane('timers').el.querySelectorAll<HTMLElement>('.wc-pane-btn')].map((b) => b.hasAttribute('data-drop'));
    expect(drops()).toEqual([false, false, false]);
    // Two lanes: Timers in a narrower and narrower one.
    const seen = new Set<number>();
    const covered = new Set<string | null>();
    for (let w = 30; w >= 8; w--) {
      settings.update((d) => {
        d.layout = moveToNewLane(legacySettings().layout, 'timers', 'right', 1, w);
      });
      flush();
      const shell = c.pane('timers');
      const paneW = parseFloat(shell.el.style.width);
      const d = drops();
      const kept = d.filter((x) => !x).length;
      seen.add(kept);
      // From the left: dropped ones first, then the kept ones.
      expect(d).toEqual([...Array(3 - kept).fill(true), ...Array(kept).fill(false)]);
      // The leftmost kept button (two cells each, left of the cross's four) clears the hood's left end and
      // rivet (the label may be covered); one more would not have.
      const left = paneW - (4 + 2 * kept) * 10;
      if (kept) expect(left).toBeGreaterThanOrEqual(shell.titleKeep);
      if (kept < 3) expect(paneW - (4 + 2 * (kept + 1)) * 10).toBeLessThan(shell.titleKeep);
      // Over the hood: marked, the shelf from where the set begins (frame px).
      const cover = shell.el.getAttribute('data-hood-cover');
      covered.add(cover);
      if (shell.titleEnd > left) expect(parseFloat(shell.el.style.getPropertyValue('--cover-x'))).toBeCloseTo(left - parseFloat(shell.el.style.getPropertyValue('--frame-l')), 3);
      else expect(cover).toBeNull();
    }
    // (Under ten cells there is no hood, so nothing to keep clear: the cross and a button still fit.)
    expect([...seen].sort()).toEqual([1, 2, 3]);
    // Clear of the hood, over it with part of the label left, and over all of it.
    expect([...covered].sort()).toEqual(['', 'all', null].sort());
  });

  it('borderless (round 3): no name tag, nothing to keep clear: every button shows even in a narrow lane', () => {
    const { c, settings, flush } = make(1200, 1000);
    settings.update({ panes: { timers: { border: false } } });
    flush();
    const el = c.pane('timers').el;
    expect(el.hasAttribute('data-framed')).toBe(false);
    expect(c.el.querySelectorAll('.wc-pane-name, .wc-pane[data-tooltip]')).toHaveLength(0);
    const drops = () => [...el.querySelectorAll<HTMLElement>('.wc-pane-btn')].map((b) => b.hasAttribute('data-drop'));
    // A narrow lane: the pane is 9 + 3 cells wide at least, room for all three (the pure rule: pane-buttons.test.ts).
    settings.update((d) => {
      d.layout = moveToNewLane(legacySettings().layout, 'timers', 'right', 1, 2);
    });
    flush();
    expect(parseFloat(el.style.width)).toBeGreaterThanOrEqual(90);
    expect(drops()).toEqual([false, false, false]);
  });

  it('lays out the default in whole cells', () => {
    const { c } = make(1205, 1010); // 120 × 50 cells, 5 px / 10 px spare
    expect(c.el.dataset.cells).toBe('120x50');
    expect(c.gameEl.style.width).toBe('860px');
    expect(c.inputEl.style.top).toBe('980px');
    expect(c.inputEl.style.left).toBe('0px');
    // Wide case (ADR 0102): 86 − 2 − 26 = 58 cells to type, the input row as wide as the game pane.
    expect(c.layout!.inputSpan).toBe('game');
    expect(c.inputEl.style.width).toBe('860px');
    expect(c.pane('character').el.style.left).toBe('870px');
    expect(c.pane('character').rows).toBe(9);
    expect(c.pane('ui').rows).toBe(8); // the right column runs the full 50 rows
    const ui = c.pane('ui').el;
    expect(parseFloat(ui.style.top) + parseFloat(ui.style.height)).toBe(1000);
    expect(c.el.querySelectorAll('.wc-handle:not([data-border])')).toHaveLength(5); // dock gap + 4 boundaries
    // Each framed pane's border cell: 5 toward the game, 4 bottom borders above the next pane.
    expect(c.el.querySelectorAll('.wc-handle[data-border]')).toHaveLength(9);

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
    expect(c.pane('timers').rows + c.pane('comm').rows).toBe(44 - 9); // the rest of 50 rows shared without UI and Group
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
    // Wide case (ADR 0102): the right dock runs to the bottom, so its last row is
    // the dock's; the bottom zone's bar runs along the whole bottom edge (ADR 0101);
    // the left zone runs down to the bottom.
    expect(c.dropTarget(1000, 990, 'comm')).toMatchObject({ kind: 'dock', dock: 'right', index: 5 });
    expect(c.dropTarget(400, 990, 'comm')).toMatchObject({ dock: 'bottom', open: true, bar: { x: 0, w: 1200 } });
    expect(c.dropTarget(5, 990, 'comm')).toMatchObject({ dock: 'left', open: true, bar: { y: 0, h: 1000 } });
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

  it("follows the input row's case (ADR 0102): the input slot, the right dock, its gap handle, the edge zones", () => {
    const { c, settings, size, flush } = make(1200, 1000); // 120 × 50: a 86-cell game column, 58 to type
    const gap = () => c.el.querySelector<HTMLElement>('.wc-handle[data-dock="right"][data-axis="x"]:not([data-border])')!;
    const resize = (w: number) => {
      size.width = w;
      c.scheduleRelayout();
      flush();
    };
    // Wide: the input slot under the game pane, the right dock and its gap handle the full height.
    expect(c.layout!.inputSpan).toBe('game');
    expect(c.inputEl.style.width).toBe('860px');
    expect(c.layout!.docks.right!.rect.h).toBe(50);
    expect(gap().style.left).toBe('860px');
    expect(gap().style.height).toBe('1000px');
    // The right edge zone reaches the bottom row, which is the right dock's.
    expect(c.dropTarget(1195, 990, 'comm')).toMatchObject({ dock: 'right' });
    // 90 columns: a 56-cell game column, 28 to type: narrow (ADR 0101 geometry).
    resize(900);
    expect(c.layout!.inputSpan).toBe('screen');
    expect(c.inputEl.style.width).toBe('900px');
    expect(gap().style.height).toBe('980px');
    expect(c.dropTarget(895, 970, 'comm')).toMatchObject({ dock: 'right' });
    expect(c.dropTarget(895, 990, 'comm')).toMatchObject({ kind: 'dock', dock: 'bottom', open: true, bar: { x: 0, w: 900 } });
    // Without a bar the same column leaves 54 to type: wide again.
    c.setBarCells(0);
    flush();
    expect(c.layout!.inputSpan).toBe('game');
    expect(c.inputEl.style.width).toBe('560px');
    c.setBarCells(barCells(true));
    flush();
    // A hidden right dock: its edge bar follows the case it would open in (at its default size, 33).
    settings.update({ panes: { character: { on: false }, timers: { on: false }, group: { on: false }, comm: { on: false }, ui: { on: false } } });
    flush();
    expect(c.layout!.docks.right).toBeUndefined();
    expect(c.dropTarget(895, 970, 'map')).toMatchObject({ dock: 'right', open: true, bar: { y: 0, h: 980 } });
    expect(c.dropTarget(895, 990, 'map')).toMatchObject({ dock: 'bottom', open: true });
    resize(1200);
    expect(c.dropTarget(1195, 990, 'map')).toMatchObject({ dock: 'right', open: true, bar: { y: 0, h: 1000 } });
  });

  it('finds new-lane targets on the edge bands of a lane (ADR 0064)', () => {
    const { c, settings, flush } = make(1200, 1000); // 120 × 50, right dock x 87..119: bands 3 cells
    // The inner (left) band: a new lane inside lane 0; the outer band: at the screen edge.
    expect(c.dropTarget(880, 400, 'comm')).toMatchObject({ kind: 'lane', dock: 'right', at: 1, size: 33 });
    expect(c.dropTarget(1195, 400, 'comm')).toMatchObject({ kind: 'lane', dock: 'right', at: 0, size: 33 });
    // The bar runs along the whole lane boundary (wide case: the full height).
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
    // A 66-cell game column leaves 38 to type: the narrow case (ADR 0102), the dock ends above the input row.
    expect(c.layout!.inputSpan).toBe('screen');
    // Its last row: first in the tail spans.
    expect(c.dropTarget(760, 970, 'comm')).toMatchObject({ kind: 'span', side: 'tail', index: 0, ghost: { x: 67, w: 53 } });
    // The input row under it is not the dock's (ADR 0101): the bottom edge zone there.
    expect(c.dropTarget(760, 990, 'comm')).toMatchObject({ kind: 'dock', dock: 'bottom', open: true });
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
    flush(); // bottom dock x 0..119 (the full width, ADR 0101: strips 3 columns), rows 30..49
    const b = c.layout!.docks.bottom!;
    expect(b.rect).toMatchObject({ x: 0, w: 120, y: 30, h: 20 });
    expect(c.dropTarget(15, 900, 'group')).toMatchObject({ kind: 'span', dock: 'bottom', side: 'head', index: 0 });
    expect(c.dropTarget(15, 900, 'group')).toMatchObject({ ghost: { x: 0, y: 30, h: 20 } });
    expect(c.dropTarget(1175, 650, 'group')).toMatchObject({ kind: 'span', side: 'tail', index: 0 });
    // Under the right dock, short of the strip: the rows as before.
    expect(c.dropTarget(1000, 650, 'group')).toMatchObject({ kind: 'dock', dock: 'bottom' });
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
