// The desktop lens of a shared run (src/player/desk-lens.ts, ADR 0160): its
// default place, the clamp into the player, the rim's cursor, and where
// Group and Timers float; and the phone layer's settings of a shared run
// (src/app/player-host.ts `sharedPhoneSettings`).
import { describe, expect, it } from 'vitest';
import {
  DESK_CLEAR_RIGHT,
  DESK_KEY_OVER,
  DESK_LENS_DEFAULT_MAX,
  DESK_LENS_DEFAULT_MIN,
  DESK_LENS_MIN,
  deskLensBox,
  deskLensDefault,
  deskLensMax,
  deskLensSpotOf,
  deskPaneRects,
  deskPanesLayout,
  rimCursor,
} from '../../src/player/desk-lens';
import { sharedPhoneSettings } from '../../src/app/player-host';
import { defaultSettings } from '../../src/settings';
import { dockPanes } from '../../src/layout/types';

describe('desk lens: place and size', () => {
  it('opens at the top right, under the header row, a third of the short side within its limits', () => {
    const d = deskLensDefault(1376, 850, 17);
    expect(d.size).toBe(Math.round(850 * 0.32));
    expect(d.right).toBe(DESK_CLEAR_RIGHT + DESK_KEY_OVER);
    expect(d.top).toBeGreaterThan(17);
    expect(deskLensDefault(400, 300, 17).size).toBe(DESK_LENS_DEFAULT_MIN);
    expect(deskLensDefault(3000, 2000, 17).size).toBe(DESK_LENS_DEFAULT_MAX);
  });

  it('keeps the box and its keys inside the cockpit, and the size within its limits', () => {
    const W = 1000;
    const H = 700;
    expect(deskLensBox({ right: 34, top: 30, size: 260 }, W, H)).toEqual({ left: W - 34 - 260, top: 30, size: 260 });
    // Dragged past the left and the bottom edges: back inside, with the keys' overhang.
    expect(deskLensBox({ right: 5000, top: 5000, size: 260 }, W, H)).toEqual({ left: DESK_KEY_OVER, top: H - 260 - DESK_KEY_OVER, size: 260 });
    // Past the right and the top edges.
    expect(deskLensBox({ right: -400, top: -50, size: 260 }, W, H)).toEqual({ left: W - 260 - DESK_KEY_OVER, top: DESK_KEY_OVER, size: 260 });
    expect(deskLensBox({ right: 0, top: 0, size: 10 }, W, H).size).toBe(DESK_LENS_MIN);
    expect(deskLensBox({ right: 0, top: 0, size: 5000 }, W, H).size).toBe(deskLensMax(W, H));
    expect(deskLensMax(W, H)).toBeLessThanOrEqual(H - 2 * DESK_KEY_OVER);
  });

  it('turns a box back into its spot', () => {
    const box = deskLensBox({ right: 40, top: 60, size: 300 }, 1200, 800);
    expect(deskLensBox(deskLensSpotOf(box, 1200), 1200, 800)).toEqual(box);
  });

  it('shows the resize cursor along the radius', () => {
    expect(rimCursor(10, 0)).toBe('ew-resize');
    expect(rimCursor(-10, 1)).toBe('ew-resize');
    expect(rimCursor(0, 10)).toBe('ns-resize');
    expect(rimCursor(0, -10)).toBe('ns-resize');
    expect(rimCursor(10, 10)).toBe('nwse-resize');
    expect(rimCursor(-10, -10)).toBe('nwse-resize');
    expect(rimCursor(10, -10)).toBe('nesw-resize');
    expect(rimCursor(-10, 10)).toBe('nesw-resize');
  });
});

describe('desk lens: Group and Timers float at the bottom right', () => {
  it('puts Timers above Group with a row of air, the same height, at the right edge above the control box', () => {
    const r = deskPaneRects(160, 44, 4, true);
    expect(r.group.x + r.group.w).toBe(158);
    expect(r.group.y + r.group.h).toBe(40);
    expect(r.timers.y + r.timers.h + 1).toBe(r.group.y);
    expect(r.timers.h).toBe(r.group.h);
    expect(r.timers.x).toBe(r.group.x);
    expect(r.group.w).toBeGreaterThanOrEqual(30);
  });

  it('puts Timers at the bottom while Group is off', () => {
    const r = deskPaneRects(160, 44, 4, false);
    expect(r.timers.y + r.timers.h).toBe(40);
  });

  it('keeps a row of air under the lens, both giving up rows alike', () => {
    const free = deskPaneRects(160, 44, 4, true);
    const under = deskPaneRects(160, 44, 4, true, 20);
    expect(under.timers.y).toBeGreaterThanOrEqual(21);
    expect(under.timers.h).toBe(under.group.h);
    expect(under.group.h).toBeLessThan(free.group.h);
    expect(under.timers.y + under.timers.h + 1).toBe(under.group.y);
  });

  it('lets the air go before the floats shrink below their least', () => {
    // 44 - 4 - 29 = 11 rows: two of 5 and one row between, none under the lens.
    const r = deskPaneRects(160, 44, 4, true, 29);
    expect(r.group.h).toBe(5);
    expect(r.timers.h).toBe(5);
    expect(r.timers.y).toBe(29);
    expect(r.timers.y + r.timers.h + 1).toBe(r.group.y);
  });

  it('takes the two out of the docks and floats them, the rest as it was', () => {
    const layout = defaultSettings().layout;
    const out = deskPanesLayout(layout, deskPaneRects(160, 44, 4, true));
    const docked = Object.values(out.docks).flatMap((d) => dockPanes(d).map((p) => p.id));
    expect(docked).not.toContain('group');
    expect(docked).not.toContain('timers');
    expect(out.floating.filter((f) => f.id === 'group' || f.id === 'timers').map((f) => f.id)).toEqual(['group', 'timers']);
    // Every built-in pane is still in the layout exactly once.
    const all = [...docked, ...out.floating.map((f) => f.id)];
    for (const id of ['character', 'timers', 'group', 'comm', 'ui', 'map', 'statistics']) expect(all.filter((x) => x === id)).toHaveLength(1);
    // The input is not changed.
    expect(Object.values(layout.docks).flatMap((d) => dockPanes(d).map((p) => p.id))).toContain('group');
  });
});

describe('a shared run on a phone', () => {
  it('shows the lens and has Group and Timers as the strip\'s pages, in that order', () => {
    const s = defaultSettings();
    s.phone.lens.show = false;
    sharedPhoneSettings(s);
    expect(s.phone.lens.show).toBe(true);
    expect(s.phone.strip.panes.filter((e) => e.on).map((e) => e.id)).toEqual(['group', 'timers']);
  });
});
