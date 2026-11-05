# Stage 40 — Lantern pane look ("Lykta")

Status: **In progress** (started 2026-11-05).

## Goal

Every pane gets the "Lykta" (lantern) look the owner chose on 2026-11-05:
a thin band of dark tinted iron with riveted corner brackets, a small
centred iron hood holding the title (lit from behind), and a window lit
from within by the pane's colour. Group and Timers get frosted-glass cards
and glossy tube bars, so frame and content read as one object. The light
background (Paper) gets its own counterpart in the same stage. ADR 0123.

Research, mockups and owner decisions:
`notes/research/pane-lantern-mockups/README.md` (read it first). The
reference for the look is `round3-src/variants/17.css` with the shots
`s17*.png`; the mockup is throwaway CSS over a simplified DOM and is never
copied as is.

## Owner decisions (2026-11-05)

1. All panes (the frame for every pane; content styling where it applies).
2. Title centred.
3. Outer glow kept, but within the gap between panes.
4. Light background (Paper) in the same stage.
5. Build thoroughly and carefully.

No settings change: the look replaces today's glass rim and nameplate for
every framed pane. Border on/off, Colour and Background glass/clear
(ADR 0095) keep working and must look finished in every combination.

## Parts

- **40a Frame** (dark): geometry (centred hood, band thickness), iron band
  with corner brackets and rivets, the hood and its title (bundled
  Cinzel), the lamp-lit window, the outer glow in the gap, borderless and
  clear panes, floating panes, weather on/off (Chromium and Firefox
  flat), the hover buttons, the weather worker's rim and plate model.
- **40b Content**: Group and Timers in frosted cards and tube bars; the
  other panes (Character, Comm, UI, Statistics, map, script panes) meet
  the lit window and stay readable.
- **40c Paper**: the light-side counterpart of the lamp, iron and cards.
- **40d** Performance, e2e, docs (ADR 0123, Inv pointers, manual), test
  guide.

## Tasks

- [x] 40a: ADR 0123 (frame model, tokens, geometry, cost)
- [x] 40a: `frame.ts`: centred hood (`framePlate`), band thickness; unit
      tests at DPR 1, 1.25, 1.5, 2; the hover buttons keep clear of the
      hood (`titleEnd`)
- [x] 40a: bundled Cinzel (bold, Latin subset, OFL; licence in
      `public/fonts/`), also in the HTML replay export if panes show there
- [x] 40a: iron band, brackets, rivets, hood, lit title; lamp tokens per
      tint (Plain/Grey: candle light); lamp-lit window and vignette; outer
      glow in the gap
- [x] 40a: borderless (window light and cards stay), clear (edge glow, no
      fill), floating (opaque ring), weather on/off and Firefox flat, map
      pane, script panes; the weather worker's glints and snow on the new
      band and hood
- [x] 40b: Group: fight zone, member rows as frosted cards; tube bars;
      the NPC hatched bars, away dimming, statuses unchanged in function
- [x] 40b: Timers: chips as frosted glass with the group colour edge,
      header lines, ending-soon red time, untimed dashed, charm; bars and
      circles, flow and grid
- [x] 40b: Character, Comm, UI, Statistics, map, script panes checked in
      the lit window; adjustments where text loses contrast
- [x] 40a+: hood moves left on narrow panes, buttons over the hood when
      they still do not fit (owner feedback 2026-11-05)
- [x] 40c: Paper design (lamp, iron, cards on a light page), built; every
      tint, border on/off, clear (P2 pewter and brass, pale tints)
- [x] 40d: performance: many panes, weather on, floats; frame times vs
      main in Chromium and Firefox ("Performance (40d)"; one fix)
- [x] 40d: e2e updated (frame geometry, title centred, states), unit
      tests, docs, Inv §2.1 / §10.4 pointers to ADR 0123, manual
- [x] 40d: test guide
- [ ] 40d: progress.md (the main session)

## Notes (40a)

Built 2026-11-05; the numbers are in ADR 0123 "Built (stage 40a)".

