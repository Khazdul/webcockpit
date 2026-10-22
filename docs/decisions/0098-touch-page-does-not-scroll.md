# 0098 — The page does not scroll on tablets either

- Status: Accepted
- Date: 2026-10-22
- Related: ADR 0075 §3 (phone visible area), ADR 0097 (fullscreen button)

## Context

On the iPad the owner can scroll the page down and see a black strip
below the input pane (and below the start page footer). Desktop Chromium
at the same size shows no overflow: the document is exactly the
viewport. The strip is iPadOS Safari panning the layout viewport (to show
a focused input over the on-screen keyboard, or around its toolbars and
fullscreen). Phones already avoid this (ADR 0075 §3): the page does not
scroll and #app follows `visualViewport`. The owner also reports that a
swipe up leaves fullscreen on the iPad.

## Decision

- The *touch* flag, not only *phone*, now gets the visible-area layout:
  `html, body` `overflow: hidden; overscroll-behavior: none`, #app fixed
  to `--wc-vv-top` / `--wc-vv-h`, the chrome and the ESC menu placed in
  #app, and `installPhoneViewport()` running (src/main.ts).
- Phone-only stays phone-only: the viewport meta (no zoom,
  `viewport-fit=cover`), the full-screen opaque ESC menu, the tab layout.
  Without `viewport-fit=cover` the safe-area insets are 0 on a tablet.
- Side effect: on an iPad with the on-screen keyboard the cockpit now
  shrinks to sit above it, as on a phone, instead of being panned.

## Consequences

Not verifiable on desktop; the owner checks on the iPad. Whether the
fullscreen exit on a swipe up came from the page scroll is unknown: if
it persists it is Safari's own gesture and is left alone.
