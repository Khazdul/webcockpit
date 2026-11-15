# Stage 62 — Sync of settings, script data, Comm history and timers

Status: **Done on staging (2026-11-15): the owner's test passed; his picks 2a and 3b built after it.** Nothing released; the flags stay off in production until stage 63 is done.

## Waiting for the owner

Nothing. The owner's answers are under "Owner feedback" at the end;
stage 63 runs in a session of its own.

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

Answered 2026-11-15: 1a, **2a**, **3b**, 4–6 as built (see "Owner
feedback").

These are built as recommended; each is a small change if you want it
otherwise. The mockups are round 10:
`notes/research/start-menu-mockups/round10/` (README, 22 pictures),
published as <https://claude.ai/artifact/G1zwjmFCu8v8qXkDj2k3xw>.
The recommendation (built): **1a** (round 9's one "changes" row with a
quieter second line naming the kinds), **2b with 2c** (the message line
says "Settings from desktop, Chrome." when pulled settings apply, and
"Settings from desktop, Chrome, held until the game ended." when they
waited for the game), **3a** (one line on the Account page: what follows
the account). The device in 2 is the sync's label (the device type and
the browser, which the settings follow), not the Devices list's "Chrome
on Linux".

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

- [x] `notes/research/start-menu-mockups/round10/`, in round 9's manner
      (its README and `build/`): the real DOM captured from a dev server
      on its own port, the new content in `mk-*` classes, every state a
      picture, a review page, one self-contained file published as an
      artifact.
- [x] Point 1, Log out with things not in the account: (a) the one
      "changes" row of round 9 with a second line naming the kinds
      ("2 profiles · settings · Comm history, today"), (b) a row per kind.
- [x] Point 2, settings pulled from another desktop while the start menu
      shows: (a) applied quietly, (b) applied, and the message line says
      "Settings from desktop, Chrome." (c) the same after the game is
      left, when they waited.
- [x] Point 3, the Account page's sync section: (a) one line "Follows
      the account: profiles, scripts, settings for desktop (this
      device), tablet and phone, script data, Comm history (7 days),
      timers." (b) no new line.
- [x] Desktop and phone; the recommendation in the README.

### B. Foundations (two agents in worktrees side by side)

#### B1. Engine and Worker (worktree `stage62-engine`, port 5432)

- [x] `src/cloud/sync/items.ts`: kind specs for `settings`, `scriptData`,
      `timers`, `comm` (bodies, `decode`, `v` 1; settings `newer` for a
      record version above `SETTINGS_VERSION`); `compress` for `comm`
      (gzip, async `encodeBody`/`decodeBody`); the order profile, script,
      settings, scriptData, timers, comm.
- [x] The policy `merge` (`KindSpec.merge`) in the engine; `setTimeout(0)`
      between kinds and between pushes.
- [x] The model and the generated tests over the four new kinds as well:
      last writer converges; merge keeps every record any device wrote
      exactly once; a day older than seven days goes everywhere.
- [x] Worker: `SYNC_KINDS_OPEN` with the four kinds; worker tests; the
      contract's comment.
- [x] ADR 0152 "As built (B1)".

#### B2. The stores (worktree `stage62-stores`, port 5433)

- [x] `SettingsStore.reload()`: reads `main` again, migrates, tells the
      subscribers without writing back, rewrites the appearance mirror;
      unit tests (a pulled appearance repaints, a pulled layout moves the
      panes on the start page, an older version migrates).
- [x] `store-events.ts`: kinds `settings`, `scriptData`, `comm`,
      `timers`; the settings store, the script library (data writes too),
      the Comm archive and the timers archive note their writes.
- [x] `CommArchive`: the days of the last seven with a cache key (count,
      highest `seq`), the records of a day without `seq`, an additive put
      of a day's records (by identity), the delete of a day.
- [x] `TimersArchive`: list, put, remove; the hub reads a pulled record
      at the next `Char.Name` (already so; a test).
- [x] **Measure** Comm: from the owner's session logs
      (`/home/ole/MUME/logs`, read only) or a realistic generator, the
      size of a heavy day's piece as canonical JSON and gzip; write the
      figures here under "Measurements".

### C. The flows (one agent, after A's pick and B merged; worktree `stage62-flows`, port 5434)

- [x] The IndexedDB adapters (`src/cloud/space/local.ts`) for the four
      kinds: settings `main` ↔ this device type, `device:<type>` for the
      others; the settings seed (`syncMeta.settingsSeed`); script data by
      name; timers by character; Comm by day (cached, additive, seven
      days, a day over 1 MB split).
