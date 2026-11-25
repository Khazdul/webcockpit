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
 * The legs, in order, end to end. The film's beats (manuscript outline,
 * film = take + 8): Mason Road 0:08–0:34, the coach and the tour 0:34–1:10,
 * Tharbad 1:10, the bakery 1:20, the stone building 1:28, the tarantulas
 * 1:40, the camp 1:52, the quakes 2:18, both dead at the peak 2:30
 * (`PEAK_TAKE_S`), the revenge 2:36, aboard 2:54.
 */
export const LEGS: readonly Leg[] = [
  // Mason Road: nothing in the run from 6.3 to the coach's arrival (42.75) but the owner's settings
  { name: 'mason-road', log: [PRE_LOG_S, 42.0], take: 0, speed: (42.0 - PRE_LOG_S) / 7.0 },
  { name: 'the-coach-arrives', log: [42.0, 61.4], take: 7.0, speed: 1 },
  // the tour while the coach waits, leaves Bree and takes the Greenway
  { name: 'the-tour', log: [61.4, 96.0], take: 26.4, speed: 34.6 / 13.6 },
  // the long ride: Jasper's Tavern, the ford, Tharbad's walls
  { name: 'the-ride', log: [96.0, 236.0], take: 40.0, speed: 140 / 15.5 },
  { name: 'tharbad', log: [236.0, 239.5], take: 55.5, speed: 3.5 / 2.5 },
  // the rings: "You feel stronger"; out of the coach, to the bakery
  { name: 'the-rings', log: [239.5, 259.0], take: 58.0, speed: 19.5 / 12.0 },
  // closed; the bandit; the flight; wimpy 100
  { name: 'the-bakery', log: [259.0, 268.3], take: 70.0, speed: 1 },
  // invisible, the north gate, the locks, the stone building
  { name: 'the-north-gate', log: [268.3, 308.0], take: 79.3, speed: 39.7 / 12.7 },
  // the tarantulas, the poison, the flight up
  { name: 'the-tarantulas', log: [308.0, 316.0], take: 92.0, speed: 1 },
  { name: 'remove-poison', log: [316.0, 326.5], take: 100.0, speed: 10.5 / 4.0 },
  // the camp fire, four stored earthquakes
  { name: 'the-camp', log: [326.5, 347.5], take: 104.0, speed: 21.0 / 10.5 },
  // rest, the herb, the brew
  { name: 'the-rest', log: [347.5, 415.3], take: 114.5, speed: 67.8 / 18.3 },
  // down; the quakes; both dead at the track's peak
  { name: 'the-quakes', log: [415.3, 424.6], take: 132.8, speed: 1 },
  { name: 'the-xp', log: [424.6, 431.6], take: 142.1, speed: 7.0 / 4.0 },
  { name: 'back-to-the-bakery', log: [431.6, 448.4], take: 146.1, speed: 16.8 / 3.0 },
  // the bandit, the baker, the kill, the pie
  { name: 'the-revenge', log: [448.4, 472.0], take: 149.1, speed: 23.6 / 15.0 },
  // the wait for the coach home: cut
  { name: 'the-wait', log: [472.0, 589.0], take: 164.1, speed: 1, cut: true },
  { name: 'aboard', log: [589.0, 629.4], take: 164.3, speed: 40.4 / 7.0 },
];

