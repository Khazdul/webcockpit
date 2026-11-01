# Stage 31 — Menu bar clock and weather smoothness

Status: **Done** (2026-11-01; the owner keeps an eye on the clock at dawn
and dusk while playing). Owner brief 2026-11-01 (below). After this stage: a release
(stage 30 and 31 together), then the owner's deferred device tests (stage
30's tablet and phone items, the 30e Spotlights guide, and other open
owner tests).

## Goal

Two independent parts, in this order:

- **31a Clock in the menu bar.** The clock should blend into the menu bar.
- **31b Weather smoothness.** Snow feels laggy and jerky; find out why and
  fix it, and review the other weather effects the same way.

## Owner brief (2026-11-01)

1. **Clock.** The clock beside the menu bar does not blend in: its text
   is a little too large, its colour stands out a little too much, and the
   sun and moon icons are not quite centred in height relative to the rest
   of the bar. Make mockups of how the clock can blend in better: some
   with small changes, and some that try a more drastic redesign of how
   the clock looks and fits into the bar. The owner chooses from the
   mockups before anything is built.
2. **Weather.** The snow effect feels laggy / jerky. Do a new review of
   it and of the other weather effects. Why does it feel jerky? Is it only
   a frame-rate (fps) question, or something else (for example uneven
   frame pacing, motion per frame not tied to elapsed time, sub-pixel
   snapping, worker or compositor hand-off, dropped frames)?

## Starting points

- Clock and bar: stage 30 S1 (`docs/stages/30-fixed-menu.md`), ADR 0099,
  `src/menubar/`, the mockups in `notes/research/fixed-menu-mockups/`
  (ghost look). Visual target: Cockpit's clock (`/home/ole/MUME`, read
  only).
- Weather: stage 28 (`docs/stages/28-weather-trial.md`, incl. items
  109–113, the earlier performance review, and "Known small defects"),
  ADR 0093 and the weather ADRs, `src/weather/`, `#weather demo`.

## Steps

| Step | Contents |
|---|---|
| 31a | Clock mockups (small tweaks and drastic variants) → owner picks → build, test guide. |
| 31b | Weather review: measure snow (and the others) in Firefox and Chromium, find the cause of the jerkiness, fix, test guide. |

## Plan

- **31a.** Measure today's clock in the real bar, then mockups on the
  owner's canvas (new column "Steg 31a", two artboards: four small
  tweaks with today for comparison, four drastic variants). Source and
  variant table in `notes/research/clock-mockups/`. The owner picks (or
  combines); the build follows with an ADR (addendum to ADR 0099) and a
  test guide.
- **31b.** One agent in a worktree measures snow and the other effects
  in Firefox and Chromium (frame timestamps, per-flake motion), writes
  `notes/research/weather-smoothness.md`, fixes the cause with an ADR and
  before/after numbers. Merged after review; a visible trade-off (CPU
  against smoothness) goes to the owner.

## Tasks

- [x] 31a: today's clock measured (boxes centred; bold digits taller
  than the 13 px icons, the moon's ink low in its box).
- [x] 31a: mockups A–G on the canvas (2026-11-01).
- [x] 31a: owner idea H (time-left ring around a smaller sun or moon), with H2 (no time) and H3 (faint track).
- [x] 31a: owner round 2: icon and ring only, a larger ring with a real sun; variants I1–I5.
- [x] 31a: owner picks I2 (ghost sun in a time-left ring), no time beside it; exact time on hover (2026-11-01).
- [x] 31a: mockups of the sync states (minute, hour: T1–T4, not synced: U1–U2).
- [x] 31a: owner picks (2026-11-01): hour precision T1 (grey `~` after the
  icon, one cell wider); not synced U2 (no icon, the empty slot keeps its
  tooltip); hover shows the countdown as today; hour tooltip text as today.
  `day` precision counts as not synced (no countdown exists).
- [x] 31a: build (3cafb2b…d5e557e): `src/menubar/bar-clock.ts`, period
  start at hour and minute precision, ADR 0099 addendum, spec, README.
  Bar 26/24 → 21/19 cells (22/20 while approximate). Unit 3036 passed;
  e2e 666/667 (the one, `new-user` in Firefox, a load timeout, green
  alone).
- [x] 31a: test guide (below).
- [x] 31a: owner test round 1 (2026-11-01): the look approved; the clock
  showed day an hour late. Owner's Cockpit logs (prompt `*` sunlit / `o`
  dark around each sun message) show sunlight from "The sun rises in the
  east." (the dawn hour) to "The night has begun." (dusk + 1); ADR 0093
  had the day an hour late. One rule everywhere: day = dawn ≤ hour <
  dusk + 1 (clock, sky, almanac, scripts); the sunrise turn now runs the
  hour before the dawn hour, the sunset through the dusk hour (958e410,
  1423d88; ADR 0093 addendum). Unit 3045 passed; clock/weather/almanac
  e2e green. Safety-critical (trolls die in sunlight).
