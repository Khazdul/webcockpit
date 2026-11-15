// Dev server only (src/main.ts): builds HTML replays in the running app,
// for the owner and the browser tests.
//
//   ?replayhtml=<backup fixture>[&session=<id>]
//       restores a runs backup fixture (e.g. runs-demo.jsonl.gz) if its runs
//       are missing, builds the HTML replay of the session `id` (default:
//       the newest session with more than one run, else the newest) with
//       its stored export doc, and opens the file (a blob: URL)
//   ?watchframe=<backup fixture>[&session=<id>]
//       as ?replayhtml=, but plays the payload (with its map subset) in
//       the shared replay's sandboxed frame (src/watch/frame-host.ts,
//       ADR 0154) over the page, as the watch page will
//   __wc.watchFrame({ ...DevReplayOptions, raw? }) → the frame's outcome
//       the same from the console or a test; `raw` plays any JSON object
//       as the payload (it must pass validatePayload on the page and in
//       the frame)
//   __wc.replayHtml({ session?, doc?, logs?, character? }) → HTML text
//       `doc` overrides parts of the stored export doc (title, excludes,
//       comments); `logs` builds from raw `.log` fixtures instead (not
//       stored; e.g. a long Cockpit log, for the file size), `texts` from
//       raw `.log` texts. The map subset of the shell's current map is
//       embedded when the chain has Room.Info (ADR 0020).

import type { Shell } from '../app/shell';
import type { ChainRun } from '../player/timeline';
import type { RunEvent } from '../runs/events';
import type { SettingsStore } from '../settings';
import { type ExportDoc, defaultExportDoc, normalizeExportDoc } from '../share/edits';
import { type ReplayPayload, buildReplayPayload } from '../share/payload';
import { buildReplayHtml } from './export';
import { openFrame, siteBaseUrl } from '../watch/frame-host';

export interface DevReplayOptions {
  session?: string | null;
  doc?: Partial<Pick<ExportDoc, 'title' | 'excludes' | 'comments'>>;
  logs?: string[];
  /** Raw `.log` texts instead of fixtures (the browser tests build their own). */
  texts?: string[];
  character?: string;
}

const fixtureUrl = (rel: string): string => `/__fixtures/${rel.split('/').map(encodeURIComponent).join('/')}`;

async function fixture(rel: string): Promise<Response> {
  const res = await fetch(fixtureUrl(rel));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res;
}

/** The replay payload of the session or logs `o` names (without the map). */
export async function devPayload(shell: Shell, settings: SettingsStore, o: DevReplayOptions = {}): Promise<ReplayPayload> {
  let chain: ChainRun[];
  let events: RunEvent[] = [];
  let doc: ExportDoc;
  if (o.logs?.length || o.texts?.length) {
    const character = o.character ?? 'Replay';
    const texts = o.texts?.length ? o.texts : await Promise.all((o.logs ?? []).map(async (rel) => (await fixture(rel)).text()));
    chain = texts.map((text, i) => {
      const m = /^(\d{16}) /.exec(text);
      const us = m ? Number(m[1]) : Date.now() * 1000;
      return {
        meta: { runId: `${character}/${i}`, character, startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 },
        text,
      };
    });
    doc = defaultExportDoc(chain[0]!.meta.runId);
  } else {
    const lib = await shell.runLibrary();
    const list = await lib.listSessions(Date.now() * 1000);
    const s = o.session ? list.find((x) => x.id === o.session) : (list.find((x) => x.runs.length > 1) ?? list[0]);
    if (!s) throw new Error('no session');
    const ids = s.runs.map((r) => r.runId);
    [chain, events, doc] = await Promise.all([lib.chainLog(ids), lib.events(ids), lib.exportDoc(s.id)]);
  }
  if (o.doc) doc = normalizeExportDoc({ ...doc, ...o.doc }) ?? doc;
  return buildReplayPayload(chain, events, doc, settings.get());
}

/** The HTML replay as a Blob. */
export async function devReplayBlob(shell: Shell, settings: SettingsStore, o: DevReplayOptions = {}): Promise<Blob> {
  return buildReplayHtml(await devPayload(shell, settings, o), {
    map: await shell.maps.source(),
    // No tileset: a replay always draws MMapper's default tiles (ADR 0020
    // addendum 2026-10-10), much smaller than the community sets.
  });
}

/** The HTML replay's text (`__wc.replayHtml`). */
export async function devReplayHtml(shell: Shell, settings: SettingsStore, o: DevReplayOptions = {}): Promise<string> {
  return (await devReplayBlob(shell, settings, o)).text();
}

/** `?replayhtml=`: restores a backup fixture, builds the replay and opens it. */
export async function openReplayFixture(shell: Shell, settings: SettingsStore, rel: string, session: string | null): Promise<void> {
  try {
    await (await shell.runLibrary()).restore(await (await fixture(rel)).blob());
    const blob = await devReplayBlob(shell, settings, { session });
    location.replace(URL.createObjectURL(blob));
  } catch (err) {
    console.error(`WebCockpit: replay fixture ${rel} could not be built`, err);
  }
}

/** What `devWatchFrame` resolves to: the frame played the payload, or its (or the page's) error text. */
export type DevWatchResult = { ok: true } | { ok: false; text: string };

export interface DevWatchOptions extends DevReplayOptions {
  /** Plays this object as the payload instead of building one (tests: hostile payloads). */
  raw?: unknown;
}

/**
 * Plays a payload in the shared replay's frame (src/watch/frame-host.ts)
 * over the whole page (`#wc-dev-watch`, replaced on a second call).
 * Resolves when the frame has the payload or has refused it.
 */
export async function devWatchFrame(shell: Shell, settings: SettingsStore, o: DevWatchOptions = {}): Promise<DevWatchResult> {
  let payload: unknown = o.raw;
  if (payload === undefined) {
    payload = await devPayload(shell, settings, o);
    const source = await shell.maps.source();
    if (source) {
      const { embedReplayMap } = await import('./map-embed');
      payload = await embedReplayMap(payload as ReplayPayload, source, { assetBase: new URL('map/', siteBaseUrl()).href });
    }
  }
  const bytes = await new Response(new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  document.getElementById('wc-dev-watch')?.remove();
  const box = document.createElement('div');
  box.id = 'wc-dev-watch';
  box.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#000';
  document.body.appendChild(box);
  return new Promise<DevWatchResult>((done) => {
    openFrame({ container: box, bytes, base: siteBaseUrl(), onPlay: () => done({ ok: true }), onError: (text) => done({ ok: false, text }) }).catch(
      (err: unknown) => done({ ok: false, text: err instanceof Error ? err.message : String(err) }),
    );
  });
}

/** `?watchframe=`: restores a backup fixture and plays the session in the frame. */
export async function openWatchFixture(shell: Shell, settings: SettingsStore, rel: string, session: string | null): Promise<void> {
  try {
    await (await shell.runLibrary()).restore(await (await fixture(rel)).blob());
    const r = await devWatchFrame(shell, settings, { session });
    if (!r.ok) console.error(`WebCockpit: the frame refused the replay: ${r.text}`);
  } catch (err) {
    console.error(`WebCockpit: watch fixture ${rel} could not be played`, err);
  }
}
