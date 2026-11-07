# Stage 47 — Credits and About

Status: **Next** (planned 2026-11-07; built in wave 2 of the broad pass,
after stage 42, in parallel with stages 43, 44, 45 and 46).

## Goal

Move the two text pages of the start menu out of the TUI grid and into the
new look the owner chose in round 7:

- **Credits = B "Krönikeboken"** (the chronicle as a book): the big box
  holds an open book, two pages side by side (one on a phone), each
  character's chapter starting on a new page with a title page and a
  mithril drop cap; the reader turns the pages. **Without a separate
  "Opening" tab.** Replaces today's roll (Inv §7.6, ADR 0019, 0110).
- **About = A "Bladet"** (one long leaf): the whole About text in one
  reading column with a contents rail that follows the reading, the
  wordmark small at the top of the leaf, the "M" seal at the end.
  Replaces today's scrolling TUI text (Inv §3.11).

Both pages use the big box that layout **B "Rummet växer"** gives them.

## Owner decisions

From "Round 7 decisions (owner, 2026-11-07)" in
`notes/research/start-menu-mockups/README.md`, and the defaults the owner
accepted for the round 7 open questions (recorded here as decisions):

1. **Credits = B "Krönikeboken"** (`round7/about/credits-b.html`), **no
   "Opening" chapter tab**: the chapter pills are the characters only.
2. **No Settings… button with the chronicle.** Credits does not open the
   Spotlights settings; the chronicle still follows them (ADR 0110: the
   filter on the Spotlights page chooses kinds, characters and period for
   both).
3. **About = A "Bladet"** (`round7/about/about-a.html`).
4. **About links to the full third-party notices instead of containing
   them** (the mockup shows the whole of `THIRD_PARTY_NOTICES.md` as a
   section; the build links to it).
5. **The wordmark small at the top of the About leaf** (the mockup lets
   the full wordmark glide down into the leaf's head; the build places a
   small wordmark there, still, no glide).
6. **Text pages use the box size that "B Rummet växer" gives them**: the
   large box, inset by the box margin on every side, like the other big
   pages (no width cap; the reading column and the book cap themselves
   inside the box).

Technical decisions taken while planning (record them in this stage's
ADR, **0132**, assigned by the main session):

- **The opening line** (*Here the scribes have set down …*) stays: it is
  set as an epigraph at the top of the book's first page, above the first
  chapter's title, so there is no page without a pill. Home goes there.
- **No roll and no automatic return.** The book waits for the reader (the
  B mockup; the owner chose it). Only Back / Esc leave.
- **The filtered state** (events exist but nothing passes the filter) is
  a page of the book: *No chronicle entries match your settings.* and,
  under it, *The filter on the Spotlights page chooses what the chronicle
  tells.* (there is no Settings… here, decision 2). No data and the
  storage error are book pages too, with today's texts. Back / Esc leave
  from every state.
- **The chronicle as structure.** `src/share/chronicle.ts` gets a pure
  `chronicleBook(runs, filters, { nowUs })` → `{ opening, chapters: [{
  name, header, pre, post, deeds: [{ us, date, rest, kind }] }], end } |
  null`, built from the same templates, hashes and order as
  `buildChronicle` (every template starts with `{date}`, so a deed splits
  into its date phrase, set in small caps, and the rest). `buildChronicle`
  stays (its tests use it); wave 3 removes it if dead.
- **Pagination** is CSS columns inside the book, measured once the box
  has settled and again on a resize (keeping the current chapter); page
  turns are a transform plus a short fade (reduced motion: none).
- **About's text stays one source**, `ABOUT_TEXT` in `about.tsx`, now
  parsed into sections (heading, paragraphs, key/value rows) by a pure
  `aboutSections(text)`; the rail's letters come from a fixed table
  (below). The third-party notices file is published at the site root
  (`THIRD_PARTY_NOTICES.md`, next to `LICENSE.txt`, by the same Vite
  plugin pattern, also in dev) so the link works offline from any copy of
  the site.
- **Credits keeps its own texts.** It stops importing `EmptyStateFrame`,
  `FilteredFrame` and `CREDITS_EMPTY` from `spotlights.tsx` (stage 46's
  file) and holds the three texts itself; wave 3 deletes the dead copies.

## References

Read first: `CLAUDE.md`, the top of `progress.md`, this file, then:

- Mockups (throwaway code; re-derive the look in the app's structure):
  - `notes/research/start-menu-mockups/round7/about/credits-b.html` (the
    book; ignore its Opening pill and its Settings… button), states
    `?spread=2`, `?empty`, `?filtered`, `?error`, `?loading`.
  - `round7/about/about-a.html` (the leaf), states `?sec=credits`.
  - `round7/about/common.js` (the chronicle as structure: `PG.chronicle`,
    `PG.deedHtml`; the About sections and letters: `PG.about`, the
    section table at the top), `common.css`.
  - `round7/about/CONTENT.md`: what both pages hold today, the states, the
    stale facts in the About text.
  - `round7/about/index.html`: the review notes.
  - `round7/layout/b-room.html` (the big page), `round7/base/README.md`
    (the kit's look, `.orn-rule`, `.kv`, the drop cap's inlay).
- `docs/stages/42-look-pages-base.md` and ADR 0127 (its "API" and
  "Canonical names" sections). Do not start before it is merged.
- ADRs: 0019 (Credits), 0027 (licence file at the site root), 0110
  (Spotlights settings filter Credits), 0125 (start surface, kit), 0126
  (wordmark, the "M" favicon), 0127 (stage 42).
- Inventory: `notes/research/cockpit-inventory.md` §3.11 (About), §7.6
  (Credits).
- `THIRD_PARTY_NOTICES.md`, `vite.config.ts` (`licencePlugin`).

## Current code (what this stage replaces or touches)

| File | Today | This stage |
|---|---|---|
| `src/chrome/frames/credits.tsx`, `credits.css` | The roll (1 row/s, fade bands, `Escape to exit`, pops at the end), `creditsWidth`, `creditsRoll`, loading / error / empty / filtered via Spotlights' frames | Rewritten as the book (WP 47-A); `CreditsFrame` keeps its name (the menu pushes it) |
| `src/share/chronicle.ts` | `buildChronicle` (wrapped rows), templates, `datePhrase`, `stableHash`, `eventSentence` | Additions only: `chronicleBook` |
| `src/chrome/frames/about.tsx` | `ABOUT_TEXT`, `aboutLines(width)`, `linked`, the TUI scroll frame with version and commit | Rewritten as the leaf (WP 47-B); `AboutFrame` and `ABOUT_TEXT` keep their names |
| `vite.config.ts` | `licencePlugin` emits `LICENSE.txt` (build) and serves it (dev) | The same for `THIRD_PARTY_NOTICES.md` (only that plugin's hunk) |
| `src/chrome/frames/spotlights.tsx` | Exports `EmptyStateFrame`, `FilteredFrame`, `CREDITS_EMPTY` | **Not touched** (stage 46's file); Credits stops importing them |

What must keep working:

- **Credits content** (unchanged wording, `src/share/chronicle.ts`):
  every stored run's events (no log needed), filtered by
  `settings.spotlights` read when the page opens; one chapter per
  character, oldest first deed first; the chapter header from the seven
  templates by `stableHash(name)`; one sentence per death, level-up, PvP
  kill and achievement, oldest first, five templates per kind; `*Name the
  Race*` victims; *at level N* on deaths when known; *The End.* last.
- **Credits states** and texts: loading (keys other than Esc ignored),
  storage error *The chronicle could not be read from this browser's
  storage.*, no data *No chronicle yet. Your tale is written as you play:
  …*, filtered *No chronicle entries match your settings.*
- **About content**: the whole `ABOUT_TEXT` (intro, MUME, Built for PvP,
  Getting started, What is inside, Settings, Lua scripts, Credits,
  Licence); the version and build commit (`0.2.6 (1544265)`, from
  `services.version` / `services.commit`); the links (mume.org,
  discord.gg, github.com, tintin.mudhalla.net, `LICENSE.txt`,
  `fonts/README.md`, now also `THIRD_PARTY_NOTICES.md`) in a new tab,
  local files under `import.meta.env.BASE_URL`.
- **About keys**: ↑↓ a line, PgUp / PgDn a page, Enter / Space a page
  down, Home / End, Esc back; plus the section letters (new).
- **Phone**: both pages fit at 390 × 844 and 360 wide, everything by tap;
  the book one page at a time with a swipe; About's rail as a strip of
  section pills.

## Scope

In: the Credits book, the About leaf, `chronicleBook`, `aboutSections`,
the notices file at the site root, the About text facts that the new
pages change (Spotlights' filter row, Credits as a book, History, the
notices link), tests, this stage's ADR (0132), Inv §3.11 and the Credits
part of §7.6 (stage 46 writes the Spotlights part).

Out: the Spotlights settings popup and the filter itself (stage 46; the
popup is left in place, unused by Credits); README and the manual's
screenshots (wave 3); the phone ESC menu.

## Work packages

Each package is sized for one subagent. File ownership is exclusive
across stages 43–47 in wave 2: touch only your files; read anything.

### WP 47-A — Credits: the book

Owns: `src/chrome/frames/credits.tsx`, `src/chrome/frames/credits.css`,
`src/share/chronicle.ts` (additions only), `tests/unit/chronicle-book.test.ts`
(new).

- `export const CreditsFrame = lookFrame(function CreditsFrame() …)`:
  `<Box title="Credits" size="large" onBack={nav.pop}>`.
- Head: the chapter pills (kit `Seg`, one per character, the current
  chapter lit and kept in view; a click jumps to its first page).
- The book: two pages with a shaded gutter (one page under 640 px of book
  width), folios `— 3 —` at the foot of each page; the epigraph (the
  opening line) at the top of page 1; each chapter on a new page (CSS
  `break-before: column`) with its title page (`pre` small caps / the name
  large in Cinzel / `post`), an ornament rule, the deeds as paragraphs
  (the first with a drop cap in the mithril inlay, metal not glow), the
  date phrase in small caps; *The End.* after the last chapter.
- Foot: Previous (P) and Next (N) glass buttons, disabled at the ends.
  No Settings….
- Keys: → / PgDn / Space next spread, ← / PgUp previous, ↓ / ↑ next /
  previous chapter, Home / End, P / N, Esc / Back leave. Touch: a
  horizontal swipe over 40 px turns the page.
- States as book pages (see decisions): loading (`Loading…`, faint),
  error, no data, filtered with the Spotlights-filter line.
- Layout: paginate after the box has settled (`useBoxSettled()`)
  and on a resize (debounced ~120 ms), keeping the current chapter and the
  page inside it.
- Remove `creditsWidth`, `creditsRoll`, `CREDITS_ROWS_PER_S`,
  `CREDITS_FADE`, `CREDITS_HINT` (the roll's) and their CSS.

Uses from 42: `Box size="large"` and `useBoxSettled()`, `BoxHead` /
`BoxFoot`, `Seg kind="pills"`, `GlassButton` (`iconAfter` for Next ›),
`OrnRule`, the `--lk-inlay-*` tokens (the drop cap's gradient), the type
tokens `--lk-display`, `--lk-serif`, `--lk-sc`, `letterAction`.

### WP 47-B — About: the leaf

Owns: `src/chrome/frames/about.tsx`, `src/chrome/frames/about.css`
(new), `vite.config.ts` (only `licencePlugin`, or a sibling plugin, to
emit and serve `THIRD_PARTY_NOTICES.md`), `THIRD_PARTY_NOTICES.md`
(facts only, if the build's fonts or libraries changed).

- `export const AboutFrame = lookFrame(function AboutFrame() …)`:
  `<Box title="About" size="large" onBack={nav.pop}>`.
- Left: the contents rail (rows, Cinzel small caps, the letter marked),
  the current section brightens as you read (scroll spy at a third of the
  view; the last section at the end); a click or the letter jumps
  (smooth; instant with reduced motion). Letters: **W** WebCockpit, **M**
  MUME, **B** Built for PvP, **G** Getting started, **I** What is inside,
  **S** Settings, **U** Lua scripts, **C** Credits, **L** Licence.
- Right: the reading column (max ~700 px, centred in the body): the head
  with the **small wordmark** (`<LookWordmark size="small">`, still) and the
  line `WebCockpit 0.2.6 (1544265)`; an ornament rule; the intro as the
  lead-in (italic, larger, centred); each section with its Cinzel head
  and a short rule; paragraphs in Cormorant; key/value lines as a small
  two-column table (Cinzel keys); links lit and underlined; at the end of
  Licence a line linking the full notices ("Third-party notices:
  THIRD_PARTY_NOTICES.md"); the colophon: an ornament rule and the "M"
  seal (`<Seal>`, the favicon's mark).
- Keys: ↑ / ↓ about 40 px, PgUp / PgDn / Space / Enter 85 % of the view,
  Home / End, the letters, Esc / Back.
- Phone (≤ 760 px): the rail becomes a strip of section pills above the
  text (scrolls sideways, the current one kept in view).
- `aboutSections(text)` (pure, exported): sections `{ id, title, blocks:
  ({ p } | { kv: [key, text][] })[] }` from `ABOUT_TEXT` (ALL-CAPS line =
  heading; indented `key  description` = key/value; the rest paragraphs).
  `aboutLines` goes.
- `ABOUT_TEXT` facts: the Runs line (*The card at the top right of the
  Spotlights reel picks …* → the filter row on the Spotlights page picks
  the kinds, characters and period shown there and in Credits); Credits
  as a book; the Licence paragraph names `THIRD_PARTY_NOTICES.md`; check
  every line against the pages of stages 43–46 as they are planned
  (`ABOUT_TEXT` is this package's alone: the Scripts lines 44d would have
  changed are done here, from stage 44's plan) and leave the rest to wave
  3.

Uses from 42: `Box size="large"`, `BoxBody` (scroller, `bodyRef`), the
rows classes as the rail (`.wc-lk-rows > .wc-lk-row.is-on`), `Seg
kind="pills"` (the phone strip), `LookWordmark size="small"`, `Seal`,
`OrnRule`, `.wc-lk-kv`, the link style and type tokens, `letterAction`,
`useReducedMotion`.

### WP 47-C — Tests, ADR, docs

Owns: `tests/e2e/credits.spec.ts` (new), `tests/e2e/about.spec.ts`
(new), `tests/unit/chrome-frames.test.tsx` (only the `About text`
describe), ADR 0132, Inv §3.11 and the Credits part of §7.6, the
checklist.
Deletes (single hunks; the files belong to stage 46):

- in `tests/e2e/spotlights.spec.ts` the test `Credits rolls the
  chronicle; ESC returns, and so does the end`;
- in `tests/e2e/spotlights-settings.spec.ts` the test `Credits follows
  the filters; its filtered page rolls after a change`;
- in `tests/unit/share-reel.test.ts` the `Credits roll` describe and the
  `creditsRoll, creditsWidth` import line.

And edits only these hunks of shared start-page tests (use stage 42's
helpers in `tests/e2e/look.ts`):

- `tests/e2e/chrome.spec.ts`: the Credits and About assertions of
  `keyboard navigation, Credits, About and ESC` (the titles `─── Credits
  ───` / `─── About ───`);
- `tests/unit/chrome-frames.test.tsx`, `start page` describe: the About
  assertions (`─── About ───`, `─── About ─── 9.9.9`) in the keys test and
  the click test; in `client notices: glass pills over the sky, the TUI row
  over an old-look frame` About is the old-look example: switch it to the
  Profile list's name prompt (New, N), which stays old-look after wave 2
  (stage 43 does not move it), or, if that changes, mark the
  old-look branch for wave 3 (say so in the session report).

## Tasks

- [ ] Stage 42 merged; read its file and ADR 0127
- [x] WP 47-A: `chronicleBook`; the book (pills, pages, epigraph, title pages, drop cap, turns, states, swipe, phone)
- [x] WP 47-B: the leaf (rail, scroll spy, letters, small wordmark, version, kv tables, links, notices link, seal, phone); notices file at the site root; About text facts
- [ ] WP 47-C: tests (new specs, deletions, chrome.spec hunk), ADR 0132, Inv notes
- [ ] Typecheck, lint, unit, e2e (Chromium and Firefox) green
- [ ] Performance check (below)
- [ ] Screenshots at 1280×720, 1440×900, 2560×1440 and 390×844 reviewed by
      the main session against `credits-b.html` and `about-a.html`
- [ ] Test guide for the owner (below) checked

## Test plan

Unit (`vitest`):
- `chronicle-book.test.ts`: same chapters, order and sentences as
  `buildChronicle` for the same runs and filters (join the deeds back and
  compare); `pre` / `name` / `post` split for all seven headers; the date
  split; `null` when nothing passes; deterministic.
- `chrome-frames.test.tsx` `About text`: `aboutSections` (nine sections,
  the key/value rows of What is inside and Credits, every link found), the
  section letters unique.
- New `credits-frame.test.tsx` (or inside `chronicle-book.test.ts`):
  the book's keys move spreads and chapters; the states.

E2E (`playwright`):
- `credits.spec.ts`: the demo backup → Credits shows the book with the
  epigraph and the first chapter; →, ←, ↓ (next chapter), a pill click,
  Home / End, P / N; no Opening pill and no Settings…; with every kind
  off in the settings (through `__wc.settings`) the filtered page and its
  Spotlights line; with no runs the no-data page; Esc / Back to the menu;
  the phone (one page, swipe by touch events, fits at 360).
- `about.spec.ts`: the small wordmark and `WebCockpit x.y.z (commit)`;
  the rail follows the scroll; a letter jumps (`C` to Credits); PgDn /
  End; the notices link points at `THIRD_PARTY_NOTICES.md` and the file is
  served (status 200); external links have `target=_blank`; the phone
  strip; Esc back.
- `chrome.spec.ts`: the Credits / About steps of the keyboard test.

## Performance notes

- **Pagination**: one column layout per size; measuring the chapter
  starts reads layout once (after the box has settled), never per frame.
  A chronicle of a few hundred deeds must paginate in < 30 ms on the Iris
  Xe.
- **Page turns**: `transform` and `opacity` only (≈ 170 ms out, 240 ms
  in), no layout; reduced motion: instant.
- **The drop cap**: `background-clip: text` with a static gradient, no
  animation, no filter other than one drop shadow.
- **About's scroll**: a long column in a native scroller; the scroll spy
  is a passive listener reading cached section offsets (measured on
  resize), not `offsetTop` of every section on every event. If the mask
  fade at the top of the scroller costs frames in Firefox, drop it.
- Both pages sit over the sky like every big page; stage 42's rule
  (ADR 0127): the sky at its calm rate behind a large box, the large
  window's blur kept or dropped by its measurement, no `backdrop-filter`
  on the book's pages or the leaf's column.

## Test guide for the owner

Branch of the broad pass (the main session gives the name), `npm run dev`,
open http://localhost:5173/. For a full chronicle restore the demo runs
(History → Restore → `tests/fixtures/runs-demo.jsonl.gz`) or use your own.

1. **Credits** (C). The menu grows into the big box with an open book. The
   first page starts with the old opening line, then the first
   character's chapter: a title page, a drop cap in the wordmark's
   mithril, the deeds with their dates in small caps.
2. **Turn the pages**: → / ← (or PgDn / PgUp, Space), the Previous and
   Next buttons, P / N. ↓ / ↑ jump between chapters; the pills at the
   top show where you are and jump on a click. No Opening pill, no
   Settings button, no rolling, and it does not leave by itself.
3. **Filter**: on the Spotlights page turn a kind or character off and
   open Credits again: the chronicle follows. With nothing left it says
   so and points to the Spotlights filter.
4. **About** (A). One long leaf in the big box: the small wordmark and the
   version at the top, then the text, the "M" seal at the end. The rail
   on the left follows your reading; click a row or press its letter (W M
   B G I S U C L) to jump. ↑↓, PgUp / PgDn, Space, Home / End scroll.
5. **Third-party notices**: the link at the end of Licence opens the full
   notices.
6. **Phone** (or a narrow window): Credits shows one page at a time, swipe
   to turn; About's rail becomes a row of pills over the text.

Feedback wanted: the book (type, page size, the epigraph instead of an
Opening page, no automatic return), the leaf (column width, the rail,
the small wordmark), and the notices as a link.

## Open questions for the owner (after testing)

The build follows the default until the owner answers.

1. With no Settings… in Credits, the filter is set on the Spotlights page
   only. Should Credits instead ignore the filter and always tell
   everything? *Default: Credits follows the Spotlights filter (ADR 0110,
   as today).*

## Uses from stage 42

The canonical names are in `docs/stages/42-look-pages-base.md` ("API" and
"Canonical names") and ADR 0127. Stage 42's files are read-only in wave 2.

1. `Box size="large"` in layout B (grows out of the menu panel and back)
   with `useBoxSettled()`, so the book paginates after the growth, not
   during it (the page is laid out at its final size from its first frame).
2. `BoxHead`, `BoxBody` (a native scroller with `.wc-lk-scroll`, `bodyRef`
   for keys and the scroll spy), `BoxFoot`.
3. `Seg kind="pills"` (single select, sideways scroll keeping the chosen
   one in view, click to jump; `aria-checked`).
4. `GlassButton` with `iconAfter` (Next ›).
5. The rows classes as a rail (`.wc-lk-rows > .wc-lk-row`, `.is-on`
   brightens).
6. Text helpers and tokens: `OrnRule` (a thin rule with an open diamond),
   `.wc-lk-kv`, `.wc-lk-empty`, the link style in `.wc-look`,
   `--lk-display` (Cinzel), `--lk-serif` (Cormorant), `--lk-sc`
   (Cormorant SC).
7. The mithril inlay tokens `--lk-inlay-*` (one source with the wordmark)
   for the drop cap's metal gradient.
8. `LookWordmark size="small"` inside page content (follows the sky's
   light, draws only while visible).
9. `Seal` (the "M" mark) for About's colophon.