- [x] 31a: owner (2026-11-01): taken as right; the owner checks dawn and
  dusk while playing and reopens it if anything is off.
- [x] 31b: measurements and root cause (`notes/research/weather-smoothness.md`):
  snow ran at an even 30 fps (every second refresh in both browsers);
  motion was already time-based, sub-pixel, no drops. The rate itself
  read as jerky: a sharp flake stood still two refreshes, then jumped
  ~2 px. Firefox also stumbled now and then at 30.
- [x] 31b: fix (ef4d2f1…bf733b2, merged 10aa8eb): snow at the screen's
  rate (60), birds and insects 10 → 30 fps at sub-pixel places, the snow
  fade no longer runs on every page load; frame trace and
  `bench/weather-smooth.ts`. ADR 0113. Other effects unchanged (evenly
  paced and soft enough for their rate). Firefox snow frame 6.1 → 4.3 ms
  avg; browser CPU in snow +12 %; text latency unchanged. Unit 3040
  passed after the merge; weather, demo and menubar e2e 28/28.
- [x] 31b: test guide (below).
- [x] 31b: `#weather demo snow`, `birds` and `rain` (owner, 2026-11-01:
  test without the console); help text, unit tests.
- [x] 31b: owner test (2026-11-01): the weather looks good; birds at 60
  like the snow (e8ccfef, ADR 0113 addendum).

## Test guide

### 31a — the clock as a ghost sun

Open the dev server as usual (`npm run dev`, http://localhost:5173/),
Enter MUME and play. The clock left of Profile is now only an icon: a
line-drawn sun by day, a filled moon by night, inside a ring that is the
time left of the period. The ring is full when the period starts and
vanishes clockwise from 12 o'clock.

Try:

1. **At rest:** does the clock blend into the bar now (size, colour,
   height centred against the other icons)? Day and night if you can.
2. **Hover:** the tooltip shows the countdown as before (`Night in 4:33`),
   counting live.
3. **Hour precision (`~`):** in the browser console run
   `localStorage.removeItem('wc.clock')`, reload, and Enter MUME. The
   login syncs the clock to the hour: a grey `~` after the icon, the bar
   one cell wider, tooltip `Night in ~6 game hours`. The ring steps once
   a game hour (each real minute). The `~` goes at the next dawn or dusk
   (when the game sends the sun event), or keep playing until it does.
4. **Not synced:** run `localStorage.removeItem('wc.clock')` again and
   reload with `?replay` (offline). No icon; hover the empty place left of
   Profile: a faint dashed circle and `Game clock unknown: type time`.
5. **Light terminal:** Settings → Appearance, a light background: the
   ring and sun turn darker amber and blue.
6. **Layout:** the bar is 5 cells narrower, so the input line has more
   room; at some window widths the input row may now stay under the
   game text where before it ran under a right-docked pane.

Feedback wanted: the look at rest against the other icons, the `~`, the
space between the clock and the first separator (about 1.5 cells: the
link dot's cell sits there), and whether the hour-precision ring steps
are fine.

### 31b — smoother snow and birds

Open the dev server in Firefox (then Chromium if at hand). No console
needed: each demo turns the effects on, shows a caption with what to
look for, and gives the game's weather back at the end (`#weather stop`
ends one early).

1. **`#weather demo snow`** (under a minute): snow by day, then by night.
   Follow a single large flake for a few seconds: does it glide now, or
   still step? The overcast sky and the snow dusting on pane tops should
   look as before.
2. **`#weather demo birds`** (about 45 s): three flocks and an insect on a
   clear day. Birds now fly at 30 frames a second (was 10). Smooth enough,
   or should they get 60 like the snow? 60 costs noticeably more CPU while
   a flock is on screen (ADR 0113).
3. **`#weather demo rain`** (about 40 s): clouds, rain, a downpour.
   Nothing should look worse than before.
4. **`#weather demo`** once through, as a whole.
5. **Heat:** does the laptop run noticeably warmer in snow than before?

Feedback wanted: snow smoothness, birds 30 or 60, anything that got worse.

### 31a round 2 — the clock at a real dawn and dusk

Safety-critical: a troll dies in sunlight. Watch the prompt's first
character (`*` sunlit, `o` dark, `!` lit by a light) at a real dawn and a
real dusk, outdoors, with the clock synced (no `~`):

1. **Dawn:** at "The sun rises in the east." the prompt turns `*` and the
   clock turns to the sun in the same second. The sky's sunrise ran the
   game hour before and ends then.
2. **Dusk:** "The sun slowly disappears in the west." comes; the clock
   keeps the sun and the prompt stays `*` for that whole game hour; the
   sky's sunset runs over it. At "The night has begun." the prompt turns
   `o` and the clock to the moon in the same second.
3. `#weather demo sunrise` / `sunset`: the captions name these messages.

Feedback wanted: any second where the clock and the prompt disagree.
