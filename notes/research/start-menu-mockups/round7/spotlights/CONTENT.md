# Spotlights — content inventory (round 7)

Read from: `src/chrome/frames/spotlights.tsx` (start-page side, `startSpotlights`, the
empty frames), `src/player/spotlight-mode.ts` (the reel in the player), `spotlight-reel.ts`
(loading, positions, navigation), `spotlight-card.ts` + `spotlight.css` (the card and its
filter), `src/player/view.ts` + `player.css` (the player chrome it reuses), `viewer.ts`,
`timeline.ts`, `strip.ts`, `icons.ts`, `src/share/spotlights.ts` (selection, rotation, filter
rules), `src/chrome/popups/spotlights-settings.tsx` (the settings popup), ADR 0019, 0032, 0110,
0114, Inv §7.6, the e2e specs (`spotlights*.spec.ts`, `phone-spotlights.spec.ts`). Today's look:
`../shots/spotlights/today-reel.png`, `today-reel-filter.png`, `today-phone.png` (dev server,
demo backup).

## What a spotlight is

One **event** from a recorded run, replayed from its own log: `char_death`, `level_up`,
`pkill` (PvP kill), `achievement`. Plain mob kills are never spotlights. Every character's
**sealed runs that have a log** count; one spotlight per event (no merging).

- **Window**: `[moment − 10 s, moment + 5 s]` (moment = `logUs ?? us`). The pre-roll is trimmed
  to the first visible line (no silent countdown); the post-roll dwells the full 5 s. A window
  with no visible line is dropped.
- **Rotation order**: per-character queues, newest first; each pick takes the queue whose head
  is most recent, but not the same character twice in a row while another has some left.
- **One reel = one timeline**: spotlight *i* is its cut window; a **blank transition** (100
  zero-time blank lines: the screen "scrolls clear") comes before each one.
- **Label** (bold on the card): pkill `*Name the Race*` (e.g. `*Ibuki the Half-Elf*`), death
  `Death (level N)`, level-up `Reached level N`, achievement `Achievement: <text>`.
- **Kind names / colours / icons**: `PvP kill` orange `#e0915a` crossed swords · `Death` red
  `#e06c6c` skull · `Level up` green `#7fbf7f` double chevrons · `Achievement` gold `#e3b341`
  star.
- **Marker tip** (rail): `Rasta: Killed *Ibuki the Half-Elf*`, `Died (level 42)`,
  `Reached level 42`, `Achievement: …`.
- Only the **game text** shows (every pane off, script panes too, ADR 0032).

## Start-menu flow (`startSpotlights`)

1. Menu → Spotlights (key `L`): flash `Loading spotlights…` while the reel loads.
2. Then one of:
   - **the reel opens** (the player covers the start page; it auto-plays);
   - **no_data** page: title `Spotlights`, centred body *"No spotlights yet. Play a session, and
     your highlights (kills, deaths, level-ups and achievements) will be kept here, ready to
     replay."*, footer `Any key to return` (any non-modifier key or a click pops);
   - **filtered** page (events exist but the settings let none through): body *"No spotlights
     match your settings."*, then a `Settings…` row (Enter / Space / click) that opens the
     **Spotlights settings popup** beside it; footer `Enter Settings · ESC Back`. Esc closes the
     popup first, then the page. When the popup closes **after a change**, it retries: the reel
     opens if something passes now (the page goes, so Esc from the reel returns to the menu);
     it becomes the no_data page if nothing exists at all; else it stays.
   - **errors** (menu flash, fail colour): `Spotlights could not be loaded.`;
     `Spotlights are not available here.` (no player service).
3. A second activation while loading is ignored (`busy`).

## The reel (player in spotlight mode)

**On entry**: auto-plays with the chrome hidden (header, rail, control box); a pointer move or a
key shows it; the **card always stays**. In play the chrome hides 6 s after the last activity
(not while a popup is open). **At the end** it parks paused on the last spotlight (no roll into
Credits). Esc closes the player and the start page shows as it was.

**Header** (top line on dark chips): `Rasta (L42) · SPOTLIGHT 1 / 5 · 2026-09-26` and the hints
`← → Prev/next · Shift ← → 10 s · 1–6 Speed · ESC Back` (ESC Back clickable). *(Hint rows are
banned in the new aesthetic: the hints must go; the info they carry moves into labels/tooltips.)*

**Card** (330 px, top right, under the header; shrinks on a narrow player, hides < 240 px):
- `‹  SPOTLIGHT 2 / 5  ›` — prev/next buttons, disabled at the ends (`Previous spotlight (←)`,
  `Next spotlight (→)`).
- kind icon + kind name in its colour; the label bold (2 lines max); `Rasta · 2026-09-26`.
- **countdown**: a 2 px line draining from both sides to the moment (gone after it).
- **filter** (the Spotlights settings, global, saved at once, the reel rebuilds at once):
  - `Kinds` fold — summary `All` / `None` / `3 of 4`; four switches with kind icons:
    Achievements, Deaths, Level-ups, PvP kills.
  - `Characters` fold — summary `All` / `None` / `Gittan, Rasta`; `All characters` switch, then
    one check per recorded character (alphabetical; dimmed and disabled while All is on; the
    remembered subset comes back when All goes off; if none of it is listed, every listed name is
    checked); `No characters recorded yet.` when none.
  - `Period` native list: All time · Last year · Last 3 months · Last month · Last week (counted
    back from now in local calendar terms).
