// The HTML replay page (ADR 0019 "Replay payload and the HTML replay",
// Inv §7.7). The exported file carries the payload (gzip + base64 JSON in
// `<script type="application/json" id="wc-replay-payload">`) and this
// runtime as one IIFE (src/replay/main.ts, bundled as `replay/replay.js`).
// It runs the in-app log player: `PlayerHost` (a player App per open or
// backward seek) and `PlayerView`, with the replay's mode options:
//
// - header `<title> · <char> (L<lvl>) · YYYY-MM-DD`, hints `Space Play ·
//   ← → 10 s · ↑↓ Scroll · 1–6 Speed · F Fullscreen` (they give way when
//   narrow);
// - no ESC Back and no Close: ESC leaves fullscreen (the browser usually
//   does that itself), `F` and the control box's Fullscreen icon toggle it;
// - `MM:SS` beside the pointer over the rail; comment holds and cuts from
//   the payload (`payloadEdits`).
// The chrome is the in-app player's (stage 32c, ADR 0114): its CSS and
// icons are bundled into the runtime, nothing is fetched.
//
// The page may be opened from `file://` with no network and no storage
// (a browser may even throw on `localStorage`). Nothing here touches
// IndexedDB, localStorage, sessionStorage, fetch or WebSocket: the settings
// are an in-memory store holding the payload's settings, the player App
// is built with every store and socket injected (src/app/app.ts `player`).
// The Map pane shows the embedded map subset (src/replay/map-host.ts,
// ADR 0020), started in the inline blob worker.
//
// The lens (stage 71, ADR 0160): every shared run is played with the map
// as a lens, always on (`PlayerHostOptions.lens`), Group and Timers off at
// the start and reached from it. On a phone or tablet (src/replay/phone.ts)
// in the phone's layout: the lens has the fullscreen key, the control box
// has neither Fullscreen nor Panes. On a computer the desktop lens
// (src/player/desk-lens.ts): the box keeps Fullscreen, and its Panes popup
// turns Map (the lens, on at the start), Group and Timers on and off (stage
// 73).

