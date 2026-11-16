# Stage 66 — The admin panel

Status: **On staging (2026-11-16)**: built as picked in round 14 (1b,
2b, 3a, 4b), reviewed, fixed and checked; production untouched, no tag.

## Waiting for the owner

1. **Your test on staging** (test guide below): <https://staging.mumecockpit.com/admin>.
   Then say yes or give feedback; the release (0.15.0, migration 0007)
   goes to production only on your word.
2. **S1, an admin host of its own (optional, your Cloudflare setup).**
   The review's only remark on Access: `/admin` shares its origin with
   the app, so a script that ever got past the app's CSP could act as
   the admin. Moving the admin to e.g. `admin.mumecockpit.com` with its
   own Access application closes that. Low risk today; say if you want
   it, and the next session writes the clicks.
3. **S8, one Access application per environment (optional).** Staging
   and production share the Access audience, so a staging admin token is
   accepted by production too (still only for your e-mail). A second
   application for staging separates them.

## Goal

`/admin` becomes the owner's whole tool (spec §7.9, ADR 0148 "The admin
page", ADR 0157): an **account list** with search and sort, one
account's page with its storage, community, sessions and **limits of its
own**, clean-up (end sessions, suspend, delete); **graphs** of use
(online over 24 hours and 30 days, devices a day, a week and a month,
new devices and new accounts, device types, browsers, versions),
**storage** (in total and the largest accounts) and **sharing** (shares,
votes, comments a day); and the **audit log** as a view, which nothing
can change afterwards. Stage test (spec §5): look at a month of use;
remove a test account.

## What must be true afterwards

- **Views.** `/admin` has the views Reports (today's queue), Accounts,
  one account, Use, Storage, Sharing, Log and Flags (Flags and today's
  figures as now), reached as the owner picks; each has its own address
  (`/admin#accounts` …) and survives a reload. Phone width works.
- **Accounts.** A table of every account: name, created, last seen,
  state, items, bytes (small items, runs, published), published runs,
  sessions, a mark for limits of its own. Search by a part of the name,
  filter by state, sort by any column, pages of 50. A click opens the
  account.
- **One account.** Its figures against its limits (bars), its
  community (votes, comments, notes, reports made, open reports on its
  things), sessions (count and last use), the log entries about it, and
  the actions: End all sessions, Suspend / Restore, Delete (typed name),
  Edit limits.
- **Limits.** Every limit of `AccountLimits` per account, the default
  beside it, Reset to defaults; a value below the account's use warns
  first and deletes nothing. Saved without a release; logged.
- **Graphs.** Ranges 24 h, 7 days, 30 days, 90 days, all. Online and
  playing; devices a day / 7 days / 30 days; new devices and new
  accounts; device types, browsers, versions; storage in total by kind
  and the ten largest accounts; shares (link and listed), votes,
  comments, notes, reports and views a day. Hover gives the value; each
  graph can show its numbers as a table. Light and dark.
- **Audit log.** Every admin action (moderation, accounts, limits,
  flags), newest first, 100 a page and older pages on request, filter by
  kind and search by target; the chain's state in the header ("intact,
  N entries"), entries from before stage 66 marked "not sealed". No
  endpoint or code path changes or deletes an entry, the database
  refuses it, and a change from the console is detected (ADR 0157).
- **Deleting an account** removes everything it owns in D1 and R2, by a
  test that finds every account column itself.
- **Access.** Every `/admin` and `/api/admin` path answers only behind
  the Access check; writes need `X-WC: 1` and the site's `Origin`; a test
  walks them all.
- **Unchanged:** the client bundle and the game path (the admin page is
  not in it); production's flags.

## Not in this stage

- A second admin or roles. Mail on anything but reports.
- Showing anything private: there is nothing readable (ADR 0145).
- Cloudflare's own analytics; the use estimate stays ADR 0147's.

## Decided already (ADR 0157)

- One page, views by the hash, the script split into string modules;
  graphs as the page's own SVG with a Table toggle; no library; no
  polling outside Reports.
- The contract: `GET /api/admin/accounts`, `GET /api/admin/account/<name>`,
  `PUT /api/admin/account/<name>/limits`, `end-sessions`,
  `GET /api/admin/graphs?range=`, `GET /api/admin/log` with paging and
  the chain; flag switches logged.
- Limits 0 … 20 × default, a value equal to the default not stored, a
  limit under use deletes nothing.
- Migration 0007: roll-up metrics with a backfill; `admin_log.prev`,
  `mac`; triggers that refuse UPDATE and DELETE and an out-of-line
  insert.
- Sessions shown as count and last use only, not their labels.

## For the owner to choose (round 14)

Mockups: <https://claude.ai/artifact/9yMSTQ4zgef5q1deSduTFC> (round 14,
a canvas of ten views; example data). Four questions:

1. **Layout**: tabs over the page / a side bar / one long page.
2. **Graphs**: one large graph a row / a grid of small graphs that
   open large.
3. **Clean-up**: per account only (End sessions, Suspend, Delete) / also
   a Clean-up list of accounts that look abandoned (never used after
   creation, or not seen for a long time), several deleted at once with
   one typed confirmation.
4. **Default limits**: per account only, the defaults in code (spec as
   written) / also the defaults for everyone edited from /admin.

### The owner's picks (2026-11-16)

- **1b, a side bar**: grouped links (Look after: Reports, Accounts, Log;
  Numbers: Use, Storage, Sharing; Site: Flags and limits); a row of links
  over the view on a phone.
