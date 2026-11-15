// `validatePayload` (ADR 0154 "Hardening the replay runtime"): a replay
// payload from anywhere (a share link's download, a file) checked field by
// field before the player sees it. Pure, no DOM.
//
// - Every field's type and bounds are checked; a payload that fails is
//   refused whole (a `PayloadError`), never repaired. The one exception is
//   `settings`: they go through `migrateSettings`, which turns anything into
//   valid settings (fonts only from `FONTS`, colours `#rrggbb`, enums and
//   numbers clamped), and then through the replay's whitelist
//   (`pickReplaySettings`), as the exporter does.
// - Only the known fields are copied into a new object: unknown keys are
//   dropped, and no key of the payload is ever used to assign into an
//   object (so `__proto__` and `constructor` stay plain data).
// - Every schema-1 payload the exporter has produced passes (older files:
//   runs with the whole `RunMeta`, no marker tips, no `hiddenSys`, no map).
//   ADR 0154 "Consequences": this may only become more tolerant for
//   schema 1.
//
// The capture texts are not parsed here: the player's reader
// (src/share/capture.ts `captureEntries`) skips any line that is not a
// record, and the review of ADR 0154 "As built (stage 64 B2)" covers what
// a well-formed record can do.

import { migrateSettings } from '../settings/migrate';
import type { PlayedRunMeta } from '../player/timeline';
import type { ReplayMap, ReplayPayload } from '../share/payload';
import { pickReplaySettings } from '../share/replay-settings';
import type { ExcludeRange } from '../share/edits';

/** Bounds of a payload (ADR 0154). */
export const PAYLOAD_LIMITS = {
  runs: 200,
  /** The capture texts together, UTF-16 units. */
  textChars: 64 * 1024 * 1024,
  comments: 2000,
  commentChars: 4000,
  markers: 20000,
  cuts: 20000,
  tipChars: 2000,
  titleChars: 1000,
  characterChars: 200,
  /** The map's `.mm2`, base64 characters. */
  mm2Chars: 8 * 1024 * 1024,
  mapFiles: 2000,
  mapNameChars: 256,
  /** A comment's hold (the exporter's at most 10 s). */
  holdMs: 60_000,
  level: 10_000,
  /** µs; `new Date` takes ±8.64e15 ms. */
  us: 8.64e18,
} as const;

/** Why a payload was refused (the path of the first bad field). */
export class PayloadError extends Error {
  constructor(readonly path: string) {
    super(`not a valid replay payload (${path})`);
    this.name = 'PayloadError';
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/** An own property only (an inherited `constructor` or `toString` is not a field). */
const own = (o: Obj, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);

function fail(path: string): never {
  throw new PayloadError(path);
}

function str(v: unknown, max: number, path: string): string {
  if (typeof v !== 'string' || v.length > max) fail(path);
  return v;
}

function num(v: unknown, path: string, lo: number = -PAYLOAD_LIMITS.us, hi: number = PAYLOAD_LIMITS.us): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(path);
  return v;
}

function arr(v: unknown, max: number, path: string): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail(path);
  return v;
}

function runMeta(v: unknown, path: string): PlayedRunMeta {
  if (!isObj(v)) fail(path);
  const out: PlayedRunMeta = { startedUs: num(own(v, 'startedUs'), `${path}.startedUs`) };
  const s = own(v, 'summary');
  if (s === undefined) return out;
  if (s === null) return { ...out, summary: null };
  if (!isObj(s)) fail(`${path}.summary`);
  const level = own(s, 'level');
  return {
    ...out,
    summary: {
      startUs: num(own(s, 'startUs'), `${path}.summary.startUs`),
      ...(level !== undefined ? { level: num(level, `${path}.summary.level`, 0, PAYLOAD_LIMITS.level) } : {}),
    },
  };
}

const KINDS = ['A', 'D', 'K', 'L'] as const;

/** Map asset keys (ADR 0154): a known folder, plain characters, no `..`. */
export const MAP_FILE_KEY = /^(pixmaps|fonts)\/[A-Za-z0-9._/-]{1,128}$/;
const B64 = '[A-Za-z0-9+/]*={0,2}';
/**
 * Map images are PNG only (review fix S1/S2): the exporter only ever
 * embeds PNG (`map-embed.ts`), and a PNG's IHDR is the size every browser
 * decodes. GIF, WebP and JPEG headers can name a small canvas over a far
 * larger frame, so their header check bounded nothing.
 */
