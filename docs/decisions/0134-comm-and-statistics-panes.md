# 0134 — Comm and Statistics panes: conversations and a live kill feed

- Status: Accepted
- Date: 2026-11-09
- Related: stage 49 (`docs/stages/49-comm-stats-panes.md`). ADR 0016 (pane
  package, settings), ADR 0052 (anchored list), ADR 0095 (pane buttons),
  ADR 0107 (gear popups), ADR 0109 (Statistics pane), ADR 0122 (Group and
  Timers look), ADR 0123 (Lykta frame, Paper). Inv §2.7 (Comm pane) and
  §7.3 (Statistics): this ADR replaces their drawing and filtering rules
  for the pane; the data rules (GMCP parsing, archive, run events,
  `buildStats`) stay.
- Mockups: `notes/research/comm-stats-mockups/` (README lists all rounds
  and artifacts). References: **`stats-r4.html`** (Statistics, approved
  as is) and **`comm-r6.html` variant 1 "Stilla ton"** (Comm). They are
  throwaway HTML; re-derive the look from the real pane code.

## Context

The owner wants the Comm and Statistics panes reworked in the spirit of
stage 39/40: a modern look in the Lykta frame, more useful, more alive.
Six Comm rounds and four Statistics rounds on 2026-11-09 settled the
design below. The owner's last words: "Vi kör vidare på detta. Var väldigt
noggrann när vi börjar bygga att testa så att vi inte tappar någon
prestanda (mer än nödvändigt och det ska i så fall stämmas av)."

## Decision — Statistics pane

Top to bottom:

1. **Header row** as in round 1 concept 1: character, level, the run
   clock (counts up each second), the stars, `with <allies>`.
2. **Four tiles:** Avg / kill, Median, XP / h, Kills.
3. **Earlier:** every mob kill and pkill of the run, oldest at the top,
   newest at the bottom. Bottom-anchored: it follows new kills unless the
   user has scrolled up, then a `↓ N new` pill. Each row: mob name, XP, a
   bar on the session scale with a faint median tick, the age. No grade
   letters column.
4. **Latest kill card** at the bottom: mob name, XP, the rating badge, the
   five-step scale with a marker. No `× median` line. On a new kill the
   previous card's kill slides into the list's last row.

No level bars, rings or segment bars.

**Rating** (pure, `src/runs/kill-rating.ts`): r = XP / median of the last
30 mob kills (pkills are rated against the same median but never enter
it). Poor < 0.45 ≤ Meh < 0.8 ≤ Good < 1.5 ≤ Great < 2.5 ≤ Superb. Fewer
than 5 kills: `calibrating…`, no badge. Rows are rated against the current
median (they may change rating during the run; owner accepted). The
rating is always shown with its word (badge) or bar length, never colour
alone. Colours: a dark and a light (Paper) ramp, each derived per tint as
the mockup does.

**Numbers:** XP under 1000 exact (`540`), from 1000 `fmtK` (`2.6k`).

**Scope:** the in-game pane only. The phone's ESC frame keeps `statsBody`
(ADR 0109) unchanged; History → Stats (ADR 0130) is unchanged. The model
stays `buildStats`; the rating and the kill list are added beside it.

## Decision — Comm pane

**Layout:** a chat column at the left and the thread at the right.

- **Column**, by the pane's own width (ResizeObserver, not the viewport):
  below 380 px an icon rail (coloured initials, unread dot, tooltip),
  from 380 px a name list (name, time, snippet, unread count). Public and
  Group are pinned at the top; then a gap; then the private chats,
  **oldest at the top, newest at the bottom, filling from the top** (one
  chat sits right under Group). When they overflow, the list scrolls,
  starts at the bottom, and shows a stronger edge fade with a small lamp
  chevron where more content is (a dot on it when a hidden chat has
  unread; no counts).
