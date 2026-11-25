# 0167 — The UI pane leaves the Panes menu

Date: 2026-11-25. Status: accepted, built. Related: ADR 0016 (the UI
pane), ADR 0099 (the Panes popup), ADR 0109 (`LIVE_ONLY`).

## Context

The owner: the UI pane no longer fills a real function, and too many
panes confuse users. It is off by default for new players (ADR 0092).

## Decision

- `MENU_HIDDEN` (`src/layout/types.ts`) holds `ui`. The menu bar's Panes
  popup and the players' Panes popup leave it out.
- The pane itself stays: its code, its settings, the `ui.message` bus
  and the run log's lines are unchanged. A user who has it on keeps it
  and can close it with its cross; once closed nothing offers it again.
- The phone's strip never had it.

## Consequences

Removing the pane entirely (code, settings migration, the run log's
VIEW records) is a later step if the owner wants it.
