# Stage 65 — The community

Status: **On staging after the owner's feedback round 2 (2026-11-16; round 1 in the
night pass)**; the release 0.14.0 is prepared but not made (the session
was not allowed to tag a release). `gallery` and `runes` on in staging,
off in production.

## Waiting for the owner

1. **The release 0.14.0** (the night pass could not tag it: the tool's
   permission check refused the version bump and tag). Everything is
   green and on staging; the release is three commands (below, "Release
   0.14.0").
2. **Opening the community in production**: after the release, turn
   `gallery` and `runes` on from `/admin` → Flags (no release needed),
   or say so and the next session flips `FLAG_GALLERY`/`FLAG_RUNES` in
   production's vars. Kept off by the rule that opening is its own step.
3. **A look at the feedback rounds' results** on staging (the test
   guide's "Second look" and "Third look"), above all the phone's
   dashboard, the watch page's wide layout and the Back buttons.

### Release 0.14.0 (for the owner, or a session allowed to tag)

```
npm version 0.14.0 --no-git-tag-version
git commit -am "chore: release 0.14.0 (stage 65)"
git tag v0.14.0 && git push origin main v0.14.0
```

The tag runs `deploy.yml` for production: migration `0006_community.sql`
(additive), the Worker with `SEARCH_LIMITER`, the site. Then
`WC_PROD_URL=https://mumecockpit.com npm run test:prod`.

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

Artifact: https://claude.ai/artifact/RxKtoMqiLZrXtj9gRpuGaP

**Owner's picks (2026-11-15):**

- **1b, with changes** (the list on the left, a column on the right):
  - no Published runs / Mine button on the Community page;
  - the list opens newest first; no sort or period pills: a press on a
    column heading sorts (desktop and tablet); the phone shows newest
    only, without sorting;
  - about 10 runs a page; the pager `‹ Page 1 of 3 ›` sits at the
    list's bottom right, inside the list; no "71 runs this week";
  - Run of the day: today only, with as much of its description as
    fits; no Yesterday, no Show another; less height;
  - a press on a sender's name opens a page with every run that
    account has listed;
  - no "Your runs: History → Export → Hall of Fame" line in the foot;
  - Top posters goes;
  - Random Runes moves under the list on the left; every note shown
    whole (wrapped, not cut); while writing, the field grows so the
    text can be seen; notes at most **250** characters (was 500);
  - the right column (Run of the day, Hall of Fame, Warlords) shows
    the Warlords without scrolling.
- **3a, inside the start menu's frame:** the watch page (also the
  stage 64 one, a link's page) shows the start page's sky and the
  framed window around everything, so the player feels still inside
  the client; Back at the top left, where the start menu's sub-pages
  have it. The stars in the band, the comments under the replay.
- **2, 4, 5, 6, 7 as drawn**, except what point 1 changes (Random
  Runes' place and length).
- **The admin queue shows the reporters' count only**, as in stage 64.

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

- [x] `notes/research/start-menu-mockups/round13/` in round 12's manner
      (README, `build/`, the real DOM captured with the e2e fake, new
      content in `mk-*` classes, a picture per state, a review page, one
      self-contained file published as an artifact).
- [x] Points 1–7 above, desktop and phone (7 desktop only); the
      recommendation (61 states, 112 pictures).

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

- [x] The contract in `shared/cloud/api.ts` ("The community"), first
      commit; `galleryNotice` out; flags `gallery` and `runes`.
- [x] Migration `0006_community.sql` (ADR 0155, "Data").
- [x] Listing in `POST`/`PATCH /api/u/pub` (10 a day, `listed_at` once).
- [x] `GET /api/gallery` (the three sorts, periods, pages, the Cache API),
      `GET /api/community`, `GET /api/gallery/random`.
- [x] Votes (`PUT`/`DELETE`/`GET`), the two sums, the 7-day rule, 60 an
      hour; suspension, restore and deletion move the sums.
- [x] Comments (`GET`, `POST`, `DELETE`), 20 an hour, 1 000 per run.
- [x] The text rules for free text in `shared/cloud/text.ts`.
- [x] Views: the address row beside the device row.
- [x] `GET /api/stats/public`'s `listed`; `GET /api/u/community/news`;
      `POST /api/u/community/seen`.
- [x] Random Runes behind `runes`; the cron's 30 days.
- [x] Reports of `comment` and `note`; the admin's queue and actions for
      them; the mail for all three kinds.
- [x] Delete account: votes, comments, notes.
- [x] Worker tests (every limit under parallel requests, the sums
      recounted, the states, flags off); ADR 0155 "As built (B)".

### C. Views (after round 13's picks and B merged)

#### C1. The Community page (worktree `stage65-community`, port 5473)

- [x] The Worker's part of the round 13 addendum (sorts, `by`, pages of
      10, `total`, the boxes without top posters and yesterday, `today`'s
      description, no random, notes 250).
- [x] `src/cloud/community/api.ts` (the list, `by`, the boxes, the board,
      a note, its removal and report; news and seen are C3's news.ts)
      against the contract and the e2e fake.
- [x] The page (pick 1) with Random Runes (pick 2); C on the start menu
      with `gallery` (the dev `?community=` goes); the counter (pick 5)
      for guests and accounts; Back from a run (`?from=community` →
      `<base>?community`, ADR 0155 "As built (stage 65 C1)").
- [x] e2e desktop and phone.

#### C2. The watch page and the way in (worktree `stage65-watch`, port 5474)

- [x] Stars and comments (pick 3), guests' lines, Back to the Community;
      the watch page inside the start page's sky and frame (the owner's
      change); ADR 0155 "As built (stage 65 C2)" (branch `stage65-watch`).
- [x] Hall of Fame in the export editor and the share dialog (pick 4)
      (built in C3, branch `stage65-published`; ADR 0155 "As built (stage 65 C3)").
- [x] e2e desktop and phone (`watch-community.spec.ts`,
      `phone-watch-community.spec.ts`; stage 64's watch specs moved with
      the layout).

#### C3. Published runs and the reactions mark (worktree `stage65-published`, port 5475)

- [x] Published runs as a view of its own (pick 6): stars, comments,
      listed, what is new, `seen`.
- [x] The owner row's mark (pick 5); `galleryNotice` out of the client;
      the shared news module `src/cloud/community/news.ts`.
- [x] e2e (`hall-of-fame`, `published-runs`, `phone-hall-of-fame`); ADR
      0155 "As built (stage 65 C3)".

#### C4. Admin (worktree `stage65-admin`, port 5476)

- [x] The queue's comments and notes (pick 7) and their actions; tests
      (ADR 0155 "As built (C4)"; branch `stage65-admin`).

#### C5. MUME's boxes (worktree `stage65-mume`, port 5477; owner 2026-11-15: no leave needed first)

- [x] The cron's fetch of `/news/war` and its parse, the MSSP probe
      (`PLAYERS` filled on the live probe of 2026-11-15; ADR 0155 "As
      built (stage 65 C5)"), the `mume_cache` rows and `readMume`
      (branch `stage65-mume`).
- [ ] Tried on staging; `GET /api/community`'s `mume` from `readMume`
      (after part B); the boxes without source or time (with C1).

### D. Checks

- [x] An independent security review (free public text in comments and
      Random Runes, abuse of stars, reports and limits, that Top cannot
      be moved cheaply, that the report mail covers comments and notes)
      and `/code-review` high; fixes with tests that fail before them;
      ADR 0155 "As built (stage 65, review fixes)". The review
      (`notes/research/stage65-security-review.md`) found no injection,
      authorization hole or vote-sum drift: S1 (combining marks past the
      limit through ZWJ) and S4 (views per IPv6 /64) medium, S2–S3,
      S5–S9 low; `/code-review` high CR1–CR9 (comment paging, a stale
      news answer, the writer removing a hidden item, the run of the
      day's cost, duplicated formatters, a double request on the phone,
      the queue's three queries, a comment). All fixed (bcdd0d0c).
- [x] Unit; worker; the full e2e alone at 5 workers (a failure rerun
      alone before it is called one); the benchmark; the entry chunk;
      `npm run test:sync-worker` (grows: list, vote, comment, a note).

Checks (2026-11-16): typecheck; unit and worker 5 318 passed, 2
skipped; full e2e alone at 5 workers (port 5450) 1 820 passed, 1
failed, 1 skipped: the one (phone own-keyboard-editors:660, the script
editor at 320 × 568, code untouched by this stage) passed alone 17 of
18 runs, an old flake, not this stage's; the benchmark as stage 64
(key → send playing 0.8 / 1.6 / 3.2 ms; burst 76 801 lines/s measured
right after a build at load 1.8, no frame over 50 ms; the game path
unchanged); entry chunk 31 366 → 31 382 bytes (+16: the Community
page's route); `test:sync-worker` 2/2 before it grew, then grown with the community
(a listed run, the guest's counter and view, a second account's stars
and comment, the reactions mark cleared, a note written and removed,
the run removed): 4/4, twice.

### E. Staging

- [x] Push `main`; `deploy.yml` to staging with migration 0006;
      `test:prod` against <https://staging.mumecockpit.com>; production's
      `/api/config` unchanged (`gallery`, `runes` off). No tag.
      (Run 43775755927, commit 67d46d77, `0006_community.sql` applied;
      the first run, 43775395006, stopped in `build:site`'s smoke test,
      which did not know the two flags: fixed, nothing had been deployed.
      `test:prod` 36/36 against staging; production's `/api/config`
      0.13.0's, without `gallery` and `runes`.)

### F. The community open in production (only on the owner's go-ahead)

- [ ] The owner has tested on staging and said yes.
- [ ] The release: version, tag, migration 0006, `FLAG_GALLERY` and
      `FLAG_RUNES` on in production; `test:prod` against mumecockpit.com.

## Test guide (owner)

On staging (<https://staging.mumecockpit.com>), with your test account
(A), a second account (B) and a private window (a guest). Desktop first,
then the phone.

1. **Publish to the Hall of Fame.** As A: History → a session → Export.
   The format row has Hall of Fame (F) after Link. EXPORT → "Publish to
   the Hall of Fame", "Everyone can find this in the Community.";
   Publish → the link with Copy, Open Community, Done. Open Community
   takes you to the page with your run first in the list.
2. **The Community page** (C on the start menu). The list on the left,
   newest first, about 10 a page, `‹ Page 1 of N ›` at its bottom right;
   press a column heading (or its letter) to sort by stars, views,
   comments, length, back to listed; press a sender's name for that
   account's runs. On the right: Run of the day (today's, with its
   description), Hall of Fame (top 8), Warlords with "N players on
   MUME", no source line, visible without scrolling. Under the list,
   Random Runes. No Published runs button, no foot line.
3. **The counter.** In the private window (a guest) the Community row
   says "1 new" after step 1; opening the page clears it; reload: gone.
   As B (another browser) the same, and it stays cleared on B's other
   devices.
4. **Watch, rate, comment.** As B open the run from the list: the watch
   page now sits in the start page's sky and frame, Back at the top
   left (it returns to the Community page; from a link it goes to the
   start page). Give stars in the band (change them; a click on your
   lit star takes the vote back). Write a comment under the replay;
   Remove it; write another. As a guest: "Log in to rate", "Log in to
   comment", the comments readable. On your own run as A: no stars to
   give, "your run", Remove on every comment.
5. **Reactions.** As A on the start menu: the owner row says "· 2 new"
   (B's vote and comment); pressing it opens Published runs (now a view
   of its own) with the run's stars, comments and what is new in gold;
   leave and come back: the mark is gone. Edit: the "Listed in the
   Community" switch (off → link only, it leaves the list; on → back,
   not on top of New again).
6. **Random Runes.** As B write a note (the field grows while you type;
   at most 250 characters; 5 a day); it shows whole under the list with
   your name; Remove it. As A report B's note (the four reasons).
7. **Reports and the admin.** As A report B's comment. `/admin` on
   staging: the queue has a Comment and a Note card with the whole text,
   "Reported by 1 account", Hide / Dismiss reports / Delete / Suspend.
   The mail for each report says "comment on …" / "note by …" with the
   text. Five reports hide an item only from accounts at least 7 days
   old (covered by tests).
8. **Phone.** The Community page with the tabs Runs · Hall of Fame ·
   Runes (Runs newest only, no sorting); the watch page in the frame;
   Hall of Fame in the export editor.
9. **`/privacy`** (optional now): the board and comments show the
   account name; we propose a short line there before production.

**Second look (after the feedback round, 2026-11-16; deploy run
43791543857, commit 694515c5; `test:prod` 36/36 against staging):**

10. **Share.** History says Share; the editor's button says Download
    (HTML, Text) or Share (Link, Hall of Fame).
11. **Published runs:** a run's title opens it; Back returns to
    Published runs.
12. **The watch page:** starts paused; no Download as HTML; no level;
    only Map, Timers and Group in the replay, all off until toggled.
13. **The Community page:** short headings (Run, Stars, Com., Views),
    "Title (Char)", Random Runes at the bottom (at most 40 %), the big
    "N players on MUME" at the top right, search (in the Run heading;
    `/` or F), the note field's "A note…".
14. **The phone:** the dashboard (players, the newest 5, All runs and
    Hall of Fame as sub-pages, Run of the day, Random Runes, Warlords).
15. **Freshness:** two windows (one private), as in your test: a note or
    a listing shows for the other at once on reload (the cause was the
    Worker's own 60-second copy; now every public write clears it).

**Third look (after feedback round 2, 2026-11-16):**

16. **Words:** everything shared is a *log*: the Log heading (key L),
    Log of the day, All logs, Published logs, Report this log, the share
    dialog and `/privacy`. History's own recordings stay *runs*.
17. **The watch page, wide** (desktop, tablet landscape; from 1000 px):
    the title, sender, stars, Report and comments in a column at the
    replay's right. Narrower (phones, small windows): on top as before.
18. **The watch page on a phone:** in portrait, Map alone (or any one
    pane) shows; Fullscreen is in the player menu (also on a 360 px
    phone; an iPhone fills the window instead, as before).
19. **The Community page:** "players online", not clipped at the top;
    Warlords 1–10; Random Runes says "Write a message…", no gold bar,
    each writer's name in its own colour (the same everywhere).
20. **Back** on the phone and the tablet: inside the window with air,
    a little smaller, the touch area as before.
21. **The start page:** no "N online" at the bottom right (still on
    `/admin`).

**Feedback wanted:** the Community page and the watch page in the frame
in real use (desktop and phone), the counter and the owner row's mark,
the board's length (250), anything that looked wrong; then yes or no to
opening the community in production.

**Known:** a new account's votes count in Top's order only from its
eighth day (by design, ADR 0155); the lists are cached up to a minute,
so a new run can take a minute to show for others.

## Owner feedback

2026-11-16, after the test on staging (night pass to follow; "Imorgon
vill jag vakna till en ny publicerad version"):

1. History's Export becomes **Share**; the editor's action button says
   **Download** (HTML, Text) or **Share** (Link, Hall of Fame); Export
   elsewhere follows.
2. Published runs: a press on a run opens it.
3. The watch page: no Download as HTML.
4. A Firefox private window logged in as another account showed one
   note on the board until it logged out; a guest's private window did
   not see a newly listed run after reloads and re-entering the page
   (a new private window did). To be found and fixed.
5. Random Runes at most about 30–50 % of the height under the list, at
   the bottom.
6. A run opened from the Community or a link starts **paused**.
7. "N players on MUME" out of the Warlords box: a large free-standing
   figure at the top right.
8. The phone: no tabs as the first view; a dashboard (the newest runs,
   Random Runes, Warlords, players on MUME); Hall of Fame and the full
   list on sub-pages or tabs.
9. A **search box** for runs.
10. Column headings short: Run, Stars, Com., Views.
11. No level: "the title (Char)"; the watch page without "Level NN".
12. The note field without "Write a note: everyone sees it with your
    name": empty or a sparse hint.
13. Shared runs (Hall of Fame, link, HTML export) carry only the panes
    **Map, Timers and Group**, all **off by default** in the replay.

**Built in the night pass (2026-11-16)**, by agents in worktrees W1–W4,
ADR 0155 "As built (stage 65, owner's feedback: W1 … W4)": all thirteen
points; point 4's cause was the Worker's own 60-second copy of the
public answers (a reload could not pass it); now the browser gets
`no-cache`, the copy is kept 60 s at most and a public write clears it.
Also: the shared replay's header without a level; `/privacy` rewritten
for what shared runs carry and a section "The community". A second
security review (`notes/research/stage65-security-review-2.md`: R2-1
search cost, R2-2 cache clearing, R2-3 the privacy words) and
`/code-review` high (ten findings): all fixed ("review fixes 2").

Checks after the round (2026-11-16): unit and worker 5 347 passed;
full e2e alone at 5 workers 1 837 passed, 2 failed under load: Firefox
lua-help:94 passed alone 6/6; import:148 (Firefox's drag-over class)
fails alone too, and fails as often on 6df5fe2f (before this stage, 4
of 10): an old flake, not this stage's; the benchmark (GPU) key → send
playing 0.8 / 1.1 / 3.5 ms, burst 79 303 lines/s, no frame over 50 ms;
entry chunk 31 362 bytes; `test:sync-worker` 6/6 (with the freshness
spec); staging deploy run 43791543857 (694515c5), `test:prod` 36/36.

### Feedback round 2 (2026-11-16)

1. Phone portrait, a published run: toggling only Map shows no map
   (Group+Map works; landscape fine).
2. Phone: no Fullscreen in a published run's player menu.
3. Wide windows (desktop, tablet landscape): the info at the top (name,
   sender, rating …) to the right of the log instead; as today on a
   phone or a window too narrow for it.
4. RUN → LOG everywhere: the concept is "shared logs".
5. Random Runes: "Write a message…", not "A note…".
6. The player count is clipped at the top on desktop.
7. Warlords 1–10, not 1–5.
8. Back sits on the border on the phone, on several start-menu pages:
   inside it with air, smaller if needed.
9. Random Runes: no yellow bar on some messages; each writer's account
   name in its own colour, a mix that suits the theme.
10. "players on MUME" → "players online".
11. Remove "N online" at the start page's bottom right (enough on
    `/admin`).

**Built (2026-11-16)** by three agents in worktrees (fb2-watch,
fb2-community, fb2-chrome); ADR 0155 "As built — feedback round 2"
(watch page, community page, start-menu chrome). Causes: (1) the
player's layout collapsed a side dock whose stored lanes did not fit a
60-column portrait grid; a player now squeezes a dock to its minimum
before collapsing it (`squeezeSides`, the live game unchanged). (2) A
narrow (360 px) player box dropped Fullscreen together with To the
start; it now drops To the start first. (6) A negative top margin in a
clipping column. (8) Back was stretched upward to 40/44 px for a finger
and so lay on the frame; it is now drawn inside the window (28 px phone,
30 px tablet) with an invisible touch area over the frame. The tablet
had the same flaw and is fixed too. (11) The almanac line and its
client code are gone; the guests' Community counter still reads
`/api/stats/public`, now only with `gallery` and `share` on.

Checks: an independent review of the diff found nothing; unit 5 350
passed; full e2e alone at 5 workers 1 838 passed, 2 failed:
phone-scripts-menu:87 still measured Back's drawn height (fixed to
check the 40 px touch area, 3/3), profile-place:444 passed alone 3/3;
entry chunk 31 362 bytes; `test:sync-worker` 6/6.