- [x] `InUse` for the new kinds; the BroadcastChannel and `applyWritten`
      carry `settings` (reload), `scriptData` (library reload),
      `timers`, `comm`.
- [x] Triggers: during play the small kinds wait for the play schedule
      (5 minutes, hidden tab, leaving the game); `settings` notes at 5 s.
- [x] Create account copies the four kinds into the new space (C1).
- [x] Log out in full (round 10's pick for point 1): the changes' row
      names the kinds under it (`unsyncedKindsWords`, C2).
- [x] `unsynced()` names per kind; the locked copy's decision without
      timers (C1).
- [x] Round 10's pick for point 2: 2b with 2c on the start menu's line (C1).
- [x] Round 10's pick for point 3: the Account page's line (C2).
- [x] The registration's first point; `/privacy`'s account section behind
      the flag `accounts` (the draft below, checked against the Worker;
      corrected as listed under the draft, C2).
- [x] e2e (fake API, two contexts): two desktops share a layout change;
      a phone context keeps its own; Comm from context A appears in B's
      Comm pane after A leaves the game; timers of a character go on;
      pulled settings wait during play and apply on the start page; Log
      out lists a settings change made offline. (C1 done:
      tests/e2e/sync-kinds.spec.ts; Log out's kinds line in
      sync-flows.spec.ts with a profile change, the words for every kind
      in tests/unit/cloud-unsynced-words.test.ts.)
- [x] `npm run test:sync-worker` extended with a settings and a Comm item
      against the real local Worker.

### D. Checks and staging

- [x] A review of the sync of the four kinds by a second agent with
      only the code and ADR 0146, 0150, 0151, 0152; `/code-review` high
      of the stage; fixes with tests. (Five findings from the second
      agent, ten from `/code-review`, overlapping: eleven fixes, F1–F11,
      ADR 0152 "As built (stage 62, review fixes)", tests in
      `tests/unit/cloud-sync-fixes62.test.ts`, 31 tests, 24 of them
      failing on the code before.)
- [x] Unit; the full e2e alone at 5 workers; the benchmark; the entry
      chunk; `npm run test:sync-worker`.

Checks (2026-11-16, night): unit 4866 passed; full e2e alone at 5
workers 1625 passed, 1 failed under load (`sync-flows` Log out rows in
Chromium, a layout measure taken while the dialog moved in; 6/6 alone,
the test now measures both lines at once), 1 skipped; the benchmark
exits clean (key → send playing 0.8 / 1.1 / 2.1 ms; burst 82 323
lines/s, no frame over 50 ms); entry chunk 30 876 (stage 61) → 31 119
bytes (+243 over the stage: store events, the play flag, the start
menu's settings line; not split up further; the Comm pane's chunk got
smaller in the fixes, 10 049 → 5 087, once the sync code was out of it); `npm run test:sync-worker` 2/2.
- [x] Push `main`; `deploy.yml` to staging (environment `staging`);
      `test:prod` against staging. Nothing released, no tag, nothing to
      production. (Run 43673350330, commit 27ca08f, no new migration;
      `test:prod` 30/30 against staging.mumecockpit.com; staging's
      flags `stats`, `accounts`, `sync` on; production untouched,
      `accounts` off there.)

Known small things, fixed 2026-11-15 (branch `fix/stage62-small`):
- The Account page fits 1440 × 900 synced, offline and full (two devices):
  the empty message line takes no room, rules 18 px apart (e2e `sync-flows`).
- Comm `prune()` removes whole days past `commDayKept`, so a listed day no
  longer shrinks and is pushed back and forth (ADR 0152, "Small fixes").
- `ScriptLibrary.reload()` drops a script data record the sync deleted.

## Draft: `/privacy`'s account section (behind `accounts`)

Replaces "COMING LATER" when the flag `accounts` is on. To be checked
against the Worker in part C and approved by the owner.

**As built (C2):** `src/chrome/frames/privacy-accounts.ts`, one line per
paragraph and per row (About's format), rail "Accounts" (O), the page's
date "Last changed 15 November 2026" only with the flag on. Corrected
against worker/: the data key is locked by the password *or* the
recovery code (not "made from your password"); settings are one set per
kind of device; the server sees each piece's kind and keeps a mark of a
deleted piece; the password and code never reach the site, and the key
is kept locked with each; Comm's seven days are kept by the devices (an
older day goes at the next sync of a device, the server cannot date
it); recovery tries are counted per name too, and the counters
(address as a one-way value) go after a day or two, not "one day";
Turnstile also guards recovery and a login after three failed tries;
Delete account leaves the sessions' end reasons for their 180 days. The
draft below is the one sent for checking.

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
                        cannot be turned back, for one day. Create account
                        asks Cloudflare Turnstile to check that you are a
                        person.
      Deleting          Delete account removes the account and everything
                        stored in it at once. Its user name stays taken,
                        so nobody can pose as you.

## Measurements

Part B2, 2026-11-15. Material: Cockpit's own Comm archive of the owner's
characters (`/home/ole/MUME/data/comm/*.jsonl`, read only; `logs/` holds
no channel text): 2 585 real messages over 9 days, 7 characters (tells
and says most, then yells, socials, tales, emotes). Each was turned into
a WebCockpit record (`character, ts` in ms, `channel, talker,
talkerType, destination, text`), grouped by UTC day, and measured as the
piece's canonical JSON `{day, records}` and its gzip (node zlib, default
level). No text or names are kept here.

