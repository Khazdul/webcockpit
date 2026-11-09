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

- [x] 49a: baseline on `main`: `bench/browser-bench.ts --only
      budgets,play,keys,soak` in Firefox and Chromium at the owner's
      geometry, Comm and Statistics panes on; results in this file
- [x] 49a: micro-benchmarks (`bench/`): Comm message burst (50 messages in
      1 s, 1000 in history; frame after a message, main-thread time per
      message), Statistics kill (frame after a kill, 1 Hz tick cost, 500
      kills in the run); run on `main` for the baseline
- [x] 49a: settings: `comm.chatWindow` (default 30), per-pane fold and
      column width, drop `comm.showHeader`; Public defaults with Tells and
      Whispers off; migration and unit tests
- [x] 49a: `src/runs/kill-rating.ts` (median of the last 30 mob kills,
      thresholds, calibrating < 5, XP formatting < 1000 exact); unit tests
- [x] 49a: `src/gmcp/comm-chats.ts` (near channels, chats per person, all
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

### How to measure (49a and 49d)

Same machine, interleaved, the owner's geometry (1728 × 1000, ratio 2;
Firefox headless with `layout.css.devPixelsPerPx`, Chromium headless on
the GPU with Vulkan). `main` = the pane code of 1831d839 (main's panes plus
the bench); build each side once, keep a copy of `main`'s `dist`.

```sh
# the pane cost, both builds round-robin (49d), 3 rounds:
npx vite preview --port 5301 --strictPort --outDir <main dist> &
npx vite preview --port 5302 --strictPort &            # the branch build
node bench/pane-cost.ts --url main=http://localhost:5301,branch=http://localhost:5302 --runs 3

# the standard checks, three runs per side (each builds its own tree;
# run main's from a worktree at 1831d839):
WC_BENCH_SETTINGS='{"panes":{"comm":{"on":true},"statistics":{"on":true}}}' \
  node bench/browser-bench.ts --only budgets,play,keys,soak --port 4189 --out <file>
WC_BENCH_SETTINGS='{"panes":{"comm":{"on":true},"statistics":{"on":false}}}' \
  node bench/browser-bench.ts --only budgets,play,keys,soak --port 4189 --out <file>
```

`bench/pane-cost.ts` (header has the method) feeds GMCP and text through
the fake socket and measures from outside the panes, so it measures the
old and the new panes alike. Map and weather are off there.

### Baseline (main pane code, 2026-11-09)

**Pane cost** (`bench/pane-cost.ts`, 3 runs; ranges over the runs, ms):

| Measure | Firefox | Chromium |
|---|---|---|
| Comm: message task, median / p95 | 0.58–0.60 / 0.76–1.12 | 0.32–0.35 / 0.44–0.47 |
| Comm: frame after a message, median / p95 | 5.72–5.86 / 6.38–7.64 | 6.72–6.88 / 7.93–8.12 |
| Comm: pane render script, median | 1.64–1.68 | 1.50–1.59 |
| Comm burst (50 in 1 s): frames median / p95 / max | 4.92–5.18 / 7.02–7.84 / 7.8–9.7 | 4.20–5.02 / 8.55–9.63 / 10.1–11.7 |
| Comm burst: long frames | 0 | 0 |
| Comm burst: main-thread per message (trace) | — | 6.31–7.42 |
| Statistics: longest frame after a kill, median / max | 7.22–7.34 / 8.3–9.2 | 3.20–3.38 / 4.1–4.5 |
| Statistics: app rAF callback per kill window, median | 0.58–0.64 | 0.39–0.43 |
| Statistics: main-thread per kill (trace) | — | 10.19–12.59 |
| Statistics tick (20 s idle): worst frame per second, median | 6.52–7.20 | 2.92–3.17 |
| Statistics tick: main-thread per second (trace) | — | 12.26–13.62 |

**Standard checks** (`browser-bench --only budgets,play,keys,soak`, 3 runs
each; weather on as the defaults; ranges over the runs, ms; Firefox /
Chromium):

| Measure | Comm on, Statistics off | Comm and Statistics on |
|---|---|---|
| Frame → paint: receipt → painted median / p95 | 10.7–11.3 / 21.0–21.4 · 11.5–13.1 / 20.2–20.3 | 44.6–49.9 / 137–150 · 10.4–12.2 / 19.9–20.5 |
| Frame interval during frame → paint | 16.6 · 16.6 | 72.2–85.5 · 16.6 |
| Burst: longest rAF gap; gaps > 50 ms | 158–194, 4–8 · 17–19, 0 | 289–417, 45–48 · 18–24, 0 |
| Play with GMCP, text frames without / with a pane render, median / p95 | 2.6–3.1 / 6.2–6.6, 3.0–3.7 / 6.3–6.7 · 3.1–3.3 / 4.6–5.0, 4.4–4.6 / 5.9–6.2 | 2.8–3.1 / 6.2–7.2, 3.6–3.7 / 6.1–8.2 · 3.3–3.4 / 4.8–5.1, 4.6–5.0 / 6.2–6.7 |
| Keys under play: letter → rendered median / p95 | 5.6–6.4 / 8.8–25.8 · 12.6–16.1 / 18.7–21.3 | 7.5–9.6 / 78–128 · 12.0–17.4 / 20.5–21.7 |
| Keys under burst: letter → rendered median / p95 | 33–36 / 58–74 · 21–24 / 35–37 | 71–82 / 150–211 · 20–23 / 32–36 |
| Soak: small frames first → last checkpoint, median | 2.50–2.70 → 2.52–2.62 · 4.76–5.29 → 3.20–5.63 | 2.80–2.98 → 3.16 · 5.08–5.49 → 3.53–4.97 |

(Firefox misses the burst budget on `main` in every setup, as in stage 40.)

**Finding on main:** with the weather on, the Statistics pane shown (its
float over the game pane) drops headless Firefox to 12–14 frames per
second (frame interval 72–85 ms; text receipt → painted 45–50 ms median;
typed letter → rendered p95 78–128 ms). A run with the pane's glass off
still did (72.6 ms); a run with the weather off did not (16.6 ms,
14.2 ms median). Chromium is unaffected. Headless Firefox composites in
software, so the real browser may differ; 49b must not inherit this and
should check it in a headed Firefox.

### After (branch)

To be filled in 49d.

### Notes for 49b / 49c

- 49b: the Statistics float with the weather on is the costly case above;
  measure the new pane against it headed and headless.
- 49c: put `COMM_PUBLIC_DEFAULT_OFF` into the defaults (new users only)
  and drop `comm.showHeader` (migration ignores it; old VIEW records may
  carry it) when the old header, gear rows and Options row go.
- 49c: feed `CommChats` from the pane's history and archive (`add(m,
  true)` for the archive), `setSelf` from `Char.Name`, `setRoster` from
  `GameState` group changes (every member but NPCs), `setPublicFilter`
  from `comm.filters`; the model keeps 1000 messages like the pane.
- Group tells: confirm the form of your own `tell group` in the first
  live test (the model accepts `destination` "group" or the text).

## Test guide

To be written in 49d.

## Owner feedback

None yet.
