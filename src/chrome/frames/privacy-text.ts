// The privacy page's text (stage 59, spec §7.6, ADR 0147), in About's
// format (src/chrome/frames/about.tsx `aboutSections`): an ALL-CAPS line is
// a heading, an indented `  key  description` line a key/value row, every
// other line a paragraph; the untitled first section is the intro.
//
// Keep it true to what the code does: the five fields of `Beat`
// (shared/cloud/api.ts), when they are sent (src/cloud/beat.ts) and how
// long the server keeps what (worker/, ADR 0147). Change PRIVACY_UPDATED
// with the text.

import type { LeafNav } from './about';

/** Shown under the wordmark at the head of the page. */
export const PRIVACY_UPDATED = 'Last changed 14 November 2026';

export const PRIVACY_TEXT = `WebCockpit runs in your browser. Your game goes straight from the browser to MUME, and what you set up here (settings, profiles, scripts, maps and recorded runs) is kept in this browser only. This page says what the site itself learns, and what it does with it.

WHAT IS SENT
While the page is open and on screen, it sends the site a small heartbeat: when it loads, every five minutes after that, and when you move between the start page, the game and a replay. A tab in the background sends none. Each heartbeat holds these five things and nothing else:
  Device          A random number made for this browser the first time it sends a heartbeat, kept in the browser's local storage as wc.device. It says nothing about who you are, and it is not tied to your characters or to any account.
  Version         The WebCockpit version, such as 0.9.3.
  Device type     Desktop, tablet or phone.
  Browser         The family only: Firefox, Chrome, Safari, Edge, Samsung Internet or other.
  State           On the start page, playing, or watching a replay.

Nothing you type, no character, profile or account name and no password is ever sent to the site. The heartbeat carries no cookie.

WHY
To know how many people use WebCockpit: how many are online now, how many each day, and how that changes over time. The start page may show how many are online. Who is online is never shown, to anyone. Counting this way is in the site's legitimate interest, and it is kept so small that it says nothing about you.

WHAT IS KEPT
  Each device     Its latest heartbeat (the five things above, and when the device was first and last seen), and the days it was seen, for counting use per week and month. Deleted after 35 days without a heartbeat; a device that comes back after that counts as new.
  Samples         How many were online and playing, every five minutes. Kept for 90 days.
  Daily figures   Totals for each day: devices, new devices, the most online at once, minutes played, and the split by device type, browser and version. Kept for good. They hold no device numbers.

YOUR ADDRESS
No IP address is stored. To stop abuse, the site limits how many heartbeats one address may send; the address is used for that check in passing and then forgotten.

COMING LATER
Accounts, to keep your profiles and settings in step between devices, and shared runs, to publish a run for others to watch, do not exist yet. When they come, this page will say what they keep before you can use them, and both will be your own choice.

WHO RUNS IT
  Hosting         The site runs on Cloudflare, which processes the data above on WebCockpit's behalf. The database that holds it is kept in Cloudflare's EU jurisdiction.
  Contact         abuse@mumecockpit.com, for questions about this page, to have data removed, or to report abuse.

REMOVING IT
To start over as a new device, clear this site's data in your browser's settings, or remove wc.device from the site's local storage with the browser's developer tools. Clearing the site's data also deletes your settings, profiles, scripts and runs in this browser, so export what you want to keep first.

What the site holds for an old device number is deleted by itself after 35 days. To have it removed sooner, write to abuse@mumecockpit.com with the number (the value of wc.device).`;

/** The privacy page's rail. */
export const PRIVACY_NAV: LeafNav = [
  { id: 'intro', head: '', nav: 'Privacy', letter: 'p' },
  { id: 'sent', head: 'WHAT IS SENT', nav: 'What is sent', letter: 'e' },
  { id: 'why', head: 'WHY', nav: 'Why', letter: 'y' },
  { id: 'kept', head: 'WHAT IS KEPT', nav: 'What is kept', letter: 'k' },
  { id: 'address', head: 'YOUR ADDRESS', nav: 'Your address', letter: 'a' },
  { id: 'later', head: 'COMING LATER', nav: 'Coming later', letter: 'c' },
  { id: 'who', head: 'WHO RUNS IT', nav: 'Who runs it', letter: 'w' },
  { id: 'remove', head: 'REMOVING IT', nav: 'Removing it', letter: 'r' },
];