- **Spine** between column and thread: invisible at rest, fades in on
  hover (about 5 px each side), while dragging and on keyboard focus; its
  line has a gap around the handle, which is a small fold button with a
  chevron toward the fold (shown on hover and focus). A click folds at
  once; drag snaps list → rail → folded; a double-click does nothing more;
  arrow keys on the handle step. On touch it shows faintly at rest.
  (Owner's first test, see the addendum.)
- **Folded:** the thread fills the pane; at the top-left an unfold icon
  (with the unread dot) and directly right of it a chip naming the open
  chat (coloured initial + name, or the Public / Group icon). The fold
  state and a dragged width are kept per pane in the settings.
- **Search:** a round magnifier at the thread's top-right, also Ctrl+F
  while the pointer is over the pane; it expands into a field with focus;
  Esc, × or blur on an empty field folds it. Results replace the thread in
  two kinds: **People** (clickable, `Open chat →`) and **Messages** (every
  comm message on every channel, match highlighted, selectable, not
  clickable). Search covers chats hidden by the time window.
- **Gear** among the pane hover buttons (ADR 0095), as Group and Timers;
  its popup (ADR 0107): the channels shown in Public (checkboxes; Tells,
  Questions and Socials off by default, they live in the chats; owner's
  feedback round 2) and "Show chats active in the last 10 / 30 / 60 min / All"
  (default 30; the label above the control, no explanation text). The
  open chat and chats with unread always show.
- **No channel header** and no in-pane channel toggles; `comm.showHeader`
  goes away (migration drops it).

**Which talk opens a chat:** tells, whispers (directed or not), says,
emotes and socials (directed or not) and questions (MUME's `ask`), from a
player other than you. Prayers go to the Valar and never open a chat.
These "near" channels show as bubbles in the person's chat and are the
only ones that raise its unread count and move it to the bottom.
*Changed in the addendum "Bubbles only for talk to you" below: only
tells, and whispers and questions directed at you, are bubbles; the rest
of the near talk is drawn as lines. Open, raise and unread are unchanged.* A
person's chat shows **all** their messages on every channel: the other
channels (narrates, yells, songs, prayers) as **left-aligned lines,
whole and formatted as in Public** (the verb in the channel colour), with
no bubble: not to you. A bubble's channel and time show beside it only on
hover, small and quiet, taking no height. No channel icons anywhere in
the thread.

**Group:** pinned under Public with a group icon. It shows every channel
from the current group's players (GMCP `Group.*`, `type` player; NPCs
such as a warg or a pack horse are left out; see
`notes/research/gmcp-group.md`) plus your own lines, with "joined / left
the group" lines. Unread is a dot only. With no group it stays in place,
dimmed.

**Your own messages ("Stilla ton"):** in Public and Group a flat, faint
lamp tint, no gradient, no edge bar, no indent; in a chat right-aligned
bubbles in the same flat tint. Others' bubbles left, their name in their
colour.

**Per-person colour:** stable per name for the session from a curated
palette; no two people share one until the palette is used up; you and
enemies (`*Name*`) have fixed colours. On Paper colours are refitted for
contrast (`lightShift` / `fitContrast`, as Comm does today).

**Reply line:** in a chat a plain field `Reply to <Name>…` that sends
`tell <name> <text>`; your bubble shows a small `tell` mark. In Group it
sends `tell group <text>` (owner, 2026-11-09). **Public has no reply line**
(owner's first test). Hidden in a log player, a replay and when not
connected. A click focuses it and typing stays there; after Enter it keeps
the focus; Esc gives the keys back to the game.

**Group tells:** MUME sends them on the `tells` channel with no
destination and the text `<Name> tells the group '…'` (seen in the
owner's Cockpit comm archives and run logs, 2026-09/10; the current pane
wrongly shows them as `<Name> tells you`). They go to Group, and into the
sender's record, shown there as a bubble marked "group" with a small,
always visible `grouptell` line under it (owner's feedback, rounds 1 and
2: in a large group it may not be meant for you); they never open, raise or count in a private chat. Your own `tell group` has not been captured: the model takes
a `destination` of `group` / `the group`, or a text `You tell the group
'…'`, as a group tell; check the real form in the first live test.

**Text is selectable** for copy in the thread and in search results; the
pane no longer prevents mousedown there (the input keeps the game's keys
after the selection, as the output pane does).

**Font:** the same face as Group and Timers: the pane's own (monospace)
font; no new font. Names and times as those panes do (corrected in the
49c addendum).

**Theming:** every colour from the pane tint tokens as Group and Timers
(ADR 0122/0123): seven tints, Paper, border off, clear background (cards
and bubbles keep a little `--pane-fill` backing).

**Data:** the archive (`comm-archive.ts`, 1000 messages / 7 days) and
`Comm.Channel.*` parsing stay. A pure conversation model
(`src/gmcp/comm-chats.ts`) derives chats, unread, ordering, the window
filter and search from the message history and the group roster.

## Performance rules

The owner asked that nothing gets slower than necessary, and that any
cost is agreed first.

- Baseline on `main` before the build, the same measures after, interleaved
  runs, Firefox and Chromium (stage 39's method).
- Comm: a message is appended in place (no thread or column rebuild); the
  thread renders only the open chat and keeps a bounded DOM (the newest
  rows plus more on scroll up); the column updates only the rows that
  change; search runs on input with a short debounce over at most 1000
  messages; no layout reads per message; `contain: strict`.
- Statistics: a kill appends one row and replaces the card; the 1 Hz tick
  writes only the clock text (and ages once a minute); the list keeps a
  bounded DOM with long runs; no work while hidden (ADR 0109 rule kept).
- Animations by transform and opacity only; respect reduced motion.
- Any measured regression beyond noise is reported to the owner with
  numbers before the merge.

## Consequences

- Inv §2.7 (header, solo, filters) and the Statistics pane parts of §7.3
  and ADR 0109 ("Adaptive layout", "Header", "Keys and focus") are
  superseded for the pane; pointers are added.
- `comm.filters` keep their meaning for Public; `comm.showHeader` is
  dropped; new `comm.chatWindow` (`10 | 30 | 60 | 'all'`, default 30) and
  per-pane fold / width.
- The Options → Panes → Comm page and the gear share the new rows.
- The Statistics pane moves off the shared `statsBody`; the phone keeps it.

## Addendum: 49a findings (2026-11-09)

- **Settings:** `comm.chatWindow` (default 30), `comm.folded` and
  `comm.listWidth` (CSS px, 40–400, null = automatic) live in the `comm`
  settings (there is one Comm pane; the gear, the Options page and a
  player's VIEW records already carry `comm`). Tells and Whispers off in
  Public for new users (`COMM_PUBLIC_DEFAULT_OFF`) go into the defaults in
  49c with the new pane: the old pane's filters hide a channel from the
  whole pane. Stored filters are kept. `comm.showHeader`
  stays in the settings until 49c replaces the pane, its gear and the
  Options page (removing it now would rewrite the old header code and its
  tests only to delete them in 49c); 49c drops it.
- **Talker types:** MUME's `talker-type` is `npc`, `ally`, `neutral` or
  `enemy` (Cockpit `docs/gmcp.md`); the archives also show `player`. Only
  `npc` keeps a talker out of the chats. Your own messages carry `talker`
  "you", the `destination` and only the message as `text`.
- **Own directed emotes:** GMCP carries no target for emotes; an own emote
  or social that names a person with a chat goes to that chat (whole
  word). Others' emotes open their chat whether directed or not.
- **Group view:** placed at arrival by the roster then; an archive load
  (before the roster is known) leaves Group empty until new talk.
- **Rating:** the median leaves out kills that gave no XP (a fold without
  an XP change); the Median tile shows the rating's median (the last 30
  mob kills). XP text is `fmtK`, already exact under 1000.

## Addendum: 49b, the Statistics pane as built (2026-11-09)

- **View:** `src/chrome/stats-pane.ts` (direct DOM, no Preact) with its
  pure parts in `stats-pane-model.ts` and `stats-pane.css`; still mounted
  by the chrome chunk through `ctx.statsView` (ADR 0109). The pane's text,
  label and track shades and light / dark are set on the content element
  by `src/panes/statistics.ts`, as Timers sets its `--tm-*`.
- **Font:** the pane's own font at em sizes, as Group and Timers (not a
  system UI stack: the "Font" line of the Comm decision above meant the
  same face as those panes, which is the pane font).
- **The list is virtual:** one row height (measured from a probe row on a
  size change), only the rows in view plus six on each side exist, so a
  run of any length scrolls through every kill with a few dozen rows in
  the DOM. Rows alternate by index, not by DOM order.
- **Bars:** `transform: scaleX(min(1, --xp / --st-scale))` with the scale
  3 × the median (the median tick sits at a third); while calibrating the
  scale is the largest mob kill and there is no tick. A new median
  rewrites one custom property and the rating word of rows that changed.
- **The feed no longer loads every second.** Main's feed reloaded the
  whole chain (`chainEvents` + `buildStats`) once a second while a run was
  live: that was the pane's 1 Hz cost. Now: loads on run events (≤ 1/s),
  a refresh every 60 s while a run is live (XP / h, ages), and a 1 Hz
  check without a load for the run's end (a finishing replay sends no run
  event). The clock and the card's age are the view's own 1 Hz text
  writes; the rows' ages once a minute.
- **Per kill:** the card's elements are made once and updated in place;
  `--st-scale` is rewritten only when it moved more than 3 % (so most
  kills restyle no row); following the bottom costs one scroll write. A
  reversed-column scroller (no scroll write) was tried and dropped: no
  gain in Chromium, about 2 ms slower frames after a kill in Firefox.
  Reduced motion is read from a kept media query list (a `matchMedia`
  per kill is avoidable work). The slide and the card's fade take 200 ms;
  together they cost Chromium about 8 ms of main-thread time per kill
  (layer changes and extra frames), measured with and without them.
- **Selection:** rows can be selected (no mousedown prevented in the
  list); elsewhere the pane keeps the game's keys as before.
- **Small panes** (container queries in the view's em): below 26 em high
  the card drops its scale, below 21 em the tiles and the section title
  go; below 24 em wide the tiles are two by two and the age column goes,
  and with less than 30 em of height there the tiles go.
- **Removed:** `statsPaneLayout`, `paneHeader` and the pane's kit CSS; the
  phone's ESC frame keeps `statsBody` and `TuiScrollbar`.

## Addendum: 49c build notes (2026-11-09)

- **Font:** Group and Timers draw in the pane's own font (the cockpit's
  monospace), not the system UI stack the decision named; Comm does the
  same, so the three panes match.
- **Column mode:** from the pane's width in cells × the cell width (the
  pane re-renders on every size change), not a ResizeObserver: no
  measuring at all.
