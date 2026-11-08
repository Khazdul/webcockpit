// The film's game excerpts (video/manuscript.md, "Sources"): the owner's
// Bree session in the film backup (video/private/film-runs.jsonl.gz, not
// committed), by run id and seconds from the run's start. Only these specs
// are committed; record/lib/run-feed.ts reads the log itself.
//
// The compression (speed, drop, maxGap) is a first guess; the scenes that
// use an excerpt set the final values against the beat grid.
import { fileURLToPath } from 'node:url';
import type { Excerpt } from '../record/lib/run-feed.ts';

/** The film backup: the owner's five runs (History, Spotlights, Credits) and the Bree session. */
export const FILM_BACKUP = fileURLToPath(new URL('../private/film-runs.jsonl.gz', import.meta.url));

/** The Bree session, 2026-11-08. */
export const BREE_RUN = 'Gittan/2026-11-08T12-07-39';

export const EXCERPTS = {
  /** 0:07–0:24: the pony joins the group and gets a label; `where` at the fountain. */
  pony: { run: BREE_RUN, from: 7, to: 24, maxGap: 1.5 },
  /** 1:05–1:22: the mercenary (Tod) is hired. */
  merc: { run: BREE_RUN, from: 65, to: 82, maxGap: 1.5 },
  /** 1:28–1:42: out of the west gate; shield, arm, invis. */
  gate: { run: BREE_RUN, from: 88, to: 102, maxGap: 1.2 },
  /** 2:05–2:31: the second wolf: attack, Tod joins, assist, the kill, butcher. */
  wolf: { run: BREE_RUN, from: 125, to: 151, speed: 1.6, maxGap: 1 },
  /** 2:41–4:14: the barman's quest (most of his monologue to be dropped by the scene). */
  barman: { run: BREE_RUN, from: 161, to: 254, maxGap: 2 },
} satisfies Record<string, Excerpt>;

export type ExcerptName = keyof typeof EXCERPTS;