- **2b, a grid of small graphs**: each card the latest figure large and
  the range as a small graph; a click opens it large with hover and
  Table (2a's form).
- **3a, clean-up per account**: End all sessions, Suspend / Restore,
  Delete on the account's page; no Clean-up list.
- **4b, the defaults too**: the default limits for every account are
  edited from /admin (the Flags view, "Flags and limits"), without a
  release; accounts with their own keep them.

## Tasks

### A. Plan and mockups

- [x] This file; ADR 0157.
- [x] Mockups round 14 as an artifact; the owner's picks recorded here
      and in ADR 0157's addendum.
- [x] The contract in `shared/cloud/api.ts` ("The admin panel"), on main
      before the agents start.

### B. Worker (worktree `stage66-worker`, port 5481)

- [x] Migration `0007_admin_panel.sql`: metrics backfill, `admin_log`
      columns and triggers.
- [x] Roll-up of the new metrics; `GET /api/admin/graphs`.
- [x] `GET /api/admin/accounts`, `GET /api/admin/account/<name>`,
      `PUT …/limits`, `end-sessions`; `GET`/`PUT /api/admin/limits` (the
      defaults, pick 4b) read by every limit check and `/api/config`.
- [x] The log's chain on every insert (moderation, deletion, limits,
      flags); `GET /api/admin/log` paged with the chain's check.
- [x] Tests: every endpoint; the triggers; the chain broken and found;
      the deletion guard test over `sqlite_master`; the Access walk.

### C. The page (after the picks; contract from B's first commit)

- [x] C1 (worktree `stage66-page`, port 5482): the split into modules,
      the views and navigation, Accounts, one account, limits, clean-up,
      the Log view, Flags.
- [x] C2 (worktree `stage66-graphs`, port 5483): `worker/admin/graphs.ts`
      — the SVG graphs, ranges, hover, Table, Use / Storage / Sharing.
- [x] Unit tests (happy-dom) for both: hostile names and notes as text,
      every call's path and body, the confirmations.

### D. Checks

- [x] An independent security review (Access on every admin path, no
      admin action without Access, deletion removes everything in D1
      and R2, the audit log cannot be changed) and `/code-review` high;
      fixes with tests.
- [x] Unit; worker; the full e2e alone at 5 workers (a failure rerun
      alone before it is called one); the benchmark; the entry chunk;
      `npm run test:sync-worker`.

Review (2026-11-16): the security review
(`notes/research/stage66-security-review.md`) found no high or medium
findings: Access held against 18 path tricks with GET, HEAD and OPTIONS,
hostile limits all refused, the deletion guard complete but for one race.
Low S2–S7, S9, S11 fixed with tests (unsealing now reads broken, every
broken entry is listed, the Reports card reads 20 rows without the chain
check, a report racing its author's deletion, a run id posing as a name,
`#__proto__`, the certs back-off, a 503 for the flag switch); S10
accepted; **S1 and S8 open for the owner** (below). B also found and
fixed two deletion gaps itself: `session_end` kept the account id,
`pub_view` kept views until the prune. `/code-review` high CR1–CR8 all
fixed (byte limits lost precision through the form, stale answers in
Accounts and Log, a failed defaults load not cached, sequential graph
queries, the log count, a duplicated helper, two byte formatters). ADR
0157 "As built (stage 66, review fixes)".

Checks (2026-11-16): typecheck; unit and worker 5 454 passed, 2 skipped;
full e2e alone at 5 workers 1 892 passed, 4 failed under load (Firefox
import:148, loading:84, menubar:182; phone-share-link:68), all four passed
alone 12/12; entry chunk 31.36 kB (unchanged: no client code changed in
this stage, `src/` untouched); benchmark key → send median 0.04 ms, burst
46 528 lines/s at load 1.9 (stage 65's 76 801 was measured right after a
build; the client bundle is the same code, so this is the machine);
`test:sync-worker` 6/6.

### E. Staging

- [ ] Push `main`; `deploy.yml` to staging with migration 0007;
      `test:prod` against <https://staging.mumecockpit.com>. No tag.

### F. Production (only on the owner's word)

- [ ] The owner has tested on staging and said yes.
- [ ] Release 0.15.0: tag, migration 0007; `test:prod` against
      mumecockpit.com.

## Test guide (owner)

On staging, <https://staging.mumecockpit.com/admin> (Access asks for
your e-mail as before). Desktop first, then a quick look on the phone.
Staging has little traffic, so the graphs are thin; storage history
starts today.

1. **The side bar.** Reports, Accounts, Log; Use, Storage, Sharing;
   Flags and limits. Each view keeps its place on reload and Back works.
   On the phone the side bar becomes a row of links.
2. **Use.** A grid of cards (30 days). Try 24 h, 7 days, All. Click a
   card: it opens large; move the mouse (or the arrow keys) for the
   values; Table shows the numbers.
3. **Storage and Sharing.** The totals, storage by kind, the ten largest
   accounts (a name opens its account), shares, votes, comments a day.
4. **Accounts.** Search a part of a name, sort by a heading, filter
   Suspended. Open your test account.
5. **One account's limits.** Give it, say, Runs 100 MB; Save asks first
   and lists the change. Type a value below what it uses: the warning.
   Reset to defaults.
6. **Default limits** (Flags and limits). Change one default, Save; then
   Back to built in.
7. **Remove a test account** (the stage test). Make a throwaway account
   on staging (a private window: Create account), store something
   (a profile, a run). In /admin open it → Delete account…, type the
   name. It is gone from the list; Create account with the same name is
   refused (the name stays reserved).
8. **End all sessions** on your test account: the device that was
   logged in is told it was logged out.
9. **The log.** Every step above is there, newest first, with the kind
   tags; the badge says "Sealed and intact". Filter by kind.

Feedback wanted: is the side bar and the grid right; are the graphs
readable; anything you miss on an account's page or in the log.

## Owner feedback
