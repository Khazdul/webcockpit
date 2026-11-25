// The Character pane film's game (video/manuscript-character.md, draft 3,
// stage 78): Gittan's run of 2026-11-25 from Mason Road in Bree to Tharbad
// and back aboard the coach, played as one frame-stepped take. Run seconds,
// staged lines and the poll's values only; the run's text stays in the
// gitignored video/private/ (record/character-runs.ts writes it).
//
// Times: `log` is seconds from the run's first line (the manuscript's log
// seconds), `take` seconds from the take's first frame (the film's 0:08).
//
// - LEGS map the log onto the take: each a stretch of the run played at a
//   pace of its own, so the card is shown at the game's pace and the long
//   waits (the coach, the rest, the wait for the coach home) go by quickly.
//   A leg with `cut` drops its text (its GMCP still arrives, at its start):
//   the composition dips to black over it.
// - Commands: typed on camera where the leg is slow enough, else sent as a
//   typed command is (the same echo); some become clicks on the card
//   (CLICKS), with MUME's own answers.
// - The hidden info poll (ADR 0166) is answered by the mock with Gittan's
//   values (POLL), as they stood at that moment of the run: the shields of
//   the run's own `WebCockpit.Shields` records, the vitals of its GMCP, the
//   affects of its `stat` lists, the purse before and after the pie.
// - Narrates are staged in the form of the owner's runs (as
//   feeds/balloons.ts): an empty line, the yellow line, an empty line,
//   Comm.Channel.Text, the prompt. Players are invented; Gittan is the
//   owner's own character.
import { fileURLToPath } from 'node:url';

/** The film's private backup (record/character-runs.ts). */
export const CHARACTER_BACKUP = fileURLToPath(new URL('../private/character-runs.jsonl.gz', import.meta.url));

/** Gittan's run, 2026-11-25. */
export const CHARACTER_RUN = 'Gittan/2026-11-25T18-59-11';

/** The run's text up to here goes in off camera (the login, the room, the vitals). */
export const PRE_LOG_S = 6.3;

/**
 * One stretch of the run: `log` [from, to) played from `take` at `speed`
 * (take s = take + (log − from) / speed). `cut`: its text is left out and
 * its GMCP arrives at once, at `take` (a hard cut: the dip covers it).
 */
export interface Leg {
  log: [number, number];
  take: number;
  speed: number;
  cut?: boolean;
  /** What it is (the timeline's marker). */
  name: string;
}

/**
 * The legs, in order, end to end (draft 4, the round 2 proposal; film =
 * take + 7): Mason Road 0:07, the coach 0:20 (the ring's tooltip, `rest`,
 * Comm on, the dock, Paper), Tharbad 0:56, the bakery 1:04, the north gate
 * 1:12, the tarantulas 1:20 (poisoned at the loud bar near 1:24), the camp
 * 1:32, the quakes 1:48 (both dead 1:57.5), the revenge 1:58, the pie 2:14;
 * the achievement after it (`ACHIEVEMENT`).
 */
