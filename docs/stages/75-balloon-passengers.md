# Stage 75 — Balloon passengers

Not a spec §5 row: the owner's follow-up to stage 69 (balloon notices,
ADR 0159). Stage 69 shipped the flight and a placeholder goblin. Five
design rounds later the look is approved: eight passengers on one shared
rig, chosen by the race the player plays. This stage builds that look into
the application.

**Status: built (all eight passengers, the removals); review, the full e2e and staging next. Open: the cost in Firefox's software compositor (ADR 0159 round 3, "Life and cost").** The design was approved by the owner
on 2026-11-21 ("Godkänt, bygg så").

## What is approved (the source to build from)

The mockup at `notes/research/balloons/round5/` is the specification of
the look. Open `local.html` from disk, or the published page
<https://claude.ai/artifact/9Y8GdvcK8C9t1ycENjKvXE>.

| File | What it is |
|---|---|
| `round5/rig.js` | The shared rig: layout constants (`Rig.K`), engraving kit, envelope geometry by condition, ropes, burner mount, flame and glow from `burn`, the deep car, the hung sign with its spring, text filling and the height fit, `show/still/clear`. Its header comment is the contract. |
| `round5/skins/*.js` | The eight passengers: `dwarf`, `elf`, `human`, `hobbit`, `troll`, `goblin`, `orc`, `numenorean`. Each has its vocabulary as a header comment. |
| `round5/harness.js` | The test stage. Its `fly()` holds the approved flame timing (`burn` leads the motion). |
| `round5/trace.mjs`, `shot.mjs` | Tools: a flight as numbers, screenshots. |
| `notes/research/balloons/round5-brief.md` | The rules the look was drawn to. |

The mockup is not product code: it is plain scripts on a test page. Port
it, do not link it.

## The owner's decisions (2026-11-21)

1. **Eight passengers by race**, chosen automatically. No setting to pick
   one by hand.

   | The player's race | Passenger |
   |---|---|
   | Elf, Half-elf | The elf woman |
   | Dwarf | The dwarf |
   | Man | The human woman |
   | Beorning | The human woman |
   | Hobbit | The hobbit |
   | Troll | The troll |
   | Orc, Tarkhnarb | The goblin |
   | Orc, Zaugurz | The orc |
   | Black Númenórean | The Black Númenórean |
   | Unknown (before login, the demo) | The goblin |

2. **Race matching is tolerant, with a test command.** The exact strings
   of `Char.StatusVars` `race` and `subrace` are known only for
   `race: "Man"` / `subrace: "Dunadan"` and `race: "Elf"` /
   `subrace: "Noldo"`. Match on words, case-insensitively, over both
   fields; fall back to the goblin. A command shows which race the client
   sees and flies any passenger, so the owner can check with his own
   characters.
3. **The image variant goes.** `image-skin.ts`, `public/balloons/` with
   its README, the old `goblin.ts` / `goblin.css` and the shared plank
   (`sign.ts`, `sign.css`) are removed. The ADR 0159 section "Image
   skins" is retired by the addendum.
4. **As today:** off by default, desktop only. The default is taken up
   again after the owner's test on staging.
5. **The rig as approved:** signs at 85 %, hung on long cords from just
   under the rim; the car runs down behind the sign; the flame leads the
   motion; 3 s at the readable spot; the whole rig at most 363 px tall.

6. **The sign's text** (2026-11-21, approved): as the mockup writes it,
   "1,900 xp", the joined names as the game gives them with " · " between.
7. **A joined kill** adds 0.7 s readable (the mockup's; main session),
   capped at 5 s.
8. **Fonts:** keep the bundled IM Fell English files for now; its Reserved
   Font Names are an open point before release (ADR 0159 round 3,
   `public/fonts/README.md`).

## Plan

Record the technical decisions in an addendum to ADR 0159 (or a new ADR
if it grows past an addendum).

### A. The seam and the flight

- `skin.ts`: `SkinPose` gains `burn` (0..1). The skin's size becomes the
  rig's (204 × 363). The factory is chosen per balloon from the race.
- `flight.ts`: `READ_S` from 5.5 s to 3 s (and its cap in proportion).
  `burn` is computed from the planned path about 650 ms ahead, with the
  blast about 1 s before the leave, as in `round5/harness.js` `fly()`.
  The product's flight has more phases (`glide`, `drift`) than the
  mockup's: decide what the burner does in each (a long uneven pull while
  it climbs, a pilot flame while it drifts level).
