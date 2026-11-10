# 0135 — Veils under floats in Firefox's software compositor; the `#perf` overlay

- Status: Proposed (stage 50): the veils' look trade-off and the `#perf` overlay await the owner
- Date: 2026-11-10
- Related: ADR 0091 (weather engine, holes under floats, item 57), ADR
  0095 (clear panes), ADR 0123 (the Lykta frame), ADR 0047 (`#perf`, and
  its stage 50 addendum), ADR 0044 (overhead rules), stage 49's finding
  (`docs/stages/49-comm-stats-panes.md`, "The Firefox weather case").

## Context

Stage 49 found headless Firefox at 12–14 fps with the weather on and a
large framed float (the Statistics pane, 80 × 24 cells) over the game
text. Text took 45–50 ms (median) to reach the screen, and typed letters
78–128 ms (p95). Border off, a small float or the weather off ran at
60 fps, and Chromium was unaffected. Headless Firefox composites in
software, so the open question was whether a real window does the same.
The owner plays in Firefox with hardware WebRender.

Stage 50 measured it (`bench/frame-matrix.ts`, numbers in
`docs/stages/50-firefox-frame-latency.md`):

- **Compositor.** Every Firefox row records about:support's
  "Compositing", read over Marionette in the browser itself
  (`bench/float-frame.ts` `firefoxCompositor`). Playwright's headed
  Firefox on the owner's machine (Wayland, Intel Iris Xe) runs hardware
  WebRender ("WebRender"), as the owner's own Firefox does. Headless runs
  "WebRender (Software)". The `gfx.webrender.software` pref did not take
  in a real window; Mesa's software GL (`LIBGL_ALWAYS_SOFTWARE=1`) did,
  as on a machine without a usable GPU ("headed-sw").
- **Hardware WebRender (the owner): no problem.** In a real window
  every case runs at 60 fps, the same as with the weather off or the pane
  docked.
- **Software WebRender, real window or headless: the problem.** The frame
  interval while text arrives is 110–120 ms (median) and 190–215 ms (p95),
  and receipt → painted is 66–85 / 140–175 ms. That holds for every
  large float (Statistics, Comm, Group), glass or clear, dark or Paper.
  Docked, it is fine. The weather is not needed: a clear float with the
  weather off is just as slow.
- **Cause: the hole in the game text, not the frame's effects.**
  - With the weather on, a float is see-through. A clear float is
    see-through always. So what lies under it is cut out of the game text
    and the input line with an even-odd `clip-path: path()`
    (`src/layout/float-holes.ts`, ADR 0091 item 57, ADR 0095).
  - Removing only that clip brings software WebRender back to 60 fps
    (busy interval 16.6 / 18.0 ms, text 12 / 23 ms).
  - Removing any single frame effect does not: the band's path clip, its
    gradients, its edge, the seams, the glow, the window's path clip,
    gradients or inset shadows, or the hood. Removing the whole band or
    the whole window helps in part, because the masked area has less on
    top of it.
  - Per-thread CPU (`bench/thread-cpu.ts`) puts the cost on WebRender's
    Renderer thread: 7.4 s of CPU over a 7.5 s text phase (saturated),
    against 2.0 s without the hole.
  - A rectangular `inset()` clip on the game text is as cheap as none. A
    `polygon(evenodd)` hole is as slow as the path. `will-change` on the
    game text or the float, and `opacity` on the game text, change
    nothing.
  - Each new line scrolls the game text. In software WebRender, every
    text run under a non-rectangular clip is re-rasterised with a mask,
    over the float's whole height and the game's width. On a GPU that
    costs nothing.

## Decision

### Veils instead of holes in the game text, when the compositor is slow (Firefox)

In Firefox only (`/\bGecko\/\d/` in the user agent), and only once the
page has seen the slowdown, the game text and the input line get no hole.
They get a **veil** instead (`float-holes.ts`):

- A veil is a plain absolutely positioned box in the page colour
  (`--term-bg`) at each see-through or clear float's place.
- It sits right after the input line in the cockpit, so it paints above
  the game text and the input line and below every pane.
- The holes in docked panes and lower floats stay as they were.

**The look changes for those users only, and only with the weather on.**
The weather no longer shows through a large float; the float looks as it
does with the weather off. A clear float with the weather off looks
exactly as before. On hardware WebRender (the owner) nothing changes.
This is a trade-off for the owner to confirm (stage 50 test guide).

**A live weather image was tried and rejected.** The first prototype
painted the back layer in the veil as a live image of its canvas
(`-moz-element(#back)`). It kept the look: screenshots on dark and Paper,
glass and clear, differed by at most 8 of 255, the weather's own noise.
But it had two problems:

- The image costs a main-thread paint every time the canvas changes
  (30 fps). That is about +8–10 ms on a typed letter's next frame
  (median), in a real window with software WebRender, and +7–10 ms with
  hardware WebRender.
- When it first painted, it froze Firefox for 10 s (one rAF gap of
  10 020 ms) in about half the switches, in a real window with software
  WebRender. The canvas belongs to a worker (OffscreenCanvas), and a
  snapshot from the main thread evidently waits on it. A plain veil never
  froze in the same runs.

**Why not veils always.** The hole costs nothing on hardware WebRender,
and the veil drops the weather inside the float.

**When.** The browser does not tell a page which compositor it runs.
App's `FloatVeilWatch` (`src/layout/veil-watch.ts`) decides from what it
sees, and switches once per page:

