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
