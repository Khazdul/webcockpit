// The Character pane film's private backup (video/manuscript-character.md,
// stage 78): Gittan's run of 2026-11-25 from its run-log text export, in the
// runs backup format record/lib/run-feed.ts reads (src/runs/library.ts):
//
//   node record/character-runs.ts ~/Downloads/Gittan-2026-11-25T18-59-11.log
//
// writes video/private/character-runs.jsonl.gz (gitignored, never committed).
//
// The export is the capture's own line format, `<16-digit µs> <body>`, one
// line each. The run's `startedUs` is its first line, so an excerpt's
// seconds (feeds/character.ts) are the manuscript's log seconds
// (`enter coach` at 55.4).
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { CHARACTER_BACKUP, CHARACTER_RUN } from '../feeds/character.ts';

const src = process.argv[2];
if (!src) throw new Error('usage: node record/character-runs.ts <Gittan-2026-11-25T18-59-11.log>');
const lines = readFileSync(src, 'utf8')
  .split('\n')
  .filter((l) => l.length >= 17 && l[16] === ' ' && /^\d{16}$/.test(l.slice(0, 16)));
if (!lines.length) throw new Error('no timestamped lines in the export');
const firstUs = Number(lines[0]!.slice(0, 16));
const lastUs = Number(lines.at(-1)!.slice(0, 16));
const meta = { runId: CHARACTER_RUN, character: 'Gittan', startedUs: firstUs, endedUs: lastUs, sealed: true };
const out = [
  JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: Date.now() * 1000 }),
  JSON.stringify({ type: 'run', run: meta }),
  JSON.stringify({ type: 'chunk', runId: CHARACTER_RUN, seq: 0, firstUs, lastUs, text: `${lines.join('\n')}\n` }),
];
writeFileSync(CHARACTER_BACKUP, gzipSync(Buffer.from(`${out.join('\n')}\n`, 'utf8')));
console.log(`${CHARACTER_BACKUP}: ${CHARACTER_RUN}, ${lines.length} lines, ${((lastUs - firstUs) / 1e6).toFixed(1)} s`);
