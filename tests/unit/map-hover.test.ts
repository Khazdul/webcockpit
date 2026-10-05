// @vitest-environment happy-dom
// Map pane hover box (ADR 0077 §A): hit test, content (Minimal / Full),
// and the rest / long-press timing of MapHover.
import { describe, expect, it } from 'vitest';
import { DIR, DIR_COUNT, EXIT_FLAG, LOAD_FLAGS, MOB_FLAGS } from '../../src/map/model';
import { exitsText, flagsText, hoverInfo, roomAt } from '../../src/map/hover';
import { defaultView, pxPerRoom } from '../../src/map/view';
import { HOVER_REST_MS, LONG_PRESS_MS, MapHover, hoverLines } from '../../src/panes/map-hover';
import { gridMap } from './map-grid';

describe('hover hit test and content', () => {
  const map = gridMap(3, 3, { note: (i) => (i === 4 ? 'Herb: thyme\nHerb: rosemary\n' : '') });

  it('finds the room under a point on the current layer, with its square', () => {
    // Centre on room 4 (1, 1); 44 px per room at zoom 1 on layer 0.
    const v = { ...defaultView(), x: 1.5, y: 1.5 };
    const s = pxPerRoom(1, 0);
    const hit = roomAt(map, v, 200, 100, 100, 50);
    expect(hit?.room).toBe(4);
    expect(hit?.rect).toEqual({ x: 100 - s / 2, y: 50 - s / 2, w: s, h: s });
    // One room east (x + s) and one north (y - s, +y is up).
    expect(roomAt(map, v, 200, 100, 100 + s, 50)?.room).toBe(5);
    expect(roomAt(map, v, 200, 100, 100, 50 - s)?.room).toBe(7);
    expect(roomAt(map, v, 200, 100, 100 + 3 * s, 50)).toBeNull();
    expect(roomAt(map, { ...v, layer: 1 }, 200, 100, 100, 50)).toBeNull();
  });

  it('Minimal: name and note; Full: description, exits with doors, flags in words; never area or terrain', () => {
    const m = gridMap(3, 3, { note: (i) => (i === 4 ? 'Herb: thyme\n' : '') });
    m.areas[4] = 'Bree';
    const door = 4 * DIR_COUNT + DIR.S;
    m.exitFlags[door] = m.exitFlags[door]! | EXIT_FLAG.DOOR;
    m.mobFlags[4] = 1 << MOB_FLAGS.indexOf('aggressive_mob');
    m.loadFlags[4] = (1 << LOAD_FLAGS.indexOf('herb')) | (1 << LOAD_FLAGS.indexOf('water'));
    expect(hoverInfo(m, 4, false)).toEqual({ name: 'Room 4', note: 'Herb: thyme\n' });
    const full = hoverInfo(m, 4, true);
    expect(full).toEqual({
      name: 'Room 4',
      note: 'Herb: thyme\n',
      desc: 'The plain room number 4.\n',
      exits: 'Exits: n [s] e w',
      flags: 'aggressive mob, water, herb',
    });
    expect(JSON.stringify(full)).not.toMatch(/Bree|field/);
    expect(exitsText(m, 0)).toBe('Exits: n e');
    expect(flagsText(m, 0)).toBe('');
    expect(hoverLines(full)).toEqual([
      ['Room 4', 'wc-map-hover-name'],
      ['The plain room number 4.', 'wc-map-hover-desc'],
      ['Exits: n [s] e w', 'wc-map-hover-exits'],
      ['aggressive mob, water, herb', 'wc-map-hover-flags'],
      ['Herb: thyme', 'wc-map-hover-note'],
    ]);
    expect(hoverLines(hoverInfo(map, 4, false)).map((l) => l[0])).toEqual(['Room 4', 'Herb: thyme', 'Herb: rosemary']);
  });
});

