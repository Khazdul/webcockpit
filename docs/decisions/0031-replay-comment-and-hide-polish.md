# 0031 — Replay comment hold, leading comment, auto-hide with settings

- Status: Accepted
- Date: 2026-09-29
- Amends: ADR 0019 ("Comments and holds"), ADR 0021 (auto-hide with the
  settings section open)

## Context

Owner feedback on the HTML replay (2026-09-29):

1. Comment holds are too long.
2. A comment at the very start of a replay sits on the output's first
   row, under the player header, and cannot be read until the chrome
   hides.
3. With the gear's settings section folded out, the chrome never
   auto-hides.

## Decision

1. The hold is halved, same shape: `clamp(1 + len/30, 2.5, 10)` s
   (was `clamp(2 + len/15, 5, 20)`). The hold is computed at export
   time and stored in the payload, so replays exported earlier keep
   their holds.
2. When a comment reaches an output pane with no rows (shown or
   queued), the player pushes one blank row first. This applies to the
   in-app player as well; a blank row at the top is harmless when a top
   dock sits above the output.
3. The chrome auto-hides in play whether the settings section is open
   or not. The section stays folded out while hidden and is there again
   when the chrome shows. A strip drag still keeps the chrome.

## Consequences

- Exported comment hints read "Holds the replay for N s" with the new
  values.
