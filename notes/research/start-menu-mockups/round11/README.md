# Runs mockups, round 11 (stage 63, part A1)

Throwaway mockups for the five points under "For the owner to choose
(round 11)" in `docs/stages/63-runs-in-the-cloud.md`. They are not app
code: the DOM is the built one as captured, with the new content drawn in
the built classes and in a few `mk-*` classes. None of it should be
copied into `src/`.

Open `index.html` to see every state as a picture, each one linking into
the file, or open `start-menu-round11.html`, which holds everything in
one self-contained file. In the file, the first row of tabs picks the
point (1–5), the second the variant, the third the state, and Desktop /
Phone the view.

Published as an artifact: https://claude.ai/artifact/RTA5x1WwBouwWkSC8hWaZ6

## Files

| File | Holds |
|---|---|
| `start-menu-round11.html` | Everything in one file (1.4 MB, no network) |
| `index.html` | The review page over `shots/` |
| `shots/` | 35 pictures (20 states; desktop and phone, the counts mostly desktop), `<state>.<view>.jpg` |
| `build/` | How the files are made (see "How true the look is") |

Shot names: `<state>.desktop.jpg` (1440 × 900) and `<state>.phone.jpg`
(390 × 844 at 1.5×).

| Point | States |
|---|---|
| 1 "Does not fit" | `fit-a-start`, `fit-a-history`, `fit-b-exit`, `fit-b-history` |
| 2 History's marks and storage line | `hist-a-list`, `hist-a-cloud`, `hist-a-fetch`, `hist-a-offline`, `hist-b-list`, `hist-b-cloud`, `hist-b-fetch`, `hist-b-offline` |
| 3 Log out with runs not in the cloud | `logout-a`, `logout-b` |
| 4 Delete, logged in | `delete-cloud` |
| 5 The counts | `count-spot`, `count-spot-fetch`, `count-diary`, `count-stats` (desktop), `count-phone` (phone, Spotlights) |

## How true the look is