- Screenshots (`img/`): `40a-plain-chromium-1x.png`,
  `40a-plain-chromium-2x.png`, `40a-red-chromium-2x.png`,
  `40a-blue-grey-green-chromium-2x.png` (Timers blue, Group grey, Comm
  green), `40a-border-off-chromium-2x.png` (Timers blue, Group red),
  `40a-clear-weather-chromium-2x.png` (snow at night; Timers red, Group
  blue), `40a-float-chromium-2x.png`, `40a-map-chromium-2x.png`,
  `40a-weather-firefox-2x.png` (Firefox flat glass),
  `40a-hover-buttons-chromium-2x.png` (≈ 24-cell panes: Border, Background
  and the cross), `40a-hover-map-chromium-2x.png` (the 30-cell Map: all four).
- Cost: no backdrop filter on the band any more; rough numbers in the ADR.
- Open: the hover buttons drop sooner with the title centred (ADR);
  Paper (light) panes are only kept legible (dark iron on the page, a
  softer vignette) until 40c; the frosted card tokens are defined but not
  used yet (40b).

## Notes (40a+)

Built 2026-11-05 after the owner's feedback on the hover buttons; the rule
and numbers are in ADR 0123 "Hood position and hover buttons".

- The hood is centred when the hover set fits right of it, else moved
  left just enough, down to the fourth cell; the new-player layout's
  25-cell Timers and Group now keep all four buttons. Where the set still
  reaches the hood, it shows on an iron shelf grown out of the hood, the
  label fading before it (or whole); buttons drop only where they would
  cover the hood's left end (16 cells and less with the Gear).
- Screenshots (`img/`): `40a2-wide-chromium-2x.png` (legacy 33-cell
  lane: centred, all four), `40a2-shifted-chromium-2x.png` (new-player
  layout at 1280 px: hood moved left), `40a2-cover-chromium-2x.png`
  (1000 px, Group in 20 cells: the shelf over the hood, label fading),
  `40a2-cover-all-chromium-1x.png` (Timers in 17 cells at ratio 1: the
  label fades out whole).

## Notes (40b)

Built 2026-11-05; the numbers are in ADR 0123 "Built (stage 40b)". CSS
only (layout.css, group.css, timers.css); no change to what the panes
show or how they lay out.

- Lamp: Plain and Grey now give warm candle light; a tint colours the
  light but over 40 % of the candle, so a Green or Blue text pane stays
  near neutral (oklab mix, unit-tested inside sRGB).
- Group: frosted member and fight cards, glossy tube bars in a recessed
  track, the vs medallion; Timers: frosted chips with the group colour
  edge, bold mono headers over a lamp-coloured rule, a soft glow on the
  ending-soon time. Cards keep a backing on clear panes and look finished
  with the border off.
- Cost: the mockup's frost gradient and the chip fill's ramp were made
  flat after a Firefox measurement (they cost ≈ 0.3 ms per Group update
  and ≈ 2 ms per Timers tick); now within noise of 40a in both browsers.
- Screenshots (`img/`): `40b-plain-chromium-2x.png`,
  `40b-plain-chromium-1x.png`, `40b-blue-red-green-chromium-2x.png`
  (Timers blue, Group red, Comm green), `40b-border-off-chromium-2x.png`
  (blue), `40b-clear-weather-chromium-2x.png` (red, clear, day sky),
  `40b-circles-grid-chromium-2x.png` (green, circles in grid),
  `40b-oneline-chromium-2x.png` (one-line Group rows and fight strip),
  `40b-orange-firefox-2x.png`, `40b-other-panes-chromium-1x.png`
  (Character, Map, Statistics, the key manager, Comm, UI).
- Other panes: no change needed. Open: a clear Character pane over a
  bright day sky has low-contrast dim labels (the clear background's
  trait, ADR 0095); the mockup's faint-to-strong chip fill ramp is
  dropped for cost (a flat tint instead).

## Notes (40c)

Built 2026-11-05 after the owner chose P2 "Tenn och mässing" and pale
tints; the rules and numbers are in ADR 0123 "Paper".