const IMAGE_URI = new RegExp(`^data:image/png;base64,${B64}$`);
/**
 * Under `fonts/` also the map's bitmap font descriptions
 * (`Cantarell18.fnt`, which the exporter has always embedded as
 * `data:text/plain;base64,`: a deviation from ADR 0154's list, recorded in
 * its "As built (stage 64 B2)"). Never woff2: the exporter has none.
 */
const FONT_URI = new RegExp(`^data:text/plain;base64,${B64}$`);
const MM2 = new RegExp(`^${B64}$`);
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Widest and tallest map image: the bundled tiles and font pages are at
 * most 313 px, the community tilesets' 256 (`MAX_TILE_SIZE`), so 512
 * admits every real one with room; a small file cannot decode to a huge
 * bitmap (review fix S1: was 4 096).
 */
export const MAP_IMAGE_PX = 512;
/**
 * The map's images together, pixels (review fix S1): the largest real
 * export embeds about 4.9 Mpx, a whole tileset with the default pixmaps
 * about 6.4 Mpx. Past this the payload is refused.
 */
export const MAP_IMAGE_TOTAL_PX = 32 * 1024 * 1024;

/** The bytes of a base64 text (no `atob` errors escape: null). */
function b64Bytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Width and height from a PNG's IHDR, or null when the bytes are not a
 * still PNG: an animated one (an `acTL` chunk before the image data, APNG)
 * is refused outright, though its frames are bounded by IHDR too: the
 * exporter makes none, and nothing then hangs on a decoder's APNG checks.
 */
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  const u32 = (i: number): number => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
  const tag = (i: number, t: string): boolean => [...t].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length < 33 || b[0] !== 0x89 || !tag(1, 'PNG\r\n\x1a\n') || u32(8) !== 13 || !tag(12, 'IHDR')) return null;
  // The chunks up to the first IDAT: an `acTL` there makes it an APNG.
  for (let i = 33; i + 8 <= b.length; ) {
    if (tag(i + 4, 'IDAT') || tag(i + 4, 'IEND')) break;
    if (tag(i + 4, 'acTL') || tag(i + 4, 'fcTL')) return null;
    i += 12 + u32(i);
  }
  return { w: u32(16), h: u32(20) };
}

/** Pixels of a map file (0 for a font description), or null when it is not one the replay may load under `key`. */
export function mapFilePixels(key: string, value: unknown): number | null {
  if (typeof value !== 'string' || !MAP_FILE_KEY.test(key) || key.split('/').some((p) => p === '..' || p === '.' || p === '')) return null;
  if (IMAGE_URI.test(value)) {
    const bytes = b64Bytes(value.slice(value.indexOf(',') + 1));
    const size = bytes ? pngSize(bytes) : null;
    return size !== null && size.w > 0 && size.h > 0 && size.w <= MAP_IMAGE_PX && size.h <= MAP_IMAGE_PX ? size.w * size.h : null;
  }
  return key.startsWith('fonts/') && FONT_URI.test(value) ? 0 : null;
}

/** True for a map asset value the replay may load under `key`. */
export function validMapFile(key: string, value: unknown): value is string {
  return mapFilePixels(key, value) !== null;
}

function map(v: unknown, path: string): ReplayMap {
  if (!isObj(v)) fail(path);
  const mm2 = str(own(v, 'mm2'), PAYLOAD_LIMITS.mm2Chars, `${path}.mm2`);
  if (!MM2.test(mm2)) fail(`${path}.mm2`);
  const raw = own(v, 'files');
  if (!isObj(raw)) fail(`${path}.files`);
  const keys = Object.keys(raw);
  if (keys.length > PAYLOAD_LIMITS.mapFiles) fail(`${path}.files`);
  const files: Record<string, string> = {};
  let pixels = 0;
  for (const k of keys) {
    const f = raw[k];
    const px = mapFilePixels(k, f);
    if (px === null || typeof f !== 'string') fail(`${path}.files`);
    // All the images together (review fix S1): the renderer holds them at once.
    pixels += px;
    if (pixels > MAP_IMAGE_TOTAL_PX) fail(`${path}.files`);
    // Every key starts with `pixmaps/` or `fonts/`: never a prototype key.
    files[k] = f;
  }
  const out: ReplayMap = {
    name: str(own(v, 'name'), PAYLOAD_LIMITS.mapNameChars, `${path}.name`),
    rooms: num(own(v, 'rooms'), `${path}.rooms`, 0, 1e9),
    visited: num(own(v, 'visited'), `${path}.visited`, 0, 1e9),
    mm2,
    files,
  };
  const asIs = own(v, 'streamsAsIs');
  if (asIs !== undefined && typeof asIs !== 'boolean') fail(`${path}.streamsAsIs`);
  if (asIs === true) out.streamsAsIs = true;
  const tints = own(v, 'tints');
  if (tints !== undefined) {
    if (!isObj(tints)) fail(`${path}.tints`);
    const dark = own(tints, 'dark');
    const noSundeath = own(tints, 'noSundeath');
    if (typeof dark !== 'string' || !HEX.test(dark) || typeof noSundeath !== 'string' || !HEX.test(noSundeath)) fail(`${path}.tints`);
    out.tints = { dark, noSundeath };
  }
  return out;
}

