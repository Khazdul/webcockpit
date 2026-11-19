# Stage 74 — Smooth transitions

Owner's report, 2026-11-18 (translated):

1. Going from the Community page into a posted log, the screen blinks as
   the log page loads. The same on the way back (Back). He wants the same
   soft transitions to and from log pages as between the start menu's
   pages: the frame changes size softly and the content comes once the
   frame has its new size.
2. Transitions between pages are sometimes choppy. On the phone, pressing
   About: the animation is choppy, and (he thinks) only the first time;
   in and out again is smoother.
3. In general: animations as smooth as possible, on the phone above all.
   Review how the start menu's page transitions work and improve what can
   be improved.

## Findings before the build

- The blink (1) is a full page load: the Community page and Published
  runs open a run with `location.assign(watchHref(...))`, and the watch
  page's Back is `location.assign(backHref(...))`. The watch page
  (`src/watch/page.tsx`) is mounted by `src/main.ts` instead of the start
  page. It already is a `lookFrame` drawn in the kit's large-box look, but
  with a box of its own (`WatchBox`) that does not report to the morph.
- The morph (`src/chrome/start-morph.tsx`, plan in
  `src/chrome/kit/look-motion.ts`) animates the proxy's `left`, `top`,
  `width` and `height` with Web Animations: these run on the main thread,
  so any main-thread work during the flight (a page's mount, a font or an
  image first used, a lazy chunk, the sky) shows as dropped frames. To be
  measured, not assumed (part B).

## Plan

Two parts, built in parallel in worktrees, merged by the main session.

### Part A — the watch page as a frame on the start surface

- A run opened from the Community page or from the Account page's
  Published runs is pushed as a frame on the start surface's stack (no
  page load); the morph runs as for any other page (the watch box reports
  as a large box). Back pops it: the close/swap morph back to where the
  run was opened from, the page below kept as it was (scroll, tab).
- The address: `history.pushState` to the run's `watchHref` on open, so a
  reload, a copied address and the browser's Back all work; the browser's
  Back (`popstate`) pops the frame, and the in-app Back goes through the
  same path. `document.title` follows and is put back.
- A bare link (`/r/<id>` loaded directly) stays the standalone page of
  stage 64/65, its Back a page load to `?community` with the arrival of
  stage 73 D. One `WatchPage` component serves both.
- Kept as they are: the sandboxed frame and its CSP, fullscreen and the
  turn handling on touch devices (stage 73 round 3), the fill mode for
  Chrome on iPad, view counting, Share, Report, stars, comments, the
  login round trip.

### Part B — measure and smooth the start menu's transitions

- A bench (`bench/`) that plays the start menu's transitions on a phone
  viewport under CPU throttling, first visit and second visit, and
  reports frame times during the flight, long tasks and what they are.
- Fix what the measurements show. No change to the choreography's look or
  timings (`MOTION`) unless a measurement argues for it.
- Before/after numbers in this file.

## Tasks

- [x] A: watch page embedded on the start surface (Community, Published runs)
- [x] A: address and browser Back; title
- [x] A: unit and e2e tests (desktop and phone), existing watch specs green
- [x] B: transition bench, baseline numbers
- [x] B: fixes, after numbers
- [x] Merge, full checks (typecheck, unit, full e2e alone at 5 workers):
      1997 passed, 4 failed. `share-link.spec.ts:464` (both browsers)
      expected the old address after Back, corrected; `watch-page.spec.ts:386`
      passes alone; `phone-own-keyboard-editors.spec.ts:218` fails 3 of 4
      alone, and the same on the commit before this stage (63881fa0)
- [x] ADRs (0163, 0164), test guide, session log

## Results

### Part A (ADR 0163)

A run opened from the Community page or Published runs is the watch page
pushed as a frame on the start surface (`src/watch/embed.tsx`,
`embed-session.ts`): no page load, the morph runs, Back pops it and the
page below is as it was. The address is the run's while it shows
(`pushState`); the in-app Back is `history.back()`, so the browser's Back
and a swipe go the same way. Beyond the plan:

- Esc is Back on the embedded page (as on the other sub-pages); once the
  replay has the keys, B and Esc are the player's.
- Forward after Back does nothing (the page steps back again).
- The browser's Back with the Report dialog open closes the dialog and
  the run in one step.
- `.wc-watch-screen` is a subgrid from 1000 px instead of
  `display: contents` (an element without a box cannot fade); the same
  rectangles, standalone too.
- A bare link stays the standalone page; its Back is still a page load.
- The sky is not paused while the replay is in fullscreen (calm rate).

### Part B (ADR 0164)

