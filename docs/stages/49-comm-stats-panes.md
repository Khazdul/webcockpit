# Stage 49 — Comm and Statistics panes

Status: **Owner testing** (released in 0.4.0, 2026-11-10).

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
- [x] 49b: Statistics pane renderer per ADR 0134 (replaces `statsBody` in
      the pane only; phone ESC frame and History untouched)
- [x] 49b: theming (tints, Paper, border off, clear), reduced motion
- [x] 49b: e2e (header, tiles, list anchoring and `↓ N new`, card slide,
      calibrating, Paper)
- [x] 49c: column rail/list by pane width, pinned Public and Group, chat
      list order and fill, edge fade and chevron
- [x] 49c: spine (hover, drag snaps, double-click, keys, touch) and fold
      with the open-chat chip
- [x] 49c: thread: bubbles, overheard lines, own messages "Stilla ton",
      bounded DOM, bottom anchoring
- [x] 49c: reply line (tell / say), hidden in players, replay and offline
- [x] 49c: search (magnifier, Ctrl+F, People and Messages)
- [x] 49c: gear popup and Options → Panes → Comm page
- [x] 49c: text selection and copy without stealing the game's keys
- [x] 49c: theming (tints, Paper, border off, clear)
- [x] 49c: e2e (chats open and order, Group roster, search, fold, gear,
      reply sends a tell, selection, Paper)
- [x] 49d: performance after, interleaved with `main`; table in this file;
      regressions agreed with the owner
- [x] 49d: code review (fresh reviewer), fixes
- [x] 49d: docs (Inv §2.7 and §7.3 pointers, ADR 0109 addendum, manual),
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

### After 49b (Statistics pane; Comm still main's), 2026-11-10

