# 0149 — The start menu's structure: three zones, the owner row

- Status: Accepted (owner, 2026-11-14, in the session on the start
  menu, the account and the community). Not built; stage 67, mockups
  first.
- Date: 2026-11-14
- Related: intent Goals 13 and 15, spec §2.5, §7.2, §7.4, §7.8,
  ADR 0114 (the menu of stage 32), ADR 0124–0126 (the start page),
  ADR 0130–0132 (History, Spotlights, Credits), ADR 0145, 0146, 0148,
  `notes/start-menu-brainstorm.md`, `notes/start-menu-decisions.md`.

## Context

With stage 60 the start menu had eight rows of equal weight: Enter
MUME, Profile, Scripts, History, Spotlights, Account, Credits, About.
The owner, after a first look on staging: too many equal rows; it
does not show what differs a profile from an account, whether one is
logged in, or whose profiles and scripts one is looking at; and the
community must be reachable from the menu.

## Decision

```
  GUEST                             LOGGED IN

  ⌂  ENTER MUME                     ⌂  ENTER MUME
  ────────◆────────                 ────────◆────────
  On this device · log in           ole · synced
  Profile    (default)              Profile    (warrior)
  Scripts                           Scripts
  History                           History
  ────────◆────────                 ────────◆────────
  ✦ COMMUNITY   3 new               ✦ COMMUNITY   3 new
       about                             about
```

(A sketch of the order, not of the look: the mockups of stage 67
decide the look.)

1. **Three zones and a foot row,** the same form logged in and logged
   out: *play* (Enter MUME), *mine* (the owner row, Profile, Scripts,
   History), *everybody's* (Community), and About as a quiet foot row.