Measured in headless Chromium on production builds, 3 rounds, phone
(4x and 6x CPU throttle), tablet and desktop; the tables are in
`bench/results/transitions-74-{before,after,compare}.md`.

Causes found:

1. The proxy's flight animated `left/top/width/height`: it needed the
   main thread every frame. With the main thread blocked for 500 ms
   mid-flight the old proxy froze and then jumped 155 px; and the proxy
   was almost all of a transition's raster work.
2. Scripts' first visit compiled the Lua runtime (its syntax check)
   120-150 ms after the tap: a 180-320 ms task under throttle, about
   45 ms on an unthrottled desktop.
3. A first visit's click frame costs two to three times a second one
   (first-time text layout), before any motion. Not fixed.

Not causes: fonts, images or chunks fetched on opening About; the sky;
the wordmark's and the scenery's transitions.

Built:

- On a phone or a tablet the proxy is made of pieces that take only a
  transform or an opacity (pane, shadows, four edges, four corners), so
  the flight runs on the compositor; same geometry and timings. Blocked
  main thread: the proxy now moves every frame. Raster asked for on a
  phone opening About: 877 -> 169 ms; GPU process time roughly halved.
- On a desktop the proxy is as before: the pieces measured worse there
  (one or two 35-75 ms intervals at the start of the flight on large
  windows). `?morph=pieces` / `?morph=layout` force either, to compare.
- Scripts checks syntax once the page has settled: worst frame on the
  first visit 215 -> 26 ms (phone 4x), 47 -> 20 ms (desktop 1920, 1x).

Limits: nothing was measured on a real phone; the throttle slows the main
thread only, and on this machine's GPU the baseline's frame intervals were
already clean, so the bench shows work removed, not a seen stutter
removed. The click frame on the pieces path is 5-25 ms longer under
throttle (thirteen animations to set up). Firefox on a desktop is
unchanged by construction; WebKit was not run.

Proposals not built (the owner's call):

1. Swaps and History's tabs: fade the window as one layer, not each
   child (an occasional 35-50 ms interval at the fade start on desktops).
2. Enter MUME's sweep animates `mask-position` (a repaint per frame for
   4 s): rebuild it compositor-only.
3. Warm the pages' text layout at idle after the first paint, to shorten
   the first visit's click frame.

## Test guide

Staging or the dev server; phone first.

1. Phone, fresh load (close the tab first). Within a few seconds tap
   **About**. The frame should grow evenly, with no stops. Back, About
   again: first and second time should feel alike.
2. The same with **Scripts** as the first thing after a fresh load: the
   short stop as the frame started to grow should be gone (the red marks
   on scripts that do not compile come a moment after the page).
