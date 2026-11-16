# Stage 65 security review 2 (owner's feedback W1–W4)

Date: 2026-11-16. Scope: `git diff 67d46d77..HEAD` on main (code only;
notes/docs as context). Previous review: `stage65-security-review.md`
(its fixed findings were not re-checked unless touched here).

Method: read the diff and the code it touches; ran
`worker/test/search.test.ts`, `worker/test/community-fresh.test.ts`,
`tests/unit/shared-panes.test.ts`, `tests/unit/watch-page.test.ts` (32
pass); fuzzed `sharedLayout`/`sharedPanes`/`sharedView`/`sharedRunText`
with hostile values via a throwaway tsx script (no throws).

## Findings

### R2-1 (Medium) Search is an uncached full scan at the general public limit

`worker/community.ts:268-294` (`SEARCH`, `listRowsQuery`,
`countRowsQuery`), `:383` (`if (q.q !== undefined) return make();`),
limit at `:313` (`API_LIMITER`, 120/min per address, `wrangler.jsonc:105`).

Every `GET /api/gallery?q=..` runs two D1 statements that cannot use an
index (`instr(lower(..))` over title, character and sender), so each
reads every listed active run twice (three times for `sort=top`, whose
`MEAN` scalar subquery scans them again), plus the account rows of the
join. Before this change every uncached public read was bounded by the
variant count (sort × period × page × known `by`, each at most once per
60 s per data centre); `q` makes every request a miss.

Reproduction (local Worker, never 5173):
`for i in $(seq 120); do curl -s "http://127.0.0.1:$PORT/api/gallery?sort=top&page=100&q=x$i" >/dev/null; done`
→ 120 × (3 × N listed runs) rows read per minute per address; an IPv6
attacker rotates /64s (the limiter key) freely. At N = 2 000 that is
~720 k rows/min per /64, ~1 B rows/day.

Fix (any one, ideally the first two): a separate, tighter limiter for
`q` (e.g. 20/min per address; the client's 300 ms debounce needs far
less); keep searches in the Cache API anyway under the normalised
lower-cased `q` (the Cache API evicts, the ADR's "grow without bound"
is not a cost); optionally refuse `page > 10` for a search, or move to an
FTS5 table if the list grows.

### R2-2 (Low) Any successful account write flushes the data centre's cache, unthrottled

`worker/router.ts:240-243` (`written`), `worker/community.ts:144-174`
(`communityChanged`, `changesCommunity`).

The mark moves on every `res.ok` non-GET under the listed paths, whether
or not anything public changed: a vote PUT with the same stars, a
DELETE of a vote that does not exist (if it answers 204), every `POST
/api/u/report` (below the hide threshold nothing public changes), a
link-only `POST /api/u/pub` or `PATCH` of an unlisted run. Any logged-in,
non-suspended account can bump it ~2/s (API_LIMITER per address and per
session), making every public read in that data centre (`/api/gallery`,
`/api/community`, `/api/runes`) go to D1. Unauthenticated `/api/u/*`
answers 401, `/api/auth/*` is not in the list and admin is behind Access,
so it needs an account.

Reproduction: logged in, loop `PUT /api/u/pub/<id>/vote {"stars":5}`
while another client times `GET /api/community`: every read misses.

Fix: coalesce (skip the put when the current mark is < 2–5 s old: the
writer still sees the change within seconds), and/or bump only when the
handler reports a change (e.g. an internal response flag, stripped
before the answer).

Checked and fine: the mark key `/api/community/~mark` is not a routed
public path (404 via `dispatch`), its value is checked against
`MARK_PATTERN`, `X-WC-Kept` is set only on the stored copy and stripped
by `served()`, no public `make()` reads cookies or the session (nothing
per-user under a public key), and the read/write race leaves at worst a
stale entry under an old, no-longer-used mark.

### R2-3 (Low) /privacy overstates what a shared run leaves out

`src/chrome/frames/privacy-share.ts:26-29`.

1. "the Map, Timers and Group panes' records (no other pane goes with
   it)": `sharedRunText` (`src/share/shared-panes.ts:88-100`) drops only
   SPANE and `Comm.*`. Every other inbound GMCP record stays, among them
   `Char.StatusVars` (level, race, subclass, fullname, next-level xp/tp)
   and the full `Char.Vitals` (xp, tp, hidden/sneak, alertness, mood,
   opponent) — the Character pane's data, readable by anyone from
   `GET /api/pub/<id>/payload` (not encrypted). Map and Group need parts
   of them, so the records cannot simply go.
2. The owner's "no level" (ADR 0155 W1) is display-only: `level` is still
   in `PubMeta`, in every `GalleryRow` (`worker/community.ts:248`), in
   `payload.level` and in Char.StatusVars. The "What is kept" line does
   list level, so that line is true; the UI just suggests otherwise.
3. The sentences "whoever has it … can download the run as a file" and
   "A copy someone has downloaded is theirs" were removed with the
   Download button, but the payload is still a public GET and the frame
   holds it, so copies remain possible and "the run is deleted" cannot
   cover them.

Reproduction: publish a run, `curl /api/pub/<id>/payload | gunzip` →
`Char.StatusVars {"level":..,"race":..}` lines.

Fix: word it as "the game text and the game's data records (the
character's state, room and group data) of the parts you kept; no
channel (Comm) records and no script pane"; keep a line that anyone who
can watch can save a copy. If the owner wants level/race private, strip
those keys from Char.StatusVars in `sharedRunText` (the map reads only
what it needs) and drop `level` from `GalleryRow`/`PubMeta`.

## Checked, no finding

- Search SQL: `q` is bound (`?5`/`?3`), `instr` (no LIKE wildcards),
  `searchText` cleans (NFC, refused characters, one line) and bounds it
  (2–60 code points; raw > 480 UTF-16 units refused before cleaning).
  The WHERE is the list's `LISTED` (`state='active' AND listed=1`) plus
  an AND, so hidden, link-only and removed runs never match; a suspended
  sender's runs stay listed by design (ADR 0154: "its published runs
  stay unless hidden"), so search reveals nothing the list does not.
  Searched fields (title, character, sender) are all shown in the row.
  The echoed `q` is rendered as text.
- Shared panes: the exporter (`buildReplayPayload`) and the player
  (`openReplay`) both apply `sharedPayload`; no production caller passes
  `allPanes`. The player with `panes: SHARED_PANES` builds no script or
  temp pane, forces every other pane off after `applyViewer` (VIEW
  records and the viewer), lists only the shared panes and omits the
  others on the phone. Hostile layouts/VIEWs did not throw.
  `validate.ts` is unchanged. Minor: a hostile payload's `GMCP  Comm..`
  (two spaces) or bare `Comm` slips the filter, but the Comm pane cannot
  be turned on, so it is harmless.
- Frame handshake: message checks unchanged (`e.source === parent`, `v`,
  `taken`); `framePaused` accepts only `prefs.paused === true`; the
  host no longer exposes the payload (Download gone).
- Back targets: `backTarget` is an allow-list of four values and every
  destination is built from `base()`; no open redirect. `?account` /
  `?account=published` only open the logged-in user's own Account page
  once and leave the address at once; no state is injected. `pubWatchHref`
  uses a server id (12 alphanumerics).
