# Community mockups, round 13 (stage 65, part A1)

Throwaway mockups for the seven points under "For the owner to choose
(round 13)" in `docs/stages/65-community.md`. They are not app code:
the DOM is the built one as captured, with the new content drawn in the
built classes and in `mk-*` classes on the kit's tokens. None of it
should be copied into `src/`.

Open `index.html` to see every state as a picture, each one linking into
the file, or open `start-menu-round13.html`, which holds everything in
one self-contained file. In the file, the first row of tabs picks the
point (1–7), the second the variant, the third the state, and Desktop /
Phone the view (a state drawn for one view only greys the other).

## Files

| File | Holds |
|---|---|
| `start-menu-round13.html` | Everything in one file (1.4 MB, no network) |
| `index.html` | The review page over `shots/` |
| `shots/` | 112 pictures (61 states), `<state>.<view>.jpg`: desktop 1440 × 900, phone 390 × 844 at 1.5× |
| `build/` | How the files are made (below) |

| Point | States |
|---|---|
| 1 The Community page | `comm-{a,b}-in`, `-new`, `-foot`, `-guest`, `-empty`, `-loading`, `-offline`, `-norunes` (desktop and phone); `-tab-hof`, `-tab-runes`, `-sec`, `-sec-foot` (phone only) |
| 2 Random Runes | `runes-board`, `runes-write`, `runes-long`, `runes-limit`, `runes-own`, `runes-report`, `runes-guest` |
| 3 Stars and comments | `watch-{a,b}-rated`, `-notyet`, `-comments`, `-own`, `-guest`, `-guest-c`, `-empty` |
| 4 Hall of Fame in the export editor | `hof-toggle`, `hof-guest`, `hof-rules`, `hof-form`, `hof-done`, `hof-limit` |
| 5 The counter and the reactions mark | `menu-in`, `menu-99`, `menu-guest`, `menu-none` |
| 6 Published runs as a view | `pub-row`, `pub-view`, `pub-edit`, `pub-empty` |
| 7 The admin's queue | `admin-queue`, `admin-confirm` (desktop) |

## How true the look is

`build/capture.spec.ts` is a Playwright "spec" so that it can use the e2e
fakes (`tests/e2e/cloud-account-fake.ts`, and `cloud-pub-fake.ts` through
`tests/e2e/watch-page.ts`) with the flags `accounts`, `sync`, `runs` and
`share` on. Against a dev server on port 5471 it captures, desktop and
phone: the start menu as a guest and logged in as the invented `fenwick`
(both with the dev `?community=3`), History's big box, the export editor
on the e2e demo's two-run session, the Account page with four published
runs put into the fake, the built watch page (logged in as `Norsy`), and
the HTML replay of the demo session (the dev app's exporter) photographed
at the watch page's frame sizes (1440 × 796, 1040 × 796, 390 × 560).
`build/build.mjs` puts them together with `mock.css`, `admin.css`,
`states.js` and the shell; `build/shoot.mjs` takes the pictures.

    WC_E2E_PORT=5471 npx vite --port 5471 --strictPort      # never 5173
    npx playwright test -c notes/research/start-menu-mockups/round13/build/pw.config.ts
    node notes/research/start-menu-mockups/round13/build/build.mjs
    node notes/research/start-menu-mockups/round13/build/shoot.mjs

- **Real:** the start menu with the Community row and its "3 new" (built,
  dev flag), the owner row and its gold `wc-so-news` style, History's big
  box (hood, Back, tab strip, pill segments, the kit's table and stars)
  that the Community page is drawn in, the export editor with Link, the
  Account page and its Published runs rows (stage 64), the watch page's
  band and buttons, the replay, the share dialog's classes (`wc-sh-*`),
  the Report dialog's radio list, History's star control (`wc-hd-stars`,
  smaller), the kit's toggle, the admin page's stylesheet.
- **Drawn here:** the whole Community page's content (sorts, list,
  boxes, pager, foot), Random Runes, the stars block and the comments on
  the watch page and the panel of 3b, the Hall of Fame option and its
  dialog text, the owner row's "2 new" and "99+", the Published runs view
  (the account box retitled, the rows extended with a Listed chip, stars,
  comments, views and the new mark), the Edit dialog's switch, the
  admin's comment and note cards. Glyphs the kit lacks (a small star,
  speech bubble, eye, die) are drawn in its manner.
- **Invented:** every name, title, figure, comment and note, and the
  warlords (names, races, classes) and "38 players on MUME".

## Choices drawn

- **The sort:** "Top · New · Most watched" ("Watched" on a phone), the
  period "Week · Month · All time" beside it; Top over the week is the
  default. The all-time top 8 is the **Hall of Fame** box. Proposed: keep
  the sort's word **Top** and let Hall of Fame name the all-time box (and
  the export option): "Hall of Fame this week" reads oddly, and a sort
  called Hall of Fame next to a box called Hall of Fame shows the same
  word for two lists.
