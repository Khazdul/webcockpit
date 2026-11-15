// The settings a replay payload carries (ADR 0154 "What is uploaded").
// Pure; shared by the exporter (src/share/payload.ts) and the validator
// (src/replay/validate.ts).

import type { Settings } from '../settings';

/**
 * The settings sections a replay reads (ADR 0154 "What is uploaded"): the
 * look, the panes and their layout, the panes' options, the game window,
 * the map and the weather. Not the profile's name, the input line's
 * behaviour, Spotlights' filters (character names), window places or the
 * phone's own settings (hot key labels and commands): what is not listed
 * never leaves the device in a payload, whatever a future version adds to
 * `Settings`.
 */
export const REPLAY_SETTINGS_KEYS = ['version', 'appearance', 'panes', 'layout', 'group', 'comm', 'timers', 'output', 'mapper', 'weather'] as const;

export type ReplaySettings = Pick<Settings, (typeof REPLAY_SETTINGS_KEYS)[number]>;

/** A copy of the whitelisted sections of `s` (`REPLAY_SETTINGS_KEYS`). */
export function pickReplaySettings(s: Readonly<Settings>): ReplaySettings {
  const out: Record<string, unknown> = {};
  for (const k of REPLAY_SETTINGS_KEYS) out[k] = JSON.parse(JSON.stringify(s[k]));
  return out as ReplaySettings;
}

