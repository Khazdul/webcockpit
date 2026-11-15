# Share links mockups, round 12 (stage 64, part A1)

Throwaway mockups for the six points under "For the owner to choose
(round 12)" in `docs/stages/64-share-links.md`. They are not app code:
the DOM is the built one as captured, with the new content drawn in the
built classes and in a few `mk-*` classes. None of it should be copied
into `src/`.

Open `index.html` to see every state as a picture, each one linking into
the file, or open `start-menu-round12.html`, which holds everything in
one self-contained file. In the file, the first row of tabs picks the
point (1–6), the second the variant, the third the state, and Desktop /
Phone the view.

Published as an artifact: https://claude.ai/artifact/BFgBssf8Qq4RFm5z5u9q11

## Files

| File | Holds |
|---|---|
| `start-menu-round12.html` | Everything in one file (1.3 MB, no network) |
| `index.html` | The review page over `shots/` |
| `shots/` | 85 pictures (44 states; desktop and phone, the admin page desktop only), `<state>.<view>.jpg` |
| `build/` | How the files are made (see "How true the look is") |

Shot names: `<state>.desktop.jpg` (1440 × 900) and `<state>.phone.jpg`
(390 × 844 at 1.5×).

| Point | States |
|---|---|
| 1 Link in the export editor | `link-a-guest`, `link-a-in`, `link-b-guest`, `link-b-in` |
| 2 The share dialog | `share-a-form`, `share-a-again`, `share-a-up`, `share-a-done`, `share-a-big`, `share-a-quota`, `share-a-offline`, `share-b-rules`, `share-b-form`, `share-b-done` |
| 3 The watch page | `watch-{a,b}-loading`, `-playing`, `-owner`, `-removed`, `-hidden`, `-unknown`, `-notyet` |
| 4 Published runs | `pub-a-list`, `pub-a-edit`, `pub-a-remove`, `pub-a-empty`, `pub-b-row`, `pub-b-list`, `pub-b-edit`, `pub-b-remove`, `pub-b-empty` |
| 5 Report | `report-form`, `report-thanks`, `report-already`, `report-guest` |
| 6 The admin's report queue | `admin-queue`, `admin-confirm`, `admin-empty` (desktop) |

## How true the look is

`build/capture.spec.ts` is a Playwright "spec" so that it can use the e2e
fake of the account API (`tests/e2e/cloud-account-fake.ts`) with the
flags `accounts`, `sync`, `runs` and `share` on. It runs against a dev
server on port 5461, logs in as the invented `fenwick`, restores round
11's invented runs and the e2e demo backup (`build/seed.mjs`), and
captures, for desktop and phone:

- the start menu logged in (for the sky and the theme);
- History → Export on the demo's two-run Rasta session (the export
  editor with its log, the format toggle and the foot);
