# 0059 — The map wheel always zooms; no manual layer change

- Status: Accepted
- Date: 2026-10-03
- Supersedes: the "Ctrl+wheel changes layer" part of ADR 0020

## Context

ADR 0020 gave the map pane MMapper's input: wheel zooms, Ctrl+wheel
changes layer. On laptop trackpads a pinch arrives as Ctrl+wheel, and some
touchpad drivers set `ctrlKey` on a plain two-finger swipe, so users got
layer jumps when they meant to zoom. The view already re-centres on the
player's room and switches to its layer on every move, so a manual layer
change is practically never needed.

## Decision

- Every wheel event over the map, with or without Ctrl, zooms around the
  cursor (`src/panes/map.ts`). The layer is never changed by input.
- The `layer` worker message, `MapClient.layer()` and `changeLayer()` are
  removed. Following the player's layer on moves is unchanged.
- Zoom unit: one notch is 100 px (3 lines, 1/3 page) as before. A Ctrl
  wheel event in pixel mode with |deltaY| < 50 is taken as a trackpad
  pinch and uses 40 px per notch: browsers report a pinch as roughly
  −100·ln(scale) in total, which at 100 px would zoom only ×1.12 for a ×2
  finger spread; at 40 px it zooms about ×1.33. A Ctrl+mouse notch
  (≥ 50 px) keeps the plain unit.

## Consequences

- Pinch and two-finger swipe zoom on every trackpad; there is no way to
  look at another layer than the player's (other than moving).
- A Ctrl-flagged two-finger swipe zooms 2.5× faster than an unflagged
  one; acceptable, and it cannot be told apart from a pinch.
