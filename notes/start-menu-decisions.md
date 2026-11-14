# Start menu, account and community: decisions of the sync session

Session with the owner, 2026-11-14, along the agenda of
`notes/start-menu-sync-prep.md` section 5. Written as the session
goes, so nothing is lost if it is interrupted. Not authoritative once
the session has ended: the decisions are then carried into
`intent.md`, `spec.md` and the ADRs, which win.

Status per point: **Decided**, **Open** (asked, no answer yet) or
**Not reached**.

| # | Point | Status |
|---|---|---|
| 1 | The ground rule: two spaces, move at Create account, remove at log out | Decided |
| 2 | "This device, always"; settings | Decided |
| 3 | Runs under the rule | Decided |
| 4 | A lost session; Delete account | Decided |
| 5 | Log out | Decided |
| 6 | Guests keep Spotlights and Diary | Decided |
| 7 | The word for a profile | Decided |
| 8 | The menu: three zones, owner row, foot row | Decided |
| 9 | History with tabs; Credits → Diary | Decided |
| 10 | Community: word, counter, notice, reactions, published runs | Decided |
| 11 | Random Runes | Decided |
| 12 | Order of the work; when accounts open | Decided |

All twelve decided 2026-11-14 and carried into `intent.md` (Goals 13
and 15), `spec.md` (§2.5, §5, §7), ADR 0146 and 0148 (addenda), ADR
0149 (the menu) and `docs/stages/67-start-menu.md`. Those win over
this file.

## Decisions

### 1. The ground rule (decided)

- **Decided:** logged out the player sees the device's things, logged
  in the account's, never a mixture. Two spaces on the device. This
  replaces ADR 0146's one-set merge model.
- **Decided:** several accounts on one device work by the rule: log
  out removes one account's copy, the next login fetches another's.
- **Decided (owner): the move happens at Create account and only
  there.** The device's own things move into the new, empty account
  automatically, without a question; a line afterwards says what
  moved. The device's space is then back at the starting set.
- **Decided (owner): a login to an existing account never moves
  anything and asks nothing.** The player gets what is in the account;
  at log out the device's own things are there again, untouched.
  Recovery is a login in this sense.
- **Consequence, said to the owner:** a player with things on two
  devices gets the second device's things into the account by hand:
  logged out, export (profiles, scripts backup, runs backup); logged
  in, import. A "move this device's things" row on the Account page
  can be added later without changing the model, if it is missed.
- **Session's technical calls:** untouched seeds and bundled scripts
  are not "own things" and never move. The device's copy of a thing is
  removed only when the server has taken it, so an interrupted move
  loses nothing and can go on; no separate safety copy (the account is
  empty, so nothing can collide; ADR 0146's `preSync` store and the
  keep-both rule *of the first sync* go; keep-both between two devices
  of one account stays).
- The first-sync page of spec §7.4 goes (nothing to choose).

### 2. What belongs where; settings (decided)

- **Decided:** settings follow the rule: they belong to the space and
  sync per device type (as Goal 13). At Create account the device's
  settings move with the rest.
- **Decided:** when the account has no settings for this device type
  yet, they start as a copy of this device's settings (the one
  exception to "a login moves nothing"; layout, not content).
- **Decided:** the automatic MUME login (phone and tablet) never
  leaves the device, belongs to the space and is dropped at log out,
  so the next person on a shared device does not inherit it.
