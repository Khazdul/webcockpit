# Area A — Output rendering (performance review, 2026-09-30)

Reviewer A. Scope: `src/ui/output-pane.ts`, `palette.ts`, `ui.css`, fonts and
cells, and the game area of the layout. Everything here was measured headless
on the owner's laptop while four other reviewers were running (load average
2.2–7). Unless a line says "inferred", the numbers were measured. Fixes are
only proposed; nothing is committed.

## 1. Summary

1. **The stall reproduces, and element count causes it.** `help 24-bit colours`
   page 1 builds 46 rows with 2 352 spans, and page 2 builds 75 rows with
   4 658 spans. Each span has two inline declarations (`style.color` =
   `#ffffff`, `style.backgroundColor` = truecolor).
   - Firefox, DPR 2, whole page in one socket frame (n = 7): page 1 frame
     28 ms median (p95 34), page 2 42 ms (p95 47). Receipt → painted:
     36 ms and 50 ms.
   - Chromium: 40 ms and 56 ms (p95 56 and 78).
   - With the log's own timing (5–6 socket frames per page), Firefox's
     longest rAF gap is 34–36 ms, which is two missed frames.
2. **How the colour is written does not matter; how many elements there are
   does.**
   - Two CSSOM writes, one `cssText`, `setAttribute('style')`, static classes
     for colours 16–255, dynamic classes for truecolor and even `innerHTML` all
     land within ±17 % of today's frame. That band is the noise band (n = 10).
   - Class-only spans with the same structure are 25–40 % cheaper in Firefox,
     because they can share styles. In Chromium they cost the same.
   - Only fewer elements help: −58 % to −80 %.
3. **Heavy rows keep costing on every later frame while they are on screen.**
   A 4-line combat round costs about 15 ms in Firefox (normally about 2.5 ms)
   until the heavy rows have scrolled out of view, about 80–100 rows later. In
   Chromium it costs about 6.5 ms (normally about 2 ms) for more than 400 rows.
   The cause is the display list in Firefox, and Paint plus Layerize in
   Chromium. This is probably much of what the owner feels as a stall.
4. **P1, background rows (patch ready, unit tests pass).** A row whose runs
   differ only in background is drawn as one hard-stop `linear-gradient` on
   the cell grid, and its text as text nodes. There is a span only where the
   foreground changes.
   - Firefox: page 1 goes from 23.1 to 7.1 ms (−69 %) and page 2 from 37.8 to
     9.3 ms (−75 %).
   - Chromium: −81 % and −77 %.
   - The next frames drop from 6–15 ms to about 2 ms.
   - The page looks pixel-identical, except for 1-device-px seams at row
     edges. Today's spans bleed 0.2 CSS px into the neighbouring rows; the new
     version does not.
5. **Normal play is cheap.** A combat frame costs 1.5–2 ms on the main thread
   in both browsers at DPR 2, and that stays flat from 2 000 to 20 000 rows. A
   chunk trim (every 200 rows) costs 3–4 ms, 8 ms at most. The owner's play
   logs average 0.44–0.54 SGR sequences per line, never more than 16 per line,
   and contain no 256-colour or 24-bit codes. So rendering does not explain a
   general laggy feel in play.
6. **The remaining latency is the browser's pipeline (inferred from the
   profile).** Firefox builds and composites a content paint at the vsync
   after the refresh tick, then presents it. Receipt → on screen is therefore
   about (0–16.7 ms wait for the tick) + about 17 ms. Foot has no such extra
   frame. The page cannot change this; the only lever is not missing ticks.
7. **Long sessions: resizing is expensive (P2).** At 20 000 rows, every change
   of the game pane's width re-wraps all rows. That happens on a window resize
   (including Hyprland retiling), on a dock drag with live preview, and when
   panes are toggled.
   - It costs 90 ms per frame in Firefox and 75–130 ms in Chromium.
   - With `content-visibility: auto` on the chunks it costs 4–6 ms.
   - The CSS costs nothing measurable per frame in play: Firefox 4.02 vs
     3.96 ms median (n = 216 each), Chromium −6 %.
   - It also halves catch-up frames.
   - Risk: the scroll position can jump when scrolling back into chunks that
     were never rendered or whose size is stale.
8. **Catching up after a hidden tab.** At DPR 2, 1 000 rows in one frame cost
   14–38 ms (it varied with machine load); 500 rows cost 7–15 ms.
   - P3: lower `MAX_ROWS_PER_FRAME` to 500 (patch ready). The cost: the newest
     line of a 5 000-line backlog appears 20–80 ms later (99–198 ms becomes
     165–214 ms).
   - P4, newest-first catch-up, removes that trade-off.
9. **Keep as is (measured, no gain found):**
   - the forced layout in `scrollTop = scrollHeight`;
   - the underscore face, `pre-wrap` / `overflow-wrap: anywhere`, kerning,
     `text-rendering` and an opaque scroller;
   - the chunk containment (`contain: none` makes frames 2–4× slower).

   Column-reverse bottom anchoring is 4–7× worse in Chromium. Scroll anchoring
   does not hold the bottom in Firefox.
