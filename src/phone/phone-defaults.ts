// The phone's one-time defaults (stage 52). Pure.
//
// The owner's defaults for a phone changed after 0.5.0 was in use: no
// Herblores timers, and Character is not a page of the pane strip. A new
// phone starts with them (`phoneDefaultSettings()`, which also sets the
// mark). A phone with stored settings from before gets them ONCE: when the
// phone's game layout starts and `phone.defaults` is below the mark, the
// patch below is applied and the mark written. After that the player's own
// choice always wins: switching Herblores or Character back on is never
// undone.
//
// Only the phone's game layout asks (src/phone/index.ts), so a computer's
// settings are never changed by this, whatever their mark says.
//
// The mark's value repeats src/settings/types.ts `PHONE_DEFAULTS_MARK`,
// which this chunk may not import as a value (kit.ts); a unit test holds
// them equal.

import type { Settings, SettingsPatch } from '../settings/types';

/** The newest set of one-time defaults. */
export const DEFAULTS_MARK = 1;

/**
 * The patch that gives `s` the one-time defaults it has not had, with the
 * mark; null when it has had them all (nothing is written then).
 */
export function phoneDefaultsPatch(s: Pick<Readonly<Settings>, 'phone'>): SettingsPatch | null {
  if (s.phone.defaults >= DEFAULTS_MARK) return null;
  return {
    // The Timers pane's Herblores group (the desktop gear's switch, the same key).
    timers: { groups: { herb: { enabled: false } } },
    phone: {
      // Arrays are replaced whole: every pane as it is, Character off.
      strip: { panes: s.phone.strip.panes.map((e) => (e.id === 'character' ? { ...e, on: false } : { ...e })) },
      defaults: DEFAULTS_MARK,
    },
  };
}