- **Chevrons:** which chats are out of view (and whether one of them has
  unread) comes from an IntersectionObserver on the rows, so the column
  reads no layout per message.
- **Thread:** the newest 200 messages of the open view are built; a scroll
  near the top adds 200 more (AnchoredList builds only the ones put in
  front and keeps the view). A gap of more than 5 minutes shows the time.
- **Search results:** People first, then Messages newest first, at most
  200, 120 ms after the last keystroke; they replace the thread.
- **Selection:** a selection in the thread or the results is copied on
  mouse up, as the output pane does; the game's keys still reach the game.
- **Group unread:** a dot only, as decided; Public keeps a count.
- **Compact column:** below 14 cell rows each entry is one line (no
  snippet), so the private chats keep room in the default dock.
- **Column texts at most once a second:** snippets and ages catch up at
  ≤ 1 Hz; order and unread change at once; a column write is skipped when
  nothing changed. The column is contained, so it never lays out the
  thread, and the thread is block flow (a new message lays out itself).
- **Chat list order by CSS:** the list keeps to the newest chat without
  script scroll reads or writes; a raised chat is one DOM move.

## Addendum: review fixes (2026-11-10, 49d)

A fresh review of the merged branch led to these rules:

- **Roster:** the pane treats the group roster as known only after a
  `Group.*` message in this connection; the first is a baseline (no
  "joined" lines), later changes give joined / left lines; a disconnect
  forgets it. An empty known roster places none of your own lines in
  Group. After an archive load Group starts empty (archived group tells
  too).
