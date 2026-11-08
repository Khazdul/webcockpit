// What the film's excerpts come to (feeds/film.ts), without their content:
//
//   node record/feed-info.ts            every excerpt
//   node record/feed-info.ts wolf -v    one, with its commands and times (local use)
import { EXCERPTS, type ExcerptName, FILM_BACKUP } from '../feeds/film.ts';
import { excerptFeed, loadBackup } from './lib/run-feed.ts';

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const names = (args.filter((a) => !a.startsWith('-')) as ExcerptName[]).filter((n) => n in EXCERPTS);
const runs = loadBackup(FILM_BACKUP);
for (const [id, r] of runs) console.log(`${id}  ${r.lines.length} lines`);
for (const name of names.length ? names : (Object.keys(EXCERPTS) as ExcerptName[])) {
  const f = excerptFeed(runs, EXCERPTS[name]);
  const cmds = f.steps.filter((s) => 'cmd' in s);
  const bytes = f.steps.reduce((n, s) => n + ('out' in s ? s.out.length : 0), 0);
  const prime = f.prime.reduce((n, s) => n + ('out' in s ? s.out.length : 0), 0);
  console.log(`${name}: ${(f.durationMs / 1000).toFixed(1)} s, ${f.steps.length} steps, ${cmds.length} commands, ${bytes} bytes; prime ${prime} bytes`);
  if (verbose) for (const s of f.steps) console.log(`  ${((s.at ?? 0) / 1000).toFixed(2).padStart(6)}  ${'cmd' in s ? `> ${s.cmd}` : `${s.out.length} bytes`}`);
}