- A tint on a light page is now a pale wash of its hue, as light as the
  page (`lightTintFill`); the whole theme follows (borders, shade ramps,
  Options swatches by frame colour, map Transparent, script panes, the
  replay). Comm holds channel colours to 4.5:1 on light panes.
- CSS: a "Paper" section in layout.css (band, hood, window, glow → drop
  shadow, the hover shelf and label fade, the hover set), light blocks in
  group.css and timers.css (paper cards, coin, tag, chip time). The
  interim light rules of 40a/40b and the proposals' comparison switches
  are gone.
- Dark look: pixel-equal before and after. Cost on Paper within noise of
  dark (Firefox, ratio 2).
- Screenshots (`img/`, Chromium ratio 2 unless named):
  `40c-plain-chromium-2x.png`, `40c-tints-hover-chromium-2x.png`
  (Character orange, UI purple, Timers blue, Group red with the hover
  set, Comm green), `40c-off-clear-chromium-2x.png` (Group orange and
  Comm borderless, Timers blue and Character green clear, UI grey both),
  `40c-shelf-chromium-2x.png` (1000 px window, 20-cell lanes: the brass
  shelf over Group's hood), `40c-clear-weather-day-chromium-2x.png`
  (every pane clear, day sky), `40c-weather-night-chromium-2x.png`
  (Plain, night), `40c-other-panes-chromium-2x.png` (all Blue: Character,
  Map, Statistics float, the key manager, Comm, UI),
  `40c-tints-weather-firefox-2x.png`. The proposal shots
  `40c-p1|p2|p3-*.png` stay as the record of the choice.
- Open: Character's dim labels on a light pane read 1.8–3.8:1 (the light
  shade ramp, from before this stage; not changed). Inv §10.4 still lists
  only the dark fills: the pointer to ADR 0123 "Paper" goes in with 40d's
  Inv pointers.

## Performance (40d)

Main (cd35f54) against this branch, both measured in the same session,
interleaved, headless Playwright (Chromium 153 on the real GPU with
Vulkan unless named; Firefox renders in software there). Ranges are over
the runs (run-to-run noise); "fix" is after 48e8303 (below).

**Idle with weather** (the default layout at 1728 × 1000 with six framed
panes, Character, Timers red, Group blue, Comm, Map and UI floating;
8 s of animation frames after 4 s; three runs per cell):

