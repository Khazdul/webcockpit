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
  line has a gap around the handle. Click toggles fold; drag snaps list →
  rail → folded; double-click returns to the automatic width; arrow keys
  on the handle step. On touch it shows faintly at rest.
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
  its popup (ADR 0107): the channels shown in Public (checkboxes; Tells
  and Whispers off by default, they live in the chats) and "Show chats
  active in the last 10 / 30 / 60 min / All" (default 30). The open chat
  and chats with unread always show.
- **No channel header** and no in-pane channel toggles; `comm.showHeader`
  goes away (migration drops it).

**Which talk opens a chat:** tells, whispers (directed or not), says,
emotes and socials (directed or not), from a player other than you.
Prayers go to the Valar and never open a chat. These "near" channels show
as bubbles in the person's chat and are the only ones that raise its
unread count and move it to the bottom. A person's chat shows **all**
their messages on every channel: the other channels (narrates, yells,
songs, questions, prayers) as quiet centred "overheard" one-liners with
the channel name as text. No channel icons anywhere in the thread; in
Public and Group the verb carries the channel colour.

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
`tell <name> <text>`; your bubble shows a small `tell` mark. In Public it
sends `say`, in Group `say` (MUME has no group channel to our knowledge;
revisit if one is found). Hidden in a log player, a replay and when not
connected.

**Text is selectable** for copy in the thread and in search results; the
pane no longer prevents mousedown there (the input keeps the game's keys
after the selection, as the output pane does).

**Font:** the same body face as Group and Timers (`panes.css` system UI
stack); no new font. Names and times as those panes do.

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
