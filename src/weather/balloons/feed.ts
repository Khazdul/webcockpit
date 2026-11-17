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

import { fmtK } from '../../chrome/frames/stats-layout';
import type { RunEvent } from '../../runs/events';
import { KillRater, RATING_LABEL, type KillRating } from '../../runs/kill-rating';

/** The passenger's mood: a rating, still calibrating, or a player kill. */
export type Face = KillRating | 'calibrating' | 'pvp';

/** Worst to best, for a sign's best face (a pkill beats any mob). */
export const FACE_ORDER: readonly Face[] = ['calibrating', 'poor', 'meh', 'good', 'great', 'superb', 'pvp'];

/** The sign's rating word ('' while calibrating). */
export const FACE_LABEL: Readonly<Record<Face, string>> = { ...RATING_LABEL, calibrating: '', pvp: 'PvP' };

export interface KillNotice {
  name: string;
  xp: number;
  face: Face;
}

/** What the sign shows. */
export interface SignContent {
  /** The kill's name ("An orc scout"), or "3 kills". */
  title: string;
  /** "+2.6k". */
  xp: string;
  /** The rating word of the best face ('' while calibrating). */
  label: string;
  /** The last few names of a joined sign ('' for one kill). */
  more: string;
  face: Face;
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
    title: n === 1 ? cap(kills[0]!.name) : `${n} kills`,
    xp: `+${fmtK(xp)}`,
    label: FACE_LABEL[face],
    more: n === 1 ? '' : names.join(', ') + (n > MORE_NAMES ? ', …' : ''),
    face,
    count: n,
  };
}

/** The notice for a run event, or null for any other event. `rater` must already hold the run's kills up to and including `e`. */
export function noticeOf(e: RunEvent, rater: KillRater): KillNotice | null {
  if (e.type === 'pkill') return { name: `*${e.name}*`, xp: e.xpDelta, face: 'pvp' };
  if (e.type !== 'kill') return null;
  return { name: e.mobName, xp: e.xpDelta, face: rater.rate(e.xpDelta)?.rating ?? 'calibrating' };
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

/** `#weather balloon burst`: four kills, 650 ms apart. */
export const SAMPLE_BURST: readonly KillNotice[] = [
  { name: 'a goblin thief', xp: 1100, face: 'meh' },
  { name: 'an orc scout', xp: 1900, face: 'good' },
  { name: 'a goblin thief', xp: 1000, face: 'meh' },
  { name: 'an Uruk-hai tracker', xp: 3600, face: 'great' },
];
export const BURST_GAP_MS = 650;
