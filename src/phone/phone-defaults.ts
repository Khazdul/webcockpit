// The phone's one-time defaults (stages 52 and 77). Pure.
//
// The owner's defaults for a phone changed twice while it was in use:
// 1 (stage 52): no Herblores timers, no time text in the Timers pane (and
//   so the Pulse signal instead of "Time text").
// 2 (stage 77): Character is the strip's first page and on. Set 1 had it
//   off, so a phone has that stored. Only a strip still in the old default
//   order is changed: an order the player made is theirs.
// 3 (stage 77 H6): Timers became Spells; Herblores, Buffs and Debuffs go off
//   in it where Character is on in the strip (after set 2), as the card
//   shows them as stones (ADR 0166 point 172). The settings' own one-time
//   switch (`timers.stonesOff`, addendum 30) does the same at the change
//   where set 2 turns Character on; set 3 is kept as a second hand.
// A new
// phone starts with them (`phoneDefaultSettings()`, which also sets the
// mark). A phone with stored settings from before gets them ONCE: when the
// phone's game layout starts and `phone.defaults` is below the mark, the
// sets above it are applied and the mark written. After that the player's
// own choice always wins: switching Herblores or the time text back on, or
// Character off, is never undone.
//
// Only the phone's game layout asks (src/phone/index.ts), so a computer's
// settings are never changed by this, whatever their mark says. Nor are a
// tablet's from before the first mark (`phoneDefaultsAtStart`, ADR 0140).
//
// The mark's value repeats src/settings/types.ts `PHONE_DEFAULTS_MARK`,
// which this chunk may not import as a value (kit.ts); a unit test holds
// them equal.

import type { Settings, SettingsPatch } from '../settings/types';

/** What the patch reads of the settings. */
type Stored = Pick<Readonly<Settings>, 'phone'> & { timers?: Pick<Readonly<Settings>['timers'], 'signal'> };

/** The newest set of one-time defaults. */
export const DEFAULTS_MARK = 3;
/** The strip's default order before set 2. */
const OLD_STRIP_ORDER = 'timers,group,character,statistics';

/**
 * `phoneDefaultsPatch` for a start of the app: nothing in safe mode
 * (`?safe`), where the store saves on the first change and this automatic
 * one would write the default appearance over the stored one. The mark
 * stays unset, so the defaults come at the next normal start.
 *
 * Nothing on a tablet with no mark either (ADR 0140): what is stored there
 * is the desktop cockpit's, which the tablet had before it got the phone's
 * layout, and it is kept exactly as it is. A marked tablet started from
 * `phoneDefaultSettings()` and follows the later sets as a phone does.
 */
export function phoneDefaultsAtStart(s: Stored, safe: boolean, tablet = false): SettingsPatch | null {
  return safe || (tablet && s.phone.defaults < 1) ? null : phoneDefaultsPatch(s);
}

/**
 * The patch that gives `s` the one-time defaults it has not had, with the
 * mark; null when it has had them all (nothing is written then).
 */
export function phoneDefaultsPatch(s: Stored): SettingsPatch | null {
  const had = s.phone.defaults;
  if (had >= DEFAULTS_MARK) return null;
  const { panes } = s.phone.strip;
  // Arrays are replaced whole: Character first and on, the others as they are (set 2).
  const reorder = had < 2 && panes.map((e) => e.id).join() === OLD_STRIP_ORDER;
  const strip = reorder ? { strip: { panes: [{ id: 'character' as const, on: true }, ...panes.filter((e) => e.id !== 'character').map((e) => ({ ...e }))] } } : {};
  const phone = { ...strip, defaults: DEFAULTS_MARK };
  // Set 3: where Character is on in the strip (also by set 2), its stones' groups go from Spells.
  const card = reorder || panes.some((e) => e.id === 'character' && e.on);
  const groups = card ? { buff: { enabled: false }, debuff: { enabled: false }, herb: { enabled: false } } : {};
  if (had >= 1) return card ? { timers: { groups }, phone } : { phone };
  return {
    // The Timers pane's Herblores group (the desktop gear's switch, the same key).
    // And its countdown text (the "Time text" switch): bars only. The "Time text" signal marks
    // an ending timer by its text and would then show nothing, so it becomes Pulse; a signal
    // the player chose (Pulse, None) is kept.
    timers: { groups: { herb: { enabled: false }, ...groups }, timeText: false, ...(s.timers?.signal === 'text' ? { signal: 'pulse' as const } : {}) },
    phone,
  };
}
