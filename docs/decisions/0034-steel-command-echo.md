# 0034 — Steel command echo

- Status: Accepted
- Date: 2026-09-29

## Context

Owner request: the local echo of the player's own commands should stand
apart slightly from the game text, in a colour the owner calls "Stål"
(steel): a cool blue-grey derived from the terminal fg. The formula was
previewed and chosen by the owner. It must hold for every colour theme
(all fg × bg presets, including `paper` with `ink`).

## Decision

- A root token `--term-echo` (`rootTokens`, src/theme/apply.ts,
  `echoColor`) set with the other terminal tokens:
  - dark terminal bg: `color-mix(in oklab, var(--term-fg) 55%, #7fb2e6)`
  - light terminal bg (`isLight`): `color-mix(in oklab, var(--term-fg) 55%, #1f5f9e)`
- `.wc-echo` (src/ui/ui.css) uses `var(--term-echo, var(--term-fg))`.
- Since the token refers to `--term-fg` and travels with the root tokens,
  it follows `applyTheme` wherever that runs: `<html>` in live play, the
  log player / run log and Spotlights element (with the viewer's colour
  theme), and the HTML replay page (which applies the recorded theme).
  All of them render echoes through `renderEcho` (`.wc-echo`).
- Not a user setting. The text export (`.txt`) has no colour.

## Consequences

- HTML replays exported before this change keep the plain fg echo (the
  bundle is embedded in the file).
- Needs CSS `color-mix()` (Chromium 111, Firefox 113, Safari 16.2); older
  browsers fall back to the property's inherited colour.