- **Rebuild rules**: the current spotlight is kept at the same offset if it still passes, else
  the reel starts from the first; paused stays paused; parked-at-end plays again.
- **Nothing passes**: the reel stops; the stage is blank with a top line
  `Spotlights · Nothing to play · ESC Back`; the card stays with its filter and says
  `No spotlights match your settings.` / `Change the kinds, characters or period below.`;
  any change that lets something through brings the reel back.

**Control box** (ghost glass, bottom right; compact on a phone):
To the start (Home) · Back 10 s (Shift+←) · Play / pause (Space) · Forward 10 s (Shift+→) ·
speed `‹ 1× ›` (0.25 · 0.5 · 1 · 2 · 4 · 8×, arrows disabled at the ends) · time `00:05 / 01:06`
(hidden when compact) · Display · Fullscreen (desktop, when the page can) · Close
(`Back to the start page (Esc)`). No Panes button in the reel.

**Display popup** (above the box): Font size Default · Small · Medium · Large; Colours six
swatches Default (recorded) · Dark · Teal · Paper · Sepia · Slate. Kept across rebuilds.

**Rail** (12 px, right edge, whole reel): track, played part, gold playhead; click / drag seeks
with an `MM:SS` hint; one kind-icon **marker per spotlight** at its moment (near ones share a
marker); hover shows the tip, click seeks there.

**Keys**: `←`/`→` previous / next spotlight (`←` restarts the current one if > 1.5 s in;
restarts the first on the first; `→` does nothing on the last) · `Shift+←/→` ±10 s · `Home` to
the start · `Space` play/pause · `1`–`6` speed · pause cursor `↑ ↓ PgUp PgDn End` (and wheel,
click a line; Space resumes from the cursor line) · `Esc` closes a popup first, then the reel.
The card never takes the focus on a press; Tab can reach it, Esc there gives the keys back.

**Phone (390 px)**: the card shrinks to the player width minus the rail (filter still
reachable by tap); the control box goes compact (no time); header shortens its hints; game text
bottom-anchored; touch target of the rail widened.

## States to show in the mockups

| State | URL (every direction) |
|---|---|
| playing, chrome hidden on entry | `?open` |
| paused with chrome and the cursor line | `?open&pause` |
| filter open / a change rebuilds the reel | `?open&filter` |
| nothing passes (in-reel empty stage) | `?open&none` |
| parked at the end | `?open&end` |
| Display popup | `?open&display` |
| filtered start page + Spotlights settings | `?filtered` |
| no data | `?empty` |
| load error (menu flash) | `?error` |

There are **no destructive actions or confirmations** in Spotlights.

## Demo data (mockup)

12 spotlights over five characters, `now` = 2026-11-07 01:30 (as the History mockup):
Gibur (Man warrior, L37–41), Rasta (orc, L74), Taube (Elf mage, L21–22), Gittan (Hobbit,
L15–17), Melker (L3). Text uses MUME's real colours (DOS palette, as the app's Default):
your hits cyan (36), hits on you red (31), room names green (32), tells green (32), narrates
yellow (33), auras magenta (35), command echo steel; real prompt shapes
(`!O HP:Hurt Mana:Warm *Elladan the Elf*:Fine>`, `* HP:Fine R:Wounded>`).

## Mockup files and choices (not in the app today)

`spot.js` / `spot.css` (shared: data, reel engine, screen, track, controls, filter, Display, the
menu → page shell), `spotlights-a.html` (A Biografduken), `spotlights-b.html` (B Galleriet),
`spotlights-c.html` (C Scen och programblad), `index.html` (review page).

- **Hint rows removed**: the header's key hints are gone (rule). Keys live in tooltips and in
  labels: `Filter` (F) and `Display` (D) are labelled glass buttons with the letter marked; B's
  `Play all` (P), A's end card `Play again` (P), C's phone `Programme` (P), A's filtered page
  `Settings…` (S). F/D/P/S are new keys (the reel had none; the replay's F is Fullscreen).
- **The header line** becomes A's title card / B's viewer head / C's title line (kind, label,
  character · level · long date, `Spotlight 3 of 11`). The card's countdown is kept in all three.
- **The rail**: A and B put it horizontally under the text (one kind marker per spotlight,
  ticks between spotlights); C keeps today's vertical rail at the screen's right edge.
- **Auto-hide**: only A keeps it (start hidden, 6 s); B and C keep the controls in the box.
- **Filter**: A a glass drawer; B chips in a row (a name chip while All is on shows only that
  name; the last name off turns All back on); C folds as today's card. Every change rebuilds at
  once with the real keep/restart rules. Count `6 spotlights in the reel` in A's drawer is new.
- **Filtered start page**: A keeps it (a normal box, `Settings…` inline, retries on close); B and
  C merge it into the page (the wall / the empty stage with the settings in view).
- **No data**: A and C a normal box under the full wordmark (any key returns); B the empty wall.
- **End**: A shows an end card (`End of the reel`, `Play again`); B/C park as today (C says
  `End of the reel · 11 of 11`).
- **B starts on the wall**, not playing: the reel plays from a card (Enter / double-click / tap)
  or from the first (`Play all`) and continues through the rest.
- The normal box is placed under the full wordmark's COCKPIT line (`--nb-top`): the base's
  `26vh` touches it at 1280×720.