2. **The owner row** replaces the Account row of stage 60. It is a
   heading over "mine" and a button. It says where the things live:
   "On this device · log in" for a guest, "<name> · synced" logged
   in. It carries the sync state in words (synced, syncing, offline,
   needs attention, a locked copy; ADR 0146's addendum) and a mark
   for new reactions to one's published runs. A press opens Log in
   for a guest and the Account page logged in, with no menu in
   between.
3. **Profile keeps its name** and shows the selected profile. The
   owner's first thought was Settings; that word is taken (the game's
   Settings popup, the phone's settings page, the synced settings),
   and a profile is more than settings. The worry behind it, that
   "profile" reads as a public user page beside account names, is
   answered from the other side: nothing in the community is ever
   called a profile.
4. **History is one row** with a tab strip over three pages that keep
   the looks the owner chose in stages 45–47: **Sessions** (the
   History page), **Spotlights**, **Diary**. H opens Sessions.
5. **Credits is renamed Diary** everywhere ("Credits" reads as
   "thanks to").
6. **Community** is the menu word for the public page (ADR 0148,
   addendum), with a count of new runs.
7. **Letters:** E, U (owner row), P, S, H, C (Community), A. L and
   the old C are free.
8. **Flags.** The owner row shows only with `accounts`, Community
   only with `gallery`. The menu therefore has three forms for a
   time, and each must look finished. The form itself is not an
   account feature: it goes to every player.
9. **Guests keep Spotlights and Diary,** built on the device's runs
   (the brainstorm had them as account-only; intent Goal 13 says a
   guest loses nothing).
10. **Phone:** the start menu has the same structure. The in-game
    menu sheet has no account row (owner, 2026-11-14, stage 60).

## Alternatives

- **Profile → Settings,** with the client's settings renamed
  (Options, Appearance): two wide renames in a finished product.
- **A new word** (Setup, Config, Kit): one wide rename, and the
  import pages would lose the word players of tt++, JMC and Mudlet
  know.
- **One new page for Sessions, Spotlights and Diary:** a redesign of
  three approved pages for no more than the tab strip gives.
- **Spotlights and Diary locked for guests** ("create an account to
  unlock"): against Goal 13, and every player of today would lose two
  pages at the release.
- **A small account menu** behind the owner row (Account, Published
  runs, Log out): the Account page already is that list.
- **Keeping the Spotlights and Credits rows** until the tabs exist:
  avoided by building the menu and the tabs in one stage.

## Consequences

- A row that is a heading and a button is a new kind of row; the
  mockups must show that it can be pressed.
- The shortcut letters L (Spotlights) and C (Credits) stop working as
  they did; C now opens the Community.
- The built stage 60 changes in the Account row and its tests
  (`start-main.tsx`); the account pages stand.
- "· synced" is only true when sync exists, which is one reason the
  flag `accounts` stays off in production until stage 63 (ADR 0146,
  addendum).

## Addendum 2026-11-14 — what the mockups settled

The owner picked from the mockups of round 8
(`notes/research/start-menu-mockups/round8/`; the full answers are in
`docs/stages/67-start-menu.md`, Owner feedback).

- **The guest's words are "Guest · log in",** not "On this device ·
  log in" as in the sketch and in point 2 above (the owner's wording).
- **The zones** are parted by a thin rule with a diamond (direction
  A). Community is a row like the others; its counter is its only
  weight.
- **The owner row** is a heading line: a state mark in the left
  margin, the name in small capitals, the state in italic, a chevron
  at the right. Larger on a desktop than the mockup drew it. A long
  name gives way with an ellipsis; the state is never cut. The names
  allowed are up to 20 characters and the panel stays 360 px, so the
  full name is only promised on the Account page.
- **U is not shown.** The other rows mark their letter in the label;
  the owner row's texts hold no u, and a key cap beside the chevron
  was turned down. The key works.
- **About** is the panel's last, quiet row, not a line under it.
- **History's tab strip** is a row of its own under the hood, in
  Back's band (placement P1); the three pages' heads are untouched.
  **The keys are 1, 2 and 3.** The tabs' initials were not free (S
  and D are Save and Delete on Sessions), nor Tab and the arrows; `[`
  and `]` need AltGr on a Nordic keyboard.
- **The phone** has the same menu in portrait and landscape, and the
  strip as three equal tabs under Back.

## Addendum 2026-11-14 — History's tabs as built (stage 67, B1)

- **One frame, a box per tab.** `HistoryFrame` (`src/chrome/frames/history.tsx`)
  holds the active tab and renders that page; each page keeps its own
  large box (History capped at its width, the other two not), so a tab
  change swaps the box at once, without a morph, and the hood says
  History on all three. A page's state (cursor, filter zone, book page)
  is not kept across a tab change; the Spotlights tab reads its reel
  anew each time it is shown (as the old menu row did), so a session
  deleted on Sessions is gone there. Keeping three pages mounted was
  turned down: three live pages, the Spotlights player host among them,
  for a state nobody asked to keep.
- **How to open it.** `openHistory(nav, tab)` with `tab` one of
  `sessions` (the default; what H does), `spotlights`, `diary`; the
  start menu calls it too, so there is one way. The strip, its keys and `useHistoryTabs` live
  in `history-tabs.tsx`, a leaf the three pages share.
- **Keys.** Each page asks the tab keys itself, where its own state
  allows a change: not while a run log opens, the Spotlights viewer
  plays (the player owns the digits) or a select has the focus. A
  modifier makes a digit no tab key. Sessions' `?` lists `1 2 3`. A
  click or a tap on the strip passes the same gate: a page gives
  `useHistoryTabs` its `hold` (Sessions: a run log is opening), and the
  keys and the strip both change tab through it (review fix).
- **The old rows.** Until the new menu was in, the Spotlights and
  Credits rows of `start-main.tsx` opened History on those tabs through
  two-line shims; the rows went with B2 and the shims in B3.
- **Touch.** On a touch device (`html.wc-phone`) the tabs have no key
  caps and are 44 px high (ADR 0140's targets), also on a phone, where
  the row under Back costs 4 px more than the mockup's 40 px tabs.
- **The names keep `credits`.** The file names (`credits.tsx`,
  `credits.css`, `credits.spec.ts`, …), the symbols (`CreditsFrame`,
  `CREDITS_TEXT`, `CreditsState`) and the CSS prefix `wc-cred-` keep the
  old word; only what a player reads says Diary. Two texts keep the
  word Credits in its own sense, thanks to: About's section CREDITS
  (MMapper, the tilesets, Cockpit, MUME, the fonts) and the readability
  script's attribution.

## Addendum 2026-11-14 — as built (stage 67, part B2: the menu)

- **The model is pure** (`src/chrome/frames/start-menu-model.ts`):
  `startMenu({ owner, scripts, community })` gives the rows and rules
  in order with their letters, `ownerRow({ name, sync, locked, news })`
  what the owner row says (kind, name, state, news, mark, what a press
  opens). The start page passes only `name` (`AccountState.name`); the
  sync state (stage 61), the locked copy (stage 61) and the reactions
  (stage 65) have no source yet and are drawn by the kit gallery
  (`?kit=menu`) and the unit tests. Logged in before sync, the row says
  the name alone (kind `name`), never "synced".
- **The flag `gallery` does not exist in the client yet** (`FlagName`
  is `stats | accounts`; the flag, the page and the counter's source
  come in stage 65). The start page therefore never shows Community,
  and C does nothing. On the dev server `?community=<n>` shows the row
  with `<n>` new (for the e2e specs and the screenshots; a press says
  "Coming in a later stage."); a production build folds it away.
- **The second rule** is only drawn with Community: without it there is
  nothing to part, and About as the quiet last row ends the panel. Its
  4 px over it are `.wc-sm-sep ~ .wc-sm-sep` (the first rule keeps 2 px;
  a review found `.wc-sm-item + .wc-sm-sep` matched both).
- **The menu's messages** ("Logged out.", "Coming in a later stage.",
  errors) have a line of their own, 18 px between the last row and
  About, which they never cover: About stays readable and clickable
  while a message shows (review fix; at first the message sat at the
  panel's foot, over About).
- **The owner row** is `data-key="owner"` (stage 60's row was
  `account`). It spans from the rows' icon column to the panel's right
  edge with `contain: inline-size`, so its text never widens the rows'
  column and a long name never moves the rows. Sizes (the owner:
  larger than the mockup's 32 px): 38 px high against the rows' 42 on a
  desktop and a tablet, 36 against 38 on a phone; the name in the
  display caps at 13.5 px (12.5 on a phone), the state in the serif
  italic at 16.5 px (15.5). Under the cursor, besides the brighter text
  every row has: a lit hairline under the whole line and the chevron
  stepping 3 px forward (the owner asked for a clearer cursor; the
  other rows have their letter's underline for that, this row has no
  letter shown). The 20-letter name alone just fits (Firefox) or loses
  its last letter (Chromium); with a state it gives way as drawn.
- **The row comes in late** as stage 60's did. Only Enter MUME stands
  above it now, so a pointer resting anywhere on the rows below holds it
  back until the pointer moves (stage 60's row was low in the menu and
  seldom waited).
- **The panel's heights** in the first form (no owner row, no
  Community): 313 px on a desktop and a tablet (was 399), 295 px on a
  phone (was 357); first built as 301 and 283, then −2 px for the first
  rule's margin and +14 px for the message line (review fixes). `--wc-panel-h` (the first paint's loading panel and
  the tablet's centring) follows the first form; with accounts on, the
  panel grows by the owner row when it comes in, as in stage 60.
- **Spotlights and the Diary** have no menu row and no letter; they are
  reached through History's tabs (H, then 2 or 3).
