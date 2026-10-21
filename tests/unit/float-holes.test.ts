// @vitest-environment happy-dom
// Holes under floating panes (src/layout/float-holes.ts; ADR 0091 item 57,
// ADR 0095 round 1): glass floats with weather on, clear floats always but
// only in the game text and the input line.
import { describe, expect, it } from 'vitest';
import { floatHoles } from '../../src/layout/float-holes';

type Box = { x: number; y: number; w: number; h: number };

/** A cockpit with the game pane, the input line, a docked pane and floats, each at `box` (stubbed rects). */
function rig(floats: { box: Box; clear?: boolean; z?: number }[]) {
  const root = document.createElement('div');
  const place = (el: HTMLElement, b: Box) => {
    el.getBoundingClientRect = () => ({ left: b.x, top: b.y, width: b.w, height: b.h, right: b.x + b.w, bottom: b.y + b.h, x: b.x, y: b.y, toJSON() {} }) as DOMRect;
  };
  place(root, { x: 0, y: 0, w: 1000, h: 800 });
  const add = (cls: string, b: Box): HTMLElement => {
    const el = document.createElement('div');
    el.className = cls;
    place(el, b);
    root.append(el);
    return el;
  };
  const game = add('wc-game', { x: 0, y: 0, w: 600, h: 780 });
  const input = add('wc-input-slot', { x: 0, y: 780, w: 600, h: 20 });
  const docked = add('wc-pane wc-pane-comm', { x: 600, y: 0, w: 400, h: 800 });
  const fl = floats.map((f, i) => {
    const el = add('wc-pane wc-pane-f' + i, f.box);
    el.setAttribute('data-floating', '');
    el.style.zIndex = String(10 + (f.z ?? i));
    if (f.clear) el.setAttribute('data-clear', '');
    return el;
  });
  return { root, game, input, docked, fl, holes: floatHoles(root) };
}

const clip = (el: HTMLElement) => el.style.getPropertyValue('clip-path');

describe('floatHoles', () => {
  it('weather off: a glass float cuts nothing; a clear one cuts the game text and the input line only', () => {
    const glass = rig([{ box: { x: 500, y: 700, w: 200, h: 100 } }]);
    glass.holes.sync();
    expect([clip(glass.game), clip(glass.input), clip(glass.docked)]).toEqual(['', '', '']);
    expect(glass.fl[0]!.hasAttribute('data-weather-see')).toBe(false);

    const clear = rig([{ box: { x: 500, y: 700, w: 200, h: 100 }, clear: true }]);
    clear.holes.sync();
    expect(clip(clear.game)).toBe('path(evenodd, "M-64 -64H664V844H-64ZM500 700H664V800H500Z")');
    expect(clip(clear.input)).toBe('path(evenodd, "M-64 -64H664V84H-64ZM500 -64H664V20H500Z")');
    // The docked pane under it shows through: no hole, no glass change.
    expect(clip(clear.docked)).toBe('');
    expect(clear.docked.hasAttribute('data-weather-under')).toBe(false);
  });

  it('weather on: a glass float cuts the game, the input and the panes below it, and is see-through; a clear one only the text', () => {
    const t = rig([
      { box: { x: 550, y: 100, w: 100, h: 100 } },
      { box: { x: 550, y: 300, w: 100, h: 100 }, clear: true },
    ]);
    t.root.setAttribute('data-weather', '');
    t.holes.sync();
    expect(clip(t.game)).toContain('M550 100H');
    expect(clip(t.game)).toContain('M550 300H');
    expect(clip(t.docked)).toContain('M-50 100H');
    expect(clip(t.docked)).not.toContain('300H');
    expect(t.docked.hasAttribute('data-weather-under')).toBe(true);
    expect(t.fl.map((f) => f.hasAttribute('data-weather-see'))).toEqual([true, true]);

    // Weather off again: only the clear float's holes stay, nothing is see-through.
    t.root.removeAttribute('data-weather');
    t.holes.sync();
    expect(clip(t.game)).not.toContain('M550 100H');
    expect(clip(t.game)).toContain('M550 300H');
    expect(clip(t.docked)).toBe('');
    expect(t.docked.hasAttribute('data-weather-under')).toBe(false);
    expect(t.fl.map((f) => f.hasAttribute('data-weather-see'))).toEqual([false, false]);
  });

  it('a clear float cuts no hole in a float below it; a glass float above a clear one does', () => {
    const t = rig([
      { box: { x: 100, y: 100, w: 200, h: 200 }, clear: true, z: 0 },
      { box: { x: 150, y: 150, w: 200, h: 200 }, z: 1 },
      { box: { x: 120, y: 120, w: 50, h: 50 }, clear: true, z: 2 },
    ]);
    t.root.setAttribute('data-weather', '');
    t.holes.sync();
    // The lowest (clear) gets the glass float's hole, not the top clear one's.
    expect(clip(t.fl[0]!)).toContain('M50 50H');
    expect(clip(t.fl[0]!)).not.toContain('M20 20H');
    expect(clip(t.fl[1]!)).toBe('');
  });
});
