# 0021 — Player viewer settings (stage 8 part A)

- Status: Accepted; amended by ADR 0114 (Panes and Display popups)
- Date: 2026-09-28

## Context

The log player (ADR 0018) and the HTML replay (ADR 0019) lay the cockpit
out from the recorded VIEW records over the viewer's settings, so the
viewer sees what the player saw. The owner (2026-09-28) wants the viewer
to be able to change that: toggle, move and resize panes, pick a font
size and a colour theme, all behind a gear in the control box. The
timers pane's `+` (herblore add-view) must not show in a player.

## Decision

### Viewer overrides

`src/player/viewer.ts` (pure): a `ViewerOverrides` value held by the
`PlayerHost`, never by a player App, so it survives App rebuilds on a
backward seek.

```ts
interface ViewerOverrides {
  font: 'default' | 'small' | 'medium' | 'large';
  theme: 'default' | 'dark' | 'teal' | 'paper' | 'sepia' | 'slate';
  /** Pane on/off chosen by the viewer; absent = recorded. */
  panes?: Partial<Record<PaneId, boolean>>;
  /** The viewer's layout (docks, order, sizes); absent = recorded. */
  layout?: LayoutSettings;
}
```

`applyViewer(draft, o)` runs after every `overlayView` and after the
initial settings copy in `build`, so the recorded VIEW applies first and
the viewer's choices always win (sticky across later VIEW records and
seeks). Reset clears `panes` and `layout`.

- Font: Default = the recorded size; Small 12, Medium 15, Large 18 px.
  The window fit (`playerFontSize`) still shrinks below the choice when
  the grid would be under the cockpit minimum.
- Theme: Default = recorded fg/bg and pane colours. Otherwise bg/fg from
  the presets — dark black/silver, teal teal/silver, paper paper/ink,
  sepia sepia/silver, slate slate/silver — and every pane's `color` is
  `black` (None). Borders stay as recorded; with None they take the
  terminal background's shade, as in the live client.
- Layout: the player cockpit's own drag and resize write to the player
  App's in-memory store; the host notices a change of `layout` (or pane
  toggles) that did not come from a VIEW record and stores it as the
  override.

### UI

A gear in the control box's first row toggles a settings section folded
into the box (box-drawing rows like the rest): Panes (one toggle each),
Font `◄ name ►`, Colours `◄ name ►`, Reset layout. The chrome does not
auto-hide while it is open. Clicks inside the box never reach the stage
(no cursor move). The glyph is `⚙` if the bundled fonts render it,
otherwise a fallback chosen by the builder and noted below.

### Not saved

The overrides live for one open. The HTML replay has no storage by
design (ADR 0019), and the in-app player follows it so both behave the
same. Revisit if the owner asks.

### Players are read-only

Player Apps hide pane affordances that change game or profile state:
the timers `+` corner and the herblore add-view. Other panes are audited
in the build; anything found is listed below.

## Consequences

- One code path for RUN LOG, HTML replay and the reel (the reel shows
  only the parts that make sense there).
- VIEW records keep working as before when the viewer changes nothing.

## Package notes

Part A build, 2026-09-28:

- `src/player/viewer.ts` (pure, tests/unit/player-viewer.test.ts) as
  above; `layout` is a `LayoutModel`. `PlayerHost` keeps the overrides
  and, per App, `base` = the viewer's settings with every VIEW record so
  far; the App's store is always `applyViewer(clone(base))`, written by
  replacing the top-level parts (a merged patch would keep sparse keys such
  as comm filters that a later VIEW dropped). Default font / theme thus
  bring back exactly the recorded values.
- Layout override: a store change of `layout` that the host did not write
  itself (a flag around its own writes) is the viewer's drag or resize and
  is stored whole. Bringing a floating pane to front also writes the
  layout, so with two or more floating panes a click on the back one
  becomes an override too (harmless: Reset clears it).
- Player cockpit: the grips and resize handles were `visibility: hidden`
  in the player (stage 6); they are now live, so drag and resize work as
  in the live client. Pointer handling was checked end to end (e2e drags
  Group to the left dock while paused): the chrome layer takes no pointer
  except its controls, the cockpit's pointer capture keeps the drag, and
  the stage-click handler only acts on output rows, so a drag never moves
  the pause cursor or resumes play. The wheel over a side pane no longer
  moves the pause cursor (the pane scrolls itself).
- Control box: 30 cells inside (was 28) to fit the gear at the end of the
  first row; the whole box takes the pointer (`pointer-events: auto`), so
  clicks and the wheel on it never reach the stage. ESC folds the section
  before it does anything else. Light themes (Paper) get darker box greys
  and a `--c-line-hl` cursor band instead of `#303030`.
- Glyph: `⚙` (U+2699) is in DejaVu Sans Mono, not in JetBrains Mono. The
  gear span asks for DejaVu first and is fixed to one cell
  (`width: var(--cell-w)`, overflow hidden), so the box grid holds even in
  a JetBrains-only HTML replay (no DejaVu embedded), where the browser's
  own symbol font draws it.
- Read-only panes: `PaneContext.player` (set by `App` for `player: true`).
  Timers: no corner `+` (so no herblore add-view) and no charm `×`
  (dropping a charm changed the pane's model); the `↑ N rows above` jump
  and the wheel stay. Comm: the channel-filter header shows the recorded
  filters but ignores clicks (they changed `comm.filters`, and the next
  VIEW or override change would have reset them anyway); its cells do not
  take the pointer, so a borderless Comm pane is still dragged by its top
  row. Audited, no change needed: Character, Group and UI have no pointer
  handlers; the Map pane's drag/wheel only pan and zoom its own view; the
  anchored lists' `↓ more` only scrolls. The panes' sender in a player is
  the replay session, which never sends.
- Modes: RUN LOG, the HTML replay and the Spotlights reel all get the
  gear (`PlayerOpenOptions.viewerSettings`, default true). In the reel
  every control makes sense (the overrides also survive the jumps between
  spotlights, which rebuild the App); its chrome starts hidden as before.
- Themes: Paper is readable, with some bright ANSI colours (yellow) weak
  on it, as in the live client. Sepia and Slate were built with ink as
  first briefed; black text on their dark backgrounds was unreadable, so
  the owner changed both to silver (2026-09-28).

## Addendum: Panes and Display popups (2026-11-01, ADR 0114)

The gear and the settings section folded into the box are replaced by two
popups above the box: Panes (switches, Reset layout) and Display (font
size, colour swatches). The chrome no longer auto-hides while one is open.
The reel gets Display (font and colours), still no panes.
