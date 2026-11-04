# 0122 — Group and Timers panes: modern look (mockup 3c)

- Status: Accepted
- Date: 2026-11-04
- Related: stage 39 (`docs/stages/39-group-timers.md`). ADR 0016 (pane
  package, settings), ADR 0017 (timers hub), ADR 0107 (gear popups),
  ADR 0116 (menu surfaces), ADR 0120 (group scope). Inv §2.3 (Group pane)
  and §2.6.1–2.6.3 (Timers pane look and options): this ADR replaces their
  drawing rules; the data rules stay.
- Mockups: round 1 https://claude.ai/artifact/KQz9apKUpo9YMW5xhTscxf,
  rounds 2–4 https://claude.ai/artifact/14CWg5ad7j3Ut4rcywkBon. The chosen
  one is **3c** (`notes/research/group-timers-mockups/r2-P3c-revised.dc.html`,
  the reference for every detail below); the other rounds are kept beside it.

## Context

The owner wants the built-in panes to leave the cell-grid TUI look for a
modern one that matches the menu bar and its popups, starting with Group
and Timers (they become the template for the other panes). Over four
mockup rounds the owner chose direction 3 ("duel bar, chips that drain")
and refined it (3b, 3c). Owner decisions, in short:

- Group: a person icon for players, a diamond for NPCs; the opponent apart
  from the members with the tank beside it; contextual tooltips on what is
  hovered, no member card; icons for sanctuary, poison, slept, blind and
  more, and for the position (standing, resting, sleeping, riding …);
  members not in your room show the room name or are only dimmed.
- Timers: Sanctuary is a group of its own; Blinds and Charmies stay groups;
  bars or circles, flow or grid, for every group; no group headers as an
  option; a timer keeps its colour to zero (ending soon is shown another
  way); seconds only at 90 s or less; time text can be turned off; names
  are shortened only when they do not fit; many blinds with long names
  must stay compact.
- Colours: every timer group and the three vitals can take any colour;
  "Auto" follows the background (dark or light).
- Icons: Sanctuary "Radiant" (a figure with rays, no enclosing outline: an
  enclosed head read as a skull), Stored "Held spark" (a spark between
  brackets); poison a vial, thirst a blue drop, enemy race a horned helm,
  the opponent an axe (no crosshair: it does not fit Middle-earth).

## Decision

### Rendering

- Both panes render DOM (not `CellLine` rows) inside `.wc-pane-content`,
  in the terminal font at the terminal size, with thin rounded bars and
  their own inline SVG line icons (`src/panes/icons.ts`, 24×24 stroke
  paths, stroke 2, round caps). The cell grid still sizes and places the
  pane; the content inside it is free.
- Colours come from the pane's light/dark side (`paneShade(...).light`):
  an Auto colour picks the dark or the light default below; a custom
  colour is used as stored. Text and lines use the pane shade ramp;
  tooltips use the menu surface tokens (`--sf-*`).
- Tooltips: one per hovered element (a bar: `HP 37/158 · 23%` or the
  band word with "about"; an icon: its meaning and, for a timed
  sanctuary, the time left; a name: player/NPC/race and the room). No
  member card. Plain DOM tooltips, not the browser's `title`.

### Default colours (Auto)

| Thing | Dark side | Light side |
|---|---|---|
| Sanctuary | `#f0b6e4` | `#a956b5` |
| Spells | `#66b2ff` | `#2a56c8` |
| Buffs | `#4cc96a` | `#2a6e1a` |
| Debuffs | `#c8504f` | `#98332f` |
| Stored | `#d6407e` | `#8e1a50` |
| Blinds | `#3fd0d0` | `#00737e` |
| Charmies | `#9d86ff` | `#4b3aa8` |
| HP | `#2fa84f` | `#2a6e1a` |
| Mana | `#3d7eff` | `#2a56c8` |
| Moves | `#c08a3e` | `#846400` |
| Vital ≤ 45 % / ≤ 25 % | `#ff8c2a` / `#ff4d4d` | `#b85400` / `#d01f1f` |
| Ending-soon time text | `#ff3b3b` | `#d0101a` |

Vitals keep their low-value orange and red (they are about health, not
time). Timers never change colour.

### Group pane

- **Fight zone**, pinned on top while you fight (`Char.Vitals` buffer and
  opponent, Inv §8.2): the tank on the left (shield, HP bar filling from
  the left, `132/160`), the opponent on the right (axe, its band word, a
  red HP bar filling from the right), a small `vs` mark between; then a
  divider. Gone when there is no opponent. The tank is also marked with
  the shield in the member list (always, no option).
- **Member row**: marker (player: person icon in the relation colour, ally
  blue, neutral amber; enemy race: horned helm in red; NPC: a grey diamond
  plus the label as a small tag), name (players bold, NPCs regular and
  dimmer), the room when away, status icons, a divider, the position icon;
  under it HP, mana and moves bars (NPC band-word bars hatched). Rows are
  two lines when every member fits that way, else one line (name, three
  mini bars, up to three icons and `+n`). Overflow: the last row is the
  `↓ N more members` indicator as today.
- **Statuses** (GMCP `Group.*` flags, kept by the model now): sanctuary
  (Radiant, with a countdown ring when timed by you), poison, slept,
  blind, bashed, snared, wound, hungry, thirsty, waiting. **Positions**:
  standing, fighting, resting, sitting, sleeping, incapacitated/stunned
  (as MUME sends them), riding (`ride`).
