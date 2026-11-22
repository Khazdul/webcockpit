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

## Addendum: round 2 (2026-11-17, the owner's feedback on staging)

Supersedes the parts of "Decision" above on layering, the flight's timings,
the cap's hurry and "Later" for level up, achievements and death.

- **Desktop only.** `controller.ts` never imports the chunk while
  `cockpit.isPhoneGame` (the phone's layout: phones and tablets), forced
  or not; `#weather balloon` says "Balloons are desktop only for now …"
  (`BALLOONS_DESKTOP_ONLY`). The Balloons row exists only in the desktop
  Settings popup; its help says "Desktop only". The stored setting is
  untouched (it syncs and applies on a desktop).
- **Never over a pane.** The readable layer (`.wc-balloons-front`) loses
  its z-index 89 and is inserted right after `.wc-game`: positioned with
  `z-index: auto`, it paints in tree order over the game text and under
  the input row (it rises from behind the prompt), every docked pane
  (later siblings) and every floating pane (z-index 10+). The sky layer
  is unchanged. So a balloon is behind every pane in every phase and over
  bare game text only while arriving and readable. The readable spot is
  therefore kept over the game pane (`readHi`: never behind a docked
  pane); where the strip right of the text is too narrow, it is over the
  text's right end. It keeps clear of every balloon still near (not only
  the last).
- **The flight, a hot-air balloon** (all pure functions, unit tested; the
  velocity is continuous everywhere, including a joined kill):
  - arrive 5.5–6.5 s, longer when the way up is long (about 7 s at
    1080 px): from below the bottom edge (hidden) straight up to the
    readable spot by the profile g(u) = (1 − u)²(1.2 + 7.2 u): it enters
    already rising, peaks early at ≤ `V_ARRIVE` (110 px/s) and stops with
    no deceleration left; a u³ − u² term hands on the creep's velocity;
  - read 5.5–6.1 s (+1.2 s per joined kill, at most 9 s) at the readable
    spot, low: its sign just above the prompt's strip. A constant 2.5 px/s
    creep upward, so lengthening it moves nothing; sway 5–10 px at 0.5–0.8
    rad/s, eased in as the arrival ends; the sign's kick at the stop is
    smaller (3°);
  - leave: velocity keyframes every 2.5 s, the velocity linear between
    them (the position a piecewise quadratic, C1), each change capped at
    24 px/s², and braking at 12 px/s² before the room's bounds (the lane,
    the top unless the path leaves over it, never lower than it read). The
    glide (4–5 s, at least cruise / 24 px/s²) eases from the creep to a
    cruise of 95–115 (top), 85–110 (right) or 70–95 px/s (meander), which
    then decays (5–8 s) to a drift pace of 40–60, 18–30 or 8–15 px/s. The
    top and right paths end once out of sight, the meander after 40–58 s
    with a fade; any leave ends by 58 s;
  - it shrinks over the leave (12 s for top, 30 s for right, the whole of a
    meander) to 30–85 %, 25–80 % or 15–40 % of its size: some a lot, some
    only a little;
  - `VMAX` 150 px/s bounds every point of the flight, the sway included
    (measured ≤ 119 over 300 seeds); accelerations stay under about
    45 px/s² (the largest at the hidden start).
- **Too many up**: the oldest no longer runs its clock 6× faster (a jump in
  speed); it fades out over 1.5 s where it flies (`HURRY_FADE`).
- **Level up, death, achievement.** `feed.ts` has a `Notice` union: a kill,
  `{ kind: 'levelup', level }`, `{ kind: 'death', level? }`,
  `{ kind: 'achievement', text }` from the run's `level_up`, `char_death`
  and `achievement` (GMCP Event.Achieved) events. Each rises on its own
  balloon; only kills join, onto the newest kill balloon while it is
  readable. Signs (`signFor`): "Level 23!" and "You died" as the big line
  alone; "Achievement" over the text, cut at 120 characters with "…" and
  clamped to four lines (the 330 px planned height holds). Moods `levelup`
  (overjoyed: eyes shut, wide grin, arms up, stars, confetti), `death`
  (ghostly grey, X eyes, hanging ears, wobbly mouth, a crooked halo),
  `achievement` (proud: smug lids, closed smile, a medal on the basket).
  `#weather balloon levelup|death|achievement`; the demo's step "A kill and
  a level up".
