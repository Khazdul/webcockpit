# Stage 61 — Sync of profiles and scripts, on the two spaces

Status: **In progress.** Part A done (mockups, owner's picks 2026-11-14); part B waits for the owner's word.

Done after stage 67 (spec §7.12: the order is 67, 61, 62, 63, then
accounts open in production, then 64–66). On staging only: the flag
`accounts` stays off in production until stage 63 is done, and the
new flag `sync` goes on on staging only.

## Goal

An account holds the player's profiles and scripts, and a device
shows either its own things or the account's, never a mixture (intent
Goal 13; spec §7.0 rule 7, §7.2, §7.4; ADR 0146 and its addendum; ADR
0145 addendum; ADR 0150; `notes/start-menu-decisions.md` points 1–5).

## What must be true afterwards

- **Two spaces.** Logged out, every page reads the device's database
  `webcockpit`, untouched by account code. Logged in, every page reads
  the account's database `webcockpit-u-<name>`. The imported map,
  tilesets and the locator's ids are the device's whoever is logged in
  (ADR 0150).
- **Create account moves** the device's own profiles and scripts into
  the new account, without a question: each is removed from the device
  only when the server has taken it, so an interrupted move goes on
  later and loses nothing. Untouched seeds (`default`, `khazdul`) and
  bundled scripts stay. A line afterwards says what moved. The device's
  space is then back at its starting set.
- **Log in** (and Recovery) moves nothing and asks nothing: the
  account's profiles and scripts are fetched into the account's space;
  settings there start as a copy of the device's (stage 62 syncs
  them).
- **Sync** keeps profiles and scripts equal on every device of an
  account: edits, renames (the id is kept), deletes, offline periods.
  The same item changed on two devices keeps both, the other copy
  named `<name> (from <device>, <date>)`, with a notice. An edit beats
  a delete. During play nothing pulled is applied to the profile or
  scripts in use; it waits for the start page. No sync call is ever
  awaited on the game path (§7.0 rule 1).
- **Log out** syncs first, then always removes the account's copy (the
  dialog in its first form: everything in the account, or a list of
  what is not, with Stay logged in, Download, Log out anyway; refused
  while a game runs in another tab). Afterwards the start menu shows
  the device's things and "Logged out. Everything is in your account
  <name>."
- **A lost session** (password changed, recovered, ended elsewhere,
  180 days, account deleted; the server says which): a game in
  progress plays on; on the start menu the copy is removed, or kept
  **locked** when something in it is not in the account, with a
  notice offering Log in and Remove. A login to the same account
  unlocks and syncs.
- **Delete account** on a device hands the account's profiles and
  scripts back to that device's space (a name on both sides keeps
  both).
- **The owner row** shows the sync's state from a real source: synced,
  syncing, offline, needs attention, and a locked copy.
