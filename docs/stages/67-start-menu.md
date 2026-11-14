# Stage 67 — The start menu and History with tabs

Status: **In progress.** Part A done 2026-11-14: the mockups of round
8 and the owner's seven picks (Owner feedback below; ADR 0149,
addendum). Part B is laid out as agent tasks and **waits for the
owner's word** before it starts.

Done before stage 61 though it has a higher number (spec §7.12: the
order is 67, 61, 62, 63, then accounts open, then 64–66).

## Goal

The start menu shows what is whose. Three zones and a foot row in
place of eight equal rows: play (Enter MUME); mine (the owner row,
Profile, Scripts, History); everybody's (Community, from stage 65);
About as a quiet foot row. History becomes one row with the tabs
Sessions, Spotlights and Diary. (Spec §2.5, ADR 0149; the owner's
brainstorm is `notes/start-menu-brainstorm.md`, the decisions
`notes/start-menu-decisions.md` points 7–9.)

## What must be true afterwards

- The menu has one form for everybody, logged in or not. With the
  flag `accounts` off (production) there is no owner row; with
  `gallery` off there is no Community zone. Each of the three forms
  looks finished.
- The owner row replaces the row `ACCOUNT (log in)` of stage 60: a
  guest sees "Guest · log in" (owner, 2026-11-14; first "On this
  device · log in") and gets Log in; logged in it
  shows the account name and opens the Account page. Until stage 61
  nothing syncs, so on staging the row says the name and **not**
  "synced".
- Profile shows the selected profile's name, as today.
- History opens on Sessions (today's History page, unchanged).
  Spotlights and Diary are tabs beside it, each page in the look it
  has (ADR 0130–0132). Nothing a guest has today is lost (intent Goal
  13): every page works logged out, on the device's runs.
- The word Credits is gone from the client: the tab, the page's
  heading, About, the manuals and help texts say Diary.
- Letters: E, U, P, S, H, A (and C reserved for Community). L and the
  old C do nothing on the menu.
- The phone's start menu has the same structure; the phone's in-game
  menu sheet is unchanged.
- Spec §7.0 holds: the game path is untouched, the benchmark of §1.3
  does not move, the entry chunk does not grow by more than the menu
  needs (30 201 bytes today).
- The start page's first paint and the morph into the big box (ADR
  0126, layout B) work as today with the new rows.

## Decided already (owner, 2026-11-14)

- The structure, the owner row and what a press does, the letters,
  the flags, the phone (ADR 0149).
- Profile keeps its name. Credits becomes Diary.
- Tabs over the three existing pages, no redesign of them. H always
  opens Sessions.
- The menu and the tabs are built in one stage, after one mockup
  round that covers both.
- The form goes to every player with this stage's release, and the
  enforced CSP goes to production with it (`production: true` in
  `scripts/csp.ts`), after the owner has played on staging (stage 60's
  test guide, step 13).

## For the owner to pick from the mockups

(Picked 2026-11-14; the answers are under Owner feedback.)

1. **The zones' look:** how the three zones are parted (the rule with
   the diamond of the sketch, space only, or a frame per zone), and
   how much Community stands out against Enter MUME.
2. **The owner row:** how a row that is a heading *and* a button
   looks, so that it reads as "this is whose" and still as something
   to press. Every state drawn: guest; name only (staging before
   sync); synced; syncing; offline; needs attention ("storage full");
   a locked copy exists ("ole · logged out here"); with a reactions
   mark ("· 2 new").
3. **The words on the owner row** for a guest: "On this device · log
   in" or another wording.