- **Image contract**: `passenger-levelup.webp`, `passenger-death.webp`,
  `passenger-achievement.webp` (same canvas and placement); a missing one
  falls back levelup → superb, achievement → great, death → poor, then
  calibrating (`MOOD_FALLBACK`).

## Addendum: round 3, the passengers (stage 75, 2026-11-21)

The owner approved the round 5 mockup (`notes/research/balloons/round5/`):
eight passengers on one shared rig, chosen by the player's race. This
addendum covers the port: the rig, the dwarf first (the proof, approved
on staging: "Det ser bra ut. Kör vidare med alla sju"), then the elf, the
human woman, the hobbit, the troll, the goblin, the orc and the Black
Númenórean. It supersedes the "Decision" parts above on the skin seam,
the default skin, the readable time and the sign, and **retires the
section "Image skins"** and the round 2 "Image contract": the raster skin
is gone (below, "Removals").

- **The CSP check.** The production policy (`public/_headers`, enforced
  on staging and production) allows what the mockup does: inline
  `<style>` and `style=""` (`style-src 'unsafe-inline'`), `data:` images,
  and SVG filters, clips and patterns by `url(#id)` (same document). It
  refuses Google Fonts (`font-src 'self'`). The production CSP walk
  (`tests/e2e-prod/csp.spec.ts`, `WC_PROD_CSP=enforce`) now flies a dwarf
  with a kill and an achievement: no violation in Chromium or Firefox.
- **Fonts.** The signs' faces are bundled: Cinzel 500 (new) and 700,
  Cormorant Garamond 500 upright and italic (existing files), 600 upright
  and italic (new), IM Fell English roman and italic and IM Fell English
  SC (new): Google Fonts' own Latin subsets, from `@fontsource/*@5.3.0`,
  unmodified (`public/fonts/README.md` "Balloon sign faces"). They are
  added with `FontFace` (`balloons/fonts.ts`) only while the balloons run
  (never at the app's start, never with Balloons off; taken out of
  `document.fonts` again on destroy), under family names of their own
  (`WCB …`) so the app's one-weight Cinzel and Cormorant rules gain
  nothing; the ported CSS keeps the mockup's family names and
  `signFonts()` rewrites them as the style is inserted. A sign is made
  once the faces have loaded (at most 2.5 s; the rig fits it again when a
  face arrives later), so the height fit measures the real face. The new
  files are 237 kB (the three IM Fell files 175 kB of it), fetched once.
  **Reserved Font Names, settled before release:** IM Fell English
  declares them ("IM FELL English Roman", "… Italic", "… SC"; © 2007/2010
  Igino Marini). A subset is a Modified Version under OFL 1.1, which may
  not keep such a name, so the three files are renamed "WCB Engraved"
  (roman, italic) and "WCB Engraved SC" (`WCBEngraved-*-latin.woff2`):
  only the `name` table changed, the copyright notice kept, every other
  table byte-identical, so the look and the measurements are unchanged
  (`public/fonts/README.md`). Cinzel and Cormorant Garamond declare none.
- **The porting form.** `balloons/rig.ts` is `rig.js` as TypeScript:
  same geometry, markup, CSS values and timings; `passengers/dwarf.ts` is
  `skins/dwarf.js` likewise (a word diff shows only types), and so are
  the other seven (`passengers/<id>.ts`). No harness:
  `createRig(ctx, spec).make(sign)` returns a `BalloonSkin` for the
  product's flight. CSS stays as the mockup's strings (the dwarf's is
  generated from its pose tables): one `<style data-wc-rig>` per id and
  document, reference-counted, removed with the last rig. The rig sits in
  an absolutely positioned wrapper (`.wc-balloon`; the rig's own
  `position: relative` is kept). Game strings only through
  `textContent`; the markup strings are the code's own.
