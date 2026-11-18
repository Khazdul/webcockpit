// The watch page's side of the shared replay's frame (ADR 0154 "The watch
// page"; the frame's side is src/replay/frame.ts):
//
//   <iframe sandbox="allow-scripts" allow="fullscreen *"
//           src="<base>r/frame" referrerpolicy="no-referrer">
//
// No `allow-same-origin`: the frame's origin is opaque, so a hostile
// payload that ever ran script there could not read the app's cookies,
// storage or DOM; its document's own CSP keeps it off the network. The
// frame's URL is under the site's base (`BASE_URL`), so a subpath deploy
// works, and is `r/frame` (where Cloudflare serves `r/frame.html` without a
// redirect).
//
// `openFrame` reads the payload once on the page too (bounded gunzip and
// `validatePayload`, src/replay/codec.ts `readSharedPayload`): the page
// needs its fonts (fetched from the page's own origin as the exporter
// fetches them, only families of `FONTS`). A payload the page refuses
// never reaches the frame. Its map is drawn in Desert's tiles, a shared
// run's (ADR 0154 addendum 2026-11-18): the page gives the payload
// Desert's tiles from its own origin before it is posted.
//
// Messages are taken only from the frame's own window with the origin
// `'null'` (an opaque origin): `wc-ready` once (answered with one
// `wc-play`, the payload's bytes and the fonts transferred, and `prefs`:
// `{paused: true}` unless `paused: false` is asked, so the replay starts
// paused, ADR 0155 W1; and `meta`, the publication's title and description
// for the poster, ADR 0162 round 1), `wc-error` and `wc-fullscreen`.
//
// Fullscreen: `allow="fullscreen *"`, not the attribute's default `'src'`
// (the origin of the frame's URL): the sandbox makes the frame's origin
// opaque, which Firefox does not take as the URL's origin, so it refused
// the frame fullscreen ("denied because of FeaturePolicy directives");
// Chromium let it through. The frame goes fullscreen itself, on the
// user's click or key in it; the browser then shows the frame alone.
// Where it cannot (the iPhone has no element fullscreen), it posts
// `{t: 'wc-fullscreen', on}`: the page then lets the frame fill the
// window over the band (`is-filled` on the container), only while the
// page has transient user activation (a click or key in the frame gives
// its ancestors activation too) when turning it on, and answers with
// `{t: 'wc-fs-state', on}`. That is all a frame's message can do.
//
// A tablet's `?fsmode` (stage 73 round 3b, ADR 0160 addendum "round 3b"),
// passed to the frame as `prefs.fsmode`: `frame` as above (the default);
// `fill` the frame always asks for the fill; `page` it asks with
// `{t: 'wc-fullscreen', on: true, how: 'page'}`, and the page, in the
// handler at once (the activation is the tap's), puts its own document in
// element fullscreen and fills it with the frame (`is-filled`); refused,
// the fill stays. Leaving it (the frame's `on: false`, or the system's
// swipe or Esc: `fullscreenchange`) ends the fill and tells the frame.
//
// `relayout` posts `{t: 'wc-relayout', v, debug?}`: the page's window
// changed (a turn, fullscreen left; src/watch/turn.ts), the frame measures
// again (stage 73 round 3); `debug` is the page's `?fsdebug` readout.
// `fsdebug: true` asks the frame for its readout (`prefs.fsdebug`).