export const LEGS: readonly Leg[] = [
  // Mason Road: nothing in the run from 6.3 to the coach's arrival (42.75) but the owner's settings
  { name: 'mason-road', log: [PRE_LOG_S, 42.0], take: 0, speed: (42.0 - PRE_LOG_S) / 6.4 },
  { name: 'the-coach-arrives', log: [42.0, 56.0], take: 6.4, speed: 1.8 },
  // the coach: Bree, the Greenway, Jasper's Tavern, the ford, Tharbad's walls, the rings
  { name: 'the-coach', log: [56.0, 239.5], take: 14.18, speed: 183.5 / 35.3 },
  { name: 'tharbad', log: [239.5, 259.0], take: 49.48, speed: 19.5 / 7.5 },
  // closed; the bandit; the flight; wimpy 100
  { name: 'the-bakery', log: [259.0, 268.3], take: 56.98, speed: 9.3 / 8.3 },
  // invisible, the north gate, the locks, the stone building
  { name: 'the-north-gate', log: [268.3, 307.95], take: 65.28, speed: 39.65 / 8.3 },
  // the tarantulas, the poison, the flight up
  { name: 'the-tarantulas', log: [307.95, 316.0], take: 73.58, speed: 1 },
  { name: 'remove-poison', log: [316.0, 326.5], take: 81.63, speed: 10.5 / 5.55 },
  // the camp fire, four stored earthquakes
  { name: 'the-camp', log: [326.5, 347.5], take: 87.18, speed: 3 },
  // rest, the herb, the brew
  { name: 'the-rest', log: [347.5, 415.3], take: 94.18, speed: 67.8 / 7.1 },
  // down; the quakes; both dead
  { name: 'the-quakes', log: [415.3, 424.6], take: 101.28, speed: 1 },
  { name: 'back-to-the-bakery', log: [424.6, 448.4], take: 110.58, speed: 23.8 / 3.0 },
  // the bandit, the baker, `ag`, the kill
  { name: 'the-revenge', log: [448.4, 468.0], take: 113.58, speed: 1.7 },
  // `wi` (a click), the pie
  { name: 'the-pie', log: [468.0, 472.0], take: 125.11, speed: 1 },
];

/** The run is played up to here (log s): the pie eaten. */
export const END_LOG_S = 472.0;

/**
 * Staged after the pie (the owner's text): MUME's achievement, in the
 * fixture's form (tests/fixtures/gmcp-demo.log): GMCP Event.Achieved, the
 * plain line, a blank line, the prompt. Its balloon rises and comes to rest.
 */
export const ACHIEVEMENT = { at: 129.6, what: 'Procured a pork-pie in Tharbad.' } as const;

/** The take runs this long after the achievement's balloon comes to rest (the composition freezes it at the cutout, 0.3 s in: it moves on after about 4 s). */
export const AFTER_REST_S = 1.0;

/**
 * The balloon rating's chain (honest, as the balloon film's round 1): an
 * earlier run of Gittan's restored from the film backup, its times moved
 * to end just before the take's run starts, so the live run chains to it.
 * Its seven kills (median 1,257 xp) make the bandit's 650 *meh* (0.52);
 * the two tarantulas die in one pulse and share a sign ("2 kills").
 */
export const CHAIN_RUN = 'Gittan/2026-11-02T20-21-34';

/** A log second → take second (the leg it is in). */
export function takeOf(log: number): number {
  for (const l of LEGS) if (log >= l.log[0] && log < l.log[1]) return l.cut ? l.take : l.take + (log - l.log[0]) / l.speed;
  const last = LEGS.at(-1)!;
  return last.take + (log - last.log[0]) / last.speed;
}

/** A take second → the log second it shows (the inverse of `takeOf`, cuts at their end). */
export function logOf(take: number): number {
  let at = LEGS[0]!.log[0];
  for (const l of LEGS) {
    if (take < l.take) return at;
    at = l.cut ? l.log[1] : Math.min(l.log[1], l.log[0] + (take - l.take) * l.speed);
  }
  return at;
}

/** A command is typed on camera when its leg plays at this pace or slower. */
export const TYPE_MAX_SPEED = 1.8;

// ---------------------------------------------------------------- the clicks

/**
 * The run's commands that are clicks on the card (draft 4: the coach's and
 * the camp's `r` on the position icon, `wi` after the kill on Mood, the
 * cycle's wrap from aggressive). Each sends the card's own command and is
 * answered as MUME answers it (the run's own lines where it has them). The
 * run's command and its answer are left out (`drop`, log seconds).
 */
export interface Click {
  /** The run's command it replaces, at this log second. */
  log: number;
  field: 'mood' | 'position';
  /** What it sends and what MUME answers it (lines, then GMCP, then the prompt). */
  steps: { sends: string; lines: string[]; gmcp: string[] }[];
  /** The run's lines it replaces: [from, to] log s, text and the command (the GMCP of the click's own answer goes too). */
  drop: [number, number];
}

