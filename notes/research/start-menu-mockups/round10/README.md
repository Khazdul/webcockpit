# Sync mockups, round 10 (stage 62, part A)

Throwaway mockups for the three points of round 10 in
`docs/stages/62-sync-settings-comm.md` (part A). They are not app code:
the DOM is the built one as captured, with the new content drawn in the
built classes and in a few `mk-*` classes. None of it should be copied
into `src/`.

Open `index.html` to see every state as a picture, each one linking into
the file, or open `start-menu-round10.html`, which holds everything in
one self-contained file. In the file, the first row of tabs picks the
point (1–3), the second the variant, the third the state, and Desktop /
Phone the view.

Published as an artifact: https://claude.ai/artifact/G1zwjmFCu8v8qXkDj2k3xw

## Files

| File | Holds |
|---|---|
| `start-menu-round10.html` | Everything in one file (789 KB, no network) |
| `index.html` | The review page over `shots/` |
| `shots/` | 22 pictures (11 states × desktop and phone), `<state>.<view>.jpg` |
| `build/` | How the files are made (see "How true the look is") |

Shot names: `<state>.desktop.jpg` (1440 × 900) and `<state>.phone.jpg`
(390 × 844 at 1.5×).

| Point | States |
|---|---|
| 1 Log out, what is not in the account | `logout-a-changes`, `logout-a-runs`, `logout-b-changes`, `logout-b-runs`, `logout-all` (reference) |
| 2 Settings pulled on the start menu | `pulled-a-before`, `pulled-a-after`, `pulled-b`, `pulled-c` |
| 3 The Account page's sync section | `sync-a`, `sync-b` |

## How true the look is

