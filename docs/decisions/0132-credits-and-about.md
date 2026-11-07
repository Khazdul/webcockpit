# 0132 — Credits and About in the new look

- Status: Accepted (stage 47 built in wave 2 of the broad pass; owner testing with stages 42–47)
- Date: 2026-11-07
- Related: stage 47 (`docs/stages/47-credits-about.md`), ADR 0127 (the look
  pages base), ADR 0019 (Credits, the chronicle), ADR 0110 (the Spotlights
  filter, which Credits follows), ADR 0027 (the licence at the site root),
  ADR 0125 (start surface and the lantern kit), ADR 0126 (the wordmark and
  the "M" mark).
- Reference: `notes/research/start-menu-mockups/README.md` ("Round 7
  decisions"), `round7/about/credits-b.html` (the book),
  `round7/about/about-a.html` (the leaf), `round7/about/CONTENT.md`.
  Inventory: §3.11 (About) and the Credits part of §7.6.

## Context

The last two text pages of the start menu, Credits and About, were TUI
frames on the cell grid: Credits a roll that scrolled the chronicle at one
row a second and returned to the menu by itself (ADR 0019), About a
scrolling text with a TUI scrollbar (Inv §3.11). Round 7 gave the owner
three directions for each; he chose **Credits = B "Krönikeboken"** (the
chronicle as a book, without the mockup's Opening tab) and **About = A
"Bladet"** (one long leaf with a contents rail). Both use layout B's large
box (ADR 0127). Stage 47 built them in three packages: 47-A (Credits),
47-B (About), 47-C (tests, this ADR, the inventory notes).

Owner decisions (README "Round 7 decisions", 2026-11-07): no Opening
chapter pill; no Settings… with the chronicle (it still follows the
Spotlights filter); About links the third-party notices instead of
holding them; a small, still wordmark at the head of the About leaf; both
pages use the box size layout B gives every big page (no width cap on the
box; the book and the reading column cap themselves inside it).

## Decision

### 47-A — Credits: the book

**The chronicle as structure.** `src/share/chronicle.ts` gains a pure
`chronicleBook(runs, filters, { nowUs })` → `{ opening, chapters: [{ name,
header, pre, post, deeds: [{ us, date, rest, kind }] }], end } | null`,
built from the same templates, hashes, filters and order as
`buildChronicle` (which stays, unchanged, for its tests; wave 3 removes it
if dead). Every template starts with `{date}`, so a deed splits into its
date phrase (set in small caps) and the rest. `pre` and `post` come from
splitting the header's *template* around `{name}`, not the rendered
header, so a name that also occurs in the template's words ("Tale")
splits correctly.

**The page.** `CreditsFrame = lookFrame(…)`, a `<Box title="Credits"
size="large">` with Back. Head: the chapter pills (`Seg kind="pills"`),
one per character, no Opening pill; the lit pill is kept in view; a click
jumps to that chapter's first page, also a click on the already lit pill
(the kit's `Seg` reports only changes, so a capture-phase click on a
wrapper catches the re-click). Body: the book, two pages with a shaded
gutter, or one page when the book is under 640 px wide
(`CREDITS_ONE_PAGE`); a folio (`— 3 —`) at the foot of each page; the
opening line as an **epigraph at the top of page 1**, above the first
chapter, so no page lacks a pill and Home goes there. Each chapter starts
on a new page with its title page (the header's words in small caps
around the name in Cinzel, then an ornament rule). The first deed of a
chapter has a drop cap in the `--lk-inlay-metal` gradient
(`background-clip: text` plus one drop shadow; metal, never glow). *The
End.* closes the last chapter. The book is capped at 1180 × 1000 px
inside the box. Foot: Previous (P) and Next (N) glass buttons, disabled
at the ends; no Settings….

**No roll and no automatic return.** The book waits for the reader; only
Esc and Back leave. The roll's code and CSS are gone (`creditsWidth`,
`creditsRoll`, `CREDITS_ROWS_PER_S`, `CREDITS_FADE`, `CREDITS_HINT`).

**Pagination: one column box per chapter, not `break-before: column`.**
Firefox does not honour forced column breaks (a chapter ran on from the
previous page). `.wc-cred-pages` is absolutely placed in the book (46 px
top, 64 px bottom; 26 / 48 on one page; gutter `g` = 84 px, 56 on one
page). Each chapter (`.wc-cred-ch`) is its own box with `column-count: 1;
column-fill: auto; column-gap: g`, one page wide and one page high, its
overflow columns one page pitch (book width / pages per spread) apart,
placed at `left: calc(var(--wc-cred-p) * (100% + g) / per)`. Pages per
spread, the gutter and the one-page type sizes come from a container query
on the book (`wc-cred-book`, max-width 639.98 px), so CSS alone lays the
book out at every size. Script never decides pages per spread itself: the
measure reads the `--wc-cred-per` the query applied (falling back to the
unrounded width against 640 px where no computed value comes, as in a
test DOM). A rounded `clientWidth` would read a 639.5 px book as 640 and
count two pages over a one-page layout (wave 3 fix). The paper and the gutter shading are a separate
still layer (`.wc-cred-bg`).

**Measure.** One read of layout for the whole book: a chapter's page
count is the column of an empty inline tail mark at the end of its last
line, `floor((tail.left − chapter.left + 0.5) / pitch) + 1`, the pitch
being the book's unrounded width (`getBoundingClientRect`) over pages per
spread. A chapter's
page count does not depend on where it is placed, so the first pages
follow by prefix sum with no second read. The book measures at mount
(before the first paint, since ADR 0127 lays the box out at its final
size from its first frame; until then only the first chapter shows, via
`:not([data-ready])`), again when `useBoxSettled()` turns true, on a
`ResizeObserver` change (debounced 120 ms, after comparing the entry's
unrounded `contentRect`, since a fraction of a pixel can cross the
query), and on `document.fonts` `loadingdone` /
`ready`.

**Turning.** The spread offset is pure CSS:
`translateX(calc(var(--wc-cred-s) * -1 * (100% + g)))`; a spread is one
book width, so a resize needs no script to stay aligned. A turn animates
the moving layer (`.wc-cred-spread`: pages and folios): a 170 ms ease-in
fade with a 14 px drift out (`fill: forwards`), then the position lands
and a 240 ms fade-in runs from a layout effect; the out animation is
cancelled one frame later. If `finish` has not come 250 ms after the
fade-out should have ended (`TURN_LATE`: a stalled or starved timeline,
as headless Firefox showed), a timer lands the turn instead; whichever
comes first lands it, once. Presses during the fade-out only retarget the
landing. With reduced motion, or without Web Animations, a turn is
instant. Only `transform` and `opacity` animate; no layout during a turn,
no `backdrop-filter` on the book.

**Position model.** `BookPos { ch, off, lit }`: the chapter of the left
page, the page inside it, and the lit pill. A page turn uses `posAt(layout,
spread)`: the lit pill is the last chapter that starts on the spread, else
the chapter of the left page (as in the mockup; with the demo backup Rasta
is lit on opening, while page 1 shows the epigraph and Gittan). Pills and
↓ / ↑ set `{ ch: k, off: 0, lit: k }`. A re-layout shows `spreadOf(layout,
pos)`, clamped inside the chapter, so a resize keeps the chapter and the
page inside it; the lit pill changes only when it is no longer on the
spread shown.

**Keys.** → / PgDn / Space the next spread, ← / PgUp the previous, ↓ / ↑
the next / previous chapter (from the lit one), Home / End, N / P, Esc /
Back. Enter does nothing. ↓ in the last chapter does nothing: "next
chapter" never turns back (clamping it sent a reader past the last
chapter's first page back to that page). ↑ in the first chapter goes to
the book's first page.

**Touch.** A local `useSwipe` (`addEventListener`, passive): touchstart /
touchend, and pointerdown / pointerup for pen and touch pointers when no
touch events come; touch wins when both arrive. A swipe needs |dx| > 40 px
(`CREDITS_SWIPE`) and |dx| > |dy|. The book has `touch-action: pan-y`.
Listeners, not JSX props: Preact binds `onTouchStart` only where the
element knows `ontouchstart`, which a desktop browser's element does not.

**States as pages of the book.** `CreditsState = loading | error | no_data
| filtered | book`. Loading (`Loading…`, faint), the storage error, no
data and filtered are a single page with Previous / Next disabled; keys
other than Esc do nothing. The filtered page adds a second line: *The
filter on the Spotlights page chooses what the chronicle tells.* (there is
no Settings… here). `no_data` against `filtered` uses `emptyState(filters,
any)`, with `any` = a book with `OPEN_FILTERS` exists, as before. The
filters and `nowUs` are read when the page opens. Credits keeps its own
texts (`CREDITS_TEXT`) and no longer imports `EmptyStateFrame`,
`FilteredFrame` or `CREDITS_EMPTY` from `spotlights.tsx` (wave 3 removes
the dead copies there).

### 47-B — About: the leaf

**One text source.** `ABOUT_TEXT` stays the only copy of the text and is
parsed by the pure `aboutSections(text)` → `{ id, title, blocks: ({ p } |
{ kv: [key, text][] })[] }[]`: an ALL-CAPS line is a heading, an indented
`key  description` line a key/value row (consecutive rows grouped), any
other line a paragraph; the untitled first section is the intro. Section
ids, rail labels and letters come from the fixed `ABOUT_NAV` table,
matched on how a heading starts, so a heading's wording can change
without breaking ids; an unknown heading gets a slug id and no letter.
The old `aboutLines` (the TUI page's wrapped lines) is gone (47-C).

**Links and commands** go through one pure tokenizer, `aboutTokens(text,
base)`. The site's own files (`LICENSE.txt`, `THIRD_PARTY_NOTICES.md`,
`fonts/README.md`) resolve under `import.meta.env.BASE_URL`, web addresses
(mume.org, discord.gg, github.com, tintin.mudhalla.net) to https. Every
link opens in a new tab with `noopener noreferrer`. Game commands (`#help`,
`#weather demo`, `?safe`) are set in the terminal font.

**The page.** `AboutFrame = lookFrame(…)`, a `<Box title="About"
size="large">` with Back. The reading column (max 700 px, centred in
`BoxBody`) holds the head (`LookWordmark size="small"`, still, 64 px high;
the line `WebCockpit <version> (<commit>)`), an ornament rule, the intro
as an italic centred lead-in, each section with a Cinzel heading and a
short rule, Cormorant paragraphs, key/value rows as a `.wc-lk-kv` table
with gold Cinzel keys, and a colophon (an ornament rule and the `Seal` at
54 px). The last line of Licence links the notices: *Third-party notices:
THIRD_PARTY_NOTICES.md*; there is no notices section in the rail (nine
rows, not the mockup's ten).

**The rail and the strip.** The rail is the kit's `.wc-lk-rows` with flat,
transparent rows, each with its letter marked (W M B G I S U C L). Its
narrow form is a `Seg kind="pills"` strip in `BoxHead`. Both are always
rendered and a container query on the box's `wc-page` container picks one
(720 px or less: the strip; about a 760 px window), so nothing runs on a
resize; the page lays itself out by its box width (ADR 0127). A tap on the
lit pill jumps back to its section's head. On the phone the window's top
padding is 52 px so the strip clears the coarse 40 px Back.

**Scroll spy.** One passive scroll listener compares `scrollTop` with
cached `offsetTop` values; the cache is refreshed by a `ResizeObserver` on
the scroller and the leaf and once `useBoxSettled()` turns true. No
layout reads per scroll event. The section whose head has passed a third
of the view is lit (`ABOUT_SPY_AT`); at the end of the scroll, the last.

**Jumps pin their section.** A rail click, a pill tap or a letter scrolls
smoothly (instantly with reduced motion) and keeps the chosen section lit
through the scroll and after landing until the next scroll event, so a
jump that lands at the end keeps its section rather than the last one.
Landing is `scrollend`, with a 160 ms quiet-time fallback; the reader's
wheel or touch ends a jump at once.

**Keys.** ↑ / ↓ are instant 40 px steps (`ABOUT_LINE`; smooth steps lag
under key repeat). PgUp / PgDn / Space / Enter scroll 85 % of the view
(`ABOUT_PAGE`; Shift+Space back), Home / End and the letters smoothly
(instantly with reduced motion). A page counts from the in-flight target,
so repeated PgDn adds up. Esc / Back leave.

**The scroller keeps the mockup's 26 px top mask fade.** Headless
measurements (software rendering, a loaded machine) could not show
whether it costs frames; it is the first thing to drop if a real-window
measurement shows a cost in Firefox. No `backdrop-filter` on the leaf; the
box keeps the large window's glass (ADR 0127).

**The notices at the site root.** `vite.config.ts`'s `licencePlugin`
serves (dev) and emits (build) `THIRD_PARTY_NOTICES.md` beside
`LICENSE.txt`, from a table of root files, with the type GitHub Pages
gives `.md` (`text/markdown; charset=utf-8`); Chromium and Firefox display
it. The link works offline from any copy of the site. The notices name the
upright Cormorant Garamond Medium the start page's pages now use.

**About's facts** changed with the new pages (all in `ABOUT_TEXT`): Esc or
Back goes back one page; "Help in the profile editor"; the Runs line
(History, Spotlights as a wall of cards, Credits as a book, the filter row
on the Spotlights page for both); Export's two formats; "Manual on the
Scripts page, or F1 in the editor"; the fonts' uses; the Licence
paragraph's own-licence sentence and the notices link.

### 47-C — Tests and docs

**E2E specs.** `tests/e2e/credits.spec.ts` (Chromium and Firefox): the
demo book (epigraph, first chapter, title, drop cap's gradient, *The
End.*, `*Name the Race*`, pills = characters only, no Opening, no
Settings…, one spread with both buttons disabled, no roll and no return
after 1.5 s, Enter does nothing, Esc back); turning a synthetic book of
five long chapters (→ ← PgDn Space PgUp, N / P, the buttons, End / Home
with the ends disabled, ↓ in the last chapter staying put, ↓ ↑ with the
title page in view, a pill click, the
lit pill kept while turning inside a chapter and a click on it going back
to the chapter's first page, Back); a resize from 1440 to 600 px keeping
the chapter, one page and one folio, no sideways scroll, then a book
639.5 px wide laid out and counted as one page with a chapter's title on
the page its pill shows; the filter (one
character; every kind off: the filtered page with its Spotlights line, no
pills, Back); no runs: the no-data page, Esc. `tests/e2e/about.spec.ts`:
the small wordmark, the version with the package's number, the lead-in,
the eight headings, the kv tables, the seal, nine rail rows with their
letters, the strip hidden; ↓ / ↑ 40 px, PgDn / Space / Enter 85 %, PgUp,
the spy (a long section scrolled near the top is lit, `aria-current`),
End (Licence lit, the seal in view), Home; C / G / W and a rail click
jump and the section stays lit; every leaf link has `target=_blank` and
`noopener`, the web addresses, and `LICENSE.txt`, `fonts/README.md` and
`THIRD_PARTY_NOTICES.md` each served with status 200 (the notices name
Cormorant Garamond); the commands in the terminal font.

**The phone is its own spec,** `tests/e2e/phone-credits-about.spec.ts`
(the `phone` project, Pixel 7, touch), at 390 and 360 wide: Credits one
page, real touch swipes through CDP (`Input.dispatchTouchEvent`) turn
forward and back, a short swipe does nothing, Next / Previous and a pill
by tap, head, foot and book inside the screen, no sideways scroll, Back by
tap; About's rail hidden and the nine-pill strip shown under Back, a tap
jumps (the pill kept in view in the strip), no sideways scroll, Back by
tap. Phone specs must be named `phone*.spec.ts` to run in that project
(playwright.config.ts), hence the separate file.

**A synthetic chronicle** (`tests/e2e/chronicle.ts`, `restoreChronicle`):
a runs backup built in the page (one run per character, level-ups,
achievements and PvP kills in turn, a few days before the demo clock),
gzipped with `CompressionStream` and restored, since the demo backup
fills only one spread at 1440 px.

**Unit.** `chrome-frames.test.tsx`'s `About text` describe now tests
`aboutSections` (the nine sections in the rail's order, the kv rows of
What is inside, Credits and Built for PvP, every line of the text kept),
`aboutTokens` (the eight links with their hrefs under a base, the three
commands, the text given back unchanged), the unique letters marked in
their labels, and the facts this stage changed. The start page's About
assertions read the leaf (the hood's title, `WebCockpit 9.9.9`); the
client-notices test's old-look frame is now the Profile list's name
prompt (New, N), which stays on the cell grid after wave 2. The roll's
tests are gone (`spotlights.spec.ts`, `spotlights-settings.spec.ts`,
`share-reel.test.ts`, and 47-A's removal of the popup path in
`spotlights-settings.test.tsx`).

## Performance

- **Pagination** (47-A, dev server, 7 chapters / 147 deeds, a forced
  re-layout plus all reads): 5–11 ms in Chromium and Firefox, under the
  30 ms budget. Not yet measured on the Iris Xe or on a production build
  (wave 3).
- **Turns** are `transform` and `opacity` only. Headless Firefox at
  2560 × 1440 on a loaded machine advances the document timeline only as
  fast as it paints (about 0.6 s a frame there), so a turn took about
  1.8 s; Chromium's took the planned 0.4 s. The specs wait for the
  attribute, never for a time.
- **About's scroll**: headless only, not conclusive (47-B: Firefox p50
  127 ms with the mask, 129 without; Chromium 108 against 67). A
  real-window measurement decides the mask (wave 3).
- **Build** (47-A): chrome chunk 245.44 / 87.10 kB gzip, chrome CSS
  70.30 / 15.83 kB gzip.

## Consequences

- The cell-grid About and the Credits roll are gone, and so are their
  TUI-only specs (wave 3): `scrolling.spec.ts`'s About case now checks
  the pixel wheel on the leaf's native scroller (`.wc-about-body`; the
  keys are `about.spec.ts`'s); `scrollbar-drag.spec.ts`'s About drag
  moved to the narrow Statistics pane, the last `░█` bar a desktop test
  reaches without a live game; `phone-scrollbar-drag.spec.ts`, whose only
  case was About's, is deleted, and ADR 0106's addendum notes that no
  phone test drags a `░█` thumb any more.
- `buildChronicle` and the Spotlights page's `EmptyStateFrame`,
  `FilteredFrame` and `CREDITS_EMPTY` may be dead: wave 3's sweep.
- Kit gaps found here, for the kit later: a swipe helper (`useSwipe`, also
  useful to Spotlights); a `Seg` option to report a click on the chosen
  option (both pages work round it with a capture-phase click); the large
  window's top padding does not grow with the coarse 40 px Back (both
  pages add their own room for it, as stage 43 did); `LookWordmark` has no
  size between `small` (MUME only) and `full`, if the owner wants COCKPIT
  under the mark in About.
- A turn lands when its fade-out's `finish` fires, or by a timer 250 ms
  late (wave 3), so a stalled timeline never holds a turn.
- About's text (wave 3): Getting started says Profile in the game's menu
  bar opens the editor and Import has its own page with a receipt; the
  Phone row names History, Export and the scripts' settings (stages
  43–45). The menu bar line was checked and still holds.

## Open questions (owner, after testing)

- Should Credits ignore the Spotlights filter and always tell everything?
  Built: Credits follows the filter (ADR 0110), read when the page opens.
- About shows the small wordmark (MUME only, no COCKPIT row). Enough, or a
  full mark at a small width? Built: `LookWordmark size="small"`, 64 px.
- `THIRD_PARTY_NOTICES.md` shows as raw Markdown in the browser (as
  `fonts/README.md` does). Acceptable, or render it / publish a `.txt`?
  Built: the `.md` file at the site root.

## Addenda to older ADRs

- ADR 0019 (Credits): addendum 2026-11-07, the roll replaced by the book.
- ADR 0110 (the Spotlights filter): addendum 2026-11-07, Credits has no
  Settings…; the Spotlights page's filter sets both.
- ADR 0027 (the licence at the site root): addendum 2026-11-07,
  `THIRD_PARTY_NOTICES.md` beside `LICENSE.txt`.
