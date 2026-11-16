# Stage 66 — The admin panel

Status: **In progress (2026-11-16)**; the owner picked round 14 (1b, 2b,
3a, 4b); building.

## Waiting for the owner

Nothing yet: round 14 is picked (below); the build is running.

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

- [ ] Migration `0007_admin_panel.sql`: metrics backfill, `admin_log`
      columns and triggers.
- [ ] Roll-up of the new metrics; `GET /api/admin/graphs`.
- [ ] `GET /api/admin/accounts`, `GET /api/admin/account/<name>`,
      `PUT …/limits`, `end-sessions`; `GET`/`PUT /api/admin/limits` (the
      defaults, pick 4b) read by every limit check and `/api/config`.
- [ ] The log's chain on every insert (moderation, deletion, limits,
      flags); `GET /api/admin/log` paged with the chain's check.
- [ ] Tests: every endpoint; the triggers; the chain broken and found;
      the deletion guard test over `sqlite_master`; the Access walk.

### C. The page (after the picks; contract from B's first commit)

- [ ] C1 (worktree `stage66-page`, port 5482): the split into modules,
      the views and navigation, Accounts, one account, limits, clean-up,
      the Log view, Flags.
- [ ] C2 (worktree `stage66-graphs`, port 5483): `worker/admin/graphs.ts`
      — the SVG graphs, ranges, hover, Table, Use / Storage / Sharing.
- [ ] Unit tests (happy-dom) for both: hostile names and notes as text,
      every call's path and body, the confirmations.

### D. Checks

- [ ] An independent security review (Access on every admin path, no
      admin action without Access, deletion removes everything in D1
      and R2, the audit log cannot be changed) and `/code-review` high;
      fixes with tests.
- [ ] Unit; worker; the full e2e alone at 5 workers (a failure rerun
      alone before it is called one); the benchmark; the entry chunk;
      `npm run test:sync-worker`.

### E. Staging

- [ ] Push `main`; `deploy.yml` to staging with migration 0007;
      `test:prod` against <https://staging.mumecockpit.com>. No tag.

### F. Production (only on the owner's word)

- [ ] The owner has tested on staging and said yes.
- [ ] Release 0.15.0: tag, migration 0007; `test:prod` against
      mumecockpit.com.

## Test guide (owner)

Written when the stage is on staging.

## Owner feedback