function harness(enabled = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const asks: Array<[number, number]> = [];
  const h = new MapHover({
    doc: document,
    host,
    enabled: () => enabled,
    ask: (x, y) => {
      asks.push([x, y]);
      return asks.length;
    },
    setTimer: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => void ((t as { live: boolean }).live = false),
  });
  const fire = () => {
    for (const t of timers.splice(0)) if (t.live) t.fn();
  };
  const live = () => timers.filter((t) => t.live);
  const box = () => host.querySelector<HTMLElement>('.wc-map-hover');
  const info = { name: 'Old East Road', note: 'Herb: thyme\n' };
  const rect = { x: 0, y: 0, w: 44, h: 44 };
  return { h, host, asks, fire, live, box, info, rect };
}

describe('MapHover', () => {
  it('asks after the pointer rests for 3 s, shows the box and hides it off the room', () => {
    const t = harness();
    t.h.move(10, 10, 0);
    expect(t.live().map((x) => x.ms)).toEqual([HOVER_REST_MS]);
    t.h.move(12, 11, 0); // inside the slop: same rest
    expect(t.live()).toHaveLength(1);
    t.fire();
    expect(t.asks).toEqual([[10, 10]]);
    t.h.answer(1, 3, t.rect, t.info);
    expect(t.h.shown).toBe(true);
    expect([...t.box()!.children].map((c) => c.textContent)).toEqual(['Old East Road', 'Herb: thyme']);
    expect(t.box()!.getAttribute('role')).toBe('tooltip');
    t.h.move(30, 30, 0); // still on the room
    expect(t.h.shown).toBe(true);
    expect(t.live()).toHaveLength(0);
    t.h.move(50, 30, 0); // off the room: hidden, a new rest starts
    expect(t.h.shown).toBe(false);
    expect(t.live()).toHaveLength(1);
  });

  it('moving, a button, a stale answer or a cancel never shows the box', () => {
    const t = harness();
    t.h.move(10, 10, 0);
    t.h.move(40, 10, 0); // a real move restarts the rest
    expect(t.live()).toHaveLength(1);
    t.fire();
    t.h.move(80, 10, 0); // moved on before the answer
    t.h.answer(1, 3, t.rect, t.info);
    expect(t.h.shown).toBe(false);
    t.h.move(80, 10, 1); // a button: no rest
    expect(t.live()).toHaveLength(0);
    t.h.move(90, 10, 0);
    t.fire();
    t.h.cancel();
    t.h.answer(2, 3, t.rect, t.info);
    expect(t.h.shown).toBe(false);
    t.h.move(5, 5, 0);
    t.fire();
    t.h.answer(3, null, undefined, undefined); // no room there
    expect(t.h.shown).toBe(false);
  });

  it('touch: a long press shows the box, the next press hides it; a move cancels the press', () => {
    const t = harness();
    t.h.press(20, 20, true);
    expect(t.live().map((x) => x.ms)).toEqual([LONG_PRESS_MS]);
    t.h.pressMove(30, 20); // beyond the slop: a pan
    expect(t.live()).toHaveLength(0);
    t.h.release();
    t.h.press(20, 20, true);
    t.h.pressMove(22, 21);
    t.fire();
    t.h.answer(1, 3, t.rect, t.info);
    t.h.release();
    expect(t.h.shown).toBe(true);
    t.h.press(100, 100, false); // a second finger / next tap
    expect(t.h.shown).toBe(false);
    // The answer may come after the finger lifted.
    t.h.press(20, 20, true);
    t.fire();
    t.h.release();
    t.h.answer(2, 3, t.rect, t.info);
    expect(t.h.shown).toBe(true);
  });

  it('Off: no timer is armed and no box shows, by mouse or by touch', () => {
    const t = harness(false);
    t.h.move(10, 10, 0);
    t.h.move(40, 40, 0);
    t.h.press(20, 20, true);
    expect(t.live()).toHaveLength(0);
    t.fire();
    expect(t.asks).toEqual([]);
    t.h.answer(1, 3, t.rect, t.info);
    expect(t.h.shown).toBe(false);
    expect(t.box()).toBeNull();
  });
});
