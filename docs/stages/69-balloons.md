# Stage 69 — Balloon notices

Not a spec §5 row: the owner's idea of 2026-11-17. A gloomy goblin in a hot-air
balloon rises with a sign after a kill: what died, the XP, and a face for how
good the XP was. Later also level up, achievements, death; seasonal clothes;
other passengers for good and evil races. Those are not part of this stage.

Prototype (the owner has seen it): `notes/research/balloons/prototype-v1.html`
(published as https://claude.ai/artifact/VLQswk4Grvxiy1EWMiEqsc).

## The owner's direction (2026-11-17)

1. **Function first, the look is temporary.** The goblin will be redrawn
   from scratch later. Build so that every visual part (balloon, passenger,
   faces, sign) can be replaced without touching the flight or the kill
   logic, and so that the passenger can be animated later (blinks, waves).
   The prototype's SVG goblin is fine as the placeholder.
2. **Motion.**
   - **Arrive fast**: it must feel tied to the kill, the sign readable with
     little delay.
   - **Readable for about 5–6 s.**
   - **Then leave slowly**: first glide a little away, then drift on in the
     sky much more slowly, up to about a minute. It becomes part of the
     weather.
   - **Varied, so it feels alive**: some rise out of the top fairly soon,
     others wander about and leave over the right edge. They shrink (grow
     distant) as they fly, so they seem to vanish into the sky.
3. **Off by default.** A switch in Settings → Weather effects.
4. **Keep to the sky** (later the same day). The balloons keep roughly to
   the part of the screen where the sky shows: on a wide desktop they should
   not glide in over the game text; only without room in the sky (to the
   right) may they fly over it, and then behind the text once distant. This
   holds for the paths after the readable phase and, as far as it fits, for
   the readable spot too.
5. **Raster look later** (the same day). The goblin will be replaced by
   transparent WebP layers from an image generator: the balloon (envelope,
   ropes, basket), one passenger image per mood on one canvas and anchor,
   the basket's front over the passenger; blink and wave frames later as
   extra passenger images. The sign stays HTML. The owner's exact file
   contract is in ADR 0159 "Image skins" and `public/balloons/README.md`.

Design: ADR 0159.

## Plan and tasks

- [x] **A. Kill feed.** The balloon takes the run's folded kill (the 500 ms
      fold, `src/runs/events.ts`) with name and XP, and the Statistics
      pane's rating (`src/runs/kill-rating.ts`: median of the last 30 mob
      kills; calibrating under 5 kills; PvP has no rating word). Kills that
      come while a balloon is still readable join its sign (count, summed XP,
      the best face) and keep it up a little longer (capped).
- [x] **B. Flight.** Phases: arrive (~1 s, from the quiet spot above the
      prompt where `z z Z` rises), read (~5–6 s, gentle sway; the sign
      swings), leave (a short glide away, then a slow drift up to ~60 s,
      shrinking and fading at the end). A few randomised leave paths
      (out over the top sooner; wandering and out on the right; a long
      slow meander), randomised speeds and sway. While distant it is in the
      sky: behind the game text, never covering text one has to read.
      Several balloons at once, capped (the oldest leaves faster).
- [x] **C. Replaceable look.** A small interface between flight and look
      (a "skin": build its element, set the mood and sign, an optional per-
      frame hook for animation, named actions such as blink or wave for
      later). The prototype goblin as the only skin.
- [x] **D. Setting.** `balloons` under Weather effects, default off for
      everyone (new and stored settings), synced like the other weather
      settings. Off, nothing is loaded or drawn.
- [x] **E. Try it without a fight.** `#weather balloon [poor|meh|good|great|
      superb|calibrating|pvp|burst]` and a step in the weather demo.
- [x] **F. Cost.** No work on the text path; transforms only; no frames when
      no balloon is up or the tab is hidden; `prefers-reduced-motion` gives
      a fade in place.
- [x] ADR for the design. Unit tests (feed, merge, flight phases), e2e for
      the switch and `#weather balloon`.
- [x] Sky lane (direction 4): `flight.ts skyLane`, unit tested (wide with
      sky room, narrow without).
- [x] Raster skins (direction 5): `image-skin.ts` to the owner's contract,
      used when `public/balloons/goblin/` has its files; the SVG goblin
      stays the default.
- [x] Full e2e alone at 5 workers (1924 passed, 51 skipped); staging deploy; `test:prod` 36/36 on staging.

## Test guide (staging)

Open staging on a desktop (a wide window is best), log in.

1. Settings → Weather effects: turn on **Weather effects**, then
   **Balloons** (the last row; off for everyone until turned on).
2. Type `#weather balloon great`. Look for: it arrives fast (about a
   second) from above the prompt, right of the text; the sign is readable
   for about 5–6 s while it sways and the sign swings; then a short glide
   away and up; then a much slower drift, shrinking, for up to a minute.
3. Repeat a few times (`#weather balloon`, `… poor`, `… superb`, `… pvp`,
   `… calibrating`): each flight differs (some leave over the top soon,
   some wander out over the right edge, some meander long and fade).
   On a wide screen they should stay in the sky to the right, not over the
   game text; when distant they are behind the panes' glass.
4. `#weather balloon burst`: four kills in two seconds go on one sign
   ("4 kills", the summed XP, the best face) and keep it up a little longer.
5. A real kill: the balloon shows the mob, the XP and the Statistics pane's
   rating (no word for the first 5 kills).
6. Optional: a narrow window: the balloon may cross the text, but once it
   drifts it is behind the text. `#weather demo` has an "A kill" step.

Feedback wanted: the arrive speed, the readable time, the drift's pace and
length, how much variety, the shrinking and fading, whether the sky lane
is right on your screen, and anything about the sign. The goblin's look is
a placeholder (the WebP goblin replaces it).

## Owner feedback