import { PlayerHost } from '../app/player-host';
import { type Settings, SettingsStore, migrateSettings } from '../settings';
import { playAtLogUs } from '../player/timeline';
import type { Wall } from '../player/engine';
import type { PlayerHeaderModel } from '../player/view';
import type { HeaderHint } from '../player/strip';
import { type ReplayPayload, payloadEdits } from '../share/payload';
import { SHARED_PANES, needsShared, sharedPayload } from '../share/shared-panes';
import { applyTheme } from '../theme/apply';
import { exitFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../core/fullscreen';
import { PAYLOAD_ELEMENT_ID, decodePayload } from './codec';
import { validatePayload } from './validate';
import { fmtDate, replayTitle } from './title';
import { replayMapHost } from './map-host';
import { replayPhone } from './phone';
import type { PlayerPhone } from '../app/player-host';
import { type Poster, mountPoster } from './poster';

/** Header hints; all of them give way when narrow (Inv §7.7). */
export const REPLAY_HINTS: ReadonlyArray<HeaderHint> = [
  { text: 'Space Play', drop: 5 },
  { text: '← → 10 s', drop: 4 },
  { text: '↑↓ Scroll', drop: 1 },
  { text: '1–6 Speed', drop: 2 },
  { text: 'F Fullscreen', drop: 3 },
];

/** Longest title shown in the header (the full one is the page title). */
export const HEADER_TITLE_MAX = 60;

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * The replay's header: `<title> · <char> · YYYY-MM-DD` and the replay hints.
 * No level (owner, stage 65): a shared run names the character only.
 */
export function replayHeader(p: ReplayPayload): PlayerHeaderModel {
  const who = p.character;
  const left = p.title
    ? [{ text: clip(p.title, HEADER_TITLE_MAX), cls: 'wc-player-name' }, { text: who }]
    : [{ text: who, cls: 'wc-player-name' }];
  return { left: [...left, { text: fmtDate(p.startUs) }], hints: REPLAY_HINTS };
}

// ------------------------------------------------------------------ start

export interface ReplayPage {
  host: PlayerHost;
  payload: ReplayPayload;
  settings: SettingsStore;
  /** The poster (stage 73, ADR 0162) while the run waits under it; null without one. */
  poster: Poster | null;
}

/** Shows a one-line notice in place of the player (a damaged file). */
export function fail(root: HTMLElement, text: string): void {
  root.textContent = '';
  const p = root.ownerDocument.createElement('div');
  p.className = 'wc-replay-error';
  p.textContent = text;
  root.appendChild(p);
}

/** Decodes the embedded payload and starts playing it in `root`. */
export async function startReplay(doc: Document = document): Promise<ReplayPage | null> {
  const root = doc.getElementById('app') ?? doc.body;
  let payload: ReplayPayload;
  try {
    const el = doc.getElementById(PAYLOAD_ELEMENT_ID);
    if (!el?.textContent) throw new Error('no payload');
    payload = validatePayload(await decodePayload(el.textContent));
  } catch (err) {
    fail(root, `This replay could not be read (${err instanceof Error ? err.message : String(err)}).`);
    return null;
  }
  const phone = doc.defaultView ? await replayPhone(doc.defaultView) : undefined;
  // The file opens under its poster, paused at the start (stage 73, ADR 0162).
  return openReplay(doc, root, payload, { poster: true, ...(phone ? { phone } : {}) });
}

/**
 * What the Fullscreen button, `F` and Esc do. The file's own: the
 * document's fullscreen. The shared replay's frame passes its own
 * (src/replay/frame.ts `frameFullscreen`).
 */
export interface ReplayFullscreen {
  is(): boolean;
  toggle(): void;
  exit(): void;
  onChange(fn: () => void): void;
}

function docFullscreen(doc: Document): ReplayFullscreen {
  return {
    is: () => isFullscreen(doc),
    toggle: () => void toggleFullscreen(doc),
    exit: () => exitFullscreen(doc),
    onChange: (fn) => void onFullscreenChange(fn, doc),
  };
}

/**
 * Plays `payload` in `root` (the page, and tests that skip the decoding;
 * `wall`: a test's clock; `autoplay: false`: opens paused at the start).
 * A shared run (stage 65): only Map, Timers and Group, each off at the
 * start; a payload made before that (more panes, some on) is played the
 * same way (`sharedPayload`, src/share/shared-panes.ts, when `needsShared`).
 * `poster: true` (the file and the watch page's frame): the run opens
 * paused at its start under the poster (src/replay/poster.ts), which
 * starts it when clicked; `autoplay` is then not read.
 */
export function openReplay(
  doc: Document,
  root: HTMLElement,
  given: ReplayPayload,
  o: { wall?: Wall; fullscreen?: ReplayFullscreen; autoplay?: boolean; phone?: PlayerPhone; poster?: boolean } = {},
): ReplayPage {
  // A payload shared since W3 is already as a shared run carries it: no second pass over its text (review fix 2 CR6).
  const payload = needsShared(given) ? sharedPayload(given) : given;
  const fs = o.fullscreen ?? docFullscreen(doc);
  doc.title = replayTitle(payload);
  // In memory only: no IndexedDB, no localStorage mirror, no pagehide flush.
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  void settings.load();
  const s: Settings = migrateSettings(payload.settings, { recorded: true });
  settings.update(() => s as never);
  applyTheme(settings.get());
  root.textContent = '';
  // Made before the player, so its key listener runs before the player's.
  let host: PlayerHost | null = null;
  const poster = o.poster
    ? mountPoster(doc, { title: payload.title, character: payload.character, startUs: payload.startUs, durationMs: 0 }, () =>
        host?.engine?.play(),
      )
    : null;
  host = new PlayerHost({
    root,
    settings,
    onClose: () => {},
    map: replayMapHost(payload.map),
    panes: SHARED_PANES,
    lens: { fullscreen: fs },
    ...(o.phone ? { phone: o.phone } : {}),
    ...(o.wall ? { wall: o.wall } : {}),
  });
  host.openChain(
    payload.runs,
    [],
    { character: payload.character, level: payload.level },
    {
      edits: payloadEdits(payload),
      ...(o.autoplay === false || poster ? { autoplay: false } : {}),
      ...(payload.hiddenSys?.length ? { hiddenSys: payload.hiddenSys } : {}),
      marks: (tl) => payload.markers.map((m) => ({ letter: m.kind, offset: playAtLogUs(tl, m.us), tip: m.tip })),
      view: {
        header: () => replayHeader(payload),
        onEsc: () => fs.exit(),
        keys: (e) => {
          if (e.ctrlKey || e.altKey || e.metaKey || (e.key !== 'f' && e.key !== 'F')) return false;
          fs.toggle();
          return true;
        },
        railHoverTime: true,
        closeTitle: null,
        // A phone has Fullscreen on the lens (stage 71); a computer keeps it in the box.
        boxButtons: o.phone
          ? []
          : [
              {
                label: () => (fs.is() ? 'Exit fullscreen (F)' : 'Fullscreen (F)'),
                icon: () => (fs.is() ? 'fullscreenExit' : 'fullscreen'),
                onClick: () => fs.toggle(),
              },
            ],
      },
      // A computer has the Panes popup (Map, the lens, Group and Timers; stage 73); a phone the lens's panes key (stage 71).
      viewerSettings: o.phone ? 'display' : true,
    },
  );
  if (poster) {
    const engine = host.engine;
    // What the run shows at its start is drawn under the poster (a seek delivers it).
    engine?.seek(0);
    poster.setLength(engine?.duration ?? 0);
  }
  const h = host;
  const refresh = (): void => {
    h.playerView?.refresh();
    h.refreshLens();
  };
  fs.onChange(refresh);
  return { host: h, payload, settings, poster };
}