10. **A canvas renderer (ADR 0004's fallback) is not warranted.**
    - A canvas-2D spike at DPR 2 is not faster: a full redraw of the page takes
      9–21 ms in Firefox.
    - It is slower for small frames: a scroll-blit costs 11.7 ms, against about
      4 ms for the DOM.
    - Only a WebGL glyph-atlas renderer could win. That is large (L) work, and
      it loses native selection, find and accessibility.

## 2. Measurements

### 2.1 Common method

- **Machine:** the owner's laptop (i7-12700H, 31 GB, CachyOS). Load average is
  logged per run, typically 2.5–5, with other reviewers' headless browsers
  running. Absolute numbers are noisy. Compare variants inside one table
  (interleaved runs), not across tables.
- **Browsers:** Playwright Firefox 155.0 (the owner has 156), launched with
  `layout.css.devPixelsPerPx=2`. Playwright Chromium headless-shell
  153.0.8010.12 with `deviceScaleFactor: 2`. Both run headless.
- **Headless caveat:** Firefox headless uses software WebRender (`SwComposite`)
  and Chromium composites and rasterises in software. Main-thread costs
  (script, style, layout, display list, paint recording) are representative.
  Raster and composite times are pessimistic compared with the owner's GPU.
- **Page:** viewport 1728×1000 CSS px at DPR 2.
  - The game pane scroller is 1422×969 px = 158 × 57 cells, with a 9 × 17 px
    cell, font 14.9489 px and `--cell-ls: 0px` in both browsers.
  - The layout is the new-user default: the map floats and is on, with the
    right dock of 5 panes.
  - The build is production (`npm run build` → `dist`, or `perf/dists/<variant>`
    built with `--base /<variant>/`).
  - It is served with COOP/COEP (cross-origin isolated, as `vite preview`) by
    `perf/lib.ts`, for timer precision.
- **Path:** the `?bench` probe's fake socket feeds bytes into the real Session
  → telnet → LineAssembler → bus → ScriptEngine → OutputPane path
  (`perf/page-helpers.ts`). Before measuring, the pane is prefilled with 2 000
  rows of ordinary play (Rasta/2026-09-18T18-11-42.log from line 60 000).
- **Metrics:**
  - `script`: flush time.
  - `frame`: rAF callback start → MessageChannel message after the frame's
    main-thread rendering. In Firefox that includes style, reflow, display
    list and the WR transaction; in Chromium, paint, layerize and commit. It
    does not include raster, composite or present.
  - `toPaint`: socket frame received → the same point.
  - Flush phases come from a harness-only timing patch
    (`harness-timing.patch`):
    - `build`: rows and spans created;
    - `append`: `appendRows` + `trimTop`;
    - `read`: the `scrollHeight` read, i.e. forced style + layout;
    - `write`: the `scrollTop` write;
    - `post` = frame − script.
  - The breakdown into phases comes from DevTools traces (Chromium) and the
    Gecko profiler (Firefox; startup env vars, markers only, no stack
    sampling).
- **Payloads** (`perf/payloads.ts`). Lines are cut from the logs and encoded as
  MUME sends them (CR LF, or IAC GA after a prompt):

  | Name | Content | Rows | Spans |
  |---|---|---|---|
  | `p24a` | `help 24-bit colours` page 1 (repro log lines 230–275) | 46 | 2 352 |
  | `p24b` | page 2 (lines 277–352) | 75 | 4 658 |
  | `p24s` | `p24a` with the SGR stripped (the floor) | 46 | 0 |
  | `p256x` | `p24a` structure, backgrounds cycling 256-colour indices | 46 | 2 354 |
  | `p16x` | the same, 16 colours (class-only spans) | 46 | 2 354 |
  | `ansi` | `help ansi codes` page | 46 | 45 |
  | `info` | an `info` with khazdul highlights | 35 | 33 |
  | `room` | a `look` mid-fight | 16 | 1 |
  | `combat` | 2 lines + prompt | 4 | 0 |

  There is no `help 8-bit colours` page in the logs; `p256x` stands in for a
  256-colour chart.

### 2.2 Baseline: the owner's repro (`perf/repro.ts`)

One-shot payloads, n = 7 each, shuffled per round. Load 2.4–3.0. File
`repro-base.json`.

The payload mix includes the heavy `p256x` and `p16x` rows. Light payloads
therefore often ran with heavy rows on screen, which is why their frames are
higher than in §2.8.

| Payload | Firefox script | Firefox frame med / p95 / max | Firefox receipt → painted med / max | Chromium script | Chromium frame med / p95 / max | Chromium receipt → painted |
|---|---|---|---|---|---|---|
| p24a | 20.5 | 28.1 / 33.5 / 33.5 | 35.5 / 44.0 | 20.3 | 40.2 / 56.0 / 56.0 | 45.5 / 65.3 |
| p24b | 33.4 | 42.1 / 47.2 / 47.2 | 49.5 / 59.0 | 32.9 | 56.2 / 78.2 / 78.2 | 63.6 / 92.6 |
| p256x | 21.6 | 31.5 / 52.0 | 39.3 | 15.0 | 30.5 / 47.3 | 43.9 |
| p16x | 12.0 | 17.7 / 24.3 | 28.3 | 17.9 | 37.2 / 45.6 | 40.7 |
| p24s | 1.3 | 8.2 / 10.2 | 12.8 | 1.8 | 15.3 / 28.7 | 20.2 |
| ansi | 2.5 | 6.9 / 10.0 | 19.5 | 2.2 | 16.0 / 21.2 | 22.2 |
| info | 2.1 | 7.6 / 14.6 | 21.1 | 1.5 | 14.8 / 21.3 | 25.0 |
| combat | 0.7 | 7.2 / 11.2 | 20.7 | 0.5 | 13.2 / 15.8 | 18.5 |

All times are in ms.

**Timed delivery** (`--timed`: the payload fed at the log's own timing, speed 1):

| | Firefox p24a | Firefox p24b | Chromium p24a | Chromium p24b |
|---|---|---|---|---|
| Socket frames → flushes | 5 → 2 | 6 → 4 | 5 → 2 | 6 → 3 |
| Longest frame (ms) | 20.2 | 31.6 | 23.7 | 34.8 |
| Longest rAF gap, median (max) (ms) | 33.8 (37.6) | 35.7 (41.3) | 23.9 (26.7) | 35.1 (42.4) |
| First byte → page painted (ms) | 49.4 | — | 63.3 | — |

The p24b span includes the owner's 1.2 s pause at the pager, so "first byte →
page painted" means nothing there.

Chromium Long Animation Frames appeared only for p24b (70 ms, n = 4). LoAF
reports only frames longer than 50 ms, so it cannot show the rest.

Re-run: `node perf/repro.ts --runs 7 --timed --out repro-base.json`.

### 2.3 Where the time goes

**Firefox**, Gecko profiler, markers only (n = 4, load 4.6–5.6; files
`gecko-base.json` and `gecko-bgclean.json`). Medians in ms, per refresh tick.
In the rAF column, "styles" and "reflow" are the style flush and reflow that
the `scrollHeight` read forces inside the rAF callback.

| Build / payload | Tick | rAF (styles + reflow inside) | DisplayList | WrDisplayList |
|---|---|---|---|---|
| base p24a | 31.2 | 26.6 (7.0 + 5.9; DOM build ≈ 13.7) | 2.1 | 2.4 |
| base p24b | 52.7 | 39.3 (11.8 + 11.4) | 5.4 | 8.8 |
| base p24b then a combat frame | 13.8 | 0.9 | 5.4 | 7.6 |
| base combat then combat | 6.4 | 0.7 | 2.5 | 3.2 |
| background rows p24a | 7.4 | 6.2 (0.8 + 0.8) | 0.5 | 0.9 |
| background rows p24b | 11.7 | 9.1 (1.1 + 0.9) | 0.6 | 1.4 |
| background rows p24b then combat | 4.0 | 1.0 | 0.7 | 2.1 |

What a Firefox paint costs:

- In the profile every paint rebuilds the window's display list and converts
  every visible item into WebRender commands. DisplayList + WrDisplayList
  scale with the display items on screen, not with what changed.
- WebRender pipeline, background-rows build, combat frame (n = 3,
  `perf/gecko-pipeline.ts`):

  | Step | Time from tick start |
  |---|---|
  | Tick | 4.3–4.8 ms long |
  | SceneBuilding | 1.0–1.9 ms, right after the tick |
  | BuildFrame | at the next vsync, +16–17 ms |
  | Composite (software in headless) | 7–10 ms |
  | `CONTENT_FRAME_TIME` | 23.5–26 ms |

**Chromium**, DevTools trace (n = 4, load about 4.2;
`perf/trace-chromium.ts`). Main-thread task per frame, medians in ms.
Layout includes a tracing artefact: the Layout event counts every layout
object, about 25 ns each.

| Build / payload | Task | DOM (script) | Forced style | Forced layout | PrePaint | Paint | Layerize |
|---|---|---|---|---|---|---|---|
| base p24a | 52.1 | 6.9 | 9.5 | 5.9 | 1.9 | 15.4 | 11.2 |
| base p24b | 69.8 | 11.1 | 16.0 | 11.2 | 4.2 | 18.1 | 12.0 |
| base combat (heavy rows near) | 23.7 | 0.5 | 0.2 | 2.1 | 1.2 | 12.2 | 6.4 |
| background rows p24a | 10.3 | 4.2 | 1.0 | 1.3 | 0.3 | 2.1 | 0.5 |
| background rows p24b | 12.3 | 5.0 | 1.3 | 1.3 | 0.5 | 2.8 | 0.5 |
| background rows combat | 5.1 | 0.5 | 0.2 | 0.7 | 0.3 | 1.7 | 0.6 |

Paint-invalidation tracking (`perf/trace-invalidation.ts`) shows that normal
flushes re-record only the new rows' chunk and the chunk at the moving cull-rect
edge: 0.3–0.4 ms of Paint in total. With heavy rows inside the chunk at that
edge, that chunk is re-recorded on every frame.

Re-run: `node perf/trace-chromium.ts --variant base|bgclean` and
`node perf/gecko-profile.ts --variant base|bgclean`. Both need the builds in
`perf/dists` (see `perf/run-all.sh`).

### 2.4 Heavy rows cost every later frame (`perf/nextframe.ts`)

A block of 92 rows (two pages) is added first. Then 100 combat frames of 4 rows
each follow, each timed. The table gives the median over 3 reps, in windows of
5 frames. Load 4.4–7.1. File `nextframe-1.json`.

| Block before | Frames 0–4 | 5–9 | 10–14 | 15–19 | 20–24 | 25–29 | 30+ |
|---|---|---|---|---|---|---|---|
| Firefox: plain text | 2.9 | 2.8 | 2.3 | 2.5 | 2.4 | 2.6 | 2.2–3.2 |
| Firefox: p24a, today's spans | 15.0 | 15.5 | 15.0 | 11.6 | 8.7 | 3.3 | 2.1–2.8 |
| Firefox: p16x class spans | 14.6 | 14.4 | 11.8 | 8.4 | 6.8 | 4.1 | 2.3–3.5 |
| Firefox: p24a as gradient rows | 4.0 | 4.4 | 3.0 | 3.3 | 3.1 | 2.6 | 2.3–3.0 |
| Chromium: plain text | 2.0 | 1.9 | 2.5 | 2.1 | 2.1 | 2.1 | 1.8–2.4 |
| Chromium: p24a, today's spans | 7.1 | 6.6 | 8.4 | 6.7 | 6.7 | 6.5 | 5.6–8.0 (still at frame 100) |
| Chromium: p24a as gradient rows | 2.4 | 2.3 | 2.4 | 2.2 | 2.3 | 2.1 | 1.8–2.6 |

All frame times are in ms. `content-visibility: auto` on the chunks
(`nextframe-css.json`) brings Chromium back to baseline once the block is about
55 frames up. It does not help Firefox, whose cost is the rows in the viewport.

### 2.5 Span variants in one page (`perf/lab.ts --set span`)

Rows built by builder variants and appended to the real pane. The variants are
interleaved within one page. n = 10, load 3.3–4.0, file `lab-span-2.json`.
Frame medians in ms. The lab's absolute values are higher than in §2.2,
because heavy rows from the same round are on screen; compare within a column.

| Variant | Firefox p24a | Firefox p256x | Firefox p16x | Chromium p24a | Chromium p256x | Chromium p16x |
|---|---|---|---|---|---|---|
| Today (two CSSOM writes) | 48.3 | 46.6 | 35.8 | 40.6 | 41.6 | 38.2 |
| One `style.cssText` | 47.5 | 49.8 | 29.5 | 47.4 | 39.4 | 38.3 |
| `setAttribute('style')` | 44.7 | 39.7 | 34.4 | 41.2 | 39.9 | 38.4 |
| Static classes for 16–255 | 48.8 | 41.9 (build 12.6 → 6.8) | 36.1 | 42.6 | 39.7 | 38.9 |
| Row-level fg + bg only on spans | 45.0 | 49.1 | 30.1 | 38.3 | 38.3 | 38.5 |
| Dynamic class per truecolor (`insertRule`) | 42.0 | 41.2 | 35.4 | 40.0 | 38.3 | 36.2 |
| `innerHTML` (reference only, security) | 44.7 | 40.0 | 34.1 | 40.5 | 36.1 | 36.6 |
| **Gradient row (reference)** | **10.8** | **9.5** | **10.0** | **17.1** | **9.0** | **11.2** |

In Firefox, class-only spans (p16x) against inline spans (p24a) with the same
structure: 35.8 vs 48.3 ms here, and 17.7 vs 28.1 ms through the real flush
(§2.2).

Re-run: `node perf/lab.ts --set span --rounds 10 --payloads p24a,p256x,p16x`.

### 2.6 CSS toggles and scrolling (`perf/lab.ts --set css|scroll`)

n = 8, load 2.3–6.8. Files `lab-css-1.json` and `lab-scroll-1.json`.

- **Neutral in both browsers.** These showed no consistent effect beyond the
  noise band (±20–30 %; the sign flips between payloads):
  - the font stack without "WebCockpit Underscore";
  - `white-space: pre`;
  - `overflow-wrap: break-word` or `normal`;
  - `text-rendering: optimizeSpeed`;
  - `font-kerning: none`;
  - an opaque scroller background.
- **`contain: none` on chunks.**
  - Chromium: small frames 18–22 ms instead of 4.5–6 ms; p24a `post` 25 ms
    instead of 11 ms.
  - Firefox: the forced layout rises to 5.3–5.6 ms, against 0.9–2.6 ms.
- **`contain: layout paint style` on rows:** +45 to +60 % in Chromium.
- **`content-visibility: auto` on chunks:** Chromium −19 to −29 % on small
  frames. Firefox showed +11 to +64 % in this noisy lab; the dedicated,
  balanced run in §2.9 shows no difference.
- **Scroll to bottom** (p24a, Firefox / Chromium frame, ms):

  | Mode | Firefox | Chromium | Notes |
  |---|---|---|---|
  | Today: read `scrollHeight`, write `scrollTop` | 21.8 | 18.2 | |
  | `scrollTop = 1e9` (no read) | 23.9 | 17.9 | Still a forced layout. |
  | Scroll-anchor element | 21.9 | 22.1 | Firefox left the bottom in 4–5 of 8 runs. |
  | `column-reverse` | 21.7 | 36.5 | Chromium's small frames rose to about 19–22 ms. |

  The layout that the read forces happens in the same frame anyway. Moving it
  only shifts time from `script` to `post`.

### 2.7 Catch-up after a hidden tab (`perf/catchup.ts`)

A backlog of N lines of ordinary play arrives as one socket frame, which gives
the same queue state as when rAF resumes. Every flush is timed.
`dist@cap` sets the rows per frame through a harness knob; `cv` adds
`content-visibility: auto` on the chunks. n = 3 reps.

Two runs follow. They differed in machine load, and their absolute values
differ by up to 2×.

**Run 1** (load 3.3–5.2, `catchup-caps.json`). Medians; "newest" = receipt →
the flush with the newest line painted.

| Browser | Rows per frame | 1 000 lines: flushes, frame (ms) | 5 000 lines: flushes, frame med / max (ms) | 5 000 lines: newest (ms) |
|---|---|---|---|---|
| Firefox | 1 000 | 1, 14.2 | 5, 13.1 / 15.1 | 99 |
| Firefox | 500 | 2, 10.2 | 10, 9.5 / 14.0 | 174 |
| Firefox | 300 | 4, 8.1 | 17, 6.4 / 10.4 | 284 |
| Firefox | 200 | 5, 5.1 | 25, 5.1 / 7.9 | 419 |
| Chromium | 1 000 | 1, 12.0 | 5, 12.9 / 15.5 | 87 |
| Chromium | 500 | 2, 6.5 | 10, 6.3 / 8.8 | 165 |
| Chromium | 300 | 4, 4.2 | 17, 5.4 / 8.1 | 282 |

**Run 2** (load 2.7–5.2, `catchup-cv.json`):

| Browser | Rows per frame | 1 000 lines: frame (ms) | 5 000 lines: frame med / max (ms) | 5 000 lines: newest (ms) |
|---|---|---|---|---|
| Firefox | 1 000 | 21.0 | 23.8 / 41.9 | 148 |
| Firefox | 1 000 + cv | 10.0 | 11.8 / 28.2 | 107 |
| Firefox | 500 | 13.8 | 13.5 / 29.5 | 197 |
| Firefox | 500 + cv | 11.2 | 11.0 / 26.2 | 185 |
| Chromium | 1 000 | 24.3 | 29.6 / 33.4 | 198 |
| Chromium | 1 000 + cv | 14.6 | 13.7 / 15.0 | 118 |
| Chromium | 500 | 13.8 | 16.6 / 20.8 | 214 |
| Chromium | 500 + cv | 9.5 | 12.1 / 16.5 | 196 |

In an earlier run under heavier load (load 5–6, `catchup-base.json`), 1 000
rows took 27.6 ms in Firefox and 38.3 ms in Chromium. Per row of plain play,
build is 2.8 µs. The forced style + layout is about 18 µs, and the post-frame
work about 6 µs.

### 2.8 Background rows: before and after (`perf/ab.ts`)

Real flush, `base` vs the background-rows build, interleaved: fresh pages in a
shuffled order, n = 14. Load 2.5–4.2, file `ab-bgrow2-1.json`. `+next` is a
combat frame injected right after the payload. Frame is med / p95.

| Payload | Firefox base frame | Firefox bg rows frame | Firefox receipt → painted | Chromium base frame | Chromium bg rows frame | Chromium receipt → painted |
|---|---|---|---|---|---|---|
| p24a | 23.1 / 30.2 | 7.1 / 12.9 | 33.1 → 16.6 | 36.7 / 87.6 | 6.9 / 14.1 | 42.5 → 20.1 |
| p24a +next | 6.3 / 14.2 | 1.8 / 2.7 | | 13.7 / 19.3 | 1.8 / 2.4 | |
| p24b | 37.8 / 51.3 | 9.3 / 14.9 | 45.8 → 12.5 | 51.0 / 107.4 | 11.6 / 20.7 | 59.2 → 19.7 |
| p24b +next | 8.3 / 12.7 | 2.2 / 2.8 | | 15.0 / 23.9 | 1.8 / 2.4 | |
| info / ansi / combat (same session) | 5.4–7.3 | 1.9–3.3 | | 11.1–11.4 | 1.9–2.9 | |

All values in ms.

- **Phases, Firefox p24a:** build 6.1 → 2.9 ms, forced style + layout
  10.3 → 2.0 ms. For p24b: 12.4 → 5.1 and 18.1 → 2.4 ms.
- **Palette charts** (clean patch; n = 10; `ab-bgclean-palette.json`):

  | Payload | Firefox | Chromium |
  |---|---|---|
  | p16x | 34.0 → 9.8 ms (−71 %) | 39.8 → 9.6 ms (−76 %) |
  | p256x | 46.3 → 9.0 ms (−81 %) | 45.7 → 7.6 ms (−83 %) |

- **Repro harness on the patched build** (`repro-bgrow2.json`):
  - Firefox p24a: 5.6 ms frame, 9.1 ms receipt → painted. p24b: 12.0 and
    14.2 ms.
  - Timed delivery: the longest rAF gap falls from 33.8 to 17.4 ms (p24a) and
    from 35.7 to 20.7 ms (p24b). No frames are dropped for page 1.
- **DOM:** pages 1 + 2 go from 4 658 + 2 352 spans to 34 + 1 spans. The whole
  document drops from 8 118 to 1 143 elements (`perf/census.ts`,
  `perf/shot.ts`).
- **Visuals:** full-window screenshots at DPR 2 were pixel-diffed
  (`perf/imgdiff.py`).
  - Firefox: 1.6 % of pixels differ, all on 1-device-px lines at row edges.
    Today's inline boxes are 17.4 px tall on a 17 px row, so they bleed into
    the next row; gradient rows do not.
  - Chromium: 7 %, the same seams plus glyph anti-aliasing.
  - Side by side the two are identical (`crop-cr.png`, `crop-band1.png`).
  - The clean patch is pixel-identical to the experiment in Firefox
    (0 differing pixels).

### 2.9 Long sessions: 20 000 rows, trims, width changes

**Small frames** (`perf/fullback.ts`, real flush, n = 400; loads 4.1 and 4.6).
Frame med / p95 / max in ms:

| Browser | ~4 800 rows | At the 20 000 cap | Trim flushes (n = 14) |
|---|---|---|---|
| Firefox | 1.48 / 2.84 / 4.20 | 1.92 / 2.82 / 5.06 | 3.08 / 4.86 / 4.86 |
| Chromium | 1.41 / 2.49 / 4.57 | 1.70 / 2.50 / 3.57 | 4.40 / 8.26 / 8.26 |

**Width change** of `.wc-game` by one cell (`perf/resize.ts`, n = 10; load
2.2–2.9). The forced layout, and in brackets the frame, in ms:

| Browser | 2 003 rows | 2 003 rows + cv:auto | 20 003 rows | 20 003 rows + cv:auto |
|---|---|---|---|---|
| Firefox | 10.6 (12.3) | 3.0 (5.0) | 90.0, max 108 (92.5, max 111) | 4.4 (6.1) |
| Chromium | 9.6 (18.5) | 1.5 (3.9) | 75.4, max 108 (128.6, max 170) | 1.5 (4.6) |

**Per-frame cost of cv:auto in play** (`perf/cvframes.ts`). Balanced
alternating blocks at 20 051 rows, a combat/room/info mix, n = 216 each; load
about 3.8. Frame med / p90 / p99 in ms:

| Browser | cv:auto off | cv:auto on |
|---|---|---|
| Firefox | 3.96 / 6.36 / 7.92 | 4.02 / 6.12 / 8.10 |
| Chromium | 3.54 / 6.73 / 10.54 | 3.32 / 6.53 / 9.00 |

### 2.10 Canvas spike (`perf/canvas.ts`)

Throwaway code: `fillRect` per background run and `fillText` per run (or per
row) on the cell grid, on a 2844×1938 device-px canvas over the pane. n = 8,
load 4.5–4.7. Frame medians in ms:

| Case | Firefox | Chromium |
|---|---|---|
| DOM p24a (46 rows) | 22.4 | 30.1 |
| Canvas: full redraw, 57 rows of p24a, `fillText` per run | 21.0 | 16.8 |
| Canvas: the same, one `fillText` per row | 11.5 | 10.8 |
| Canvas: full redraw, 57 plain rows | 7.1–9.5 | 5.8–6.1 |
| DOM combat frame | 4.3 | 3.9 |
| Canvas: scroll-blit + 4 new rows | 11.7 | 10.7 |

### 2.11 Log scan

`perf/scan-logs.py` and `perf/frames-stats.py`.

- **Colour in the 12 logs:** colour-heavy output exists only in
  `Rasta/2026-09-30T00-11-08.log` (the help pages; up to 96 SGR per line).
  - Play logs: 10–36 % of lines carry SGR, 0.35–1.4 SGR per line, at most 16
    per line.
  - No 256-colour or 24-bit SGR at all.
  - The khazdul substitutes `<F23aaee>` and `<Fff0000>` are the only truecolor
    in play. They make one inline-styled span on a rare line.
- **Frame sizes** in the biggest log (grouped as a socket frame, 1 ms gap):
  median 4 lines, p90 7, p99 22, max 47.

## 3. Findings

**A1 — The 24-bit page costs one element per 1–2 characters.**
- Evidence:
  - `fillRow` makes a span per run (`src/ui/output-pane.ts:640–658`).
  - `styleSpan` sets `style.color` and `style.backgroundColor` for colours ≥ 16
    (`:673`, `:677`).
  - Runs with the same SGR state are already merged
    (`src/text/assembler.ts:294–303`). On this page every character pair has
    its own background, so nothing merges.
  - The page is 2 352 / 4 658 spans (§2.1).
- Mechanism:
  - Per span there is an element, a CSSOM parse, a style resolution (no
    sharing in Firefox with a style attribute), an inline box in line layout
    and two display items (background rect and text run).
  - The work is proportional to spans. Firefox: build about 13.7 ms, styles
    7 ms, reflow 5.9 ms for page 1 (§2.3). Chromium: DOM 6.9, style 9.5,
    paint 15.4, layerize 11.2 ms.
- Impact: page 1 takes 1.5–3 frames, page 2 2.5–6 (§2.2). The p95 of page 2
  in Chromium exceeds the 50 ms budget (78 ms).
- Confidence: high.

**A2 — How the inline style is written is not the lever.**
- Evidence: §2.5. Every span variant is within ±17 %, while gradient rows are
  −58 % to −80 %.
- Firefox detail: style sharing makes class-only spans 25–40 % cheaper for
  the same structure (p16x vs p24a, §2.2 and §2.5).
- Impact: "one style write per span", "a row-level default fg", "static classes
  for 16–255" and "cached classes for truecolor" do not fix the repro.
- Confidence: high for "no big win". The ±15 % differences are inside the
  noise.

**A3 — Heavy rows make every later frame expensive while they are visible.**
- Evidence: §2.4. In §2.2 the light payloads' frames were 7 ms (Firefox) and
  13 ms (Chromium) whenever heavy rows were near.
- Mechanism:
  - Firefox (from the profile, §2.3): each paint re-runs DisplayList and
    WrDisplayList over all visible items (5.4 + 7.6 ms for a 4-row frame with
    p24b on screen, against 2.5 + 3.2 ms after a combat frame). The cost ends when
    the rows leave the viewport, about 20–25 frames (80–100 rows) later.
  - Chromium: the chunk that intersects the moving cull-rect edge (visible
    area + 4 000 px) is re-recorded on every scroll, and Layerize is
    proportional to paint chunks. Paint 12.2 ms and Layerize 6.4 ms for a
    4-row frame (§2.3). This lasts for at least 400 rows.
- Impact: after the help page is shown, every prompt, combat line or keystroke
  echo is 3–5× slower to render. Frames stay under 16 ms, but frame drops
  become likely with anything else in the frame.
- Confidence: high.

**A4 — Background rows remove A1 and A3 without visible change.**
- Evidence: §2.8 (interleaved A/B), §2.3 (phases), pixel diffs.
- Mechanism: one gradient per row replaces N background items. Text runs merge
  across background changes (a text node, plus spans only where the foreground
  differs). Elements go from about 95 per row to 1–3.
- Remaining cost: building and parsing the gradient string, about 60–70 µs per
  row in Firefox for 50–96 stops (build 2.9 ms for page 1, 5.1 ms for page 2).
- Confidence: high for the gain. Medium for edge cases, which are covered by a
  fallback to spans: wrapping, wide characters, flags that vary, and fewer
  than 4 background runs.

**A5 — Normal play renders cheaply at DPR 2 and does not slow down with
scrollback.**
- Evidence: §2.9 (1.5–1.9 ms median at 4 800 and 20 000 rows; trims 3–4 ms,
  max 8), §2.11 (play has few runs).
- The existing bench (DPR 1) agrees: flush script 0.65–1.0 ms,
  receipt → painted about 10 ms median (`bench/results/latest.md:23–24`).
- Confidence: high.

**A6 — Firefox presents a content paint one vsync after the refresh tick
(pipeline).**
- Evidence (§2.3): tick → SceneBuilding at once → BuildFrame at the next vsync
  (+16–17 ms) → Composite → `CONTENT_FRAME_TIME` 23.5–26 ms in headless
  software.
- Inferred: with GPU WebRender the composite is 1–2 ms, so tick → on screen is
  about 18 ms, and receipt → on screen about 8 (average wait) + 18 ≈ 26 ms
  (43 ms at worst). Foot renders on receipt (after 0.5 ms) and commits at the
  next frame callback. That is plausibly the "a little laggier" feel in quiet
  play.
- The page cannot shorten this. It can only avoid ticks that run late
  (A1/A3/A7/A9) and extra paints (see §6 E).
- Confidence: medium. Measured in headless Firefox; the vsync-bound structure
  is Firefox's WebRender design.

**A7 — Catch-up frames exceed a refresh interval at 1 000 rows.**
- Evidence: `MAX_ROWS_PER_FRAME = 1000` (`output-pane.ts:41`); §2.7 measures
  14–38 ms per 1 000-row frame.
- Mechanism: plain rows cost about 18 µs each in forced style + layout and
  about 6 µs after the flush. The cap is per row, while span-heavy rows cost
  up to 50× more per row.
- Impact:
  - After switching back to the workspace or tab with minutes of backlog, 1–20
    frames of 14–40 ms follow.
  - Input waits behind them (area C).
  - The newest line shows after 90–200 ms for a 5 000-line backlog.
- Confidence: high for the direction. The absolute values vary 2× with load.

**A8 — A width change re-lays out every row: 90–130 ms at 20 000 rows.**
- Evidence: §2.9.
- Mechanism: chunks have `contain: content` (`src/ui/ui.css:88–91`). That
  gives layout containment, but no size containment, so a new width re-wraps
  all 20 000 rows.
- Triggers: window resize (including Hyprland retiling animations), dock and
  pane drags with live preview (every frame of the drag,
  `src/layout/cockpit.ts:14–19, 34`), pane toggles, font or cell changes.
- Impact: at full scrollback a dock drag runs at about 10 fps. A Hyprland
  retile animation stalls the output for its duration (inferred).
- ADR 0009 (`docs/decisions/0009-stage-1-app-wiring-and-output-chunks.md:65–67`)
  noted a cv:auto trial that was slower in Chromium in stage 1. At DPR 2 today it is not: −6 % in Chromium,
  ±0 in Firefox (§2.9).
- Confidence: high.

**A9 — The forced layout of `scrollTop = scrollHeight` is not double work.**
- Evidence: `output-pane.ts:372`; §2.6 (the alternatives only move time from
  `script` to `post`).
- Column-reverse costs Chromium 4–7× on small frames. Scroll anchoring loses the
  bottom in Firefox (§2.6).
- Confidence: high.

**A10 — The text and font CSS is not a cost at DPR 2.**
- Evidence: §2.6 (underscore face, `pre-wrap` / `overflow-wrap`, kerning,
  `text-rendering`); `--cell-ls` is `0px` in both browsers at DPR 2 (§2.1).
- Letter-spacing and the one-glyph face (`src/theme/fonts.ts:84`) cost nothing
  measurable.
- Confidence: medium. The noise band is ±20–30 %.

**A11 — Chunk containment is essential.**
- Evidence: `contain: none` gives 2–4× worse frames (§2.6). Row-level
  containment is 45–60 % worse in Chromium.
- Confidence: high.

**A12 — A canvas-2D renderer would not change the picture.**
- Evidence: §2.10. At DPR 2 a 5.5-megapixel canvas costs 7–10 ms to blit and
  upload per incremental frame in both headless browsers, and redrawing the
  colour page is no faster than the DOM.
- Inferred: GPU canvas (the owner's machine) would narrow this. Only a WebGL
  glyph-atlas renderer (xterm.js-style) would clearly beat the DOM.
- Confidence: medium. Software canvas in headless.

**A13 — Heavy frames also delay the next frame's start in headless
(inferred).**
- Evidence: with base, `toPaint` for light payloads is 16–21 ms against a
  frame of 5–11 ms. With background rows it is 4–5 ms (§2.8).
- Inferred mechanism: the compositor or raster backlog of the heavy paint
  (software raster in headless) throttles the next rAF. It should be smaller
  on the owner's GPU.
- Confidence: low to medium.

## 4. Proposals, ranked

| ID | Change | Gain (measured unless noted) | Effort | Risk | Owner-visible | Goal; budget (spec §1.3) |
|---|---|---|---|---|---|---|
| **P1** | **Background rows** (`exp-background-rows.patch`). A line with ≥ 4 background runs, uniform flags, one-cell characters, no wider than the pane becomes one row: backgrounds as a hard-stop gradient (stops in % of `calc(var(--cell-w)*n)`, one cell high), text as text nodes with spans only where the fg differs. Otherwise spans as today. | 24-bit page 1: −69 % (FF) / −81 % (Cr). Page 2: −75 % / −77 %. Later frames 6–15 → about 2 ms. Palette charts −71…−83 %. p24b receipt → painted 46 → 12.5 ms (FF). | S–M: patch plus 3 unit tests, output-pane suite 26/26 green. | Visual: identical except the removed 1-px row-edge bleed. Security: none (the CSS is built from numbers; text stays in text nodes). Test churn: small. | A quick look at `help 24-bit colours` is enough; no decision needed. | Text speed, input latency. "Next frame"; "no frame > 50 ms". |
| **P2** | **`content-visibility: auto` on `.wc-chunk`**, with `contain-intrinsic-size: auto <est>` (est = rows × `--cell-h`, or the exact wrapped height from text lengths and cols), and scroll anchoring on while scrolled back. Today the scroller has `overflow-anchor: none` and the pane compensates top trims itself (`output-pane.ts:416–434`); drop that compensation when anchoring is on. | Width change at 20 000 rows: 90 → 6 ms (FF), 129 → 4.6 ms (Cr). Catch-up frames about halved. Chromium small frames −6 %, and the A3 persistence bounded. Firefox small frames ±0 (n = 216). | S for the CSS; M with the anchoring and estimate. | Scroll position jumps when scrolling back into never-rendered or stale-size chunks (after catch-up or a resize); needs an e2e test of PgUp/PgDn and scrolled-back trims. Find, selection and a11y still work with `auto`. Revisits ADR 0009's note. | No. | Long sessions (resize, dock drag), text speed (catch-up). "Scrollback: no slowdown"; "no frame > 50 ms". |
| **P3** | **`MAX_ROWS_PER_FRAME` 1000 → 500** (`exp-row-cap-500.patch`). | Catch-up frames 14–38 → 7–15 ms. | S | The newest line of a big backlog appears later (5 000 lines: 99–148 → 174–197 ms). `npm run bench`'s burst drain may lengthen; the unit test uses the constant. With P2 in place the 1 000-row frames are 10–15 ms, so P3 matters most without P2 or on slower machines. | No. | Input latency, text speed. "No frame > 50 ms" (keeps frames < 16.7). |
| **P4** | **Newest-first catch-up.** When the backlog exceeds about two screens, build the newest ~100 rows first (at once visible), then backfill older rows above at ≤ 500 rows per frame. That means an insertion anchor before the newest block and chunks inserted before it. Echo-attach ops at the split need care: split at a non-echo op. | Inferred: time to newest after a hidden period of ~17 ms instead of 100–400 ms, with smooth frames. | M | Ordering and echo attachment edge cases; unit tests needed. | Yes, a small one: "on return, the latest output shows at once, older lines fill in above". | Input latency and PvP responsiveness after a workspace switch. |
| **P5** | **Static classes for palette 16–255** (480 generated rules) instead of inline style. | Firefox build of 256-colour spans −46 % (12.6 → 6.8 ms for 2 354 spans); frame within noise. The play logs contain no 256-colour codes. | S | Low. | No. | Text speed (rare content). Low priority. |
| **P6** | **Record "measured, keep" in an ADR.** Keep the `scrollTop` write, the font stack and underscore face, `pre-wrap` + `overflow-wrap: anywhere`, chunk containment, no `column-reverse`, no scroll-anchor bottom lock. | Avoids future churn. | S | — | No. | — |
| **P7** | **Do not build a canvas output.** Keep the DOM (ADR 0004's fallback is not triggered). If it is ever reconsidered, only a WebGL glyph-atlas renderer is worth prototyping. | — | — | — | No. | — |

Order of work: P1, then P2, then P3 (or P4 instead of P3, if the owner wants
the newest-first behaviour).

- P1 alone fixes the owner's repro and the stall that follows it.
- P2 fixes the long-session resize stall and halves catch-up frames.
- Neither changes normal-play frames, which are already about 2 ms.

## 5. Benchmark gaps and how `bench/` should cover them

1. **DPR 2 and a large viewport.** The bench runs at DPR 1 and 1280×720
   (`bench/browser-bench.ts:107`). Add a DPR 2 at 1728×1000 configuration
   (Firefox through `layout.css.devPixelsPerPx`, Chromium through
   `deviceScaleFactor`, as `perf/lib.ts` does). The owner plays at DPR 2.
2. **No colour-heavy payload.** Add a synthetic 24-bit and 256-colour chart
   generator to `tests/fixtures`, reproducing MUME's layout (95-cell rows, bg
   per 1–2 cells, some black-fg cells), so it runs without the owner's logs.
   Measure the frame and receipt → painted for one page and for two pages in a
   row. Suggested gate: page frame ≤ 16.7 ms on this machine.
3. **Persistence after heavy rows.** Measure the next 20 small frames after a
   heavy page (`perf/nextframe.ts`). Medians hide it today.
4. **Scrollback medians hide trim frames.** Report p95 and max, and the trim
   frames separately (`perf/fullback.ts`).
5. **Width change at 20 000 rows.** Change `.wc-game` by one cell and time the
   frame (`perf/resize.ts`). Suggested budget: < 16.7 ms.
6. **Catch-up.** Time a 1 000- and a 5 000-line backlog in one socket frame:
   the longest frame and the time to the newest line (`perf/catchup.ts`).
7. **Painted is main-thread only.** Firefox's present is one vsync later.
   Offer an optional Gecko-profiler run (markers only, low overhead) that
   reports `CONTENT_FRAME_TIME` and the scene and frame build
   (`perf/gecko-profile.ts`, `perf/gecko-pipeline.ts`). Chromium LoAF only
   reports frames over 50 ms; a DevTools trace breakdown
   (`perf/trace-chromium.ts`) is better for per-phase costs.
8. **A/B mode.** Interleaved fresh-page runs of two builds, with load logging
   (`perf/ab.ts`). Absolute numbers on a busy laptop drift 2× between runs.
9. **Headless GPU.** Headless Firefox uses software WebRender, so raster and
   composite times are not the owner's. A headed run on the owner's machine
   (not allowed here) or `chromium-gpu` covers raster; the main-thread gates
   are fine headless.

## 6. Notes for other areas

- **E (panes, frame composition).**
  - In Firefox every paint converts the whole window's visible display items
    to WebRender commands (DisplayList + WrDisplayList). A pane-only change
    (clock once a second, timers, group) therefore costs the same full-window
    paint as an output line, several ms with heavy content visible. Coalesce
    pane updates into the output's rAF where possible.
  - The Gecko profile shows the content refresh driver ticking at 60 Hz while
    idle (3 ticks per 50 ms window with no input), probably the caret blink
    `animation … infinite` (`src/ui/ui.css:361–377`). It is cheap per tick
    but never stops.
  - The map pane (on by default) adds about 0.5 ms per frame (map on vs off
    in `perf/nextframe.ts`).
- **C (input latency).** Long render frames delay input handling:
  - p24b base frames are 38–51 ms (p95 up to 107 ms in Chromium);
  - catch-up frames are up to 40 ms;
  - width changes at full scrollback take 90–130 ms.

  P1, P2 and P3 bound these.
- **B (ingest).** Synchronous ingest of the 70–120 KB help pages takes
  1.1–2.8 ms (`repro.ts` "ingest"), which is fine. The assembler already
  merges runs with an identical SGR state.
- **D (long sessions).**
  - The resize finding (A8) is a long-session effect: its cost grows with
    scrollback.
  - A test-data note: `tests/unit/timers-replay.test.ts:19` fails on this
    machine for the owner's new 355-line log `Rasta/2026-09-30T00-11-08.log`
    (it expects > 1 000 lines). This is not a performance problem, but
    anyone running the full unit suite here will see it.

## 7. Worktree, patches, harness

**Worktree:** `/home/ole/proj/webcockpit/.claude/worktrees/agent-ad6131e78670edfbd`.
It is at HEAD 20c4815 with `src/` unmodified, plus the untracked `perf/`
directory (harness, and variant builds in `perf/dists/{base,bgrow,bgrow2,bgclean}`).

**Patches** in `/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/A/`.
Each was dry-run against HEAD. `harness-timing.patch` and
`exp-background-rows.patch` also stack.

- `exp-background-rows.patch` — P1, clean. Changes `src/ui/output-pane.ts`,
  `src/ui/ui.css` (`.wc-fdef`) and `tests/unit/output-pane.test.ts` (3 new
  tests; 26/26 pass). Type check clean.
- `exp-row-cap-500.patch` — P3.
- `harness-timing.patch` — harness only: flush phase timing into
  `globalThis.__wcFlushT`, and the row-cap knob `globalThis.__wcMaxRows`.
- `exp-bgrow.variant.diff` and `exp-bgrow2.variant.diff` — the experiment
  history, relative to the harness base. Superseded by the clean patch.

**Harness** (copies in `…/perf/A/harness/`):

| File | What it does |
|---|---|
| `lib.ts` | Server, launch at DPR 2, stats. |
| `payloads.ts` | Cuts and encodes the payloads. |
| `page-helpers.ts` | In-page injection and timing. |
| `repro.ts` | §2.2. |
| `trace-chromium.ts`, `trace-dump.ts`, `trace-invalidation.ts` | §2.3, Chromium. |
| `gecko-profile.ts`, `gecko-pipeline.ts`, `gecko-markers.ts`, `gecko-ticks.ts`, `gecko-inspect.ts` | §2.3 and §6, Firefox. |
| `lab-page.ts`, `lab.ts`, `lab-report.ts` | §2.5 and §2.6. |
| `nextframe.ts` | §2.4. |
| `ab.ts` | §2.8. |
| `catchup.ts` | §2.7. |
| `fullback.ts`, `resize.ts`, `cvframes.ts` | §2.9. |
| `canvas-page.ts`, `canvas.ts` | §2.10. |
| `census.ts`, `shot.ts`, `imgdiff.py`, `runs-dump.ts` | DOM counts and visual checks. |
| `scan-logs.py`, `frames-stats.py` | §2.11. |
| `build-variant.sh` | Builds one variant into `perf/dists`. |
| `base-output-pane.ts` | HEAD + harness timing. |
| `run-all.sh` | Re-runs everything. |

**One-command re-run on a quiet machine:** copy the harness into `perf/` of a
clean checkout at 20c4815 that has `node_modules`, then run
`sh perf/run-all.sh`. It builds `dist`, applies the patches to build the
variants, reverts them, and runs every harness (ports 4201–4209). The results
go to `$OUT` (default `…/perf/A/rerun`).

**Result files** in `…/perf/A/`:

| Files | Section |
|---|---|
| `repro-base.json`, `repro-bgrow2.json` | §2.2 |
| `ab-bgrow-1.json`, `ab-bgrow2-1.json`, `ab-bgclean-palette.json` | §2.8 |
| `gecko-base.json`, `gecko-bgclean.json`, `gecko-profile.json`, `traces/` | §2.3 |
| `lab-span-1.json`, `lab-span-2.json`, `lab-css-1.json`, `lab-scroll-1.json` | §2.5, §2.6 |
| `nextframe-1.json`, `nextframe-css.json` | §2.4 |
| `catchup-base.json`, `catchup-caps.json`, `catchup-cv.json` | §2.7 |
| `fullback-1.json`, `fullback-2.json`, `resize-1.json`, `cvframes-1.json`, `cvframes-2.json` | §2.9 |
| `canvas-1.json` | §2.10 |
| `shot-*.png`, `diff-*.png`, `crop-*.png` | Visual checks |
