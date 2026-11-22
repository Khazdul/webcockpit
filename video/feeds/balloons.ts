// The balloon film's game material (video/manuscript-balloons.md,
// "Sources"): run ids and seconds only. The logs stay in the gitignored
// video/private/: Gittan's runs in the film backup (film-runs.jsonl.gz),
// Rasta's run in the balloon backup (balloon-runs.jsonl.gz, made from the
// owner's replay export by record/balloon-runs.ts).
//
// Each take (record/scenes/balloons.ts) plays its run as a list of legs in
// the run's order: `fast` legs off the film (the text as fast as the page
// takes it, each kill's fold kept whole), `real` legs at the game's own
// pace (what the film shows: a kill's balloon flies at its real time after
// the kill), and `quick` legs at a few times the game's pace (the walk
// between two moments the film cuts over; the earlier balloons drift on in
// the sky). `pieces` are the stretches the film shows, in run seconds.
import { fileURLToPath } from 'node:url';

/** Rasta's run, from the replay export (private). */
export const BALLOON_BACKUP = fileURLToPath(new URL('../private/balloon-runs.jsonl.gz', import.meta.url));

/** Gittan's evening of 2026-10-11 (film backup): Gloomy Valley, the Ancient Broken Road. Race Hobbit / Fallohide. */
export const GITTAN_RUN = 'Gittan/2026-10-11T20-56-42';
/**
 * The run before it in the same session (film backup): its ten mob kills are
 * the kill rating's history (src/runs/kill-rating.ts: the median of the
 * chain's last 30 mob kills, "calibrating" under 5), as they were for
 * Gittan that evening.
 */
export const GITTAN_PREV = 'Gittan/2026-10-11T19-48-42';
/** Rasta's PvP night of 2026-11-21 (the export's second run; seconds from the export's start). Race Orc / Tarkhnarb Orc. */
export const RASTA_RUN = 'Rasta/2026-11-21T22-00-49';

export type LegKind = 'fast' | 'real' | 'quick';

export interface Leg {
  kind: LegKind;
  /** Run seconds. */
  from: number;
  to: number;
  /** `quick` legs: the speed (default 4). */
  speed?: number;
  /** Balloons switch off for a `fast` leg and on again after it (its kills still count for the rating). */
  noBalloons?: boolean;
  /** A name for the take's markers. */
  name?: string;
}

/** A stretch the film shows, run seconds (inside one `real` leg). */
export interface Piece {
  name: string;
  from: number;
  to: number;
}

export interface BalloonTake {
  run: string;
  legs: Leg[];
  pieces: Piece[];
}

/**
 * Gittan, by day. Kills (death line, fold 0.5 s later): the olog-hai troll
 * 384.5 in Gloomy Valley (forest, outdoors); the prison guard 1402.7 and
 * the two mastiffs 1408.0 and 1410.5 in the Decrepit Hut (one sign: each
 * comes while the guard's balloon is still arriving); the achievement
 * (Event.Achieved, "You unlocked an ornate elven chest!") 1647.2 in the
 * Chieftain's Throneroom.
 */
export const GITTAN: BalloonTake = {
  run: GITTAN_RUN,
  legs: [
    { kind: 'fast', from: 352, to: 381 },
    { kind: 'real', from: 381, to: 392.5, name: 'troll' },
    { kind: 'fast', from: 392.5, to: 1399.5, noBalloons: true },
    { kind: 'real', from: 1399.5, to: 1414, name: 'guard' },
    { kind: 'fast', from: 1414, to: 1644, noBalloons: true },
    { kind: 'real', from: 1644, to: 1656, name: 'chest' },
  ],
  pieces: [
    { name: 'troll', from: 383.9, to: 390.2 },
    // from the first mastiff: the guard's balloon is coming up; both mastiffs join it
    { name: 'guard', from: 1407.5, to: 1412.9 },
    { name: 'chest', from: 1646.6, to: 1652.8 },
  ],
};

/**
 * Rasta, at dusk, in the caves off the Old East Road. PvP kills (death
 * line): Morgrim 2382.5 and Grekko 2386.0 (one sign), Voïx 2423.0, a Dwarf
 * and "You gain a level!" (74) 2448.0 (two balloons side by side),
 * Thehippo 2475.8 and Domon 2480.3 (one sign). The walks between are
 * played quick: each kill still comes after the last balloon has left its
 * readable spot, so none joins a sign it did not join in the game.
 */
export const RASTA: BalloonTake = {
  run: RASTA_RUN,
  legs: [
    { kind: 'fast', from: 2350, to: 2379.5 },
    { kind: 'real', from: 2379.5, to: 2391, name: 'morgrim' },
    { kind: 'quick', from: 2391, to: 2421, speed: 5 },
    { kind: 'real', from: 2421, to: 2430, name: 'voix' },
    { kind: 'quick', from: 2430, to: 2446, speed: 3 },
    { kind: 'real', from: 2446, to: 2455, name: 'dwarf' },
    { kind: 'quick', from: 2455, to: 2474, speed: 3 },
    { kind: 'real', from: 2474, to: 2484, name: 'thehippo' },
  ],
  pieces: [
    { name: 'morgrim', from: 2382.0, to: 2388.6 },
    { name: 'voix', from: 2422.6, to: 2428.7 },
    { name: 'dwarf', from: 2447.6, to: 2453.7 },
    { name: 'thehippo', from: 2475.4, to: 2482.5 },
  ],
};

/**
 * The parade, at night: Gittan at the Gates of Ingrove (a field, a clear
 * sky), the run's first seconds there (stat, arm, shield, a meal), then
 * quiet while the parade flies. The film shows it from the leg's start.
 */
export const PARADE: BalloonTake = {
  run: GITTAN_RUN,
  legs: [
    { kind: 'fast', from: -1, to: 6.2 },
    { kind: 'real', from: 6.2, to: 13.0, name: 'gates' },
  ],
  pieces: [],
};