/** The take's length: the coach home starts moving, a breath after it. */
export const TAKE_S = 174.0;
/** Both tarantulas dead (log 424.51): the track's loudest moment, 2:30. */
export const PEAK_TAKE_S = 142.0;

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
 * The commands of the run that are clicks on the card (manuscript: `r`,
 * `ag`, `wi`; the failed `cha spellspeed quick` a click on Casts). `field`
 * is the card's `data-click`; `times` clicks, each sending the card's own
 * command (`change mood …`, `rest`), each answered as MUME answers it
 * (`answer`: the run's own lines where the run has them). The run's command
 * and its answer are left out (`drop`, log seconds).
 */
export interface Click {
  /** The run's command it replaces, at this log second. */
  log: number;
  field: 'mood' | 'casts' | 'position';
  /** What each click sends and what MUME answers it (lines, then GMCP, then the prompt). */
  steps: { sends: string; lines: string[]; gmcp: string[] }[];
  /** The run's lines it replaces: [from, to] log s, text and the command (the GMCP of the click's own answer goes too). */
  drop: [number, number];
  /** Off the game's own times: the first press this far before `log` (s, take). */
  lead?: number;
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
  // `ag` in the fight: the tour left Mood at prudent, so three steps (MUME's `change mood` answer: "Ok.", GMCP)
  {
    log: 458.41,
    field: 'mood',
    lead: 1.2,
    drop: [458.4, 458.55],
    steps: ['normal', 'brave', 'aggressive'].map((m) => ({ sends: `change mood ${m}`, lines: ['Ok.', ''], gmcp: [vitals({ mood: m })] })),
  },
  // `cha spellspeed quick` failed ("No field by that name."): one click on Casts, normal → careful (MUME's form)
  {
    log: 461.13,
    field: 'casts',
    drop: [461.1, 461.3],
    steps: [{ sends: 'change spellcasting careful', lines: ['Ok.', ''], gmcp: [vitals({ 'spell-effort': 'careful' })] }],
  },
  // `wi` after the kill: aggressive → wimpy, the run's own answer
  { log: 468.15, field: 'mood', drop: [468.1, 468.4], steps: [{ sends: 'change mood wimpy', lines: ['Ok.', ''], gmcp: [vitals({ mood: 'wimpy' })] }] },
];

/** The run's GMCP that the clicks replace (their own answers carry it). */
export const DROP_GMCP: readonly { log: number; pkg: string; has: string }[] = [
  { log: 61.27, pkg: 'Char.Vitals', has: '"position":"resting"' },
  { log: 347.56, pkg: 'Char.Vitals', has: '"position":"resting"' },
  { log: 460.26, pkg: 'Char.Vitals', has: '"mood":"aggressive"' },
  { log: 468.33, pkg: 'Char.Vitals', has: '"mood":"wimpy"' },
];

/** The tour's click on Mood (take s): wimpy → prudent, MUME's answer. */
export const TOUR_MOOD = { sends: 'change mood prudent', lines: ['Ok.', ''], gmcp: [vitals({ mood: 'prudent' })] } as const;

/** MUME answers a click this long after it (s): a pulse. */
export const ANSWER_LAG_S = 0.35;

// -------------------------------------------------------------- staged lines

/** On camera at Mason Road: `l`, as MUME showed this room to Gittan (brief mode, her run of 2026-11-08). */
export const LOOK = {
  cmd: 'l',
  at: 1.6,
  lines: ['\x1b[32mMason Road\x1b[0m', 'A white-painted bench is here.', 'A timetable for a coach service hangs on the wall.', 'Exits: -north-, -south-, [west].', ''],
} as const;

/** The run's first prompt (Mason Road, resting). */
export const FIRST_PROMPT = '!#>';

/** The narrates (manuscript draft 3), at take seconds. */
export const NARRATES: readonly { at: number; talker: string; words: string }[] = [
  { at: 37.0, talker: 'Fenwick', words: 'anyone know when the bakery in tharbad opens?' },
  { at: 79.0, talker: 'Mirel', words: 'tharbad bakery keeps hobbit hours. second breakfast only' },
  { at: 105.0, talker: 'Thorgrim', words: 'never go down into that stone hut north of tharbad. trust me' },
  { at: 146.6, talker: 'Odalric', words: 'did anyone else just feel the ground shake??' },
  { at: 168.2, talker: 'Sigrun', words: 'gittan, was the pie worth it?' },
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
  // STR 12 throughout; with the ring's strength 12 (+2) (the owner: before the ring 12 with no +2)
  const unaffected = `Str:${s.strong ? 10 : 12} Int:17 Wis:19 Dex:11 Con:14 Wil:13 Per:16`;
  return [
    '45',
    String(s.shields.ob),
    String(s.shields.db),
    String(s.shields.pb),
    String(s.shields.abs),
    '12',
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
