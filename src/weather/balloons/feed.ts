// The balloons' kill feed (stage 69, ADR 0159): what a sign says. Pure TS,
// no DOM; balloons.ts and the skins read it.
//
// - A notice is one folded kill of the run (the 500 ms fold,
//   src/runs/events.ts): the mob's name, its XP, and its face, the
//   Statistics pane's rating (src/runs/kill-rating.ts: the kill's XP against
//   the median of the run's last 30 mob kills, this one included;
//   `calibrating` under 5 kills). A pkill has no rating word: its face is
//   `pvp`.
// - Kills that come while a balloon is readable join its sign: the count,
//   the summed XP, the best face, the last few names.
// - The run's other moments (round 2, owner 2026-11-17): a level up, the
//   character's death and an achievement (GMCP Event.Achieved) each get a
//   balloon of their own, never joined with kills or with each other.

import { fmtK } from '../../chrome/frames/stats-layout';
import type { RunEvent } from '../../runs/events';
import { KillRater, RATING_LABEL, type KillRating } from '../../runs/kill-rating';

/** The passenger's mood: a rating, still calibrating, or a player kill. */
export type Face = KillRating | 'calibrating' | 'pvp';

/** Worst to best, for a sign's best face (a pkill beats any mob). */
export const FACE_ORDER: readonly Face[] = ['calibrating', 'poor', 'meh', 'good', 'great', 'superb', 'pvp'];

/** The sign's rating word ('' while calibrating). */
export const FACE_LABEL: Readonly<Record<Face, string>> = { ...RATING_LABEL, calibrating: '', pvp: 'PvP' };

/** The passenger's mood: a kill's face, or one of the run's other moments. */
export type Mood = Face | 'levelup' | 'death' | 'achievement';

/** Every mood, the kill faces first (skins draw one picture per mood). */
export const MOODS: readonly Mood[] = ['poor', 'meh', 'calibrating', 'good', 'great', 'superb', 'pvp', 'levelup', 'death', 'achievement'];

export interface KillNotice {
  kind?: 'kill';
  name: string;
  xp: number;
  face: Face;
}

/** A balloon's reason: a kill (kills join one sign), or a level up, a death or an achievement (each alone). */
export type Notice = KillNotice | { kind: 'levelup'; level: number } | { kind: 'death'; level?: number } | { kind: 'achievement'; text: string };

export type NoticeKind = 'kill' | 'levelup' | 'death' | 'achievement';

export const kindOf = (n: Notice): NoticeKind => n.kind ?? 'kill';
export const isKillNotice = (n: Notice): n is KillNotice => kindOf(n) === 'kill';

/** What the sign shows. */
export interface SignContent {
  kind: NoticeKind;
  /** The kill's name ("An orc scout"), "3 kills", or an achievement's text ('' for none). */
  title: string;
  /** The big line: "+2.6k", "Level 23!", "You died" ('' for none). */
  big: string;
  /** Its unit, small after it ("XP"; '' for none). */
  unit: string;
  /** The small word: a rating ('' while calibrating), "Achievement". */
  label: string;
  /** The last few names of a joined sign ('' for one kill). */
  more: string;
  mood: Mood;
  count: number;
}

/** Names on a joined sign. */
export const MORE_NAMES = 3;

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const bare = (s: string): string => s.replace(/^(an?|the) /i, '');

export function bestFace(kills: readonly KillNotice[]): Face {
  let best: Face = kills[0]?.face ?? 'calibrating';
  for (const k of kills) if (FACE_ORDER.indexOf(k.face) > FACE_ORDER.indexOf(best)) best = k.face;
  return best;
}

/** The sign for the kills on it (not empty). */
export function signOf(kills: readonly KillNotice[]): SignContent {
  const n = kills.length;
  const face = bestFace(kills);
  const xp = kills.reduce((s, k) => s + Math.max(0, k.xp), 0);
  const names = kills.slice(-MORE_NAMES).map((k) => bare(k.name));
  return {
    kind: 'kill',
    title: n === 1 ? cap(kills[0]!.name) : `${n} kills`,
    big: `+${fmtK(xp)}`,
    unit: 'XP',
    label: FACE_LABEL[face],
    more: n === 1 ? '' : names.join(', ') + (n > MORE_NAMES ? ', …' : ''),
    mood: face,
    count: n,
  };
}

