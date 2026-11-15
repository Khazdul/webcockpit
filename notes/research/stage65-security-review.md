# Stage 65 security and abuse review (the community)

Date: 2026-11-15. Scope: `git diff 6df5fe2f..HEAD` (notes/ ignored), read
against ADR 0148, 0154, 0155 and spec §7. Read-only on the code; the text
rule probes ran as `npx tsx` scripts in the session's scratch area against
`shared/cloud/text.ts` and `worker/community.ts`'s `publicTextOf`.

Severity is for this project's size (hundreds of users, one admin).

## Findings

### S1 (medium): the combining-mark limit is bypassed with U+200D between the marks

- `shared/cloud/text.ts:69` `TOWER = /\p{M}{4,}/u` counts only
  *consecutive* marks. ZWJ (U+200D, kept on purpose for emoji) is `Cf`, not
  `M`, so `x` + (`̐̑̒‍`) × 200 passes. It is one
  grapheme cluster (ZWJ is Extend in UAX #29), so the browser stacks all
  600 marks on one base.
- Repro: `publicTextOf('x' + '̐̑̒‍'.repeat(200), 1000, 20)`
  returns the text (checked). `POST /api/u/runes {"text": <that, cut to 250>}`
  or a comment. `Intl.Segmenter` gives 1 grapheme.
- Where it shows: `.wc-cy-note-t` (community.css:510) and the watch page's
  comment text (watch.css:552/611) have no `overflow: hidden`, so the tower
  spills over the rows above and below on Random Runes (start page) and
  under any run.
- U+206A–U+206F (also `Cf`, allowed) do the same.
- Fix: count marks per grapheme cluster, skipping `Cf` (or ZWJ and the
  allowed format characters) in the run: e.g.
  `/(?:\p{M}[‍⁪-⁯]*){4,}/u` in `TOWER` and in the cleaner;
  limit ZWJ to between two non-mark characters (`(?<=\P{M})‍(?=\P{M})`),
  which is what emoji use. Also add `overflow: hidden` (or
  `overflow-y: clip` plus a max height) to the note and comment text boxes.

### S2 (low): invisible or blank text still passes the free-text rules

- `PUBLIC_FORBIDDEN` is a hand-made list. These `Cf` characters pass
  (probed over all code points): U+0600–0605, U+06DD, U+070F, U+0890–0891,
  U+08E2, U+200D, U+206A–206F, U+110BD, U+110CD, U+13430–1343F,
  U+1BCA0–1BCA3, U+1D173–1D17A. Also U+2800 (Braille blank), U+FFFC, the
  private use areas, unassigned code points and the noncharacters
  (U+FFFE, U+10FFFF).
- Repro: `POST /api/u/runes {"text":"‍‍"}` or `{"text":"⠀"}`
  makes a note that looks empty, with the writer's name; the same works
  for comments. ZWJ can be repeated without limit.
- Fix: refuse `\p{Cf}` except U+200D (kept only between two non-mark
  characters, as in S1), plus `\p{Co}`, `\p{Cn}`, the noncharacters and
  U+2800/U+FFFC. Also refuse a text with no visible character
  (`!/[\p{L}\p{N}\p{P}\p{S}]/u`). Mirror it in `cleanPublicText`. The
  client and the Worker stayed consistent in a 200 000-case fuzz
  (cleaned and trimmed, then checked), so a shared change keeps them in step.

### S3 (low): listed run titles, descriptions and character names skip the free-text rules

- `worker/pub.ts:112` `textOf` (stage 64) only refuses controls and bidi
  overrides. Stage 65 shows these fields publicly in New, Top, Most
  watched, the Hall of Fame and the Run of the day. Soft hyphens, zero-width
  characters, U+2028, Hangul fillers and towers of combining marks of any
  height are all accepted there.
- Repro: publish with `listed: true` and `title: "ㅤ"` (looks empty)
  or a title with zero-width characters, made to look like another
  player's run. The list cells clip with `overflow: hidden` and an
  ellipsis, so a tower is mostly contained. The cost is impersonation and
  blank rows, not broken layout.
- Fix: run `isPublicText` on title and character (newlines 0) and on the
  description (its limit) when `listed` becomes true, in `metaOf` and the
  `listed` PATCH, or for every new publish.

### S4 (medium): one IPv6 customer can inflate Most watched by hundreds or thousands of views a day

- `worker/pub.ts:747-760` dedupes a view by device id (made by the client)
  and by `addressHash` of `addressKey`, which makes an IPv6 /64 one key
  (`worker/address.ts`). The API and BEAT limiters use the same /64 key.
  Home ISPs give a /56 (256 /64s), and a free tunnel broker gives a /48
  (65 536 /64s).
- Repro: for i in 0..N: send `POST /api/pub/<id>/view` from source
  `2001:db8:abcd:<i>::1`, with header `X-WC: 1`,
  `Origin: https://mumecockpit.com`, JSON body
  `{"device": "<fresh uuid>"}`. Each counts once, so N views a day per
  run. Each /64 has its own limiter budget. The same /64 granularity
  sets how cheap sock-puppet registration is (S6, S7), apart from
  Turnstile.
- `CF-Connecting-IP` is the only address source: `X-Forwarded-For` is
  never read, so spoofing a header does not work.
- Fix: key views (and the registration counters) by the /48 for IPv6,
  or add a per-run cap of address rows from one /48 per day. Or count
  Most watched from logged-in viewers, or from views with a session.
  A cheap middle ground is a /56 key for views.

### S5 (low): the report mail body lets the reported text forge the admin link

- `worker/mail.ts:249-271`: the comment's text (up to 20 line breaks) and
  the reporter's text (newlines allowed) go into the body unquoted, before
  the real `Admin:` line. Mail clients autolink.
- Repro: comment `"nice\n\nThe reporter's text:\n(none)\n\nAdmin:    https://mumecockpit.example/admin\n"`,
  then 1 report on it. The mail shows a block that looks complete, with a
  look-alike admin link above the real one.
- The encoding itself is sound: CR/LF are removed from headers, the
  subject is RFC 2047, and the body is base64. No header injection.
- Fix: prefix every line of user text with `> ` (or indent it), and put
  the Admin/Run links at the top of the body, before any user text. In
  the subject, quote the run title with a marker such as
  `[comment] on "…"`. A smaller point: the comment at mail.ts:22 says
  the writer's name is in the subject, but a comment's subject carries
  the run title.

### S6 (low): five fresh accounts can hide any comment, note or run (reports carry no age rule)

- `worker/reports.ts:96-115` counts distinct active reporters,
  whatever their age. Votes need a 7-day-old account to rank. Reports
  need nothing, and they have the stronger effect (hiding).
- Repro: register 5 accounts (Turnstile, 3/h and 10/day per address),
  then each sends `POST /api/u/report {kind:"comment", target:<id>,
  reason:"spam"}`. The comment is hidden at once for everyone until the
  admin looks. With 30 reports a day per account, 5 accounts can hide
  30 items a day.
- Fix: count only reporters at least `RANKING_AGE_DAYS` old (or with
  their own activity) toward `REPORTS_TO_HIDE`. Newer reporters still
  queue the item for the admin.

### S7 (low): the writer can remove a hidden or reported comment or note and close its reports

- `worker/community.ts:609-634` (`commentDelete` → `removeComment`) and
  `665-679` (`noteDelete`) accept a row in state `hidden`. They mark its
  open reports handled and blank the text, so the item leaves the admin
  queue with no trace beyond the handled report rows.
- Repro: post an abusive comment. It is reported and hidden. Before the
  admin looks, `DELETE /api/u/comments/<id>` → 204. `GET /api/admin/reports`
  no longer lists it, and the admin cannot judge or suspend the writer
  from it.
- Fix: refuse (404) the writer's delete while the item is `hidden`, or
  remove it while keeping its open reports and text for the queue. Do the
  same for notes. The run owner's removal can stay.

### S8 (low): a suspended account's comments and notes stay visible

- `commentsGet` (`community.ts:345-351`) and `runes` (`community.ts:324-333`)
  do not filter by the writer's state. Suspend takes the votes out of the
  sums, but a spammer's 20 comments an hour across many runs stay up until
  the admin deletes them one by one or deletes the account.
- Fix: `AND a.state = 'active'` in both queries. On a page, `total` and
  `pages` then disagree with `comment_count`. Either accept a short last
  page, or move the count with the state in `stateChange` as is done for
  votes.

### S9 (low): uncached list variants through `by=`

- `galleryParams` (`community.ts:252-261`) turns every valid name into
  its own cache key. Each miss costs a list query (for `sort=top` it also
  scans every listed run for `m`) and a count query. Unknown valid names
  miss every time.
- Repro: `GET /api/gallery?sort=top&by=aaa1`, `aaa2`, … gives 120 a minute
  per address key, and IPv6 rotation (S4) multiplies that.
- Fix: resolve `by` to an account id first (a 1-row index lookup) and
  answer an empty page, from the cache, for unknown names. Or apply the
  limiter to the `by` variant at a lower rate.

## Checked and found sound (no finding)

- **Rendering:** no `innerHTML`, `dangerouslySetInnerHTML` or
  `insertAdjacentHTML` in the community, watch, Published runs or start
  menu code (Preact text only). The admin page builds everything with
  `textContent` (`el()`), quotes comments and notes in `blockquote` text
  nodes, and builds its Open-run link with `encodeURIComponent`. Bidi
  overrides and isolates, C0/C1 controls, U+2028/2029 and the tag
  characters are refused. Long words wrap (`overflow-wrap: anywhere` on
  the note and comment text). Nothing is linkified.
- **Client cleaner vs Worker:** the same module, and both trim with JS
  `trim()`. The fuzz found no text the client sends that the Worker
  refuses.
- **Votes:** own run refused in the guard (`account <> ?2`). Hidden and
  removed runs are refused on PUT. The guard (account active, run active,
  others' votes in the hour < 60) is the same across the three
  statements of one D1 batch, so a race cannot pass the limit or lose
  a sum. `ranks` comes from the stored `account.created` at the write,
  and a change re-evaluates it as the ADR intends. Suspend, Restore and
  delete move the sums only on a real state change. Tombstones delete the
  votes and zero the sums. Delete of a suspended account skips the move.
  No drift path found.
- **Limits:** comments (20/h, removed rows kept an hour), 1 000 visible
  per run, 5 notes a UTC day (removed rows kept until the day ends, so
  remove-and-repost does not help), 30 reports a day across kinds,
  10 first listings a day (`listed_at` set once, kept on unlist and on
  the tombstone). Each is held in the writing statement.
- **Top, cache and New:** Top's ordering expression is fixed. `sort`,
  `period` and `page` are allow-listed, and the cache key is rebuilt
  from the normalised values, so extra parameters or `by` case do not
  change it (no poisoning). Answers carry nothing per user. Unlist and
  relist do not bump New.
- **Authorization:** every `/api/u/*` community route passes the
  session, the CSRF rule (`X-WC` plus Origin on writes) and the flags.
  Suspended accounts get 403 on PUT and DELETE of votes, comments and
  notes. Deleting a comment needs the writer or the run owner. Deleting
  a note needs the writer. `/api/admin/comment|note/<id>` go through
  `guarded` (Access, `X-WC`, Origin). `seen` is clamped to
  `max(old, min(t, now))`. News leaves out one's own and hidden items.
  Public answers carry names only: no account ids, emails, or hidden or
  removed text. `by=` does not reveal whether a name exists.
- **MUME (`worker/mume.ts`):** 256 KB and 10 s cap with abort for the
  fetch. 8 KB and 5 s for the probe, and the socket closes in `finally`
  and on timeout. The tokenizer is linear and drops raw-text elements.
  Values are entity-decoded, cleaned, stripped of `<` and `>`, and cut to
  40 code points. They are checked again on read (`isWarlordList`), and
  PLAYERS must be at most 100 000. Only plain strings and a number reach
  clients.
- **Watch page:** `frame-host`, the frame document, CSP and headers are
  untouched by this stage. `?from=community` and `?community` only pick
  one of two fixed same-site targets (`backTarget`, `communityBackHref`),
  so there is no open redirect. The fullscreen change only delays
  resolving on a non-entry event and has no security bearing.
