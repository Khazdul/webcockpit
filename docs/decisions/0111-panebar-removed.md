# 0111 — The bundled pane bar script is removed

- Status: Accepted
- Date: 2026-11-01
- Related: stage 30 (`docs/stages/30-fixed-menu.md`, "Pane bar script
  removed"), ADR 0051 (script library), ADR 0053 (script panes), ADR 0065
  (pane bar and the pane list API), ADR 0078 (new-user defaults), ADR
  0092 (new-player defaults), ADR 0099 (menu bar and its Panes popup),
  ADR 0109 (Statistics pane)

## Context

The bundled `panebar` script (stage 14, ADR 0065) showed a button per
pane to switch it on and off. Since stage 30 the menu bar's Panes popup
(ADR 0099) does that job for every pane, always within reach; the bar
was turned off for new users in 30a round 1 (ADR 0078 addendum
2026-10-31) but still shipped, kept its slot in the default layout and
stayed enabled for existing users who had it. After 30d the open question
was whether it should get a STAT button for the Statistics pane (ADR
0109). The owner decided (2026-11-01) to remove the script entirely
instead: it is redundant.

## Decision

- **Bundle and defaults:** `src/scripts/bundled/panebar.lua` is deleted.
  `defaultLayout()` no longer has `panebar/bar` at the end of the right
  dock's tail (the tail is Comm, UI), `defaultSettings().panes` has no
  entry for it, and `PANEBAR_PANE` is gone. `NEW_USER_SCRIPTS` stays
  `['mapsearch']`.
- **The pane API stays:** `getPanes`, `setPaneOn`, `sysPanesChanged`,
  `createPane{short, border, cross, outline, lane = "own"}`,
  `pane:setGrip`, `pane:setHover`, `pane:onWheel` and the pane shades are
  unchanged and documented as before; only the text describing the
  script went (script manual, README, About).
- **Existing installs, settings:** `SETTINGS_VERSION` is 3. Settings
  stored before version 3 (or without a version) drop `panebar/bar` from
  `panes` and from the layout: docks (head, lanes, tail; a lane it had
  alone disappears with it) and floats; a float `below` it loses the
  anchor. The list is `RETIRED_PANES` in `src/settings/migrate.ts`, each
  entry with the version that retired it. Settings of version 3 are left
  alone, so a user script named `panebar` with a pane `bar`, made after
  the removal, keeps its place and toggle. The drop runs at every load of
  older settings until the next save writes version 3, and gives the
  same result each time.
- **Existing installs, script library:** `RETIRED_BUNDLED_SCRIPTS =
  ['panebar']` (`src/scripts/bundled.ts`). At `init` the library deletes
  the `scriptData` record (enabled flag, settings, `store`) of each
  retired name that no script owns. Without the bundled entry the
  script is simply absent: the host never starts it, the Scripts page
  does not list it, and backups already skipped data of unknown scripts.
- **Copies are the user's own:** the library has no notion of an edited
  bundled script; bundled scripts are read-only, and Duplicate makes a
  user script under another name (`panebar-copy`). Such a copy keeps
  working, enabled or not, with its data and its own pane
  (`panebar-copy/bar`); neither migration touches it. A user script named
  `panebar` can exist only after the removal (while bundled, the name was
  taken) and owns its data, so it is never deleted either.

## Consequences

- Existing users who had the bar enabled find it gone after the update,
  with no empty slot at the bottom of the right dock; the Panes popup is
  the way to switch panes. Users who want a bar can keep a duplicated
  copy or write one with the same API.
- A fresh install is unaffected: nothing to delete, the default layout
  and toggles simply lack the bar.
- `tests/unit/scripts-panebar.test.ts` and `tests/e2e/panebar.spec.ts`
  are deleted; `tests/unit/panebar-removed.test.ts` covers both
  migrations. Layout and pane tests that used `panebar/bar` as an example
  of a one-row borderless script pane use `mybar/bar`.
- A future removal of a bundled script adds its name to
  `RETIRED_BUNDLED_SCRIPTS` and, if it had pre-placed panes, an entry to
  `RETIRED_PANES` with a settings version bump.