- It is fed every received → shown measurement from the latency monitor
  (`PerfMonitor.onShown`, ADR 0047). The hook is set only in Firefox and
  removed once the watch has decided.
- It judges only frames where the game text had a hole and our own flush
  took at most 8 ms. A burst is late because of our script, not the
  compositor.
- A frame is late when received → shown, less its own script, exceeds
  35 ms (two frames).
- When half of the last 24 judged frames have stayed late for 4 s, it
  calls `Cockpit.useFloatVeils()`.
  - The 4 s keep a page load out of it. The first seconds after a load
    are slow on any machine.
  - Before this rule, a back-to-back run of lines right after a load
    switched a hardware-WebRender Firefox once, in the frame screenshots.
- On hardware WebRender it does not switch. There received → shown is
  about 13–17 ms (median) and 24–27 ms (p95), with or without a float.
- In software WebRender about two thirds of the lines under a large
  float are later than 35 ms. It switches about 4 s after the text starts
  arriving.

### Measuring it

- `bench/float-frame.ts`: the cells (pane, float or dock, size, border,
  glass, weather, Paper, extra CSS or script) and their measures:
  - the idle frame interval;
  - receipt → painted and the frame interval while text arrives (after
    60 unmeasured frames, so the watch has decided);
  - typed letter → rendered;
  - whether veils are in use;
  - the compositor over Marionette.
- `bench/frame-matrix.ts`: the matrix CLI. Its modes are `headed`,
  `headed-sw` and `headless`, and it includes the bisecting and prototype
  cells.
- `bench/thread-cpu.ts`: CPU per browser thread over the text phase
  (Linux `/proc`).
- `bench/frame-shots.ts`: the frame's screenshots on dark and Paper,
  every tint, glass and clear.
- **Regression check:** browser-bench's `float` section measures the
  framed Statistics float over the weather against the pane docked, in
  each browser (headless: Firefox in software WebRender, where it used to
  fail). There are two budgets:
  - frame interval while text arrives, p95 ≤ 34 ms;
  - receipt → painted p95 ≤ the docked pane's + 15 ms.

  Main failed both (≈ 200 ms and ≈ 150 ms over).

### The `#perf` overlay

Owner decision, through the main session: one tool. `#perf` alone turns
a live overlay on or off, and `#perf report` prints the table. Details
are in the ADR 0047 addendum.

- The overlay is a small `<pre>` low in the left corner. It is fixed, at
  z-index 10000, in `--term-fg` on `--term-bg` at 82 % (readable on dark
  and on Paper). It has `pointer-events: none` and `aria-hidden`, so it
  takes no tab stop and no keys.
- It shows:
  - fps over the last second;
  - the worst frame of the last 5 s;
  - received → shown and key → send as median / p95 over 30 s.
- The figures are pure (`src/app/perf-live.ts`, unit-tested): a
  1024-entry frame-interval ring, and `Ring.valuesSince` for the rolling
  windows.
- The frame rate is there because received → shown ends after the main
  thread's paint. A slow compositor shows in the frame intervals (the
  refresh driver waits for it), not in that figure itself.
- **Cost.**
  - Off: nothing. The chunk is not loaded, and there is no loop, timer
    or listener.
  - On: one rAF callback per frame (two typed-array stores) and a 250 ms
    interval that writes one text node.
  - Measured with the overlay on against off in the same cells: within
    noise in hardware WebRender; in software WebRender the frame
    interval's p95 rises by 2–3 ms (its text repaint four times a
    second), with no effect on the latencies
    (`docs/stages/50-firefox-frame-latency.md`).
- On for the tab's session: `sessionStorage` `wc.perfOverlay`.

## Alternatives rejected

- **A cheaper clip shape.** `polygon(evenodd)` is as slow as the path, and
  `inset()` cannot make a hole.
- **Layer hints** (`will-change`, `opacity`) on the game text or the float
  changed nothing.
- **Dropping or simplifying a frame effect.** No single effect is the
  cause; the frame only makes the masked area costlier. It would also
  change the look.
- **Veils always.** They would drop the weather inside floats for
  everyone, and hardware WebRender does not need them.
- **A veil with the weather's live image** (`-moz-element`). It kept the
  look, but it froze Firefox for 10 s at about half of the switches and
  cost a main-thread paint at 30 fps (see above).
- **A copy of the back layer drawn by the worker for the float.** It runs
  a frame apart from the real one (owner item 57: a lit rectangle in a
  lightning flicker).
- **Pausing or clipping the weather under floats.** A change of look, and
  it would not help a clear float with the weather off, which is just as
  slow.

## Consequences

- Firefox users on software WebRender (blocklisted or missing GPU
  drivers, virtual machines) keep 60 fps with a large float over the
  game, without the weather inside it. The first 4 s or so of text after
  they open one are still slow, until the watch switches.
- On hardware WebRender (the owner) nothing changes: holes as before, and
  no veil cost.
- A hardware machine that sees most quick frames late for another reason
  would switch to veils. It loses the weather inside floats; the veils
  cost it nothing measurable.
- The trade-off for those users is the weather not showing through large
  floats. If the owner prefers the 12–14 fps with the weather in the
  float, the watch is one line in App to remove.
- A small float (14 × 6) in software WebRender is still slow now and then
  (text p95 50–80 ms, median fine). That is too seldom for the watch,
  which needs two thirds of the frames late.