- **Colours** survive a rebuild (reconnect, archive load) for the session;
  a colour slot is dealt only when a chat opens, never to a voice heard
  only on narrate and the like. **Unread** is carried over a rebuild by
  chat key (the higher of old and new).
- **Trimmed chats:** when the 1000-message cap removes a chat's last
  message, the chat leaves the list unless it has unread or is open.
- **Reply line** is hidden in a chat with an enemy (`*Name*`) or a name
  of more than one word (no reliable tell target); the tell uses the whole
  name.
- **Spine:** a click folds after 300 ms (`SPINE_DBL_MS`) so a double-click
  returns to the automatic width without folding. *Superseded by the
  owner's first test below: a click folds at once, no double-click reset.*
- **Search results** refresh on new talk only when it matches, keep their
  scroll, wait while a selection sits in them, and re-ink on a tint or
  Paper change.
- **Hidden panes:** Comm's age timer stops while the pane is hidden; the
  Statistics list restores its scrolled-up position when shown again.
- Public's filtered list is cached between renders (appended per message,
  rebuilt on a filter change).

## Addendum: owner's first test, Statistics (2026-11-10)

Supersedes for the pane: "Fewer than 5 kills: `calibrating…`" above, the
card's age, and "a faint median tick" per row.

- **Calibrating** (fewer than 5 mob kills in the window): the card shows
  the kill's name and XP only. No badge, no `calibrating…` text and no
  scale (with no median the scale and its marker mean nothing). The list
  has no median line then. A pkill keeps its `⚔ PvP` badge and has no
  scale, as before.
