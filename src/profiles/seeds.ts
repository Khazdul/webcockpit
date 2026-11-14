// Whether a profile is a seed as it was seeded (stage 61, ADR 0151
// "Seeds"): `default` or a bundled profile, with its seed text. Such a
// profile is no item of the sync and never moves at Create account. Apart
// from src/profiles/store.ts so that the start-up chunk does not carry it
// (only the sync's lazy chunk asks).

import { stripSend } from './migrate';
import { DEFAULT_PROFILE } from './names';
import { BUNDLED_PROFILES, PROFILE_TEMPLATE } from './store';

/** The seed's text by name, or null for a name that is no seed's. */
export function seedText(name: string): string | null {
  if (name === DEFAULT_PROFILE) return PROFILE_TEMPLATE;
  return BUNDLED_PROFILES.find((b) => b.name === name)?.text ?? null;
}

/** True for a seed as it was seeded: a seed's name and its text (whatever its id and times). */
export function isUntouchedSeed(rec: { name: string; text: string }): boolean {
  const t = seedText(rec.name);
  return t !== null && stripSend(t) === rec.text;
}
