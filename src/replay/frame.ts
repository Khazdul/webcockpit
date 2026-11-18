// The shared replay's frame (ADR 0154 "The watch page"): the replay
// runtime in `r/frame.html`, a document of its own with its own CSP, shown
// in `<iframe sandbox="allow-scripts">` (an opaque origin: no cookies,
// storage or DOM of the app) by src/watch/frame-host.ts.
//
// The handshake (`postMessage`, version 1):
//   frame → parent   {t: 'wc-ready', v: 1}            once, at start
//   parent → frame   {t: 'wc-play', v: 1, payload: ArrayBuffer (gzip JSON),
//                     fonts: [{family, weight, range?, data: ArrayBuffer}], prefs?}
//                    prefs: {paused?: boolean}: `paused: true` opens the
//                    replay paused at its start (the watch page's, ADR 0155
//                    W1); since stage 73 the poster (ADR 0162) holds every
//                    run paused at its start, so it is no longer read;
//                    meta?: {title, description}: the publication's words
//                    for the poster (stage 73 round 1), plain text, capped
//                    (`frameMeta`)
//   frame → parent   {t: 'wc-error', v: 1, text}       when it cannot play
//   frame → parent   {t: 'wc-fullscreen', v: 1, on}    fill the window (below)
//   parent → frame   {t: 'wc-fs-state', v: 1, on}      the frame fills it, or not
//   parent → frame   {t: 'wc-relayout', v: 1, debug?}  the page's window changed
//                    (a turn, fullscreen left): measure again (stage 73
//                    round 3, src/replay/frame-fit.ts); `debug`: the page's
//                    `?fsdebug` lines, plain text, capped, shown with
//                    `textContent` only
// `wc-play`'s `prefs.fsdebug: true` turns the frame's readout on (the
// page's `?fsdebug`). The frame takes messages only from `parent`, only
// the first `wc-play`, `wc-fs-state` and `wc-relayout`; anything else is
// ignored.
//
// Fullscreen (owner's test of stage 64): the frame is allowed fullscreen
// (`allow="fullscreen *"`), so the Fullscreen button, `F` and Esc put the
// frame's own document in fullscreen, and the browser shows the frame
// alone. Where the browser has no element fullscreen (the iPhone) or
// refuses it, the frame asks the parent with `wc-fullscreen` to let it
// fill the window instead (the band hidden), and shows the state the
// parent answers with.
//
// A phone or tablet (stage 71, ADR 0160): the frame decides the device
// flags itself (`replayPhone`; the frame's window has the device's
// pointer and screen) and plays the run in the phone's layout.
//
// The payload is decompressed with a ceiling (src/replay/codec.ts
// `readSharedPayload`, 64 MiB of JSON),
// checked by `validatePayload`, and only then played (`openReplay`). A
// failure shows the replay's one-line notice and posts it as `wc-error`:
// never a stack trace or payload text.
//
// Fonts come as bytes (the page fetched them from its own origin, the
// frame may not: `font-src data:`) and are registered with `FontFace`:
// only families the app ships (`FONTS`, the pane title's face), at most
// `FRAME_FONTS_MAX`, each at most `FRAME_FONT_BYTES`.

