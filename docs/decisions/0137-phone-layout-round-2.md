# 0137 — The phone's layout, round 2

- Status: Accepted (decisions by the owner, 2026-11-11; built in stage 52)
- Date: 2026-11-11
- Related: amends ADR 0136 (the phone's layout in the game). Where the
  two differ, this one is what the code does. Details per round:
  `docs/stages/52-phone-round-2.md`.

## Context

The owner used 0.5.0 on a Samsung S21 (360 × 800 CSS px) and came back
with a list of changes and answers to the questions ADR 0136 left open.

## Decision

Everything here is the phone's game layout only. Desktop, tablet, the
run log player and the old phone layout do not change.

### 1. Landscape has its own arrangement (replaces 0136 §1 "no special arrangement")

- The pane strip and Comm open from the **left** as one column: the
  strip above, Comm below, over the whole height including the command
  row's rows. The game text, the fight card, the menu key and the
  command field use what is right of it.
- The column is resized sideways by a band at its right edge
  (`phone.sideCols`; default 40 % of the columns, at least 24, and the
  game keeps 40 columns). One open takes all rows; both open gives the
  strip about 40 %. The portrait heights are neither used nor changed.
- The lens stands at the top right, **left of the K columns**, with its
  three keys, and keeps that place when K hides the keys.
- In landscape Comm has a hood reading COMM, and an iron divider lies
  between the strip and Comm. Portrait has neither.
- Landscape is a window wider than tall whose screen does not say
  portrait (`screen.orientation`), decided only while the keyboard is
  down. The screen can veto landscape, never grant it (a phone flag in a
  narrow window on a landscape monitor stays portrait).

### 2. Portrait: resize, limit, lens (amends 0136 §4–§6)

- The pane strip is resized by a band at its lower edge
  (`phone.stripRows`), as Comm is.
- All bands relayout **while dragging** (at most once per frame, per
  whole row or column). The window size goes to MUME once, on release.
  While one band is dragged the other part keeps the height it shows.
- The strip, the fight card and Comm together end at or above the top of
  the place of **three K keys**, whether the keys are shown or not. When
  the room shrinks Comm gives way first, then the strip; if the
  minimums do not fit the strip closes first. Stored heights are not
  changed by this.
- **The lens is dynamic.** Full size is `round(short side × 150 / 360)`,
  clamped to 130–190 px. Opening Comm no longer hides it: it sits under
  whatever is above it and shrinks in whole cells down to 96 px; below
  that it hides and its keys stand as a row. The zoom follows the size.
  The size setting (`phone.lens.size`) is gone.

### 3. Quick buttons (amends 0136 §7, §8)

- The settings group is called **Quick buttons**.
- **1–6 K keys** (`phone.hotkeyCount`, default 3; six stored slots). Keys
  4–6 form a second column left of the first, K4 lowest. Defaults for
  the new slots: `rescue`, `shoot`, `recover`.
- **Several commands on one key:** a line with `;` is sent as typed and
  the engine splits it. This replaces "one command per key"; following
  MUME's rules on automation stays the player's responsibility.
- **See-through keys:** compass and hot keys have a 12 % veil, a thin
  ring and labels with their own outline in the page colour, made from
  `text-shadow` only (old Chromium paints a text stroke over the glyph);
  solid when pressed. No `backdrop-filter`.
- **Fixed sizes:** 36 px in portrait, 44 px in landscape when the height
  holds three K keys and the smallest lens (300 px and up), else 36 px.
  The key size setting (`phone.compassSize`) is gone.
- **Vibration is removed** (`phone.vibrate`, `haptics.ts`).
  (Superseded by ADR 0138 §7: it is back as a setting, off by default.)
- The wimpy specials still never send 0 (`change wimpy 0` is wimpy off,
  confirmed by the owner).

### 4. Menu and settings (amends 0136 §10)

- The sheet has no grip (it is not draggable) and a close key left of
  Exit session.
- Exit session's confirmation, with the run's rating, is a sheet in the
  phone's look. The old frame stays for the old phone layout.
- A sub-page **Timers and Group** under Panes writes the same keys as
  the desktop gears (no colours).
- **Phone defaults, applied once** to a phone that has stored settings
  (mark `phone.defaults`; never in safe mode): Herblores off, Character
  off in the strip, timer time text off and the timer signal Pulse (the
  signal "Time text" shows nothing without the text; a signal the user
  chose is kept). New phones start that way.
  Desktop defaults are unchanged. Known and accepted: a forced
  `?phone=1` in a phone-size desktop window applies the patch to that
  browser's settings too.

### 5. Keyboard

- A focused field of the phone layer is **blurred when the on-screen
  keyboard goes down**, so no later tap can raise the keyboard again
  (Android keeps the focus when the keyboard is dismissed). Not on a
  rotation or a fullscreen change.
- **Fullscreen:** the viewport is measured again on a fullscreen change,
  and in fullscreen, where the VirtualKeyboard API exists, the keyboard's
  own rectangle decides where the visible area ends
  (`overlaysContent` only in fullscreen). The cause on the owner's phone
  is a hypothesis (Chrome's visual viewport too tall by the navigation
  bar in immersive mode); `?vv=1` shows the measured numbers.

### 6. Left as they are

The theme swatch (0136 open question), a script's map mark with focus
overriding the lens's zoom, no fullscreen map. Scrapping the old phone
layout is a later pass.

## Settings keys

Added under `phone`: `hotkeyCount`, `stripRows`, `sideCols`, `defaults`;
`hotkeys` holds six. Removed (dropped by migrate): `vibrate`,
`lens.size`, `compassSize`. No settings version bump.

## To verify on a device

- The command field above the keyboard in fullscreen (S21).
- That no key raises the keyboard after it was folded down.
- Whether the lens's size change shows a hitch during a live drag (seen
  in headless Chromium, 0.3–0.65 s, from the map worker's zoom change);
  if so the zoom is sent on release only.
- The landscape layout outside fullscreen (about 280 px high on a
  360 px phone): tested at 800 × 280 and 800 × 270 in emulation only.

## Addendum: the keyboard rectangle is taken out (0.6.1, 2026-11-11)

On the owner's S21, 0.6.0 in fullscreen and portrait collapsed the whole
layout to a strip at the top when the keyboard came up (landscape and
the page outside fullscreen were right). §5's second point is withdrawn:
`overlaysContent` is never set and the VirtualKeyboard rectangle is not
used; the visual viewport alone decides, in fullscreen too. The
re-measure on a fullscreen change stays. Known again: in fullscreen the
keyboard's top row may cover the command field by about 44 px, as in
0.5.0. Not worked on further: stage 53 (ADR 0138) replaces the device's
keyboard in the game layout. Also found in that test and left for stage
53: in landscape, after something was sent with the keyboard up, every
hot key raises the keyboard again.

## Addendum: Comm's hood in portrait too (stage 53, round 53i, 2026-11-12)

§1 said "In landscape Comm has a hood reading COMM … Portrait has
neither." The owner asked for the header text in portrait as well (his
S21). Comm now has the same hood there, on rows of its own as the
strip's; on a screen where its content would keep less than 104 px
under it, the hood is left out. No divider in portrait. Details: ADR
0139, "as built in round 53i".

