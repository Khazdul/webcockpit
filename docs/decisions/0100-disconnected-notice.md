# 0100 — Disconnected notice

- Status: Accepted
- Date: 2026-10-31
- Related: stage 30 S2, ADR 0099 (menu bar), Inv §4.7 (ESC menu
  auto-open), spec §2.2 (Enter reconnects)

## Context

Until now a dropped live connection opened the ESC menu by itself with
Reconnect selected (Inv §4.7), except for disconnects the user asked for.
Stage 30 removes the ESC menu from play on desktop and tablet; a drop must
still be obvious and one action away, without covering the game.

## Decision

- On desktop and tablet the menu bar shows `Disconnected` (red) and a
  `Reconnect Enter` button left of the clock (mockup 30a-1). The button
  reconnects as `#reconnect` does and gives the input its focus back.
- It shows after any live connection closed, for every reason Enter
  reconnects from (a server drop, a failed connect, `#disconnect`), and
  hides once the next connection starts. Never after a replay or in the
  offline modes. The link dot is red meanwhile.
- Enter keeps today's rule (spec §2.2: the first command typed while
  disconnected reconnects). The notice only says so. This keeps
  `#disconnect` → Enter working, instead of the spec's tentative "Enter
  does not reconnect from quiet disconnects".
- The ESC menu's auto-open on a drop stays on the phone only, which has
  no bar. On desktop and tablet Esc still opens the menu, with Reconnect
  selected while disconnected.

## Consequences

The e2e tests that waited for the auto-opened menu on desktop now look
for the notice (chrome.spec) or press Esc first (editor.spec).