`build/capture.spec.ts` is a Playwright "spec" so that it can use the e2e
fake of the account API (`tests/e2e/cloud-account-fake.ts`) with the
flags `accounts`, `sync` and `runs` on. It runs against a dev server on
port 5441, logs in (the page reloads into the account's space and syncs),
restores runs into that space (`build/seed.mjs`: nine invented runs dated
relative to today, and the e2e demo backup for Spotlights' captured
text), and captures, for desktop and phone:

- the start menu logged in;
- History's Sessions page, its Delete dialog, a session's Statistics,
  the Spotlights and Diary tabs;
- the Account page's Log out dialog with the device's runs (the built
  "saved runs on this device only" and "unsaved runs" rows);
- in a page of its own, a guest in a mocked game (the e2e way, a routed
  WebSocket): the desktop Exit popup with a rating, and the phone's
  exit sheet with a rating. The game is kept as a picture with the popup
  hidden; the popup (sheet host) as DOM in its ancestors' attributes,
  pinned where it was;
- the stylesheets, the theme, the kit's icons and one still of the sky.

`build/build.mjs` (round 10's, adapted) puts these together with
`build/mock.css` and `build/states.js`.

What is real and what is drawn:

- **Real:** the start menu, History (table, card, foot, the phone's
  two-line rows and card under the row), Statistics, Spotlights, Diary,
  the Delete dialog, the Log out dialog with its rows and buttons, the
  Exit popup and exit sheet, the game behind them (a picture).
- **Drawn here:** the "does not fit" dialog (in the kit's dialog markup,
  `wc-lk-dialog`, as the built dialogs have it), the three cloud-only
  rows and everything about where a session is (marks, sizes, tags,
  tooltip, the card's notes, the storage line's figures), stage 24's bar
  (`mk-load`, the boot loader's 2 px bar and italic line from
  `index.html`), the Log out runs rows' words, the Delete dialog's
  warning, the count line and Fetch all, the inline words and Download
  button in the Exit popup and exit sheet. The cloud glyph is new: the
  kit has no cloud icon, so one is drawn in its manner (16 × 16, one
  stroked path); a struck cloud means "not in the cloud".
- **Invented numbers:** the sizes (about 0.5 MB per played hour, before
  part A2's measurement), "48 of 50 MB" and "49 of 50 MB".
- **Left out:** the demo backup's two unsaved September sessions (the
  sweep would take them at the next load).

The sky stands still and nothing animates.

    WC_E2E_PORT=5441 npx vite --port 5441 --strictPort      # never 5173
    npx playwright test -c notes/research/start-menu-mockups/round11/build/pw.config.ts
    node notes/research/start-menu-mockups/round11/build/build.mjs
    node notes/research/start-menu-mockups/round11/build/shoot.mjs

## The words

The brief's words are used as written, except:

- **The dialog's title** is "Cloud storage full" (the spec gives only the
  body and the buttons). Under the two lines a quiet line names the run
  (character, date, length, size), so the player knows which run it is
  when the dialog comes on the start page after the game.
- **Open History is left out over History** (`fit-a-history`): it would
  lead where the player already is. Download the run and Keep on this
  device stay; Keep is the primary (Enter), as it changes nothing.
- **The inline form (1b)** puts the two sentences on one line under the
  stars and adds "Download the run" (desktop: a third button with D;
  phone: a quiet link in the card, in the style of Clear). Open History
  and Keep on this device are not repeated: Exit keeps the run on this
  device, and the start page is where History is.
- **Log out (3)**: "3 saved runs not in the cloud" with "2 cloud full ·
  1 too large for the cloud" (a), or "2 saved runs not in the cloud —
  cloud full" and "1 saved run too large for the cloud" (b). The built
  row says "on this device only" today.
- **Delete (4)**: the dialog's warning line ("This will permanently
  delete the session's logs and run data. This cannot be undone.") is
  replaced by the brief's words. A guest keeps today's line.
- **The storage line** says "This device 6.1 MB · Cloud 48 of 50 MB" in
  point 2 rather than the brief's "12 of 50", so that the "not in the
  cloud: the cloud is full" run beside it makes sense.
- **Offline (2)**: the flash line says "Offline: sessions in the cloud
  cannot be opened."; on a phone the tag shortens to "in the cloud ·
  offline".

## 1. "Does not fit"

- **a · The kit's dialog where the save was asked.** After an Exit the
  upload starts on the start page (never while playing), so the dialog
  comes there, over the whole screen (the menu panel is too small to hold
  it). From History's Save or Rate it comes over History.
- **b · Inline in the Exit popup and exit sheet, a dialog elsewhere.**
  The client knows the account's use (`usage.runBytes`) and the run's
  size before the game ends, so the popup can say it as soon as a rating
  asks for a save. History, and the start page when the cloud filled up
  only after the Exit, use a's dialog.

## 2. History's marks and storage line

Four states in each variant: the list (the device-only run chosen), a
cloud-only session chosen, its fetch (stage 24's bar in the card, the
actions waiting), and offline (the cloud-only rows quieter, the card and
the flash say why it cannot open).

- **a · A mark column and a size column.** A cloud for cloud-only, a
  struck cloud (in the "soon" colour) for a saved run not in the cloud,
  nothing for a run in step or an unsaved run. The tooltip names it. The
  size column fills every row. On a phone the mark ends the first line,
  the size sits before the stars on the second.
- **b · A text tag.** "in the cloud · 2.4 MB" (dim) or "not in the
  cloud" (the "soon" colour) beside the name; nothing for a run in step.
  On a phone the tag sits before Expires on the first line.

In both, the card says it in words: under Kept for a device-only run
("not in the cloud: the cloud is full"), under Log for a cloud-only one
("In the cloud · 2.4 MB / Fetched when opened"). The foot's storage line
reads "This device 6.1 MB · Cloud 48 of 50 MB".

## 3. Log out with runs not in the cloud

- **a · One runs row**, the reasons in the quieter second line the
  changes row has had since stage 62 (`is-two`, `wc-ac-dkinds`).
- **b · One row per reason.** Three rows with the unsaved runs; on a
  phone the dialog grows by a row.

## 4. Delete, logged in

The built dialog, with the new warning.

## 5. The counts

The line is a cloud glyph, "3 sessions in the cloud are not counted" in
the foot's quiet italic, and a small Fetch all button (desktop only).

- **Spotlights**: in the foot after "5 spotlights · 01:06"; while
  fetching, stage 24's bar in its place (`count-spot-fetch`).
- **Diary**: in the foot between Previous and Next.
- **Statistics**: under the head's "Session details" line.
- **Phone**: on its own line under Play all, without the button.

## Recommendation

- **1: a.** One dialog, one place to build and test, and it is honest
  about time: the server answers `413 quota` only after the upload, which
  happens after the game. b's inline line must predict the answer from a
  size estimate and the last known use, so it can be wrong both ways,
  and it still needs a's dialog for the cases it cannot predict. It also
  adds a third button to a popup that `#exit` from a macro must be able
  to answer with Y.
- **2: b, desktop and phone.** The tag reads without a
  legend or a hover (a touch screen has no tooltip), it costs no columns
  in a table that is already capped at 800 px beside the card, and "not
  in the cloud" is exactly the spec's words. Runs in step and unsaved
  runs carry nothing, so the tags stay rare. a's size column is the one
  thing b lacks; the card shows the size when a cloud-only session is
  chosen.
- **3: a.** The dialog stays at round 10's shape (one row per kind of
  thing), the reasons are named, and b's extra row only repeats "saved
  run".
- **4: as drawn.** The built dialog with the new line; nothing to choose.
- **5: Spotlights and Diary as drawn; leave the line out of Statistics.**
  Statistics shows one session, and opening a cloud-only session fetches
  it first, so nothing in Statistics is ever left out; there the line
  would only say that other sessions exist. The brief's place for the
  third count is better served by History's Sessions page, whose storage
  line and marks already say it.

## What did not fit well

- **"Statistics" counts nothing.** See recommendation 5. If the spec
  meant the in-game Statistics pane, that one shows only the live run.
- **No cloud icon in the kit.** The glyph drawn here would join the
  kit's set (`look-icons`) if a or the count line's glyph is picked.
- **The prediction of 1b.** The body's size is known only once the
  worker has gzipped and sealed it; before that the client can only
  estimate from `bytes`. A run near the limit could be told "full" and
  then fit, or the reverse.
- **The tooltip (2a)** is drawn beside the mark (a row paints inside its
  own box, `content-visibility: auto`, so a built one would need a
  layer of its own, like the kit's other floating pieces).
- **Fetch progress for Statistics and Export** is the same bar in the
  card; this round draws it only for Run log.
- **The size figures** are guesses until part A2's measurement.