## Addendum: hoods take no row on a phone (stage 53, round 53j, 2026-11-12)

The owner, on his S21 after 53i: "the headers of Comm and of the other
pane take a whole row each: there is no room for that." This replaces
§1's "In landscape Comm has a hood reading COMM, and an iron divider
lies between the strip and Comm" and the addendum above ("Comm's hood
in portrait too").

- **No pane has a hood on a row of its own**, in either orientation.
  The strip's pane and Comm have every row of their parts but the resize
  band's (`phonePaneRect`, `BAND_ROWS`); `phoneCommHead`, the hood's
  constants and the 6 px divider's rows are gone.
- **The names live on the drag frames**, on a small plate cast in one
  piece with the band (`ResizeBand.plates`): the band's iron and its lit
  edge run on over the plate, a dark hairline outlines the rest, a
  recessed rivet sits each side of the name (the desktop hood of ADR
  0123, scaled down), and the band's lit grip marks stand on both sides
  of it. Cinzel Bold capitals in the lamp's colour (brass on pewter in
  Paper), 9 px, at least 4.5 : 1. The strip's plate shows its open
  page's name and changes with the page.
- **Portrait:** the plate is in the band's middle, from the band's top
  edge to 3 px under its lower one (at least 15 px high, so a little
  more under a band lower than that, at a very small text size). The
  3 px float over what is under the band: the fight card's free middle,
  Comm's top air, or the top of a game line's cell, which the letters do
  not reach. The middle, not an end: the page dots keep the right end,
  and under the right end stand the lens's keys. The plate takes no
  press: the grip under it does, so the band is dragged from its name.
- **Landscape:** both names are on the column's one band, written along
  it (read from below, the letters' heads towards the pane), each plate
  centred on its own pane's stretch of the band and reaching 4 px out of
  the band into that pane. Where the strip ends and Comm begins the band
  has a lit joint, and an iron hairline runs from it across the column
  (the divider, on no row). The strip's page dots follow its name on the
  band, in the place of the second grip mark; a stretch under 120 px
  (the column above our keyboard) shows the name only, cut with an
  ellipsis if it must be.
- **The variant not built**, kept as a picture for the owner
  (`53-j-plates-land-alternative-not-built.png`): the names level, on
  flags that stick out of the band over each pane's upper right corner.
  Easier to read, but it lies on content (Comm's search key, a timer's
  time), which the built one never does.
- `STRIP_MIN_ROWS` stays 4: now three rows of pane and the band.

Details of the same round's other three points (the hot key box hiding
panes for the keyboard, the kept line, the fields' text size): ADR 0138,
"as built in round 53j".
