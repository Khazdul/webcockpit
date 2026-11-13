// @vitest-environment happy-dom
// Stage 51c (ADR 0136 §4): the map pane as the phone's lens: `setLens`
// fixes the tileset and the background, turns off the hover box and every
// pan, pinch and wheel zoom, and `zoomTo` sends an absolute zoom (again
// when the worker starts and after a map load); `setLens(null)` gives all
// of it back. The stored settings are never written. A hidden lens stops
// forwarding game events (a phone's pane without a lens keeps it).
//
// The worker is a recorder (`spawnMapWorker` mocked): nothing draws.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import { setDeviceForTest } from '../../src/core/device';
import type { MainToWorker, WorkerToMain } from '../../src/map/protocol';
import { createPaneContext } from '../../src/panes/context';
import { LONG_PRESS_MS } from '../../src/panes/map-hover';
import { LENS_SEASON_DELAY_MS, MapPane } from '../../src/panes/map';
import { type Tileset, resolveTileset } from '../../src/map/tilesets';
import { SettingsStore } from '../../src/settings';

interface FakeWorker {
  sent: MainToWorker[];
  emit(m: WorkerToMain): void;
}

const worker = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../../src/map/spawn-worker', () => ({
  spawnMapWorker: async () => {
    const listeners: ((e: { data: unknown }) => void)[] = [];
    const w = {
      sent: [] as unknown[],
      postMessage: (m: unknown) => void w.sent.push(m),
      addEventListener: (type: string, fn: (e: { data: unknown }) => void) => void (type === 'message' && listeners.push(fn)),
      terminate: () => {},
      emit: (m: unknown) => {
        for (const fn of listeners) fn({ data: m });
      },
    };
    worker.current = w;
    return w;
  },
}));

const LENS = { tileset: 'shimrod', background: '#000000' } as const;

/** What the map needs of the browser, which happy-dom lacks. */
function fakeBrowser(): void {
  const w = window as unknown as Record<string, unknown>;
  w.Worker = class {};
  w.OffscreenCanvas = class {};
  (HTMLCanvasElement.prototype as unknown as { transferControlToOffscreen: () => unknown }).transferControlToOffscreen = () => ({});
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await vi.dynamicImportSettled();
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function setup(o: { touch?: boolean } = {}) {
  setDeviceForTest({ touch: o.touch ?? false, phone: o.touch ?? false });
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  // A computer's choices, which the lens must neither use nor change.
  settings.update({ mapper: { tileset: 'default', background: '#2e3436', hover: 'full' } });
  const bus = new Bus();
  const pane = new MapPane(createPaneContext({ doc: document, bus, settings, cells: { get: () => ({ w: 8, h: 16 }), subscribe: () => () => {} }, requestFrame: (cb) => cb() }));
  document.body.append(pane.el);
  const show = (): void => pane.place({ rect: { x: 0, y: 0, w: 20, h: 10 }, content: { x: 0, y: 0, w: 20, h: 10 }, framed: false }, { w: 8, h: 16 });
  const hide = (): void => pane.place(null, { w: 8, h: 16 });
  const w = (): FakeWorker => worker.current as FakeWorker;
  const of = (t: string): MainToWorker[] => w().sent.filter((m) => m.t === t);
  const canvas = pane.content.querySelector('canvas')!;
  return { pane, settings, bus, show, hide, w, of, canvas };
}

const pointer = (el: Element, type: string, x: number, y: number, id = 1, pointerType = 'mouse'): void => {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType, button: 0, buttons: 1 }));
};

beforeEach(() => {
  fakeBrowser();
  worker.current = null;
});

