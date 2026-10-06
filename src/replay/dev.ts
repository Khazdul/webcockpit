// Dev server only (src/main.ts): builds HTML replays in the running app,
// for the owner and the browser tests.
//
//   ?replayhtml=<backup fixture>[&session=<id>]
//       restores a runs backup fixture (e.g. runs-demo.jsonl.gz) if its runs
//       are missing, builds the HTML replay of the session `id` (default:
//       the newest session with more than one run, else the newest) with
//       its stored export doc, and opens the file (a blob: URL)
//   __wc.replayHtml({ session?, doc?, logs?, character? }) → HTML text
//       `doc` overrides parts of the stored export doc (title, excludes,
//       comments); `logs` builds from raw `.log` fixtures instead (not
//       stored; e.g. a long Cockpit log, for the file size), `texts` from
//       raw `.log` texts. The map subset of the shell's current map is
//       embedded when the chain has Room.Info (ADR 0020).

import type { Shell } from '../app/shell';
import { currentOverlay } from '../map/tilesets';
import type { ChainRun } from '../player/timeline';
import type { RunEvent } from '../runs/events';
import type { SettingsStore } from '../settings';
import { type ExportDoc, defaultExportDoc, normalizeExportDoc } from '../share/edits';
import { buildReplayPayload } from '../share/payload';
import { buildReplayHtml } from './export';

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

/** The HTML replay as a Blob. */
export async function devReplayBlob(shell: Shell, settings: SettingsStore, o: DevReplayOptions = {}): Promise<Blob> {
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
  return buildReplayHtml(buildReplayPayload(chain, events, doc, settings.get()), {
    map: await shell.maps.source(),
    tileset: currentOverlay(settings.get().mapper.tileset),
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
