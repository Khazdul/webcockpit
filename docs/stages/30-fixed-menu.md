# Stage 30 — Fixed menu

Status: **Next** (design started 2026-10-22, paused by the owner; to be
picked up in the next session).

## Owner request (2026-10-22)

A fixed, always-present menu strip at the right end of the input row (the
area where you type commands to the game). It takes the clock's place
today: right-aligned, left of any right-docked panes. The clock becomes
part of the menu.

Contents, left to right:

    CLOCK | PROFILE | PANES | SETTINGS | MENU | EXIT

- Icons, and a good-looking menu bar that fits the panes' look.
- Discreet: it should not draw attention. Two of the mockups were allowed
  to stand out a little more.
- MENU does what Escape does (opens the pop-up menu).
- What PROFILE, PANES, SETTINGS and EXIT do: not decided yet.
- The aesthetics come first.

Background: stage 29 (`29-pane-buttons.md`, "Later") planned this strip to
show and hide panes. When it exists, Options → Panes → Appearance can go
(ADR 0095).

## Design so far

Five mockups on the owner's design canvas:
https://claude.ai/artifact/Bap2VJPNro2qcKTDrXXmaj (private to the owner).
The source is kept in `notes/research/fixed-menu-mockups/` (README there).

1. **Status line** (discreet): TUI words, `│` separators, inverse cell on
   hover. The widest (about 45 cells).
2. **Ghost icons** (discreet): thin dark-grey stroke icons on black.
3. **Recessed tray** (discreet): a sunken dark tray, engraved separators.
4. **Glass plate** (stands out): the panes' glass rim and engraved ink, a
   plate rising from the bottom edge.
5. **Instrument panel** (stands out): dark bezel, amber clock readout,
   amber icons that glow on hover.

Common to all: they fit in the one-cell input row; groups clock |
profile panes settings | menu exit; Exit turns red on hover; tooltip
"Menu (Esc)". The icons (person, split box, sliders, three bars, power)
are placeholders.

## Open questions for the owner (next session)

- Which direction(s) to take further, or a mix (e.g. 2's icons in 3's tray).
- Always visible, or dimmed until the pointer comes near?
- Icons, or text labels?
- What PROFILE, PANES, SETTINGS and EXIT do.
- Phone: the touch `☰` button (ADR 0075) and the phone layout.

## Tasks

- [x] Five aesthetic mockups (2026-10-22).
- [ ] Owner picks a direction; refine the mockups.
- [ ] Decide the buttons' actions; ADR.
- [ ] Build, test guide, owner test.

## Test guide

Written when the stage is built.
