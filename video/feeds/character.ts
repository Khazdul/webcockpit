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
 * The legs, in order, end to end (draft 5, the round 3 plan; film = take +
 * 7): Mason Road 0:07, the coach 0:22 (fast; the tabs, the dock), the rings
 * and Tharbad's West Alley 1:05, the bakery 1:16, the north gate 1:25, the
 * owner's cut (the stone house, the tarantulas, the camp are gone: from
 * the shroud at the gate straight to the walk back), the revenge at the
 * game's pace 1:58, the pie 2:17; the achievement after it.
 */
export const LEGS: readonly Leg[] = [
  // Mason Road: nothing in the run from 6.3 to the coach's arrival (42.75) but the owner's settings
  { name: 'mason-road', log: [PRE_LOG_S, 42.0], take: 0, speed: (42.0 - PRE_LOG_S) / 6.4 },
  { name: 'the-coach-arrives', log: [42.0, 56.0], take: 6.4, speed: 14 / 8.8 },
  // the coach, fast: Bree, the Greenway, Jasper's Tavern, the ford
  { name: 'the-coach', log: [56.0, 235.8], take: 15.2, speed: 179.8 / 36.3 },
  // `stat`, Tharbad's walls, `eq`, the rings (as the owner edited them): "You feel stronger"
  { name: 'the-rings', log: [235.8, 249.7], take: 51.5, speed: 13.9 / 6.5 },
  // out of the coach; the rings back (Tiredness), a drink at the fountain
  { name: 'tharbad', log: [249.7, 257.0], take: 58.0, speed: 1 },
  // to the bakery, unhurried: a room every 1.5–2 s
  { name: 'to-the-bakery', log: [257.0, 259.0], take: 65.3, speed: 0.55 },
  // closed; the bandit; the flight; wimpy 100
  { name: 'the-bakery', log: [259.0, 268.3], take: 68.94, speed: 1 },
  // to the north gate; "assaulted …"; invis
  { name: 'the-north-gate', log: [268.3, 288.0], take: 78.24, speed: 1 },
  // the owner's cut: from the shroud straight to the walk back (Main Street), unhurried
  { name: 'back-to-the-bakery', log: [443.0, 448.4], take: 99.0, speed: 0.45 },
  // the bandit, the baker, `ag`, the kill: the game's pace
  { name: 'the-revenge', log: [448.4, 468.0], take: 111.0, speed: 1 },
  // `wi` (a click), the pie
  { name: 'the-pie', log: [468.0, 472.0], take: 130.6, speed: 1 },
];

/**
 * The owner's edit of round 2's game text (`~/Downloads/
 * character-film-r2-spellogg_edited.txt`): the run log's lines (1-based,
 * every line counted) he left out. Their GMCP goes with them: their rooms
 * are not played, and the bars stay true by the next values; the XP they
 * gave (the tarantulas') is taken off every later value.
 */
export const DELETED_LINES: readonly [number, number][] = [
  // the first ring swaps and "The coach has arrived in Tharbad."
  [227, 271],
  // "You can't find any water."
  [348, 352],
  // through the north gate: the stone house, the tarantulas, the camp, the quakes, the way back to Main Street
  [500, 1002],
];

/** The run is played up to here (log s): the pie eaten. */
export const END_LOG_S = 472.0;

/**
 * Staged after the pie (the owner's text): MUME's achievement, in the
 * fixture's form (tests/fixtures/gmcp-demo.log): GMCP Event.Achieved, the
 * plain line, a blank line, the prompt. Its balloon rises, rests and flies on.
 */
export const ACHIEVEMENT = { at: 135.0, what: 'Procured a pork-pie in Tharbad.' } as const;

/**
 * Balloons: only the achievement's (draft 5). They are switched on in the
 * page's settings at this take second, after the bandit's kill (no UI, no
 * frame shows the switch); its kill gets none.
 */
export const BALLOONS_ON_AT = 132.5;

/** After the achievement's balloon comes to rest: the balloon alone is shot on every frame from here … (s) */
export const LAYER_FROM_S = 2.5;
/** … and the take runs until here (its own fade ends at rest + 15). */
export const AFTER_REST_S = 15.6;

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
  // `wi` after the kill: aggressive → wimpy, the run's own answer
  { log: 468.15, field: 'mood', drop: [468.1, 468.4], steps: [{ sends: 'change mood wimpy', lines: ['Ok.', ''], gmcp: [vitals({ mood: 'wimpy' })] }] },
];

/** The run's GMCP that the clicks replace (their own answers carry it). */
export const DROP_GMCP: readonly { log: number; pkg: string; has: string }[] = [
  { log: 61.27, pkg: 'Char.Vitals', has: '"position":"resting"' },
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

/** Other players' narrates (draft 5): an answer 10–15 s after what it answers. */
export const NARRATES: readonly { at: number; talker: string; words: string }[] = [
  { at: 19.9, talker: 'Thorgrim', words: 'bring one for me. two, if the road is long' },
  { at: 38.4, talker: 'Mirel', words: 'tharbad? half of it is under the greyflood and the other half would steal your boots' },
  { at: 100.6, talker: 'Odalric', words: 'closed? now that is the real crime' },
];

/**
 * Gittan's own narrates: typed in the input line as `narr …` (Enter at
 * `at`). The game window shows only MUME's `Ok.` (the owner, draft 5);
 * Comm still gets Comm.Channel.Text with talker `you`.
 */
export const OWN_NARRATES: readonly { at: number; words: string }[] = [
  { at: 5.9, words: 'off to tharbad! they say the pork-pies there are worth the whole road south' },
  { at: 50.9, words: 'hobbits have no boots, mirel. my feet and my purse are both well guarded' },
  { at: 88.4, words: 'assaulted in the bakery, and it was CLOSED. this town is crawling with cutpurses' },
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
  // "You feel a sudden loss of energy …" (L285)
  { name: 'lethargy', from: 244.52 },
  // "You feel stronger." (L301)
  { name: 'strength', from: 248.77 },
  // "… the strength that welled within you subsides." (L329)
  { name: 'tiredness', from: 250.52 },
  { name: 'unable to quit', from: 264.52 },
  { name: 'panic', from: 265.02 },
  // "You are surrounded by a misty shroud." (L496); its end is in the owner's cut
  { name: 'shroud', from: 287.64 },
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