/**
 * The payload in `raw` (parsed JSON of any origin), checked and copied, or
 * a `PayloadError`. Pure; never returns any object of `raw` itself.
 */
export function validatePayload(raw: unknown): ReplayPayload {
  if (!isObj(raw) || own(raw, 'schema') !== 1) fail('schema');
  const L = PAYLOAD_LIMITS;

  let chars = 0;
  const runs = arr(own(raw, 'runs'), L.runs, 'runs').map((r, i) => {
    if (!isObj(r)) fail(`runs[${i}]`);
    const text = own(r, 'text');
    if (typeof text !== 'string') fail(`runs[${i}].text`);
    chars += text.length;
    if (chars > L.textChars) fail('runs: texts too long');
    return { meta: runMeta(own(r, 'meta'), `runs[${i}].meta`), text };
  });

  const comments = arr(own(raw, 'comments'), L.comments, 'comments').map((c, i) => {
    if (!isObj(c)) fail(`comments[${i}]`);
    const before = own(c, 'beforeUs');
    return {
      beforeUs: before === null ? null : num(before, `comments[${i}].beforeUs`),
      text: str(own(c, 'text'), L.commentChars, `comments[${i}].text`),
      holdMs: num(own(c, 'holdMs'), `comments[${i}].holdMs`, 0, L.holdMs),
    };
  });

  const cuts = arr(own(raw, 'cuts'), L.cuts, 'cuts').map((c, i): ExcludeRange => {
    if (!Array.isArray(c) || c.length !== 2) fail(`cuts[${i}]`);
    const from = num(c[0], `cuts[${i}]`);
    if (c[1] === null) return [from, null];
    const to = num(c[1], `cuts[${i}]`);
    if (to < from) fail(`cuts[${i}]`);
    return [from, to];
  });

  const markers = arr(own(raw, 'markers'), L.markers, 'markers').map((m, i) => {
    if (!isObj(m)) fail(`markers[${i}]`);
    const kind = own(m, 'kind');
    if (!KINDS.includes(kind as (typeof KINDS)[number])) fail(`markers[${i}].kind`);
    const tip = own(m, 'tip');
    return {
      us: num(own(m, 'us'), `markers[${i}].us`),
      kind: kind as (typeof KINDS)[number],
      ...(tip !== undefined ? { tip: str(tip, L.tipChars, `markers[${i}].tip`) } : {}),
    };
  });

  const out: ReplayPayload = {
    schema: 1,
    title: str(own(raw, 'title'), L.titleChars, 'title'),
    character: str(own(raw, 'character'), L.characterChars, 'character'),
    startUs: num(own(raw, 'startUs'), 'startUs'),
    settings: pickReplaySettings(migrateSettings(own(raw, 'settings'), { recorded: true })),
    runs,
    comments,
    cuts,
    markers,
  };
  const level = own(raw, 'level');
  if (level !== undefined) out.level = num(level, 'level', 0, L.level);
  const hidden = own(raw, 'hiddenSys');
  if (hidden !== undefined) {
    out.hiddenSys = arr(hidden, L.runs, 'hiddenSys').map((h) => {
      if (!Number.isInteger(h) || (h as number) < 0 || (h as number) >= runs.length) fail('hiddenSys');
      return h as number;
    });
  }
  const m = own(raw, 'map');
  if (m !== undefined) out.map = map(m, 'map');
  return out;
}