- the Account page;
- the HTML replay of the same session, built by the dev app
  (`__wc.replayHtml`, the exporter's own code), opened as a file and
  photographed while playing at the exact size the watch page's frame
  has in each variant (desktop 1440 × 796 / 822, phone 390 × 676 / 640).

`build/build.mjs` (round 11's, adapted) puts these together with
`build/mock.css`, `build/admin.css` and `build/states.js`. The admin page
uses `ADMIN_CSS` as the Worker serves it (`worker/admin/page.ts`).

What is real and what is drawn:

- **Real:** the export editor, the Account page with its Sync section and
  rules, the kit's dialog, field, text area, check and buttons (markup
  as `look-controls.tsx` renders it), the HTML replay (a picture of the
  real file), the admin page's stylesheet.
- **Drawn here:** the Link option (and its glyph: the kit has no link
  icon; one drawn in its manner, as are a flag for Report and a
  down-arrow for Download), the tooltip, the share, rules, edit, remove
  and report dialogs' content (in the kit's dialog markup), the size
  bar, stage 24's bar for uploading and loading, the watch page around
  the frame (no built page exists: the band and the strip are new,
  `mk-w-*`, in the kit's tokens), the published runs rows (in the kit's
  flat rows, `wc-lk-rows is-flat`), the radio look for the reasons (the
  kit's check with a round well), and the admin page's new sections.
- **Invented:** every account name, title, description, id, count and
  size. The replay's text is the e2e demo backup's (itself generated,
  `tests/fixtures/runs-demo.gen.ts`).

The sky stands still and nothing animates.

    WC_E2E_PORT=5461 npx vite --port 5461 --strictPort      # never 5173
    npx playwright test -c notes/research/start-menu-mockups/round12/build/pw.config.ts
    node notes/research/start-menu-mockups/round12/build/build.mjs
    node notes/research/start-menu-mockups/round12/build/shoot.mjs

## The words

The brief's words are used as written ("Log in to share", "Anyone with
the link can watch this.", "This run was removed by its sender.", "This
link does not work yet.", "You have already reported this run.", "Log in
to report", the four reasons), plus:

- **The rules** (ADR 0148 "Rules and reports") as five short lines: "The
  log shows other players: no harassment." "Nothing about people's real
  lives." "MUME's own rules apply." "You can take a run down whenever
  you like." "We remove what breaks this." The tick: "I have read this
  and agree".
- **The title's hint** in the first form: "From the character and date;
  yours to change." The prefilled title is "Rasta · 26 September 2026"
  (the demo doc has no title of its own).
- **The refusals:** "Too large: a link holds at most 5 MB. Exclude more
  of the log and try again." (with "6.3 MB of 5 MB" in the size line);
  "You have 150 published runs, the most an account can hold. Remove one
  on the Account page first." (with Open Account); "Offline: the link
  could not be made. Try again when you are online." (Create link
  becomes Try again).
- **The result:** "Link created", the link in a read-only field with
  Copy, "Copied.", and "You find it again, and can remove it, on the
  Account page under Published runs."
- **The watch page's other states:** hidden "This run is hidden." / "It
  was hidden after reports and waits for a look."; unknown "There is no
  run at this link." / "Check the address, or ask whoever sent it."; the
  owner's note "Hidden after reports. Only you can watch it until we
  have looked; nothing is needed from you."
- **Report:** "What is wrong with “…”?", "More (optional)" with a 500
  count, "The sender is not told who reported."; the thanks: "Thank you."
  / "We look at every report. A run that breaks the rules is removed; one
  that many report is hidden until then."; logged out: "Reports come
  from accounts, one per run. Without an account, write to
  abuse@mumecockpit.com with the link."
- **Published runs' foot:** "4 of 150 · 6.1 MB · links do not count
  against your 50 MB." Empty: "No published runs yet. In History, Export
  a session and choose Link."
- **The file row** says Title instead of File when Link is chosen (a link
  has no file name or extension).

## 1. Link in the export editor

Link is the third option of the format toggle, letter L.

- **a · Greyed for a guest.** The option is there but off; a hover (or
  L, or a tap on a phone) says "Log in to share".
- **b · Hidden for a guest.** Only HTML replay and Plain text; under the
  toggle a quiet line "Log in to share a run as a link."

Logged in (both): Link chosen, Export opens the share dialog.

## 2. The share dialog

The kit's dialog over the export editor: Title (prefilled), Description
(optional, ≤ 500 with a count), the size against 5 MB with a small bar,
"Anyone with the link can watch this.", Cancel and Create link.

- **a · The rules inside the dialog,** the first time for the account:
  a well under the form with the five lines and the tick; Create link
  waits for it. Later times the form alone.
- **b · The rules as a step before,** a dialog of their own ("Before you
  share", "A shared run is shown to strangers.", the lines, the tick,
  Continue), then the form.