4. **The foot row:** About small under the panel, or inside it.
5. **History's tab strip:** where it sits in the big box (above the
   page's own head, or in it), how the three pages' different heads
   (History's table head, the Spotlights filter row, the book) meet
   it, and the keys that change tab.
6. **The phone:** the menu in portrait and landscape; the tab strip
   on a narrow screen.
7. **The menu's size:** the panel is 360 px wide today and one row
   lower than with eight rows; whether it keeps its place.

## Tasks

### A. Mockups (one agent; the owner picks)

- [x] `notes/research/start-menu-mockups/round8/` in the manner of
      the account mockups (`notes/research/account-mockups/README.md`:
      the real DOM and styles captured from a running dev server, the
      new content in classes of its own, every state as a picture,
      one self-contained file for publishing).
- [x] The menu: two or three directions for the zones and the owner
      row; each in its three forms (before accounts; with accounts;
      with the community and its counter) and every owner row state
      of point 2 above; desktop and phone.
- [x] History with the tab strip: Sessions, Spotlights and Diary,
      each as it is today under the strip; two placements of the
      strip; desktop and phone.
- [x] A review page over the pictures; published for the owner as an
      artifact.
- [x] **The owner picks** (the seven points above); the choice is
      written under "Owner feedback" and, where it settles something
      ADR 0149 left to the mockups, as an addendum there.

### B. Build (agents in worktrees; **not started, waits for the owner's word**)

What is built is the owner's picks (Owner feedback below) on the
mockups of `notes/research/start-menu-mockups/round8/` (direction A,
placement P1). The mockups are pictures to build towards, never code
to copy.

Rules for every agent (CLAUDE.md, "Tests and worktrees"): a worktree
branched from `main` by name; `node_modules` linked from the main
checkout and never `git add`ed; an own dev server port by
`WC_E2E_PORT`, never 5173; only the agent's own spec files run in the
worktree, the full e2e is run once, alone, in part C; nothing is
deployed and nothing touches staging or production.

Two agents side by side, merged in the order B1, B2, then B3 on
`main`:

#### B1. History with tabs and the word Diary (worktree `stage67-tabs`, port 5411)

Owns the History, Spotlights and Credits frames, their texts and
their specs. Does not touch `src/chrome/frames/start-main.tsx` (the
old Spotlights and Credits rows stay until B2 is merged, and then
open the new tabs).

- [x] History's frame with the tab strip in placement P1: a row of
      its own under the hood, in Back's band, a rule under it; the
      three pages' own heads untouched. The active tab marked more
      clearly than in the mockups (owner told so).
- [x] Spotlights and Diary moved under it (their frames as they are);
      H opens Sessions; Back from the Spotlights viewer and the run
      log player returns to the tab it left.
- [x] Keys `1 2 3` change tab, shown as small digits in the tabs on a
      desktop; the mouse and touch; no digits on a phone.
- [x] The strip on a phone (three equal tabs in a row under Back) and
      on a tablet. The Diary book lays itself out for the lower
      height.
- [x] Credits → Diary in every text: the page, About, both manuals,
      help texts, tests. (File and symbol names may keep `credits`;
      an ADR 0149 addendum says so if they do.)
- [x] Tests: e2e for the tabs by key, mouse and touch, desktop and
      phone; the existing History, Spotlights and Credits specs moved
      to the new paths.
- B1 done 2026-11-14 on branch `stage67-tabs` (ADR 0149, addendum
  "History's tabs as built"). For B2: H stays `nav.push(<HistoryFrame />)`;
  `openHistory(nav, tab)` opens another tab. The old Spotlights and
  Credits rows open History on those tabs through the shims
  `startSpotlights` and `CreditsFrame`, which go with the rows. The
  menu's own texts (the rows, README's letters line, `chrome.spec.ts`'s
  row lists) still say Credits until B2. The Diary's demo e2e runs at
  1440 × 960: at 900 the strip's 18 px send `The End.` to a third page.

#### B2. The menu (worktree `stage67-menu`, port 5412)

Owns `src/chrome/frames/start-main.tsx`, the menu's model, the owner
row and their specs. Reaches History's tabs only through what B1
exposes (H opens Sessions).

- [ ] The menu's model and view: three zones parted by the rule with
      the diamond, About as the last quiet row in the panel, the
      panel 360 px wide in its place. Three forms by the flags
      (`accounts`, `gallery`), each finished. The Spotlights, Credits
      and Account rows go. Community quiet: a row like the others,
      the counter in gold italic (the row and the counter are drawn
      for the kit gallery and tests; no source until stage 65).
