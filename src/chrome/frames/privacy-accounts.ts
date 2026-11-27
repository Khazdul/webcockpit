// The privacy page's account section (stage 62, the draft of
// docs/stages/62-sync-settings-comm.md, checked against worker/ in part C2):
// shown only when the server has the flag `accounts` on, in place of
// "COMING LATER". Its own module, loaded by `import()` when the flag is on,
// so the start page's entry chunk does not carry it for guests.
//
// Keep it true to what the Worker does: worker/auth.ts (what an account
// row holds, Turnstile, Delete account), sessions.ts (180 days, the end
// reasons), attempts.ts (the counters and their cleanup), sync.ts (items,
// tombstones), ADR 0152 (Comm, seven days, removed by the devices), ADR
// 0153 (runs) and ADR 0157 (what a deletion leaves, worker/deletion.ts).
// Change PRIVACY_ACCOUNTS_UPDATED with the text.

import type { LeafNav } from './about';

/** The page's date while the account section shows. */
export const PRIVACY_ACCOUNTS_UPDATED = 'Last changed 19 November 2026';

/** The section, in About's format (one line per paragraph and per row). */
export const PRIVACY_ACCOUNTS = `ACCOUNTS
An account is your own choice; the client works without one. With an account, your profiles, scripts, settings (one set for each kind of device: desktop, tablet and phone), the scripts' data, Comm history, timers and saved runs are kept in step between your devices. They are encrypted in your browser before they are sent, with a key that only your password or your recovery code unlocks, so the site stores them but cannot read them.
  What is stored    Your user name, when the account was made and last used, and your things as encrypted pieces, each with its kind (such as profile or Comm history), its size and when it changed; a piece you delete leaves a mark without its contents. Your password and recovery code never reach the site: it keeps only values made from them that let it check them, and the key to your things locked with each.
  Runs              A saved run is stored whole (its game text, events and your cuts of it), encrypted like the rest, within the account's storage limit that History shows. A run you delete is deleted from the account and from every device.
  Comm history      What the Comm pane keeps, the other players' tells and your channels included, encrypted like the rest. It is kept for about a week, never more than ten days, in the account as in this browser: an older day is removed from the account the next time one of your devices syncs.
  Sessions          Each device you log in on: a name for it such as "Firefox on Linux", when it logged in and was last used. A session ends after 180 days without use; why it ended is kept as long again.
  Limits            To stop guessing and abuse, failed logins and recovery tries are counted per user name, and registrations per address. The address is kept only as a value that cannot be turned back, and the counts are deleted after a day or two. Create account, recovery, and a login after three failed tries ask Cloudflare Turnstile to check that you are a person.
  Deleting          Delete account removes the account and everything stored in it at once. What stays: the note of why its sessions ended, as long as above; reports already dealt with, without their text; and the site's own record of what its admin did, which names the account. Its user name stays taken, so nobody can pose as you.`;

/** The rail's entry for the section (A is Your address). */
export const PRIVACY_ACCOUNTS_NAV: LeafNav[number] = { id: 'accounts', head: 'ACCOUNTS', nav: 'Accounts', letter: 'o' };

const LATER = /\nCOMING LATER\n[^\n]*\n/;

// The sentences of the guest's page that an account makes untrue, and the
// line on Delete account that ends "REMOVING IT" (the page's last section).
const INTRO_LOCAL = 'is kept in this browser only.';
const INTRO_ACCOUNTS = 'is kept in this browser only, unless you choose to have an account (see Accounts below).';
const REMOVE_EXPORT = 'so export what you want to keep first.';
const REMOVE_EXPORT_ACCOUNTS = 'so export what you want to keep first, unless an account keeps it.';
const REMOVE_ACCOUNT = '\nTo remove an account and everything in it, use Delete account on the Account page.';
const BEAT_NOTHING = 'The heartbeat holds nothing you type, no character, profile or account name and no password, and it carries no cookie.';
const BEAT_NOTHING_ACCOUNTS =
  'The heartbeat holds nothing you type, no character, profile or account name and no password, and it carries no cookie. With an account, what is sent besides is said under Accounts.';

/** The privacy page's text and rail with "COMING LATER" replaced by the account section. Pure. */
export function withAccounts(text: string, nav: LeafNav): { text: string; nav: LeafNav } {
  return {
    text: text
      .replace(LATER, `\n${PRIVACY_ACCOUNTS}\n`)
      .replace(INTRO_LOCAL, INTRO_ACCOUNTS)
      .replace(BEAT_NOTHING, BEAT_NOTHING_ACCOUNTS)
      .replace(REMOVE_EXPORT, REMOVE_EXPORT_ACCOUNTS)
      .concat(REMOVE_ACCOUNT),
    nav: nav.map((n) => (n.id === 'later' ? PRIVACY_ACCOUNTS_NAV : n)),
  };
}
