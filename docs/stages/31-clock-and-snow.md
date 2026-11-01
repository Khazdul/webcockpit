# Stage 31 — Menu bar clock and weather smoothness

Status: **In progress** (31a mockups with the owner; 31b review running
in a worktree). Owner brief 2026-11-01 (below). After this stage: a release
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
- [ ] 31a: owner picks a variant.
- [ ] 31a: build, ADR, tests, test guide.
- [ ] 31b: measurements and root cause (research note).
- [ ] 31b: fix, ADR, before/after numbers, merge.
- [ ] 31b: test guide.
