# Stage 49 — Comm and Statistics panes

Status: **In progress** (2026-11-09).

## Goal

The Comm pane becomes a conversation pane (Public, Group and one chat per
person, search, fold-away column) and the Statistics pane becomes a live
kill feed with a session-relative rating, both in the Lykta look with
every tint, Paper, border off and clear background. ADR 0134 holds every
decision; the mockups are in `notes/research/comm-stats-mockups/`
(references: `stats-r4.html`, `comm-r6.html` variant 1).

**Performance is a gate** (owner, 2026-11-09): measure `main` first, the
same after, and agree any regression beyond noise with the owner before
the merge.

## Parts

- **49a Baseline and foundations:** performance baseline on `main`
  (before any pane code changes); micro-benchmarks for the two panes;
  settings types, defaults and migration; pure models (kill rating, chat
  model) with unit tests.
- **49b Statistics pane:** the new renderer in the pane (header, tiles,
  Earlier, card), theming, the feed's work rules; unit and e2e tests.
- **49c Comm pane:** column (rail/list), spine and fold, Public / Group /
  chats, thread (bubbles, overheard, own messages), reply line, search,
  gear popup and Options page, selection, theming; unit and e2e tests.
- **49d** Performance comparison, code review, docs (Inv pointers, script
  manual if `state` changes, user manual), test guide, progress.md.

## Tasks

- [ ] 49a: baseline on `main`: `bench/browser-bench.ts --only
      budgets,play,keys,soak` in Firefox and Chromium at the owner's
      geometry, Comm and Statistics panes on; results in this file
- [ ] 49a: micro-benchmarks (`bench/`): Comm message burst (50 messages in
      1 s, 1000 in history; frame after a message, main-thread time per
      message), Statistics kill (frame after a kill, 1 Hz tick cost, 500
      kills in the run); run on `main` for the baseline
- [ ] 49a: settings: `comm.chatWindow` (default 30), per-pane fold and
      column width, drop `comm.showHeader`; Public defaults with Tells and
      Whispers off; migration and unit tests
- [ ] 49a: `src/runs/kill-rating.ts` (median of the last 30 mob kills,
      thresholds, calibrating < 5, XP formatting < 1000 exact); unit tests
- [ ] 49a: `src/gmcp/comm-chats.ts` (near channels, chats per person, all
      channels per person, unread, order, window filter, Group from the
      roster with players only, joined/left, search people + messages,
      per-person colours); unit tests
- [ ] 49b: Statistics pane renderer per ADR 0134 (replaces `statsBody` in
      the pane only; phone ESC frame and History untouched)
- [ ] 49b: theming (tints, Paper, border off, clear), reduced motion
- [ ] 49b: e2e (header, tiles, list anchoring and `↓ N new`, card slide,
      calibrating, Paper)
- [ ] 49c: column rail/list by pane width, pinned Public and Group, chat
      list order and fill, edge fade and chevron
- [ ] 49c: spine (hover, drag snaps, double-click, keys, touch) and fold
      with the open-chat chip
- [ ] 49c: thread: bubbles, overheard lines, own messages "Stilla ton",
      bounded DOM, bottom anchoring
- [ ] 49c: reply line (tell / say), hidden in players, replay and offline
- [ ] 49c: search (magnifier, Ctrl+F, People and Messages)
- [ ] 49c: gear popup and Options → Panes → Comm page
- [ ] 49c: text selection and copy without stealing the game's keys
- [ ] 49c: theming (tints, Paper, border off, clear)
- [ ] 49c: e2e (chats open and order, Group roster, search, fold, gear,
      reply sends a tell, selection, Paper)
- [ ] 49d: performance after, interleaved with `main`; table in this file;
      regressions agreed with the owner
- [ ] 49d: code review (fresh reviewer), fixes
- [ ] 49d: docs (Inv §2.7 and §7.3 pointers, ADR 0109 addendum, manual),
      test guide, progress.md

## Performance

Baseline (main) and after: to be filled in 49a and 49d.

## Test guide

To be written in 49d.

## Owner feedback

None yet.
