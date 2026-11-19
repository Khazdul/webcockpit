# 0165 — The menu's panel morphs to a normal box and back

Date: 2026-11-19. Status: accepted (built on `stage-74c`, stage 74 part
C). Related: ADR 0127 (layout B and its morph: this replaces its rule
"menu ↔ normal: none"), ADR 0164 (the proxy's two ways of flying), ADR
0125 (the start surface, the wordmark's places).

## Context

The owner (stage 74, round 2): some pages opened from the start menu
never had the soft transition, his Account and Profile for example. He
wants them as the rest: the frame changes size softly and the content
comes once the frame has its new size.

These are the pages the menu opens in a normal or a tall box: Profile
(the Profiles list), Log in for a guest and the Account page for
somebody logged in (tall on a phone-size window, or with its sync and
published sections). ADR 0127 left the pair menu ↔ normal
as stage 41 built it: the page changed at once and the wordmark moved to
its smaller place by a CSS transition of its own (0.8 s). Every other
pair of boxes had a plan. Nothing was found that the rule protected: it
was the pair nobody had built.

## Decision

**Menu ↔ normal (or tall) is a `swap`** (`morphPlan`,
src/chrome/kit/look-motion.ts), on the clock normal ↔ normal already
has, with no new entry in `MOTION`:

| | ms from the change |
| --- | --- |
| the old content fades out (`swap.out`) | 0 – 140 |
| the proxy flies from the old rectangle to the new (`swap.resize`, the flight's easing) | 140 – 520 |
| the new content fades in (`swap.in`) | 520 – 740 |

The menu's quote fades out with its items and comes back with them. The
hood keeps to the menu's plain plate near the panel, as `open` and
`close` do (narrow for the first quarter of the way out, narrow again by
three quarters of the way back). A reversal mid-flight starts from where
the proxy is, at once (380 ms). With reduced motion nothing flies and
the two boxes fade as a whole, as `open` and `close` do (260 / 240 ms):
they are two boxes in two places, so a swap's content-only fade would
show the frame jump.

Why the swap's clock and not `open`'s (200 + 780 + 320 ms): the size
change is small, a third to a half of the window at most, and the page
is a neighbour of the account pages' own normal → normal changes, which
it now matches exactly; `open`'s 780 ms for 250 px a side read as slow
motion. The hold needed nothing new (`morphHold`: 350 ms from the menu,
200 ms popping a normal box, both longer than the 140 ms the plan
needs).

**The wordmark moves on the flight's clock.** Between the menu's place
and a sub-page's smaller one its transition is now 380 ms with the
flight's easing, starting when the flight does (start.css; the stage
sets `--lk-fly-at` on the scenery's element: 140 ms, 0 for a reversal).
The mark and the frame's top edge are then moved by one progress, so
their distance changes evenly from the menu's gap to the sub-page's and
they cannot cross; on a tablet the menu's drop (`translate`) goes the
same way. Stage 41's own 0.8 s move is gone. The end states are as
before. Its moves around a large box (`is-large`, `is-lift-sub`,
`is-from-large`) are untouched.

**On a phone, around a tall box** (the Account page; no wordmark and no
almanac while it shows, since it reaches over both): they used to go and
come at once, which was right for a page that changed at once. Now they
fade out with the old content (140 ms, before the proxy flies over their
place) and, after a tall box, come back when the next box has landed
(220 ms; `data-lk-from` on the surface is the kind of box the change
came from, `--lk-fly-land` the landing). This also covers tall → normal
between the account pages, where the wordmark used to show over the
flying frame.

**A flight follows its box.** The Profile list's content comes a moment
after its mount (the box is 167 px high at the mount and 282 px a frame
later, on a desktop), and a plan is made at the mount. No plan before
this one flew to a box that sizes itself by late content, so the stage
had nothing for it: the proxy landed on the stale rectangle and the box
jumped at the landing. The stage now retargets the running flight when
the top box's rectangle changes (its ResizeObserver, and the surface's
resize): the keyframes get the new rectangle and the clock goes on. In
the usual case that is before the proxy has moved and nothing shows;
later, the proxy steps by its progress's share of the change instead of
the box jumping by all of it. It also serves a box that our keyboard
moves on a phone (measured: Log in's box does not move when the keyboard
opens for its field, at 390 × 844).

## As built

- `look-motion.ts`: `morphPlan` (the pairs, the scenery fades, the hood,
  reduced motion); no change to `MOTION` or `morphHold`.
- `start-morph.tsx`: `retarget`; `data-lk-from`, `--lk-fly-at` and
  `--lk-fly-land` for the scenery's CSS.
- `start.css`: the wordmark's transition; the phone's rules around a
  tall box; reduced motion for both.
- Both proxies (ADR 0164) run the plan unchanged. In pieces the pane is
  drawn at the larger of the two sizes on each axis (the panel is the
  narrower, and may be the higher).
- Tests: `tests/unit/look-box.test.tsx` (the plan, the hold),
  `tests/e2e/menu-sub-morph.spec.ts` and `phone-menu-sub-morph.spec.ts`
  (a frame-by-frame record: the plan, the landing, no frame without a
  box or the proxy, the wordmark never over the frame, the field's focus
  from the mount, a reversal, reduced motion, a tall box on a phone).
- `bench/transition-shots.ts` shoots these transitions too (`--steps`,
  `--base`); `bench/transition-bench.ts` plays them (`profile`).

## Limits

- The proxy's glass is the large box's fill; the menu's panel and a
  normal box have the lighter blurred glass, so the pane's tone changes a
  little at each hand-over. The same as in `open`, `close` and a normal →
  normal swap (ADR 0164, "Accepted differences").
- A retarget late in a flight shows as a step of the proxy. Not seen
  with the pages there are (their late content comes within a frame or
  two of the mount).
- Looked at in headless Chromium at fixed times of the plan (phone,
  tablet, two desktop sizes, both proxies) and in the e2e record on
  Chromium and Firefox; not on a real phone, and not in WebKit.

## Addendum 2026-11-19 — one clock for every morph

The owner tried the above on his phone and on a desktop and found the
quick menu ↔ Profile change better than the slow menu ↔ About one. His
decision: one tempo everywhere, the quick one.

| ms from the change | before: open | before: close | now: every pair |
| --- | --- | --- | --- |
| the old content fades out | 0 – 200 (the quote 350) | 0 – 240 | 0 – 140 |
| the proxy flies | 200 – 980 | 240 – 920 | 140 – 520 |
| the new content fades in | 980 – 1300 | 920 – 1180 (the quote 1270) | 520 – 740 |
| the wordmark | lifts and fades 0 – 620 | settles 320 – 1020 | away 0 – 220, back 440 – 740 |
| the almanac | fades 0 – 350 | back 920 – 1270 | away 0 – 140, back 520 – 740 |

- **Defined once.** `MOTION.clock` (`out` 140, `fly` 380, `in` 220, the
  flight's easing, unchanged) replaces the `open`, `close`, `swap`,
  `resize` and `hold` tables; `morphPlan` builds every plan from it, and
  the types (`open`, `close`, `swap`) now differ only in the hood (it
  keeps to the smaller box's plate for the first quarter of the way out
  and has it again by three quarters of the way back: the same fractions,
  `MOTION.hood`) and in reduced motion (unchanged: 260 / 240 ms fades,
  shorter than the plan already). `morphHold` is `clock.out` for every
  box.
- **The scenery's CSS reads the same clock**: `--lk-out`, `--lk-fly`,
  `--lk-in`, `--lk-ease` on `.wc-start-scenery` (start.css; a unit test
  holds them equal to `MOTION.clock`), with the stage's `--lk-fly-at`
  and `--lk-fly-land` per change. Around a large box the wordmark is
  lifted and faded by the time the frame has started to move (the
  content's fade and the flight's first 80 ms, in which the eased proxy
  covers about a twentieth of its way), so the frame's top edge never
  passes a visible mark; on the way back it starts 80 ms before the
  landing, when the frame is within a few px of the panel, and is done
  with the menu's items. Nothing of the scenery runs past the plan's
  end.
- **The hold's slack is 400 ms** (it was 120). The hold is a timer from
  the frame change, the plan runs on the animation clock, which starts
  with the first frame after it: the new page's mount, 80–130 ms on a
  throttled phone's first visit. With 140 + 120 ms the old frame was
  unmounted before the proxy showed (seen as an empty frame in a loaded
  Firefox). The longer holds had hidden this. The old frame hides itself
  on the animation clock, so the slack shows nothing longer.
- `is-from-large` stays on the surface well past the plan (it only picks
  the transitions; taking it away early would end them).

Measured (`bench/transition-bench.ts`, 3 rounds, against
`bench/results/transitions-74-after.md`; worst frame interval after the
click frame, ms, first / second visit):

| | before | now |
| --- | --- | --- |
| phone 4×, menu → About | 23 / 22 | 21 / 19 |
| phone 4×, menu → Scripts | 26 / 23 | 109 / 20 |
| phone 4×, menu → History | 22 / 20 | 20 / 19 |
| phone 6×, menu → About | 34 / 26 | 22 / 21 |
| phone 6×, menu → Scripts | 38 / 25 | 163 / 22 |
| phone 6×, menu → History | 28 / 22 | 20 / 20 |
| desktop 1×, menu → About | 20 / 19 | 21 / 19 |
| desktop 1×, About → menu | 19 / 18 | 35 / 51 |
| desktop 4×, menu → Scripts | 19 / 21 | 108 / 19 |

- No flight has an interval over 34 ms on the phone geometry, first
  visit or second, and the counts over 20 ms are lower than before
  (there are fewer frames). The click frame measured shorter too (92
  against 144 ms for About at 4×); nothing in this change explains that,
  so it is taken as a difference between the two sittings.
- **Scripts' first visit**: its syntax check (the Lua runtime's first
  compile, moved to "once the page has settled" in ADR 0164) now runs
  about 900 ms after the tap, where it ran after the bench's 1.4 s
  window before: one task of 107 ms (4×) to 161 ms (6×), 36 ms on an
  unthrottled desktop. It falls some 100 ms after the content has faded
  in, with nothing moving; a tap or a scroll in that moment would wait
  for it. The same task as before, only sooner. A remedy if it is felt:
  run the check at idle (`requestIdleCallback`) or on the first use of
  what needs it. Not built.
- **About on a desktop**: now and then one interval of 35–50 ms 60–80 ms
  after the click, as the long page's content starts to fade (every
  faded child becomes a layer: ADR 0164, "Left", proposal 1). It was
  there before for the large → large swaps; the shorter fade seems to
  show it more often for About's close. Not on the phone geometry.

Not changed: large → large and normal → normal (they had this clock),
the dialogs, Enter MUME's transition (its own times, it borrows none of
these), the film scripts under `video/` (they wait on `data-lk-morph`,
not on a length; scenes cut to the old 1.3 s opening would play
differently if recorded again).
