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

## Plan and tasks

- [ ] **A. Kill feed.** The balloon takes the run's folded kill (the 500 ms
      fold, `src/runs/events.ts`) with name and XP, and the Statistics
      pane's rating (`src/runs/kill-rating.ts`: median of the last 30 mob
      kills; calibrating under 5 kills; PvP has no rating word). Kills that
      come while a balloon is still readable join its sign (count, summed XP,
      the best face) and keep it up a little longer (capped).
- [ ] **B. Flight.** Phases: arrive (~1 s, from the quiet spot above the
      prompt where `z z Z` rises), read (~5–6 s, gentle sway; the sign
      swings), leave (a short glide away, then a slow drift up to ~60 s,
      shrinking and fading at the end). A few randomised leave paths
      (out over the top sooner; wandering and out on the right; a long
      slow meander), randomised speeds and sway. While distant it is in the
      sky: behind the game text, never covering text one has to read.
      Several balloons at once, capped (the oldest leaves faster).
- [ ] **C. Replaceable look.** A small interface between flight and look
      (a "skin": build its element, set the mood and sign, an optional per-
      frame hook for animation, named actions such as blink or wave for
      later). The prototype goblin as the only skin.
- [ ] **D. Setting.** `balloons` under Weather effects, default off for
      everyone (new and stored settings), synced like the other weather
      settings. Off, nothing is loaded or drawn.
- [ ] **E. Try it without a fight.** `#weather balloon [poor|meh|good|great|
      superb|calibrating|pvp|burst]` and a step in the weather demo.
- [ ] **F. Cost.** No work on the text path; transforms only; no frames when
      no balloon is up or the tab is hidden; `prefers-reduced-motion` gives
      a fade in place.
- [ ] ADR for the design. Unit tests (feed, merge, flight phases), e2e for
      the switch and `#weather balloon`.
- [ ] Full e2e alone at 5 workers; staging deploy; `test:prod` on staging.

## Test guide (staging)

To be written when built.

## Owner feedback