`build/capture.spec.ts` is a Playwright "spec" so that it can use the e2e
fake of the account API (`tests/e2e/cloud-account-fake.ts`) with the
flags `accounts` and `sync` on. It runs against a dev server on port
5431, logs in (the page reloads into the account's space and syncs) and
captures, for desktop and phone:

- the start menu logged in (owner row "ole · synced");
- the built Account page with its built sync section (stage 61);
- the built Log out dialog, everything in the account;
- the built Log out dialog with a change the server could not take
  (`server.syncOffline`), so the real rows, lead line and buttons;
- the stylesheets, the theme, the kit's icons and one still of the sky.

`build/build.mjs` (round 9's, adapted) puts these together with
`build/mock.css` and `build/states.js`.

What is real and what is drawn:

- **Real:** the panel, the owner row, the message line (it wraps and
  moves About down, as built in stage 61), the Account page and its sync
  section, the Log out dialog, its rows, buttons and the runs' rows'
  look.
- **Drawn here:** the text of the Log out rows (1a's second line, 1b's
  rows per kind, the runs' rows in the "with runs" states), Profile's
  note "(warrior)", the two messages of point 2, 3a's line, and the
  counts "12 profiles · 5 scripts" and "310 KB" on the Account page (the
  fake account is empty).

The sky stands still and nothing animates.

    npx vite --port 5431 --strictPort          # never 5173
    npx playwright test -c notes/research/start-menu-mockups/round10/build/pw.config.ts
    node notes/research/start-menu-mockups/round10/build/build.mjs
    node notes/research/start-menu-mockups/round10/build/shoot.mjs

## The words

The brief's drafts are used as written, except:

- **The device in point 2 follows the view.** A phone only ever takes a
  phone's settings (ADR 0152, per device type), so the phone shots say
  "Settings from phone, Safari." and the desktop ones "Settings from
  desktop, Chrome."
- **2c** reads "Settings from desktop, Chrome, held until the game
  ended." instead of "…, now that the game has ended.". It is about as
  short and says why they arrive now: they were held on purpose, which
  matches "nothing is swapped during play".
- **1b** moves "(the server could not be reached)" from the row to the
  lead line: "Not everything is in your account yet: the server could
  not be reached. Logging out removes these from this device:". Repeated
  on every row it would be noise.
- **3a on a phone** names the phone first: "settings for phone (this
  device), desktop and tablet".
- **1a's count** is "4 changes" for "2 profiles · settings · Comm
  history, today": each kind counts as one change, each profile as one.

## 1. Log out, what is not in the account

The built dialog, with the server offline.

- **a · One changes row, the kinds under it.** The row stays "**4
  changes** not synced *(the server could not be reached)*", and a
  second line in the quieter serif italic says "2 profiles · settings ·
  Comm history, today". With runs it is still three rows: changes, saved
  run, unsaved runs.
- **b · A row per kind.** "**2 profiles** not synced", "**Settings for
  desktop** not synced", "**Comm history of today** not synced", each
  with the offline ring. With runs it is five rows; on a phone the
  dialog then fills most of the screen.
- **Reference:** everything in the account, the built dialog, unchanged.

## 2. Settings pulled on the start menu

The start menu draws none of the look or layout: font, colours, panes
and layout show only in the game (and in the old-look frames). The only
setting the menu shows is the **selected profile**, in Profile's note.
So "applied quietly" changes almost nothing the player can see on the
start menu. The new look appears only when the game starts.

- **a · Applied quietly.** Before: Profile "(default)". After: Profile
  "(warrior)", picked on the other desktop. No message.
- **b · Applied, with a message.** The same, and the message line says
  "Settings from desktop, Chrome." in today's orange italic. One line.
- **c · After the game, when they waited.** The start page after the
  game was left: "Settings from desktop, Chrome, held until the game
  ended." It takes one line on a desktop and on a phone.

## 3. The Account page's sync section

- **a · A line naming what follows.** Under the bar, in the page's small
  italic (`wc-ac-small`): "Follows the account: profiles, scripts,
  settings for desktop (this device), tablet and phone, script data,
  Comm history (7 days), timers." Two lines on a desktop, three on a
  phone. The page still fits 1440 × 900 without scrolling.
- **b · As built.** No new line.

## Recommendation

- **1: a.** One row for the changes keeps the dialog to three rows with
  the runs, and the kinds are still named, so nothing is hidden. b's
  five rows say "not synced" five times, the dialog gets tall on a phone,
  and stage 63 adds the runs' cloud rows on top. The quieter line also
  keeps "(the server could not be reached)" where it is built.
- **2: b, with c for settings that waited.** On the start menu a quiet
  apply (a) is almost invisible, since the menu draws no look. The player
  would first notice the change in the game, with no clue why it
  changed. The message names where the change came from at the moment
  it is applied. c is the same message with the reason it comes late.
  Both are one line.
- **3: a.** It answers "what does my account keep?" in the place the
  player looks for it, and says that settings are per device type and
  that Comm is kept 7 days. It costs two lines and the page still fits a
  desktop.

The brief's leaning (1a, 2b with 2c, 3a) stands.

## What did not fit well

- **The device label.** The brief writes "desktop, Chrome". What the
  account keeps for a device is "Chrome on Linux" (`deviceLabel`, the
  Account page's Devices list). The message could use that instead
  ("Settings from Chrome on Linux."). It names the machine better but
  leaves out the device type, which is what the settings follow. The
  headless capture shows "Browser on Linux" in the Devices list.
- **"Before/after" in 2a shows only the profile note.** The brief
  suggested a changed background or colour. The start menu draws
  neither, so there is no truthful picture of that on the start menu.
  That is the main argument against 2a.
- **Several pulls at once.** If both the profile list and the settings
  change in one sync, the message line holds one message. This round
  does not draw how two messages queue or merge.
- **Where 2c's message waits.** If leaving the game already puts a
  message on the start menu, 2c's line would replace it or have to wait.
  Not drawn.
- **Two-line rows on the kit's plates (1a).** The mark is pinned to the
  first line by hand (`mk-two`). The built `.wc-ac-dlist` centres the
  mark, which looks wrong on a two-line row.
