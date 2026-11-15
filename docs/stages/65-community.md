# Stage 65 — The community

Status: **Planned (2026-11-15).** Mockups (round 13) first; nothing
built.

## Waiting for the owner

- The picks of round 13 (the mockups' artifact, below).

## Goal

Published runs become a community (spec §7.8, ADR 0148 addendum, ADR
0155): a run can go to the **Hall of Fame** (listed) straight from the
export editor or later from Published runs; the **Community** page
(C on the start menu) lists them with Top, New and Most watched over a
week, a month or all time, beside the Hall of Fame boxes (top rated,
top posters, the random run of the day) and **Random Runes**, the
notice board; watchers give **1–5 stars** and **comments** on the watch
page; the menu's Community row counts what is new since the last visit
(guests too), the owner row marks new stars and comments on one's own
runs, which lead to **Published runs**, now a view of its own. Every
comment and note can be reported, five accounts hide it, and the
admin's queue and mail cover them. Behind `gallery` and `runes`: on in
staging, off in production until the owner says yes.

## What must be true afterwards

- **Publish.** The export editor's format toggle has Hall of Fame after
  Link (logged in, `gallery` on); EXPORT opens the share dialog in its
  listed form ("Everyone can find this in the Community"); the rules'
  tick as stage 64 when not yet ticked. Published runs can list or
  unlist a run later. At most 10 listings a day.
- **Community page.** C on the start menu opens it, desktop and phone,
  guest or logged in: the list (title, sender, character and level,
  length, date, stars with votes, comments, views), Top (default), New,
  Most watched; week, month, all; pages of 30; the Hall of Fame boxes;
  Random Runes (with `runes` on); a link to Published runs when logged
  in. Empty, loading and offline states. Back returns to the menu.
- **Watch page.** Stars (1–5, the client's star control) and comments
  under the replay: one's own vote shown and changeable, none on one's
  own run; a comment field (≤ 1 000), newest last, Remove for the writer
  and the run's sender, Report on each comment. Guests: "Log in to rate"
  and "Log in to comment" where they sit. Back goes to the Community
  page when the run was opened from it.
- **The counter.** The Community row shows "N new": runs listed since the
  player's last visit, not one's own, not link-only, not hidden; for
  guests too, from `GET /api/stats/public` (no extra request); opening
  the page clears it, on every device for an account.
- **Reactions.** New stars and comments on one's own runs show as "· N
  new" on the owner row; it leads to Published runs, which clears it.
- **Published runs** is a view of its own on the Account page: per run
  title, link, views, stars, comments, listed or link only, what is new
  since the last look, Edit (title, description, listed) and Remove; the
  Community page links to it.
- **Random Runes.** Logged in, not suspended: a note of ≤ 500
  characters, one line, 5 a day; the latest 50 show, newest first, with
  the writer's name; a note goes after 30 days; the writer removes their
  own; Report on others'. Guests read. `runes` off: the board is gone,
  the rest stays.
- **Reports and moderation.** Report on runs, comments and notes; five
  accounts hide an item until the admin has looked; the admin queue
  lists comments and notes with their text and acts on them (Hide,
  Restore, Dismiss, Delete); the report mail covers all three kinds with
  the text.
- **Abuse rules hold** (ADR 0155): text rules for free text (no
  invisible or smuggling characters, no Zalgo towers, never linkified);
  Top counts only votes from accounts at least 7 days old; a view counts
  once per device and per address a day; suspension and deletion take an
  account's votes out; every limit held in the statement under parallel
  requests.
- **`galleryNotice` gone** from the contract and the client.
- **The game path is untouched** (§7.0 rule 1); the benchmark does not
  move; the entry chunk grows by at most the counter's reading (31 366
  bytes after stage 64). With `gallery` off nothing changes for anyone.

## Not in this stage

- The admin's account list, graphs and per-account limits (stage 66).
- Answers or threads on the board (not wanted); "profile updates" and
  "most occurring" (not wanted).
- Any release, and `gallery` or `runes` on in production, without the
  owner's explicit go-ahead (part F, a step of its own).

## Decided already

- Spec §7.7, §7.8, §7.9, §7.10; ADR 0148 with its addenda (the word
  Community and C, Hall of Fame, the counter for guests too, no in-game
  notice, reactions on the owner row, Random Runes with its own flag,
  guests' "Log in to …", a published run is a copy of its own, 150 /
  5 MB); `notes/start-menu-decisions.md` points 10 and 11;
  `notes/community-reference.md` (by function, our look, some
  recognition; no "profile updates", no "most occurring").
- Technical, this session: **ADR 0155** (flags, migration 0006,
  listing, the list and its cache, the two vote sums and the 7-day rule,
  views per address, comments, the text rules for free text, the board,
  the counter's two sources and `seen`, the Hall of Fame boxes, reports
  of three kinds, the mail, limits). The contract goes into
  `shared/cloud/api.ts` ("The community") as B1's first commit, merged
  before part C starts.

## For the owner to choose (round 13)

Mockups in round 9–12's manner (`notes/research/start-menu-mockups/
round13/`), published as an artifact, the recommendation in its README.

1. **The Community page** (desktop and phone): the layout of the list,
   the Hall of Fame boxes and Random Runes (a: the reference's order,
   boxes on top, the list, the board at the foot; b: the list with a
   column beside it holding the boxes and the board); the sort and
   period controls; the phone's form (tabs or sections); empty, loading,
   offline; guest and logged in.
2. **Random Runes**: the box, writing a note, the limit reached, one's
   own note with Remove, Report on a note, a guest.
3. **Stars and comments on the watch page**: where the stars sit (in the
   band, or with the comments under the frame), the comments (under the
   frame, or a panel beside it on a wide screen), one's own run, Remove
   and Report on a comment, a guest; desktop and phone.
4. **Hall of Fame in the export editor and the share dialog**: the
   toggle's fourth choice, the listed form of the dialog and its result.
5. **The counter and the reactions mark**: the Community row's "N new"
   and the owner row's "· N new" (built rows, new figures), 99+.
6. **Published runs as a view of its own**: the rows with stars,
   comments, listed or link only, what is new; Edit with listed; empty.
7. **The admin's queue with comments and notes** (plain tool look).

## Tasks

Rules for every building agent (CLAUDE.md, "Tests and worktrees"): a
worktree branched from `main` by name; `node_modules` linked from the
main checkout and never `git add`ed; its own dev server port by
`WC_E2E_PORT`, never 5173; only its own spec files in the worktree; the
full e2e runs once, alone, in part D; nothing is deployed, nothing
touches staging or production.

### A. Mockups and the investigation

#### A1. Mockups, round 13 (worktree `stage65-mockups`, port 5471)

- [ ] `notes/research/start-menu-mockups/round13/` in round 12's manner
      (README, `build/`, the real DOM captured with the e2e fake, new
      content in `mk-*` classes, a picture per state, a review page, one
      self-contained file published as an artifact).
- [ ] Points 1–7 above, desktop and phone (7 desktop only); the
      recommendation.

#### A2. MUME's lists (no worktree)

- [x] `notes/research/mume-war-lists.md`: where MUME publishes the war
      point lists and the player count, the form, the terms, whom to
      ask. (The warlords: <https://mume.org/news/war>, public HTML, top
      10 a side, names, race and class, no points; no live player count
      on the web, MSSP on port 4242 unconfirmed; no terms; leave asked
      in game of an Ainu or on MUME's Discord.)
- [x] The owner (2026-11-15): no leave asked first; fetch `/news/war`
      and try MSSP for the count; show the lists without source or time
      (ADR 0155, "MUME's lists and player count").

### B. Worker (worktree `stage65-worker`, port 5472; may start before the picks)

- [ ] The contract in `shared/cloud/api.ts` ("The community"), first
      commit; `galleryNotice` out; flags `gallery` and `runes`.
- [ ] Migration `0006_community.sql` (ADR 0155, "Data").
- [ ] Listing in `POST`/`PATCH /api/u/pub` (10 a day, `listed_at` once).
- [ ] `GET /api/gallery` (the three sorts, periods, pages, the Cache API),
      `GET /api/community`, `GET /api/gallery/random`.
- [ ] Votes (`PUT`/`DELETE`/`GET`), the two sums, the 7-day rule, 60 an
      hour; suspension, restore and deletion move the sums.
- [ ] Comments (`GET`, `POST`, `DELETE`), 20 an hour, 1 000 per run.
- [ ] The text rules for free text in `shared/cloud/text.ts`.
- [ ] Views: the address row beside the device row.
- [ ] `GET /api/stats/public`'s `listed`; `GET /api/u/community/news`;
      `POST /api/u/community/seen`.
- [ ] Random Runes behind `runes`; the cron's 30 days.
- [ ] Reports of `comment` and `note`; the admin's queue and actions for
      them; the mail for all three kinds.
- [ ] Delete account: votes, comments, notes.
- [ ] Worker tests (every limit under parallel requests, the sums
      recounted, the states, flags off); ADR 0155 "As built (B)".

### C. Views (after round 13's picks and B merged)

#### C1. The Community page (worktree `stage65-community`, port 5473)

- [ ] `src/cloud/community/api.ts` (the list, the boxes, random, the
      board, news, seen) against the contract and the e2e fake.
- [ ] The page (pick 1) with Random Runes (pick 2); C on the start menu
      with `gallery` (the dev `?community=` goes); the counter (pick 5)
      for guests and accounts.
- [ ] e2e desktop and phone.

#### C2. The watch page and the way in (worktree `stage65-watch`, port 5474)

- [ ] Stars and comments (pick 3), guests' lines, Back to the Community.
- [ ] Hall of Fame in the export editor and the share dialog (pick 4).
- [ ] e2e desktop and phone.

#### C3. Published runs and the reactions mark (worktree `stage65-published`, port 5475)

- [ ] Published runs as a view of its own (pick 6): stars, comments,
      listed, what is new, `seen`.
- [ ] The owner row's mark (pick 5); `galleryNotice` out of the client.
- [ ] e2e.

#### C4. Admin (worktree `stage65-admin`, port 5476)

- [ ] The queue's comments and notes (pick 7) and their actions; tests.

#### C5. MUME's boxes (worktree `stage65-mume`, port 5477; owner 2026-11-15: no leave needed first)

- [x] The cron's fetch of `/news/war` and its parse, the MSSP probe
      (`PLAYERS` filled on the live probe of 2026-11-15; ADR 0155 "As
      built (stage 65 C5)"), the `mume_cache` rows and `readMume`
      (branch `stage65-mume`).
- [ ] Tried on staging; `GET /api/community`'s `mume` from `readMume`
      (after part B); the boxes without source or time (with C1).

### D. Checks

- [ ] An independent security review (free public text in comments and
      Random Runes, abuse of stars, reports and limits, that Top cannot
      be moved cheaply, that the report mail covers comments and notes)
      and `/code-review` high; fixes with tests that fail before them;
      ADR 0155 "As built (review fixes)".
- [ ] Unit; worker; the full e2e alone at 5 workers (a failure rerun
      alone before it is called one); the benchmark; the entry chunk;
      `npm run test:sync-worker` (grows: list, vote, comment, a note).

### E. Staging

- [ ] Push `main`; `deploy.yml` to staging with migration 0006;
      `test:prod` against <https://staging.mumecockpit.com>; production's
      `/api/config` unchanged (`gallery`, `runes` off). No tag.

### F. The community open in production (only on the owner's go-ahead)

- [ ] The owner has tested on staging and said yes.
- [ ] The release: version, tag, migration 0006, `FLAG_GALLERY` and
      `FLAG_RUNES` on in production; `test:prod` against mumecockpit.com.

## Test guide (owner)

Written when part E is done.

## Owner feedback

(None yet.)