| Case | Main | Branch |
|---|---|---|
| Chromium, ratio 1 and 2, weather off / rain / snow | 60 fps; render per frame median 0.24–0.39 ms, p95 0.59–0.97; task time 2.5–3.9 % | 60 fps; 0.24–0.44 ms, p95 0.55–1.05; 2.7–4.7 % |
| Chromium software (SwiftShader), ratio 1, rain | 23 fps, frame interval p95 50 ms | 56 fps, p95 33 ms (the rim's four blur strips are gone) |
| Firefox, ratio 1 and 2, weather off / rain / snow | 60 fps; render median 0.08–0.26 ms, p95 1.0–2.8 | 60 fps; 0.08–0.22 ms, p95 2.6–8.0 |
| Weather worker's own frame (Chromium / Firefox) | 0.6–1.0 / 6.2–9.9 ms | 0.8–1.9 / 6.3–10.3 ms |

The Firefox p95 frames are the ones that paint (the caret blink, the
Timers tick): see the cause below.

**Group and Timers** (the `costpanes` method of 40b: the frame after an
update, median of 200; the Timers tick: the worst frame of each second,
median of 12; two runs per cell):

| Measure (ms) | Firefox ratio 2 | Firefox ratio 1 | Chromium ratio 2 | Chromium ratio 1 |
|---|---|---|---|---|
| Group.Update frame | 1.78–1.86 → 2.70–2.80 | 1.72–1.78 → 2.54–2.66 | 3.03–3.35 → 3.22–3.27 | 2.57–2.90 → 2.65–3.05 |
| Fight update frame | 3.38–4.14 → 3.54–3.98 | 2.86–5.12 → 4.82–4.88 | 3.54–3.84 → 3.67–3.97 | 2.95–3.57 → 3.07–3.75 |
| Timers tick frame | 5.78–6.66 → 7.28–8.46 | 4.82–5.36 → 8.12–8.52 | 3.22–3.65 → 3.22–4.28 | 2.76–3.64 → 2.91–2.96 |

**Text** (`bench/browser-bench.ts --only play,budgets`, the owner's
geometry, 1728 × 1000 at ratio 2, map on; two runs each; medians / p95,
ms; main → branch before the fix → with it):

| Measure | Firefox | Chromium |
|---|---|---|
| Play with GMCP, text frames without a pane render | 1.7–1.9 / 4.5–5.3 → 2.6–3.0 / 7.3–7.4 → 2.5–3.0 / 5.9–8.1 | 3.3–3.6 / 5.2–5.8 → 4.7–4.9 / 6.6–7.1 → 3.1 / 4.3–4.5 |
| … with a pane render | 2.4–2.5 / 4.9–7.7 → 3.3–3.5 / 6.3–7.6 → 3.4–3.7 / 6.7–9.0 | 4.8–4.9 / 6.1–6.7 → 5.8–5.9 / 7.6–8.1 → 4.4–4.6 / 6.1 |
| Output flush script, without / with panes | 0.46–0.48 / 0.58 → 0.42–0.46 / 0.54–0.58 → 0.44–0.46 / 0.56–0.60 | 1.06–1.26 / 1.50–1.66 → 2.99–3.03 / 3.19–3.41 → 0.63–0.75 / 0.84–0.97 |
| Burst (79 447 lines at speed 0): lines/s; longest frame; frames > 50 ms | 48.6–51.8 k; 76–104 ms; 5 → 47.9–49.0 k; 167–188; 5–6 → 44.8–47.2 k; 172–180; 6–9 | 80.8–83.4 k; 18–21 ms; 0 → 81.0–82.1 k; 19; 0 → 80.7–83.0 k; 18; 0 |
| Frame → paint, median / p95 | 9.7–9.8 / 18–19 → 11.2–11.4 / 20–21 → 10.8–11.4 / 20–21 | 12.6–12.7 / 21 → 12.2–13.7 / 21–22 → 9.7–10.6 / 19–20 |

No late frames beyond one 0.5 s GPU stall in most Chromium runs (main as
well).

- **Fixed (48e8303):** the hood-cover rules of 40a+ hid the shelf during
  a drag with `.wc-cockpit:not(:has(> .wc-drag-shield:not([hidden])))`;
  Chromium paid ≈ 1.7 ms of style work in every output flush for it
  (found by bisecting the play bench over the branch: 500fd5c). The
  cockpit now carries `data-shield` while the shield shows, and the
  older `:has()` drag rules use it too: Chromium's text frames are now
  at or below main's.
- **Firefox (open, reported):** a frame that paints costs ≈ 1–3 ms more
  (the Group update + 0.9, the Timers tick + 2–3, text frames + 1,
  burst throughput 3–8 % lower, its longest frame 170–190 ms instead of
  80–100). Cause, by removing layers one at a time: the iron band's
  fourteen background layers (the diagonal bracket gradients and the
  full-height sheen most; a flat rim takes back ≈ 0.5 ms per Group
  update and ≈ 1.6 ms per painted idle frame) and, less, the window's
  two lamp gradients and vignette (≈ 0.7 ms). Headless Firefox draws in
  software, where every changed tile is redrawn with them; with the GPU
  this should be much smaller. No change without changing the look
  (e.g. axis-aligned bracket shading, no sheen, or the rim as one
  image); everything stays well inside the 16.7 ms frame.
- Chromium: no change on idle frames or pane updates; with software
  compositing far faster than main.

## Test guide

Start: `npm run dev`, open http://localhost:5173/ and enter the game, or
the offline demo http://localhost:5173/?fixture=gmcp-demo.log&speed=0
(Group, Timers, Comm and the map fill from a recorded session). Try
Chromium and Firefox if you can; most checks take a minute each.

1. **The frame.** Every pane: a thin band of dark iron, riveted corner
   brackets, the title in Cinzel on a small hood centred at the top, the
   window lit from within (warm candle light on Plain and Grey, the
   tint's own light otherwise), a soft glow in the gap between panes.
   Step each pane's Colour through the tints (hover → the Colour
   button): does every tint look finished, and is the light restrained
   enough on Green and Blue text panes?
2. **Border off and clear.** Hover → Border: no iron, hood or glow, the
   window light stays. Background → clear: the lamp as an edge glow, the
   game text or sky behind; Group and Timers cards keep a backing. Try
   both together.
3. **Floating.** Drag a pane (e.g. UI) off its dock: an opaque ring
   round the band, nothing of the game text showing through it.
4. **Weather on** (Settings → Weather effects, or `#weather demo`): rain
   and snow land on the band and hood, glints and lightning light the
   iron; in Firefox the window glass is flat (no blur).
5. **Hood and hover buttons.** Make a pane narrower (drag the lane edge
   or narrow the window): the hood moves left instead of being hidden by
   the buttons, at most to the fourth cell. Narrower still (about 20
   cells), hover: the buttons lie on an iron shelf grown out of the hood,
   the label fades before it; at rest the title shows whole.
6. **Group and Timers.** Members and the fight card as frosted cards,
   glossy tube bars in a recessed track, the vs medallion; Timers chips
   as frosted glass with the group colour edge, bold headers over a lamp
   rule, the red glow on a time about to end. Bars, circles, flow and
   grid (Timers' Gear) should all look right.
7. **The other panes.** Character, Comm, UI, Statistics, Map and a
   script pane (`#script enable keymanager`): is all text easy to read in
   the lit window, on several tints?
8. **Paper.** Settings → Appearance → Background: paper. Frames become
   pewter (cool tints, Grey) or brass (Plain, warm tints) with engraved
   dark titles; a tint is a pale wash of its hue instead of a dark fill;
   cards are raised paper. Repeat 1, 2 and 5 there. Back to black after.
9. **HTML replay.** After a real session: start page → History → the
   run → Export editor → H (HTML replay); open the file: the pane titles
   are in Cinzel there too.

Feedback wanted: does the lantern read as one object with its content,
on every tint and on Paper; is the glow, the lamp's warmth and the band's
weight right; is the hood's move and the shelf tidy on narrow panes; any
text that is hard to read; anything that feels slower than before.

Known open items: Character's dim labels on a light pane are faint
(1.8–3.8:1; the light shade ramp, from before this stage); a clear
Character pane over a bright day sky has low-contrast dim labels (the
clear background's trait, ADR 0095).

## Owner feedback

- **2026-11-05, title vs hover buttons** (after 40a: centred hood left too
  little room, narrow panes dropped Colour and the Gear): "Titeln får
  flyttas vänsterut snarlikt hur den sitter idag. Skulle knapparna ibland
  ändå hamna över titeln så får de hamna ovanpå titeln. Försök lös det
  snyggt." So: centred when there is room; on a narrow pane the hood moves
  left, at most to about where today's plate sat (from the fourth cell);
  if the buttons still do not fit, they show over the hood's right part on
  hover instead of being dropped, and must look tidy there.
- **2026-11-05, Paper** (three proposals built in the real app, shots
  `docs/stages/img/40c-p1|p2|p3-*.png`): the owner chose **P2 "Tenn och
  mässing"** (pewter and brass: light metal in the tint's hue, brass for
  Plain and warm tints, pewter for cool ones, dark engraved lines and
  rivets, engraved title; parchment window shading toward the edges;
  cards as raised paper with a soft shadow). Also chosen: **on a light
  page a tint becomes a pale wash of its hue**, as light as the page,
  instead of today's dark fill (keeps the text contrast; Comm lifts
  yellow and cyan to 4.5:1).

