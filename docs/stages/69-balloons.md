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

### 2026-11-17, after testing round 1 on staging

1. **Desktop only.** No balloons on the phone or tablet layout (none were
   seen there; the owner wants it so for now). Make it explicit: never
   loaded there, `#weather balloon` says so, the Balloons row desktop only.
2. **New notices: level up, death, achievement.** Each its own balloon,
   never merged with kill signs or with each other. Short English sign text
   ("Level 23!", "You died", the achievement's text wrapped and capped).
   New moods with goblin faces (level up overjoyed; death X eyes, ghostly
   grey, gloomy-comic; achievement proud) and raster images with fallbacks.
3. **Motion like a real hot-air balloon.** Round 1 popped up to the middle
   far too fast. It should rise slowly from below the bottom edge (from
   behind the prompt), never move fast, with every acceleration gradual
   (continuous velocity, also at phase boundaries and a joined kill) and a
   balloon's top speed; come to rest low on the screen, readable 5–6 s with
   a gentle sway (a little longer when kills join); then ease into flight,
   somewhat faster than the arrival, shrinking by a varied amount. Keep the
   leave paths, the sky lane, the drift of up to a minute, the sky layer
   once it leaves and `prefers-reduced-motion`.
4. **Never in front of a pane** (the same day). Round 1's readable balloon
   was above the docked and floating panes; it must always be behind every
   pane, in every phase. Over the bare game text is fine while readable
   where it has to cross it.

## Round 2

- [x] Desktop only: `controller.ts` never loads the chunk in the phone's
      layout (`cockpit.isPhoneGame`, phone and tablet), forced or not;
      `#weather balloon` there says "Balloons are desktop only …"; the
      Balloons row lives only in the desktop Settings popup (the phone's
      settings page has none) and its help says "Desktop only". Unit and
      e2e (`?phone=1`: no layers, no chunk fetched).
- [x] Level up, death, achievement (`feed.ts` `Notice`, `signFor`;
      `notices.ts` takes `level_up`, `char_death`, `achievement`): each
      rises alone; a kill joins the newest kill balloon while readable.
      Signs: "Level 23!", "You died", "ACHIEVEMENT" over the text (cut at
      120 characters with "…", clamped to four lines).
- [x] Moods `levelup`, `death`, `achievement`: SVG faces (confetti and arms
      up; grey with X eyes and a crooked halo; smug with a medal on the
      basket); raster `passenger-levelup|death|achievement.webp` with
      fallback levelup → superb, achievement → great, death → poor, then
      calibrating. README and ADR updated.
- [x] `#weather balloon levelup|death|achievement`; the demo's kill step is
      "A kill and a level up".
- [x] Motion (`flight.ts`): a soft-stop arrival profile from below the
      edge, a constant creep while readable, the leave as velocity
      keyframes (linear velocity between them, braking before the room's
      bounds); the sway eased in. Unit tests: velocity continuity at
      1/120 s steps over every phase boundary with two joined kills, the
      speed cap, the readable spot low, the shrink's spread.
- [x] Behind every pane: the readable layer sits right after `.wc-game`
      with no z-index (over the text, under the input row, the docked and
      the floating panes). The readable spot is always over the game pane
      (never behind a docked pane), clear of every balloon still near.
      e2e: hit-testing probes in both layers under a docked and a floating
      pane while it is readable and while it drifts.
- [x] Looked at it in a 1920 × 1080 window (screenshots and a position
      trace) and tuned the cruise speeds and the readable spot.

## Test guide, round 2 (staging)

Open staging on a desktop, a wide window (1920 wide is best), log in;
Settings → Weather effects: **Weather effects** and **Balloons** on.

1. `#weather balloon great`. Look for: it comes up slowly from below the
   bottom edge, behind the prompt line, slows gently and stops low on the
   screen, right of the text (about 7 s); readable there about 5.5 s,
   swaying a little; then it eases into flight, somewhat faster than it
   came, and shrinks as it goes. No sudden starts or stops anywhere.
2. Repeat a few times: some leave over the top, some wander out to the
   right, some meander a long time and fade; some shrink a lot, some
   only a little.
3. Panes: the balloon is behind every pane, always: open a floating pane
   (Statistics) over the game text and let a balloon pass under it; the
   docked panes on the right cover it too.
4. `#weather balloon levelup`, `… death`, `… achievement`: each its own
   balloon and face (overjoyed with confetti; grey with X eyes and a
   halo; proud with a medal); signs "Level 23!", "You died", and the
   achievement's text. `#weather balloon burst` right after a level up:
   the kills still gather on their own sign.
5. `#weather balloon burst`: the kills join one sign and keep it up a
   little longer, with no jerk.
6. On the phone or a tablet: no balloons at all; `#weather balloon` says
   they are desktop only.

Feedback wanted: the rise's pace and the rest spot, the departure's pace,
the shrink, the three new faces and signs, and whether any motion still
feels abrupt.

## Released

- 2026-11-17: round 2 released as **0.17.0** on the owner's word (full
  e2e 1 928 passed, 2 load failures that pass alone; `test:prod` 36/36 on
  mumecockpit.com). Balloons off by default, desktop only.

## Waiting for the owner

- **Images:** the owner makes the goblin with an image generator; the
  working order and prompts are in `notes/research/balloons/image-brief.md`,
  the file contract in ADR 0159 and `public/balloons/README.md` (12 files).
- **Then:** the flight in detail (pace, how long they show, paths). Open
  points to raise: on wide layouts the drift can pass behind the right-hand
  panes and vanish there; the arrival is ~7 s at 1080 px (`V_ARRIVE`).
