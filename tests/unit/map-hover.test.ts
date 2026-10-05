// @vitest-environment happy-dom
// Map pane hover box (ADR 0077 §A and round 1): hit test, content
// (Minimal / Full as MMapper's room preview), placement, and the rest /
// long-press timing of MapHover.
import { describe, expect, it } from 'vitest';
import { DIR, DIR_COUNT, EXIT_FLAG, LOAD_FLAGS, MOB_FLAGS, SUNDEATH, TERRAIN, TERRAIN_ROAD } from '../../src/map/model';
import { exitsText, hoverInfo, roomAt } from '../../src/map/hover';
import { defaultView, pxPerRoom } from '../../src/map/view';
import { HOVER_REST_MS, LONG_PRESS_MS, MapHover, hoverLines, placeHoverBox } from '../../src/panes/map-hover';
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

  it('Minimal: name and note; Full: MMapper preview (desc, contents, exits, note); no flags, area or terrain', () => {
    const m = gridMap(3, 3, { note: (i) => (i === 4 ? 'Herb: thyme\n' : '') });
    m.areas[4] = 'Bree';
    m.contents[4] = 'A small dog is here.\nA lantern lies here.\n';
    m.descs[4] = 'The plain room\nnumber 4.\n';
    const door = 4 * DIR_COUNT + DIR.S;
    m.exitFlags[door] = m.exitFlags[door]! | EXIT_FLAG.DOOR;
    m.mobFlags[4] = 1 << MOB_FLAGS.indexOf('aggressive_mob');
    m.loadFlags[4] = (1 << LOAD_FLAGS.indexOf('herb')) | (1 << LOAD_FLAGS.indexOf('water'));
    expect(hoverInfo(m, 4, false)).toEqual({ name: 'Room 4', note: 'Herb: thyme\n' });
    const full = hoverInfo(m, 4, true);
    expect(full).toEqual({
      name: 'Room 4',
      note: 'Herb: thyme\n',
      desc: 'The plain room\nnumber 4.\n',
      contents: 'A small dog is here.\nA lantern lies here.\n',
      exits: 'Exits: north, {south}, east, west.',
    });
    expect(JSON.stringify(full)).not.toMatch(/Bree|field|aggressive|herb,|emulated/);
    expect(exitsText(m, 0)).toBe('Exits: north, east.');
    expect(hoverLines(full)).toEqual([
      ['Room 4', 'wc-map-hover-name'],
      ['The plain room number 4.', 'wc-map-hover-desc'],
      ['A small dog is here.', 'wc-map-hover-contents'],
      ['A lantern lies here.', 'wc-map-hover-contents'],
      ['Exits: north, {south}, east, west.', 'wc-map-hover-exits'],
      ['Herb: thyme', 'wc-map-hover-note', 'Note: '],
    ]);
    // A note of several lines: "Note:" on its row, each line under it.
    expect(hoverLines({ ...full, note: 'Herb: a\nHerb: b\n' }).slice(-3)).toEqual([
      ['', 'wc-map-hover-note', 'Note:'],
      ['  Herb: a', 'wc-map-hover-note'],
      ['  Herb: b', 'wc-map-hover-note'],
    ]);
    // Minimal: no label, the note lines as they are.
    expect(hoverLines(hoverInfo(map, 4, false))).toEqual([
      ['Room 4', 'wc-map-hover-name'],
      ['Herb: thyme', 'wc-map-hover-note'],
      ['Herb: rosemary', 'wc-map-hover-note'],
    ]);
  });

  it("writes the exits line as MMapper's displayExits: doors, climbs, roads, trails, water, sun", () => {
    // Room 4 in a 3 × 3 grid: north 7, south 1, east 5, west 3; up and down added.
    const m = gridMap(3, 3, { terrain: (i) => (i === 4 || i === 5 ? TERRAIN_ROAD : i === 3 ? TERRAIN.indexOf('water') : 3) });
    const slot = (d: number) => 4 * DIR_COUNT + d;
    m.exitFlags[slot(DIR.N)]! |= EXIT_FLAG.DOOR;
    m.exitFlags[slot(DIR.S)]! |= EXIT_FLAG.CLIMB;
    m.sundeath[1] = SUNDEATH.SUNDEATH;
    // East 5 is a road between roads (the grid sets the ROAD flag too); west into water.
    expect(exitsText(m, 4)).toBe('Exits: {north}, *|south|*, =east=, ~west~.');
    // A road exit from a non-road room is a trail.
    expect(exitsText(m, 1)).toBe('Exits: north, east, west.');
    m.exitFlags[1 * DIR_COUNT + DIR.E]! |= EXIT_FLAG.ROAD;
    expect(exitsText(m, 1)).toBe('Exits: north, -east-, west.');
    // No exits at all.
    const lone = gridMap(1, 1);
    expect(exitsText(lone, 0)).toBe('Exits: none.');
  });
});

describe('placeHoverBox', () => {
  // A 1000 × 600 viewport; a 300 × 100 box.
  it('goes right of and below the pointer', () => {
    expect(placeHoverBox(300, 100, 100, 100, 1000, 600)).toEqual({ x: 112, y: 112 });
  });

  it('flips left / up where it would leave the viewport', () => {
    expect(placeHoverBox(300, 100, 900, 100, 1000, 600)).toEqual({ x: 588, y: 112 });
    expect(placeHoverBox(300, 100, 100, 550, 1000, 600)).toEqual({ x: 112, y: 438 });
    expect(placeHoverBox(300, 100, 900, 550, 1000, 600)).toEqual({ x: 588, y: 438 });
  });

  it('stays inside the viewport', () => {
    // Fits on neither side of the pointer: held at the left margin.
    expect(placeHoverBox(300, 100, 200, 60, 400, 600)).toEqual({ x: 4, y: 72 });
    // Larger than the viewport: pinned to the margin.
    expect(placeHoverBox(1200, 900, 500, 300, 1000, 600)).toEqual({ x: 4, y: 4 });
  });
});

function harness(enabled = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const asks: Array<[number, number]> = [];
  const h = new MapHover({
    doc: document,
    host: () => host,
    frame: () => ({ left: 0, top: 0, right: 300, bottom: 200 }),
    size: () => 'large',
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
    expect(t.box()!.dataset.size).toBe('large');
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

  it('a button released on the map starts a rest there (a click, then the pointer still)', () => {
    const t = harness();
    t.h.move(10, 10, 0);
    t.h.cancel(); // pointer down
    expect(t.live()).toHaveLength(0);
    t.h.move(10, 10, 1); // a press without moving
    t.h.up(10, 10);
    expect(t.live().map((x) => x.ms)).toEqual([HOVER_REST_MS]);
    t.fire();
    expect(t.asks).toEqual([[10, 10]]);
    t.h.answer(1, 3, t.rect, t.info);
    expect(t.h.shown).toBe(true);
    // A drag that ends somewhere else rests there.
    t.h.cancel();
    t.h.up(120, 60);
    t.fire();
    expect(t.asks.at(-1)).toEqual([120, 60]);
  });

  it('Off: no timer is armed and no box shows, by mouse or by touch', () => {
    const t = harness(false);
    t.h.move(10, 10, 0);
    t.h.move(40, 40, 0);
    t.h.press(20, 20, true);
    t.h.up(20, 20);
    expect(t.live()).toHaveLength(0);
    t.fire();
    expect(t.asks).toEqual([]);
    t.h.answer(1, 3, t.rect, t.info);
    expect(t.h.shown).toBe(false);
    expect(t.box()).toBeNull();
  });
});
