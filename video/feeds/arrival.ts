// Gittan arrives in the game (part 1's end, ADR 0133 addendum): what MUME
// sends after the password, then the first seconds of the owner's Bree run.
//
// MUME's post-login text was never captured (that would mean logging in
// with real credentials), and no session log here has a fresh login: the
// owner's Cockpit logs start after it, and the one login in them is a
// reconnect ("Reconnecting.", the room, MUME's Discord notice). So the
// arrival is staged from the run itself, kept minimal: the room as the
// run's GMCP has it at login (Room.Info, Room.Chars.Set: Lodging Foyer,
// Barliman, the pony, an elite guard; Gittan plays in brief mode, so no
// description), MUME's Discord notice as it follows the room in that
// Cockpit log, and the run's first prompt. With it go all the run's GMCP
// before its start (`prime`): Char.Name turns the client to playing.
//
// Then the run plays on from 0.5 s (its first lines, two `Ok.` for the
// owner's start-up script, are left out; their GMCP still comes): the guard
// leaves south, Gittan looks (`l`), leads the pony (`lead pony`).
import { type Step, lineBytes } from '../../scripts/lib/mume-feed.ts';
import { type Excerpt, excerptFeed, loadBackup } from '../record/lib/run-feed.ts';
import { BREE_RUN, FILM_BACKUP } from './film.ts';

/** The run's first seconds after the arrival, up to just before `gro pony` (8.6 s). */
export const ARRIVAL_EXCERPT: Excerpt = { run: BREE_RUN, from: 0.5, to: 8.5, dropCmds: [/^change width/] };

/** MUME's notice after the room on a (re)connect, from the owner's Cockpit log (2026-09-26). */
const DISCORD = 'MUME has a community _Discord_ channel that you can reach at \x1b[33mhttps://discord.gg/XkZN55am9a\x1b[0m';

export interface Arrival {
  /** At once after the password: the GMCP before the run and the staged room. */
  arrive: Step;
  /** The run from `ARRIVAL_EXCERPT.from`, timed from that second. */
  steps: Step[];
  /** The run's second the steps' time 0 stands for. */
  from: number;
}

export function arrival(): Arrival {
  const runs = loadBackup(FILM_BACKUP);
  const run = runs.get(BREE_RUN)!;
  const feed = excerptFeed(runs, ARRIVAL_EXCERPT);
  // the room at login, from the GMCP before the run's start
  let room = 'Lodging Foyer';
  let exits = 'south';
  let people: string[] = [];
  for (const l of run.lines) {
    if (l.us >= run.meta.startedUs) break;
    if (l.body.startsWith('\x1bGMCP Room.Info ')) {
      const info = JSON.parse(l.body.slice('\x1bGMCP Room.Info '.length)) as { name: string; exits: Record<string, unknown> };
      room = info.name;
      const names: Record<string, string> = { n: 'north', e: 'east', s: 'south', w: 'west', u: 'up', d: 'down' };
      exits = Object.keys(info.exits).map((k) => names[k] ?? k).join(', ');
    } else if (l.body.startsWith('\x1bGMCP Room.Chars.Set ')) {
      people = (JSON.parse(l.body.slice('\x1bGMCP Room.Chars.Set '.length)) as { desc: string }[]).map((c) => c.desc);
    }
  }
  const text = ['', `\x1b[32m${room}\x1b[0m`, ...people, `Exits: ${exits}.`, '', DISCORD, '', '', '![>'];
  const arrive: Step = { out: Buffer.concat([...feed.prime.map((s) => ('out' in s ? s.out : Buffer.alloc(0))), ...text.map(lineBytes)]) };
  return { arrive, steps: feed.steps, from: ARRIVAL_EXCERPT.from };
}