import { FONTS, TITLE_FACE, familyFaces } from '../theme/fonts';
import { FONT_IDS } from '../settings/types';
import { PayloadReadError, readSharedPayload } from './shared';
import { canFullscreen, exitFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../core/fullscreen';
import { type ReplayFullscreen, type ReplayPage, fail, openReplay } from './page';
import { replayPhone } from './phone';
import { type FrameFit, PARENT_DEBUG_MAX, installFrameFit } from './frame-fit';

export const FRAME_PROTOCOL = 1;
export const FRAME_FONTS_MAX = 64;
export const FRAME_FONT_BYTES = 8 * 1024 * 1024;

export interface FrameFont {
  family: string;
  weight: 'normal' | 'bold';
  /** A glyph face's `unicode-range`. */
  range?: string;
  data: ArrayBuffer;
}

/** The families a frame registers: every family the app ships. */
export function frameFamilies(): Set<string> {
  const out = new Set<string>([TITLE_FACE.family]);
  for (const id of FONT_IDS) {
    if (FONTS[id].local) continue;
    for (const f of familyFaces(id)) out.add(f.family);
  }
  return out;
}

const RANGE = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(\s*,\s*U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;

/** The well-formed fonts of a `wc-play` message (the rest are left out). */
export function frameFonts(raw: unknown): FrameFont[] {
  if (!Array.isArray(raw)) return [];
  const families = frameFamilies();
  const out: FrameFont[] = [];
  for (const f of raw.slice(0, FRAME_FONTS_MAX) as unknown[]) {
    if (typeof f !== 'object' || f === null) continue;
    const { family, weight, range, data } = f as Record<string, unknown>;
    if (typeof family !== 'string' || !families.has(family)) continue;
    if (weight !== 'normal' && weight !== 'bold') continue;
    if (range !== undefined && (typeof range !== 'string' || range.length > 2000 || !RANGE.test(range))) continue;
    if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > FRAME_FONT_BYTES) continue;
    out.push({ family, weight, ...(range !== undefined ? { range } : {}), data });
  }
  return out;
}

/** Registers `fonts` in `doc` (a face the browser cannot read is left out). */
export async function registerFonts(doc: Document, fonts: readonly FrameFont[]): Promise<void> {
  const set = doc.fonts as FontFaceSet & { add(f: FontFace): void };
  const Face = (doc.defaultView as (Window & { FontFace?: typeof FontFace }) | null)?.FontFace;
  if (!Face) return;
  await Promise.all(
    fonts.map(async (f) => {
      try {
        const face = new Face(f.family, f.data, { weight: f.weight, display: 'block', ...(f.range ? { unicodeRange: f.range } : {}) });
        set.add(await face.load());
      } catch {
        /* a damaged font: the text falls back */
      }
    }),
  );
}

/**
 * The frame's fullscreen: the document's own where the browser gives it,
 * else filling the parent's window (`ask(on)` posts `wc-fullscreen`;
 * `filled(on)` takes the parent's `wc-fs-state`).
 */
export function frameFullscreen(doc: Document, ask: (on: boolean) => void): ReplayFullscreen & { filled(on: boolean): void } {
  let filled = false;
  const fns: Array<() => void> = [];
  return {
    is: () => filled || isFullscreen(doc),
    toggle: () => {
      if (filled) ask(false);
      else if (isFullscreen(doc)) exitFullscreen(doc);
      else if (!canFullscreen(doc)) ask(true);
      // Refused (Firefox on iPad offers the API but never enters): fill instead.
      else void toggleFullscreen(doc).then((ok) => ok || ask(true));
    },
    exit: () => {
      exitFullscreen(doc);
      if (filled) ask(false);
    },
    onChange: (fn) => {
      fns.push(fn);
      onFullscreenChange(fn, doc);
    },
    filled: (on) => {
      if (on === filled) return;
      filled = on;
      for (const fn of fns) fn();
    },
  };
}

/** Whether a `wc-play` message's `prefs` ask for a paused start (only `paused: true` does). */
export function framePaused(prefs: unknown): boolean {
  return typeof prefs === 'object' && prefs !== null && (prefs as Record<string, unknown>).paused === true;
}

/** Whether a `wc-play` message's `prefs` turn the fullscreen-turn readout on (only `fsdebug: true` does). */
export function frameFsDebug(prefs: unknown): boolean {
  return typeof prefs === 'object' && prefs !== null && (prefs as Record<string, unknown>).fsdebug === true;
}

/** Longest title and description the frame takes (as the pub API's, src/watch/api.ts). */
export const FRAME_TITLE_MAX = 400;
export const FRAME_DESC_MAX = 2000;

/** Control characters (a newline aside) and the bidi controls that could reorder text. */
const UNSAFE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

function plain(raw: unknown, max: number, lines: boolean): string {
  if (typeof raw !== 'string') return '';
  let t = raw.slice(0, max * 2).replace(/\r\n?/g, '\n').replace(UNSAFE, '');
  t = lines ? t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
  return [...t.trim()].slice(0, max).join('');
}

/**
 * The publication's words of a `wc-play` message (`meta`), as plain text:
 * strings only, no control characters (the description keeps its line
 * breaks, at most one empty line in a row), capped. Shown with
 * `textContent` only (src/replay/poster.ts).
 */
export function frameMeta(raw: unknown): { title: string; description: string } {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return { title: plain(o.title, FRAME_TITLE_MAX, false), description: plain(o.description, FRAME_DESC_MAX, true) };
}

export interface FrameOptions {
  /** The window the frame runs in (its `parent` is the only sender it trusts). */
  win: Window;
  /** Called with the page once playing (tests). */
  onPlay?: (page: ReplayPage) => void;
}

/**
 * Starts the frame side of the handshake: listens for the parent's
 * `wc-play`, then says `wc-ready`. Returns a function that stops listening.
 */
export function startFrame(o: FrameOptions): () => void {
  const { win } = o;
  const doc = win.document;
  const root = doc.getElementById('app') ?? doc.body;
  const parent = win.parent;
  let taken = false;
  let fit: FrameFit | null = null;
  const post = (msg: Record<string, unknown>): void => {
    // The parent's origin is not known to an opaque frame; nothing posted is private.
    if (parent && parent !== win) parent.postMessage({ ...msg, v: FRAME_PROTOCOL }, '*');
  };
  const fs = frameFullscreen(doc, (on) => post({ t: 'wc-fullscreen', on }));
  const onMessage = (e: MessageEvent): void => {
    if (e.source !== parent || parent === win) return;
    const d = e.data as Record<string, unknown> | null;
    if (typeof d !== 'object' || d === null || d.v !== FRAME_PROTOCOL) return;
    if (d.t === 'wc-fs-state' && typeof d.on === 'boolean') return fs.filled(d.on);
    if (d.t === 'wc-relayout') {
      if (typeof d.debug === 'string') fit?.parentText(d.debug.slice(0, PARENT_DEBUG_MAX));
      fit?.kick('page');
      return;
    }
    if (taken || d.t !== 'wc-play') return;
    taken = true;
    const payload = d.payload;
    const fonts = frameFonts(d.fonts);
    const meta = frameMeta(d.meta);
    const debug = frameFsDebug(d.prefs);
    void (async () => {
      try {
        if (!(payload instanceof ArrayBuffer)) throw new PayloadReadError('This replay could not be read (no data).');
        const [p, , phone] = await Promise.all([readSharedPayload(payload), registerFonts(doc, fonts), replayPhone(win)]);
        // Every shared run opens under its poster, paused at the start (stage 73, ADR 0162),
        // whatever `prefs.paused` says.
        const page = openReplay(doc, root, p, { fullscreen: fs, poster: meta, ...(phone ? { phone } : {}) });
        // A phone or tablet follows its window through a turn reported late (stage 73 round 3).
        if (phone) fit = installFrameFit(win, root, page.host, { debug });
        o.onPlay?.(page);
      } catch (err) {
        const text = err instanceof PayloadReadError ? err.text : 'This replay could not be played.';
        fail(root, text);
        post({ t: 'wc-error', text });
      }
    })();
  };
  win.addEventListener('message', onMessage);
  post({ t: 'wc-ready' });
  return () => win.removeEventListener('message', onMessage);
}
