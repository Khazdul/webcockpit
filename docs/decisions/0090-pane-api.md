# 0090 — Pane API for rebuilding the built-in panes

- Status: Accepted
- Date: 2026-10-09
- Extends: ADR 0053 (script panes), ADR 0056 (setText), ADR 0065 (pane
  shades), ADR 0051 (GMCP for scripts)

## Context

The owner wants scripts to be able to rebuild the Timers, Character and
Group panes as script panes, collecting their own data. A gap review found
that `pane:gauge` only draws a full-width bar (the Group pane has three
bars per row, the Timers pane short bars), that a script cannot ask for
the pane's colours (to draw its own bars in the gauge colours, or choose
text that suits a paper pane) nor learn when they change, and that the
manual did not say whether `state.group` is current inside a GMCP handler.

## Decision

### 1. Bars over part of a row

- `pane:gauge(row, {…, col, width, align, track})`. Without `col` and
  `width` it is the full-row gauge as before (a `{ gauge }` line that
  replaces the row, its links and fields). With either, it is a bar over
  part of a text row: `col` from 1 (default 1), `width` in cells (default:
  to the pane's right edge, resolved at draw time, so it follows resizes).
- Model: a text line carries an optional `gauges` list (`{ spans,
  gauges? }`); each has `col` (0-based) and maybe `width`. A new bar drops
  the bars it overlaps (a full-width gauge on the row turns the row into an
  empty text line first); the same bar again is no change. At most 100 per
  row.
- Drawing: bars first, the row's text over them. A text cell keeps the
  bar's background unless the span has its own; a space without a
  background is see-through, so the label of a bar shows through
  `setText`'s padding and through spaces in a line. This is what makes a
  Group row (three bars, the name over them) and a Timers cell (a label,
  then a countdown over a bar) work with the existing text calls.
- Interactions: `setText`, `append`, `setLink`, `setInput` and the toggles
  keep the bars; `setLine` and `clear` drop them with the rest of the row;
  `setText` on a full-row gauge is still an error.
- `align` (`"center"` default, `"left"`, `"right"`) places the label in
  its own bar. `track` is a colour for the unfilled part, or `false` for
  none (the pane's background, as under the Group pane's bars); the
  default is the track shade, as before. Both also apply to full-row
  gauges.
- Fill: whole cells (`round(value / max × width)`), as the Group and
  Timers panes, which use no half or eighth blocks; so no sub-cell
  precision. The fill colour gets the same light-pane wash (`fillFor`).
  Gauge and track colours now resolve shade roles against the ramp
  (before, a role fill was empty; `parseScriptColor` does not accept
  roles today, so nothing changes for scripts).
- Runs: a row with partial bars is recorded whole (the value-only patch
  stays for full-row gauges); the sanitizer checks `gauges`, `col`,
  `width`, `align` and `track`. Old records load unchanged.

### 2. Pane theme

- `pane:theme()` returns `{ light, bg, fg, shades = { track, dim, mid,
  bg, text, label, glow } }`, every colour `#rrggbb` (lower case). `bg` is
  the pane's effective background, `fg` the colour of uncoloured text
  (ADR 0041's 4.5:1 rule). The shades are nested under their `<@role>`
  tag names because the tag `@bg` (a ramp shade) is not the pane's
  background. A closed pane returns nil.
- `pane:fillColor(color)` returns the fill `pane:gauge` would use for
  `color` (same colour names), washed on a light pane. Named `fillColor`
  rather than `fill`, which reads as "fill the pane". With a background
  tag (`<:#rrggbb>`) a script draws its own bars.
- `pane:onTheme(fn)` calls `fn(theme)` when the pane's colours change
  (its pane colour, the terminal colours or palette, paper or dark). The
  surface compares a key of the theme after every settings change and
  calls in a microtask, once per change, never inside the settings update
  (a handler may change settings), also while the pane is hidden; not on
  registration. nil removes it; it is released on close.
- Without a surface (tests, the bench) the theme is the default settings'.
- The pure parts (`paneTheme`, `paneInk`, `paneColor`, `themeFill`) moved
  to `src/panes/pane-theme.ts` so the host, the surface and the renderer
  share them; `script-pane.ts` re-exports the old names.

### 3. GMCP state ordering

`state.char` and `state.group` being current inside a `gmcp.*` handler
held only because App attached the game state to the bus before the
scripts' GMCP cache. Now the cache hands every message to
`GameState.take` before it stores it and tells the host (App's cache and
the host's own); `take` applies a message once (the game state's own bus
handler skips the message the cache already handed over). The guarantee
holds whatever the subscription order, is tested with the game state
attached last, and is in the manual.

## Consequences

- Scripts can draw the Group pane's rows and the Timers pane's short bars
  with `pane:gauge` and `pane:setText`, and follow theme changes.
- A space written over a bar does not blank its label; to hide a label
  cell a script writes a space with a background, or redraws the bar.
- Existing scripts and run records are unchanged.
