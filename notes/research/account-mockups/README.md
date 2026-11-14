# Account mockups (stage 60)

Throwaway mockups for the owner's choice (docs/stages/60-accounts.md,
task B; spec §7.0 rule 6, §7.2; ADR 0145). Not app code: a simplified
DOM in the real classes, never meant to be copied into `src/`.

Open `index.html` (every state as a picture, linking into the files), or
`account-mockups.html` (everything in one self-contained file, for
publishing). In a file, the upper tabs choose the page, the lower ones
its state, and Desktop / Phone the view (the phone is a 390 × 844
frame). Buttons and links that lead somewhere work, the recovery code's
confirmation works (type `3YJA`), the wait counts down.

## Files

| File | Holds |
|---|---|
| `account-mockups.html` | Everything, one file (0.7 MB, no network) |
| `entry.html` | The entry on the start page: variants A, B, C |
| `login.html` | Log in: empty, filled, Working…, error, Turnstile, the wait |
| `create.html` | Create account: one page (variant 1), two steps (variant 2) |
| `recovery-code.html` | The recovery code page |
| `recover.html` | Recovery ("Forgot password") |
| `account.html` | The Account page and its dialogs |
| `index.html` | The review page over `shots/` |
| `shots/` | `<state>.desktop.jpg` (1440 × 900) and `<state>.phone.jpg` (390 × 844 at 1.5×) |
| `build/` | How they are made (below) |

The screenshots are JPEG, not PNG: a PNG of this sky is about 1 MB, and
there are over a hundred.

## How true the look is

`build/capture.mjs` takes, from a running dev server, the start page's
own DOM (menu, wordmark, almanac, the Profiles page, a kit dialog, the
phone's keyboard and in-game menu sheet), the stylesheets as source, the
`<html>` element's theme properties and one still of the sky (a fixed
dusk, `skyHour=19.1 … skyFreeze`). `build/build.mjs` puts that, the five
fonts and `build/mock.css` + `build/states.js` (the new content, classes
`mk-*`) into each file. So frames, fonts, colours, buttons, fields,
dialogs and the keyboard are the real ones; only what is new is drawn
here. The sky stands still, and nothing morphs between pages.

    npx vite --port 5393 --strictPort         # never 5173
    node notes/research/account-mockups/build/capture.mjs
    node notes/research/account-mockups/build/build.mjs
    node notes/research/account-mockups/build/shoot.mjs

## 1. The entry on the start page

With the flag `accounts` off, nothing of this shows in any variant: the
start page is today's.

Free key letters on the start menu: taken are E P S H L C A (and K for
the kit gallery in development). Of the letters in "Account", **O, U, N
and T** are free; the mockups use **U**. ("Log in" would offer O, G, I,
N, but a label that changes with the state cannot carry a fixed letter,
so the row is always called Account.)