- **Decided (new scope, changes Goal 13, ADR 0146 "Not synced" and
  spec §7.13):** Comm history and timers state sync to the account, so
  a session begun on the desktop can be taken up on the phone. Script
  data syncs as already planned (kind `scriptData`), which is what the
  owner meant by "and the like".
  - Freshness: pushed when the game is left, when the tab is hidden
    and every 5 minutes during play; pulled at login and page load. No
    live transfer between two running devices. The last minutes can be
    missing if the first device was closed abruptly.
  - Timers: one item per character, last writer (MUME allows one login
    per character).
  - Comm: in pieces per day, pieces from two devices merged, not last
    writer (session's technical call).
  - Other players' tells are then stored encrypted in the cloud: a
    line in the registration's points and on `/privacy`.
  - Built with settings and script data, not in the first sync stage.
- **Decided: "this device, always"** (whoever is logged in, stays at
  log out): the imported map and uploaded tilesets, the locator's
  learned ids, the statistics device id, the update state, the last
  used account name (Log in may prefill it; the owner accepts that the
  next person sees the name).
- Per page load only, as today: the profile editor's and the manuals'
  place (ADR 0143).
- **Decided:** unsaved runs do not sync (as ADR 0146).

### 3. Runs under the rule (decided)

- **Unsaved runs, logged in:** in the account's space on the device
  they were played on, 14 days as today, not on other devices. Removed
  at log out; the dialog says so and offers to save them first.
- **At Create account** all the device's runs move into the account's
  space on the device, so History looks the same before and after.
  Saved runs are then uploaded in the background, newest first. Those
  that do not fit stay on the device with the mark "not in the cloud";
  the line after the creation says how many.
- **A saved run that does not fit** is treated the same whenever it
  happens: in the account's space on the device with the mark, retried
  when there is room; ADR 0146's "does not fit" dialog stands. At log
  out the dialog lists them and offers a download; logging out anyway
  removes them.
- **No "this device" shelf** that survives a log out (it would be the
  mixture the rule forbids).
- **The limit** stays 50 MB until stage 63 has measured real runs; the
  owner sets the number then (and can raise it per account or for all
  without a release). Known: a long-time player can hit it at Create
  account; nothing is lost, the runs stay on the device with the mark.

### 4. A lost session; Delete account (decided)

A session can end without the player logging out: the password was
changed or the account recovered elsewhere, the session was ended from
another device, 180 days passed, or the account was deleted.

1. A game in progress is never disturbed: the player plays on, on the
   account's copy; the rest happens back on the start menu.
2. Everything already in the account: the copy is removed at once; the
   start menu shows the device's things and "You were logged out of
   <name> on this device."
3. Something not in the account (unsynced edits, saved runs with the
   mark): the copy is kept **locked**: not shown, not usable; the
   device behaves as logged out. A notice names what is kept ("3
   changes and 2 saved runs are not in the account yet. They are kept
   on this device until you log in.") with Log in and Remove.
4. A login to the same account unlocks and syncs; conflicts keep both.
5. A login to another account leaves the locked copy alone; the notice
   comes back.
6. Remove: anybody at the device, after a dialog naming what is lost.
   No download in the locked state; to save the things, log in.
7. No time limit on a locked copy.
8. Unsaved runs are no reason to lock.

- The server says why a session ended (small server change).
- "Locked" is not encrypted on the disk (as the player's things are
  not today); said to the owner.
- **Delete account:** on the device where it is done, the account's
  things are handed back to the device (the move in reverse, no
  question; same name on both sides: both kept). On other devices the
  copy is removed at the next contact with "The account <name> was
  deleted." The built dialog's "What stays" text changes accordingly.

### 5. Log out (decided)

The "keep or remove" choice of spec §7.2 goes: log out always removes
the account's copy from the device.

1. Log out syncs what is waiting before the dialog shows.
2. Everything in the account: "Log out of <name> on this device?
   Everything is in your account. It is removed from this device, and
   you are back on this device's own profiles, scripts and runs."
   Enter logs out.
3. Something not in the account: the dialog lists it, a row each:
   unsynced changes (server not reached, storage full), saved runs
   with the mark, unsaved runs of the last 14 days (with a link to
   History to save them). Choices: **Stay logged in** (Enter, the
   default), **Download** (the existing exports: profiles, scripts
   backup, runs backup), **Log out anyway** (removes them).
4. Only unsaved runs left: their row shows, but Enter logs out as
   usual.
5. A game running in another tab: log out is refused ("A game is
   running in another tab. Log out when it has ended.").
6. Offline: possible. With unsynced changes, 3 holds; without, the
   device logs out and the built text about the session still being
   listed elsewhere holds.
7. Afterwards: the start menu with the device's things and "Logged
   out. Everything is in your account <name>." The automatic MUME
   login is dropped.

Built in the sync stages, when there is something to list.

### 6. Guests keep Spotlights and Diary (decided)

Guests keep both pages, built on the device's runs; logged in they are
built on the account's. Intent Goal 13 and spec §7.0 rule 2 stand
unchanged. No locked tabs.

### 7. The word for a profile (decided)

**Profile stays.** Nothing in the community is ever called a profile
(it is an account, a player, a name). The menu row shows the selected
one: `Profile (warrior)`. No rename of the client's Settings.

### 8. The menu's structure (decided)

Three zones and a foot row: Enter MUME; the owner row, Profile
(selected), Scripts, History; Community with its counter; About as a
quiet foot row. Mockups before code, desktop and phone; the owner
picks.

1. A click on the owner row: guest → Log in; logged in → the Account
   page directly, no menu in between.
2. The owner row's states, all in the mockups: guest ("On this device
   · log in"), synced, syncing, offline, needs attention, a locked
   copy exists. The mockup must show that the row can be pressed.
3. Letters: E, U (owner row), P, S, H, C (Community), A. L and the old
   C are free.
4. The owner row shows only with the flag `accounts`, Community only
   with `gallery`. Three forms of the menu for a time (before
   accounts; with accounts; with the community); the mockups draw all
   three.
5. The new form goes to every player, guests too, also before accounts
   open. One menu, not two.
6. The phone's start menu gets the same structure. The phone's in-game
   menu sheet still gets no account row.

### 9. History with tabs; Credits → Diary (decided)

One menu row, History, with a tab strip over the three existing pages,
each keeping the look the owner chose in stages 45–47 (no redesign).

1. Tabs: Sessions (today's History: log, statistics, replay, export,
   later publish), Spotlights, Diary.
2. Diary replaces the word Credits everywhere (tab, page heading, help
   texts). The book look stays.
3. H always opens Sessions. The tab strip's look and keys are the
   mockups'.
4. The start menu's L and C no longer lead to Spotlights and Credits.
5. Built with the menu in one stage, after one mockup round that
   covers both, so the menu never has an in-between form.

### 10. Community (decided)

Built in stage 65 (links in 64); decided now because the menu's
mockups show it.

1. **The word:** Community, letter C (settles spec §7.8's working name
   Gallery). The top list inside is Hall of Fame.
2. **The counter** ("3 new") on the menu row: runs published since the
   player's last visit to the Community page, shown to guests too. Own
   runs and Random Runes are not counted; opening the page clears it.
   "Last seen" is kept in the account when logged in, on the device
   for a guest. No extra request: it rides on the answer already
   fetched for "N online" (session's technical call).
3. **The in-game notice of new runs goes; the counter replaces it.**
   No switch. Changes intent Goal 15's sentence. The built
   `galleryNotice` pref (stage 60 server) shows nowhere and is removed
   in stage 65.
4. **Reactions to one's own runs:** a mark on the owner row (`ole ·
   synced · 2 new`), counting new stars and comments; it leads to the
   Account page's Published runs view and is cleared when that is
   opened. A "seen" time per account on the server.
5. **Guests on the watch page** see "Log in to comment" and "Log in to
   rate" where the field and the stars sit.
6. **A published run is a copy of its own** and lives in the
   community, not in the session it was cut from. So:
   - no "published" mark on History's rows (the session's reading of
     the owner's point; spec §7.7's "from History's row" goes);
   - the sender can always remove their own run;
   - it is managed from the account: a bounded view of its own,
     **Published runs**, on the Account page (views, stars, comments,
     listed or link only, Remove). The Community page links there;
   - title and description can be changed afterwards; the cut is
     frozen (a new cut is a new publication);
   - published runs do **not** count against the account's 50 MB. Own
     limits: **150 published runs per account** (a safety ceiling
     nobody is expected to reach), 5 MB each;
   - Delete account removes the account's published runs (as today);
   - two ways out of the export editor stay: **Link** (unlisted) and
     **Hall of Fame** (listed); both show under Published runs;
   - the same session may be published many times (different cuts).
### 11. Random Runes (decided: in)

A notice board on the Community page, built with the community stage,
not before, behind a flag of its own (`runes`) so the owner can close
it alone.

1. Writers: every logged-in account that is not suspended. Guests
   read.
2. Plain text, at most 500 characters, the account name shown.
3. No answers or threads.
4. The board shows the latest 50 notes; a note is removed after 30
   days.
5. The writer removes their own note; any logged-in player reports;
   five reports from different accounts hide it until the owner has
   looked (as comments).
6. 5 notes per account and day.
7. Not counted by the menu's counter.
8. Desktop: a box beside the list. Phone: a tab or a section. The
   community stage's mockups decide.
9. Intent Goal 15 gets a sentence; the registration's points and
   `/privacy` say that what is written on the board shows with the
   account name.

**The owner's reference for the Community page** (the old log site's
front page): `notes/community-reference.md`. Wanted by function, in
our look, with some recognition: lists of top posters, top rated
logs, a random log, and the warlords lists (white lords, saurons
minions), the last to be investigated first (how MUME's war point
lists are fetched, and with whose leave). No "profile updates" and no
"most occurring" (owner, later the same session).

### 12. The order of the work; when accounts open (decided)

| Step | Stage | Content |
|---|---|---|
| 1 | **67 (new)** | The new start menu and History with tabs: mockups, the owner picks, the build. Released to everybody; the owner row behind the flag |
| 2 | 61 | Sync of profiles and scripts on the two-space model (the move at Create account, log out removes, lost session, Delete account) |
| 3 | 62 | Sync of settings, script data, Comm history and timers; the full Log out dialog |
| 4 | 63 | Runs in the cloud |
| 5 | 64 | Share links and the Published runs view |
| 6 | 65 | The community: Hall of Fame, Random Runes, the counter, reactions, the lists of the reference |
| 7 | 66 | The admin panel |

- The new stage is numbered 67 though it is done first, so 61–66 keep
  their numbers and the references in the ADRs stay right (session's
  call).
- **Accounts open in production after stage 63, in one step**, not
  after 61. Reason: with only profiles and scripts synced, runs and
  settings would either stay the device's (a mixture, and a later move
  into existing accounts, which point 1 ruled out) or sit in the
  account's space unsynced (lost at log out). Stages 61–63 are built
  and tested on staging one by one.
- **Stage 60:** the flag `accounts` stays off in production. The
  owner's test of the account pages on staging is still wanted (the
  flows, the texts, the phone, a password manager), except the menu
  row and the Log out dialog, which are replaced.
- **The enforced CSP** goes to production with the menu release (stage
  67), after the owner has played on staging (test guide step 13).

- (To point 10.) Risk noted by the session: 150 × 5 MB is 750 MB for one account, far
  over the free R2 room if many did it. Stage 64 measures real payload
  sizes; the admin page shows the total; the ceiling is a server
  setting.
