# 0078 — New-user defaults: Hack 17, two-lane right dock, pane bar and Map search

- Status: Accepted
- Date: 2026-10-05
- Builds on ADR 0010 (settings), ADR 0014/0020 (floating panes, the map's
  auto float), ADR 0023 (earlier new-user defaults), ADR 0053 (script
  panes), ADR 0060 (bold brightens), ADR 0064 (dock lanes), ADR 0065
  (pane bar), ADR 0067 (spanning panes), ADR 0077 (Map search)

## Context

The owner (2026-10-05) wants a brand-new user to start with the look of
his own screen (a 174 × 51 cell window, Hack 17): the game on the left,
the map floating at its top-right corner, and a right dock about 40
cells wide with Character on top, Group and Timers side by side under
it, then Comm, the UI messages (no frame) and the pane bar at the
bottom. The bundled pane bar and Map search scripts should be on; the
Map search pane itself starts hidden (its FIND button dim) and, once
opened, floats right under the map, as wide as it. Existing users'
stored settings must not change.

## Decision

### Appearance

`defaultSettings().appearance`: font `hack` (was `dejavu`), size 17
(was 15), `boldBright: true` (was false). Padding, colours, input
colour and scrollback are unchanged.

Migration pins the old values for an existing user: when a stored
appearance object lacks `font`, `size` or `boldBright` (or holds an
invalid value), it takes `LEGACY_APPEARANCE` (DejaVu, 15, false), not the
new defaults. Only a missing appearance (a new user, garbage) takes
`defaultSettings()`. This matters for `boldBright`: records saved before
ADR 0060 do not have it, and would otherwise turn bright bold on. Font
and size have been in every saved record since stage 2; the pin is a
safety net. The same rule covers the localStorage mirror.

### Default layout

```
right dock (40 cells)
  head:  character              desired 9
  lanes: [0] group  (size 20)   desired 81   lane 0 = screen edge
         [1] timers (size 20)   desired 81   lane 1 = next to the game
  tail:  comm                   desired 211
         ui                     desired 31   (no frame by default)
         panebar/bar            desired 1    (borderless, its own default)
floating: map            auto                     (AUTO_FLOAT 21 % × 27 %)
          mapsearch/main auto, below: 'map', h 15 (off by default)
```

- The desired rows (`DEFAULT_SHARE`) are larger than any window, so the
  dock always runs in `scaled` mode like ADR 0023's even share:
  Character and the pane bar are reserved, the rest is split by
  `desired − min`: the lanes 80 parts, Comm 210, UI 30 (8 : 21 : 3). In
  51 rows that is Character 9, the lanes 9, Comm 22 and UI 4 content
  rows; Comm takes the largest part of any extra height. A pure `fit`
  layout could not do this: the leftover goes to UI before Comm
  (`LEFTOVER_PRIORITY`), and changing that would change existing users.
- The UI pane's default `border` is false. A stored pane map keeps its
  own value; a damaged UI entry in a stored map falls back to the old
  framed default.
- `AUTO_FLOAT.w` goes from 0.25 to 0.21 (the owner's screen: about 37 of
  174 columns). This is a computed rectangle, not a stored value, so it
  also narrows the map of an existing user who never moved it (as ADR
  0023's change did).
- The key order of the default (`lanes`, `head`, `tail`) is the one
  `migrateLayout` writes, so the first settings update does not see a
  spurious change.

### Pre-placed script panes

`defaultLayout()` places `panebar/bar` and `mapsearch/main`, and
`defaultSettings().panes` holds their toggles (bar on and borderless,
Map search off). The script pane surface places a pane only when the
layout has no place for it or the pane map has no entry
(`ensurePlaced`), so both land in these places when their scripts create
them, and Map search stays hidden: `pane:visible()` is false and the
pane bar shows FIND dim until the user opens it.

`migratePanes` never adds these entries to a stored pane map, and
`migrateLayout` never adds them to a stored layout, so existing users
are unaffected; when they enable a script its pane is placed as before
(the pane bar at the bottom of the right dock, Map search in its own
lane). Options → Reset layout uses `defaultLayout()` and so gets the new
places too; it does not touch the toggles.

### Map search under the map (`FloatPane.below`)

A new optional `FloatPane.below: PaneId`, meaningful only with `auto`:
`allocate` shows the pane right under that float's shown rectangle
(`floatBelow`: same x and width, its top frame on the other's bottom
frame, the stored `h`). When the map is moved or resized it follows the
map's new rectangle; when the map is off, docked or itself placed under
another pane, it falls back to the ordinary script auto float (the game
pane's top-right corner, `scriptAutoFloatRect`). `clampFloat` keeps it on
screen. Moving or resizing the Map search pane stores a real rectangle
and drops `auto` and `below` (`setFloatRect`). The migration keeps
`below` only on an `auto` float and only for a valid pane id other than
the pane's own.

### Bundled scripts on for a new install

`NEW_USER_SCRIPTS = ['panebar', 'mapsearch']`. Detection takes two
conditions, each owned by its store:

1. `SettingsStore.fresh`: IndexedDB opened, no settings record under
   `main`, not safe mode. The browser has never saved a setting.
2. `ScriptLibrary.enableForNewUser(names)`: does nothing if the library
   has any `scriptData` record or any user script. Otherwise it writes
   `{ name, enabled: true, settings: {}, store: {} }` for each name at
   once.

The shell runs this once at boot (not in the bench). Because the records
are written immediately, the next start finds script data and never
seeds again, even if no setting was ever saved; a user who turns either
script off keeps it off. An existing user who never touched a script
has stored settings, so (1) is false; one who has script data fails (2).

## Consequences

- New users see Hack 17, bright bold, the two-lane dock with the pane
  bar, and a running Map search script whose pane opens under the map.
- The script host (Lua) now loads at startup for a new user, as it does
  for anyone with an enabled script.
- An existing user whose browser holds no settings record at all (never
  changed or moved anything since the first start) is indistinguishable
  from a new user: they get the new look, and, if they have no script
  data, the two scripts. This is accepted: they never chose the old
  defaults.
- An existing user whose map was never moved sees it 4 % of the window
  narrower (AUTO_FLOAT), nothing else.
- Tests written against the old defaults use `tests/unit/legacy-defaults.ts`
  (`legacyLayout`, `legacySettings`).
