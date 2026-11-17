# 0159 — Balloon notices

Date: 2026-11-17. Status: accepted (built on `stage-69-balloons`; stage 69).

## Context

The owner's idea (stage 69): a gloomy goblin in a hot-air balloon rises
with a sign after a kill: what died, the XP, and a face for how good the
XP was. The prototype (`notes/research/balloons/prototype-v1.html`) set the
look; the owner then set the motion: arrive fast, readable 5–6 s, glide a
little away, then drift slowly for up to a minute into the sky, shrinking
and fading, varied. Later direction the same day: keep to the part of the
screen where the sky shows (on a wide desktop, not over the game text);
the look will be replaced by raster images from an image generator, so
the look must be a swappable layer stack. Off by default.

## Decision

- **Main-thread DOM, not the weather worker.** The look must be swappable
  (SVG now, WebP layers later) and animated later (blinks, waves); DOM
  elements with transforms do that without teaching the worker images and
  text. Cost: one `requestAnimationFrame` loop that runs only while a
  balloon is up and the page is shown (`visibilitychange` stops it; rAF is
  never left scheduled with no balloon); per balloon and frame one
  `transform` (translate + scale), an `opacity` only when it changes, and
  the skin's own two rotations (rounded to 0.1°, written only on change).
  No layout reads: the flight plans with the skin's fixed size and the
  weather engine's last measured geometry (`Weather.geometry()`). Nothing
  on the text path.
- **Lazily loaded, only when wanted.** `src/weather/balloons/` is its own
  chunk. The weather controller (itself lazy, ADR 0091) imports
  `balloons/notices.ts` only while Weather effects and Balloons are both
  on; Balloons off or the effects off destroys it (layers, rAF, listeners).
  `#weather balloon` and the weather demo may load it with Balloons off
  (`controller.balloons(true)`), until the switch or the effects go off.
