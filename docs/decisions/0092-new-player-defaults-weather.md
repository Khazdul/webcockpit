# 0092 — New-player defaults: docked map, weather on, Shimrod, transparent map

- Status: Accepted
- Date: 2026-10-18
- Builds on ADR 0078 (new-user defaults), ADR 0081 (phone defaults),
  ADR 0082 (tilesets), ADR 0085 (map background), ADR 0091 (weather trial)

## Context

The owner (2026-10-18, stage 28) wants a brand-new player to start with
the weather effects on, the map on a transparent background with the
Shimrod (alternating) tileset, and the panes arranged after two
screenshots of his 174 × 51 window: a right dock about 50 cells wide with
Character on top, the map under it across the whole dock, Timers and
Group side by side, Comm, UI and the pane bar; Map search floating at the
game pane's top-right corner. Of these, Character, UI and Map search
start hidden, so the first screen shows the map, Timers | Group and Comm.
Everything else stays as before. Existing users must not change, except
that (owner, same day) existing desktop users get the weather on with the
update; a phone never starts with it.

## Decision

### Layout (`defaultLayout()`)

```
right dock (2 lanes × 25 = 50 cells)
  head:  character        desired 9   (off by default)
         map              desired 195  (no frame)
  lanes: [0] group        desired 110   lane 0 = screen edge
         [1] timers       desired 110
  tail:  comm             desired 130
         ui               desired 31  (off, no frame)
         panebar/bar      desired 1
floating: mapsearch/main  auto, below: 'map', h 15 (off)
```

- The map is docked in the head, not floating. The desired rows stay
  above any window (`DEFAULT_SHARE`), so the dock runs in `scaled` mode.
  In 174 × 51 with the default toggles: map 22, lanes 13, Comm 15 outer
  rows and the bar 1; with Character and UI on: 11, 16, 9, 11, 3.
- Map search keeps `below: 'map'`. With the map docked there is no map
  float, so it falls back to the script auto float at the game pane's
  top-right corner (ADR 0078), which is where the owner wants it; if the
  user floats the map, Map search opens under it as before.
- `AUTO_FLOAT` and `defaultMapFloat()` are unchanged: a stored layout
  whose map lost its place still floats it (migration), and existing users
  who never moved their map keep it where it is.

### Settings (`defaultSettings()`)

- `panes.character.on` and `panes.ui.on` false (Map search was already off);
  `panes.map.border` false (owner, same day: the map without a frame).
- `weather.enabled` true.
- `mapper.tileset` `'shimrod'` (the seasonal family), `mapper.background`
  `'transparent'`.

### Existing users

`migrateSettings` only ever sees stored records, so a missing or invalid
value in one is an existing user's:

- `migratePanes`: a damaged Character or UI entry falls back to on, a
  damaged map entry to framed.
- `migrateMapper`: a missing or invalid tileset or background takes
  `LEGACY_MAPPER` (MMapper tiles, `#2e3436`).
- `migrateWeather(raw, phone)`: a missing or invalid `enabled` is true on
  a desktop. Every record saved on `main` lacks the weather section, so
  every existing desktop user gets the weather with the update; a stored
  explicit `enabled: false` (the user turned it off) is kept.
  `migrateSettings(raw, { phone })` passes the device on, and
  `SettingsStore` passes its own `phone` on load and on every update.
- A stored layout keeps its map float. Options → Reset layout uses the new
  default (docked map); it does not touch toggles.

### Phone

`phoneDefaultSettings()` keeps Character on (it is a tab, and useful) and
the weather off (battery). The weather is always off by default on a
phone, also for an existing phone user: a stored record without a weather
section, or with an invalid `enabled`, migrates to off there; a stored
explicit `enabled: true` is kept. The rest of this ADR (tileset, background,
layout) applies; the phone shows panes as tabs, so the dock layout only
matters if the user leaves phone mode.

## Consequences

- A new desktop player sees the weather, a docked transparent Shimrod map
  and three panes; the pane bar shows CHAR, UI and FIND dim.
- Existing desktop users see the weather after updating (they can turn it
  off in Options → Weather, and that choice is kept); nothing else
  changes for them. Existing phone users see no change. The owner's own
  browser keeps its stored layout, tileset and background; to see the
  new defaults, use a fresh profile/private window.
- Tests written against the ADR 0078 defaults use
  `tests/unit/legacy-defaults.ts`.