- **The sign's 85 %.** CSS `zoom` on the inner element where
  `CSS.supports('zoom', '0.85')` (Chromium, Safari, Firefox 126+); else
  `transform: scale(.85)` from the top left, the sign's box set to the
  scaled height, so the measurement and the height fit come out the same.
- **The seam.** `SkinPose.burn` (0..1); the size is the rig's, 204 × 363
  (`RIG_SIZE`, `K.W`, `K.MAXH`); a skin is made with its first sign
  (`SkinFactory(doc, { sign })`); an optional `rest()`. The flight's tilt
  is the rig's lean, its swing the car's (hinged at the mouth; the sign
  lags it on its own spring), and glide and drift are the rig's `leave`.
  The swing's lazy term is now the mockup's 1.2° at 1.6 rad/s (the old
  2.5° at 2.1 moved only the plank).
- **The burner** (`flight.ts`, the mockup's `fly()`). `burnTarget(p, t)`
  reads the planned path `BURN_LEAD` 0.65 s ahead: the climb over 90 px/s
  while it arrives (full while it rises, falling before it slows), the
  pilot flame (0.1) while readable, a blast from 1 s before the leave to
  0.9 s after it (up in 0.18 s, then 45 % down), and from then on the
  climb over 34 px/s in long uneven pulls (0.78–1 at 2.1 rad/s): a
  balloon still climbing in its glide or drift keeps burning, one that
  drifts level or sinks shows the pilot flame. `burnStep` follows it (time
  constants 0.11 s up, 0.32 s down), from 1 at the launch, per balloon in
  `balloons.ts`. Reduced motion: a steady 0.15. Unit tested: the burner
  leads the planned climb on arrival and roars about a second before the
  leave while the balloon is still at rest.
- **Readable time.** `READ_S` 3 s (+0–0.6 s), `READ_EXTEND` 0.7 s per
  joined kill (the mockup's), cap `READ_MAX` 5 s (9 · 3 / 5.5).
- **The lane and the panes with the larger rig.** Unchanged rules; the
  unit tests run at 204 × 363: on 1920 × 1080 the lane is x 1075–1912
  (needs 255 px), the readable spot 1177–1304, over the game pane.
- **Reduced motion.** The flight holds the balloon at its readable spot
  (fade in, read, fade out); the rig is its still form (`rig-rm rig-at
  rig-still`, the rest pose, no life, no animation).
- **The sign's text** (owner, 2026-11-21: approved). As the mockup writes
  it: the XP in full ("12,400", lower-case "xp"), joined names as the game
  gave them, " · " between (the rig cuts a long line with an ellipsis).
- **Lazy chunks** (`npx vite build`, gzip): the balloons' own code
  4.9 kB (`notices-*.js`; `balloons.ts`, `flight.ts`, `feed.ts`,
  `fonts.ts`) and the rig 9.4 kB (`rig-*.js`, its own chunk because every
  passenger imports it; it loads with the balloons), plus 0.2 kB of CSS.
  One chunk per passenger (`passenger.ts` `CHUNKS`, a dynamic `import()`
  each), fetched when the balloons start (the player's) or when a notice
  needs another (`#weather balloon as …`): elf 16.0 kB, goblin 16.6,
  orc 16.7, hobbit 17.9, troll 18.1, human 18.2, Númenórean 18.4, dwarf
  19.8 kB (47–64 kB raw). A player fetches one.
- **The softer filter.** The elf, the human and the hobbit drew softer
  copies of the rig's engraving filter. It is a rig option now:
  `kit.filt(id, opts)` takes, beyond the wobble and the grain, the ink
  tone's colour (`ink`), strength and offset (`blot`, `bias`) and the
  grain's alpha (`ga`, `gb`); `kit.SOFT` is the elf's set. The three
  passengers' filters are numerically the same as before (their `defs`
  compared; only "0.7" became ".7"), and the look check is unchanged
  (equal heights, 0.10–0.12 % of pixels differing, death aside, below).
- **Choosing the passenger** (`passenger.ts`, unit tested): whole words,
  case-insensitive, diacritics folded, over race and subrace together;
  `numenor…`/`black` → numenorean (before "man"), `elf(ves)` → elf,
  `dwarf(ves)` → dwarf, `hobbit(s)`, `troll(s)`, `beorn…` → human,
  `orc(s)` with `zaug…` → orc, other `orc(s)` → goblin, `man`/`men`/`human`
  → human, else the goblin. Read per balloon from `Char.StatusVars`
  (`controller.ts`), so a new login needs no reload. The sky behind
  (`data-sky`: the glow's strength, the night's pen halo) is read per
  balloon too: night after dark, overcast under clouds, rain or snow,
  dusk in the day's first and last tenth, else day (`skyModeOf`).
- **Commands.** `#weather balloon as <passenger> [what]` flies that
  passenger (dwarf, elf, human, hobbit, troll, goblin, orc, numenorean);
  `#weather balloon race` says the race and subrace the client holds and
  the passenger they give. In `WEATHER_USAGE` (it lists the eight ids)
  and the `#weather` hint (`src/script/commands.ts`).
- **Removals** (stage 75 part D, the owner's decision 3): the stage 69
  SVG goblin (`goblin.ts`, `goblin.css`), the raster skin
  (`image-skin.ts`, `bundledRasterSkin`, `public/balloons/` and its
  README) and the shared plank (`sign.ts`, `sign.css`, `.wc-bsign-*`),
  with their tests. The Settings help now says "A balloon shows each kill
  and its XP, a level up, a death and an achievement, flown by someone of
  the race you play. Desktop only." The unit tests' fixed skin is the rig
  with the dwarf in its still form.
- **The death notice's half pixel** (look check): six passengers' death
  shots sat one device pixel (half a CSS px) higher in the product than in
  the mockup. The harness, not the product: the mockup's sheet centres
  each rig in a 428 px cell, so a rig of odd height (the death sign: 347
  px) starts on a half pixel (`top` …671.67 against …171.17 for the
  others); the product's rig is laid out on whole pixels. The human's
  death rig is 348 px tall, so it does not show. Nothing to fix.
- **Cost with mixed passengers:** five balloons (elf, troll, hobbit,
  Númenórean, orc) in Chromium (headless) with `#perf`: 60 / 60 / 60 fps
  (arrive + read, leave, drift), p95 16.7 ms, as with the dwarf.
- **The look check.** The mockup's sheet (`local.html#dwarf`) and the
  product's rig at scale 1, both in their still form (reduced motion: no
  life, no animation), on one plain background, 2× device pixels, for the
  eleven notices (seven kill moods, four joined, level up, death,
  achievement) at night and by day: the signs' heights are the same to the
  pixel (364, 366, 346, 347), and after aligning (0 or 1 device px) 0.16–
  0.49 % of the pixels differ by more than 8/255. What differs: text at a
  sub-pixel offset (the mockup's sheet centres its cells at fractional
  x), and the lantern's and the anvil's dangle, which follows the clock.
  Once (by day) the mockup itself fitted the achievement a step smaller
  than on another run (its fit ran before the faces had loaded); the
  product's fit waits for the faces and did not vary.
- **Life and cost** (the `#perf` overlay and an rAF meter beside it, the
  game at 1920 × 1080 in `?replay`, the weather on; one balloon, or five
  dwarves launched 0.4 s apart; mean fps over arrive + read, the first
  12 s of the leave, and the drift after it):
  - Chromium (headless): 60 / 60 / 60 with five, with or without `rest()`.
  - Firefox, software WebRender (headless): the weather alone 60; the old
    goblin 60 (one) and 60 / 53 / 55 (five); the dwarf **45 / 55 / 60**
    with one, 34–48 / 40–55 / 45–60 with five (runs vary). Without
    `rest()` the drift was 60 too, so `rest()` buys nothing measurable
    there; it stays for the timers and the per-frame work it saves.
  - The cause, by elimination (one dwarf): not the SVG filters (all off:
    45), not the clip paths, not `will-change` on the parts or the
    wrapper, not sub-pixel or 3D translation (rounded, 2D: 45), not the
    flame, the sign, the ropes or the life. The balloon still costs
    nothing while it does not move (60), nor moving with its parts
    unrotated (59). Any rotation of the envelope or the car inside a
    moving balloon, even a fixed 1°, brings it to 45: software WebRender
    redraws rotated content of a moving element every frame. The drift's
    changing scale is not the problem (60 after the leave).
  - The cost scaled with the window, not the balloon (at 1280 × 720 the
    same rotation ran at 60), so the rotated part made WebRender redraw
    the whole screen's picture cache each frame, not just the balloon.
    Fixed in "The layers are fixed", below; the lean and the swing stay.
    (A headed run gave no clean number: the window ran at 29 fps with no
    balloon too.)
- **The layers are fixed** (same day). Tried on one dwarf, arrive + read
  in headless Firefox (software WebRender), with the rotation kept:
  `overflow: visible` on the car's clip 45.7, no clip paths 46.0, the
  rotation on the moving wrapper instead of the parts 46.9,
  `backface-visibility: hidden` 44.9, `image-rendering: pixelated` 45.1,
  a filter on the parts 45.4, `isolation` 45.2, `transform-style:
  preserve-3d` 44.8, `overflow: auto` on the layer 47.8, no `contain` on
  it 45.0, no `will-change` 44.8; every SVG in the envelope and the car
  hidden 46.4 (so not their content); `contain: paint` on the parts 56.3
  (it clips them to their zero-height boxes: no use). **`position: fixed`
  on the two layers: 60.** WebRender gives fixed content a picture cache
  slice of its own, so a balloon's frame redraws only that slice. A
  quantised rotation (writing it at a lower rate) was not tried: a fixed
  1° costs as much as a changing one.
  - The layers keep the cockpit's box: `balloons.ts` sets `left`, `top`,
    `width` and `height` from the cockpit's `getBoundingClientRect()` at
    the start and on a resize (`ResizeObserver` on the cockpit, and the
    window's `resize`), through `pinBox`, which also corrects for a
    containing block that is not the viewport (an ancestor with a
    transform; unit tested). A fixed element escapes the cockpit's
    `overflow: hidden`; the layer's own clips it to the same box. The
    paint order is unchanged (`z-index: auto`; the layer was already a
    stacking context by its `contain: strict`).
  - Mean fps over arrive + read / the first 12 s of the leave / the
    drift. Firefox (software WebRender): one dwarf 44.6 / 54.2 / 60 →
    **60 / 60 / 60**; five mixed (elf, troll, hobbit, Númenórean, orc,
    0.4 s apart) 40.0 / 56.2 / 60 → **60 / 60 / 60** (p95 17.3 ms).
    Chromium (headless): 60 / 60 / 60 before and after, one and five.
  - The look is the same for everyone. The product's reduced-motion
    dwarf at its readable spot (seeded flight) is pixel-identical before
    and after in Chromium and Firefox, at the same box; the rig look
    check (`dwarf`, night) is unchanged (no pixel over 3 %). The balloons
    e2e (under every pane in every phase, both browsers) passes. The
    fallback the owner had accepted (flattening the lean where ADR 0135's
    watch sees a slow compositor) is not needed and not built.

## Addendum: the setting's help (2026-11-22, the owner's feedback on the film)

The owner did not want the Balloons row to list what sends a balloon.
`BALLOONS_ROW.help` (`src/chrome/weather-model.ts`) now reads "A companion
in a hot-air balloon reacts to what happens in the game. Desktop only."
and replaces the text quoted in round 3 ("A balloon shows each kill …").
What sends a balloon, and who flies it, are unchanged.
