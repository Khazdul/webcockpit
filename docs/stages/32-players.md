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

## Tasks

- [ ] 32a: start menu (Enter MUME, Profile, Scripts, History, Spotlights, Credits, About).
- [ ] 32b: mockups on the canvas, column "Steg 32".
- [ ] 32b: owner picks.
- [ ] 32c: plan, build, test guide.
