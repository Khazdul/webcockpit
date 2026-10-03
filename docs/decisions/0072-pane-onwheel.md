# 0072 — `pane:onWheel`: the wheel for script panes

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0053 (script panes: the wheel scrolls the pane's lines)

## Context

Owner feedback round 3 on the pane bar (stage 14, ADR 0065): the bar no
longer wraps; when its buttons do not fit even at two cells it scrolls
sideways, by arrows and by a two-finger swipe. A swipe is a wheel event
over the pane, which the script cannot see so far: a script pane's wheel
only scrolls its own lines natively (ADR 0053 addendum). The bar is a
bundled script, so the wheel must reach Lua. The owner's working rule is
that pane API is open to all scripts.

## Decision

- **Lua:** `pane:onWheel(fn)` sets the pane's wheel handler, `nil`
  removes it (a non-function is a bad-argument error). A new call
  replaces the old handler, whose reference is released; `pane:close()`
  and the script unloading release it too, as `onResize`.
- **Steps in whole cells:** `fn(dx, dy)`, positive = right / down.
  The pane converts each `WheelEvent` (`wheelSteps`, script-pane.ts):
  pixels divided by the cell width (x) or the cell height (y); lines
  (`deltaMode` 1) taken as cells; pages (2) as the pane's cols / rows.
  The fraction is kept per pane and axis for the next event and dropped
  when that axis turns direction, as the output pane's wheel rest. Shift
  with a vertical-only wheel (`deltaX` 0) is horizontal, for mouse users.
  `fn` is called only when at least one axis has a whole step.
- **Consume:** `fn` returning `true` (exactly) consumes the event:
  `preventDefault`, so the pane's lines do not scroll natively, the
  frame's forwarded scroll (`forwardWheel`, which now skips a prevented
  event) does nothing, and the browser does no history swipe. Anything
  else leaves the event alone. An event too small for a whole step
  follows the handler's last answer, so a touchpad's sub-cell deltas
  between steps do not leak to the native scroll. An error in `fn`
  follows the usual error policy and does not consume.
- **Ctrl+wheel** (zoom, a touchpad pinch) is never handed to the script
  and never prevented.
- **Listener:** a capture-phase, non-passive `wheel` listener on the whole
  pane element (frame included), added only while a handler is set (the
  view's `wheel(on)`), so panes without one keep a passive-only path and
  scroll exactly as before.
- **Plumbing:** `ScriptPaneEvents.onWheel(dx, dy) → boolean` and
  `ScriptPaneView.wheel(on)` (both optional; fakes without them keep
  working). `CockpitPaneSurface` wires both for ordinary and temporary
  panes; `RecordingPaneSurface` forwards `wheel` and passes the event
  through. Runs record nothing new: the log player and the HTML replay
  have no script, so their panes keep the native wheel.

## Alternatives considered

- Panebar-only support in TypeScript (a "horizontal scroll" flag on the
  pane): less API, but the bar is meant to be an ordinary script on the
  public API (ADR 0065), and other scripts (lists, maps of their own)
  want the wheel too.
- Raw pixel deltas to Lua: every script would redo the deltaMode and
  cell-size arithmetic, and pixels depend on the font size.
- Always consume when a handler is set: would break the native scroll
  of a pane that wants the wheel only in some states (the bar, which
  takes it only while scrolled).

## Consequences

- Any script pane can page, zoom its own content (without Ctrl) or scroll
  sideways with the wheel and the touchpad.
- A handler that returns true for everything turns off the pane's own
  line scrolling; documented in the reference.
