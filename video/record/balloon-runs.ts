// The balloon film's second private backup (video/manuscript-balloons.md,
// "Sources"): Rasta's run from the owner's replay export, in the runs
// backup format record/lib/run-feed.ts reads (src/runs/library.ts):
//
//   node record/balloon-runs.ts ~/Downloads/mume-Rasta-2026-11-21T21-47-52\(1\).html
//
// writes video/private/balloon-runs.jsonl.gz (gitignored, never committed).
//
// The export (src/replay/) carries its payload in
// `<script id="wc-replay-payload">` as base64 of gzipped JSON: `startUs`,
// `runs[]` (`{ meta: { startedUs, summary }, text }`, the text in the
// backup chunks' timestamped line format), `markers`, `cuts`. The film uses
// `runs[1]`. Its run meta gets the export's own `startUs` as `startedUs`, so
// an excerpt's seconds (feeds/balloons.ts) are seconds from the export's
// start, as the export's player counts them (Morgrim's kill at 2382 s).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { BALLOON_BACKUP, RASTA_RUN } from '../feeds/balloons.ts';

interface Payload {
  startUs: number;
  character: string;
  runs: { meta: { startedUs: number; summary?: Record<string, unknown> }; text: string }[];
}

const src = process.argv[2];
if (!src) throw new Error('usage: node record/balloon-runs.ts <the Rasta export .html>');
const html = readFileSync(src, 'utf8');
const m = /<script[^>]*id="wc-replay-payload"[^>]*>([^<]*)<\/script>/.exec(html);
if (!m) throw new Error('no wc-replay-payload script in the export');
const payload = JSON.parse(gunzipSync(Buffer.from(m[1]!.trim(), 'base64')).toString('utf8')) as Payload;
const run = payload.runs[1];
if (!run) throw new Error('the export has no second run');
const lines = run.text.split('\n').filter((l) => l.length >= 17 && l[16] === ' ');
const firstUs = Number(lines[0]!.slice(0, 16));
const lastUs = Number(lines.at(-1)!.slice(0, 16));
const meta = { runId: RASTA_RUN, character: payload.character, startedUs: payload.startUs, endedUs: lastUs, sealed: true, ...(run.meta.summary ? { summary: run.meta.summary } : {}) };
const out = [
  JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: Date.now() * 1000 }),
  JSON.stringify({ type: 'run', run: meta }),
  JSON.stringify({ type: 'chunk', runId: RASTA_RUN, seq: 0, firstUs, lastUs, text: `${lines.join('\n')}\n` }),
];
writeFileSync(BALLOON_BACKUP, gzipSync(Buffer.from(`${out.join('\n')}\n`, 'utf8')));
console.log(`${BALLOON_BACKUP}: ${RASTA_RUN}, ${lines.length} lines, ${((lastUs - payload.startUs) / 1e6).toFixed(0)} s from the export's start`);