Quiet machine (load 0.4–0.6 at the start and end of the pane-cost run,
0.5–1.8 during the standard checks); the Comm rows, the same code on both
sides, land in the same ranges, which bounds the noise. Builds of
1831d839 (main's panes) and fd2cd074 (branch), interleaved.

**Pane cost** (`bench/pane-cost.ts --runs 3`, ranges over the runs, ms):

| Measure | Firefox main → branch | Chromium main → branch |
|---|---|---|
| Statistics: longest frame after a kill, median / max | 6.78–7.28 / 7.8–8.5 → 7.24–7.74 / 8.7–9.2 | 3.02–3.50 / 3.9–4.5 → 3.71–3.91 / 4.5–4.9 |
| Statistics: app rAF callback per kill window, median | 0.54–0.58 → 0.56–0.62 | 0.38–0.44 → 0.41–0.53 |
| Statistics: main-thread per kill (trace) | — | 6.68–12.30 → 22.18–27.70 |
| Statistics tick (20 s idle): worst frame per second, median | 6.48–7.22 → 7.48–7.80 | 3.21–3.42 → 3.34–3.50 |
| Statistics tick: main-thread per second (trace) | — | 14.55–15.07 → 11.37–11.94 |
| (Comm, unchanged code: frame after a message, median) | 5.80–5.82 → 5.58–5.78 | 6.57–7.13 → 6.56–6.93 |

Reading:

- **Idle is cheaper:** main reloaded the whole chain every second while a
  run was live; the branch writes the clock text. Chromium −3 ms of
  main-thread time per second, every second of a run.
- **A kill costs more:** Chromium about +15 ms of main-thread time per
  kill, once per kill (no long task; the frame after a kill +0.5 ms in
  both browsers). About 8 ms of it is the slide and the card's fade
  (measured with them off: 18 vs 25.5 ms); the rest is that the branch
  loads on the kill only, where main's per-kill figure is net of the
  load it did every second anyway (its idle window has one too). At
  fewer than about 12 kills a minute the branch spends less main-thread
  time than main overall.
- Firefox's frame after a kill +0.4 ms median, +0.7 ms max; its idle worst
  frame +0.5 ms (ranges overlap with the run-to-run noise of earlier runs:
  4.40–7.26 in the first branch run).

**Standard checks** (`browser-bench --only budgets,play,keys,soak`, Comm
and Statistics on, weather on; 3 runs; Firefox / Chromium), against the
baseline's "Comm and Statistics on" column:

| Measure | Branch |
|---|---|
| Frame → paint: receipt → painted median / p95 | 44.0–48.7 / 141–155 · 10.6–11.6 / 20.0–20.4 |
| Frame interval during frame → paint | 74.1–84.6 · 16.6 |
| Burst: longest rAF gap; gaps > 50 ms | 293–419, 45–46 · 17–19, 0 |
| Play with GMCP, text frames without / with a pane render, median / p95 | 2.9–3.4 / 6.2–7.9, 4.1–4.3 / 7.4–7.7 · 3.4–3.5 / 4.7–5.0, 4.3–4.7 / 5.9–6.3 |
| Keys under play: letter → rendered median / p95 | 4.4–8.3 / 122–163 · 13.9–16.0 / 19.6–22.3 |
| Keys under burst: letter → rendered median / p95 | 50–73 / 144–200 · 22 / 32–40 |
| Soak: small frames first → last checkpoint, median | 2.80–2.92 → 2.92–3.52 · 4.78–5.43 → 4.93–5.12 |

Every row is within the baseline's ranges or their noise, except Firefox
keys under play p95 (122–163 vs 78–128), which sits on the Firefox
weather case below and is as noisy there (its median 4.4–8.3 vs 7.5–9.6).

**The Firefox weather case (main's finding) is the frame, not the
content:** headless Firefox at 12–14 fps with the weather and the
Statistics float is unchanged by the new pane (frame interval 74–85 ms).
With the pane's border off it runs at 60 fps (16.8 ms, receipt → painted
11.9 ms median), and so does a small float (14 × 6) with the border on
(16.7 ms). So it is the Lykta frame of a large float over the weather
canvas in Firefox's software compositor (ADR 0123 frame, ADR 0091 rim),
for any pane, not the Statistics content; it needs a check in a headed
Firefox (49d or a frame stage). Not changed in 49b.

### After 49c (Comm pane, branch `stage-49c`, 2026-11-10)

Builds: `main` = 1831d839 (`git archive` into the scratchpad, own
`vite build`), branch = 69ef4190 (the 49c pane after its performance
pass). Machine quiet, nothing else running; load at the start of each run
is in the reports (0.5–1.4 for the headless runs below).

**Pane cost** (`node bench/pane-cost.ts --url main=…:5301,branch=…:5302
--runs 3`, round-robin, headless; load 0.78 0.54 0.56 at the start;
ranges over the runs, ms):

| Measure | Firefox main | Firefox branch | Chromium main | Chromium branch |
|---|---|---|---|---|
| Comm: message task, median / p95 | 0.58–0.60 / 0.84–0.88 | 0.58–0.60 / 0.84–0.96 | 0.32–0.36 / 0.44–0.62 | 0.33–0.35 / 0.44–0.57 |
| Comm: frame after a message, median / p95 | 5.62–5.78 / 6.82–6.92 | 6.38–7.40 / 11.62–12.28 | 6.62–7.01 / 9.44–10.64 | 4.44–5.68 / 6.67–8.86 |
| Comm: pane render script, median | 1.60–1.70 | 2.36–3.20 | 1.51–1.63 | 1.87–2.29 |
| Comm burst (50 in 1 s): frames median / p95 / max | 4.52–4.88 / 6.98–7.66 / 8.1–9.7 | 5.42–5.86 / 5.96–8.28 / 6.1–9.2 | 4.60–5.63 / 7.80–9.60 / 8.2–10.9 | 0.61–3.51 / 6.36–9.50 / 7.7–11.3 |
| Comm burst: long frames | 0 | 13–15 | 0 | 0–1 |
| Comm burst: main-thread per message (trace) | — | — | 2.53–7.38 | 0.10–7.43 |

**Headed Firefox** (`WC_BENCH_HEADED=1 … --browsers firefox --runs 2`, a
real window; load 1.05 at the start):

| Measure | Firefox main | Firefox branch |
|---|---|---|
| Comm: message task, median / p95 | 0.60–0.68 / 0.78–1.24 | 0.60–0.62 / 0.88–1.04 |
| Comm: frame after a message, median / p95 | 5.62–5.94 / 6.84–7.40 | 7.04–7.16 / 11.48–12.58 |
| Comm: pane render script, median | 1.68–1.76 | 3.10–3.12 |
| Comm burst: frames median / p95 / max | 7.48–8.12 / 11.18–11.62 / 12.8–13.2 | 7.54–8.66 / 14.32–15.22 / 14.9–17.3 |
| Comm burst: long frames | 0–1 | 0 |

The headless Firefox burst gaps (13–15 rAF gaps over 50 ms, frames
themselves under 10 ms) come from any change in the chat column, even with
the column contained and its texts at ≤ 1 Hz; they do not happen in a real
Firefox window. Before the performance pass (ba1b8518 + 1fa395b2) the
branch measured: Firefox render 4.60–4.98, frame after 8.44–9.06 / 12.76–15.40,
burst long frames 12; Chromium render 3.68–5.38, frame after
7.07–9.32 / 10.83–15.39.

**Standard checks** (`WC_BENCH_SETTINGS='{"panes":{"comm":{"on":true},"statistics":{"on":false}}}'
node bench/browser-bench.ts --only budgets,play,keys,soak --port 4189`,
3 runs of the branch against 49a's 3 runs of `main` in the same setup;
load 0.9–1.4 at the start; Firefox · Chromium):

| Measure | main | branch |
|---|---|---|
| Frame → paint: receipt → painted median / p95 | 10.7–11.3 / 21.0–21.4 · 11.5–13.1 / 20.2–20.3 | 11.1–11.6 / 20.7–21.3 · 10.0–12.7 / 19.9–20.4 |
| Burst: longest rAF gap; gaps > 50 ms | 158–194, 4–8 · 17–19, 0 | 162–184, 4–7 · 18–19, 0 |
| Play with GMCP, text frames with a pane render, median / p95 | 3.0–3.7 / 6.3–6.7 · 4.4–4.6 / 5.9–6.2 | 3.4–3.7 / 6.5–6.8 · 4.7–4.9 / 6.3–6.8 |
| Comm pane renders per second while playing | 0.7 · 0.7 | 0.9–1.0 · 0.9–1.0 |
| Keys under play: letter → rendered median / p95 | 5.6–6.4 / 8.8–25.8 · 12.6–16.1 / 18.7–21.3 | 4.6–6.4 / 10.7–19.7 · 13.3–16.9 / 18.9–21.4 |
| Keys under burst: letter → rendered median / p95 | 33–36 / 58–74 · 21–24 / 35–37 | 31–32 / 47–72 · 18–21 / 32–38 |
| Soak: small frames first → last checkpoint, median | 2.50–2.70 → 2.52–2.62 · 4.76–5.29 → 3.20–5.63 | 2.56–2.70 → 2.68–3.42 · 5.29–5.30 → 3.67–5.44 |

**Verdict:** Chromium is faster than `main` per message (frame after
−2 ms median, −2 ms p95). Firefox costs about 1.4 ms more pane script per
message (render 3.1 vs 1.7 headed) and +1.3 ms on the frame after a
message (median; p95 +5 ms, burst p95 +3 ms), all within a frame and with
no long frames in a real window. The standard checks are unchanged within
noise; the Comm pane renders a little more often (0.9–1.0 vs 0.7 per
second: the column's catch-up pass after its 1 Hz texts). For the owner
to agree.

### Notes for 49b / 49c

- 49b: the Statistics float with the weather on is the costly case above;
  measure the new pane against it headed and headless. Done headless (see
  "After 49b": the frame, not the content); headed Firefox still to do.
- 49c: put `COMM_PUBLIC_DEFAULT_OFF` into the defaults (new users only)
  and drop `comm.showHeader` (migration ignores it; old VIEW records may
  carry it) when the old header, gear rows and Options row go.
- 49c: feed `CommChats` from the pane's history and archive (`add(m,
  true)` for the archive), `setSelf` from `Char.Name`, `setRoster` from
  `GameState` group changes (every member but NPCs), `setPublicFilter`
  from `comm.filters`; the model keeps 1000 messages like the pane.
- Group tells: confirm the form of your own `tell group` in the first
  live test (the model accepts `destination` "group" or the text).

### After 49d (merged branch, final)

Builds: `main` = 1831d839 (main's panes plus the bench, its own `vite
build`), branch = `stage-49-comm-stats` at 7ff444ae (49b, 49c, both review
rounds). 2026-11-10, machine otherwise idle, the methods above.

**Pane cost, headless** (`node bench/pane-cost.ts --url
main=…:5301,branch=…:5302 --runs 3`, round-robin; load 0.94 0.66 3.28 at
the start, the 15-minute figure still falling from an earlier build;
ranges over the runs, ms):

| Measure | Firefox main | Firefox branch | Chromium main | Chromium branch |
|---|---|---|---|---|
| Comm: message task, median / p95 | 0.56–0.58 / 0.78–0.92 | 0.54–0.58 / 0.74–0.92 | 0.33–0.34 / 0.44–0.51 | 0.33–0.35 / 0.44–0.51 |
| Comm: frame after a message, median / p95 | 5.62–5.84 / 6.42–7.48 | 5.46–6.02 / 12.04–12.70 | 6.65–6.89 / 8.19–10.32 | 4.62–6.25 / 7.34–10.52 |
| Comm: pane render script, median | 1.62–1.70 | 1.94–2.48 | 1.52–1.56 | 1.84–2.41 |
| Comm burst: frames median / p95 / max | 4.52–4.70 / 6.66–7.60 / 7.9–8.9 | 5.28–5.40 / 6.00–6.46 / 6.2–7.3 | 4.72–5.81 / 6.82–9.61 / 6.8–12.4 | 3.14–3.90 / 8.03–9.10 / 10.1–11.0 |
| Comm burst: long frames | 0 | 17 | 0 | 0 |
| Comm burst: main-thread per message (trace) | — | — | 0.43–7.25 | 6.16–6.85 |
| Statistics: longest frame after a kill, median / max | 6.94–7.22 / 7.8–8.0 | 7.24–7.62 / 8.7–9.5 | 3.40–3.54 / 3.8–4.5 | 4.03–4.22 / 4.6–6.8 |
| Statistics: rAF callback time per kill window, median | 0.56–0.58 | 0.64–0.68 | 0.38–0.42 | 0.50–0.51 |
| Statistics: main-thread per kill (trace) | — | — | 5.74–7.55 | 30.67–32.95 |
| Statistics tick: worst frame per second, median | 6.36–6.98 | 7.44–7.60 | 2.91–3.36 | 3.40–3.61 |
| Statistics tick: frames with callbacks per second | 0.1 | 0.1 | 0.0–0.1 | 0.0–0.1 |
| Statistics tick: main-thread per second (trace) | — | — | 13.04–14.14 | 11.19–12.85 |

**Pane cost, headed Firefox** (`WC_BENCH_HEADED=1 … --browsers firefox
--runs 2`; load 1.46 1.21 2.39):

| Measure | Firefox main | Firefox branch |
|---|---|---|
| Comm: message task, median / p95 | 0.56–0.66 / 0.98–1.20 | 0.62 / 0.90–0.96 |
| Comm: frame after a message, median / p95 | 5.72–5.90 / 7.30–9.32 | 7.46–7.84 / 11.72–12.18 |
| Comm: pane render script, median | 1.66–1.72 | 3.34–3.40 |
| Comm burst: frames median / p95 / max | 6.88–7.94 / 9.92–12.56 / 10.0–13.0 | 7.94–8.44 / 13.54–16.54 / 15.0–17.8 |
| Comm burst: long frames | 0–1 | 0 |
| Statistics: longest frame after a kill, median / max | 6.72–7.22 / 9.0–9.3 | 10.06–10.70 / 13.8–14.4 |
| Statistics: rAF callback time per kill window, median | 0.58–0.64 | 0.70–0.74 |
| Statistics tick: worst frame per second, median | 6.70–6.94 | 8.08–8.34 |

**Statistics, main-thread per kill (Chromium):** a quick split
(`--browsers chromium --quick`, branch only, 6 kills) gave 31.3 ms with
the pane's two slide-in animations (the card and the row it leaves,
`Element.animate`, 200 ms) and 16.7 ms with them switched off (frame
after a kill 4.4 → 3.3 ms). The rest is the per-kill load (chain,
`buildStats`, kill list), which `main` ran once a second whatever
happened, so its idle window (subtracted in this measure) already held it;
the idle cost per second is lower on the branch (11.2–12.9 vs 13.0–14.1).
Not changed here: the animations are part of the approved design (49b's
pane); taking them out or making them cheaper is the owner's call.

**Standard checks** (`browser-bench --only budgets,play,keys,soak`, main
and branch interleaved, 3 runs each per setup; load 0.6–2.2 at the
browsers' starts; Firefox · Chromium, ranges over the runs, ms):

| Measure | Comm on, Statistics off: main | branch | Comm and Statistics on: main | branch |
|---|---|---|---|---|
| Frame → paint: receipt → painted median / p95 | 10.5–11.6 / 20.6–21.1 · 10.3–12.8 / 20.0–20.4 | 10.8–11.5 / 21.0–21.8 · 10.9–11.8 / 19.9–20.8 | 45.4–48.5 / 141.5–145.5 · 10.7–12.4 / 19.9–20.4 | 46.8–47.8 / 135.6–144.0 · 10.6–12.4 / 20.0–20.6 |
| Burst: longest rAF gap; gaps > 50 ms | 143–178, 4–9 · 18–22, 0 | 158–173, 7 · 17–20, 0 | 263–293, 44–47 · 18–21, 0 | 292–414, 43–46 · 17–20, 0 |
| Play with GMCP, text frames with a pane render, median / p95 | 3.1–3.6 / 5.5–7.1 · 4.4–4.7 / 5.8–6.0 | 3.5–3.6 / 6.7–7.2 · 4.5–4.8 / 6.2–6.8 | 3.5–3.6 / 7.4–8.4 · 4.3–4.7 / 6.1–6.2 | 3.7 / 6.3–6.4 · 4.5–4.6 / 6.1–6.2 |
| Keys under play: letter → rendered median / p95 | 5.0–6.1 / 10.8–21.9 · 15.1–17.8 / 20.7–21.7 | 4.7–7.0 / 9.8–60.5 · 14.8–16.3 / 20.4–21.2 | 5.0–6.4 / 60–101 · 13.1–17.9 / 20.3–21.3 | 4.3–7.1 / 86–140 · 13.6–15.8 / 20.7–21.6 |
| Keys under burst: letter → rendered median / p95 | 34–38 / 58–77 · 20–24 / 33–38 | 34–51 / 63–68 · 23–24 / 35–38 | 81–113 / 150–311 · 22–23 / 33–36 | 79–97 / 149–263 · 19–21 / 31–38 |
| Soak: small frames first → last checkpoint, median | 2.44–2.68 → 2.48–2.60 · 5.09–5.42 → 3.15–5.15 | 2.48–2.76 → 2.60–2.66 · 4.93–5.24 → 3.66–5.60 | 2.80–2.90 → 2.92–3.22 · 5.03–5.06 → 4.96–5.34 | 2.84–3.12 → 3.04–3.18 · 4.98–5.18 → 4.99–5.37 |
| Comm renders per second while playing | 0.7 · 0.7 | 0.9 · 0.9 | 0.7 · 0.7 | 0.9 · 0.9–1.0 |

(Firefox with Statistics on and the weather: the frame-over-the-weather
cost of headless Firefox found in 49a, on both sides alike.)

**The review fixes** (against "After 49c", same methods): the Public
cache took the Comm pane's script in headless Firefox from 2.36–3.20 to
1.94–2.48 ms and its frame after a message from 6.38–7.40 to 5.46–6.02 ms
(median); Chromium unchanged within noise (1.87–2.29 → 1.84–2.41). Headed
Firefox unchanged within noise (render 3.10 → 3.34–3.40, frame after
7.04–7.16 → 7.46–7.84 ms). The search refresh and the 300 ms spine delay
are not on the measured paths (no search open, no spine use): no cost
while idle; the spine delay only defers the fold of a click.

**Verdict:**
- Comm: Chromium is at or below `main` per message (frame after 4.6–6.3
  vs 6.7–6.9 ms median). Firefox: headless now matches `main` on the
  median frame after a message (p95 +5 ms); headed it costs about 1.7 ms
  more pane script and +1.7 ms on the frame after a message (median),
  within a frame and with no long frames. The headless-Firefox burst gaps
  (17) are the known headless artefact (0 in a real window).
- Statistics: frames after a kill +0.3 (Firefox headless), +0.7
  (Chromium) and +3.5 ms (headed Firefox); idle tick +0.3–1.4 ms per
  second's worst frame; main-thread per kill about +25 ms in Chromium,
  about 15 ms of it the two slide-in animations (see above).
- Standard checks: unchanged within noise in both setups; the Comm pane
  renders 0.9 instead of 0.7 times a second (its column's catch-up pass).
- For the owner to agree: the Firefox Comm cost (+1.7 ms per message,
  headed) and the Statistics slide-in animations' main-thread cost.

### After owner feedback 1

Branch `stage-49-comm-stats` at 5868fe4d (the Comm and Statistics
feedback) against `main` 1831d839, same methods. Headless: `pane-cost
--runs 3`, load 0.47 0.56 3.00 at the start; headed Firefox: `--runs 2`,
load 1.25 1.08 2.18. Ranges over the runs, ms; main → branch.

| Measure | Firefox headless | Firefox headed | Chromium |
|---|---|---|---|
| Comm: frame after a message, median | 5.56–5.60 → 5.22–5.30 | 5.50–5.66 → 5.34–5.36 | 6.57–6.96 → 3.25–3.65 |
| Comm: frame after a message, p95 | 6.86–7.12 → 8.72–10.76 | 7.62–7.88 → 9.38–9.66 | 9.38–9.67 → 5.35–6.29 |
| Comm: pane render script, median | 1.58–1.66 → 1.48–1.56 | 1.62–1.66 → 1.58–1.60 | 1.50–1.59 → 1.44–1.52 |
| Comm burst: frames median / p95 | 4.66–4.92 / 7.28–8.26 → 3.60–4.00 / 5.74–7.16 | 7.30–7.44 / 10.38–12.92 → 8.28–8.36 / 11.18–12.88 | 4.63–5.33 / 9.26–10.13 → 2.25–3.45 / 6.21–7.56 |
| Comm burst: long frames | 0 → 11–13 | 0 → 0 | 0 → 0–1 |
| Statistics: frame after a kill, median / max | 7.06–7.50 / 7.8–8.3 → 7.24–7.66 / 8.4–10.6 | 6.88–6.94 / 8.8–9.2 → 10.70–11.54 / 14.0–14.5 | 2.98–3.47 / 3.7–4.6 → 3.95–4.22 / 4.9–6.9 |
| Statistics: main-thread per kill (trace) | — | — | 7.34–12.82 → 30.32–32.56 |
| Statistics tick: worst frame per second, median | 6.72–7.32 → 7.12–7.22 | 6.94–8.22 → 8.18–8.64 | 3.20–3.47 → 3.17–3.52 |

**Reading it:**
- Comm is now at or below `main` on the medians in every browser (headed
  Firefox render 3.34–3.40 → 1.58–1.60 against "After 49d"). This is
  mostly **the new Public defaults**, not cheaper code: the bench's mix is
  70 % tells, says, emotes, whispers and socials, which Public no longer
  shows, so most messages add no thread row (the column still updates).
  Users who turn those channels back on in Public see the "After 49d"
  cost. The bubble meta, the overheard lines and the cockpit mouse-up
  rule are not on the measured path (Public open, no pointer); no row
  moved because of them. Headless Firefox's burst gaps (11–13) are the
  known headless artefact (0 headed).
- Statistics: unchanged within noise against "After 49d" (per kill 30–33
  vs 31–33 ms in Chromium; headed frame after a kill 10.7–11.5 vs
  10.1–10.7). Dropping the card's age did not lower the per-kill cost: the
  age was a 1 Hz text write, not part of the kill path; the slide-in
  animations remain the main share. The single median line shows no cost.
- The standard browser-bench was not re-run: nothing moved for the worse
  beyond noise.

## Test guide

Run `npm run dev` on the branch `stage-49-comm-stats` (not merged to
`main`), log in with a character, and turn the Comm and Statistics panes
on (Panes menu).

**Statistics**

1. Kill a few mobs. The first four show `calibrating…`; from the fifth the
   card shows a badge (Poor … Superb) and the marker on the scale.
2. On each kill the previous card's kill slides into the Earlier list. The
   tiles (Avg / kill, Median, XP / h, Kills) and the run clock update.
3. Scroll the list up and kill again: the view stays, a `↓ N new` pill
   shows; click it to return to the bottom.
4. Try a few tints, Paper (a light page), border off and clear background;
   make the pane small and narrow.

**Comm**

1. Get a tell, a say and an emote from someone: their chat opens in the
   column; the bubbles carry their colour; unread counts show. Their
   narrates show in their chat as quiet one-liners.
2. Reply in the chat (sends `tell <name> …`), in Public (`say …`) and in
   Group (`tell group …`). **Please check** your own `tell group` shows
   once in Group (its GMCP form has not been seen before).
3. Join a group: Group fills with your group's players on every channel,
   with joined / left lines; pets and pack horses are left out.
4. The gear (pane hover buttons): Public's channels (Tells and Whispers
   are off for new users) and the chat window 10 / 30 / 60 min / All.
5. Search: the magnifier at the top right, or Ctrl+F with the pointer over
   the pane. People hits open a chat; message hits can be selected.
6. The spine between column and thread: hover it, drag it (list → rail →
   folded), click to fold, double-click for the automatic width. Folded,
   the chip at the top left names the open chat.
7. Select text in the thread: it is copied, and typing still goes to the
   game.
8. Narrow the pane below about 380 px: the column becomes an icon rail.
   Tints, Paper, border off and clear background as for Statistics.

**Feedback wanted:** the look in your own setup, whether the rating feels
right for your level, and the three performance points under "For the
owner" below.

### For the owner (performance to agree)

- Statistics: a kill costs Chromium about 31 ms of main-thread time
  (main: 6–8 ms, net of its every-second load); about 15 ms of it is the
  200 ms slide and fade. The frame after a kill stays short (Chromium
  ≤ 4.2 ms, headed Firefox 10.7 vs 7.2 ms); idle is about 2 ms per second
  cheaper. Kept for now; dropping the slide is a small change.
- Comm in Firefox: about 1.7 ms more per message in a real window (pane
  script 3.3 vs 1.7 ms, frame after 7.5–7.8 vs 5.7–5.9 ms median), within
  a frame, no long frames. Chromium is faster than main.
- Found on `main`, not caused by this stage: in headless Firefox a large
  framed float over the weather runs at 12–14 fps (border off: 60 fps).
  Please check whether a large floating pane with its border over the
  weather feels slow in your Firefox; a separate stage if so.

## Owner feedback

### 2026-11-10, first test

**Comm**
- Public needs no reply line at all.
- Bug: the reply line in a chat cannot take focus; a click sends the
  caret to the game (only a held mouse button lets you type).
- The spine's fold handle looks like a scrollbar: show discreetly that it
  is a fold button. A single click folds at once; drop the double-click
  reset (a double-click does nothing).
- The channel and time under each bubble (`social · 09:55`): smaller, a
  quieter colour, shown only on hover of that bubble, taking no height.
- A group tell in a person's chat should look like a normal message (a
  bubble, as a social or say). Other overheard channels: left-aligned
  with the full text, as in Public.
- Public's defaults: Tells, Says, Emotes, Whispers, Questions and Socials
  off (they live in the chats; questions and whispers too).
- The gear popup's chat-window row is squeezed; drop the explanation text.

**Statistics**
- No `calibrating…` at the bottom right during the first kills.
- The card's `LAST KILL 3s ago`: just `LAST KILL`.
- The median line in the list breaks between rows; it should run through.

### 2026-11-10, second round

**Comm**
- A group tell in a private chat must be marked visibly (in a large group
  it may not be meant for you): a small, very quiet `grouptell` line under
  the message, always shown.
- Public's defaults: Emotes, Whispers and Says on (Tells, Questions and
  Socials stay off).

**Statistics**
- Before the first kill the pane feels empty: show the tiles without
  values, an empty `LAST KILL` card and the list header with 0.
- Rename `Earlier` to `Kills`; the right tile `Kills` becomes `TNL`, the
  XP to the next level (`234`, `222k`).

### 2026-11-10, after the release

**Comm**
- A switch in the Comm settings for NPCs in Public, off by default.
  Done (ADR 0134 addendum "NPCs in Public").
