// @vitest-environment happy-dom
// Map loading progress (stage 24, ADR 0083): the weighted fraction, the
// label, the glyph bar, the streaming body reader, the counting resolver,
// and the Map pane's overlay timing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOAD_WEIGHTS,
  type LoadState,
  barCells,
  countingResolver,
  barFill,
  loadFraction,
  loadLabel,
  readBody,
} from '../../src/map/progress';
import { FADE_MS, MapLoading, SHOW_DELAY_MS } from '../../src/panes/map-loading';

const load = (over: Partial<LoadState> = {}): LoadState => ({ kind: 'load', withFetch: true, map: null, mapDone: false, tiles: null, ...over });
const fetching = (bytes: number, total: number) => ({ req: 1, phase: 'fetch' as const, bytes, total });

describe('load fraction and label', () => {
  it('weights sum to 1', () => {
    const sum = Object.values(LOAD_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('weights the download by bytes, the phases as steps, the tiles by files', () => {
    const w = LOAD_WEIGHTS;
    expect(loadFraction(load())).toBe(0);
    expect(loadFraction(load({ map: fetching(2.9e6, 5.8e6) }))).toBeCloseTo(w.fetch / 2);
    expect(loadFraction(load({ map: fetching(2.9e6, 0) }))).toBe(0); // unknown length: 0 until fetched
    expect(loadFraction(load({ map: { req: 1, phase: 'unpack', bytes: 0, total: 0 } }))).toBeCloseTo(w.fetch);
    expect(loadFraction(load({ map: { req: 1, phase: 'parse', bytes: 0, total: 0 } }))).toBeCloseTo(w.fetch + w.unpack);
    expect(loadFraction(load({ map: { req: 1, phase: 'build', bytes: 0, total: 0 } }))).toBeCloseTo(w.fetch + w.unpack + w.parse);
    expect(loadFraction(load({ mapDone: true }))).toBeCloseTo(1 - w.tiles);
    expect(loadFraction(load({ mapDone: true, tiles: { done: 52, total: 104 } }))).toBeCloseTo(1 - w.tiles / 2);
    expect(loadFraction(load({ mapDone: true, tiles: { done: 104, total: 104 } }))).toBeCloseTo(1);
  });

  it('scales the rest up without a download; a tile session is the tiles alone', () => {
    const w = LOAD_WEIGHTS;
    const rest = 1 - w.fetch;
    expect(loadFraction(load({ withFetch: false, map: { req: 1, phase: 'parse', bytes: 0, total: 0 } }))).toBeCloseTo(w.unpack / rest);
    expect(loadFraction(load({ withFetch: false, mapDone: true, tiles: { done: 1, total: 1 } }))).toBeCloseTo(1);
    expect(loadFraction({ ...load(), kind: 'tiles', tiles: { done: 26, total: 104 } })).toBeCloseTo(0.25);
    expect(loadFraction({ ...load(), kind: 'tiles', tiles: { done: 0, total: 0 } })).toBe(0);
  });

  it('labels what is being waited for', () => {
    expect(loadLabel(load())).toBe('Loading map…');
    expect(loadLabel(load({ withFetch: false }))).toBe('Reading map…');
    expect(loadLabel(load({ map: fetching(2_100_000, 5_814_236) }))).toBe('Loading map  2.1 / 5.8 MB');
    expect(loadLabel(load({ map: fetching(2_100_000, 0) }))).toBe('Loading map  2.1 MB');
    expect(loadLabel(load({ map: { req: 1, phase: 'unpack', bytes: 0, total: 0 } }))).toBe('Unpacking map…');
    expect(loadLabel(load({ map: { req: 1, phase: 'build', bytes: 0, total: 0 } }))).toBe('Building map…');
    expect(loadLabel(load({ mapDone: true, tiles: { done: 40, total: 104 } }))).toBe('Loading tiles  40 / 104');
    expect(loadLabel(load({ mapDone: true, tiles: { done: 104, total: 104 } }))).toBe('Drawing map…');
    // While the map downloads, its bytes win over the tiles loading alongside.
    expect(loadLabel(load({ map: fetching(1e6, 5.8e6), tiles: { done: 3, total: 104 } }))).toBe('Loading map  1.0 / 5.8 MB');
    expect(loadLabel({ ...load(), kind: 'tiles', tiles: { done: 3, total: 104 } })).toBe('Loading tiles  3 / 104');
  });
});

describe('bar', () => {
  it('fills whole cells, never past the end', () => {
    expect(barFill(0, 4)).toBe(0);
    expect(barFill(0.49, 4)).toBe(1);
    expect(barFill(0.5, 4)).toBe(2);
    expect(barFill(1, 4)).toBe(4);
    expect(barFill(1.5, 4)).toBe(4);
    expect(barFill(Number.NaN, 4)).toBe(0);
  });

  it('is 28 cells, narrower in a narrow pane, at least 4', () => {
    expect(barCells(80)).toBe(28);
    expect(barCells(20)).toBe(16);
    expect(barCells(3)).toBe(4);
  });
});

describe('progress helpers', () => {
  const stream = (chunks: number[][]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(Uint8Array.from(ch));
        c.close();
      },
    });

  it('reads a body in chunks with its Content-Length', async () => {
    const seen: [number, number][] = [];
    const res = new Response(stream([[1, 2], [3], [4, 5]]), { headers: { 'content-length': '5' } });
    const b = await readBody(res, (n, t) => void seen.push([n, t]));
    expect([...b]).toEqual([1, 2, 3, 4, 5]);
    expect(seen).toEqual([[0, 5], [2, 5], [3, 5], [5, 5]]);
  });

  it('drops the total when it is missing, encoded or too small', async () => {
    const run = async (headers: Record<string, string>) => {
      const seen: [number, number][] = [];
      const b = await readBody(new Response(stream([[1, 2], [3, 4]]), { headers }), (n, t) => void seen.push([n, t]));
      return { bytes: [...b], seen };
    };
    expect(await run({})).toEqual({ bytes: [1, 2, 3, 4], seen: [[0, 0], [2, 0], [4, 0]] });
    expect((await run({ 'content-length': '2', 'content-encoding': 'gzip' })).seen.at(-1)).toEqual([4, 0]);
    expect(await run({ 'content-length': '3' })).toEqual({ bytes: [1, 2, 3, 4], seen: [[0, 3], [2, 3], [4, 0]] });
  });

  it('falls back to the expected size when the length is missing or encoded', async () => {
    const run = async (headers: Record<string, string>, expected: number) => {
      const seen: [number, number][] = [];
      await readBody(new Response(stream([[1, 2], [3, 4]]), { headers }), (n, t) => void seen.push([n, t]), expected);
      return seen;
    };
    expect(await run({ 'content-length': '2', 'content-encoding': 'gzip' }, 4)).toEqual([[0, 4], [2, 4], [4, 4]]);
    expect(await run({}, 4)).toEqual([[0, 4], [2, 4], [4, 4]]);
    expect(await run({ 'content-length': '4' }, 9)).toEqual([[0, 4], [2, 4], [4, 4]]); // a plain length wins
    expect((await run({ 'content-encoding': 'br' }, 3)).at(-1)).toEqual([4, 0]); // more than expected: unknown
  });

  it('counts requests and settled files, failures too', async () => {
    const count = { done: 0, total: 0 };
    const changes: string[] = [];
    const r = countingResolver(
      async (p) => {
        if (p === 'bad') throw new Error('x');
        return new Blob([p]);
      },
      count,
      () => void changes.push(`${count.done}/${count.total}`),
    );
    const a = r('a');
    const b = r('bad');
    expect(count).toEqual({ done: 0, total: 2 });
    await a;
    await expect(b).rejects.toThrow('x');
    await Promise.resolve();
    expect(count).toEqual({ done: 2, total: 2 });
    expect(changes).toEqual(['0/1', '0/2', '1/2', '2/2']);
  });
});

describe('map loading overlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const l = new MapLoading(document);
    document.body.append(l.el);
    l.resize(40);
    return l;
  };
  const text = (l: MapLoading) => l.el.textContent;

  it('shows nothing for a fast load', () => {
    const l = make();
    l.begin('load');
    vi.advanceTimersByTime(SHOW_DELAY_MS - 1);
    l.loaded();
    l.end('load');
    vi.advanceTimersByTime(1000);
    expect(l.el.hidden).toBe(true);
    expect(l.active).toBe(false);
  });

  it('shows the bar after the delay, follows progress, and fades out on the first frame', () => {
    const l = make();
    l.begin('load');
    l.progress({ map: fetching(2_100_000, 5_800_000), tiles: { done: 0, total: 0 } });
    expect(l.el.hidden).toBe(true);
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(l.el.hidden).toBe(false);
    expect(text(l)).toContain('Loading map  2.1 / 5.8 MB');
    const fill = l.el.querySelector<HTMLElement>('.wc-map-loading-fill')!;
    expect(fill.textContent).toBe('');
    expect(Number(fill.dataset.cells) + l.el.querySelector('.wc-map-loading-track')!.textContent!.length).toBe(28);
    const pct1 = Number(l.el.dataset.pct);
    l.progress({ map: { req: 1, phase: 'build', bytes: 0, total: 0 }, tiles: { done: 10, total: 104 } });
    expect(text(l)).toContain('Building map…');
    expect(Number(l.el.dataset.pct)).toBeGreaterThan(pct1);
    l.loaded();
    l.progress({ map: null, tiles: { done: 40, total: 104 } });
    expect(text(l)).toContain('Loading tiles  40 / 104');
    l.end('tiles'); // not this session's end
    expect(l.el.hidden).toBe(false);
    l.end('load');
    expect(l.el.dataset.leaving).toBe('');
    vi.advanceTimersByTime(FADE_MS);
    expect(l.el.hidden).toBe(true);
    expect(l.el.dataset.leaving).toBeUndefined();
  });

  it('narrows the bar in a narrow pane; an abort hides at once', () => {
    const l = make();
    l.resize(12);
    l.begin('tiles');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    l.progress({ map: null, tiles: { done: 1, total: 4 } });
    const fill = l.el.querySelector<HTMLElement>('.wc-map-loading-fill')!;
    expect(fill.dataset.cells).toBe('2');
    expect(fill.style.width).toBe('2ch');
    const track = l.el.querySelector<HTMLElement>('.wc-map-loading-track')!;
    expect(track.textContent).toBe('░░░░░░');
    expect(track.style.width).toBe('6ch');
    l.abort();
    expect(l.el.hidden).toBe(true);
  });

  it('a tileset change during a load is part of the load; a new load during the fade keeps the box', () => {
    const l = make();
    l.begin('load');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    l.begin('tiles');
    l.end('tiles');
    expect(l.el.hidden).toBe(false);
    l.end('load');
    l.begin('load');
    vi.advanceTimersByTime(FADE_MS * 2);
    expect(l.el.hidden).toBe(false);
    expect(l.el.dataset.leaving).toBeUndefined();
  });
});
