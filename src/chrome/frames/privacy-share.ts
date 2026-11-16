// The privacy page's share links section (stage 64 C2, spec §7.7, ADR
// 0154): shown only when the server has the flag `share` on (and
// `accounts`, which sharing needs), after the account section and before
// "WHO RUNS IT". Its own module, loaded by `import()` when the flag is on,
// so the start page's chunk does not carry it. The owner approves the
// words.
//
// Keep it true to what the code does: what is uploaded (ADR 0154 "What is
// uploaded": the cut payload, its whitelisted settings with the panes'
// ids, the map subset without room notes and with a neutral name, the
// meta; src/share/link-payload.ts),
// worker/pub.ts (the row, views once per device and UTC day, `pub_view`
// pruned after two days, Remove and Delete account to tombstones and R2
// deleted), worker/reports.ts (one per account and run, five accounts
// hide) and the watch page (src/watch/page.tsx: the device id of the
// heartbeat, made if there is none). Change PRIVACY_SHARE_UPDATED with
// the text.

import type { LeafNav } from './about';

/** The page's date while the share links section shows. */
export const PRIVACY_SHARE_UPDATED = 'Last changed 16 November 2026';

/** The section, in About's format (one line per paragraph and per row). */
export const PRIVACY_SHARE = `SHARE LINKS
A share link is your own choice, made with an account: in History, Share a session and choose Link or Hall of Fame. What you cut is all that leaves this browser: the game text of the parts you kept, as it was (other players' tells and channels in it included), the Map, Timers and Group panes' records (no other pane goes with it), the map of the rooms it passes when the map is on (without your own room notes or the name of your map file), the display settings the replay needs, and the title and description you give it. Your account name is shown with it as the sender. Nothing else of your runs, profiles or account goes with it. A shared run is not encrypted: it is meant to be watched.
  Who can watch   Anyone with the link, without an account. A Link run is not listed anywhere, but whoever has it can pass it on. A Hall of Fame run is listed in the Community for everyone.
  What is kept    The run as you cut it, its title, description, character, level and length, when it was made, and how many have watched it. A view is counted once a day for each device and network, by the random number of the heartbeat (made for this browser if it has none) and a scrambled form of the address that changes every day; which devices watched is deleted after two days.
  Removing it     Remove a run on the Account page under Published runs, whenever you like: the link then says it was removed, and the run is deleted. Delete account removes all your shared runs.
  Reports         Anyone with an account can report a run, once; the sender is not told who. A run that breaks the rules is removed, and one that five accounts report is hidden until we have looked. A report is kept with the account that sent it. Without an account, write to abuse@mumecockpit.com with the link.`;

/** The community section (stage 65): shown when the flag `gallery` is on too. */
export const PRIVACY_COMMUNITY = `THE COMMUNITY
The Community page lists the runs shared to the Hall of Fame. Reading it needs no account; rating, commenting and writing on Random Runes need one, and what you give there is public with your account name.
  Stars           Your stars on a run are kept with your account, and you can change or take them back; the run shows the mean and the number of votes, not who gave them.
  Comments        A comment is shown under the run with your account name and its time. You remove your own; the run's sender can remove any on their run.
  Random Runes    A note on the board is shown with your account name and is deleted after 30 days, or when you remove it.
  New for you     To show "new" on the menu, the time you last opened the Community page is kept with your account (or in this browser without one), and the time you last looked at your published runs.
  Reports         Comments and notes are reported as runs are, and five accounts hide one until we have looked. Delete account removes your stars, comments and notes.`;

/** The rail's entry for the community section. */
export const PRIVACY_COMMUNITY_NAV: LeafNav[number] = { id: 'community', head: 'THE COMMUNITY', nav: 'The community', letter: 'm' };

/** The rail's entry for the section. */
export const PRIVACY_SHARE_NAV: LeafNav[number] = { id: 'share', head: 'SHARE LINKS', nav: 'Share links', letter: 'l' };

const WHO = '\nWHO RUNS IT\n';

/**
 * The privacy page's text and rail with the share links section (and, with
 * `community`, the community section after it) before "WHO RUNS IT". Pure.
 */
export function withShare(text: string, nav: LeafNav, o: { community?: boolean } = {}): { text: string; nav: LeafNav } {
  if (!text.includes(WHO)) return { text, nav };
  const at = nav.findIndex((n) => n.id === 'who');
  const body = o.community ? `${PRIVACY_SHARE}\n${PRIVACY_COMMUNITY}` : PRIVACY_SHARE;
  const entries = o.community ? [PRIVACY_SHARE_NAV, PRIVACY_COMMUNITY_NAV] : [PRIVACY_SHARE_NAV];
  return {
    text: text.replace(WHO, `\n${body}${WHO}`),
    nav: at < 0 ? [...nav, ...entries] : [...nav.slice(0, at), ...entries, ...nav.slice(at)],
  };
}
