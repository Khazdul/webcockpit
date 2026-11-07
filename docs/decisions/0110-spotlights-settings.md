# 0110 — Spotlights settings in the reel

- Status: Accepted; amended by ADR 0114 (the gear gives way to the card's filter)
- Date: 2026-10-31
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S9, "30e build
  plan"), ADR 0019 (Spotlights, Credits, Options → Spotlights), ADR 0021
  (the control box's gear), ADR 0032 (bare reel, no gear), ADR 0107
  (settings popups and the control kit), ADR 0108 (popup focus and Tab)

## Context

Stage 30 moves settings to where they are used. The Spotlights reel and
Credits were filtered by Options → Spotlights, four event kinds on a TUI
page of the start page's Options. The owner (2026-10-31, S9) wants those
settings in the reel itself, behind a gear in its control box, with two
new filters: which characters, and how far back. Credits follows the same
filters. The "filtered" empty pages offer the settings instead of naming
Options → Spotlights, and the Options page goes. This reverses ADR 0032's
"no gear" for the reel, for these settings only.

## Decision

- **Settings:** `SpotlightSettings` (global, not per profile) gains
  `allCharacters: boolean` (default true), `characters: string[]` (the
  checked subset; kept while All is on, so turning All off brings it back)
  and `period: 'all' | 'year' | '3months' | 'month' | 'week'` (default
  `'all'`, `SPOTLIGHT_PERIODS`). The migration fills the defaults
  (additive, no version bump); `characters` keeps non-empty strings,
  without duplicates; an unknown period is `'all'`.
- **Filter** (`src/share/spotlights.ts`, pure): `spotlightFilter(settings,
  nowUs)` is one predicate over kind × character × moment (`logUs ?? us`),
  used by `selectSpotlights` (the reel) and `buildChronicle` (Credits),
  both of which take `now`. `periodStartUs` counts back from now in local
  calendar terms: the same clock time one year, three months or one month
  ago (the day clamped to the target month), seven days for a week. With
  All off only the checked names pass, so a new character counts only
  while All is on.
- **Empty states:** `emptyState(filters, any)` is `no_data` when nothing
  would show with open filters (or the filters are open), else
  `filtered`. The reel's loader and Credits compute `any` from the same
  runs with `OPEN_FILTERS`. The `no_data` pages are unchanged.
- **Characters list:** `RunLibrary.characters()` (sealed runs,
  alphabetical, empty names dropped), read when the popup opens. A checked
  name that is no longer in the runs is not listed; the next change to the
  list writes only listed names, in list order. Turning All off when none
  of the remembered names is listed checks every listed character, so the
  reel does not go empty by surprise.
- **Popup** (`src/chrome/popups/spotlights-settings.tsx`): a `spotlights`
  target in the settings popups' surface, the same `PopupPanel` (ghost
  look, 22 em wide) with Kinds (four toggles), Characters (`All
  characters`, then one `Check` row per character, dimmed and disabled
  while All is on, scrolling past about eight names, ↑↓ between them) and
  Period (a dropdown: All time, Last year, Last 3 months, Last month, Last
  week). The control kit gains `Check` (`role=checkbox`, the whole row one
  button, disabled out of the Tab order). ADR 0107/0108's rules apply: it
  takes the focus on open (the first toggle), Tab and Shift+Tab cycle
  inside, Esc in it, its X or the gear close it, and every change goes to
  the settings store at once.
- **Gear in the reel:** `PlayerViewOptions.gear` (`{ title, onClick }`)
  puts the `⚙` cell where the viewer's gear sits (ADR 0021), titled
  `Spotlights settings`; the viewer settings stay out of the reel (ADR
  0032). The shell hands the reel a `popups` factory that mounts the chrome
  chunk's settings popups in a host beside the player element, not in it,
  so the player's pointer and wheel handlers and its recorded font size
  stay out of the popup; the player chunk only imports their types. The
  popup is placed above the control box, right edges aligned (`placePopup`
  with the box as the bar). `setGearOn` marks the gear while it is open and
  keeps the chrome from auto-hiding. The view leaves keys whose target is
  inside a `data-wc-own-keys` element to it; Esc with the popup open and
  the keys elsewhere closes the popup before the reel (S2). Closing gives
  the keys back to the reel (the focus leaves the popup). The popup and its
  host go when the player closes (`PlayerHost.onDispose`).
- **Rebuild:** the reel subscribes to the store's `spotlights`. A change
  loads the reel again through a `ReelSource` made at open, which reads
  the runs once and each window once (cached by spotlight id), so only new
  windows are read. `PlayerHost.openChain` now disposes the previous
  engine, App and view first, so the reel reopens on the same host. The
  current spotlight is kept at the same offset into it when it still
  passes; otherwise the reel starts from the first. A paused reel stays
  paused; one parked at the end plays from the first. A sequence number
  drops results of changes overtaken by later ones.
- **Empty stage:** a change that leaves nothing stops the reel
  (`PlayerHost.clearChain`) and shows `No spotlights match your settings.`,
  a `Settings…` line (click, Enter or Space toggles the popup) and `ESC
  Back` on the player, a third of the way down, so the popup opens below.
  The popup stays open; the next change that lets something through plays
  again. The stage holds the keys as the view does.
- **Start page:** the filtered Spotlights and Credits pages read `No
  spotlights match your settings.` and `No chronicle entries match your
  settings.`, a third of the way down, with a `Settings…` row (Enter, Space
  or a click) that opens the same popup next to it (`placeNear`: below
  when it fits). The popup is drawn inside the page so the start page's
  focus trap keeps it, and the frame stack leaves keys whose target is
  inside a `data-wc-own-keys` element within the stack to that element (a
  window's own frame is outside its stack, so windows are unchanged).
  `PopupPanel.focusOnOpen` gives it the focus. Footer `Enter Settings · ESC
  Back`; Esc closes the popup first. When the popup closes after a change,
  Spotlights tries again (the reel opens and the page goes, or the page
  stays) and Credits builds the chronicle again with the new filters (it
  rolls, or the page stays). Credits does not rebuild while the popup is
  open, so the page does not vanish under it.
- **Options → Spotlights** is removed from the Options hub (start page and
  ESC menu) on every device, and `options-spotlights.tsx` is deleted: the
  reel's control box, gear and popup work by touch on the phone (a tap
  shows the chrome; checked at 412 and 360 px, `phone-spotlights.spec.ts`).

## Consequences

- The Spotlights settings are where they take effect, and the reel shows a
  change at once.
- The reel and Credits can be narrowed to some characters and a recent
  period; a new character is left out while a subset is chosen.
- A reel rebuilt for new settings reads only windows it has not read; a
  large library still reads every run's events once per open, as before.
- The frame stack and the player view now leave keys inside a popup to
  it, a general rule that later popups in TUI pages or players can use.
- The Spotlights settings can no longer be changed without opening the
  reel or a filtered page; with no recorded spotlight at all there is
  nothing to filter.

## Addendum: the filter in the reel's card (2026-11-01, ADR 0114)

The reel's gear and its popup are replaced by the Spotlights card's filter
(Kinds and Characters fold out, Period is a list; same rules and store).
With nothing to play the card stays with its filter and says so; the empty
stage's `Settings…` is gone. The settings popups lose the `spotlights`
target; the start page's "filtered" pages keep their popup.

## Addendum: Credits without Settings… (2026-11-07, ADR 0132)

Credits no longer opens the settings popup: its filtered state is a page
of the book that points to the filter on the Spotlights page, which sets
the kinds, characters and period for both. Credits reads the filter when
it opens, as before.