import { PAYLOAD_JSON_MAX, PayloadReadError, readSharedPayload } from '../replay/shared';
import { pipe } from '../replay/codec';
import { validatePayload } from '../replay/validate';
import type { ReplayPayload } from '../share/payload';
import { withSharedTiles } from '../share/shared-tiles';
import { fetchReplayFonts } from '../replay/export';
import { exitFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../core/fullscreen';
import { FS_MODE_DEFAULT, type FsMode } from '../core/fs-debug';

/** How many of the fullscreen notes the readout keeps. */
const FS_NOTES_MAX = 5;

/** The frame document's path under the site's base (scripts/frame-html.ts `FRAME_PATH`). */
export const FRAME_PATH = 'r/frame';
export const FRAME_PROTOCOL = 1;
/** Longest error text taken from the frame. */
const ERROR_MAX = 200;

export interface FrameHostOptions {
  /** Where the iframe goes (it fills it). */
  container: HTMLElement;
  /** The payload as served (gzip JSON, ADR 0154 "What is uploaded"); not detached. */
  bytes: ArrayBuffer | Uint8Array;
  /** The site's base URL (default `BASE_URL` against the page). */
  base?: string;
  /** Fetch for the fonts (tests); default the global one. */
  fetch?: (url: string) => Promise<Response>;
  /** The frame could not play the payload (its one-line text). */
  onError?: (text: string) => void;
  /** The frame has the payload (after `wc-play` is posted). */
  onPlay?: () => void;
  /** The publication's words for the poster (its meta; stage 73 round 1). */
  meta?: { title: string; description: string };
  /** The replay starts paused (default true: the watch page's, ADR 0155 W1); Play or Space in the frame starts it. */
  paused?: boolean;
  /** The frame shows the fullscreen-turn readout (the page's `?fsdebug`, stage 73 round 3). */
  fsdebug?: boolean;
  /** A tablet's way into fullscreen (the page's `?fsmode`, stage 73 round 3b); default `frame`. */
  fsmode?: FsMode;
}

export interface FrameHost {
  frame: HTMLIFrameElement;
  /** The fullscreen mode asked for (`?fsmode`; `frame` when none). */
  readonly fsmode: FsMode;
  /** Whether the frame fills the window (`is-filled`: the fill, or the page's own fullscreen). */
  readonly filled: boolean;
  /** What happened to the page's own fullscreen and the fill, latest last (the `?fsdebug` readout). */
  fsNotes(): string[];
  /** Tells the frame the page's window changed: it measures again (`debug`: the page's readout lines). */
  relayout(debug?: string): void;
  /** Removes the frame and stops listening. */
  dispose(): void;
}

/** The site's base URL: `BASE_URL` resolved against the page. */
export function siteBaseUrl(doc: Document = document): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return new URL(base, doc.location?.href ?? doc.baseURI).href;
}

/**
 * The wire form of `retiled` (the payload in Desert's tiles), or of the
 * `original` bytes when the frame would refuse it: its JSON over `max`
 * (`PAYLOAD_JSON_MAX`) or failing `validatePayload` (the frame's checks,
 * the map files' among them). The page accepted the original, so a run it
 * shows never fails in the frame for the retile alone (stage 73 review fix).
 */
export async function retiledWire(retiled: ReplayPayload, original: Uint8Array, max = PAYLOAD_JSON_MAX): Promise<ArrayBuffer> {
  const keep = (why: string): ArrayBuffer => {
    console.warn(`WebCockpit: the shared run plays with its own tiles (${why})`);
    return original.slice().buffer;
  };
  const json = new TextEncoder().encode(JSON.stringify(retiled));
  if (json.byteLength > max) return keep('too large in Desert');
  try {
    validatePayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)));
  } catch {
    return keep('not valid in Desert');
  }
  return (await pipe(json, new CompressionStream('gzip'))).slice().buffer;
}

/**
 * Reads the payload (a `PayloadReadError` when the page refuses it),
 * fetches its fonts, and opens the frame in `o.container`.
 */