Uploading (stage 24's bar, the fields locked), the link with Copy, and
the three refusals are drawn for a; b's are the same.

## 3. The watch page

No start page, the theme's own dark, the replay in a frame.

- **a · A band over the frame:** the title in the kit's display face,
  then character and level, length, date, views and "shared by", the
  description in one quiet line; Report, Download as HTML and Back on
  the right. On a phone the band stacks (title, details, three buttons)
  and the description is left out.
- **b · The frame first,** the details and actions in a strip under it
  (the description only on a phone, where the strip is taller).

Loading (details first, the bar in the frame), playing, the owner's view
of a hidden run (the note takes the description's line, so the frame
keeps its size), and the four error states as a small kit box with Back
to MUME Cockpit (the same in a and b).

## 4. Published runs

Each run on two lines: the title and "37 views · 15 Nov 2026 · 1.2 MB ·
link only"; then `/r/<id>` with Copy, Edit and Remove. A hidden run is
dimmed with a flag and "Hidden after reports. Only you can watch it until
we have looked." Edit is a dialog (title, description); Remove asks
first and says what the link will say.

- **a · A section on the Account page,** after Sync (the page scrolls;
  Devices, Password and Leaving follow).
- **b · A view of its own,** behind a row on the Account page ("4 runs ·
  175 views · 1 hidden after reports" and a Published runs button); the
  view has room for each description.

## 5. Report

One dialog over the watch page: the four reasons as a radio list (the
kit's check with a round well), More (optional) ≤ 500, Send report; the
thanks; "You have already reported this run."; logged out "Log in to
report" with the abuse address and Log in.

## 6. The admin's report queue

The admin page's own plain look. Reports first, grouped by run, the most
reported first: title and state ("hidden after 5 reports" / "shown"),
sender, character, id, size, views and date, the reasons with counts,
the reporters' names, the newest text, then Watch, Hide or Restore,
Delete, Dismiss reports and Suspend <sender>. Beside it the totals
(runs, stored bytes, new today, hidden, views today, against R2's 10 GB)
and the newest admin_log rows (`who` as the hash). Every action asks in a
plain modal; Delete wants the id typed and takes a note for the log.

## Recommendation

- **1: a.** A greyed Link tells a guest that sharing exists and how to
  get it, at the place they would look; b's line adds a sentence to a
  foot that is already full on a phone, and a hidden option is found by
  nobody.
- **2: a.** One dialog, one step: the rules sit where the decision is
  made, and the tick only adds a box once per account. b adds a dialog
  that is seen once and makes the first share a two-step flow for no
  gain in what is read.
- **3: a.** The title and who shared it come first, as on any page you
  are sent to; Report and Download are found without scrolling past the
  replay; the frame keeps the replay's own header line at its top. b
  hides who made it under a long log and puts the actions next to the
  player's own controls, where they are easy to press by mistake on a
  phone.
- **4: a.** Most accounts will have a handful of runs, and the Account
  page is where the spec already sends players to remove one; a section
  shows them without a click. When stage 65 adds stars, comments and
  "listed", b's view of its own becomes the better place: the rows are
  the same, so the move is cheap.
- **5: as drawn.** One dialog, nothing to choose.
- **6: as drawn,** two columns so the queue, totals and log fit one
  screen.

## What did not fit well

- **Link icon, flag, download arrow:** the kit has none; the three
  glyphs here would join `look-icons`.
- **The watch page is new ground:** no built page to capture, so the
  band and strip are drawn in the kit's tokens, not taken from a frame.
  A built version may want the kit's hood for the title.
- **The replay in the frame** is a photograph, cropped to the frame's
  exact size; in the real page it is the live player.
- **Length vs the player's clock:** the band says the played length
  ("1 h 15 min", `lengthS`), while the player shows its own timeline
  (02:02 here, the demo's compressed clock). The real meta and payload
  agree.
- **The phone's band (3a)** wraps the details over two lines; the
  description is not shown there (a tooltip does not exist on touch).
  A tap on the title could show it.
- **The account page scrolls** with the section (4a) on a phone; the
  list could fold after three runs.
- **The 150 refusal** may be known before Create link (the account's
  count from `GET /api/u/pub`); drawn as the server's answer.
