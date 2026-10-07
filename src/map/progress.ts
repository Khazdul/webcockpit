// Map loading progress (stage 24, ADR 0083 "Map pane"). Shared by the
// worker (what it reports) and the Map pane's overlay (what it shows):
//
// - The worker posts `progress` snapshots: the map load in flight (phase,
//   bytes read and the expected length, 0 when unknown) and the asset
//   files requested and settled for the current tile source (tiles,
//   character arrows and the map font).
// - The pane folds a snapshot into one weighted fraction and a label
//   (`loadFraction`, `loadLabel`) and draws the bar in whole glyph cells
//   (`glyphBar`). Pure; no DOM.
//
// Weights (fractions of the whole bar): from the stage 22 bench
// (bench/results/latest.md, Firefox, localhost: fetch 238, inflate 76,
// parse+indexes 153, hash 4, meshes 61 ms) scaled to a typical remote load:
// arda.mm2 (5.8 MB) at ~25 Mbit/s ≈ 1.9 s, tiles 0.7–6 MB ≈ 0.6 s on
// average, and the CPU phases about 3× slower on a phone. The download
// dominates, so it gets about half the bar.

import type { AssetResolver } from './assets';

/** Map load phases the worker reports, in order. */
export type MapLoadPhase = 'fetch' | 'unpack' | 'parse' | 'build';

export interface MapLoadProgress {
  /** The load request this belongs to. */
  req: number;
  phase: MapLoadPhase;
  /** Bytes of the map file read so far (fetch). */
  bytes: number;
  /** Expected bytes; 0 when unknown (no Content-Length, encoded, or more arrived than announced). */
  total: number;
}

export interface FileCount {
  done: number;
  total: number;
}

/** One `progress` message's payload. */
export interface MapProgress {
  /** The map load in flight; null when none. */
  map: MapLoadProgress | null;
  /** Asset files of the current tile source: settled / requested. */
  tiles: FileCount;
}

/** Shares of the bar per part (sum 1). Without a download the rest is scaled up. */
export const LOAD_WEIGHTS = { fetch: 0.55, unpack: 0.07, parse: 0.14, build: 0.06, tiles: 0.18 } as const;

const PHASES: readonly MapLoadPhase[] = ['fetch', 'unpack', 'parse', 'build'];

/** What the overlay knows about one loading session. */
export interface LoadState {
  /** `load`: a map load (and its tiles); `tiles`: a tileset change only. */
  kind: 'load' | 'tiles';
  /** The map is downloaded (a `url` source); false: bytes or parsed data, no fetch phase. */
  withFetch: boolean;
  /** The worker's last map part; null before the first report. */
  map: MapLoadProgress | null;
  /** The worker posted `loaded`. */
  mapDone: boolean;
  tiles: FileCount | null;
}

function tileFrac(t: FileCount | null): number {
  if (!t || t.total <= 0) return 0;
  return Math.min(1, t.done / t.total);
}

/** The whole bar, 0…1. An unknown download length counts as 0 until the fetch ends. */
export function loadFraction(s: LoadState): number {
  if (s.kind === 'tiles') return tileFrac(s.tiles);
  const w = LOAD_WEIGHTS;
  const fetchW = s.withFetch ? w.fetch : 0;
  const sum = fetchW + w.unpack + w.parse + w.build + w.tiles;
  let mapPart = 0;
  if (s.mapDone) {
    mapPart = fetchW + w.unpack + w.parse + w.build;
  } else if (s.map) {
    const i = PHASES.indexOf(s.map.phase);
    const weightOf = (p: MapLoadPhase): number => (p === 'fetch' ? fetchW : w[p]);
    for (let k = 0; k < i; k++) mapPart += weightOf(PHASES[k]!);
    if (s.map.phase === 'fetch' && s.map.total > 0) mapPart += fetchW * Math.min(1, s.map.bytes / s.map.total);
  }
  return Math.min(1, (mapPart + w.tiles * tileFrac(s.tiles)) / sum);
}