- **Layering.** The weather's back canvas is the cockpit's first child,
  absolutely positioned without a z-index: it paints in tree order among
  the positioned, `z-index: auto` siblings, so the game pane (`.wc-game`)
  and every pane after it paint over it. The balloons' **sky layer**
  (`.wc-balloons-sky`) is inserted right after that canvas, positioned the
  same way, so it too is under the game text and the panes (behind their
  glass, ADR 0091 "Frames"). The **front layer** (`.wc-balloons-front`,
  z-index 89) is above the text and the panes (floats are 10+), below the
  weather's front canvas (90), the perf overlay and demo caption (95), the
  windows (98) and the drop bars. A balloon is in the front layer while it
  arrives and is readable, and is moved to the sky layer once, when its
  glide starts (a single reparent). Both layers are `aria-hidden`
  (the kill's `◆` line already says it), `pointer-events: none`,
  `contain: strict`.
- **The sky lane** (`flight.ts skyLane`). The sky shows right of the left
  band (worker/band.ts: none to 0.4 W, all from 0.7 W; the lane starts at
  0.56 W, where it is about half in); MUME's lines are 80 columns, so the
  text ends near the game pane's left + 82 cells. The lane is the strip
  right of both; used when it is at least 1.25 balloon widths wide. On a
  wide desktop (1920 × 1080: about x 1075–1912) the readable spot (its
  left part: usually the empty strip right of the text, before the docked
  panes) and every later path keep to it; the drift is clamped to it (only
  the `right` path leaves over the right edge). Without such room (a
  narrow window, the phone) the whole width is used, the readable spot
  right of the middle, and the distant part is behind the text by the sky
  layer, so a balloon covers readable text only while its sign is up.
- **The flight** (`flight.ts`, pure functions of a seed, the layout and the
  time since the kill; unit tested): arrive 0.9–1.1 s (ease-out from the
  quiet spot above the prompt where the body's z z Z rise, growing from
  half size, fading in over 0.3 s); read 5.5–6.1 s (sway, bob, a 2.5 px/s
  creep; the sign gets a damped kick as the arrival stops, then swings
  lazily); glide 1.6–2.4 s (up and aside, to ~65 % size); drift by one of
  three paths: `top` 9–16 s out over the top, `right` 22–40 s wandering out
  over the right edge, `meander` 40–60 s fading out in the sky at ~20 %
  size. Sway amplitude and pace, glide offset, wander and sizes are random
  per seed. The rig leans with its horizontal speed; the sign lags it. At
  most 5 balloons: a sixth hurries the oldest (its clock runs 6× faster);
  beyond that the oldest goes at once. A new balloon's readable spot keeps
  clear of one still near. A smaller screen scales the balloon (0.62–1).
  `prefers-reduced-motion`: no flight; a fade in at the readable spot, the
  readable time, a fade out.
- **The kill feed** (`feed.ts`, `notices.ts`): the run's folded `kill` and
  `pkill` events (the 500 ms fold, `src/runs/events.ts`), through a new
  optional `runs` dependency of the weather hook (`WeatherRuns`: subscribe,
  the live run's events, the chain's events). The face is the Statistics
  pane's rating (ADR 0134): the XP against the median of the chain's last 30
  mob kills, this one included; `calibrating` under 5 (no rating word); a
  pkill is `pvp` ("PvP", its own fierce face). The chain's earlier runs are
  read once (again on `run_start`); the live run's kills are re-read on
  each kill (O(kills), once per kill). A kill while a balloon is arriving
  or readable (until 0.4 s before it leaves) joins its sign: "N kills", the
  summed XP, the best face (pvp > superb > … > calibrating), the last three
  names, and +1.2 s readable time, capped at 9 s.
- **The skin seam** (`skin.ts`): a skin builds one element of a fixed size
  (`size`), sets the mood and the sign, has an optional per-frame hook
  (`frame`: tilt and swing) and optional named actions (`act`: blink,
  wave, cheer; reserved). The flight transforms the element as a whole and
  knows nothing of goblins; the kill feed knows nothing of looks. The sign
  is shared HTML (`sign.ts`: Cinzel on a wooden plank, names as
  `textContent`), never part of a picture.
- **Two skins.** The SVG goblin (`goblin.ts`, the prototype's six faces
  and a fierce `pvp` one), the default. Raster skins (`image-skin.ts`), used
  when `public/balloons/goblin/` holds the required files.
- **Setting.** `weather.balloons`, under Settings → Weather effects after
  the categories, label "Balloons", help "A goblin in a balloon shows each
  kill and its XP.", dimmed with the master switch off. Off by default for
  new and stored settings: an additive field whose absence migrates to off
  (`migrateWeather`), so no settings version (versions are for non-additive
  changes). Synced with the rest of the settings. Not a worker category
  (`categoriesOf` ignores it).
- **Trying it**: `#weather balloon [poor|meh|good|great|superb|calibrating|
  pvp|burst]` (no word: a random rating; `burst`: four kills 650 ms apart
  on one sign) needs the effects on and flies even with Balloons off; the
  weather demo's "A kill" step (5 s, before "Back to the game") shows one.

## Image skins (the owner's contract, 2026-11-17)

Folder `public/balloons/<skin>/` (the first: `goblin`), all transparent
WebP; `public/balloons/README.md` repeats it for whoever draws:

| File | Canvas | Content |
| --- | --- | --- |
| `balloon.webp` | 1024 × 1536 | envelope, ropes, the whole empty basket; rim about x 330–694 at y ≈ 1210, bottom y ≈ 1480 |
| `basket-front.webp` | 1024 × 1536 | only the basket's front wall, over the passenger |
| `passenger-<mood>.webp` | 1024 × 1024 | mood: poor, meh, calibrating, good, great, superb, pvp; chest-up, head centre (512, 400), head ~380 px wide, body cut straight at the bottom |
| `passenger-<mood>-blink.webp`, `passenger-wave.webp` | 1024 × 1024 | optional: the `blink` and `wave` actions |

- Stack: balloon, passenger, basket-front. The passenger is placed at 50 %
  (512 × 512) with its top left at (256, 900) on the balloon canvas, so its
  lower half is behind the basket front. Every passenger image shares that
  placement, so moods (and later frames) swap without a jump: each is an
  `<img>` made on first use and toggled by `hidden`.
- Shown 150 CSS px wide (the files ~3× the screen's pixels); the element is
  180 px wide (the 172 px sign) and the sign hangs from the basket's bottom.
- A missing mood shows `calibrating`; without `balloon`, `basket-front` or
  `passenger-calibrating` the SVG goblin is used.
- Which files exist is known at build time: `import.meta.glob` over
  `/public/balloons/*/*.webp` reduced to its keys (Vite drops the imports),
  so a missing skin is never probed by a request (a 404 would log a console
  error). Adding files needs a rebuild, which a deploy is.
- A new skin: a folder of files and `bundledRasterSkin('<name>')`, or a
  new `SkinFactory` file for another kind of look.

## Consequences

- Balloons appear over the docked panes while readable when the sky lane
  lies over them (narrower desktops), and drift behind the panes' glass;
  behind an opaque pane (the phone's lens map, a map with its own
  background) a distant balloon is hidden, as the sky is.
- Kills in a replay (`#replay`) send balloons too, as they feed Statistics.
- The skins are placeholders: the goblin will be redrawn as WebP layers
  under the contract above; the flight, the feed and the setting stay.
- Later (not this stage): level up, achievements, death; seasonal clothes;
  other passengers for good and evil races; blink and wave timing.