const vitals = (o: Record<string, unknown>): string => `Char.Vitals ${JSON.stringify(o)}`;

export const CLICKS: readonly Click[] = [
  // `r` in the coach: "You sit down and rest your tired bones." (the run's)
  { log: 61.03, field: 'position', drop: [61.0, 61.3], steps: [{ sends: 'rest', lines: ['You sit down and rest your tired bones.', ''], gmcp: [vitals({ position: 'resting' })] }] },
  // `r` by the camp fire (the run's answer)
  {
    log: 347.33,
    field: 'position',
    drop: [347.3, 347.6],
    steps: [{ sends: 'rest', lines: ['You rest next to the campfire.', 'You feel comfortable.', ''], gmcp: [vitals({ position: 'resting' })] }],
  },
  // `wi` after the kill: aggressive → wimpy, the run's own answer
  { log: 468.15, field: 'mood', drop: [468.1, 468.4], steps: [{ sends: 'change mood wimpy', lines: ['Ok.', ''], gmcp: [vitals({ mood: 'wimpy' })] }] },
];

/** The run's GMCP that the clicks replace (their own answers carry it). */
export const DROP_GMCP: readonly { log: number; pkg: string; has: string }[] = [
  { log: 61.27, pkg: 'Char.Vitals', has: '"position":"resting"' },
  { log: 347.56, pkg: 'Char.Vitals', has: '"position":"resting"' },
  { log: 468.33, pkg: 'Char.Vitals', has: '"mood":"wimpy"' },
];

/** The run's lines left out (log s): the failed `cha spellspeed quick` and its "No field by that name.". */
export const DROPS: readonly [number, number][] = [[461.1, 461.3]];

/** MUME answers a click this long after it (s): a pulse. */
export const ANSWER_LAG_S = 0.35;

// -------------------------------------------------------------- staged lines

/** Before the camera rolls at Mason Road: `l`, as MUME showed this room to Gittan (brief mode, her run of 2026-11-08). */
export const LOOK = {
  cmd: 'l',
  lines: ['\x1b[32mMason Road\x1b[0m', 'A white-painted bench is here.', 'A timetable for a coach service hangs on the wall.', 'Exits: -north-, -south-, [west].', ''],
} as const;

/** The run's first prompt (Mason Road, resting). */
export const FIRST_PROMPT = '!#>';

/** Other players' narrates (draft 4), at take seconds. */
export const NARRATES: readonly { at: number; talker: string; words: string }[] = [
  { at: 20.6, talker: 'Thorgrim', words: 'bring one for me. two, if the road is long' },
  { at: 26.4, talker: 'Mirel', words: 'tharbad? half of it is under the greyflood and the other half would steal your boots' },
  { at: 70.0, talker: 'Odalric', words: 'closed? now that is the real crime' },
  { at: 112.4, talker: 'Sigrun', words: 'did anyone else just feel the ground shake??' },
];

/**
 * Gittan's own narrates (draft 4): typed in the input line as `narr …`
 * (Enter at `at`), answered as MUME echoes one's own narrate (the fixture's
 * form): Comm.Channel.Text with talker `you`, the yellow `You narrate '…'`,
 * a blank line, the prompt.
 */
export const OWN_NARRATES: readonly { at: number; words: string }[] = [
  { at: 5.9, words: 'off to tharbad! they say the pork-pies there are worth the whole road south' },
  { at: 32.0, words: 'hobbits have no boots, mirel. my feet and my purse are both well guarded' },
  { at: 68.7, words: 'assaulted in the bakery, and it was CLOSED. this town is crawling with cutpurses' },
  { at: 73.35, words: 'hiding in a little stone house north of the gate. nobody looks for a hobbit in a cellar' },
  { at: 85.5, words: 'attercop! the cellar is full of spiders. i am going back down with an earthquake or four' },
];

/**
 * The run's mana in four steps while the four earthquakes are stored
 * (manuscript): MUME sent it after the second and the fourth only (102,
 * 61); the first and the third are staged between them, at their "You
 * stored it.".
 */
