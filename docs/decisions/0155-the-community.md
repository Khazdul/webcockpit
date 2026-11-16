# 0155 — The community: listing, votes, comments, the counters, Random Runes

- Status: Accepted (planned 2026-11-15, stage 65; part B built 2026-11-15).
- Date: 2026-11-15
- Related: spec §7.0, §7.7, §7.8, §7.9, §7.10, §7.11, §7.12 (65);
  ADR 0148 with its addenda (the gallery, the word Community, Hall of
  Fame, the counter, reactions, Random Runes); ADR 0154 with every "As
  built" (publications, reports, text rules, the mail, the admin's
  tools); ADR 0147 (the device id, the hashed address, flags).

## Context

Stage 64 built unlisted links. Stage 65 lists them: the Community page
(Hall of Fame, the list with its sorts, Random Runes), stars and
comments on the watch page, the counter on the menu's Community row,
the reactions mark on the owner row, Published runs as a view of its
own, and reports and the admin's tools for comments and notes. The
owner's decisions are in spec §7.8 and ADR 0148's addendum; this ADR
records how. Free public text (comments, notes) and public rankings
(Top, Most watched, top posters) are new kinds of target, so the
abuse rules are decided here too.

## Decision

### Flags

- `gallery` (the word stays) opens listing, the Community page, stars,
  comments, the counter and the reactions mark; `runes` opens Random
  Runes alone. Both in `FLAG_NAMES`; `FLAG_GALLERY` and `FLAG_RUNES`
  true on staging, false in production (`wrangler.jsonc`). `gallery`
  needs `share` and `accounts` on the client side; `runes` needs
  `gallery` (the board lives on its page).
- Off, every new path answers `404 not_found` (as `share`), `POST
  /api/u/pub` and `PATCH` refuse `listed: true` (`400`), and the public
  meta carries no stars or comments. The moderation endpoints stay open
  (the owner cleans up with the flags off).

### Data (migration `0006_community.sql`, additive)

- `publication`: `listed_at` (the first time the run was listed; set
  once, kept when it is unlisted and listed again, so toggling never
  brings an old run back to the top of New or the counter), `top_sum`
  and `top_count` (the votes that rank, below). `vote_sum`, `vote_count`
  and `comment_count` exist since 0005. An index `(state, listed,
  listed_at)` for the lists.
- `vote(publication, account, stars, created, updated, ranks)`, primary
  key `(publication, account)`; index `(account)` (deletion,
  suspension), `(publication, updated)` (reactions).
- `comment(id, publication, account, text, created, state,
  hidden_reason, reviewed)`; `id` 12 characters as a run's; index
  `(publication, created)`, `(account, created)`.
- `note(id, account, text, created, state, hidden_reason, reviewed)`;
  index `(state, created)`, `(account, created)`.
- `account.reactions_seen` (0005 has `gallery_seen`).
- `pub_view` gains rows keyed by the hashed address (below); no schema
  change.

### Listing (Hall of Fame)

- `PubMetaIn.listed` and `PubPatch.listed` take `true` with `gallery`
  on. The first listing sets `listed_at`. **At most 10 listings a day
  per account** (UTC day, held in the statement, `429 too_many`), so one
  account cannot fill New; the 150 ceiling is unchanged. A hidden run
  cannot be listed (`403 hidden`, as its PATCH).
- The rules' tick of stage 64 covers listing (one tick per account).

### The list: `GET /api/gallery?sort=top|new|watched&period=week|month|all&page=N`

- Public, pages of 30, `page` 1–34 (1 000 runs deep), at most the
  active, listed runs; a page past the end is empty. Each row: id,
  title, sender, character, level, length, `listed_at`, views, stars
  (`sum`, `count`), comments. The period filters on `listed_at`.
- **Top** orders by `(C·m + top_sum) / (C + top_count)` with `C = 5`
  (ADR 0148) and `m` the mean of all ranking votes on listed active
  runs (3 when there are none), then `top_count`, then `listed_at`.
  **New** by `listed_at`; **Most watched** by `views`, then `listed_at`.
- Cached 60 s: the Worker keeps the answer in the Cache API
  (`caches.default`) under the normalised URL (unknown parameters
  dropped, defaults filled), so a burst of visitors reads D1 once a
  minute per variant; the browser gets `public, max-age=60`. `m` is
  read in the same query (a scan of listed runs; small for years).

### Votes and why Top is not cheap to move

- `PUT /api/u/pub/<id>/vote {stars: 1–5}`; `DELETE` takes one's vote
  back. Not on one's own run (`403 own`), not on a hidden run
  (`404`), not when suspended. 60 an hour per account (counted on
  `vote.updated`, held in the statement). The answer is the run's new
  `stars`; `GET /api/u/pub/<id>/vote` gives one's own (or null).
- **Two sums.** `vote_sum`/`vote_count` (shown everywhere) count every
  live vote. `top_sum`/`top_count` (Top's order only) count a vote only
  when its account was **at least 7 days old when the vote was cast or
  last changed** (`vote.ranks`, fixed at the write, so the sums stay
  incremental). Registration is Turnstile plus 3 an hour and 10 a day
  per address; ranking votes therefore cost a farm of accounts made a
  week ahead, which the 5-vote prior and the admin's tools absorb at
  our size. The player never sees the difference except in Top's order.
- **Suspension and deletion** take an account's votes out of both sums
  of every run it voted on (one batch: the account's votes are bounded
  by 60 an hour), deletion also deletes the rows; Restore puts a
  suspended account's votes back. So a sock-puppet farm, once found,
  is undone by suspending or deleting it.
- Every sum update is `x = x ± ?` inside the batch that writes the vote,
  so parallel votes never lose one; a test fires them in parallel and
  recounts.

### Views and Most watched

- Stage 64 counts a view once per device and UTC day; the device id is
  made by the client, so a script could mint ids. From stage 65 a view
  counts only when neither the device nor the request's **hashed
  address** (the registration limits' daily-peppered hash, an IPv6 /64
  as one) has viewed that run that day: a second `pub_view` row keyed
  `a:<hash>`. Inflating Most watched then needs many addresses.

### Comments

- `GET /api/pub/<id>/comments?page=N` (public, pages of 50, oldest
  first, so "newest last"; the last page first when the client asks
  `page=last`); hidden and removed comments are not in it.
- `POST /api/u/pub/<id>/comments {text}` → the comment. Plain text, 1–
  1 000 code points after trimming, the text rules below with `\n`
  allowed (at most 20 line breaks). 20 an hour per account; at most
  1 000 visible comments per run (`409 full`). Not on a hidden run.
  Logged in, not suspended; one's own run is allowed.
- `DELETE /api/u/comments/<id>`: the writer or the run's sender; the row
  is deleted (no tombstone text kept), `comment_count` follows.
- A removed or deleted run deletes its comments and votes in the same
  batch as its tombstone.

### The text rules for free public text

`shared/cloud/text.ts` (stage 64) grows one checker for comments and
notes, used by the Worker and by the client's cleaner:

- Stage 64's rules (NFC, no C0/C1 but `\n` where allowed, no lone
  surrogates, no bidi controls), plus no invisible characters that hide
  or smuggle text: U+00AD, U+034F, U+061C, U+115F, U+1160, U+17B4,
  U+17B5, U+180B–U+180F, U+200B–U+200F, U+2060–U+2064, U+3164, U+FEFF,
  U+FFA0, U+E0000–U+E007F (tags). Variation selectors and ZWJ stay
  (emoji).
- At most 3 combining marks after one base character (no "Zalgo" tower
  over the rows above).
- The client cleans as the player types; the Worker refuses (`400
  bad_text`), never silently changes.
- Rendered as text only, never linkified (no clickable links in public
  text: no phishing through the site), with `overflow-wrap: anywhere`
  so one long word cannot widen the page.

### Random Runes: `GET /api/runes`, `POST /api/u/runes`, `DELETE /api/u/runes/<id>`

- The board is the latest 50 visible notes, newest first, each with the
  writer's name and time; public, cached 60 s as the list (the writer's
  own note is put in by the client from the POST's answer at once).
- A note: one line (no `\n`), 1–500 code points, the rules above. 5 a
  day per account (UTC day, held in the statement), not when suspended.
  The writer removes their own (the row goes).
- The daily cron deletes notes older than 30 days, except hidden ones
  still in the admin's queue (they go when he acts on them).
- Behind `runes` (and `gallery`).

### The counter and the reactions mark

- **Guests:** `GET /api/stats/public` gains `listed: number[]`, the
  `listed_at` of the 99 newest active listed runs (newest first). The
  client counts those newer than the device's `wc.communitySeen`
  (localStorage, set when the Community page opens, to the newest time
  it showed). No extra request, as decided.
- **Logged in:** `GET /api/u/community/news` → `{runs, reactions,
  newestRun, newestReaction}`: listed active runs with `listed_at >
  gallery_seen` and another sender; votes (`updated`) and comments
  (`created`) on the account's own active runs after `reactions_seen`,
  by other accounts. Each count capped at 99. Asked with the sync's
  cadence (on the start page, when the tab becomes visible, every 5
  minutes), never in the game path.
- `POST /api/u/community/seen {gallery?: t, reactions?: t}` sets each to
  `max(old, min(t, now))`: the client sends the newest time it showed,
  so a run published while the page was open still counts. The menu
  shows "N new" (99 at most, then "99+"); the owner row "<name> ·
  synced · N new".
