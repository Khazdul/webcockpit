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
// fetches them, only families of `FONTS`) and the watch page's Download as
// HTML builds from that validated payload. A payload the page refuses
// never reaches the frame.
//
// Messages are taken only from the frame's own window with the origin
// `'null'` (an opaque origin): `wc-ready` once (answered with one
// `wc-play`, the payload's bytes and the fonts transferred), `wc-error`
// and `wc-fullscreen`.
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

import { PayloadReadError, readSharedPayload } from '../replay/shared';
import { fetchReplayFonts } from '../replay/export';
import type { ReplayPayload } from '../share/payload';

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
}

export interface FrameHost {
  frame: HTMLIFrameElement;
  /** The validated payload (Download as HTML builds from it). */
  payload: ReplayPayload;
  /** Removes the frame and stops listening. */
  dispose(): void;
}

/** The site's base URL: `BASE_URL` resolved against the page. */
export function siteBaseUrl(doc: Document = document): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return new URL(base, doc.location?.href ?? doc.baseURI).href;
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

  const frame = doc.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('allow', 'fullscreen *');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('title', 'Replay');
  frame.className = 'wc-watch-frame';
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  let played = false;
  let filled = false;
  const fill = (on: boolean): void => {
    if (on === filled) return;
    filled = on;
    o.container.classList.toggle('is-filled', on);
    frame.contentWindow?.postMessage({ t: 'wc-fs-state', v: FRAME_PROTOCOL, on }, '*');
  };
  const onMessage = (e: MessageEvent): void => {
    if (e.source !== frame.contentWindow || e.origin !== 'null') return;
    const d = e.data as Record<string, unknown> | null;
    if (typeof d !== 'object' || d === null || d.v !== FRAME_PROTOCOL) return;
    if (d.t === 'wc-ready' && !played) {
      played = true;
      void fonts.then((list) => {
        const target = frame.contentWindow;
        if (!target) return;
        const bytes = src.slice().buffer;
        target.postMessage({ t: 'wc-play', v: FRAME_PROTOCOL, payload: bytes, fonts: list }, '*', [bytes, ...list.map((x) => x.data)]);
        o.onPlay?.();
      });
    } else if (d.t === 'wc-error') {
      const text = typeof d.text === 'string' ? d.text.slice(0, ERROR_MAX) : 'This replay could not be played.';
      o.onError?.(text);
    } else if (d.t === 'wc-fullscreen' && typeof d.on === 'boolean') {
      const ua = (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (d.on && ua && !ua.isActive) return;
      fill(d.on);
    }
  };
  win.addEventListener('message', onMessage);
  frame.src = url(FRAME_PATH);
  o.container.appendChild(frame);
  return {
    frame,
    payload,
    dispose: () => {
      win.removeEventListener('message', onMessage);
      o.container.classList.remove('is-filled');
      frame.remove();
    },
  };
}

export { PayloadReadError };