export const STAGED_GMCP: readonly { log: number; gmcp: string }[] = [
  { log: 336.02, gmcp: vitals({ mana: 119 }) },
  { log: 343.27, gmcp: vitals({ 'mana-string': 'hot', mana: 82 }) },
];

// ------------------------------------------------------------------ the poll

const G = (n: number): string => `\x1b[32m${n}\x1b[0m`;

/** Gittan's values (the owner's screenshots, manuscript "Stats and Lore"), as `info`'s fields. */
export interface PollState {
  /** The ring's strength: STR shows +2 (from log 248.8, "You feel stronger"). */
  strong: boolean;
  shields: { ob: number; db: number; pb: number; abs: number };
  wimpy: number;
  copper: number;
}

/** The `INFO_FIELDS` answer (src/gmcp/info-answer.ts), in its order. */
export function pollFields(s: PollState): string[] {
  // STR 10 before the ring, 12 (+2) after "You feel stronger" (the owner, draft 4)
  const unaffected = 'Str:10 Int:17 Wis:19 Dex:11 Con:14 Wil:13 Per:16';
  return [
    '45',
    String(s.shields.ob),
    String(s.shields.db),
    String(s.shields.pb),
    String(s.shields.abs),
    s.strong ? '12' : '10',
    '17',
    '19',
    '11',
    '14',
    '13',
    '16',
    unaffected,
    // 55 years: the 3rd age, the 4th at 60; the birthday in a month
    '55',
    '11',
    '10',
    'three feet one',
    'four stone and thirteen pounds',
    'seventy-six pounds',
    'Heavy, but we will manage...',
    'You must have been sent to Arda to free it from the sorrows that weigh upon it!',
    'Bree Shire Fornost GreyHavens Rivendell',
    `${G(66)} gold coins, ${G(4)} silver pennies, and ${G(s.copper)} copper pennies`,
    'war leader (13)',
    '35',
    '-5',
    '-20',
    String(s.wimpy),
  ];
}

/**
 * The affects `stat` listed (log 236, 354, 414), and when each began or
 * ended in the run's text, for `%f`.
 */
export const AFFECTS: readonly { name: string; from: number; to?: number }[] = [
  { name: 'shield', from: 0 },
  { name: 'armour', from: 0 },
  { name: 'lethargy', from: 244.5 },
  { name: 'strength', from: 248.77 },
  { name: 'unable to quit', from: 264.52 },
  { name: 'panic', from: 265.02, to: 400 },
  { name: 'tiredness', from: 265.02 },
  { name: 'shroud', from: 287.64, to: 308.27 },
  { name: 'shroud', from: 361.5, to: 418.01 },
  { name: 'comfortable', from: 347.56, to: 355.5 },
  { name: 'stored spell earthquake', from: 336.02, to: 419.26 },
  { name: 'stored spell earthquake', from: 339.52, to: 421.01 },
  { name: 'stored spell earthquake', from: 343.27, to: 422.76 },
  { name: 'stored spell earthquake', from: 346.78, to: 424.51 },
  { name: 'comfortable', from: 364.5, to: 415.51 },
  { name: 'potion', from: 392.25 },
];

/** The order `stat` lists them in (its lists at 354 and 414). */
const AFFECT_ORDER = ['potion', 'comfortable', 'shroud', 'stored spell earthquake', 'panic', 'unable to quit', 'tiredness', 'strength', 'lethargy', 'shield', 'armour'];

export function affectsAt(log: number): string[] {
  const on = AFFECTS.filter((a) => log >= a.from && (a.to === undefined || log < a.to)).map((a) => a.name);
  return on.sort((a, b) => AFFECT_ORDER.indexOf(a) - AFFECT_ORDER.indexOf(b));
}

/** The pie costs six copper (log 469.52). */
export const PIE_LOG_S = 469.52;
/** "You feel stronger." */
export const STRONGER_LOG_S = 248.77;
/** `wimpy 100` answered (log 267.02). */
export const WIMPY_LOG_S = 267.02;