afterEach(() => {
  setDeviceForTest({ touch: false, phone: false });
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('MapPane as the lens', () => {
  it('starts with the lens\'s tileset and background, not the stored ones, and never writes the settings', async () => {
    const h = setup();
    const before = JSON.stringify(h.settings.get());
    h.pane.setLens(LENS);
    h.show();
    await settle();
    const init = h.of('init')[0] as Extract<MainToWorker, { t: 'init' }>;
    expect(init.background).toBe('#000000');
    expect(init.transparent ?? false).toBe(false);
    expect(JSON.stringify(init.assets)).toMatch(/tilesets\/shimrod-(spring|summer|autumn|winter)\//);
    expect(h.pane.content.dataset.mapTileset).toMatch(/^shimrod-/);
    expect(h.pane.content.dataset.mapBg).toBe('#000000');
    expect(h.pane.content.hasAttribute('data-map-lens')).toBe(true);
    expect(JSON.stringify(h.settings.get())).toBe(before);
    h.pane.dispose();
  });

  it('without a lens the stored Mapper settings are used', async () => {
    const h = setup();
    h.show();
    await settle();
    const init = h.of('init')[0] as Extract<MainToWorker, { t: 'init' }>;
    expect(init.background).toBe('#2e3436');
    expect(JSON.stringify(init.assets)).not.toContain('shimrod');
    expect(h.pane.content.hasAttribute('data-map-lens')).toBe(false);
    h.pane.dispose();
  });

  it('zoomTo before the worker runs is sent when it starts, and again after a map load', async () => {
    const h = setup();
    h.pane.setLens(LENS);
    h.pane.zoomTo(0.68);
    h.show();
    await settle();
    expect(h.of('zoomTo')).toEqual([{ t: 'zoomTo', zoom: 0.68 }]);
    // The zoom follows the init, before the map is loaded.
    expect(h.w().sent.findIndex((m) => m.t === 'zoomTo')).toBeGreaterThan(h.w().sent.findIndex((m) => m.t === 'init'));
    h.w().emit({ t: 'loaded', req: 1, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    expect(h.of('zoomTo')).toEqual([
      { t: 'zoomTo', zoom: 0.68 },
      { t: 'zoomTo', zoom: 0.68 },
    ]);
    // A new level goes at once, and is the one re-sent after the next load.
    h.pane.zoomTo(1.1);
    expect(h.of('zoomTo').at(-1)).toEqual({ t: 'zoomTo', zoom: 1.1 });
    h.w().emit({ t: 'loaded', req: 2, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    expect(h.of('zoomTo').at(-1)).toEqual({ t: 'zoomTo', zoom: 1.1 });
    expect(h.of('zoomTo')).toHaveLength(4);
    h.pane.dispose();
  });

  it('zoomTo does nothing without a lens', async () => {
    const h = setup();
    h.pane.zoomTo(0.5);
    h.show();
    await settle();
    h.pane.zoomTo(0.5);
    h.w().emit({ t: 'loaded', req: 1, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    expect(h.of('zoomTo')).toEqual([]);
    h.pane.dispose();
  });

  it('a lens set on a running pane swaps the tiles and the background live; setLens(null) gives the stored ones back', async () => {
    const h = setup();
    h.show();
    await settle();
    h.pane.setLens(LENS);
    expect(h.of('background').at(-1)).toEqual({ t: 'background', color: '#000000' });
    expect(JSON.stringify(h.of('assets').at(-1))).toContain('shimrod-');
    h.pane.zoomTo(0.3);
    h.pane.setLens(null);
    expect(h.of('background').at(-1)).toEqual({ t: 'background', color: '#2e3436' });
    expect(JSON.stringify(h.of('assets').at(-1))).not.toContain('shimrod');
    expect(h.pane.content.dataset.mapTileset).toBe('default');
    expect(h.pane.content.dataset.mapBg).toBe('#2e3436');
    expect(h.pane.content.hasAttribute('data-map-lens')).toBe(false);
    // The lens's zoom is forgotten: a map load sends none.
    const n = h.of('zoomTo').length;
    h.w().emit({ t: 'loaded', req: 1, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    expect(h.of('zoomTo')).toHaveLength(n);
    // Setting the same lens twice sends nothing more.
    h.pane.setLens(LENS);
    const sent = h.w().sent.length;
    h.pane.setLens({ ...LENS });
    expect(h.w().sent).toHaveLength(sent);
    h.pane.dispose();
  });

  it('the Mapper settings changing behind a lens change nothing drawn', async () => {
    const h = setup();
    h.pane.setLens(LENS);
    h.show();
    await settle();
    const sent = h.w().sent.length;
    h.settings.update({ mapper: { tileset: 'mmapper', background: 'transparent' } });
    expect(h.w().sent).toHaveLength(sent);
    expect(h.pane.content.dataset.mapBg).toBe('#000000');
    h.pane.dispose();
  });

  it('mouse: no drag pan and no wheel zoom with a lens; both work without it', async () => {
    const h = setup();
    h.pane.setLens(LENS);
    h.show();
    await settle();
    const gestures = (): void => {
      pointer(h.canvas, 'pointerdown', 10, 10);
      pointer(h.canvas, 'pointermove', 40, 30);
      pointer(h.canvas, 'pointerup', 40, 30);
      h.canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 20, clientY: 20 }));
    };
    gestures();
    expect(h.of('pan')).toEqual([]);
    expect(h.of('zoom')).toEqual([]);
    h.pane.setLens(null);
    gestures();
    expect(h.of('pan')).toEqual([{ t: 'pan', dx: 30, dy: 20 }]);
    expect(h.of('zoom')).toHaveLength(1);
    h.pane.dispose();
  });

  it('touch: no one-finger pan, no pinch and no long-press hover with a lens; all three work without it', async () => {
    vi.useFakeTimers();
    const h = setup({ touch: true });
    h.pane.setLens(LENS);
    h.show();
    await settle();
    h.w().emit({ t: 'loaded', req: 1, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    const drag = (): void => {
      pointer(h.canvas, 'pointerdown', 10, 10, 1, 'touch');
      pointer(h.canvas, 'pointermove', 40, 30, 1, 'touch');
      pointer(h.canvas, 'pointerup', 40, 30, 1, 'touch');
    };
    const pinch = (): void => {
      pointer(h.canvas, 'pointerdown', 40, 50, 1, 'touch');
      pointer(h.canvas, 'pointerdown', 60, 50, 2, 'touch');
      pointer(h.canvas, 'pointermove', 20, 50, 1, 'touch');
      pointer(h.canvas, 'pointermove', 80, 50, 2, 'touch');
      pointer(h.canvas, 'pointerup', 20, 50, 1, 'touch');
      pointer(h.canvas, 'pointerup', 80, 50, 2, 'touch');
    };
    const longPress = (): void => {
      pointer(h.canvas, 'pointerdown', 30, 30, 3, 'touch');
      vi.advanceTimersByTime(LONG_PRESS_MS + 100);
      pointer(h.canvas, 'pointerup', 30, 30, 3, 'touch');
    };
    drag();
    pinch();
    longPress();
    expect(h.of('pan')).toEqual([]);
    expect(h.of('zoom')).toEqual([]);
    expect(h.of('roomAt')).toEqual([]);
    h.pane.setLens(null);
    drag();
    expect(h.of('pan').length).toBeGreaterThan(0);
    pinch();
    expect(h.of('zoom').length).toBeGreaterThan(0);
    longPress();
    expect(h.of('roomAt')).toHaveLength(1);
    h.pane.dispose();
  });

  it('a hidden lens stops forwarding game events and finds the player when shown again; so does a phone\'s map without a lens', async () => {
    const room = (id: number) => ({ pkg: 'Room.Info', data: { id, name: 'A room' } }) as never;
    const h = setup({ touch: true });
    h.pane.setLens(LENS);
    h.show();
    await settle();
    h.w().emit({ t: 'loaded', req: 1, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    h.bus.emit('gmcp', room(1));
    await settle();
    const shown = h.of('events').length;
    expect(shown).toBeGreaterThan(0);
    // Hidden (the setting off, or no room for it): nothing goes to the worker.
    h.hide();
    h.bus.emit('gmcp', room(2));
    h.bus.emit('gmcp', room(3));
    await settle();
    expect(h.of('events')).toHaveLength(shown);
    // Shown again: the last room is replayed.
    h.show();
    await settle();
    const after = h.of('events').slice(shown);
    expect(JSON.stringify(after)).toContain('"id":3');
    h.pane.dispose();

    // Without a lens (stage 56: the old MAP tab's "keep tracking while hidden" is gone) the same:
    // nothing while hidden, the last room when shown again.
    const t = setup({ touch: true });
    t.show();
    await settle();
    t.w().emit({ t: 'loaded', req: 1, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    await settle();
    const base = t.of('events').length;
    t.hide();
    t.bus.emit('gmcp', room(5));
    await settle();
    expect(t.of('events')).toHaveLength(base);
    t.show();
    await settle();
    expect(JSON.stringify(t.of('events').slice(base))).toContain('"id":5');
    t.pane.dispose();
  });

  it('a game clock change swaps the lens\'s season a while later, not at once; without a lens at once', async () => {
    vi.useFakeTimers();
    const h = setup({ touch: true });
    h.pane.setLens(LENS);
    h.show();
    await vi.advanceTimersByTimeAsync(50);
    h.w().emit({ t: 'loaded', req: 1, info: { rooms: 1, ms: 1, stages: {} } } as unknown as WorkerToMain);
    const p = h.pane as unknown as { onClock(): void; tileset(): Tileset | null };
    const before = h.of('assets').length;
    // The season is another (the clock was synced): what the pane resolves changes.
    const real = p.tileset.bind(p);
    const was = real()!.id;
    const next = [0, 3, 6, 9].map((m) => resolveTileset('shimrod', m)!).find((t) => t.id !== was)!;
    const other = next.id;
    p.tileset = () => next;
    p.onClock();
    p.onClock();
    expect(h.of('assets')).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(LENS_SEASON_DELAY_MS - 10);
    expect(h.of('assets')).toHaveLength(before);
    await vi.advanceTimersByTimeAsync(20);
    // One swap for the two changes.
    expect(h.of('assets')).toHaveLength(before + 1);
    expect(h.pane.content.dataset.mapTileset).toBe(other);
    // Without the lens (a computer's pane): at once.
    h.pane.setLens(null);
    const n = h.of('assets').length;
    p.tileset = () => resolveTileset('desert', 0);
    p.onClock();
    expect(h.of('assets')).toHaveLength(n + 1);
    h.pane.dispose();
  });
});
