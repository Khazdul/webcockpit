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
export const PRIVACY_SHARE_UPDATED = 'Last changed 15 November 2026';

/** The section, in About's format (one line per paragraph and per row). */
export const PRIVACY_SHARE = `SHARE LINKS
A share link is your own choice, made with an account: in History, Share a session and choose Link. What you cut is all that leaves this browser: the game text and the panes of the parts you kept, as they were (other players' tells and channels in them included), the map of the rooms it passes when the export shows the map (without your own room notes or the name of your map file), the display settings the replay needs (among them the names of your panes, script panes included), and the title and description you give it. Your account name is shown with it as the sender. Nothing else of your runs, profiles or account goes with it. A shared run is not encrypted: it is meant to be watched.
  Who can watch   Anyone with the link, without an account. The link is not listed anywhere, but whoever has it can pass it on, and can download the run as a file.
  What is kept    The run as you cut it, its title, description, character, level and length, when it was made, and how many have watched it. A view is counted once a day for each device, by the random number of the heartbeat (made for this browser if it has none); which devices watched is deleted after two days.
  Removing it     Remove a run on the Account page under Published runs, whenever you like: the link then says it was removed, and the run is deleted. Delete account removes all your shared runs. A copy someone has downloaded is theirs.
  Reports         Anyone with an account can report a run, once; the sender is not told who. A run that breaks the rules is removed, and one that five accounts report is hidden until we have looked. A report is kept with the account that sent it. Without an account, write to abuse@mumecockpit.com with the link.`;

/** The rail's entry for the section. */
export const PRIVACY_SHARE_NAV: LeafNav[number] = { id: 'share', head: 'SHARE LINKS', nav: 'Share links', letter: 'l' };

const WHO = '\nWHO RUNS IT\n';

/** The privacy page's text and rail with the share links section before "WHO RUNS IT". Pure. */
export function withShare(text: string, nav: LeafNav): { text: string; nav: LeafNav } {
  if (!text.includes(WHO)) return { text, nav };
  const at = nav.findIndex((n) => n.id === 'who');
  return {
    text: text.replace(WHO, `\n${PRIVACY_SHARE}${WHO}`),
    nav: at < 0 ? [...nav, PRIVACY_SHARE_NAV] : [...nav.slice(0, at), PRIVACY_SHARE_NAV, ...nav.slice(at)],
  };
}
