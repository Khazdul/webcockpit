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
