# Start menu mockups, round 8 (stage 67)

Throwaway mockups for the owner's choice (docs/stages/67-start-menu.md,
task A; spec §2.5; ADR 0149). Not app code: a simplified DOM in the real
classes, never meant to be copied into `src/`.

Open `index.html` (every state as a picture, linking into the files), or
`start-menu-round8.html` (everything in one self-contained file, for
publishing). In a file the first row of tabs chooses the topic (Menu,
Owner row, History), the second the direction (A, B, C; P1, P2), the
third the state, and Desktop / Phone / Landscape / Tablet the view (a
view a state has no picture of is greyed). On the menu the cursor follows
the mouse as in the app; History's row and the tabs lead where they say.

## Files

| File | Holds |
|---|---|
| `start-menu-round8.html` | Everything, one file (1.05 MB, no network) |
| `menu.html` | The menu: directions A, B, C; the three forms; the variants |
| `owner-row.html` | The owner row: a sheet of every state per direction, and each state in the menu |
| `history.html` | History with the tab strip: placements P1 and P2 |
| `index.html` | The review page over `shots/` |
| `shots/` | 112 pictures, `<state>.<view>.jpg` (below) |
| `build/` | How they are made (below) |

Shot names: `<topic>-<direction>-<state>.<view>.jpg`.

- topic `menu`, direction `a` `b` `c`, state `f1` (before accounts),
  `f2-guest`, `f2-name`, `f3` (community, "3 new"), `f3-guest`,
  `f3-nocount`, `f3-cur-owner`, `f3-cur-com`, `f3-com-strong`,
  `f3-about-under`, `f1-about-under`, `f3-long` (360 px), `f3-long-400`,
  `f3-name20`;
- topic `owner`, direction `a` `b` `c`, state `sheet` (the single states
  are live in `owner-row.html` only, not shot);
- topic `history`, direction `p1` `p2`, state `sessions`, `spotlights`,
  `diary`, `hover`;
- view `desktop` (1440 × 900), `phone` (390 × 844 at 1.5×), `landscape`
  (844 × 390 at 1.5×; `f3` of each direction), `tablet` (820 × 1180; P1's
  three tabs).

## How true the look is

`build/capture.mjs` takes, from a running dev server, the start page's
own DOM and the real History, Spotlights and Credits pages (desktop,
phone, phone landscape, tablet), the stylesheets as source, the `<html>`
element's theme properties and one still of the sky per view (a fixed
dusk, `skyHour=19.1 … skyFreeze`). The run library is seeded first
(`build/seed.mjs`: the e2e demo backup and eleven invented runs, the
clock pinned to 2026-09-28 as the e2e tests do). `build/build.mjs` puts
that, the five fonts and `build/mock.css` + `build/states.js` (the new
content, classes `mk-*`) into each file. So the panel, the rows, the
icons, the three pages, the kit's tabs and buttons are the real ones;
only the owner row, the Community row, the zones and the strip's place
are drawn here. The sky stands still, and nothing morphs between pages.

    npx vite --port 5394 --strictPort         # never 5173
    node notes/research/start-menu-mockups/round8/build/capture.mjs
    node notes/research/start-menu-mockups/round8/build/build.mjs
    node notes/research/start-menu-mockups/round8/build/shoot.mjs
    node notes/research/start-menu-mockups/round8/build/check.mjs   # what fits, the panel's heights

## 1. The menu: three directions

Common to all three. The rows keep today's type, icons and heights. The
Community row has the four-point star Spotlights leaves behind and its
counter in gold serif ("3 new"); the reactions mark on the owner row is
the same gold ("2 new"), so "new" reads the same in both places. About
has no icon and is small. The counter adds no width to the rows' column,
so the group does not shift when it comes and goes.

