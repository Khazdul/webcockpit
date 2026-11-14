# Stage 67 — The start menu and History with tabs

Status: **Next.** Planned 2026-11-14; nothing built. Starts with
mockups; no code before the owner has picked.

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
  guest sees "On this device · log in" and gets Log in; logged in it
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

- [ ] `notes/research/start-menu-mockups/round8/` in the manner of
      the account mockups (`notes/research/account-mockups/README.md`:
      the real DOM and styles captured from a running dev server, the
      new content in classes of its own, every state as a picture,
      one self-contained file for publishing).
- [ ] The menu: two or three directions for the zones and the owner
      row; each in its three forms (before accounts; with accounts;
      with the community and its counter) and every owner row state
      of point 2 above; desktop and phone.
- [ ] History with the tab strip: Sessions, Spotlights and Diary,
      each as it is today under the strip; two placements of the
      strip; desktop and phone.
- [ ] A review page over the pictures; published for the owner as an
      artifact.
- [ ] **The owner picks** (the seven points above); the choice is
      written under "Owner feedback" and, where it settles something
      ADR 0149 left to the mockups, as an addendum there.

### B. Build (after the choice; agents in worktrees, own ports)

- [ ] The menu's model and view (`src/chrome/frames/start-main.tsx`):
      zones, the foot row, the owner row in place of the Account row
      (flag `accounts`), the letters. The row comes in as stage 60's
      did (no jump under a resting pointer).
- [ ] The owner row's states as a pure function of the account state
      (`src/cloud/account/state.ts`); the states that need sync
      (synced, syncing, offline, needs attention, locked, reactions)
      are drawn in the kit gallery and by tests but have no source
      until stages 61 and 65.
- [ ] History's frame with the tab strip; Spotlights and Diary moved
      under it (their frames as they are); Back from the Spotlights
      viewer and the run log player returns to the tab it left.
- [ ] Credits → Diary in every text: the page, About, both manuals,
      help texts, tests. (File and symbol names may keep `credits`;
      an ADR addendum says so if they do.)
- [ ] The phone's start menu and the tab strip on a phone and a
      tablet.
- [ ] Tests: unit for the menu model in every flag combination and
      for the owner row's states; e2e for the keys (E U P S H A, that
      L and C do nothing), the tabs by key, mouse and touch, the
      phone; the existing History, Spotlights, Credits and account
      specs moved to the new paths.
- [ ] Spec §2.5 "Look": the letters line; the inventory reference if
      it names the rows.

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

(none yet)