- Check the lane, the readable spot and the avoid-panes rules against the
  taller, wider rig (was 180 × 330).
- Reduced motion: the rig's still form at the readable spot, as today.

### B. The rig and the passengers, as TypeScript

- `src/weather/balloons/rig.ts` (+ CSS) from `rig.js`; one module per
  passenger under `src/weather/balloons/passengers/`.
- **One lazy chunk per passenger.** The eight skins are about 65–80 kB of
  source each; a player needs one. Load the rig with the balloons chunk
  and the passenger with a dynamic import. Measure the gzip sizes and
  write them in the ADR.
- **Check the CSP first** (enforced in production since stage 67). The
  mockup injects `<style>` elements, sets inline `style` attributes with
  custom properties, uses `data:` SVG as CSS backgrounds and SVG filters
  by `url(#id)`. Find out what the product's policy allows before porting
  eight files in a way it refuses; `tests/` has the CSP checks.
- **The sign's 85 %.** The mockup uses CSS `zoom` (`K.SS`), which needs
  Firefox 126 or newer. In the product, either keep `zoom` behind a
  check, or scale the sizes for real. Decide and record.
- Game strings only through `textContent` (as the mockup does).
- **Life and cost.** Every passenger runs small timers and animations
  (blinks, glances, tears, a pipe's smoke). The product's balloons drift
  in the sky for up to a minute, several at once, small and far away:
  stop the passenger's life and drop the filters' cost once a balloon
  leaves the readable phase far enough behind (the stage 69 code already
  has the phases). Measure with `#perf` in Chromium and in Firefox with
  software compositing (ADR 0135).

### C. Choosing the passenger

- A small pure module (`passenger.ts`): `(race, subrace) → id`. Words,
  not exact strings: `elf` (covers half-elf), `dwarf`, `hobbit`,
  `troll`, `beorn` → human, `númenórean` / `numenorean` / `black` →
  numenorean (test this before `man`), `orc` with `zaug` in either field
  → orc, any other `orc` → goblin, `man` / `men` → human, else goblin.
- The race is read when a balloon is made (`state.char.status.race`,
  `subrace`), so a new login is picked up without a reload.
- `#weather balloon` grows: `#weather balloon as <passenger> [what]`
  flies that passenger, and `#weather balloon race` says the race and
  subrace the client holds and the passenger they give. Document it
  where `#weather` is documented.

### D. Removals

- `image-skin.ts`, `goblin.ts`, `goblin.css`, `sign.ts`, `sign.css`,
  `public/balloons/`; their tests and any mention in docs, the manual
  and `About`.

### E. Tests

- Unit: the race mapping (every row of the table, odd casing, empty
  strings); `burn` leads the planned climb on arrival and before the
  leave; the sign's text and the height fit (no notice ends below 363).
- E2E (`tests/e2e/weather-balloons.spec.ts`): each passenger flies
  without a page error or CSP violation; the sign's text is the game's
  text; reduced motion; the switch off means nothing loads.
- Follow the lessons in `CLAUDE.md` ("Tests and worktrees").

### F. Staging and the owner's test

- Deploy to staging, write the test guide below with the real steps,
  hand over. No release without the owner's word.

## Tasks

- [x] Read ADR 0159 and `docs/stages/69-balloons.md`; read `rig.js`'s
      header and `skins/dwarf.js`.
- [x] CSP check: what the product's policy allows of the mockup's
      techniques; decide the porting form. (Inline `<style>`, `style=""`,
      `data:` and `url(#id)` filters pass; Google Fonts do not: the faces are
      bundled, `src/weather/balloons/fonts.ts`, `public/fonts/README.md`.)
- [x] A: `SkinPose.burn`, the size, `READ_S`, the leading burner in
      `flight.ts`; lane and pane rules with the larger rig (unit tested).
- [x] B: `rig.ts`; the dwarf first as the proof (flight, sign, cost);
      then the other seven, one subagent each. All eight ported and look-
      checked; the softer filter of the elf, the human and the hobbit is a
      rig option (`kit.filt` options, `kit.SOFT`).
- [x] B: lazy chunk per passenger; sizes measured (rig 9.4 kB; the
      passengers 16.0–19.8 kB gzip, ADR 0159 round 3).
- [x] B: the sign's 85 % decided: `zoom` where `CSS.supports`, else
      `transform: scale(.85)` with the measure scaled (`rig.ts` fit).
- [~] B: life stops and filters ease once a balloon is far away;
      `#perf` in Chromium and Firefox. `rest()` built and measured; Firefox
      software WebRender drops to ~45 fps while a dwarf arrives (rotated
      parts in a moving element, not the filters): open, see the ADR.
- [x] C: `passenger.ts`, the race read per balloon, `#weather balloon
      as …` and `#weather balloon race` (in the usage and the `#weather`
      hint).
- [x] D: the removals (goblin.ts/css, image-skin.ts, sign.ts/css,
      public/balloons/, their tests; the Settings help by race).
- [x] E: unit tests and e2e: unit suite; the balloon e2e (all eight
      fly from their own chunks, the race picks the passenger, the dwarf's
      kinds, reduced motion, nothing loads with Balloons off) in Firefox
      and Chromium; the production CSP walk enforced with all eight.
- [x] ADR 0159 addendum (or a new ADR): round 3.
- [ ] Review (`/code-review`), fixes, full e2e alone on the machine.
- [ ] F: staging, the test guide filled in, handed to the owner.

## Known weak spots carried over from the design

The owner approved the look with these known. Do not fix them unasked;
they are here so that nobody "discovers" them as regressions.

- The smallest sign text is 10.2 px italic (joined names, achievement
  text): readable, barely. The owner accepted that.
- On a tightened sign (four kills joined, achievement) the text sits
  close to the frame in several skins.
- The visible flame between burner and mouth is short (about 24 px).
- The faces of the elf, the woman and the Númenórean are simpler than
  the dwarf's.
- The elf's deep hull reads as a tub more than a swan boat.
- The woman's three ropes a side bunch under the rim; the troll's sheep
  skull hangs 1.5 px from a sign rope.
- Level up and death signs end at about 343 px, not at the limit.
- Three skins (`elf`, `human`, `hobbit`) carry their own softer copy of
  the rig's filter; in the port that belongs in the rig as an option.
- Motion was judged by the owner in the browser, by the agents only from
  stills and from `trace.mjs` numbers.

Things on the edge of rule 4 ("no effects floating around the
passenger") that the owner saw and let stand: the hobbit's rocket burst
on level up, the hobbit's pipe plume on superb (he asked for it), the
dwarf's smoke rings on good, the troll's small crown on superb, war paint
on a player kill (troll, orc).

## Test guide, the dwarf (staging, 2026-11-21)

Branch `stage-75-balloon-passengers` on <https://staging.mumecockpit.com>.
Only the dwarf is built: every race flies the dwarf for now.

1. A desktop, a wide window. Settings → Weather effects: **Weather
   effects** and **Balloons** on.
2. `#weather balloon race`: the race and subrace the client holds and
   the passenger they would give (the dwarf flies anyway on this branch).
3. `#weather balloon as dwarf superb`, then `… poor`, `… burst`,
   `… levelup`, `… death`, `… achievement`: the look against the mockup;
   the flame lights before it moves and roars just before it leaves;
   3 s at the readable spot; the sign readable.
4. Five in a row (`#weather balloon as dwarf` five times): anything that
   stutters? Known: Firefox without GPU compositing drops to about 45 fps
   while one arrives (the lean and the car's swing; Chromium holds 60).
5. A real kill or two.

Feedback wanted: the dwarf in the real client (size, place, readable
time, the flame's timing), the cost, and whether the other seven may be
ported as they are.

## Test guide (staging, all eight)

To be completed when the stage is built. Wanted from the owner:

1. Settings → Weather effects → Balloons on.
2. `#weather balloon race`: does it say the race you play, and the
   passenger you expect?
3. `#weather balloon as <passenger>` for each of the eight, with `poor`,
   `superb`, `burst`, `levelup`, `death`, `achievement`: the look against
   the mockup; the flame before the motion; the sign readable.
4. Play: real kills with each character you have (Tarkhnarb and Zaugurz
   orcs, a Black Númenórean, a Beorning above all: their race strings
   are not known).
5. Feedback wanted: the readable time (3 s), the size on your screen, the
   cost (does anything stutter with several balloons up), and whether it
   should be on by default.

## Owner feedback

(none yet)
