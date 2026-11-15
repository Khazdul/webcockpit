// Real replay payloads for the validator and fuzz tests (ADR 0154): every
// session of the runs demo backup and every `.log` fixture, built by the
// exporter's own `buildReplayPayload`, and an older schema-1 file's shape.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunLibrary } from '../../src/runs/library';
import { defaultSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { type ReplayPayload, buildReplayPayload } from '../../src/share/payload';
import type { ChainRun } from '../../src/player/timeline';

// A path, not a URL: happy-dom's URL is not the one `readFileSync` takes.
const FIXTURES = join(import.meta.dirname, '../fixtures');
const LOGS = ['gmcp-demo.log', 'map-demo.log', 'timers-demo.log', 'colour-chart.log'];

/** The payload of one `.log` fixture, as `__wc.replayHtml({ logs })` builds it (src/replay/dev.ts). */
export function logPayload(name: string, over: Partial<ReturnType<typeof defaultExportDoc>> = {}): ReplayPayload {
  const text = readFileSync(join(FIXTURES, name), 'utf8');
  const m = /^(\d{16}) /.exec(text);
  const us = m ? Number(m[1]) : 1_790_000_000_000_000;
  const chain: ChainRun[] = [
    { meta: { runId: `Rasta/${name}`, character: 'Rasta', startedUs: us, endedUs: null, sealed: true, bytes: text.length, lines: 0 }, text },
  ];
  return buildReplayPayload(chain, [], { ...defaultExportDoc(chain[0]!.meta.runId), ...over }, defaultSettings());
}

/** Every session of the runs demo backup, as the export editor builds it (with its stored doc, and once cut and commented). */
export async function demoPayloads(): Promise<ReplayPayload[]> {
  const lib = await RunLibrary.open(new IDBFactory(), { locks: null, storage: null });
  await lib.restore(new Blob([readFileSync(join(FIXTURES, 'runs-demo.jsonl.gz'))]));
  const out: ReplayPayload[] = [];
  for (const s of await lib.listSessions(Date.now() * 1000)) {
    const ids = s.runs.map((r) => r.runId);
    const [chain, events, doc] = await Promise.all([lib.chainLog(ids), lib.events(ids), lib.exportDoc(s.id)]);
    out.push(buildReplayPayload(chain, events, doc, defaultSettings()));
    const first = chain[0]!.meta.startedUs;
    out.push(
      buildReplayPayload(
        chain,
        events,
        {
          ...doc,
          title: 'A cut <img src=x onerror=alert(1)>',
          excludes: [[first + 30e6, first + 90e6]],
          comments: [{ beforeUs: first + 120e6, text: 'Look <b>here</b>' }],
        },
        defaultSettings(),
      ),
    );
  }
  return out;
}

/**
 * A payload in the shape of the first schema-1 files (2026-09-28): every
 * run with its whole `RunMeta`, markers without tips, no `hiddenSys`, no
 * map, every settings section (the phone's too).
 */
export function oldShape(p: ReplayPayload): unknown {
  const old = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
  old.runs = p.runs.map((r, i) => ({
    meta: { runId: `Rasta/${i}`, character: 'Rasta', startedUs: r.meta.startedUs, endedUs: null, sealed: true, bytes: r.text.length, lines: 3, summary: r.meta.summary ?? null },
    text: r.text,
  }));
  old.markers = p.markers.map((m) => ({ us: m.us, kind: m.kind }));
  delete old.hiddenSys;
  old.settings = defaultSettings();
  return old;
}

export const LOG_FIXTURES = LOGS;