- **A · a menu row.** A seventh row `ACCOUNT (log in)` /
  `ACCOUNT (olev) ●`, between Spotlights and Credits (the player's own
  things above, the client's below), built as the Profile row is: the
  name in brackets, then the state mark. The box grows by one row
  (42 px on a desktop); the quote moves down by as much;
  nothing else moves. The phone gets the same row, and could get one in
  the in-game menu sheet too (state "Phone: in-game menu").
- **B · a quiet corner line.** No menu row. Two lines in the almanac's
  own type in the opposite corner: bottom left on a desktop, top left
  on a phone (its bottom is the almanac's, its top right the
  full-screen button's). `U` or a click opens it. Menu and quote are
  untouched; there is room for the state in words ("in step",
  "offline").
- **C · inside Profiles.** The start page is exactly today's. A strip
  at the foot of the Profiles page says "kept in this browser only …
  Log in / Create account", or the name and the sync state with an
  Account button. Only when something needs the player does the start
  page speak, as a pill at the top right where the update notice sits.

**Recommendation: A.** It is what spec §7.2 says, it is found without
being looked for, it works the same by key, mouse and finger, the state
mark has an obvious home, and its price is one row in a box that has
the room (at 1440 × 900 the quote still clears the almanac). B is the
choice if the menu must not grow: it is the least disturbing on a
desktop, but it is a second kind of entry on a page that has only menu
rows, it is easy to miss, and on a phone it is a small target in a
corner. C hides the account so well that a new player will not learn it
exists, and it says "accounts are about profiles" when they are also
about scripts, settings and runs.

The state mark (a placeholder for stage 61): a steady green dot (in
step), a slowly breathing gold dot (syncing), a hollow ring (offline),
an amber diamond (needs attention). What needs attention is said on the
Account page.

## 2. The pages

All are normal kit boxes over the sky, with Back at the top left and
Esc. Pages with text fields have no key letters (letters are text):
Tab moves, Enter presses the lit button. The Account page and the
dialogs without fields have key letters as elsewhere.

- **Log in** (440 px). Name, password, Log in; Create account and
  Forgot password as links below a rule. Wrong name or password: one
  line, the password cleared and focused. After three failures the
  Turnstile box comes in above the button. The 15-minute wait is a
  countdown with one plain sentence.
- **Working…** A slow even bar and a sentence that says how long
  ("about a second" / "a few seconds" on a phone). WebCrypto reports no
  progress from PBKDF2, so the bar can only run on time: the last
  measured time on this device, or a first guess.
- **Create account, variant 1 (recommended):** one page. On a desktop
  the form on the left and the six points on the right, the Turnstile
  box and the button in a foot row; nothing scrolls at 1440 × 900. On a
  phone one column: fields, the warning, the six points, Turnstile,
  the button. **Variant 2:** two steps, the six points alone first
  ("Go on"), then a short form. One key press more; the points are
  surely seen, and each phone page is short.
- **Recovery code.** The code in six groups (one row on a desktop, two
  rows of three on a phone), Copy, Download as a text file, the "only
  way back" line in the page's one amber plate, and "type its last
  group" before Continue lights. No Back; Esc does nothing.
- **Recovery.** Name, recovery code (dashes and capitals do not
  matter), new password twice, Turnstile. Says what happens: every
  device is logged out, the code stays the same; and what holds if the
  code is lost too.
- **Account.** Grouped from everyday to rare:
  1. Head: the name, "Account since …", the sync state and Sync now.
  2. Storage: two quiet bars (profiles, scripts and settings 0.1 of
     2 MB; saved runs 12 of 50 MB).
  3. Devices: the sessions, this device first; End on each other row,
     End all others in the rule.
  4. Password and recovery: Change password, New recovery code.
  5. Notices: the gallery notice switch.
  6. Your data on this device: Download everything, Safety copy as
     files.
  7. Leaving: Log out; Delete account, last, small, red, no key letter.

  On a desktop 2–3 are the left column and 4–7 the right, with no
  scrolling at 1440 × 900. On a phone the box fills the screen and the
  same groups run in one column in that order, so the dangerous things
  are a full scroll away.
- **Dialogs.** Log out carries the choice (keep, the default; remove,
  which turns the button red and counts unsynced changes). Delete
  account asks for the password and the typed name; the cursor rests on
  Cancel. End session, End all others, Change password (with its
  Working state), New recovery code (asks the password, then shows the
  code page again).

## Open questions for the owner

1. **The entry:** A, B or C? If A: is U the letter, and is the place
   (between Spotlights and Credits) right, or should it be last?
2. **The in-game menu on a phone:** an Account row there too, or only
   on the start page?
3. **Create account:** one page (variant 1) or two steps (variant 2)?
4. **The name in the texts:** the pages say "user name" and "account";
   the entry says Account. Is "Log in" / "Log out" the wording wanted
   (not "Sign in")?
5. **The recovery code after a recovery:** the mockup says the code
   stays the same (ADR 0145's keys allow it). Or should a recovery
   always end by showing a new code?
6. **Devices:** is "Firefox on Linux" enough as a label, or should a
   player be able to name a device?
7. **The state mark:** dot, breathing dot, ring, diamond. Enough, or
   should the start page say the state in words (as B does)?

## What did not fit well

- **Name availability.** The brief asks for availability messages
  while typing. The API has no such call by design (names must not be
  listable, ADR 0145), so "taken" can only come after Create is
  pressed, that is after the Working state. The mockup shows it there.
  Live messages are for the format only.
- **A calm progress.** There is no true progress to show (above). If
  the time guess is wrong on a slow phone the bar waits near its end;
  the sentence carries the honesty.
- **The Turnstile box** is Cloudflare's own drawing, 300 × 65 in a
  grey that is not ours; on a 390 px phone it just fits the box
  (366 px inside). Its dark theme is the closest it gets.
- **"Sync now" and the state mark** are placeholders: stage 61 decides
  what they say. "Safety copy as files" only exists after a first sync.
- **The safety copy and "Download everything"** are about this device,
  not the account. They are grouped as "Your data on this device" so
  that this is plain, but they would sit as well on the Profiles and
  History pages, where exports already are.
- **Key letters on a phone** do not exist; the mockups drop them there
  as the app does.
