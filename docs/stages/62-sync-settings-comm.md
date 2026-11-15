# Stage 62 — Sync of settings, script data, Comm history and timers

Status: **In progress (night pass 2026-11-15/16).**

## Waiting for the owner

(Filled in at the end of the night pass; see the bottom of this list for
what is decided without you and only needs a yes.)

## Goal

The rest of what follows an account (ADR 0146 and its addendum, spec
§7.4): settings per device type, the scripts' data, Comm history and
timers state, so a session begun on one device can be taken up on
another; and the Log out dialog in full. On staging only: the flags
`accounts` and `sync` stay off in production until stage 63 is done
(spec §7.12).

## What must be true afterwards

- **Settings per device type.** Two desktops of one account share look
  and layout; a phone (and a tablet) keeps its own set. A tablet on
  "Desktop site" is a tablet. A login to an account that has no
  settings for this device type starts with a copy of the device's; an
  account that has them gives them, never the device's copy (ADR 0152,
  "The first copy").
- **Nothing is swapped during play.** A pulled change to this device
  type's settings, to the data of a script that is on, or to the timers
  of the character in play waits for the start page. Pulled settings
  apply on the start page at once (in every tab of the space), and the
  first paint of the next load follows them (`webcockpit.appearance`).
- **Script data** (bundled and user scripts' settings and store) follows
  the account, last writer.
- **Comm history** follows the account in pieces per UTC day, merged by
  record: Comm from two devices adds up, nothing is lost, and the cloud
  keeps 7 days, as the device (owner, 2026-11-15).
- **Timers** follow per character, last writer.
- **Go on on the next device:** play on the desktop, leave the game (or
  put the tab away); open the game on the phone with the same
  character: Comm shows the desktop's conversation and the timers run
  on. During play the small kinds are pushed every 5 minutes, when the
  tab is hidden and when the game is left.
- **The game path is untouched** (§7.0 rule 1): no sync work is awaited
  between a key and `ws.send` or between a frame and its paint; the §1.3
  benchmark does not move; a store write per message or tick does not
  start a sync.
- **The Log out dialog in full:** what is not in the account is named
  per kind; Download; refused while a game runs in another tab; the
  states of round 9 otherwise as built.
- **The words:** the registration's first point reads "Your profiles,
  scripts, settings, saved runs and Comm history, encrypted on this
  device before they are sent." (owner, 2026-11-15); `/privacy` has an
  account section, drafted, shown only with the flag `accounts` on (so on
  staging), for the owner's approval.
- Guests notice nothing; the entry chunk grows only by what the start
  page must know (30 876 bytes after stage 61).

## Not in this stage

- Runs in the cloud and their rows in the Log out dialog: stage 63.
- Accounts in production; any release.

## Decided already

- Owner (2026-11-15, progress.md "Decided for stage 62"): the first
  point's text; Comm 7 days in the cloud; this pass may push `main` and
  deploy to staging when every check is green; `/privacy` drafted behind
  `accounts`.
- Spec §7.4 and ADR 0146: settings per device type, last writer for the
  small kinds, Comm per day merged, timers per character, pushed on the
  play schedule, pulled changes in use wait.
- Technical, this pass: **ADR 0152** (keys and bodies of the four kinds,
  the other device types' settings kept in the account's store, Comm's
  merge policy, additive write, UTC days, gzip, the play schedule, the
  settings seed, Create account copies the four kinds, timers do not
  lock a copy, the Worker opens the kinds).

## For the owner to confirm (made without you this night)

These are built as recommended; each is a small change if you want it
otherwise. The mockups are round 10 (link below).

1. **Log out's list of what is not in the account** (round 10, point 1).
2. **Settings that arrive from another device** on the start menu
   (round 10, point 2).
3. **The Account page's sync section** naming what follows the account
   (round 10, point 3).
4. **Create account copies** settings, script data, Comm history and
   timers into the account; the device keeps its own (ADR 0152). The
   alternative is to move them, so the device is back at the defaults.
5. **Timers do not make a locked copy** after a lost session; Comm
   history, settings and script data do (ADR 0152).
6. **`/privacy`'s account section** (the draft, on staging).

## Tasks

Rules for every building agent (CLAUDE.md, "Tests and worktrees"): a
worktree branched from `main` by name; `node_modules` linked from the
main checkout and never `git add`ed; its own dev server port by
`WC_E2E_PORT`, never 5173; only its own spec files in the worktree;
the full e2e runs once, alone, in part D; nothing is deployed, nothing
touches staging or production.

### A. Mockups, round 10 (one agent, worktree `stage62-mockups`, port 5431)

- [ ] `notes/research/start-menu-mockups/round10/`, in round 9's manner
      (its README and `build/`): the real DOM captured from a dev server
      on its own port, the new content in `mk-*` classes, every state a
      picture, a review page, one self-contained file published as an
      artifact.
- [ ] Point 1, Log out with things not in the account: (a) the one
      "changes" row of round 9 with a second line naming the kinds
      ("2 profiles · settings · Comm history, today"), (b) a row per kind.
- [ ] Point 2, settings pulled from another desktop while the start menu
      shows: (a) applied quietly, (b) applied, and the message line says
      "Settings from desktop, Chrome." (c) the same after the game is
      left, when they waited.
- [ ] Point 3, the Account page's sync section: (a) one line "Follows
      the account: profiles, scripts, settings for desktop (this
      device), tablet and phone, script data, Comm history (7 days),
      timers." (b) no new line.
- [ ] Desktop and phone; the recommendation in the README.

### B. Foundations (two agents in worktrees side by side)

#### B1. Engine and Worker (worktree `stage62-engine`, port 5432)

- [ ] `src/cloud/sync/items.ts`: kind specs for `settings`, `scriptData`,
      `timers`, `comm` (bodies, `decode`, `v` 1; settings `newer` for a
      record version above `SETTINGS_VERSION`); `compress` for `comm`
      (gzip, async `encodeBody`/`decodeBody`); the order profile, script,
      settings, scriptData, timers, comm.
- [ ] The policy `merge` (`KindSpec.merge`) in the engine; `setTimeout(0)`
      between kinds and between pushes.
- [ ] The model and the generated tests over the four new kinds as well:
      last writer converges; merge keeps every record any device wrote
      exactly once; a day older than seven days goes everywhere.
- [ ] Worker: `SYNC_KINDS_OPEN` with the four kinds; worker tests; the
      contract's comment.
- [ ] ADR 0152 "As built (B1)".

#### B2. The stores (worktree `stage62-stores`, port 5433)

- [ ] `SettingsStore.reload()`: reads `main` again, migrates, tells the
      subscribers without writing back, rewrites the appearance mirror;
      unit tests (a pulled appearance repaints, a pulled layout moves the
      panes on the start page, an older version migrates).
- [ ] `store-events.ts`: kinds `settings`, `scriptData`, `comm`,
      `timers`; the settings store, the script library (data writes too),
      the Comm archive and the timers archive note their writes.
- [ ] `CommArchive`: the days of the last seven with a cache key (count,
      highest `seq`), the records of a day without `seq`, an additive put
      of a day's records (by identity), the delete of a day.
- [ ] `TimersArchive`: list, put, remove; the hub reads a pulled record
      at the next `Char.Name` (already so; a test).
- [ ] **Measure** Comm: from the owner's session logs
      (`/home/ole/MUME/logs`, read only) or a realistic generator, the
      size of a heavy day's piece as canonical JSON and gzip; write the
      figures here under "Measurements".

### C. The flows (one agent, after A's pick and B merged; worktree `stage62-flows`, port 5434)

- [ ] The IndexedDB adapters (`src/cloud/space/local.ts`) for the four
      kinds: settings `main` ↔ this device type, `device:<type>` for the
      others; the settings seed (`syncMeta.settingsSeed`); script data by
      name; timers by character; Comm by day (cached, additive, seven
      days, a day over 1 MB split).
- [ ] `InUse` for the new kinds; the BroadcastChannel and `applyWritten`
      carry `settings` (reload), `scriptData` (library reload),
      `timers`, `comm`.
- [ ] Triggers: during play the small kinds wait for the play schedule
      (5 minutes, hidden tab, leaving the game); `settings` notes at 5 s.
- [ ] Create account copies the four kinds into the new space.
- [ ] Log out in full (round 10's pick for point 1); `unsynced()` names
      per kind; the locked copy's decision without timers.
- [ ] Round 10's picks for points 2 and 3.
- [ ] The registration's first point; `/privacy`'s account section behind
      the flag `accounts` (the draft below, checked against the Worker).
- [ ] e2e (fake API, two contexts): two desktops share a layout change;
      a phone context keeps its own; Comm from context A appears in B's
      Comm pane after A leaves the game; timers of a character go on;
      pulled settings wait during play and apply on the start page; Log
      out lists a settings change made offline.
- [ ] `npm run test:sync-worker` extended with a settings and a Comm item
      against the real local Worker.

### D. Checks and staging

- [ ] A review of the sync of the four kinds by a second agent with
      only the code and ADR 0146, 0150, 0151, 0152; `/code-review` high
      of the stage; fixes with tests.
- [ ] Unit; the full e2e alone at 5 workers; the benchmark; the entry
      chunk; `npm run test:sync-worker`.
- [ ] Push `main`; `deploy.yml` to staging (environment `staging`);
      `test:prod` against staging. Nothing released, no tag, nothing to
      production.

## Draft: `/privacy`'s account section (behind `accounts`)

Replaces "COMING LATER" when the flag `accounts` is on. To be checked
against the Worker in part C and approved by the owner.

    ACCOUNTS
    An account is your own choice; the client works without one. With an
    account, your profiles, scripts, settings, the scripts' data, Comm
    history and timers are kept in step between your devices. They are
    encrypted in your browser with a key made from your password before
    they are sent, so the site stores them but cannot read them.
      What is stored    Your user name, when the account was made and last
                        used, and your things as encrypted pieces with
                        their sizes and when they changed. Your password
                        and recovery code are not stored, only values
                        made from them that let the site check them.
      Comm history      What the Comm pane keeps, the other players' tells
                        and your channels included, encrypted like the
                        rest, for seven days, as in this browser.
      Sessions          Each device you log in on: a name for it such as
                        "Firefox on Linux", when it logged in and was last
                        used. A session ends after 180 days without use;
                        why it ended is kept as long again.
      Limits            To stop guessing and abuse, failed logins are
                        counted per user name and registrations per
                        address; the address is kept only as a value that
                        cannot be turned back, for one day.
      Deleting          Delete account removes the account and everything
                        stored in it at once. Its user name stays taken,
                        so nobody can pose as you.

## Measurements

(Part B2.)

## Test guide (owner)

(Written at the end of part D.)

## Owner feedback

(After the test.)
