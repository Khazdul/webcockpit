# Stage 31 — Menu bar clock and weather smoothness

Status: **Next**. Owner brief 2026-11-01 (below). The plan, tasks and test
guide are written when the stage starts. After this stage: a release
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