- The Account page shows the sync's state and "Sync now".
- §7.0 holds: the game path is untouched, the §1.3 benchmarks do not
  move, the entry chunk grows only by what the start page must know
  (the space and the owner row's state; 30 201 bytes after stage 67).
- Guests notice nothing: with the flag `accounts` off the client is
  the client of 0.11.0, apart from the device database's version 9.

## Not in this stage

- Settings, script data, Comm history and timers as items, and the Log
  out dialog in full: stage 62. Runs in the cloud and the runs' rows
  in the Log out dialog: stage 63. Until then (staging only) runs,
  Comm and timers played while logged in stay in the account's space
  and go at log out; the dialog lists the runs (ADR 0150,
  Consequences).
- Accounts in production.

## Decided already

- Everything in spec §7.4 and the ADR 0146 addendum: the two spaces,
  the move only at Create account, a login moves nothing, log out
  always removes, the lost session and the locked copy, Delete account
  hands back, keep both between two devices of one account.
- Technical (ADR 0150, this session): a database per space; one
  schema; a change of space reloads the page to the start menu with
  its message; Web Locks for "a game in another tab"; `wc.space` in
  `localStorage`.
- Technical (ADR 0151, written in part B3): the items, hashes, device
  label and the engine's steps as built.

## For the owner to decide (from the mockups of part A)

1. **After Create account:** where and how the line about what moved
   is shown (and the move while it runs, and a move that waits for the
   network).
2. **The locked copy:** the notice on the start menu with Log in and
   Remove, and Remove's question.
3. **The start menu's messages:** "Logged out. Everything is in your
   account <name>.", "You were logged out of <name> on this device.",
   "The account <name> was deleted."
4. **The Log out dialog, first form:** all in the account; something
   not in it; refused because of another tab.
5. **Keep both:** the notice when a profile or script was changed on
   two devices.
6. **Delete account:** the new "What happens" text and the line
   afterwards.
7. **The Account page's sync section:** the state and "Sync now".

## Tasks

Rules for every building agent (CLAUDE.md, "Tests and worktrees"): a
worktree branched from `main` by name; `node_modules` linked from the
main checkout and never `git add`ed; its own dev server port by
`WC_E2E_PORT`, never 5173; only its own spec files in the worktree;
the full e2e runs once, alone, in part D; nothing is deployed, nothing
touches staging or production.

### A. Mockups (one agent; the owner picks)

- [x] `notes/research/start-menu-mockups/round9/` in the manner of
      round 8 (its README: the real DOM and styles captured from a dev
      server on its own port, never 5173; the new content in classes
      of its own; every state as a picture; a review page; one
      self-contained file published as an artifact).
- [x] The seven points above, desktop and phone, two or three ways
      where the place is open (points 1–3, 5), one where only the
      wording is (4, 6, 7).
- [x] The owner picks; the picks go under "Owner feedback" and, where
      they settle wording, into spec §7.4.

### B. Foundations (three agents in worktrees side by side; **waits for the owner's word**)

#### B1. The spaces (worktree `stage61-spaces`, port 5421)

- [x] `src/core/space.ts` (current space, `openDeviceDb`, the reload
      with a message, the per-space `localStorage` helper) and
      `openWebcockpitDb` opening the current space (ADR 0150).
- [x] Database version 9: profile `id` (filled at the upgrade, kept on
      rename: rename in the profile store stops being delete + create),
      stores `sync` and `syncMeta`. Upgrade tests from version 8.
- [x] The map, tilesets and locator ids always from `webcockpit`.
- [x] The automatic MUME login per space.
- [x] The game's Web Lock `webcockpit-game@<space>`; other tabs follow
      `wc.space`.
- [x] A unit test that nothing in `src/` but `src/core/db.ts` opens
      IndexedDB, and e2e: a page in an account's space sees none of
      the device's profiles and scripts, and back.

#### B2. The Worker (worktree `stage61-worker`, port 5422)

- [x] Migration `0003`: `item` (spec §7.11) and what is needed to say
      why a session ended (kept at least as long as a session lives).
- [x] `GET /api/u/sync/changes?since=`, `PUT` and `DELETE
      /api/u/sync/items/<kind>/<id>` with `If-Match`, `409` with the
      current item, tombstones; kinds `profile` and `script` accepted
      (the others refused until their stage); limits 1 MB per item,
      2 MB of small items, 2 000 items; usage in the answer.
- [x] A request on an ended session answers `401
      {error:"session_ended", reason}` with `password`, `recovered`,
      `ended`, `expired` or `deleted`.
- [x] Delete account removes the items. The flag `sync` (off by
      default; on in staging's `wrangler.jsonc`).
- [x] Worker tests for every path; shared types in `shared/cloud/`.

#### B3. The engine (worktree `stage61-engine`, port 5423)

- [x] `src/cloud/sync/`: pure engine steps 2–7 of spec §7.4 against
      two ports (local items, remote API), the encryption of item
      bodies with `src/cloud/crypto` (blob format, opaque ids), keep
      both and last writer per ADR 0146, an edit beats a delete.
- [x] An in-memory server model; generated sequences of edits,
      renames, deletes, offline periods on two and three devices:
      after everybody has synced, all are equal and no edit is lost.
- [x] ADR 0151: the items' bodies, the hash, the device label, the
      keep-both name, the back-off.

### C. The flows (one agent, after B is merged; worktree `stage61-flows`, port 5424)

- [x] The local ports on IndexedDB for profiles and scripts; the
      triggers (login, load, start page, tab visible, 5 s after a
      change, every 5 minutes on the start page); the Web Lock
      `webcockpit-sync`; nothing applied in use during play.
- [x] Create account: the move, interrupted and resumed; the line
      (owner's pick).
- [x] Log in and Recovery: the account's space made and filled.
- [x] Log out: sync, the dialog's first form, the database deleted,
      the message.
- [x] A lost session: remove or lock; the notice, Log in and Remove.
- [x] Delete account: the hand-back; the new text.
- [x] The owner row's state and the Account page's sync section;
      the keep-both notice.

  As built (branch `stage61-flows`, ADR 0150 and 0151 "As built
  (stage 61 C)"): `src/cloud/space/` (ports, runtime, move, flows,
  words), `src/cloud/sync-view.ts`, the account pages' `sync-ui.tsx` and
  the new Log out and Delete dialogs. The Worker answers a missing item
  with `409` and a tombstone of rev 0 (ADR 0146 as built C). The spaces
  follow the flag `sync`. Tests: `tests/unit/cloud-space.test.ts`;
  e2e `tests/e2e/sync-flows.spec.ts` (the fake account API, two
  contexts, Chromium and Firefox) and `npm run test:sync-worker` (two
  contexts against a real local Worker and D1, ports 5424/8794,
  `playwright.sync-worker.config.ts`; part D's two-context check is this
  spec, to be run again there).

### D. Checks and staging

- [x] Two-context e2e: Create account with things, see them on a
      second context; edit on one, find it on the other; a conflict
      keeps both; log out and the device's things back; two accounts
      in turn; a lost session with and without unsynced changes;
      delete account.
- [x] A review of the engine and of the spaces by a second agent with
      only the code and ADR 0146, 0150, 0151; `/code-review` of the
      whole stage; fixes.
- [x] Unit; the full e2e alone at 5 workers; the benchmark; the entry
      chunk.

Checks (2026-11-15): unit 4783 passed; full e2e at 5 workers alone
1614 passed, 1 failed under load (`gmcp-demo` in Firefox, passes
alone), 1 skipped; `npm run test:sync-worker` (two contexts against a
local Worker) green in the fix branch; the benchmark exits clean (key
→ send 0.8 / 2.0 / 2.8 ms playing); the entry chunk 30 201 → 30 876
bytes (+675: the space, the owner row's source, the bundler's chunk
wiring). Reviews: a second agent (seven confirmed findings) and
`/code-review` high (ten); fifteen fixes with tests (merge 27a797f5).
- [ ] Staging: `deploy.yml` to staging, the flag `sync` on there,
      `test:prod` against staging. Nothing released.
- [ ] Owner test with two devices on staging (test guide below).

## Test guide (owner)

On staging (<https://staging.mumecockpit.com>), with a desktop and a
phone (or two browsers).

1. **As a guest** on the desktop, make or change a profile and a
   script so the device has things of its own.
2. **Create a new account** there. Read the line about what moved.
   Open Profile and Scripts: your things are there. Log out: the
   device is back at its starting set (the seeds only).
3. **Log in on the phone** with the new account: the same profiles
   and scripts. The phone's own things are not there; log out and
   they are.
4. **Edit on one, find it on the other:** change a profile on the
   desktop, open the start menu on the phone (or reload): it has the
   change. Rename a script on the phone, see it renamed on the
   desktop.
5. **A conflict:** take the phone offline, change the same profile on
   both, bring the phone back: both versions are kept, one named
   "(from …)", and a notice says so.
6. **Log out with something unsynced:** go offline, change something,
   log out: the dialog lists it. Try "Stay logged in".
7. **A lost session:** change the password on the desktop while the
   phone has an unsynced change: the phone shows the locked notice.
   Log in again on the phone: the change is there.
8. **The owner row** while it syncs, synced and offline.

**Feedback wanted:** the wording of the line after Create account, the
notices and the Log out dialog; whether the reload at log in and log
out is noticed; anything that looked like a mixture.

## Owner feedback

### Part A: the picks (2026-11-14)

Mockups: `notes/research/start-menu-mockups/round9/` (README, 58
pictures), published as <https://claude.ai/artifact/JhBtNxsewN6KZ26EiFahWh>.
The owner took the recommendation on all seven points:

1. **After Create account:** a + c. The line on the start menu's
   message line (also while the move runs and when it waits for the
   network: round 9's wording), and a quiet lasting line in the
   Account page's sync section.
2. **The locked copy:** a, the notice under the owner row inside the
   panel, Log in (L) and Remove (R); Remove's question "Remove copy"
   names what is lost, Keep the default.
3. **The start menu's messages:** a, today's message line.
4. **The Log out dialog:** as drawn, four states.
5. **Keep both:** a + b, the start menu's message naming both copies
   and the gold "kept both" mark on the new copy in the Profile list
   until it is opened or renamed.
6. **Delete account:** as drawn.
7. **The Account page's sync section:** as drawn; the page scrolls on
   a 1440 × 900 screen (Leaving below the fold).

**Keep-both name** (owner, 2026-11-14, during part B): the copy is
named `warrior_from_phone_14Nov` (names cannot hold spaces or
parentheses; the own name is shortened, never the device or the
date). The notice may say "from phone, 14 Nov" in words.

Follows from 1–3: the start menu's message line wraps to two or three
lines and About moves down while it shows (round 9 README).
