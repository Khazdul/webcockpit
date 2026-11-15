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
const IMAGE_URI = new RegExp(`^data:image/(png|jpeg|gif|webp);base64,${B64}$`);
/**
 * Under `fonts/` also woff2 and the map's bitmap font descriptions
 * (`Cantarell18.fnt`, which the exporter has always embedded as
 * `data:text/plain;base64,`: a deviation from ADR 0154's list, recorded in
 * its "As built (stage 64 B2)").
 */
const FONT_URI = new RegExp(`^data:(font/woff2|text/plain);base64,${B64}$`);
const MM2 = new RegExp(`^${B64}$`);
const HEX = /^#[0-9a-f]{6}$/i;

/** Widest and tallest map image (the bundled tiles and font pages are at most 313 px): a small file cannot decode to a huge bitmap. */
export const MAP_IMAGE_PX = 4096;

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
 * Width and height from an image file's header (PNG, GIF, WebP, JPEG), or
 * null when the header is not one the type says.
 */
export function imageSize(type: string, b: Uint8Array): { w: number; h: number } | null {
  const u16 = (i: number): number => (b[i]! << 8) | b[i + 1]!;
  const u16le = (i: number): number => b[i]! | (b[i + 1]! << 8);
  const u32 = (i: number): number => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
  const tag = (i: number, t: string): boolean => [...t].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (type === 'png') return b.length >= 24 && b[0] === 0x89 && tag(1, 'PNG') && tag(12, 'IHDR') ? { w: u32(16), h: u32(20) } : null;
  if (type === 'gif') return b.length >= 10 && tag(0, 'GIF8') ? { w: u16le(6), h: u16le(8) } : null;
  if (type === 'webp') {
    if (b.length < 30 || !tag(0, 'RIFF') || !tag(8, 'WEBP')) return null;
    if (tag(12, 'VP8 ')) return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff };
    if (tag(12, 'VP8L')) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (tag(12, 'VP8X')) return { w: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), h: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    return null;
  }
  if (type === 'jpeg') {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1]!;
      if (m === 0xff) {
        i++;
        continue;
      }
      // SOF0–SOF15 but DHT (C4), JPG (C8) and DAC (CC).
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: u16(i + 7), h: u16(i + 5) };
      if (m === 0xd9 || m === 0xda) return null;
      i += 2 + u16(i + 2);
    }
    return null;
  }
  return null;
}

/** True for a map asset value the replay may load under `key`. */
export function validMapFile(key: string, value: unknown): value is string {
  if (typeof value !== 'string' || !MAP_FILE_KEY.test(key) || key.split('/').some((p) => p === '..' || p === '.' || p === '')) return false;
  const img = IMAGE_URI.exec(value);
  if (img) {
    const bytes = b64Bytes(value.slice(value.indexOf(',') + 1));
    const size = bytes ? imageSize(img[1]!, bytes) : null;
    return size !== null && size.w > 0 && size.h > 0 && size.w <= MAP_IMAGE_PX && size.h <= MAP_IMAGE_PX;
  }
  return key.startsWith('fonts/') && FONT_URI.test(value);
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
  for (const k of keys) {
    const f = raw[k];
    if (!validMapFile(k, f)) fail(`${path}.files`);
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
