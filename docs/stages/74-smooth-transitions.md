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

- [ ] A: watch page embedded on the start surface (Community, Published runs)
- [ ] A: address and browser Back; title
- [ ] A: unit and e2e tests (desktop and phone), existing watch specs green
- [ ] B: transition bench, baseline numbers
- [ ] B: fixes, after numbers
- [ ] Merge, full checks (typecheck, unit, full e2e alone at 5 workers)
- [ ] ADRs, test guide, session log

## Results

(filled in by the build)

## Test guide

(written at the end of the build)

## Owner feedback

