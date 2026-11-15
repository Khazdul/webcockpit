# 0155 — The community: listing, votes, comments, the counters, Random Runes

- Status: Accepted (planned 2026-11-15, stage 65; nothing built yet).
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
