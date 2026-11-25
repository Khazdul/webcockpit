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
// meta; src/share/link-payload.ts; ADR 0155 W3: src/share/shared-panes.ts
// drops only SPANE and Comm records, so Char.StatusVars and Char.Vitals
// stay, and so do the WebCockpit.Shields records, ADR 0166 addendum 41; the payload is a public GET; `level` is in PubMeta and the rows),
// worker/pub.ts (the row, views once per device and UTC day, `pub_view`
// pruned after two days, Remove and Delete account to tombstones and R2
// deleted), worker/reports.ts (one per account and run, five accounts
// hide) and the watch page (src/watch/page.tsx: the device id of the
// heartbeat, made if there is none). Change PRIVACY_SHARE_UPDATED with
// the text.

import type { LeafNav } from './about';

/** The page's date while the share links section shows. */
export const PRIVACY_SHARE_UPDATED = 'Last changed 25 November 2026';

/** The section, in About's format (one line per paragraph and per row). */
export const PRIVACY_SHARE = `SHARE LINKS
A share link is your own choice, made with an account: in History, Share a session and choose Link or Hall of Fame. What you cut is all that leaves this browser: the game text of the parts you kept, as it was (other players' tells and channels in it included); the game's own status data that the Map, Spells and Group panes use (the character's name, level, race and class, and its vitals as the game sent them), and the four bonuses the Character pane fetched from the game (offensive, defensive and parry bonus and absorption), but no channel records and no other pane; the map of the rooms the log passes, if it passes any (without your own room notes or the name of your map file); the display settings the replay needs; and the title and description you give it. With it goes a preview picture of the log's first lines, drawn in this browser, that chat apps show when the link is pasted. Your account name is shown with it as the sender. Nothing else of your runs, profiles or account goes with it. A shared log is not encrypted: it is meant to be watched.
  Who can watch   Anyone with the link, without an account. A Link log is not listed anywhere, but whoever has it can pass it on. A Hall of Fame log is listed in the Community for everyone. Whoever can watch a log can also save a copy of it, and a saved copy is theirs: removing the log does not reach it.
  What is kept    The log as you cut it, its preview picture, its title, description, character, level (not shown on the pages, but part of the log's public data) and length, when it was made, and how many have watched it. A view is counted once a day for each device and network, by the random number of the heartbeat (made for this browser if it has none) and a scrambled form of the address that changes every day; which devices watched is deleted after two days.
  Removing it     Remove a log on the Account page under Published logs, whenever you like: the link then says it was removed, and the log is deleted. Delete account removes all your shared logs.
  Reports         Anyone with an account can report a log, once; the sender is not told who. A log that breaks the rules is removed, and one that five accounts report is hidden until we have looked. A report is kept with the account that sent it. Without an account, write to abuse@mumecockpit.com with the link.`;

/** The community section (stage 65): shown when the flag `gallery` is on too. */
export const PRIVACY_COMMUNITY = `THE COMMUNITY
The Community page lists the logs shared to the Hall of Fame. Reading it needs no account; rating, commenting and writing on Random Runes need one, and what you give there is public with your account name.
  Stars           Your stars on a log are kept with your account, and you can change or take them back; the log shows the mean and the number of votes, not who gave them.
  Comments        A comment on a log's watch page is public: it is shown under the log with your account name (as you wrote it when you made the account) and its time, to everyone who can watch the log, with or without an account. You remove your own; the log's sender can remove any on their log.
  Random Runes    A note on the board is public: it is shown with your account name and its time to everyone who opens the Community page, with or without an account. It stays until you remove it or delete your account.
  Discord         A log listed in the Hall of Fame is also posted in the #log-status channel of MUME's Discord: its title, your account name, the character and the link, which Discord shows with the preview picture. When the log leaves the Hall of Fame, the post is deleted. Discord is a service of its own, and a copy it keeps of the preview is out of our reach.
  New for you     To show "new" on the menu, the time you last opened the Community page is kept with your account (or in this browser without one), and the time you last looked at your published logs.
  Reports         Comments and notes are reported as logs are, and five accounts hide one until we have looked. Delete account removes your stars, comments and notes.`;

/** The rail's entry for the community section. */
export const PRIVACY_COMMUNITY_NAV: LeafNav[number] = { id: 'community', head: 'THE COMMUNITY', nav: 'The community', letter: 'm' };

/** The rail's entry for the section. */
export const PRIVACY_SHARE_NAV: LeafNav[number] = { id: 'share', head: 'SHARE LINKS', nav: 'Share links', letter: 'l' };

const WHO = '\nWHO RUNS IT\n';
/** The Discord row of "WHO RUNS IT" (stage 72, ADR 0161), with the community section. */
const CONTACT = '\n  Contact ';
const WHO_DISCORD = "\n  Discord         Only the posts of Hall of Fame logs (under The community) go there. MUME's Discord server is run by MUME, under Discord's own terms.";

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
    text: text.replace(WHO, `\n${body}${WHO}`).replace(CONTACT, o.community ? `${WHO_DISCORD}${CONTACT}` : CONTACT),
    nav: at < 0 ? [...nav, ...entries] : [...nav.slice(0, at), ...entries, ...nav.slice(at)],
  };
}