3. Compare old and new on the phone: add `?morph=layout` to the address
   (the old way), fresh load, tap About; then `?morph=pieces` (the new,
   the phone's default). Which is smoother, the first time above all?
   Does the flying frame look right (brackets, hood, glow), with no jump
   when the page appears?
4. **Community** -> a log: no blink; the frame morphs and the log's
   content fades in; the address is `/r/<id>?from=community`. Back (the
   button, B or Esc outside the replay, the browser's Back, a swipe):
   soft, and the Community is where it was left (page, cursor, scroll).
5. Account -> Published runs -> a title: the same.
6. In a log: Report, then the browser's Back (both go); reload the page
   (the standalone log page, as before).
7. Phone and tablet, in a log opened from the Community: fullscreen,
   turn the device both ways, leave fullscreen, Back. Chrome on the iPad
   above all. Anything that differs from the standalone log page?
8. Desktop (Chrome and Firefox): About, Scripts, History, Community -> a
   log. Should feel as before or better; if curious, `?morph=pieces`.

Feedback wanted: is the phone smoother (step 3 decides whether the pieces
stay); the choices listed under Results, part A; the three proposals.

## Owner feedback

- **2026-11-19, on staging (649ce63):** the changes feel good. Fullscreen
  and a turn in a log opened from the Community tried on the phone and
  the iPad (test guide 7): fine. New wish: pages with a normal box opened
  from the menu (Profile, the account) have never had the soft
  transition; they should (round 2 below). He asked what "one layer"
  in proposal 1 means; explained, no decision.

## Round 2 — the menu morphs to a normal box (ADR 0165)

Menu <-> normal/tall was the one boxed pair with no plan (`none`, stage
41: only the wordmark moved). It is now a `swap` on the normal <-> normal
clock: content out 0-140 ms, the proxy flies 140-520, content in 520-740;
no new `MOTION` entry, the holds unchanged. Pages: Profile, Log in (a
guest), Account (logged in; tall on a phone).

- The wordmark's move to its sub-page place now runs on the flight's
  clock and easing (380 ms, was 0.8 s of its own), so mark and frame
  travel as one; end states unchanged. The stage hands CSS the clock
  (`--lk-fly-at`, `--lk-fly-land`, `data-lk-from`).
- Phone, tall box: the wordmark and the almanac fade out before the
  proxy flies over their place and come back at the landing.
- A flight now follows its box (`MorphStage.retarget`): the Profiles
  list's box grows a frame after mount (167 -> 282 px), and the proxy
  landed on the stale rectangle.
- Reduced motion: the two boxes fade as a whole.
- Worst frame, menu -> Profile, first visit: 40 ms (phone 4x), 18 ms
  (desktop 1x); second visit and Back 18-20 ms.

Checks on the merged tree: typecheck clean; full e2e at 5 workers 2013
passed, 1 failed (`import.spec.ts:148` in Firefox, passes 3 of 3 alone);
unit 5631 passed on two runs after one run with a single failure whose
name was not captured.

Not verified: a real phone, WebKit; the tall Account on a phone only by
the frame-by-frame e2e, not in pictures; the chains through these pages
only by the existing specs.

### Test guide, round 2

1. Desktop: menu -> **Profile**. The items fade, the frame widens and
   moves up together with the wordmark, the list fades in. Back: the
   reverse, the items and the quote last.
2. The owner row: **Log in** as a guest (type the name at once: the
   letters land in the field while the frame still moves), **Account**
   logged in.
3. Profile and Esc at once, a few times: the frame turns round where it
   is and ends on the menu.
4. Phone: Profile and Log in (our keyboard comes up while the frame
   flies). Logged in: Account fills the screen; the wordmark and the
   almanac fade away before the frame grows over them and come back when
   the menu's panel has landed.
5. Chains: menu -> Profile -> Edit -> Back -> Back; menu -> Account ->
   Published logs -> Back -> Back; Log in -> Create account -> Back.

Feedback wanted: is 140 + 380 + 220 ms right next to About's slower
opening; does the wordmark moving with the frame read better than its
old move; on the phone, the wordmark's return after the Account page.

## Round 3 — one clock for every morph (ADR 0165 addendum)

Owner, 2026-11-19, after round 2 on phone and desktop: the quick menu
<-> Profile transition feels better than the slow menu <-> About one;
one tempo everywhere, the quick one. (The wordmark with the frame: fine.)

- `MOTION.clock` (`look-motion.ts`): out 140, flight 380, in 220 ms, for
  every pair; 740 ms where `open` was 1300 and `close` 1180. It replaces
  the `open`, `close`, `swap`, `resize` and `hold` tables. `start.css`
  declares the same numbers (`--lk-out`, `--lk-fly`, `--lk-in`); a unit
  test holds them equal.
- The wordmark around a large box lifts and fades over 0-220 ms and
  comes back over 440-740 ms; the almanac 0-140 and 520-740. Nothing in
  the scenery runs past the plan.
- The hold's slack is 400 ms (was 120): with a 140 ms hold a slow first
  frame unmounted the old frame before the proxy showed.
- Bench against round 1's "after": phone flights clean (no interval over
  34 ms). Scripts' first visit: its syntax check (after the page has
  settled) now falls about 900 ms after the tap, one task of 107 ms
  (phone 4x) to 161 ms (6x), 36 ms on an unthrottled desktop; nothing is
  moving then, but a tap in that moment waits. Not remedied. Desktop,
  About: now and then one 35-50 ms interval at the fade start (proposal 1).
- At 2560x1440 the frame's edges peak at about 120 px per frame (58
  before). If that reads as abrupt, a flight of 460-480 ms for all pairs
  is a one-number change.

Checks on the merged tree: typecheck clean, unit 5630 passed, full e2e
at 5 workers 2019 passed, none failed.

Not verified: a real phone, WebKit; desktop `?morph=pieces` on the large
pairs; whether a film scene (`video/`) was cut to the old 1.3 s opening.

### Test guide, round 3

1. Phone and desktop: About, Scripts, History, Community, in and out.
   The same tempo as Profile; nothing still moving once the page reads.
2. The largest monitor at hand: About and Scripts in and out. Too abrupt?
3. Phone, fresh load, Scripts first: tap or scroll the moment the page
   appears. A short stop about a second after the tap?
4. About and Back at once, several times; Community -> a log -> Back ->
   Back. No jumps, nothing left half-faded.

## Released

Owner, 2026-11-19, after round 3 on computer and phone (a brief test):
go, publish. Released as 0.21.0.
