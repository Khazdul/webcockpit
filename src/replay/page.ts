// The HTML replay page (ADR 0019 "Replay payload and the HTML replay",
// Inv §7.7). The exported file carries the payload (gzip + base64 JSON in
// `<script type="application/json" id="wc-replay-payload">`) and this
// runtime as one IIFE (src/replay/main.ts, bundled as `replay/replay.js`).
// It runs the in-app log player: `PlayerHost` (a player App per open or
// backward seek) and `PlayerView`, with the replay's mode options:
//
// - header `<title> · <char> (L<lvl>) · YYYY-MM-DD`, hints `Space Play ·
//   ↑↓ Scroll · 1–6 Speed · F Fullscreen` (they give way when narrow);
// - no ESC Back: ESC leaves fullscreen (the browser usually does that
//   itself), `F` and the control box's `Fullscreen` / `Exit fullscreen`
//   toggle it;
// - `MM:SS` beside the pointer over the strip; comment holds and cuts from
//   the payload (`payloadEdits`).
//
// The page may be opened from `file://` with no network and no storage
// (a browser may even throw on `localStorage`). Nothing here touches
// IndexedDB, localStorage, sessionStorage, fetch or WebSocket: the settings
// are an in-memory store holding the payload's settings, the player App
// is built with every store and socket injected (src/app/app.ts `player`).
// The Map pane shows the embedded map subset (src/replay/map-host.ts,
// ADR 0020), started in the inline blob worker.

import { PlayerHost } from '../app/player-host';
import { type Settings, SettingsStore, migrateSettings } from '../settings';
import { playAtLogUs } from '../player/timeline';
import type { PlayerHeaderModel } from '../player/view';
import type { HeaderHint } from '../player/strip';
import { type ReplayPayload, payloadEdits } from '../share/payload';
import { applyTheme } from '../theme/apply';
import { PAYLOAD_ELEMENT_ID, decodePayload } from './codec';
import { fmtDate, replayTitle } from './title';
import { replayMapHost } from './map-host';

/** Header hints; all of them give way when narrow (Inv §7.7). */
export const REPLAY_HINTS: ReadonlyArray<HeaderHint> = [
  { text: 'Space Play', drop: 4 },
  { text: '↑↓ Scroll', drop: 1 },
  { text: '1–6 Speed', drop: 2 },
  { text: 'F Fullscreen', drop: 3 },
];

/** Longest title shown in the header (the full one is the page title). */
export const HEADER_TITLE_MAX = 60;

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** The replay's header: `<title> · <char> (L<lvl>) · YYYY-MM-DD` and the replay hints. */
export function replayHeader(p: ReplayPayload): PlayerHeaderModel {
  const who = p.character + (p.level !== undefined ? ` (L${p.level})` : '');
  const left = p.title
    ? [{ text: clip(p.title, HEADER_TITLE_MAX), cls: 'wc-player-name' }, { text: who }]
    : [{ text: who, cls: 'wc-player-name' }];
  return { left: [...left, { text: fmtDate(p.startUs) }], hints: REPLAY_HINTS };
}

// ------------------------------------------------------------- fullscreen

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

export function isFullscreen(doc: Document): boolean {
  const d = doc as FsDocument;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export function exitFullscreen(doc: Document): void {
  if (!isFullscreen(doc)) return;
  const d = doc as FsDocument;
  if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
  else d.webkitExitFullscreen?.();
}

export function toggleFullscreen(doc: Document): void {
  if (isFullscreen(doc)) return exitFullscreen(doc);
  const el = doc.documentElement as FsElement;
  if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
  else el.webkitRequestFullscreen?.();
}

// ------------------------------------------------------------------ start

export interface ReplayPage {
  host: PlayerHost;
  payload: ReplayPayload;
  settings: SettingsStore;
}

/** Shows a one-line notice in place of the player (a damaged file). */
function fail(root: HTMLElement, text: string): void {
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
    payload = await decodePayload(el.textContent);
  } catch (err) {
    fail(root, `This replay could not be read (${err instanceof Error ? err.message : String(err)}).`);
    return null;
  }
  return openReplay(doc, root, payload);
}

/** Plays `payload` in `root` (the page, and tests that skip the decoding). */
export function openReplay(doc: Document, root: HTMLElement, payload: ReplayPayload): ReplayPage {
  doc.title = replayTitle(payload);
  // In memory only: no IndexedDB, no localStorage mirror, no pagehide flush.
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  void settings.load();
  const s: Settings = migrateSettings(payload.settings);
  settings.update(() => s as never);
  applyTheme(settings.get());
  root.textContent = '';
  const host = new PlayerHost({ root, settings, onClose: () => {}, map: replayMapHost(payload.map) });
  host.openChain(
    payload.runs,
    [],
    { character: payload.character, level: payload.level },
    {
      edits: payloadEdits(payload),
      ...(payload.hiddenSys?.length ? { hiddenSys: payload.hiddenSys } : {}),
      marks: (tl) => payload.markers.map((m) => ({ letter: m.kind, offset: playAtLogUs(tl, m.us), tip: m.tip })),
      view: {
        header: () => replayHeader(payload),
        onEsc: () => exitFullscreen(doc),
        keys: (e) => {
          if (e.ctrlKey || e.altKey || e.metaKey || (e.key !== 'f' && e.key !== 'F')) return false;
          toggleFullscreen(doc);
          return true;
        },
        stripHoverTime: true,
        boxButtons: [
          {
            label: () => (isFullscreen(doc) ? 'Exit fullscreen' : 'Fullscreen'),
            onClick: () => toggleFullscreen(doc),
          },
        ],
      },
    },
  );
  const refresh = (): void => host.playerView?.refresh();
  doc.addEventListener('fullscreenchange', refresh);
  doc.addEventListener('webkitfullscreenchange', refresh);
  return { host, payload, settings };
}