| Figure | Value |
|---|---|
| Bytes per record, canonical JSON | 186 (text 54 characters on average) |
| Bytes per record, gzip, heaviest day | about 20 |
| Records on the heaviest day | 1 472 (next: 804, 188) |
| Heaviest day's piece, raw / gzip | 267 KB / 30 KB (ratio about 9) |
| The 7 heaviest days together, raw / gzip | 480 KB / 54 KB |
| Extrapolated: 5 000 records a day for 7 days, gzip | about 0.7 MB (about 0.95 MB if the sealed blob is counted as base64) |
| A day's gzip piece at the 1 MB item limit | about 50 000 records |

So a heavy real week of Comm is some 3 % of the 2 MB small-item limit;
even a player with three times the owner's heaviest day every day of
the week stays under half of it. The split of a day over 1 MB
(`YYYY-MM-DD.2`) will in practice not happen; it stays as a guard. No
call on the limit is needed from the owner.

## Test guide (owner)

On staging (<https://staging.mumecockpit.com>, not the `workers.dev`
address: Turnstile only works on the domain), with your test account.
Two desktops can be two browsers on one computer (Firefox and Chrome
count as two desktops).

1. **Two desktops share.** Log in on both. On the first, change the
   look (a colour or the font size) and move or resize a pane, then go
   back to the start menu. On the second, open the start menu (or
   reload): the line says "Settings from desktop, Firefox." (or the
   browser you used), and the game has the new look and layout.
2. **The phone keeps its own.** Log in on the phone: its own phone
   layout, not the desktop's. Change something on the phone; the
   desktops are not changed.
3. **Go on on the next device.** On a desktop, play a while with a
   character: get a tell or two, have a timer running (a spell, a
   herb). Leave the game (Exit), or put the tab away. On the phone, go
   into the game with the same character: Comm shows the conversation
   from the desktop, and the timers run on.
4. **Held during play.** Play on the first desktop; change a setting on
   the second. The first does not change while you play. Leave the game
   on the first: the line says "Settings from desktop, …, held until the
   game ended." and the change is there.
5. **Log out with something not synced.** Take a desktop offline (the
   browser's offline switch, or pull the network), change a setting,
   Log out: the row says "1 change not synced", with "settings" on the
   line under it. Choose Stay logged in, go online again.
6. **Create account copies.** As a guest on a device with script
   settings and some Comm, create a new account: Comm and the scripts'
   settings are in the account; log out, and the device still has its
   own (point 4 of "For the owner to confirm").
7. **The words.** Create account's first point names Comm history; the
   Account page names what follows the account; `/privacy` has
   "Accounts".

**Feedback wanted:** whether settings moving between desktops is what
you expect (and the line that says so); whether a session taken up on
the phone feels continuous (Comm, timers); the six points to confirm;
the privacy text.

## Owner feedback

2026-11-15, after the test on staging:

1. **The test guide's steps work** on staging.
2. **The points to confirm:** 1a yes; **2a** instead of 2b with 2c
   (pulled settings apply quietly, no message); **3b** instead of 3a
   (no "Follows the account" line on the Account page). Points 4 and 5
   (Create account copies; timers make no locked copy) got no comment
   and stay as built. Built after the feedback: ADR 0152, "Owner's
   picks".
3. **`/privacy`'s account section** is approved as drafted.
4. **Stage 63** runs in a session of its own.