- **Away** (a player's `mapid` is not your room): `room` (default, the
  room name after the name, dimmed row) or `dim` (dimmed only; the room
  in the name's tooltip).
- Enemy and neutral players are shown when "Show players" is on (the
  `ally`-only test was the gap noted in ADR 0120).

### Timers pane

- **Groups**, top to bottom: Sanctuary, Spells, Buffs, Debuffs, Stored,
  Blinds, Charmies. Your own sanctuary moves from Spells to Sanctuary.
- **Style** (global, gear only, no switch in the pane): `bars` (a pill
  whose fill drains right to left under the name and time) or `circles`
  (an 18 px ring that drains, name and time beside it, 20 px rows).
- **Layout**: global `flow` (items wrap by their content width) or `grid`
  (columns: `auto` or a cap 1–6), with a per-group override
  (`default | flow | grid`).
- **Headers**: a small caps header per group with its icon and count
  (on by default); off, the groups stack with a small gap, told apart by
  colour and icon.
- **Time text**: on (default) or off (bars and rings only). The text is
  `countdownText` (seconds at 90 s or less, else minutes, `1h52` over an
  hour; the tooltip has the exact time).
- **Ending soon**: the timer keeps its colour. Signal `text` (default: the
  time in the ending-soon red, bold), `pulse` (the fill pulses in its own
  colour) or `none`; threshold 10, 20 (default), 30 or 60 s; "Soonest
  first" sorts each group by time left (on by default).
- **Names**: shortened only when the measured width is too small (CSS
  ellipsis). Blind targets also drop a leading `a`/`an`/`the` and are
  shortened in the middle, keeping the last word (`captain…Fornost`);
  the full name is in the tooltip.
- Kept: herblore add-view (the gold corner `+`), the charm `×`, read-only
  in a log player, native scrolling with the indicator row.

### Sanctuary on others

- A group member with the GMCP `sanctuary` flag gets an entry in the
  Sanctuary group. It is **timed** when you cast it: a sent
  `cast 'sanctuary' <target>` (any accepted abbreviation, via the cast
  queue) followed within 10 s by that member's flag turning on starts a
  270 s countdown (the self duration; the real one may differ by caster,
  so the tooltip says "about"). Otherwise it is **untimed** (dim, `?`).
- The entry ends when the flag turns off, the member leaves the group,
  or a timed one reaches zero. Not saved (runtime only).

### Settings

- `group`: `showPlayers`, `npcMode` (kept), `away: 'room' | 'dim'`
  (`room`), `colors: { hp, mana, mp: 'auto' | '#rrggbb' }`.
- `timers`: `style: 'bars' | 'circles'` (`bars`), `layout: 'flow' |
  'grid'` (`flow`), `cols: 'auto' | 1–6` (`auto`), `headers` (kept,
  `true`), `timeText` (`true`), `signal: 'text' | 'pulse' | 'none'`
  (`text`), `warnAt: 10 | 20 | 30 | 60` (`20`), `soonestFirst` (`true`),
  `groups[g]: { enabled, color: 'auto' | '#rrggbb', layout: 'default' |
  'flow' | 'grid' }` for the seven groups.
- Migration: `enabled` is kept; a stored swatch that was the group's old
  default becomes `auto`, any other swatch its hex; `cols`, `clock`,
  `bar` and `compact` are dropped (the new defaults apply); `sanct` is
  added enabled.
- The gear popups and the Options → Panes pages edit the same model
  (`pane-options-model.ts`); colours get a swatch palette (12 colours), a
  free colour input and Auto.

## Consequences

- The panes no longer share the cell rows' look with Character, Comm and
  UI; those follow later with this as the template.
- The pane DOM costs more per update than cell rows; Group still rebuilds
  only the changed member row, and Timers redraws at 1 Hz only while
  something counts (as before).
- Scripts read the group from `state.group`; the new model fields are
  documented in the script manual.

## Addendum (stage 39a, 2026-11-04)

- **Settings version 4.** The timers change is not additive, so
  `SETTINGS_VERSION` is 4, but the migration does not depend on it: a
  stored swatch name is recognised by value (`migrateTimers`), so old VIEW
  records in logs migrate the same way.
- **Your room** for "away" comes from `Room.Info` `id`, applied by
  `GroupModel` itself (`selfRoom`, `isAway`), so the model has no
  dependency on the map.
- **The opponent's band word** is the last `opponent-hits` seen (as
  `Char.Vitals` keeps it), shown only while there is an opponent. It is not
  cleared when the opponent changes: MUME sends the identity and the first
  word together, and the replay folding (src/share/fold.ts) merges vitals
  packets the same way.
- **Sanctuary on others** (`src/timers/sanct.ts`): GameState passes the
  members to `TimersHub.noteGroup` after every Group.* change; trackers
  get an optional `onGroup`. The tracker keeps its own pending casts (the
  sent command parsed with `parseCast`), not the shared CastQueue: no game
  line confirms a sanctuary on another, the flag edge does, so it must not
  pop the shared queue's front. A cast's target matches a member when it
  (without a `2.` prefix) starts a word of the name or the label; `sa` is
  the shortest spell abbreviation taken. A timed entry that reaches zero
  while the flag is still on turns untimed instead of vanishing (the
  estimate was short). A recast on someone already glowing does not
  restart the countdown (no flag edge): an open point.
- **Interim UIs.** Until 39b/39c, the cell-grid Timers pane draws every
  group with bars, the old column caps and the time text setting as its
  clock, and the gear and Options page offer the old seven swatches
  (the group's old default swatch is stored as `auto`).
- **Countdown over an hour** reads `1h52` (`countdownText`).
- **Picker colours**: the twelve swatches of mockup 3c
  (`PICKER_COLORS` in src/panes/palette.ts).
