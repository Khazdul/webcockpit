// The balloon film's game (video/manuscript-balloons.md, draft 2): one take
// with Gittan at the fountain in Bree. Run seconds and staged lines only;
// the run's text stays in the gitignored video/private/.
//
// Times are take seconds from the fade-in's first frame.
//
// - The window is filled off camera with the run's own text up to her
//   arrival at the fountain; `dr water` is the first thing on camera.
// - The life in the room is staged in the forms of the owner's runs (2026-10
//   and 11): an arrival or a leave is plain text, with Room.Chars.Add or
//   Remove; a narrate is yellow (33) and a say cyan (36), each with
//   Comm.Channel.Text in plain text. Every block is the runs' own: an empty
//   line, the line, an empty line, the GMCP, the prompt. NPCs are the ones
//   seen in Bree in that run, with their own room lines; players are invented.
// - Every balloon is the client's own sample, sent by the typed command.
import { type Step, gmcpBytes, lineBytes } from '../../scripts/lib/mume-feed.ts';
import type { Excerpt } from '../record/lib/run-feed.ts';
import { BREE_RUN, noPonyLabel } from './film.ts';

/** The run up to the fountain (the sign of the Prancing Pony, 15.7 s) and her `whe` there: off camera. */
export const PREFEED: Excerpt = {
  run: BREE_RUN,
  from: -0.01,
  to: 16.6,
  rewrite: noPonyLabel,
  // the pony's label and its "Ok." (film 1, owner round 1: no label in the films)
  drop: [[12.05, 12.3]],
};

/** On camera: `dr water` at `at`, and MUME's answer from the run. */
export const DRINK = { cmd: 'dr water', at: 3.2, answer: { run: BREE_RUN, from: 17.0, to: 17.3 } satisfies Excerpt, after: 0.28 } as const;

/** The run's prompt at the fountain. */
const PROMPT = '*# Mana:Burning>';

const block = (line: string, gmcp: string): Step & { out: Buffer } => ({
  out: Buffer.concat([lineBytes(''), lineBytes(line), lineBytes(''), gmcpBytes(gmcp), lineBytes(PROMPT)]),
});

interface Being {
  id: number;
  /** As arrivals and leaves name it. */
  who: string;
  name: string;
  desc: string;
  type: 'npc' | 'player';
}
// (ids above any in the run)
const SPARROW: Being = { id: 21, who: 'A sparrow', name: 'sparrow', desc: 'A sparrow is flapping around on the ground.', type: 'npc' };
const OLD_MAN: Being = { id: 22, who: 'An old man', name: 'old man', desc: 'An old man is walking around, cleaning up.', type: 'npc' };
const GUARD: Being = { id: 23, who: 'An elite Bree guard', name: 'elite Bree guard', desc: 'An elite Bree guard stands here stoutly.', type: 'npc' };
const NOB: Being = { id: 24, who: 'Nob', name: 'Nob', desc: 'Nob the Hobbit wanders around here, looking for work to do.', type: 'npc' };
const EILWEN: Being = { id: 25, who: 'Eilwen', name: 'Eilwen', desc: 'Eilwen the Half-Elf is standing here.', type: 'player' };

const arrives = (b: Being, from: string): Step & { out: Buffer } =>
  block(
    `${b.who} has arrived from the ${from}.`,
    `Room.Chars.Add ${JSON.stringify({ desc: b.desc, flags: [], id: b.id, labels: [], name: b.name, position: 'standing', type: b.type })}`,
  );
const leaves = (b: Being, to: string): Step & { out: Buffer } => block(`${b.who} leaves ${to}.`, `Room.Chars.Remove ${b.id}`);
const talk = (channel: 'tales' | 'says', talker: string, words: string): Step & { out: Buffer } => {
  const text = `${talker} ${channel === 'tales' ? 'narrates' : 'says'} '${words}'`;
  return block(`\x1b[${channel === 'tales' ? '33' : '36'}m${text}\x1b[0m`, `Comm.Channel.Text ${JSON.stringify({ channel, talker, 'talker-type': 'player', text })}`);
};

/** The room's life: a block every 8–15 s, none while a command is being typed. */
export const AMBIENT: { at: number; step: Step & { out: Buffer } }[] = [
  { at: 9.0, step: arrives(SPARROW, 'north') },
  { at: 21.5, step: talk('tales', 'Eilwen', 'fine day on the East Road, not a cloud to speak of') },
  { at: 34.5, step: arrives(OLD_MAN, 'south') },
  { at: 46.5, step: arrives(GUARD, 'east') },
  { at: 58.5, step: leaves(SPARROW, 'west') },
  { at: 70.5, step: talk('tales', 'Hamlin', 'anyone riding to Rivendell in the morning?') },
  { at: 81.5, step: leaves(GUARD, 'south') },
  { at: 92.0, step: arrives(EILWEN, 'west') },
  { at: 103.0, step: talk('says', 'Eilwen', 'good day to you, Gittan') },
  { at: 114.0, step: talk('tales', 'Hamlin', 'mushroom pie at the Pony today') },
  { at: 125.0, step: leaves(EILWEN, 'north') },
  { at: 136.0, step: leaves(OLD_MAN, 'east') },
  { at: 146.0, step: arrives(NOB, 'north') },
];

/** Bird crossings besides the sky's own (`__weather.emit('birds')`, the dev hook). */
export const BIRDS = [4, 36, 71, 106, 133] as const;

export interface Show {
  passenger: string;
  what: string;
  /** Enter. */
  at: number;
  /** The flight's seed (src/weather/balloons/flight.ts `planFlight`). */
  seed: number;
}

/**
 * The eleven commands. The times and the seeds were chosen together with
 * flight.ts's own planner on this layout: each Enter comes after the balloon
 * before has rested and begun to move on (1.3 s into its glide, 0.4 s in act
 * 3), every flight leaves by the top or over the right edge, none crosses
 * another's sign, and no more than two are in view. The scene checks all of
 * it on the take (record/scenes/balloons.ts). Change a time and the seeds
 * after it need choosing again: a flight's spot depends on the ones near it.
 */
export const SHOWS: readonly Show[] = [
  // the goblin
  { passenger: 'goblin', what: 'calibrating', at: 18, seed: 1533947694 },
  { passenger: 'goblin', what: 'superb', at: 32, seed: 580280128 },
  { passenger: 'goblin', what: 'achievement', at: 43.7, seed: 1170134385 },
  { passenger: 'goblin', what: 'death', at: 55.55, seed: 3319484456 },
  // the other races (kills alternate with the other moments)
  { passenger: 'dwarf', what: 'great', at: 4039 / 60, seed: 194149811 },
  { passenger: 'hobbit', what: 'levelup', at: 4700 / 60, seed: 1363386883 },
  { passenger: 'troll', what: 'poor', at: 5350 / 60, seed: 3705487742 },
  { passenger: 'human', what: 'achievement', at: 100, seed: 684926478 },
  { passenger: 'orc', what: 'meh', at: 6658 / 60, seed: 2689497549 },
  { passenger: 'numenorean', what: 'death', at: 7306 / 60, seed: 1237505738 },
  { passenger: 'elf', what: 'pvp', at: 132.7, seed: 3811537858 },
];

export const commandOf = (s: Show): string => `#weather balloon as ${s.passenger} ${s.what}`;

/** The take's length: the last balloon drifts on 6 s, then the 3 s fade out. */
export const TAKE_S = 153;
