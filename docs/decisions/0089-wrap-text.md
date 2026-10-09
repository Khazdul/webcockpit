# 0089 — wrapText: word-wrapping for script panes

- Status: Accepted
- Date: 2026-10-09
- Extends: ADR 0053 (script panes), ADR 0065 (pane shades)

## Context

A script pane cuts text wider than the pane at its edge. Scripts know the
width (`pane:size()`, `pane:onResize(fn(rows, cols))`) but had no way to
wrap a paragraph to it, and doing it in Lua means re-implementing the
colour tags: a tag takes no cells, so a naive `#s` count is wrong, and a
colour must be opened again on each new row.

## Decision

- A Lua global `wrapText(text, width[, indent])` returns a list (from 1)
  of cecho lines, each ready for `pane:setLine`.
- It measures as the pane does by reusing the pane's own path:
  `parseCecho` with the shade roles, `splitLines`, `toSpans`
  (`src/scripts/wrap.ts`). No second tag parser; tags take no cells, a
  tab is one cell, one UTF-16 unit is one cell (`★`, `å`).
- Breaks at spaces and drops them there; a word wider than the line is
  cut; `\n` always breaks; the first line keeps its leading spaces.
  `indent` spaces (unstyled) start each continuation line and count toward
  the width (capped at width − 1). A width under 1 or nil only splits at
  `\n`.
- Each output line is written back from its spans (`spansToCecho`, with
  `cechoColorName`, now shared with `copy2cecho`): colours as `ansi_N`,
  `#rrggbb`, `~#rrggbb` or `@role`, backgrounds after a colon, `<b>` `<i>`
  `<u>`, `<reset>` between styles. So a line opens the style its text
  had at the break, and parses back to exactly the spans it was cut
  from. The tags are normalised (`<yellow>` comes back as `<#ffff00>`).
- A helper rather than a pane auto-wrap mode: `setLine`, `setText`,
  `setLink`, `setInput` and the toggles address rows and columns, and a
  pane that reflowed its lines on resize would move content under that
  addressing. The script stays in charge: it wraps in `onResize` and
  redraws.

## Consequences

- Scripts that want wrapped text redraw on `onResize`; nothing changes
  for existing panes, which still cut at the edge.
- A literal `<…>` in the text that reads as a tag after normalisation is
  the same caveat as `copy2cecho`.
- Wide (CJK) and astral characters count as the pane counts them (one
  cell per UTF-16 unit), which is what the pane draws.