- [ ] The owner row in place of the Account row (flag `accounts`):
      direction A's heading line (mark in the left margin, the name
      in small capitals, the state in italic, a chevron at the right),
      **larger on a desktop than in the mockups** and with a clearer
      cursor; no visible U; the name gives way with an ellipsis, the
      state never. Guest: "Guest · log in". The row comes in as stage
      60's did (no jump under a resting pointer).
- [ ] The owner row's states as a pure function of the account state
      (`src/cloud/account/state.ts`): guest, name only, synced,
      syncing, offline, needs attention, a locked copy, the reactions
      mark. Those that need sync are drawn in the kit gallery and by
      tests but have no source until stages 61 and 65.
- [ ] The letters: E, U, P, S, H, A (C reserved for Community, live
      only with `gallery`). L and the old C do nothing.
- [ ] The phone's start menu, portrait and landscape, the same
      structure. The in-game menu sheet unchanged.
- [ ] The first paint and the morph into the big box (ADR 0126) with
      the new rows; the entry chunk's size noted (30 201 bytes
      today).
- [ ] Tests: unit for the menu model in every flag combination and
      for the owner row's states; e2e for the keys and the phone; the
      account specs that used the Account row moved to the owner row.

#### B3. After both are merged (main session)

- [ ] A review of the merged diff (`/code-review`), findings fixed.
- [ ] Spec §2.5 "Look": the letters line; the inventory reference if
      it names the rows.
- [ ] The test guide below completed.

### C. Check and release

- [ ] Full e2e alone at 5 workers; the benchmark; the entry chunk's
      size.
- [ ] Staging: `test:prod`; the menu with the flag on (staging) and
      off (a local production build).
- [ ] Owner test on staging (test guide below), with stage 60's step
      13 if not done.
- [ ] Release to everybody: the new menu, `production: true` in
      `scripts/csp.ts`. The flag `accounts` stays off.

## Test guide (owner; to be completed when the stage is built)

On <https://staging.mumecockpit.com> (the owner row shows there) and,
after the release, on the live site (no owner row).

1. The start page: do the zones read at a glance? Is it clear that the
   owner row is whose things these are, and that it can be pressed?
2. E, U, P, S, H, A by key; the arrows; the mouse. L and C do nothing.
3. U as a guest: Log in. Log in: the row shows the name; U opens the
   Account page. Log out: the row is back.
4. H: Sessions as History was. Change to Spotlights and to Diary by
   key and by mouse; play a spotlight and come Back to the same tab.
5. The phone and the tablet: the menu, the tabs, portrait and
   landscape.
6. Live after the release: the same without the owner row; the page
   loads and plays as before (the CSP is enforced now).

**Feedback wanted:** the zones' weight, the owner row's wording, the
tab strip's place, anything that was a habit and is now a step longer
(L and C).

## Owner feedback

### 2026-11-14 — the picks from the mockups of round 8

Mockups: `notes/research/start-menu-mockups/round8/` (README,
`index.html` over 112 shots), published as
<https://claude.ai/artifact/7GZV9w5UpC5xQBqsK5XkG8>.

1. **The zones:** direction **A**, the rule with the diamond.
   Community **quiet**: a row like the others, the counter in gold
   italic is its only weight.
2. **The owner row:** A's heading line, **made larger on a desktop**
   than drawn (about as on the phone picture, against the other rows)
   and with a clearer cursor; the owner sees it on staging. **No
   visible U** (the row's texts hold no u; the key works unseen).
3. **The words for a guest:** **"Guest · log in"** (the owner's own
   wording; not "On this device").
4. **The foot row:** About **inside the panel**, last and quiet.
5. **The tab strip:** placement **P1**, a row of its own under the
   hood. Keys **1 2 3**, shown as small digits in the tabs on a
   desktop. Told to the owner: the active tab is marked more clearly
   in the build than in the pictures.
6. **The phone:** as drawn: the same structure in portrait and
   landscape; three equal tabs under Back, no digits.
7. **The size:** the panel **keeps 360 px and its place**. A long
   name gets an ellipsis on the owner row; the state is never cut.

Said to the owner about the pictures: Spotlights has only five cards;
the Diary on the phone is not laid out again for the lower height.