- The `galleryNotice` pref is removed from the contract and the client;
  the Worker accepts and ignores the key (cached old clients) and no
  longer returns it.

### Hall of Fame boxes: `GET /api/community`

- Public, cached 60 s: `topPosters` (the 5 accounts with most active
  listed runs, with the count), `hallOfFame` (Top's first 8 for all
  time), `today` and `yesterday` (the random run of the day: among the
  runs listed before that UTC day began, the one whose id has the
  smallest HMAC-SHA-256 under `AUTH_PEPPER` and the day, so it is fixed
  for the day and not guessable ahead), and `mume` when the MUME data
  is allowed and fetched (below; otherwise absent).
- `GET /api/gallery/random` → one random listed active id ("show
  another"); not cached.

### MUME's lists and player count

Owner, 2026-11-15, after the investigation
(`notes/research/mume-war-lists.md`): fetch without asking first; show
the lists **without a source line or time** on the page.

- **Warlords:** the 5-minute cron fetches `https://mume.org/news/war` at
  most every 15 minutes (`User-Agent: WebCockpit (+https://mumecockpit.com)`,
  a 10 s timeout, at most 256 KB read), parses `table.warlords` into
  plain strings (name, race, class; the top 10 a side, the page shows the
  first five or ten as the mockups decide; every value through the text
  rules, at most 40 code points, no HTML passes on) and keeps the last
  good answer in D1 (`flag`-like key/value row, below). A failed or
  changed page keeps the last good lists for up to 24 hours, then the
  box is not drawn.
- **Players on MUME:** one MSSP probe (`connect()` to mume.org:4242,
  telnet `IAC DO MSSP`, read the `PLAYERS` variable, close; 5 s, 8 KB)
  with the same cadence. Tried once on staging first: if MUME does not
  fill `PLAYERS`, the probe is switched off and the line is not drawn.
- `GET /api/community` carries `mume: {west, dark, players?}` when it
  has them. No source or time is shown (owner); we stop at once if MUME
  asks us to.
- Stored in a table `mume_cache(key, value, fetched)` of migration 0006.

### Reports, hiding and the admin

- `REPORT_KINDS_OPEN` becomes `run`, `comment`, `note`. The five that
  hide, the `reviewed` rule (S3), one per account and item, 30 a day,
  not one's own: as for runs. A hidden comment or note disappears for
  everyone (its writer too; the admin sees it).
- `GET /api/admin/reports` lists comments and notes beside runs:
  `kind`, the text, the writer, for a comment the run's id and title.
  `POST /api/admin/comment/<id>` and `/api/admin/note/<id>` with
  `hide`, `restore`, `dismiss`, `delete` (the same meaning as a run's),
  in `admin_log` as `comment.<action>` / `note.<action>`.
- **The mail** (`worker/mail.ts`) covers all three kinds: the subject
  `WebCockpit report: comment on "<title>"` / `note by <name>`; the
  body has the kind, the reported text in full, its writer, the run
  for a comment, and the admin link. The 20-an-hour cap is shared.
- Delete account deletes the account's votes (sums adjusted), comments
  (counts adjusted) and notes, and its reports as stage 64.

### Limits

Spec §7.10's rows hold: comments 20 and votes 60 an hour, notes 5 a day,
reports 30 a day; plus listings 10 a day and 1 000 comments per run.
They live in `DEFAULT_ACCOUNT_LIMITS` and the account's `limits` as the
others (new fields `commentsPerHour`, `votesPerHour`, `notesPerDay`,
`listingsPerDay`), so the owner changes them without a release.

### The client (shape; the mockups decide the look)

- The Community page in the lazy chrome chunk (as the watch page),
  reached by C from the start menu; Published runs as a view of its own
  of the Account page; stars and comments in the watch page; Hall of
  Fame in the export editor's format toggle and the share dialog's
  listed form. No new request on the game path; the entry chunk grows
  by the counter's reading at most.

## Alternatives

- **Top over all votes, no age rule.** Five accounts made in an
  afternoon would top the list. The age rule costs nothing visible.
- **Votes only after watching** (a view row of the voter). Cheap to
  fake (the view is a public POST) and annoying on a slow phone.
- **A per-request aggregate of votes** instead of stored sums: exact
  under suspension without a batch, but reads every vote on every
  uncached list request (D1's free reads per day).
- **Links in comments made clickable.** Convenient, and the first tool
  of a spammer on a site that shows strangers' text.
- **Threads and answers on the board.** Not wanted (owner).

## Consequences

- Moderation now covers three kinds of item; the queue and the mail
  carry all of them. Free text is still read by the owner after the
  fact (ADR 0148): the rules here bound it, they do not judge it.
- A new account's votes show at once but move Top only from its eighth
  day.
- The guest's counter reads 99 times from a cached public answer;
  beyond 99 it says "99+".

## As built (stage 65 B)

The Worker part (branch `stage65-worker`), as decided above, with these
details and deviations. The contract's comments in `shared/cloud/api.ts`
("The community") have the exact answers; the code is
`worker/community.ts` beside the stage 64 files it extends.

- **Flags.** Every community path needs `share` and `gallery`; Random
  Runes `runes` as well (`share` too, since `gallery` needs it). The
  moderation endpoints are behind none. `FLAG_GALLERY`/`FLAG_RUNES`:
  staging true, production false.
- **`galleryNotice`.** Out of the contract, but the Worker still sends
  `galleryNotice: true` in `prefs`: the 0.13 client refuses prefs without
  it, and a cached 0.13 client must keep working. A PATCH with it is
  accepted and ignored. The client reads prefs without it (a minimal
  change in `src/cloud/account/api.ts` and `flows.ts`, so the typecheck
  holds); part C3 removes what is left.
- **New limits** (`commentsPerHour` 20, `votesPerHour` 60, `notesPerDay`
  5, `listingsPerDay` 10) are in `AccountLimits`; the client fills them
  from the defaults when an older Worker leaves them out (`parseAccount`)
  and `/api/config` passes them on when sent.
- **Listing.** `listingsPerDay` counts *first* listings: runs of the
  account whose `listed_at` falls in the UTC day (removed ones too, so
  publish-and-remove does not reset it). Unlisting and listing again keep
  `listed_at` and are free. Held in the POST's reservation insert and in
  the PATCH's update (`429 too_many`). A pending row already carries
  `listed`/`listed_at`; the lists show only `active` rows.
- **The list.** `sort`, `period` and `page` outside their lists → `400`
  (`page` must be 1–34 without leading zeros); unknown parameters are
  ignored. Top: `(5·m + top_sum) / (5 + top_count)` with `m` one scalar
  subquery per query, then `top_count`, then `listed_at`, then the id.
  Ties everywhere end on the id.
- **The cache.** `Deps.cache` (worker/index.ts hands over
  `caches.default`); the static server and the tests have none, so every
  request reads D1 there. Keys: `<origin>/api/gallery?sort=…&period=…&page=…`
  (normalised), `<origin>/api/community`, `<origin>/api/runes`; only a 200
  is kept, a cache that throws is no cache. `GET /api/stats/public` is not
  in the Cache API (the browser's `max-age=60` as before).
- **`GET /api/stats/public`** answers when `stats` **or** `gallery` is on:
  with `stats` off, `online` and `playing` are 0 (the client shows "N
  online" only with `stats` on), so the guests' counter works in
  production even while `stats` is dark there. `listed` only with
  `gallery`.
- **The run of the day** is the smallest `HMAC-SHA-256(AUTH_PEPPER,
  "wc-day-run|<day>|<id>")` among the active listed runs listed before
  the day began (SHA-256 without the secret). `topPosters` ties on the
  name. MUME: `mume_cache` rows `war` (`{west, dark}` JSON) and `players`
  (a JSON number), each shown only while `fetched` is under 24 h old;
  `players` only beside the lists; a row that does not parse is absent.
- **Votes.** The three statements of a PUT (old share out, the upsert,
  new share in) share one guard that none of them changes: the account
  active, the run active and another's, and the account's *other* votes
  with `updated` in the last hour under `votesPerHour`. So the limit is
  per run voted on in the hour (changing one vote again is not a new
  one), and a batch applies whole or not at all. `ranks` is the account's
  age at the write (`account.created`). `DELETE` works on an active or
  hidden run, and is `403 suspended` for a suspended account (its votes
  are out of the sums already). Votes and comments are allowed on
  link-only runs too. Index `vote_account` is `(account, updated)`
  (serves deletion, suspension and the hourly count).
- **Suspend/Restore** move the votes in the same batch as the state, each
  only on a real change (`(SELECT state …) = from`), so a repeat does
  nothing. Delete account takes the votes out only when the account is
  not suspended, then deletes them; the sums are recounted in the tests.
- **A removed comment or note keeps its row without text** (`state
  'removed'`, `text ''`) for its limit: an hour for a comment, the rest of
  the UTC day for a note; the daily cron deletes it then. Deleting the row
  at once (as decided) would let a writer post, remove and post again
  past the limit. No text is kept, as decided. The admin's Delete and
  Delete account delete the rows.
- **Comments.** `page` defaults to `last`; `pages` is at least 1; the
  total is `comment_count`. A hidden run's comments answer `451`. The
  1 000 a run is `comment_count` (visible ones) in the insert; a comment
  hidden by reports or the admin leaves the count, Restore puts it back.
- **Text rules** (`isPublicText`, `cleanPublicText` in
  `shared/cloud/text.ts`): as decided, plus U+2028/U+2029 and U+FFF9–
  U+FFFB refused; `\r` is a control character (the cleaner turns CRLF and
  CR into `\n`); the Worker wants the text trimmed (refused, not trimmed)
  and NFC; the cleaner does not trim (the player may be typing), cuts a
  tower to three marks and turns the breaks past the limit into spaces.
- **Views.** The address row is `a:` + the registration counters' hash
  (`addressHash`, HMAC under the day's pepper of the address key; an IPv6
  /64 is one). Without AUTH_PEPPER the device alone counts.
- **Reports.** `comment` and `note` targets are 12-character ids; one's
  own is `403 own`; removed ones `404`. With `gallery` off `comment` is
  `kind_closed`, with `runes` off `note` too. The queue merges runs,
  comments and notes (most reporters, then newest; 200 at most) and adds
  `content` (the text) and, for a comment, `pub`; `title` is the run's
  (`''` for a note), `sender` the writer. `POST /api/admin/comment|note/<id>`:
  `hide` sets `hidden_reason 'admin'`; `delete` deletes the row; a removed
  or unknown item `404`.
- **The mail.** A comment: subject `WebCockpit report: comment on
  "<title>"`, a note: `WebCockpit report: note by <name>`; the body has
  the kind, the id, the writer, the run (title and id) for a comment, the
  reason, the counts, whether hidden, the reported text in full, the
  reporter's text, `/admin` and the run's `?admin` link. The same cap.
- **The cron** (daily): notes past 30 days go (their reports handled)
  unless hidden with open reports; removed rows as above.
- **The e2e fake.** `tests/e2e/cloud-account-fake.ts` has a marked block
  "The community (stage 65 B)": every new path, listing, `MyPub`'s new
  fields, `listed` on `/api/stats/public` (with `gallery` on), seeds
  (`addPub(name, {listed, listedAt})`, `addVote`, `addComment`,
  `addNote`, `mume`), `communityOffline`. Not modelled: reports of
  comments and notes (the pub fake answers run reports only).
- **Tests:** `worker/test/community.test.ts` (16), `votes.test.ts` (10),
  `comments.test.ts` (12), `runes.test.ts` (7), `mail.test.ts` (3 new),
  `tests/unit/public-text.test.ts` (6), `tests/unit/community-fake.test.ts`
  (1); stage 64's tests adjusted (the new fields, views per address, the
  flags in `/api/config`). Worker 268, unit and worker together 5 220.

## As built (stage 65 C5)

- **The live probe (2026-11-15, once, from the developer's machine):**
  mume.org:4242 sent `IAC WILL MSSP` in its greeting and, to one
  `IAC DO MSSP`, a single subnegotiation with `NAME`, `PLAYERS` (34),
  `PLAYERS WAR` (120), `UPTIME`, `CHARSET`, `CODEBASE`, `CRAWL DELAY` (-1),
  `CREATED`, `DISCORD`, `HOSTNAME`, `ICON`, `IP`, `LANGUAGE`, `LOCATION`,
  `PORT`, `SSL`, `WEBSOCKET`, `WEBSITE`, the genre and gameplay fields,
  the counts (`AREAS`, `HELPFILES`, `MOBILES`, `OBJECTS`, `ROOMS`,
  `CLASSES`, `LEVELS`, `RACES`, `SKILLS`), the protocol flags and the
  game date. **MUME fills `PLAYERS`**, so the probe is on. `PLAYERS WAR`
  is not used. The bytes up to `IAC SE` are the test fixture
  (`worker/test/fixtures/mume-mssp.ts`, the login screen after them cut),
  and a copy of the war page is `worker/test/fixtures/mume-war.html`.
  The staging try of the decision still stands before production.
- **The parse** (`worker/mume.ts`) is a small tokenizer of its own, not
  HTMLRewriter: the router imports the cron's modules and also runs
  under Node (`scripts/static-server.ts`), and one parser in both is
  easier to trust. It drops comments, doctypes and the content of
  `script`, `style` and the other raw text elements, finds the first
  `table` whose class list holds `warlords`, and wants a header row of
  eight `th` reading Rank, Name, Race, Class twice, then 1–20 rows of
  eight cells with numeric ranks (an empty side is allowed; ten a side
  are kept). Anything else, a nested table or a table that never ends
  is `null`. Each value: entities decoded (the Latin-1 names, a few
  more, numeric references; a bad one is U+FFFD), whitespace collapsed,
  `cleanText`, `<` and `>` removed, trimmed, cut to 40 code points.
- **The probe** sends `IAC DO MSSP` at once and nothing else (it does
  not answer MUME's other telnet requests), reads until the first
  complete `IAC SB MSSP … IAC SE` (8 KB, 5 s) and closes the socket in
  every case. `connect()` of `cloudflare:sockets` reaches it as
  `Deps.connect`, handed over by `worker/index.ts` like `emailMessage`.
- **The cache:** rows `warlords` (JSON `{west, dark}`) and `players`
  (JSON number) carry `fetched` = their last good answer; a third row
  `attempt` carries the last try, which sets the 15-minute cadence
  (a minute's slack for the 5-minute cron) whether the try went well or
  not. A failure writes nothing else, so the last good answers stay.
  `refreshMume` runs last in the 5-minute cron, skips while
  `mume_cache` does not exist, and never throws.
- **Reading:** `readMume(db, now)` gives `/api/community` its `mume`:
  the lists while under 24 hours old (re-checked on the way out),
  `players` beside them only while under **35 minutes** old (two missed
  probes; a day-old count would mislead, the decision named no limit
  for it), and nothing without good lists.
- **Deviations:** `fetchWarlords(fetch, {timeoutMs})` takes no clock
  (it needs none); there is no flag to stop the fetch or the probe
  without a release yet (the decision's "we stop at once" is a deploy
  that drops the call from `runCron`).

## As built (stage 65 C4)

The admin page's queue for comments and notes (`worker/admin/page.ts`,
branch `stage65-admin`), round 13's point 7 as drawn, in the same three
files under the same CSP, every text from the API by `textContent`:

- **A kind tag on every card** (Run, Comment, Note). A comment's card:
  `on "<run title>"`, its whole text as a quote (line breaks kept), `by
  <writer> · <id> · on the run <run id>`, the state, the reasons with
  counts, "Reported by N accounts" (the count only, as the owner picked:
  never names) with the newest report's time, its text; **Open run** to
  `/r/<run>?admin` in a new tab. A note's card the same with `on Random
  Runes` and no link. No per-item meta read (a run's card still reads
  `/api/admin/pub/<id>`).
- **Actions**: Hide or Restore by state, Delete, Dismiss reports (the API's
  own `dismiss` here, unlike a run's stage 64 card), Suspend <writer> (the
  account action). Each asks in the page's modal with the text quoted,
  the writer and run, what happens to the run's comment count, the
  reports handled, and the optional log note; Delete needs no typed id.
  Posts go to `/api/admin/comment|note/<id>` with `X-WC: 1`.
- **The header** counts by kind: "13 open on 3 items · 1 run, 1 comment,
  1 note" (one kind alone keeps stage 64's "8 open on 2 runs"). The log
  names `comment <id>` and `note <id>`.
- **Community figures**: `GET /api/admin/reports` adds `community`
  (`listed`, `comments`, `notes`, `votes`; optional in the contract). Read
  without scanning votes or comments: the sums of `comment_count` and
  `vote_count` and the listed count in the same `publication` pass as
  `pubs`, notes by `COUNT` on `note_state`. The section shows only when
  the field is sent. Not built from the mockup: Hidden, the "Today" line,
  a comment's time and the writer's account age (no API for them).
- **Tests**: `tests/unit/admin-page.test.ts` (5 new: hostile texts and
  names as text, the counts, every action's path and body, the Delete
  modal, the log), `worker/test/admin.test.ts` (1 new: the totals, removed
  runs and notes left out).

## Addendum (owner, round 13, 2026-11-15): the page as picked

The owner's picks (`docs/stages/65-community.md`, "Owner's picks")
change the client and, in small ways, the Worker (built in part C1):

- **The list** opens on New; sorting is by a press on a column heading
  (desktop, tablet): New (listed), Top (stars), Most watched (views),
  and also Comments and Length; the phone shows New only. No period
  control (the API keeps `period`; the client sends `all`). **Pages of
  10** (`GALLERY_PAGE` 10, `page` up to 100).
- **A sender's runs:** `GET /api/gallery?by=<name>` (the same rows,
  that account's listed active runs, New first, pages of 10; an
  unknown or deleted name gives an empty list, never an error that tells
  whether the name exists).
- **`GET /api/community`** loses `topPosters` and `yesterday`; `today`
  carries the run's description (cut to 300 code points). `GET
  /api/gallery/random` goes.
- **Notes** are at most **250** code points (`NOTE_MAX`); the board
  shows each whole.
- **The watch page** sits inside the start page's sky and frame, Back
  at the top left (the stage 64 page too).

## As built (stage 65 C3)

Hall of Fame in the export editor and the share dialog, Published runs as a
view of its own, the owner row's reactions mark (branch
`stage65-published`), round 13's picks 4, 5 and 6 as drawn.

- **The news module** (`src/cloud/community/news.ts`, made here; C1 reads
  the same module for the Community row's count): `GET
  /api/u/community/news` → `{runs, reactions, newestRun, newestReaction}`,
  checked against the contract and capped at 99. `refreshCommunityNews()`
  (one request at a time, the last answer kept on a failure),
  `communityNews()`, `onCommunityNews(fn)`, `watchCommunityNews()` (the
  cadence, reference counted: at once, every 5 minutes, when the tab becomes
  visible, when the start page is the view again after a game; never while
  `isPlaying()`) and `markCommunitySeen({gallery?, reactions?})` (`POST
  …/seen` with `X-WC`; the counts it covers are cleared locally at once).
  Asked only with the API allowed, `accounts`, `share` and `gallery` on and
  somebody logged in here. It imports no value of `shared/cloud/api.ts`
  (`NEWS_CAP` written out, a unit test holds it to `NEWS_MAX`), so the
  chrome chunk does not load the contract. **The entry chunk is unchanged**
  (31 378 bytes, the same as `main` with B and C5; the same chunk set).
- **The owner row**: the start menu watches the news while somebody is
  logged in; `ownerRow({…, news})` shows "· N new" in gold, "99+ new" at the
  cap (`communityCount`, also the Community row's). With news, `opens` is
  `published`: a press loads the account chunk and pushes the Published runs
  view straight away (`accountEntry(true, 'published')`); its Back returns
  to the menu.
- **Hall of Fame in the export editor**: the fourth option (F, the kit's
  `star`), shown when `gallery` is on as well as `accounts` and `share`;
  greyed for a guest as Link ("Log in to publish", the tip and the flash);
  in the keyboard's ring after Link; a choice of the visit as Link
  (`data-format="hof"`, the doc's `format` untouched). On a phone the four
  labels may take two lines so the row still fits.
- **The share dialog's listed form** (`listed` prop): the title "Publish to
  the Hall of Fame", the line "Everyone can find this in the Community." with
  a gold star and the note under it, Publish (`PUBLISH`), the POST's meta
  `listed: true` (`linkMeta({listed})`), the rules' tick as stage 64. The
  result "Published", the link with Copy, **Open Community** and Done. The
  10-a-day refusal (`429 too_many`, the client's new code `too_many`; `403
  hidden` is `hidden`) says "You have listed 10 runs today, the most a day.
  Choose Link now, and list it tomorrow under Published runs." (the
  account's `listingsPerDay`) and Publish stays off.
- **Open Community** pops the stack to the start menu and leaves a request
  (`src/chrome/frames/start-request.ts`, `requestStartRow('community')`);
  the menu takes it when it is the top frame again, puts its cursor on the
  row and activates it as a press would. So whatever C1 wires to the
  Community row opens; with no row (the flag off) the request is dropped.
  The button is there only where the editor stands on the start page
  (`useLookPlace() === 'start'`). The dialog's letters (U, M) are drawn but,
  as stage 64's, not pressed by key: the dialog's form ring owns the keys.
- **Published runs** (`account/published.tsx`): with `gallery` off stage
  64's section is unchanged (its specs untouched). With `gallery` on the
  Account page has one row, "4 runs · 2 listed · 475 views · 2 new" (the new
  reactions of the list's `news`, gold) and Published runs (U); with no runs
  "None yet. In History, Export a session and choose Link or Hall of Fame."
  and no button. The view (`PublishedFrame`, a page of its own over the
  Account page) has the head "4 of 150 · 6.1 MB, not counted against your
  50 MB · 2 new since you last looked" (stage 64's foot line is dropped: the
  head says it), each run's title, a Listed / Link only chip, the stars
  (the kit's `Stars`, the mean to a tenth, votes), the comment count (the
  kit's `comment` glyph), views (as words: the kit has no eye), date and
  size, the new ones in gold with a gold left edge; the hidden note; Copy,
  Edit, Remove; the empty line. Its keyboard ring is the rows' buttons.
- **Seen.** Opening the view asks the news first, then the list, then posts
  `seen {reactions: newestReaction}`, so everything marked seen was in the
  list that was shown (a reaction arriving between the two shows again next
  time, never the other way round). What was new at opening is kept by id
  and shown until the view closes, also after an Edit or Remove asks the
  list again; closing it makes the Account page ask its row again.
- **Edit** in the view has the switch "Listed in the Community" (the kit's
  `Toggle`, in the dialog's ring after the description) and "Off: only
  people with the link can watch it. The stars and comments stay."; only
  what changed goes in the PATCH. `429` says "You have listed as many runs
  as you may today. List it tomorrow; turn the switch off to save the rest
  now."; `403 hidden` has its line.
- **Words chosen here** (the mockup says "1 star · 1 comment new"): "1 vote
  · 1 comment new", since a "star" next to "12 votes" reads as a rating.
- **`galleryNotice`** is gone from the client (the comments in
  `src/cloud/account`, the Account page's note); the account client drops
  unknown prefs keys, so the Worker's legacy key is ignored.
- **Tests:** unit `community-news.test.ts` (7: the answer, one request, the
  failures, nothing while off, seen with X-WC and the local clear, the
  cadence with a game and two watchers), `cloud-pub-api.test.ts` (+3:
  listed in the POST, PATCH listed, too_many and hidden, the new fields),
  `start-menu-model.test.ts` (99+, `opens: 'published'`); e2e
  `hall-of-fame.spec.ts` (6 × Chromium and Firefox), `published-runs.spec.ts`
  (5 × 2), `phone-hall-of-fame.spec.ts` (3), helpers in `community-pub.ts`.
  The test of Open Community uses the dev `?community=0` row until C1's page
  is merged (then the row is there with `gallery` and the test still holds).

## As built (stage 65 C1)

The Community page and its counter (branch `stage65-community`), as the
round 13 addendum decided, with these details.

- **The Worker (the addendum's part).** `GALLERY_SORTS` is `new` (the
  default), `top`, `watched`, `comments` (then the newer `listedAt`) and
  `length` (longest first, then the newer); pages of 10, `page` 1–100.
  `GalleryPage.total` is new (the runs of the list over every page, at most
  1 000): the pager says "Page 1 of N", which `more` alone cannot. `by=<name>`
  matches the name without regard to case (`name_key`); a name that is not
  a valid name, unknown or deleted gives an empty list (200, `total` 0); the
  cache keeps it under the lowercase. `GET /api/community` is
  `{hallOfFame, today, mume?, time}`: `today` is a `DayRun` (the row and its
  description cut to `DAY_RUN_DESCRIPTION_MAX` = 300 code points), `mume`
  is C5's `readMume` (the stage B reader `mumeOf` is gone). `GET
  /api/gallery/random` is gone (404 with the other unknown paths). `NOTE_MAX`
  250. `TOP_POSTERS` and `GalleryRandom` left the contract.
- **The client.** `src/cloud/community/api.ts` (list, boxes, board, a note,
  its removal, its report): as the other clients (never rejects, the flags
  first: `share` and `gallery` for every read, `runes` for the board,
  `accounts` too for `/api/u/`; `X-WC: 1` on writes; the public reads
  without the cookie; every answer checked). The counts and `seen` are C3's
  `news.ts` only (no second news request). The page
  (`src/chrome/frames/community.tsx`, `community-model.ts`,
  `community.css`, class prefix `wc-cy-`: `wc-cm-` is the comm pane's)
  **lives in the account pages' chunk** (`account/index.tsx` exports
  `openCommunity`), as the share dialog does (ADR 0154): as a chunk of its
  own it split the kit and the account's state out of the start page's
  chunks (six more names in the entry's preload map, +263 bytes). Entry
  chunk: 31 378 (main with C3) → 31 362 bytes; the chunk set is the same
  files. A guest who opens the page loads the account chunk (about 126 KB).
- **The look.** 1b as changed: the list (rank under Top only; title and
  "(Character Llevel)", then sender · length · listed date; stars with the
  mean and votes; comments; views) on the left with the pager at its foot,
  right; Random Runes under it, taking the rest of the height (the left
  side scrolls when the window is short); the column (330 px, 270 under
  1 040 px of content) holds Run of the day (title, character, sender,
  date, the description clamped to three lines), Hall of Fame (8; a press
  opens the run) and Warlords (5 a side, "N players on MUME" when sent; no
  source or time). A box is drawn only with data. At 1 440 × 900 the
  column does not scroll (the spec checks it). The headings: "Title
  (character) · Sender · **Length** · **Listed**", **Stars · votes**,
  **Com.**, **Views**; a press or the marked letter (E L S M V) sorts, the
  current one ▾; under 1 040 px of content the first heading's words go and
  Length · Listed stay. ↑ ↓ Home End move the row cursor, Enter opens, ← →
  (PgUp PgDn) change page, R opens the cursor's sender's runs, W the note
  field. The phone (under 700 px of content): History's tab strip classes,
  Runs (New only, no headings, three lines a run) · Hall of Fame · Runes
  (two tabs with `runes` off), 1 2 3.
- **A sender's runs** is a state of the page (`by`), not a frame: "Runs by
  <name>" with All runs; Back (and Esc) returns to the whole list first.
- **Random Runes.** Each note whole (`pre-wrap`, `overflow-wrap: anywhere`,
  text nodes only, never a link). The field is a one-row textarea that
  grows to its text while focused or holding text (to 160 px), cleaned as
  typed (`cleanPublicText`, one line, cut to 250), Enter posts; the hint
  "41 / 250 · 4 left today" counts the account's notes of the UTC day the
  board shows (the server's 429 is the truth: it switches the field off
  with the limit's words). Remove has no question (the mockups'); Report
  is the stage 64 dialog's steps and words for a note, its own component
  (`ReportNoteFrame`, the watch page's `REASONS`, `reportText`), the note
  quoted. Actions show on hover, and on a tap on touch screens.
- **Back from the watch page (for part C2).** A run opens
  `<base>r/<id>?from=community` (plus `&cloudtest` on the dev server when
  the page has it) by `location.assign`, in the same tab. The watch page,
  seeing `from=community`, sends Back to `<base>?community` (keep
  `cloudtest` as its `startUrl` does; `community-model.ts`
  `communityBackHref` builds it). The start menu takes `community` from the
  address once per load (and removes it with `replaceState`), and when the
  flags allow opens the Community page on the view it kept in
  sessionStorage (`wc.community.view`: sort, page, sender, phone tab).
- **The counter.** The row comes in when `share` and `gallery` are known
  (idle time, like the owner row). Logged in it shows news.ts's `runs`
  (C3's cadence, held by the owner row's mark); a guest's count comes from
  `GET /api/stats/public`'s `listed` against `wc.communitySeen`, asked
  when the menu is the top frame, when the tab is visible again and every 5
  minutes, never in a game. `src/cloud/online.ts` now keeps one answer for
  55 s and asks with `stats` or with `share` and `gallery`, so the almanac's
  "N online" and the counter share one request. Opening the page writes the
  newest `listedAt` it showed to `wc.communitySeen` and, logged in, posts it
  through news.ts `markCommunitySeen({gallery})`. The share dialog's Open
  Community (C3, `requestStartRow`) now opens the page.
- **The dev `?community=<n>`** is gone; the start menu specs use the flags.
- **The e2e fake** answers the round 13 list (`by`, five sorts, `total`,
  pages of 10) and boxes, and the pub fake reports of notes (`kind: 'note'`,
  five hide it).
- **Tests:** worker (`community.test.ts`: the new sorts, `by`, `total`,
  the boxes; `runes.test.ts`: 250), unit (`community-api.test.ts`,
  `community-model.test.ts`), e2e `community-page.spec.ts` (11, Chromium
  and Firefox) and `phone-community-page.spec.ts` (3); the start menu's and
  the Hall of Fame's specs follow the flag.
- **Deviations:** the spec's "a link to Published runs" and the foot line
  are out (the owner's picks); `total` added to the list's answer.

## As built (stage 65 C2)

The watch page's stars and comments, and the page inside the start page's
look (round 13's pick 3a with the owner's change; branch `stage65-watch`).

- **The look.** `/r/<id>` (a share link's page too) keeps stage 64's boot:
  the first paint's loading line, no start page, no animation, the page in
  the lazy chrome chunk. On mount `.wc-watch` gets the start page's sky as
  its still CSS look (`skyCss(startSkyLook(window))`, what the start surface
  shows before its engine; repainted after a resize, once a frame at most;
  no engine, no canvas, no frame loop). Over it the start menu's large
  sub-page frame (the kit's `.wc-lk-box-large` markup: brackets, the hood
  "Shared run", Back at the top left), drawn by the page in a layout of its
  own (`WatchBox`) rather than `Box`, whose large form is fixed to the
  window: here the window grows with the comments and the page scrolls.
  In it the band (title, details, description; the stars; Report and
  Download as HTML; Back left the band for the frame's top left, `data-btn`
  `BACK`, B still its key), then the replay's sandboxed frame; band and
  replay fill the first view (`100dvh` less the frame), the comments sit
  under them. With `gallery` off (no `stars` in the meta) the page is stage
  64's in this frame and does not scroll. Phone (under 760 px): the frame
  4 px from the edges, the band stacked (title, details, the stars' row,
  Report and Download), the replay a window's height, the comments under.
  The end states (removed, hidden, …) keep their box, over the sky.
- **The frame keeps every stage 64 property**: the same sandbox, `allow`,
  handshake and message checks (src/watch/frame-host.ts untouched). The
  frame's window is no size container (`container-type: normal` on
  `.wc-watch-win`; nothing in the page queries `wc-page`), since its layout
  containment held the fixed-position fill (the iPhone's) inside the
  window; while the fill is on, the page stops scrolling and the window
  drops its clip and stacking context, so the frame covers the whole window
  over the hood and Back.
- **Fullscreen fix (src/core/fullscreen.ts).** `toggleFullscreen` settled
  on the first `fullscreenchange` after a request; Firefox can deliver an
  earlier fullscreen's exit after a new request, which counted as a refusal
  (the frame then filled the window for good and its button stayed "Exit
  fullscreen"). Now only an entry settles at once; anything else waits for
  the entry or the 2 s settle time, which still marks a real refusal. The
  new layout's timing made stage 64's Firefox fullscreen e2e fail one run
  in two to five; 20 of 20 after the fix (two unit tests).
- **Stars** (`src/watch/community.tsx` `RunStars`, beside the details;
  under them on a phone): History's Rate control drawn again in the page's
  CSS (`.wc-watch-stars`, the Rate's rules smaller; its module lives in
  History's chunk). A voter: `GET /api/u/pub/<id>/vote` once, the own vote
  lit, "Your stars: four" or "Rate this run", the mean and votes ("4.3 · 12
  votes", "No votes yet"); a click PUTs, a click on the own vote takes it
  back (`DELETE`); the band's flash says what happened or why not
  (`voteFailText`). One's own run: the mean as the kit's `Stars`, "12 votes
  · your run". A guest: the same with "Log in to rate", which takes stage
  64's way to Log in and back (`leaveForLogin`). The stars are kept apart
  from the meta, so a vote never reloads the frame.
- **Comments** (`Comments`): `GET /api/pub/<id>/comments?page=last`
  (public, no cookie), newest last, the writer's name (gold for one's own
  and for the run's sender, "· sender"), the age ("3 h ago", "yesterday",
  "4 days ago", then the date), the text as text (`pre-wrap`,
  `overflow-wrap: anywhere`, never a link). Remove for the writer and the
  run's sender (on every comment for the sender), Report on others' for a
  logged-in watcher who is not the sender (as drawn: the sender removes,
  a guest has no Report on comments; the band's Report gives guests the
  abuse address). Past one page an "Earlier comments" button above the list
  loads the page before and puts it in front (a comment already shown is
  kept once). The field: the free-text rules as the player types
  (`cleanPublicText`, 20 line breaks, cut to 1 000 code points), the count
  "n / 1000", trimmed when sent, Post comment off while there is nothing to
  send; the answer's comment goes last and the count follows. Refusals in
  a line under the list (`commentFailText`). A guest: "Comments come from
  accounts." and Log in to comment. Empty: "No comments yet." A failed
  load: one line and Try again.
- **Report on a comment**: the stage 64 dialog with `kind: 'comment'`:
  "Report this comment", "What is wrong with this comment by <writer>?",
  the comment quoted, "The writer is not told who reported.", the thanks
  and "already" words with "comment"; reported ones are remembered on the
  page.
- **Keys**: R, D, B as before; in the comment field every key is the
  field's (Esc lets go of it, the stack's rule); Esc elsewhere still does
  nothing (stage 64), so a half-written comment is never lost to it.
- **Back**: `?from=community` (the Community page's `runHref`) → the
  Community's `communityBackHref` (`<base>?community`, `&cloudtest` kept on
  the dev server); otherwise the start page. The end states' "Back to MUME
  Cockpit" does the same.
- **The client's requests** stay the page's own (`src/watch/api.ts`:
  `fetchVote`, `sendVote`, `fetchComments`, `postComment`,
  `deleteComment`; `parseMeta` reads `listed`, `stars`, `comments` and
  leaves out malformed ones); `COMMENT_MAX`, `COMMENT_NEWLINES_MAX` and
  `COMMENTS_PAGE_SIZE` are written out in src/watch/model.ts (a unit test
  holds them to the contract), so the chrome chunk still does not load
  `shared/cloud/api.ts`.
- **The e2e fakes**: the pub fake's public meta carries `listed`, `stars`
  and `comments` with `gallery` on; a marked sub-block "Reports of comments
  (stage 65 C2)" in the account fake's community block answers comment
  reports (gallery off `kind_closed`, unknown 404, own 403, one per
  account, 30 a day across kinds, five hide it).
- **Chunks**: the chunk set is the same 127 files; the entry chunk 31 362
  (main with C1, C3, C4) → **31 382 bytes** (+20: a shared chunk is now
  named after `community-model`, which the page imports for
  `communityBackHref`, in the preload map); the chrome chunk 159 024 →
  168 828 bytes.
- **Tests**: `tests/unit/watch-community.test.ts` (11), two in
  `fullscreen.test.ts`; e2e `watch-community.spec.ts` (11, Chromium and
  Firefox), `phone-watch-community.spec.ts` (2); stage 64's watch-page,
  phone-watch-page and watch-sandbox specs green, changed only where the
  layout moved (Back above the title on a phone, the replay's height in a
  tablet window and its width on a phone).


## As built (stage 65, review fixes)

The findings of `notes/research/stage65-security-review.md` (S1–S9) and the
code review (CR1–CR9 but CR4, not in this round), each with a test that failed
before the fix. The Worker's tests are in `worker/test/review65.test.ts`,
the client's in `tests/unit/review65.test.ts` unless named.

- **S1 (marks with ZWJ between them).** `shared/cloud/text.ts` counts the
  combining marks per base character: a ZWJ between marks no longer starts
  a new count (≤ 3 per base). The note text (`.wc-cy-note-t`) and the
  comment text (`.wc-watch-cm-t`) have `overflow: hidden` beside
  `overflow-wrap: anywhere`, so a stored tower paints over nothing. Tests:
  `public-text.test.ts` (the tower, U+206A–U+206F), the Worker refuses the
  repro note, e2e `community-page.spec.ts` and `watch-community.spec.ts`
  (the clipped boxes).
- **S2 (invisible text).** Refused besides stage 64's list: every `\p{Cf}`
  but ZWJ, `\p{Co}`, `\p{Cn}` (the noncharacters with them), U+2800,
  U+FFFC; U+3164, U+115F, U+1160, U+FFA0 stay refused. ZWJ only right
  after a visible non-mark character, or after one variation selector that
  follows one (`U+2764 U+FE0F U+200D U+1F525`, `U+1F3F3 U+FE0F U+200D
  U+1F308`: a strict "between two non-marks" would refuse those common
  emoji, as FE0F is a mark), and right before a visible one: never two in
  a row. A comment or note needs one visible character (`\p{L}\p{N}\p{P}\p{S}`).
  The checks are a scan of the code points, not lookbehind regexes (older
  Safari). The client sends `publicTextToSend` (cleaned, trimmed, '' with
  nothing visible: Post stays off); the comment and note fields clean again
  after their cut, so a cut cannot leave a ZWJ at the end. The fuzz in
  `public-text.test.ts` now runs 20 000 inputs × 3 rule sets with the new
  characters and checks that what the client sends always passes. The
  shapes of `\p{Cn}` follow the engine's Unicode version; a character a
  newer browser knows and the Worker does not is refused with `bad_text`.
- **S3 (listed texts).** `worker/pub.ts` `listedTextOk`: a POST with
  `listed: true`, a PATCH to listed, and a PATCH of the title or the
  description of a listed run check the texts the run will have (the
  stored ones where the PATCH does not change them) by `isPublicText`:
  title and character on one line, the description with its breaks; an
  empty description or character is allowed as before → `400 bad_text`.
  The share dialog's listed form and Edit of a run that will be listed
  clean by the same rules (`src/share/link.ts`, `cleanTitle(s, listed)`
  and friends); `bad_text` has its words (`BAD_LISTED_TEXT`). Link-only
  runs keep stage 64's rules.
- **S4 (views per /56).** `worker/address.ts` `viewAddressKey`: the IPv6
  /56 (IPv4 as before) keys a view's address row. Registration and the
  limiters keep `addressKey`'s /64 (left as it is, as decided). Spec
  §7.10 gains the row. `community.test.ts`'s view test moved to /56s.
- **S5 (mail).** `worker/mail.ts`: the Admin and run links come first;
  every line of user-written text (the run's title, the reported text,
  the reporter's text) is quoted with `> `; the header comment says what
  the subject carries. Test: `mail.test.ts` (a forged admin block stays
  quoted and after the real link).
- **S6 (reporters' age).** `worker/reports.ts`: only reporters whose
  account is `RANKING_AGE_DAYS` (7) days old, still there and not
  suspended count towards the five that hide, for runs, comments and
  notes; younger ones still queue the item and start the mail. Spec §7.8
  says so. The older report tests that expect hiding use `oldSignUp`.
- **S7 + CR3 (removing a hidden item).** `DELETE /api/u/comments/<id>`
  (writer or run sender) and `DELETE /api/u/runes/<id>` answer `403
  hidden` for a hidden item; its reports stay open; the removal's batch
  also holds only while the row is active. The watch page and the
  Community page say "Hidden after reports; the admin will look at it."
  (`HIDDEN_TEXT`). The fake does the same.
- **S8 (suspended writers).** The comment list and the board leave out a
  suspended writer's rows (`a.state = 'active'`). `comment_count` counts
  active comments of active writers (`COUNTED`): Suspend and Restore move
  it in the same batch as the votes (`stateChange`, only on a real
  change); the writer's or sender's removal, the hiding by reports and
  the admin's hide, restore and delete move it only for an active writer;
  Delete account of a suspended writer moves nothing. The news counts
  follow. The test recounts after each step.
- **S9 (`by=`).** `gallery` looks the name up first (the UNIQUE index of
  `name_key`); an unknown or deleted name answers an empty page without
  the list's queries and is not kept in the cache. A known name's list
  filters on the account id, list and count in one batch.
- **CR1 (comment pages).** `GET /api/pub/<id>/comments[?before=<created>.<id>]`
  answers the newest 50 (or those older than the cursor), oldest first,
  with `total`, `more` and `before` (`COMMENT_CURSOR_PATTERN`). `page=N|last`
  stays for cached clients, counted from the newest end (`last` = the
  newest 50) and with `page`/`pages`. The watch page's Earlier comments
  asks by cursor, so a comment removed meanwhile skips none (worker test,
  e2e `watch-community.spec.ts` with a removal between the pages). The
  contract, `comments.test.ts` and the fake follow.
- **CR2 (news epoch).** `src/cloud/community/news.ts` counts its marks; an
  answer whose request started before a mark has the marked counts
  cleared as `markCommunitySeen` does (a count with newer items stays).
- **CR5 (`/api/community`).** The HMAC key is imported once per request
  (`bytes.ts` `hmacKey`/`hmacWith`); the runs listed before the day are
  picked in SQL; their ids and the Hall of Fame are one `db.batch`;
  MUME's boxes are read beside it (`readMume` keeps its own failure apart,
  so it is not in the batch).
- **CR6 (formatters).** `src/cloud/community/format.ts` (no imports):
  `meanText` (half up: 4.35 → "4.4" on every page; the Community page said
  4.3), `meanStars`, `ageText` (`ago` for the watch page) and `dateText`;
  the community model, the watch model and `share-words.ts` re-export
  them. `communityAllowed` moved to `src/cloud/community/allowed.ts`
  (re-exported by the API module); the start menu and Published runs call
  `communityAllowed('read')` instead of their `galleryOn()` (Published
  runs now also needs `share` and an API the page may call). The entry
  chunk stays at **31 382 bytes**.
- **CR7 (phone).** The Community page's list waits for the first width
  measure (`null` until then), so a kept Top view on a phone asks once,
  as New. Test: e2e `phone-community-page.spec.ts` counts the requests.
- **CR8 (queue).** The admin's queue is one `UNION ALL` statement over
  runs, comments and notes, ordered and cut in SQL (it stays readable).
- **CR9.** `worker/mume.ts`'s cache comment names the row key `war`.

## As built (stage 65, owner's feedback: W3)

Point 13 of the owner's feedback (branch `stage65-w3`): a shared run —
the Hall of Fame, a link, the HTML replay — carries the panes **Map,
Timers and Group** only, and the replay starts with **every pane off**.
The History player (RUN LOG) and the Text export are unchanged.

- **One pure filter**, `sharedPayload` (`src/share/shared-panes.ts`),
  idempotent, its result still schema 1. It drops every SPANE record
  (script panes) and every `Comm.*` GMCP record, any case (the Comm
  pane's text and channel list; the game prints channel lines itself and
  those stay); writes the settings' and every VIEW record's `panes` as all
  seven built-in panes with `on: false` (Map, Timers and Group keep their
  tint, frame and glass, the others get the defaults; no script pane
  entry); removes script panes from the layouts (`migrateLayout` with them
  dropped: their ids name the scripts); sets the settings' `comm` to the
  defaults and drops a VIEW's `comm` part. Other GMCP (vitals, group,
  room, events) stays: the game text, the three panes and the markers need
  it. **Explicit `on: false` for every built-in pane** rather than leaving
  entries out: `migrateSettings` fills a missing entry with today's default
  (Comm on), so an older site's player, given a new payload, would show
  an empty Comm pane; with the entries it starts with every pane off too.
- **Where it runs.** `buildReplayPayload` applies it at the end (the
  HTML export, `prepareLinkPayload` and the dev payloads all build through
  it), so nothing of another pane leaves the device; `PayloadOptions.
  allPanes` keeps everything (tests of the fold and of the player's
  hostile-record paths). `openReplay` (`src/replay/page.ts`, the frame's
  play path after `readSharedPayload`/`validatePayload`, and the HTML file's
  `startReplay`) applies it again to whatever it plays, so a schema-1
  payload already published (more panes, some on) plays the same as a new
  one. `validatePayload`, the frame's sandbox, CSP and handshake are
  untouched (W1's paused pref stays theirs).
- **The player**: `PlayerHostOptions.panes` (`SHARED_PANES` from
  `openReplay`): the Panes popup lists Timers, Group and Map only (in the
  popup's order); every other pane is forced off in `compose` after the
  viewer's overrides, whatever a VIEW says; no script pane is built and
  none is listed; the phone layer's strip omits the other panes. The
  viewer's toggle turns one on as before (an override, so later VIEW
  records do not turn it off again).
- **The export editor** has no player preview (its preview is the
  comment's `## ` text), so nothing to mirror there.
- **Sizes**: entry chunk 31 382 bytes (unchanged); `r/frame.html` about
  +2.5 KB.
- **Tests**: `tests/unit/shared-panes.test.ts` (a run with Comm GMCP, a
  script pane, a VIEW with Comm/Statistics/a script pane on and a Comm
  part: none of it in the payload, every pane off, still valid schema 1,
  idempotent; the replay lists the three, all off, one turned on shows and
  nothing else; an old payload through the wire bytes, `readSharedPayload`
  and `openReplay` the same). Tests that check pane records in the payload
  pass `allPanes`. e2e: `watch-sandbox` (no pane at the start, the popup's
  three rows off, Map on shows alone; the hostile old payload shows no
  pane and builds no script pane), `watch-page` (an old published payload
  with Comm, UI, Character, Map and a script pane on: no pane; Timers on
  shows alone), `replay`, `viewer` (the HTML replay's settings round starts
  from all off), `script-pane-runs` (the HTML replay has no script pane),
  `map-files` (the viewer turns the map on).

## As built (stage 65, owner's feedback: W1)

Points 1, 2, 3, 6 and 11 of the owner's feedback of 2026-11-16 (the
stage file). User-facing words only: code identifiers, file names and
`data-btn="EXPORT"` keep the name export.

- **Share, not Export.** History's card button (desktop and phone), its
  keys box and the help texts that named it (About, the privacy page's
  share links section, Published runs' and the Community's empty lines)
  say Share. Its letter is **H** (S is Save, X stays free; nothing else on
  History uses H). The export editor's title (hood and window) is Share.
- **The editor's action button** reads **Download** (letter **O**, the
  old Export letter, the `drop` arrow) while HTML replay or Plain text is
  chosen, and **Share** (letter **S**, free in the editor; the `export`
  icon) while Link or Hall of Fame is; only the shown word's letter works.
  Its flash says "Downloaded <file>" / "Download failed: …".
- **Published runs.** A run's title is a link (`<a href>`, so a middle
  click opens a tab) to `/r/<id>?from=published` in the view, or
  `?from=account` in stage 64's section (`gallery` off); a press opens it
  in this tab. It is the row's first stop of the keyboard ring (Tab, then
  Enter). The watch page's Back goes to `<base>?account=published` or
  `<base>?account` (`backTarget`, `accountBackHref`), which the start page
  takes once (`useAccountAddress`): logged in, it opens the Published
  runs view (its Back then goes to the menu) or the Account page; logged
  out, the menu. Cheap, so done instead of the start page alone.
- **The watch page** has no Download as HTML: the button, the D key, the
  page's exporter import, `downloadName` and `FrameHost.payload` are
  gone; `buildReplayHtml` stays for History's own export. Without Report
  (one's own run, `?admin`) the band has no action box.
- **Paused start.** `wc-play` now carries `prefs: {paused: true}` (the
  frame host's default; `openFrame({paused: false})` plays at once). The
  frame honours only `paused === true` (`framePaused`), opens the replay
  with `autoplay: false` (`openReplay`'s new option, passed to the
  player) and seeks to 0 so the run's first screen is drawn; Space or
  Play starts it. The sandbox and the frame CSP are unchanged (the
  hashes are the build's). The HTML export file keeps playing at once:
  the owner's point was runs opened from the Community or a link, and a
  downloaded file is opened to be watched. A view is still counted when
  the frame has the run, paused or not (opening the run is the view).
- **No level.** The watch page's band reads "Rasta · 1 h 15 min · …"
  (`MetaLine` lost `level`); Published runs never showed one. The
  Community's rows (`community-model.ts` "Char L42") are W2's. The
  replay's own header inside the frame ("Rasta (L42)", the player's,
  from the payload) is unchanged.
- **Tests:** unit `watch-page.test.ts` (no level, Back's targets,
  `framePaused`), `chrome-export`, `chrome-history`, `history-dialogs`;
  e2e `watch-page.spec.ts` (no Download, paused start, Space plays),
  `phone-watch-page.spec.ts` (paused, Play by tap), `published-runs.spec.ts`
  and `share-link.spec.ts` (the title opens the run, Back returns, Tab
  reaches it), the words and the button by format in `export`,
  `share-link`, `hall-of-fame` (desktop and phone), `history-dialogs`,
  `phone-history-page`, `phone-export`.

## As built (stage 65, owner's feedback: W2)

The owner's feedback of 2026-11-16 (`docs/stages/65-community.md`, "Owner
feedback", points 5, 7, 8, 9, 10, 11 for the list's rows, 12), branch
`stage65-w2`. The owner left the details to the builder.

- **Search: `GET /api/gallery?q=<text>`.** The text goes through
  `shared/cloud/text.ts` `searchText` (the public text rules' cleaning on
  one line: NFC, refused characters out; every run of white space one
  space; trimmed) and must then be `GALLERY_Q_MIN`–`GALLERY_Q_MAX` (2–60)
  code points, else `400 bad_request` (an input over 480 UTF-16 units is
  refused before the cleaning). The client cleans with the same function,
  so both hold the same text; the answer echoes it as `q`. It matches
  title, character and sender of active listed runs by
  `instr(lower(x), lower(?)) > 0`: a plain substring, so `%`, `_` and a
  backslash are themselves and there is nothing to escape (chosen over
  LIKE … ESCAPE, which needs the escaping done right in two places); the
  text is a bound parameter, never part of the SQL. `lower()` folds ASCII
  only (as LIKE would): "ÅSA" finds "ÅSA", not "åsa"; names are ASCII and
  most titles English, so this is accepted. It combines with every sort,
  the pages of 10, `period` and `by`; the count query joins `account` only
  for a search.
- **A search is not kept in the Cache API.** Any text is a variant of its
  own, so hits would be rare and the entries unbounded; the D1 cost of a
  search is two statements that read the listed active rows (hundreds now;
  well under a D1 read budget at the public limit `API_LIMITER` by address,
  which every public path already has). The answer keeps the list's
  `Cache-Control` (`PUBLIC_CACHE`), so whatever W4 settles for the list's
  freshness applies to a search too. The client waits 300 ms after the
  last key and asks only for 2+ characters.
- **Desktop.** The left side is a column: the list takes what Random
  Runes leaves (`flex: 1`, at least 160 px), its rows scroll under the
  heads (`.wc-lk-tbl.is-scroll`) with the row cursor kept in view, and the
  pager stays at its foot; Random Runes sits at the bottom, at most **40 %**
  of the left side's height (`max-height: 40%`), its notes scrolling
  inside and the growing field kept in the box; with few notes it is only
  as tall as they are.
- **Headings** Run, Stars, Com., Views (letters N, S, M, V). The Length
  sort and the Listed heading are gone from the page (the API keeps
  `length`); a kept view with `length` reads as New. Length and the
  date stay as text under each title.
- **Rows** say "Title (Char)" with no level (`runName` for titles of
  links); the Run of the day's line "Char · sender · date".
- **The players on MUME** is no longer in the Warlords box: a large
  numeral in the display face (`--lk-on`, 44 px; 34 px on a phone) with
  "players on MUME" small under it, no box, at the top of the right
  column (desktop) or beside the search field (phone); absent without a
  count.
- **The search field** (desktop) shares the first heading with Run, right
  of it (up to 260 px); `/` or F focuses it, Enter lets go of it, ✕ in
  the field empties it. Over the list: 'Search: “ford” — 2 runs' with a
  ✕ button; an empty result says "No runs found." A search and a sender's
  runs exclude each other in the page (one replaces the other). Back (Esc)
  leaves a sender's runs, then a search, then the page. The search is kept
  in the view (`wc.community.view`, `q`), so Back from a run finds it.
- **Phone: a dashboard** (under 700 px of content; the tabs are gone).
  In order: the search field with the players' figure; Newest runs (the
  first five of page 1 of New: "Title (Char)", sender · date, the mean; a
  tap opens) with **All runs** and **Hall of Fame**; Run of the day;
  Random Runes (the latest five notes, "All N notes" shows the rest, the
  field); Warlords (both sides, names only under 360 px of content).
  The dashboard's field searches on Enter or its › mark, opening All
  runs on the search. Sub-pages (a state of the page, `view.sub`, kept
  across a run): **All runs** (New only, the search field searching as
  typed, the search line, the pager, a sender's runs) and **Hall of Fame**
  (the eight as the list's rows with their rank; a sender's name opens
  All runs on that sender). The hood says "All runs" / "Hall of Fame";
  Back leaves a sender's runs, then the sub-page (clearing its search),
  then the page. W from a sub-page returns to the dashboard and focuses
  the note field. Checked at 390 × 844 and 320 × 568 (nothing scrolls
  sideways).
- **The note field's hint** is "A note…" (the limit's words when full).
- **Words.** The empty list's line says "In History, Share a session and
  choose Hall of Fame." (W1's Export → Share).
- **Chunks.** The entry chunk is unchanged at **31 382 bytes**.
- **Tests:** worker `search.test.ts` (6: fields and case, `%`/`_`/
  backslash, bounds and cleaning, hidden/removed/link-only, pages and
  `by`, never cached and the flags); unit `community-model.test.ts` (the
  headings, `runName`, search, the view), `community-api.test.ts` (`q`
  asked and read); e2e `community-page.spec.ts` (+3: many notes, search,
  a tablet window; the page and sorting updated) and
  `phone-community-page.spec.ts` (rewritten: 7, the dashboard, All runs,
  search, Hall of Fame, runes off, CR7, 320 × 568). The e2e fake answers
  `q` as the Worker does.

## As built (stage 65, owner's feedback: W4, freshness)

Feedback point 4 (staging, Firefox): a private window logged in as B
showed one note through reloads and a restart until B logged out; a
guest's private window did not see a run A had just listed through a
wait, reloads and re-entering the page, while a new window did.

**The cause (reproduced against the local Worker, Chromium and Firefox).**
Nothing in the client keeps data between visits (no service worker; the
page fetches the list, the boxes and the board on every mount; the
sessionStorage view holds only sort/page/tab/by; the counter's
localStorage and online.ts's 55 s reuse feed only the menu's count). The
staleness was the Worker's own Cache API entry: kept 60 s per variant
(staging: `Age` counts up and the entry turns over at 60 s, so it is not
kept longer) and **never passed by a write**. Whoever opened the page
first in that minute fixed what everybody in the same data centre saw:
B's reload got the board kept from before A's and B's notes (B's own note
was on screen only through the page's local insert, so a reload "lost"
it), and the guest's re-entry and reloads got the list kept from before
A's listing. Neither a reload nor a new window can pass a server-side
entry; the "new window" and "log out" only let the minute run out. The
browser's `public, max-age=60` added a second layer that a server-side
change could not reach. The e2e below fails on both counts without the fix.

**The fix.**
- **The browser keeps nothing:** the three public reads answer
  `Cache-Control: no-cache` (miss and hit alike), and the client asks
  them with `cache: 'no-store'` (`src/cloud/community/api.ts`), so a
  reload and a re-entry always reach the Worker.
- **The edge copy has an explicit expiry:** `cached()` stores a copy with
  `public, max-age=60` and `X-WC-Kept: <ms>`, and believes a hit only
  while `now − kept < 60 s` by that time, whatever the cache does. D1 is
  still read at most once a minute per variant and place.
- **A write moves the cache on:** a successful non-GET to `/api/u/runes*`,
  `/api/u/pub*` (listing, unlisting, removal, votes, comments),
  `/api/u/comments/*`, `/api/u/report`, `/api/u/account` (DELETE) or any
  `/api/admin/*` puts a new **mark** (`<origin>/api/community/~mark`, a
  write's time and 6 random characters, kept a day) into the Cache API
  (`communityChanged`, called by `worker/router.ts`); every kept key
  carries `&mark=<mark>` (none before the first write), so the next read
  of each variant in that place reads D1. The Cache API is per data
  centre: the writer (and everybody served by the same place) sees the
  change at once, others within 60 s. The writes are rate limited, so the
  extra reads are bounded by them.

Tests: `worker/test/community-fresh.test.ts` (no-cache on miss and hit,
the stored copy's headers, a cache that never expires believed 60 s, a
note, its removal and a listing seen at once, a refused write marks
nothing); `tests/unit/community-api.test.ts` (`cache: 'no-store'` on the
reads, not on writes, handed to `fetch`);
`tests/e2e-worker/community-fresh.spec.ts` (Chromium and Firefox against
the local Worker: (a) and (b) as the owner met them).

## As built (stage 65, owner's feedback: review fixes 2)

Fixes of `notes/research/stage65-security-review-2.md` (R2-1..R2-3) and of
the code review of W1–W4 (CR1..CR10), branch `stage65-fix2`.

- **Search (R2-1).** Replaces W2's "a search is not kept". A search has its
  own limit besides `API_LIMITER`: the binding `SEARCH_LIMITER`, 20 a minute
  per address key (`a|<addressKey>`, an IPv6 /64 is one; `wrangler.jsonc`,
  production and staging, namespaces 5907/5908), only when `q` is in the
  address. It is kept in the Cache API as the list is (60 s by its own time,
  under the community's mark) under its text as searched: `searchText`'s
  text with its ASCII letters in lower case, which is what SQLite's
  `lower()` compares anyway, so every case of a text is one variant; the
  answer's `q` is that text. Pages 1–`GALLERY_Q_PAGES_MAX` (10) only, a
  deeper page is `400 bad_request` (the list keeps its 100). The Cache API
  evicts what is not asked again, so the variants are no cost.
- **The mark (R2-2, CR4, CR5).** Replaces W4's "a successful non-GET under
  the listed paths". A handler says it changed what the public reads show
  with the internal header `X-WC-Public-Change` (`publicChange`,
  `worker/runtime.ts`); `worker/router.ts` (`afterWrite`) takes it off every
  account and admin answer and moves the mark only then: a listed run
  published, removed, listed, unlisted or its title or description changed
  while listed; a vote on a listed run that is new or differs (stars or
  ranking), one taken back; a comment on a listed active run posted or
  removed; a note posted or removed; a report that hides its item; Delete
  account; the admin's hide, restore and delete (not dismiss) of a run,
  comment or note and every account action. A vote again with the same
  stars, a report below the five, a link-only run, a refused write: no mark.
  **At most one mark per 5 s** (`MARK_EVERY_MS`) per isolate, and per place
  by the mark's own time (`<time36>.<random>`; an older mark without a time
  counts as 0); a change inside the 5 s schedules one later mark for when
  they are up (`Deps.sleep` in `waitUntil`, and should that timer not run,
  the first read here after them makes it), so it shows within 5 s rather
  than after the 60 s. **At once, past the 5 s** (header value `now`): a run
  listed for the first time (created listed, or its first PATCH to listed)
  and a listed run removed, which `listingsPerDay` bounds; Delete account;
  every admin action. So the writer and this place see a new or removed
  listing at once, as W4's e2e asks; listing again, unlisting, words,
  votes, comments and notes wait their turn. The put runs after the answer (`waitUntil`); the new
  mark is in the isolate's memory at once, so the writer's next read there
  is fresh. **The mark is kept in isolate memory** (per cache object and
  origin) and read from the Cache API at most every 2 s; a mark made here
  that the cache does not show yet is kept over an older one read. A hit
  therefore costs one cache lookup. W4's e2e and tests stay; the unit tests
  space their writes 5 s apart, and new ones check the marks counted, the
  later mark, an answer whose put never ends, the one lookup and the
  admin's flags.
- **The phone (CR1–CR3).** All runs from the dashboard takes the field's
  text: its search, or an empty field when it is no search (a text too long
  stays, with its line), also when the view was restored with a search. The
  search field's `maxLength` is `GALLERY_Q_MAX` (60); a longer text (set by
  a script or an IME past the attribute) shows "A search takes at most 60
  characters." over the list instead of the whole list in silence. A
  sender's runs opened from the phone's Hall of Fame keep `from: 'hof'` in
  the view; Back goes to the Hall of Fame (the bar's All runs still leaves
  the sender for the whole list).
- **The replay (CR6, CR7).** `openReplay` runs `sharedPayload` only when
  `needsShared` finds something (a settings pane on, missing or not built
  in, a script pane in the layout, a SPANE, Comm or pane-on VIEW record:
  one regular expression over the text); a run shared since W3 plays
  without a second pass. `PlayerHost.paneAvailable` is the one filter of the
  five places that honoured `panes`.
- **Code (CR8, CR9).** The model takes `GALLERY_Q_MIN`/`GALLERY_Q_MAX` from
  the contract (its own copies are gone). `src/watch/href.ts`: `watchHref(id,
  from)` and `backHref(view)` with the `?cloudtest` hook in one place
  (`keepCloudtest`), used by the Community page, Published runs and the
  watch page (`runHref`, `communityBackHref`, `accountBackHref` and
  `pubWatchHref` are gone); the start page's `takeStartQuery(name)` takes
  `?community` and `?account` once. Entry chunk **31 362 bytes** (was 31 382).
- **/privacy (R2-3, CR10).** The share links section says what travels:
  the game's own status data the Map, Timers and Group panes use (name,
  level, race, class, vitals as the game sent them), no channel records and
  no other pane; the map of the rooms passed whenever the cut has any; that
  whoever can watch a run can save a copy that removal does not reach; and
  that the level is kept and part of the public data though not shown.
- **Tests:** worker `search.test.ts` (kept under the lower-case text, pages,
  the limit), `community-fresh.test.ts` (+4); unit `shared-panes`
  (`needsShared`), `community-model` (too long, `from`, the hrefs),
  `watch-page`, `about-leaf`; e2e `phone-community-page.spec.ts` (+3: CR1,
  CR2, CR3).

## As built — feedback round 2, start-menu chrome

- **Back on a phone (owner's point 8).** A box's Back lay on the iron
  frame: on a coarse pointer it grew to 40 px upward from `top: 3px`, so
  its top edge sat 5 px above the lit window's inner edge (9 px into the
  box). The rule now, on a phone-size window (`html.wc-phone`, short side
  under 600 px; look-glass.css): Back is drawn **inside the window's inner
  border with air** (`top: 14px`, 6 px below the window's inner edge, 8 px
  right of it), 28 px high and a little smaller (10 px type, 12 px icon);
  its **40 px touch target is an invisible `::before`** that grows upward
  over the frame only, never down over the page's first line (its bottom
  edge is where the old Back's was). The window sub-pages' inline Back
  (`.wc-lk-iback`) and the tablet (44 px, ADR 0140) are unchanged. The
  watch page's Back has the same classes and follows without a change in
  `src/watch/page.tsx`. Test: e2e `phone-back-placement.spec.ts` (Profile,
  Scripts, History, About and the watch page, 390×844 and 844×390: Back's
  box ≥ 4 px inside the window's inner border box, a tap 40 px above its
  bottom lands on it).
- **No "N online" on the start page (owner's point 11).** The almanac's
  line and the client code that only served it (`src/chrome/start-online.ts`,
  `onlineNow`, `onlineText`, the `.wc-alm-o` CSS) are gone; the owner reads
  the number on `/admin` (`/api/admin/stats`, unchanged). The client asks
  `GET /api/stats/public` only for the guests' Community counter, so only
  with `gallery` and `share` on (`publicStats`); the endpoint is unchanged
  and still answers `online` and `playing`, now unread by the client
  (harmless). /privacy drops "The start page may show how many are
  online." (`PRIVACY_UPDATED` 16 November 2026); spec §7.6 says the start
  page shows no number.