export async function openFrame(o: FrameHostOptions): Promise<FrameHost> {
  const doc = o.container.ownerDocument;
  const win = doc.defaultView!;
  const src = o.bytes instanceof Uint8Array ? o.bytes : new Uint8Array(o.bytes);
  const payload = await readSharedPayload(src.slice());
  const base = o.base ?? siteBaseUrl(doc);
  const url = (rel: string): string => new URL(rel, base).href;
  const f = o.fetch ?? ((u: string) => fetch(u));
  const fonts = fetchReplayFonts(payload, f, url).then(
    (list) => list.map((x) => ({ family: x.family, weight: x.weight, ...(x.unicodeRange ? { range: x.unicodeRange } : {}), data: x.data.slice().buffer })),
    // Without its fonts the replay still plays, in the browser's monospace.
    () => [],
  );
  // A shared run's map in Desert's tiles (owner, 2026-11-18; src/share/shared-tiles.ts):
  // a link stores the default tiles, so every payload is retiled here, on
  // the page, which may fetch them; the frame validates the result as any
  // payload. Without them (a fetch failed) it plays with the tiles it has.
  const wire: Promise<ArrayBuffer> = withSharedTiles(payload, { assetBase: url('map/'), fetch: f }).then(
    (p) => (p === payload ? src.slice().buffer : retiledWire(p, src)),
    (err: unknown) => {
      console.warn(`WebCockpit: the shared run plays with its own tiles (${err instanceof Error ? err.message : String(err)})`);
      return src.slice().buffer;
    },
  );

  const frame = doc.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('allow', 'fullscreen *');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('title', 'Replay');
  frame.className = 'wc-watch-frame';
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  let played = false;
  let filled = false;
  const fsmode = o.fsmode ?? FS_MODE_DEFAULT;
  const notes: string[] = [];
  const note = (text: string): void => {
    notes.push(`${text} @${(performance.now() / 1000).toFixed(2)}s`);
    if (notes.length > FS_NOTES_MAX) notes.shift();
  };
  const fill = (on: boolean): void => {
    if (on === filled) return;
    filled = on;
    o.container.classList.toggle('is-filled', on);
    frame.contentWindow?.postMessage({ t: 'wc-fs-state', v: FRAME_PROTOCOL, on }, '*');
  };
  // `?fsmode=page` (stage 73 round 3b): the page's own document in fullscreen, the frame filling
  // it (`is-filled`). Asked for at once in the message's handler: the tap in the frame gave the
  // page its user activation too (HTML's activation notification reaches the ancestors, in
  // Chromium and WebKit). Refused: the fill stays, as `fill`.
  let pageFs = false;
  const root = doc.documentElement;
  const offFs = onFullscreenChange(() => {
    if (isFullscreen(doc, root)) {
      if (!pageFs) note('page fs entered');
      pageFs = true;
    } else if (pageFs) {
      // Left by the system (the swipe, Esc) or by the frame's ask: the frame learns it.
      pageFs = false;
      note('page fs left');
      fill(false);
    }
  }, doc);
  const enterPage = (active: boolean | null): void => {
    note(`page fs asked (activation ${active === null ? '?' : active ? 'yes' : 'no'})`);
    if (!isFullscreen(doc)) {
      void toggleFullscreen(doc).then((ok) => {
        if (!ok) note('page fs refused → fill');
      });
    }
    fill(true);
  };
  const onMessage = (e: MessageEvent): void => {
    if (e.source !== frame.contentWindow || e.origin !== 'null') return;
    const d = e.data as Record<string, unknown> | null;
    if (typeof d !== 'object' || d === null || d.v !== FRAME_PROTOCOL) return;
    if (d.t === 'wc-ready' && !played) {
      played = true;
      void Promise.all([fonts, wire]).then(([list, bytes]) => {
        const target = frame.contentWindow;
        if (!target) return;
        const prefs = { paused: o.paused !== false, ...(o.fsdebug ? { fsdebug: true } : {}), ...(o.fsmode ? { fsmode: o.fsmode } : {}) };
        const meta = o.meta ? { title: o.meta.title, description: o.meta.description } : undefined;
        target.postMessage({ t: 'wc-play', v: FRAME_PROTOCOL, payload: bytes, fonts: list, prefs, ...(meta ? { meta } : {}) }, '*', [bytes, ...list.map((x) => x.data)]);
        o.onPlay?.();
      });
    } else if (d.t === 'wc-error') {
      const text = typeof d.text === 'string' ? d.text.slice(0, ERROR_MAX) : 'This replay could not be played.';
      o.onError?.(text);
    } else if (d.t === 'wc-fullscreen' && typeof d.on === 'boolean') {
      if (!d.on) {
        if (pageFs || isFullscreen(doc, root)) exitFullscreen(doc);
        fill(false);
        return;
      }
      const ua = (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (ua && !ua.isActive) {
        if (o.fsmode) note('fs refused: no user activation');
        return;
      }
      if (d.how === 'page' && fsmode === 'page') enterPage(ua ? true : null);
      else fill(true);
    }
  };
  win.addEventListener('message', onMessage);
  frame.src = url(FRAME_PATH);
  o.container.appendChild(frame);
  return {
    frame,
    fsmode,
    get filled() {
      return filled;
    },
    fsNotes: () => notes.slice(),
    relayout: (debug) => {
      if (!played) return;
      frame.contentWindow?.postMessage({ t: 'wc-relayout', v: FRAME_PROTOCOL, ...(debug !== undefined ? { debug } : {}) }, '*');
    },
    dispose: () => {
      win.removeEventListener('message', onMessage);
      offFs();
      if (pageFs) exitFullscreen(doc);
      o.container.classList.remove('is-filled');
      frame.remove();
    },
  };
}

export { PayloadReadError };