/** An achievement's text on a sign: at most this many characters (the sign also clamps it to four lines). */
export const ACHIEVEMENT_MAX = 120;

const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

/** The sign for a balloon's notices: the kills on it (not empty, all kills) or its one other notice. */
export function signFor(notices: readonly Notice[]): SignContent {
  const n = notices[0]!;
  const blank = { title: '', big: '', unit: '', label: '', more: '', count: 1 };
  switch (n.kind) {
    case 'levelup':
      return { ...blank, kind: 'levelup', big: `Level ${n.level}!`, mood: 'levelup' };
    case 'death':
      return { ...blank, kind: 'death', big: 'You died', mood: 'death' };
    case 'achievement':
      return { ...blank, kind: 'achievement', title: cap(clip(n.text, ACHIEVEMENT_MAX)), label: 'Achievement', mood: 'achievement' };
    default:
      return signOf(notices as readonly KillNotice[]);
  }
}

/** The notice for a run event, or null for any other event. `rater` (kills only) must already hold the run's kills up to and including `e`. */
export function noticeOf(e: RunEvent, rater: KillRater): Notice | null {
  switch (e.type) {
    case 'pkill':
      return { name: `*${e.name}*`, xp: e.xpDelta, face: 'pvp' };
    case 'kill':
      return { name: e.mobName, xp: e.xpDelta, face: rater.rate(e.xpDelta)?.rating ?? 'calibrating' };
    case 'level_up':
      return { kind: 'levelup', level: e.level };
    case 'char_death':
      return e.level === undefined ? { kind: 'death' } : { kind: 'death', level: e.level };
    case 'achievement':
      return e.name.trim() ? { kind: 'achievement', text: e.name } : null;
    default:
      return null;
  }
}

/**
 * The rater for the run as the Statistics pane has it: the kills of the
 * chain's earlier runs (`prior`, read once from the store) and the live
 * run's (`live`, in memory, the newest event included).
 */
export function raterFor(prior: readonly RunEvent[], live: readonly RunEvent[]): KillRater {
  const r = new KillRater();
  r.addEvents(prior);
  r.addEvents(live);
  return r;
}

/** `#weather balloon <face>` and the demo: a made-up kill of each face (a median of 1900). */
export const SAMPLE_KILLS: Readonly<Record<Face, readonly KillNotice[]>> = {
  poor: [{ name: 'a field mouse', xp: 140, face: 'poor' }],
  meh: [{ name: 'a ragged wolf', xp: 1100, face: 'meh' }],
  good: [{ name: 'an orc scout', xp: 1900, face: 'good' }],
  great: [{ name: 'an Uruk-hai tracker', xp: 3700, face: 'great' }],
  superb: [{ name: 'a cave troll', xp: 12400, face: 'superb' }],
  calibrating: [{ name: 'a black squirrel', xp: 260, face: 'calibrating' }],
  pvp: [{ name: '*Grimbold the Orc*', xp: 6200, face: 'pvp' }],
};

/** `#weather balloon levelup|death|achievement`: a made-up moment of each kind. */
export const SAMPLE_MOMENTS = {
  levelup: { kind: 'levelup', level: 23 },
  death: { kind: 'death', level: 23 },
  achievement: { kind: 'achievement', text: 'You have explored every room of the Old Forest, from the Withywindle to the Barrow-downs.' },
} as const satisfies Record<'levelup' | 'death' | 'achievement', Notice>;

/** A made-up notice for `#weather balloon <word>` and the demo. */
export function sampleNotice(word: SampleWord): Notice {
  return word === 'levelup' || word === 'death' || word === 'achievement' ? SAMPLE_MOMENTS[word] : SAMPLE_KILLS[word][0]!;
}

/** The words `#weather balloon` takes for one notice. */
export type SampleWord = Face | keyof typeof SAMPLE_MOMENTS;

/** `#weather balloon burst`: four kills, 650 ms apart. */
export const SAMPLE_BURST: readonly KillNotice[] = [
  { name: 'a goblin thief', xp: 1100, face: 'meh' },
  { name: 'an orc scout', xp: 1900, face: 'good' },
  { name: 'a goblin thief', xp: 1000, face: 'meh' },
  { name: 'an Uruk-hai tracker', xp: 3600, face: 'great' },
];
export const BURST_GAP_MS = 650;
