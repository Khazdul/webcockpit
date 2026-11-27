// The privacy page's section on shared looks (stage 80 part E, spec §7.14,
// ADR 0173): shown only when the server has the flag `looks` on, before
// "WHO RUNS IT" (after the share links and the community when they show).
// Its own module, loaded by `import()` when the flag is on.
//
// Keep it true to what the code does: what a report holds (shared/cloud/api.ts
// `LookReport`; src/looks/directory-feed.ts: kinds, the token only for a
// library look), when it is sent (src/looks/directory.ts), the look key
// (`wc.lookKey`, not the heartbeat's `wc.device`), what the Worker keeps
// and for how long (worker/lookdir.ts: the owner a keyed hash, 30 days'
// hold, 180 days, the counters in `attempt`; `find` keeps nothing) and how
// it is removed (the switch's DELETE, Delete account, the admin).
// Change PRIVACY_LOOKS_UPDATED with the text.

import { LOOK_KEEP_DAYS, LOOK_OWNED_DAYS } from '../../../shared/cloud/api';
import type { LeafNav } from './about';

/** The page's date while the section shows. */
export const PRIVACY_LOOKS_UPDATED = 'Last changed 27 November 2026';

/** The section, in About's format (one line per paragraph and per row). */
export const PRIVACY_LOOKS = `SHARED LOOKS
So that players in one group who use MUME Cockpit see each other with the right picture, your client tells the site your character's look, and asks it for the looks of the players in your group. This is on unless you turn off "Show my look to other MUME Cockpit players" (in the look picker and the Character pane's settings), with or without an account.
  What is sent    Your character's name with its race and subrace (as kinds such as elf or noldo, not the game's text), its sex, and the library picture you chose for it, if you chose one. Your own images are never sent: others see your drawing for your race and sex instead. It is sent when you are in the game and the race is known, and again when one of these changes.
  Tied to         Without an account, to a random number made for this purpose and kept in this browser as wc.lookKey (not the heartbeat's wc.device). With an account, to the account, by a scrambled value that only the site's own secret can make. When you log in, the rows of the random number are removed first, so the two are not tied together.
  What is kept    One row per character name: the four things above, a scrambled form of who sent them, and when. The first to send a name holds it: for ${LOOK_OWNED_DAYS} days after the last report nobody else can change it. A row not refreshed for ${LOOK_KEEP_DAYS} days is deleted.
  Who can see it  Anyone who knows a character name can ask the site for that row, and the race tells the side in the war. A name is normally known only to those who met the character. When your client asks for the players in your group, the site answers and keeps no note of who asked for whom.
  Limits          To stop abuse, the reports are counted per sender and per address, the address only as a value that cannot be turned back; the counts are deleted after a day or two.
  Removing it     Turning the switch off removes the rows you sent, at once. Delete account removes the account's. Write to abuse@mumecockpit.com to have a name removed, for instance one someone else holds.`;

/** The rail's entry for the section. */
export const PRIVACY_LOOKS_NAV: LeafNav[number] = { id: 'looks', head: 'SHARED LOOKS', nav: 'Shared looks', letter: 'h' };

const WHO = '\nWHO RUNS IT\n';
const NO_COOKIE = 'and it carries no cookie.';
const NO_COOKIE_LOOKS = 'and it carries no cookie. What is sent for shared looks is said under Shared looks.';

/** The privacy page's text and rail with the section before "WHO RUNS IT". Pure. */
export function withLooks(text: string, nav: LeafNav): { text: string; nav: LeafNav } {
  if (!text.includes(WHO)) return { text, nav };
  const at = nav.findIndex((n) => n.id === 'who');
  return {
    text: text.replace(WHO, `\n${PRIVACY_LOOKS}${WHO}`).replace(NO_COOKIE, NO_COOKIE_LOOKS),
    nav: at < 0 ? [...nav, PRIVACY_LOOKS_NAV] : [...nav.slice(0, at), PRIVACY_LOOKS_NAV, ...nav.slice(at)],
  };
}
