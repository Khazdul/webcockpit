# Stage 32 — Players and the start menu

Status: **In progress** (started 2026-11-01). Owner brief 2026-11-01
(below), after testing run logs and Spotlights.

## Goal

- **32a Start menu.** Options leaves the start page; Scripts moves to the
  main menu, under Profile.
- **32b Mockups.** The run log player and the Spotlights reel redrawn
  out of the TUI look, in the ghost look of the in-game popups (stage 30).
  A few directions on the owner's canvas; the owner picks before
  anything is built.
- **32c Build** the chosen direction (planned after the pick).

## Owner brief (2026-11-01)

Spotlights:

1. Make the player box at the bottom right non-TUI, so it matches the
   settings popup. Improve its look and behaviour: back and forward in
   steps (10 s suggested), besides going back to the start.
2. Make the box at the top right (the spotlight info box) non-TUI too, in
   the same style, and tidy it.
3. An icon for display settings: font size, colours.
4. The reel's settings (kinds, characters, period) no longer live in the
   player box. They sit at the top right, built into the info box. Kinds
   and Characters can fold out, so the box does not take much room.

Run logs:

5. The same for the run log player: redo the player box from the ground
   up, non-TUI and easier to use. For example a panes icon and a settings
   icon in the player box, each opening a menu with the choices.

Both: mockups with a few directions before building. Spotlights and the
run log player alike but not identical (run logs have more choices).

Start menu:

6. Options is no longer needed on the start page; those changes are made
   in the game.
7. Scripts moves out to the main menu, under Profile.

## Starting points

- Player chrome: `src/player/view.ts` (header, right-edge strip, markers,
  control box, viewer settings ADR 0021, the mode gear ADR 0110),
  `src/player/spotlight-box.ts`, `src/player/spotlight-mode.ts`,
  `src/chrome/popups/spotlights-settings.tsx`. The HTML replay
  (`src/replay/page.ts`) uses the same `PlayerView`.
- Look: the in-game popups (`src/chrome/popups/`, `src/menubar/`), the
  stage 30 mockups in `notes/research/fixed-menu-mockups/`.
- Start menu: `src/chrome/frames/start-main.tsx`, `START_MENU_ROWS`
  (`src/chrome/start-layout.ts`, the first paint in `index.html`).

## Decisions *(Claude)*

- **Options on the phone:** only the start page row goes. The phone's
  in-game ESC menu keeps Options (the phone has no menu bar yet), so the
  Options frames stay in the code.
- **The HTML replay** gets the same new player as the in-app run log
  player (it is the same `PlayerView`), without what it cannot do.

## Steps

| Step | Contents |
|---|---|
| 32a | Start menu: Options row removed (all devices), Scripts under Profile; tests, manual and About texts. |
| 32b | Mockups on the owner's canvas: three directions, each with the Spotlights reel and the run log player; clickable menus. Owner picks. |
| 32c | Build the pick (plan written after 32b). |

## Owner pick (2026-11-01)

Direction **A** (compact box at the bottom right, the right-edge rail),
with these changes, drawn as **A2** on the canvas
(`notes/research/player-mockups/`, `Player32A2-*`):

1. Speed has ◄ ► beside it: one click changes it.
2. The header line at the top (character, run or spotlight, date, key
   hints) stays while the chrome shows. No Keys icon.
3. Spotlights: each kind gets its own icon in a fitting colour instead of
   the dot: Death a skull (red), PvP kill crossed swords (orange),
   Achievement a star (gold), Level-up double chevrons (green). The same
   icons replace the letters at the rail.
4. The right-edge strip stays as in the mockup: narrower than today and a
   little more modern, with today's character (gold playhead, markers).
5. The exported HTML replays get the same new look.

## 32c plan

Decisions *(Claude)*, recorded in a new ADR (amending ADRs 0018, 0021,
0110):

- **Control box:** plain DOM in the ghost look of the in-game popups, one
  row: To the start, −10 s, Play/Pause, +10 s, speed `◄ 1× ►`, time,
  then Panes (run log), Display, Close (Esc). Panes and Display open
  popups above the box: Panes = pane toggles and Reset layout; Display =
  font size (Default, Small, Medium, Large) and colours (the six viewer
  themes). They replace today's folded TUI settings section.
- **Header:** kept as the top line, restyled lightly (text on a dark
  chip, as A2); hints gain the 10 s keys.
- **Rail:** replaces the 2-column strip: a thin track, the played part,
  the gold playhead; click and drag seek as today, with the time hint.
  Markers are the kind icons left of it, tooltips as today; a marker with
  several kinds shows several icons.
- **Spotlights card:** replaces the TUI info box and the gear popup:
  `‹ Spotlight n / N ›`, the kind icon and name in its colour, the label,
  character and date, the countdown as a thin line; under it the filter:
  Kinds and Characters fold out, Period is a list. Changes rebuild the
  reel live as ADR 0110. With nothing to show, the card stays with its
  filter and says so.
- **Keys:** run log ← → 10 s; Spotlights ← → previous/next (as today),
  Shift+← → 10 s; Home to the start; 1–6 speed as today.
- **HTML replay:** the same chrome; it stays one self-contained file.
- **Touch and narrow windows:** every control works by touch; the card
  hides when the player is too narrow, as today.

## Tasks

- [x] 32a: start menu (Enter MUME, Profile, Scripts, History, Spotlights,
  Credits, About) on every device (bbb79a6, 532b8a1, dc025e1). Texts
  (About, `#help`, manual, README, spec §2.3/§2.5/§2.10, bundled script
  help) point to the in-game Settings. The TUI Options frames are
  tested through the phone's ESC menu (`tests/e2e/esc-options.ts`).
  Unit 3045 passed; e2e 667/667.
- [x] 32b: mockups on the canvas, column "Steg 32": directions A (compact box,
  right-edge rail), B (timeline in the box), C (full-width bottom bar);
  source and table in `notes/research/player-mockups/` (2026-11-01).
- [x] 32b: owner picks A with changes (2026-11-01); revised as A2 on the
  canvas (`Player32A2-*`).
- [ ] 32c: build (plan below).
- [ ] 32c: test guide, owner test.

## Test guide 32a (start menu)

1. Open the start page: the menu reads Enter MUME, Profile, Scripts,
   History, Spotlights, Credits, About. No Options.
2. Choose Scripts: the scripts page opens; ESC goes back with the cursor
   on Scripts.
3. About → Getting started: it points to the menu bar's Panes and
   Settings (and ☰ on a phone), not to Options.
4. On a phone: same menu; in the game, ☰ → Options still works.

Feedback wanted: is anything you used to set from the start page now
hard to find?