- **The card's label** is `Last kill` alone, without an age. The 1 Hz
  tick now writes only the run clock (the rows' ages still once a
  minute).
- **The median line** is one element over the whole list
  (`.wc-st-medline` in the virtual list's space, the list's full height,
  above the rows, no pointer events), laid out on the rows' own grid
  (same columns, gap and padding, in each width mode), so it sits at a
  third of the bar column (the bars' scale is 3 × the median) and runs
  through as one dashed line. It scrolls with the rows. A median change
  still rewrites only `--st-scale`; the line never moves.

## Addendum: owner's first test, Comm (2026-11-10)

The owner tested the merged branch (feedback in
`docs/stages/49-comm-stats-panes.md`). Changed rules, now in the decision
text above:

- **Public has no reply line;** chats and Group keep theirs. The reply
  field takes the focus on a click (the cockpit no longer hands the keys
  back to the game on a mouse up in a pane field marked
  `data-wc-own-keys`); Enter sends and keeps the focus; Esc returns the
  keys to the game (`PaneContext.focusGame`). Its placeholder is a step
  quieter than the dim text (about 4:1 dark, 3:1 on Paper).
- **Spine:** the handle is a small fold button with a chevron (‹), shown
  on hover and focus; a click folds at once; the double-click reset and
  the 300 ms delay are gone; drag snapping and the arrow keys stay.
- **Bubble meta** (`tell · 09:56`): beside the bubble (left of yours,
  right of theirs), small and quiet, shown only while that bubble is
  hovered, taking no height; never on touch. It stays in the DOM for
  readers (not copied).
- **A group tell in the sender's chat is a bubble** marked "group"; the
  rule that it opens, raises and counts nothing is kept.
- **Overheard lines** (narrate, yell, song, prayer) are left-aligned and
  whole, formatted as in Public, with no bubble.
- **Questions are a near channel** (open a chat, bubbles, unread), as
  whispers.
- **Public defaults:** Tells, Says, Emotes, Whispers, Questions and Socials
  off (`COMM_PUBLIC_DEFAULT_OFF`). *Changed in round 2 below: only Tells,
  Questions and Socials.* Settings version 5: settings stored
  before it turn these off once (the old pane's filters hid a channel
  from the whole pane; now they shape Public only). Filters changed after
  that are kept.
- **Gear popup:** the chat-window row puts its label above the
  10 / 30 / 60 / All control, which spans the popup (now 21.5 em wide);
  the explanation text is gone.

## Addendum: owner's second test, Comm (2026-11-10)

- **Public defaults:** only Tells, Questions and Socials are off
  (`COMM_PUBLIC_DEFAULT_OFF`); Says, Emotes and Whispers show in Public.
  The version 5 migration (not released) turns off only these three in
  settings stored before it; no version 6. A browser that already ran the
  earlier, six-channel v5 migration keeps its filters (the owner turns the
  three back on in the gear).
- **Group tells in a person's chat** carry an always visible `grouptell`
  line under the bubble, small and very quiet, on a little line of its own
  (unlike the hover meta).

## Addendum: owner's second test, Statistics (2026-11-10)

Supersedes for the pane: the Kills tile, the `Earlier` title, `No run yet`
as a centred line, and (from the first test's addendum) a calibrating card
without a scale.

- **Empty layout:** before the first kill the pane shows its whole
  layout, empty: the header, the four tiles with `—`, `Kills 0` and the
  `Last kill` card with its label only, at the height it has with a kill
  (its lines and scale keep their room, not drawn). With no run at all
  the layout is the same: the header shows the character from `Char.*`
  (or `—` before any GMCP) and `no run yet` in place of the clock. One
  layout for every state, so nothing jumps when the first kill comes.
- **Calibrating:** the card's scale keeps its room but is not drawn (so
  the card does not grow when rating starts); still no badge.
- **`Kills N`** is the list's title, N every kill of the run including
  the one on the card.
- **TNL tile** (in place of Kills): the XP left to the next level, from
  `Char.Vitals` `xp` and the level table (`xpToNextLevel`,
  `src/gmcp/levels.ts`, the Character pane's source). The pane shell
  reads it on the game state's `char` change and tells the view only
  when name, level or TNL changed (no per-second work; HP-only vitals
  cost a compare). `fmtK` as all XP in the pane (exact under 1000).
  Unknown XP or the top level: `—`.

## Addendum: NPCs in Public (2026-11-10)

The owner: a switch for whether Public shows NPCs, off by default.

- **Setting:** `comm.npcs` (boolean, default `false`). Additive, no
  version bump; a stored value that is not `true` reads as off, so every
  existing user gets the new default.
- **What counts:** a message whose `talker-type` is `npc` (e.g.
  Gwaihir's says). Group and the chats are unchanged (NPCs were never in
  them).
- **Where:** `publicShows(comm, msg)` in `src/gmcp/comm.ts` is the one
  test: the Public view, its last-message snippet and the Public unread
  count all use it. The Public cache rebuilds when `filters` or `npcs`
  change.
- **UI:** in the Comm gear popup its own section after the channels
  (owner): `PUBLIC SHOWS NPCs` in the section heading's style, at the
  left edge, its switch at the right on the same row, no help text. In
  Options → Panes → Communication: `[ ]    NPCs` after the ten channels.

## Addendum: Bubbles only for talk to you (2026-11-10)

The owner, after the release: in a private conversation only tells, and
asks or whispers directed at you, should be speech bubbles. Everything
else should look as narrates do, so that talk that may not have been to
you does not look as if it was.

- **Rule:** in a person's chat a message is a bubble only when it is
  private talk between you and that person, or a group tell. Everything
  else is a line as in Public (left-aligned, whole, the verb in the
  channel colour): says, emotes and socials (the whole action text),
  undirected whispers and questions, the overheard channels as before,
  and your own emotes and socials placed in the chat. Your own lines
  there carry Public's faint own tint.
- **`ChatEntry.direct`** (`src/gmcp/comm-chats.ts`), set in `add`:
  - Another player's message: a `tells` that is not a group tell; a
    `whispers` or `questions` whose text says it is to you.
  - Your own: a `tells`, `whispers` or `questions` with a person as
    `destination` (not a group tell). An own emote or social placed in a
    chat by the name heuristic is not direct.
- **The text heuristic:** `saysToYou(text)` in `src/gmcp/comm.ts`, the
  one test for both the model and `formatComm`: in the ANSI-stripped
  text, the part before the first `'` (all of it when there is no quote)
  holds the whole word `you`, any case. `Dori whispers to you 'hi'` and
  `Ecthel asks you 'where?'` are to you; `Ecthel asks 'anyone near
  Rivendell?'` and `A shadow whispers 'I won't allow…'` are not. One
  string scan per whisper or question; `add` stays O(1).
- **`near` is unchanged:** which talk opens a chat, raises it and counts
  as unread is as before (tells, whispers, says, emotes, socials and
  questions, directed or not). Only the drawing changed.
- **The group tell bubble is kept**, with its "group" meta and the
  `grouptell` line under it (owner's first and second test).
- **A run of bubbles** (`is-cont`, the tighter gap) continues only after
  a bubble, not after a line. The italic action bubble (`is-act`) is gone:
  no action is a bubble any more.
- **`formatComm` follows the text** (Public, Group, the lines in a chat,
  search): an incoming tell stays `<Name> tells you '…'`; an incoming
  whisper shows `whispers to you` only when `saysToYou` holds, else
  `<Name> whispers '…'` (it was always `to you`); an incoming question
  shows `<Name> asks you '…'` when it holds (the `you` was dropped). Own
  messages, group tells and the prepositions are as before.
  `DIRECTED_CHANNELS` had no other use and is removed.
- **Open:** the real GMCP text of an incoming player whisper and of a
  directed ask has not been captured. The archives hold only an own
  whisper with a destination and an undirected `asks '…'`; the forms
  `<Name> whispers to you '…'` and `<Name> asks you '…'` are assumed. To
  be checked in the next live test; if MUME words them otherwise, only
  `saysToYou` needs to change.