/** Megabytes with one decimal (10^6 bytes, as file sizes are shown). */
export function mb(bytes: number): string {
  return (bytes / 1e6).toFixed(1);
}

/** The line above the bar: what is being waited for now. */
export function loadLabel(s: LoadState): string {
  const t = s.tiles;
  const tilesLeft = t !== null && t.total > 0 && t.done < t.total;
  const tilesLabel = (c: FileCount): string => `Loading tiles  ${c.done} / ${c.total}`;
  if (s.kind === 'tiles') return tilesLeft ? tilesLabel(t) : 'Drawing map…';
  if (!s.mapDone) {
    const m = s.map;
    if (!m) return s.withFetch ? 'Loading map…' : 'Reading map…';
    switch (m.phase) {
      case 'fetch':
        if (m.bytes <= 0) return 'Loading map…';
        return m.total > 0 ? `Loading map  ${mb(m.bytes)} / ${mb(m.total)} MB` : `Loading map  ${mb(m.bytes)} MB`;
      case 'unpack':
        return 'Unpacking map…';
      case 'parse':
        return 'Reading map…';
      case 'build':
        return 'Building map…';
    }
  }
  return tilesLeft ? tilesLabel(t) : 'Drawing map…';
}

/** Bar width in cells for a pane `cols` wide: 28, narrower in a narrow pane (one cell margin each side), at least 4. */
export function barCells(cols: number, max = 28): number {
  return Math.max(4, Math.min(max, Math.floor(cols) - 4));
}

/** `cells` glyphs: `█` for the filled whole cells, `░` for the rest. */
export function glyphBar(frac: number, cells: number): { fill: string; track: string } {
  const f = Math.max(0, Math.min(cells, Math.floor((Number.isFinite(frac) ? frac : 0) * cells + 1e-9)));
  return { fill: '█'.repeat(f), track: '░'.repeat(cells - f) };
}

/**
 * Wraps an asset resolver so every request is counted in `count` (total on
 * request, done when it settles, success or not); `changed` follows each step.
 */
export function countingResolver(inner: AssetResolver, count: FileCount, changed: () => void): AssetResolver {
  return (path) => {
    count.total++;
    changed();
    const p = inner(path);
    const settle = (): void => {
      count.done++;
      changed();
    };
    p.then(settle, settle);
    return p;
  };
}

/**
 * Reads a response body, reporting `(bytes, total)` as chunks arrive. The
 * total is Content-Length when present and the body is not content-encoded
 * (an encoded length counts other bytes); 0 otherwise, and 0 from the
 * moment more bytes arrive than announced.
 */
export async function readBody(res: Response, onBytes: (bytes: number, total: number) => void): Promise<Uint8Array> {
  const enc = (res.headers.get('content-encoding') ?? '').trim().toLowerCase();
  const len = Number(res.headers.get('content-length') ?? '');
  let total = (enc === '' || enc === 'identity') && Number.isSafeInteger(len) && len > 0 ? len : 0;
  const body = res.body;
  if (!body) {
    const b = new Uint8Array(await res.arrayBuffer());
    onBytes(b.length, total);
    return b;
  }
  const reader = body.getReader();
  // Known length: one buffer, filled in place; otherwise (or on overflow) a chunk list.
  let buf: Uint8Array | null = total > 0 ? new Uint8Array(total) : null;
  let chunks: Uint8Array[] = [];
  let n = 0;
  onBytes(0, total);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;
    if (buf && n + value.length > buf.length) {
      chunks = [buf.subarray(0, n)];
      buf = null;
      total = 0;
    }
    if (buf) buf.set(value, n);
    else chunks.push(value);
    n += value.length;
    onBytes(n, total);
  }
  if (buf) return n === buf.length ? buf : buf.subarray(0, n);
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
