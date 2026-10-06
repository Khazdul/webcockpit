# 0081 — New-user defaults on a phone

- Status: Accepted
- Date: 2026-10-06
- Builds on ADR 0075 (phone access), ADR 0078 (new-user defaults)

## Context

The owner (2026-10-06): on his phone the start banner shows only at Hack
15 or smaller (ADR 0075 §3.2 drops it under 39 columns); the new-user
default is Hack 17. A phone with a smaller screen needs some margin. On a
phone the UI pane, the pane bar and Map search are of little use and
only add tabs, so a new phone user should start without them.

## Decision

- `phoneDefaultSettings()`: `defaultSettings()` with font size 14
  (`PHONE_FONT_SIZE`) and the UI pane off. Everything else, including the
  font (Hack), is the desktop default.
- `SettingsStore` takes `phone` (set from `device().phone` in `main.ts`).
  Its `defaults()` returns the phone defaults on a phone; it is used where
  the store starts from the defaults: the first guess before a load (so a
  new install), `reset()`, safe mode's appearance and Options → Reset
  appearance. Stored settings and their migration are not affected: a
  phone that has saved settings keeps them.
- On a phone the shell does not enable `NEW_USER_SCRIPTS` (pane bar, Map
  search). Nothing is written, so the phone simply has no script data;
  the user can enable either script by hand.
- The pane toggles of the pane bar and Map search keep their ADR 0078
  defaults, so a script enabled by hand on the phone shows as on desktop.

## Consequences

- A new phone user sees Hack 14 and the tabs GAME, CHAR, TIME, GRP,
  COMM and MAP, with room for the banner on phones narrower than the owner's.
- An existing phone install with no settings record (never changed
  anything) gets these defaults on its next start.
- Desktop is unchanged.
