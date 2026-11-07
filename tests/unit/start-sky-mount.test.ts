// @vitest-environment happy-dom
// The start page sky engine's mount and dispose (ADR 0124): nothing is left behind, not even by a
// mount that fails half-way (iOS Safari hands out null canvas contexts when canvas memory runs out).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountStartSky } from '../../src/start/sky/index';

/** A 2D context that accepts every call and property (enough for the mount and a still frame). */
function fakeContext(): CanvasRenderingContext2D {
  const any: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'data' ? new Uint8ClampedArray(4) : any),
    set: () => true,
    apply: () => any,
  });
  return any as CanvasRenderingContext2D;
}

/** Live listeners (window, document, media queries), by type. */
let live: Map<string, number>;
let observers: { observed: number; disconnected: boolean }[];
type Args = Parameters<EventTarget['addEventListener']>;

beforeEach(() => {
  live = new Map();
  observers = [];
  const seen = new Set<string>();
  const ids = new WeakMap<object, number>();
  let n = 0;
  const id = (o: unknown): number => {
    if (!o || (typeof o !== 'object' && typeof o !== 'function')) return 0;
    if (!ids.has(o)) ids.set(o, ++n);
    return ids.get(o)!;
  };
  // happy-dom's EventTarget (not Node's global one), and the window's own bound methods
  const proto = Object.getPrototypeOf(Node.prototype) as EventTarget;
  // happy-dom adds listeners of its own (abort signals); only these targets are the engine's
  const watched = (t: EventTarget): boolean => t === window || t === document || t.constructor.name === 'MediaQueryList';
  const targets: [EventTarget, EventTarget | null][] = [
    [proto, null],
    [window, window],
  ];
  for (const [target, self] of targets) {
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    vi.spyOn(target, 'addEventListener').mockImplementation(function (this: EventTarget, ...[type, l, o]: Args) {
      const k = `${id(self ?? this)}:${type}:${id(l)}`;
      if (watched(self ?? this) && !seen.has(k)) {
        seen.add(k);
        live.set(type, (live.get(type) ?? 0) + 1);
      }
      add.call(self ?? this, type, l, o);
    });
    vi.spyOn(target, 'removeEventListener').mockImplementation(function (this: EventTarget, ...[type, l, o]: Args) {
      const k = `${id(self ?? this)}:${type}:${id(l)}`;
      if (seen.delete(k)) live.set(type, live.get(type)! - 1);
      remove.call(self ?? this, type, l, o);
    });
  }
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly rec = { observed: 0, disconnected: false };
      constructor() {
        observers.push(this.rec);
      }
      observe(): void {
        this.rec.observed++;
      }
      unobserve(): void {}
      disconnect(): void {
        this.rec.disconnected = true;
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const listening = (): number => [...live.values()].reduce((a, b) => a + b, 0);

function host(): HTMLDivElement {
  const h = document.createElement('div');
  document.body.append(h);
  return h;
}

describe('mountStartSky', () => {
  it('leaves nothing behind when the browser has no canvas context to give', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const h = host();
    for (let i = 0; i < 3; i++) expect(() => mountStartSky(h, { params: {}, reducedMotion: false })).toThrow(/2D canvas context/);
    expect(h.querySelector('.wc-start-sky')).toBeNull();
    expect(h.childElementCount).toBe(0);
    expect(listening()).toBe(0);
    expect(observers.every((o) => o.disconnected || o.observed === 0)).toBe(true);
  });

  it('takes everything down again when the mount fails after the root went in', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as never);
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    const h = host();
    let calls = 0;
    // the clock is read once before the root goes into the host and again after it
    const now = (): number => {
      if (++calls > 1) throw new Error('boom');
      return 3038 * 518400 + 6 * 43200 + 12 * 60;
    };
    for (let i = 0; i < 3; i++) {
      calls = 0;
      expect(() => mountStartSky(h, { params: {}, now, reducedMotion: false })).toThrow('boom');
    }
    expect(h.querySelector('.wc-start-sky')).toBeNull();
    expect(listening()).toBe(0);
    expect(observers.every((o) => o.disconnected || o.observed === 0)).toBe(true);
  });

  it('mounts and disposes cleanly', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as never);
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(7);
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    const h = host();
    const s = mountStartSky(h, { params: {}, reducedMotion: false, fadeIn: false });
    expect(h.querySelectorAll('.wc-start-sky')).toHaveLength(1);
    expect(raf).toHaveBeenCalled();
    expect(listening()).toBeGreaterThan(0);
    s.dispose();
    expect(h.querySelector('.wc-start-sky')).toBeNull();
    expect(listening()).toBe(0);
    expect(observers.every((o) => o.disconnected)).toBe(true);
    expect(caf).toHaveBeenCalledWith(7);
  });
});
