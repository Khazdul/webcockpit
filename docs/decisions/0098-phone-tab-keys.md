# 0098 — Phone tab keys

- Status: Accepted
- Date: 2026-10-28
- Builds on ADR 0075 §3 (phone layout, tab strip), ADR 0015 (macros)

## Context

A player uses the phone layout with a physical keyboard and asked for
keys to jump between the tabs, e.g. Ctrl+1 for GAME and Ctrl+3 for the
map. Tabs could only be tapped; neither macros nor scripts can select a
tab.

## Decision

- In the phone layout, **Ctrl+1…9 and Alt+1…9 select the strip's tab by
  position**: 1 is GAME, then the panes in strip order. Built in, no
  setting.
- Position, not a fixed key per pane: the strip differs per player, and
  the number matches what the strip shows.
- Alt+1…9 as well as Ctrl: some mobile browsers may take Ctrl+digit for
  their own tab switching before the page sees it (unverified on Android
  Chrome with a hardware keyboard; iPad Safari uses Cmd+digit).
- A macro bound to the same key wins (the tab keys run only when no macro
  is bound, in `App.onMacroKey`). A position past the last tab is not
  consumed. Outside the phone layout the keys do nothing.

## Consequences

- `Cockpit.selectTabAt(index)` keeps the strip's tab list from the last
  relayout.
- E2E: `tests/e2e/phone-layout.spec.ts` "Ctrl+1…9 and Alt+1…9 select tabs".