- **The row:** the title with the character in brackets, the reference's
  recognisable form ("Clearing the ranger camp (Rasta L42)"), the
  sender, length, the listed date, stars with the mean and votes,
  comments, views; a rank number under Top. In 1b the row has two lines
  (title; sender · length · date) so the title is not cut by the column.
  Phone: three lines per run.
- **The boxes:** Hall of Fame (8, all time), Top posters (5), Run of the
  day (today, yesterday, Show another), and **Warlords**: "White lords"
  and "Sauron's minions", five per side with race and class, and the
  line "38 players on MUME"; no source line and no fetch time (the
  owner's word during this round).
- **Random Runes:** "name: text", one line cut with …, the age at the
  right; a pointer shows the whole note and Report (desktop), a tap opens
  it (phone); one's own note marked in gold with Remove; the field at the
  foot ("one line, everyone sees it with your name"), a count and "4 left
  today" while typing; at 5 the field is off and says when it opens;
  guests get "Log in to write".
- **Watch page:** the stars are History's Rate control; one's vote lit,
  "Your stars: four", the mean and votes beside it; not rated "Rate this
  run" (hollow, a pointer peeks); own run "12 votes · your run", no
  control; a guest "Log in to rate". Comments: name, age, text; one's own
  in gold with Remove; the sender sees Remove on all and no Report; the
  field ≤ 1 000 with a count and Post comment; a guest "Log in to
  comment"; empty "No comments yet. Be the first."
- **Export editor:** "Hall of Fame" (letter F, a star) after Link;
  greyed for a guest with "Log in to publish". The dialog "Publish to the
  Hall of Fame", the line "Everyone can find this in the Community." and
  "Listed under New at once. You can unlist it later under Published
  runs."; the result "Published" with the link, Copy, Open Community and
  Done; the 10-a-day refusal suggests Link now and listing tomorrow.
- **Published runs:** the Account page keeps one row ("4 runs · 2 listed
  · 475 views · 2 new" and a Published runs button); the view lists every
  run with a Listed / Link only chip, stars, comments, views, date, size,
  and "1 star · 1 comment new" in gold with a gold edge; Edit has the
  switch "Listed in the Community".
- **Admin:** a kind tag (Run / Comment / Note), the whole text quoted,
  the writer, for a comment the run and its sender; Hide or Restore,
  Delete, Dismiss reports, Suspend; totals for the community beside it.

## Recommendation

- **1: b, with tabs on the phone.** The list is the page's main part and
  in b it starts at the top and gets the full height, while the boxes
  and Runes stay in view beside it whatever page of the list is shown;
  in a the boxes push the list down and Runes is only seen by scrolling
  past 30 rows. Recognition survives in what is shown (the boxes, the
  bracketed character, "name: text" Runes), not in the order. On the
  phone the tabs (Runs · Hall of Fame · Runes) keep each part one tap
  away; sections make a page several screens long where the board is
  never reached. Sort word: **Top**.
- **2: as drawn.** One line per note keeps 50 notes scannable; the whole
  text and Report on pointing (or a tap) keeps the board quiet.
- **3: a.** The stars belong to the run, beside its title, where they are
  seen before playing; the frame keeps the full width (the replay's own
  side panes need it: in b the 1040 px frame squeezes them); comments
  are read after watching, so below is where they are wanted. On the
  phone a and b differ only in where the stars sit; a's is the same rule.
- **4: as drawn.** The fourth option and the listed form follow stage
  64's Link exactly; only the line and the button differ.
- **5: as drawn.** Built rows; "99+ new" as the cap.
- **6: as drawn (a view behind one row).** With stars, comments and the
  listed state per run the rows are too tall for a section; the row on
  the Account page still says what is new.
- **7: as drawn.** One queue, three kinds, the text in full.

## What did not fit well

- **The column in 1b scrolls** on a 900 px screen: Runes and the
  warlords sit under the fold of the column (`comm-b-foot`). The run of
  the day comes first because it changes daily; the order is easy to move.
- **No new-row mark in the list:** the counter clears on opening, so the
  page does not say which runs were the "3 new"; New shows them first.
- **Pager in 1a** sits under the list (the page scrolls); in 1b in the foot.
- **The phone's head** takes two rows (sort, then period) and "Mine" for
  Published runs; a sort sheet would save a row.
- **The replay in 3b's frame** is a narrower photograph (1040 px): the
  replay's right panes get tight; in the real page it is the live player.
- **The watch page's comments in 3a** are under a full-height frame, so a
  visitor sees no hint that comments exist until scrolling; the band's
  "5 comments" could be a link down (not drawn).
- **Removing a note** is drawn without a question (one line; an Undo
  flash); comments' Remove may want the kit's question.
