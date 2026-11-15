// The seeds' names and ids in one place (stage 61, ADR 0151 "Seeds"):
// `default` and the bundled profiles. Text-free and import-free (but the
// name rules) so that the database's upgrade (src/core/db.ts) can use it
// without pulling in the profile store or the bundled profiles' text.

import { DEFAULT_PROFILE } from './names';

/** The bundled profiles' names (their text: src/profiles/store.ts `BUNDLED_PROFILES`). */
export const BUNDLED_PROFILE_NAMES = ['khazdul'] as const;

export type BundledProfileName = (typeof BUNDLED_PROFILE_NAMES)[number];

/** Every seed's name: `default`, then the bundled profiles. */
export const SEED_NAMES: readonly string[] = [DEFAULT_PROFILE, ...BUNDLED_PROFILE_NAMES];

/** A seed's fixed id (`seed-default`, `seed-khazdul`). */
export const seedId = (name: string): string => `seed-${name}`;

/** The seed's id for a seed's name, else null. */
export const seedIdOf = (name: unknown): string | null => (typeof name === 'string' && SEED_NAMES.includes(name) ? seedId(name) : null);

/**
 * The `syncMeta` key (every space's database) that says the seeds were put
 * there once (ADR 0150 as built): a missing `default` afterwards is not a
 * first run, so only `default` comes back (the client needs one profile).
 */
export const SEEDED_META_KEY = 'seeded';
