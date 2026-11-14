# 0148 — Published runs, the gallery, moderation and the admin page

- Status: Accepted (owner, 2026-11-13: share a cut run by link; publish
  it to a public page with ratings of 1–5 stars, comments and a top
  list; content shows at once and is removed afterwards; the sender is
  the account name; an admin page at `/admin` with account clean-up and
  graphs). Not built.
- Date: 2026-11-13
- Related: intent Goal 15, spec §7.7–7.9, ADR 0019 (export editor, HTML
  replay), ADR 0144–0147.

## Context

A cut run can today leave the client as a text file or a
self-contained HTML replay. With storage on the server the same cut
can become a link, and the links a public gallery. That is content
from strangers shown to strangers, on the origin that holds the
players' accounts.

## Decision

### Owner's decisions

- The export editor gets a third way out: a **share link**.
- A shared run can be **published**: listed on a public page reached
  from the start menu, with **1–5 stars**, **comments** and sorting by
  best rating.
- Everything shows **at once**; there is a Report button, and the
  owner removes content and blocks accounts afterwards. So a small
  moderation tool ships with publishing, not later.
- The sender shown is the **account name**.

### Sharing

- In the export editor: Text, HTML, **Link**. Link needs a login.
- What is uploaded is the `ReplayPayload` the HTML export already
  builds (ADR 0019): the cut content only, the exporter's settings
  without the phone section, the optional map subset. It is **not**
  encrypted: it is meant to be read. The dialog says so, shows the
  size, and has a title and a description (≤ 500 characters).
- At most 5 MB per payload; it counts against the account's 50 MB
  (ADR 0146). 50 shared runs per account to begin with.
- The link is `https://mumecockpit.com/r/<id>` (a random 12-character
  id). **Unlisted** by default: whoever has the link can watch.
  **Published** is a switch on the same dialog and can be turned on or
  off later.
- The sharer sees their shared runs in a "My shared runs" list (title,
  link, views, stars, listed or not) and can remove any of them. A
  removed run's link says so.
- `ReplayPayload` schema 1 must stay readable by the site for good; a
  new schema adds a reader, never replaces one.

### Watching

- `/r/<id>` works without an account, on desktop, tablet and phone.
- **The replay runs in a sandboxed frame** (`sandbox="allow-scripts"`,
  an opaque origin) that gets the payload by `postMessage`. The replay
  runtime already uses no storage and no network (ADR 0019); in the
  frame it also cannot reach the watcher's cookies, IndexedDB or data
  key if a hostile payload finds a hole in the renderer. Titles,
  descriptions, names and comments are rendered as text only.
- The page around the frame: title, sender, character and level,
  length, date, stars, comments, Report, Download as HTML (the same
  file the exporter would have made).
- A view is counted once per device and day.

### The gallery

- A new start menu entry (working name **Gallery**; the owner picks
  the word and its shortcut letter in stage 65).
- A list in the big box: title, sender, character and level, length,
  date, stars with the number of votes, comments, views.
- Sorting: **Top** (default), New, Most watched. A period filter:
  week, month, all.
- **Top** uses a weighted mean, `(5·m + sum) / (5 + n)` with `m` the
  mean of all votes, so one five-star vote does not beat forty votes
  at 4.6.
- **Stars:** one vote of 1–5 per account and run, changeable, not on
  one's own run. **Comments:** plain text, ≤ 1000 characters, newest
  last, by logged-in accounts; the writer and the run's owner can
  remove a comment. Limits: 20 comments and 60 votes an hour per
  account.
- Watching and reading need no account; voting, commenting and
  reporting do.

### A notice of new runs (owner, 2026-11-13)

- A logged-in player gets a notice when a new run has been published:
  "New in the Gallery: <title> by <name>", or "3 new runs in the
  Gallery" when there are several. Choosing it opens the run or the
  gallery sorted by New.
- Only published runs count, never unlisted links, never the player's
  own, never hidden ones.
- It uses the client's existing notices (the ones the update notice
  uses) and never interrupts: no sound, no popup over the game.
- The client asks `GET /api/u/gallery/news` with its sync (ADR 0146:
  on the start page, when the tab becomes visible, every 5 minutes),
  so a notice can be up to 5 minutes late. The account remembers how
  far it has been told (`gallery_seen`), so a notice read on the
  desktop does not come again on the phone.
- **A switch in the game's Settings turns it off** (owner,
  2026-11-13); it is on by default. The same switch is on the Account
  page. It is one choice for the account, kept on the server
  (`prefs`), so it holds on every device. In Settings it is shown
  only when logged in.
- Not logged in: no notice; the gallery's own "New" sorting shows
  what is new.

### Rules and reports

- Publishing shows the rules once per account and asks for a tick:
  the log shows other players, so no harassment and nothing about
  people's real lives; MUME's own rules apply; you can take it down
  whenever you like; we remove what breaks this.
- **Report** on every run and comment, with a reason. One report per
  account and item.
- Five reports from different accounts hide an item until the owner
  has looked. A hidden run still opens for its owner, with a note.
- An abuse address (`abuse@mumecockpit.com`, forwarded by Cloudflare
  Email Routing to the owner) is on the About and privacy pages, for
  people without an account.

### The admin page

- `/admin`, guarded by Cloudflare Access (one-time PIN or GitHub, the
  owner's identity only) and by the Worker's own check of the Access
  token. It is a separate small page, not part of the client bundle.
- **From stage 59:** today's numbers and the day's use against the
  free plan's limits.
- **From stage 64 (with sharing):** the report queue; hide, restore or
  delete a run or a comment; suspend an account (it can no longer
  share, vote or comment; its sync keeps working) or delete it.
- **Stage 66:** the account list (name, created, last seen, items,
  bytes, shared runs, state), search and sort, limits per account,
  delete with a typed confirmation; graphs for online over time,
  daily, weekly and monthly devices, new devices and accounts, device
  types, browsers, versions, storage, sharing activity. An audit log
  of every admin action.
- The admin page never shows private data: it cannot (ADR 0145).

## Alternatives

- **Approve every run first.** Nothing unsuitable is ever shown, but
  players wait and the owner is the bottleneck.
- **A free display name per publication.** Easier to pose as somebody
  else; an account name is unique and reserved for good.
- **Replays on the main origin without a frame.** Simpler, and one
  renderer bug away from account theft.
- **Thumbs up.** Says less than stars, which the client already uses
  for the player's own runs.

## Consequences

- The site hosts public content from its users. The report path, the
  abuse address and the owner's time for moderation are part of the
  feature, and Cloudflare's terms hold us responsible for it.
- The replay renderer becomes an input parser for hostile data. Stage
  64 includes a review of it with that eye and fuzzed payloads.
- Published logs name other players. That is the uploader's
  responsibility under the rules; the owner removes on request.
- Old links must keep working, which ties the site to reading every
  payload schema it ever accepted.

## Addendum (2026-11-14, plan of stage 59; not built): the admin's identity

- The Worker verifies the Access token itself: signature against the
  team's certificates, issuer, audience, and that the token's e-mail
  is in the Worker secret `ADMIN_EMAILS`. The team domain and the
  audience tag are `vars` in `wrangler.jsonc` (they are not secret);
  the e-mail address is set in the Cloudflare dashboard and is never
  in the repository. Until all three exist `/admin` and `/api/admin/*`
  answer 503 `admin_not_configured`.
- One Access application covers `/admin*` and `/api/admin/*` on
  `mumecockpit.com` and on `staging.mumecockpit.com` (ADR 0144,
  addendum).