- **A · rule and diamond.** Today's rule with the diamond, twice: under
  Enter MUME and above Community. The owner row is a heading line, 32 px
  against the rows' 42: the name in the small display caps of the kit's
  section headings, the state after it in the serif italic of the
  Profile note. It hangs out to the left of its rows as a heading does:
  the name starts where the icons do and the state mark stands in the
  margin. At the right end a key cap `U` and a chevron (the chevron
  alone on a phone). Under the cursor it lights as any row.
- **B · space only.** No rules; 14 px of air between the zones. The
  owner row is a glass plate (the kit's small button) holding mark,
  name, state, key cap and chevron; Profile, Scripts and History hang
  from it on a fine bracket, indented 22 px. Under the cursor the plate
  lights as a chosen kit button (lit edge, halo).
- **C · a frame per zone.** Each zone is an inset (the kit's well).
  Enter MUME is a lit plate of the primary glass; "mine" is a box whose
  title bar is the owner row, the name left and the state, mark, key cap
  and chevron right; Community has a box of its own; About stands under
  them. Under the cursor the title bar lights.

The forms' heights on a desktop (today: 399 px with seven rows, 441 with
stage 60's Account row). The quote clears the almanac in every form.

| | form 1 | form 2 | form 3 | form 3, About under |
|---|---|---|---|---|
| A | 299 | 331 | 392 | 366 |
| B | 292 | 328 | 384 | 360 |
| C | 295 | 327 | 386 | 369 |

**What fits in 360 px** (`check.mjs`; the name gives way with an
ellipsis, the state and the news are never cut):

| text | A | B | C |
|---|---|---|---|
| On this device · log in | fits | fits | fits |
| This device only · log in | fits | fits | fits |
| Not logged in · kept on this device | cut ("Not logge…") | cut ("Not log…") | fits |
| ole · logged out here, and every other state of "ole" | fits | fits | fits |
| olevongertten · storage full · 2 new | cut ("olevonge…") | cut ("olevon…") | cut by one letter |
| olevongertten_arda20 · synced (20 letters, the longest allowed: `NAME_MAX_LENGTH`) | cut ("olevongertten_ar…") | cut ("olevongertten_a…") | cut by one letter |

At 400 px C fits everything; A and B gain only 20 px for the row (the
rows are a centred group, so half of the added width lands on its other
side) and still cut both long texts, showing two or three letters more.
On a phone the panel is 358 px whatever the setting; without the key
cap A and B show more of the name and C fits everything.

## 2. The owner row's states

`owner-<a|b|c>-sheet`: every state at the panel's true width, with the
Profile row under it on a desktop. The marks are the account mockups':
a steady green dot (synced), a breathing gold dot (syncing), a hollow
ring (offline), an amber diamond (needs attention); a small key for a
guest and a small lock for a locked copy; nothing for the name alone.
For a guest "log in" is underlined as the thing a press does.

## 3. History with the tab strip

The hood says History on all three tabs; the pages are the captured
ones, untouched (the hood's word Credits is the only text changed). The
tabs are the kit's own (`.wc-lk-tabs`: text, a lit underline under the
active one, the kit's hover colour).

- **P1 · above the page's head.** The strip is centred under the hood,
  in the band Back already stands in, with a fine rule under it across
  the box. It costs 15 to 19 px on a desktop, 30 on a tablet. On a phone
  it is a row of its own under Back, three equal tabs 113 px wide and
  40 high: 37 px. The tabs stand at the same place on all three pages
  although History's box is narrower than the other two.
- **P2 · in the page's head.** The tabs stand at the left end of the
  page's own head row. On Sessions and Diary that costs nothing. On
  Spotlights the filter row is already 1130 px of the 1324 there are at
  1440: with the tabs it wraps to two lines (46 px, more than P1 costs),
  and the filter is no longer one row. The tabs also jump sideways
  between the pages (History's box is capped at 1180 px, the others are
  not). On a phone the head rows are full, so the tabs go into Back's
  row at 10 px type, 35 to 68 px wide: no height, but small targets
  tight under the hood.

**Keys.** Taken on the three pages: ← → ↑ ↓, PgUp PgDn, Home End, Enter,
Space, Esc, `?`; Tab and Shift+Tab (History: rows ↔ buttons; Spotlights:
into the filter row); the letters R T A S X D B O (History), P F
(Spotlights), N P (Diary). So the tabs' own initials do not work: S is
Save and D is Delete on Sessions. **Free on all three: the digits, `[`
`]`, and the letters L and Y.** `[` `]` need AltGr on a Nordic keyboard.
The mockups show `1 2 3` as small key caps in the tabs (none on a
phone).

## Recommendation for the seven picks

1. **The zones' look: A, with Community quiet.** A is today's menu with
   one more rule: nothing new to learn, the lightest of the three, and
   form 1 (what every player gets first) is plainly today's menu minus
   two rows. Community does not need more weight than a row: it has a
   zone to itself and the only gold on the panel when there is news. The
   stronger variant competes with Enter MUME, and its badge is the one
   element on the page that looks like an app. B's indent makes the rows
   jump 22 px sideways when the flag arrives, and its plate reads as a
   button but less as a heading. C says "whose" most clearly and has the
   most room for text, but it turns an airy menu into three boxes in a
   box; it is the choice if long names in full matter more than the
   look.
2. **The owner row: A's heading line** (small caps name, italic state,
   the mark in the margin, key cap and chevron at the right end), with
   the rule that the name gives way and the state never does.
3. **The words: "On this device · log in",** as decided. It fits every
   direction with room, says where the things are and what a press does.
   "This device only" adds a warning tone for one more word; "Not logged
   in · kept on this device" is cut in A and B and names no action.
4. **The foot row: About inside the panel,** as its last quiet row.
   Under the panel it stands on the sky, where its contrast changes with
   the hour (weak over a bright dusk), it pushes the quote down, and it
   becomes the one menu row outside the box the cursor moves in.
5. **The tab strip: P1,** centred under the hood, keys `1 2 3`. It
   leaves all three heads untouched, stands still between the pages and
   costs under 20 px on a desktop; P2 costs nothing on two pages and
   more than P1 on the third.
6. **The phone:** the same structure in portrait (A's form 3 is 372 px
   high, the quote and almanac as today); in landscape form 3 fills the
   390 px exactly with no scroll in all three directions (no wordmark
   there, as today). The tabs as P1's row of three equal tabs under
   Back.
7. **The size: 360 px, in its place.** Form 3 in A is 392 px high
   against today's 399, so the panel, the quote and the almanac stand
   where they do now. 400 px buys 20 px for the owner row and does not
   save either long text.

## What did not fit well

- **The letter U cannot be marked in the label.** Neither "On this
  device · log in" nor "ole · synced" holds a u, and the label changes
  with the state. The mockups show a small key cap `U` at the row's
  right end on a desktop, which also serves as the press cue. It is the
  one key cap on a page whose rule is letters in the labels.
- **Long names** are cut in A and B (table above). Names of 14 letters
  or more with a state and a news mark will show an ellipsis.
- **The three pages' boxes differ in width** (History is capped at
  1180 px). With tabs the box changes width between Sessions and the
  other two; the mockups show it as it is. P1 hides it best.
- **P2 on Spotlights** cannot be drawn without either wrapping the
  filter row or redesigning it; the mockup shows the wrap.
- **The book under P1** is drawn with the pagination of the taller
  page: on the phone's Diary shot the first page's last line is cut
  mid-sentence. The real book lays itself out again for its height.
- **Spotlights has five cards.** Only the demo backup's runs hold log
  text; the eleven invented runs have events only and make no
  spotlights. They do fill Sessions and the Diary.
- **The owner row's single states, the cursor and hover** are stills:
  the breathing dot breathes, nothing else moves; the row coming in when
  the flag arrives (stage 60's rule) is not shown.
- **About under the panel** has no cursor state drawn, and is weak over
  the bright part of this sky.
- **Not drawn:** the hood itself as the strip (the three names in the
  iron plate). It costs no height on a desktop, but on a phone it would
  run into Back.
