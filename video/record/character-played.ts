// The Character pane film's game text as played, for the owner to edit
// (stage 78; round 2's file was made by a one-off script, this is its
// keeper):
//
//   node record/character-played.ts ~/Downloads/Gittan-2026-11-25T18-59-11.log ~/Downloads/character-film-r3-spellogg.txt
//
// Columns: film time | id | text. `Lnnnn` = line nnnn of the run log
// (1-based, every line counted, GMCP and VIEW lines included); `S-…` = the
// staged items of feeds/character.ts. The lines the owner's edit left out
// (DELETED_LINES) and the clicks' run commands are not listed; GMCP is not
// shown. Film times: `takeOf` of each line, plus the title's 7 s; a staged
// item at its own time. Clicks are at their run command's time (the press
// itself is within a few tenths of it).
import { readFileSync, writeFileSync } from 'node:fs';
import * as F from '../feeds/character.ts';

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: node record/character-played.ts <run log> <out.txt>');
const raw = readFileSync(src, 'utf8').split('\n').filter((l) => l.length);
const t0 = Number(raw[0]!.split(' ')[0]);
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
/** The film's 0 is the title's; the take starts at 7 s. */
const FILM = 7;
type Row = { film: number; id: string; text: string };
const rows: Row[] = [];
const dropped = (log: number): boolean => F.DROPS.some(([a, b]) => log >= a && log <= b) || F.CLICKS.some((c) => log >= c.drop[0] && log <= c.drop[1]);
const deleted = (n: number): boolean => F.DELETED_LINES.some(([a, b]) => n >= a && n <= b);

raw.forEach((l, i) => {
  const sp = l.indexOf(' ');
  const log = (Number(l.slice(0, sp)) - t0) / 1e6;
  const text = (sp < 0 ? '' : l.slice(sp + 1)).replace(/^\x1b(?=GMCP |VIEW |SIZE )/, '');
  if (/^(GMCP|VIEW|SIZE) /.test(text)) return;
  if (log < F.PRE_LOG_S || log >= F.END_LOG_S || dropped(log) || deleted(i + 1)) return;
  rows.push({ film: F.takeOf(log) + FILM, id: `L${String(i + 1).padStart(4, '0')}`, text: strip(text) });
});
rows.push({ film: FILM - 0.01, id: 'S-look', text: `> ${F.LOOK.cmd}` });
F.LOOK.lines.forEach((t, k) => rows.push({ film: FILM - 0.009 + k * 1e-4, id: 'S-look', text: strip(t) }));
for (const n of F.NARRATES) rows.push({ film: n.at + FILM, id: 'S-narr', text: `${n.talker} narrates '${n.words}'` });
for (const n of F.OWN_NARRATES) {
  rows.push({ film: n.at + FILM, id: 'S-own', text: `> narr ${n.words}` });
  rows.push({ film: n.at + FILM + F.ANSWER_LAG_S, id: 'S-own', text: 'Ok.' });
}
for (const c of F.CLICKS)
  for (const s of c.steps) {
    const at = F.takeOf(c.log) + FILM;
    rows.push({ film: at, id: 'S-click', text: `[click on ${c.field}] ${s.sends}` });
    s.lines.forEach((t, k) => rows.push({ film: at + F.ANSWER_LAG_S + k * 1e-4, id: 'S-click', text: t }));
  }
rows.push({ film: F.ACHIEVEMENT.at + FILM, id: 'S-achv', text: `Achievement unlocked: ${F.ACHIEVEMENT.what}` });
rows.sort((a, b) => a.film - b.film);

const mmss = (s: number): string => {
  const t = Math.round(s * 10) / 10;
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
};
const head = `# The Character pane film, round 3: the game window's text as played.
# Columns: film time | id | text. Edit the text freely; delete a line to drop it;
# add a line with id "NEW" (and a film time) to add one. Keep the id column.
# Ids: Lnnnn = line nnnn of Gittan-2026-11-25T18-59-11.log; S-look = the staged
# "l" at Mason Road; S-narr / S-own = staged narrates (others / Gittan's typed
# narr); S-click = a click on the card and MUME's answer; S-achv = the
# achievement. "> cmd" = a typed command. GMCP is not shown (it follows its line).
# Colours are left out here; narrates are yellow in the film.
`;
writeFileSync(out, `${head}\n${rows.map((r) => `${mmss(r.film).padStart(6)} | ${r.id.padEnd(7)} | ${r.text}`).join('\n')}\n`);
console.log(`${out}: ${rows.length} rows`);
