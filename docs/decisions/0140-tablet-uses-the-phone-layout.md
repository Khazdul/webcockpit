# 0140 — A tablet uses the phone's layout

- Status: Accepted (owner, 2026-11-12: "the tablet keeps the phone's
  layout as it is, with minor improvements only"). Built in stage 54,
  round 54a. Not yet tried by the owner as built; not yet released.
- Date: 2026-11-12
- Related: amends ADR 0075 §1 (the device flags), ADR 0136 §1 (the
  game layout's gating: "desktop and tablet are not touched"), ADR
  0138 §1 and §4 (the keyboard's scope and sizes) and ADR 0139 §1
  ("desktop and tablet do not change"). Trial notes:
  `notes/research/tablet/trial.md`. Shelved mockups:
  `notes/research/tablet/README.md`, `round1/`, `round2/`. Stage:
  `docs/stages/54-tablet.md`.

## Context

A tablet was "touch, not phone" (ADR 0075: a touch device whose screen's
short side is 600 CSS px or more). It got the desktop cockpit and the
device's keyboard. On the owner's iPad (10th generation, 820 × 1180 CSS
px, no physical keyboard) that is poor: in portrait the game text gets
31 columns, and iPadOS's keyboard covers about half of a landscape
screen and has been hard to control.

Stage 54 set out to design a layout of the tablet's own, between the
phone's and the desktop's. Two things were done side by side:

- **Mockups**, two rounds (A "panes always in view", refined in round 2
  to one frame with draggable dividers).
- **A trial**: the phone's game layout (ADR 0136, 0137) and our own
  keyboard (ADR 0138, 0139), unchanged, on a tablet-size window behind a
  development flag, `?tablet=phone`. Nothing size-gated stood in the
  way; every state ran with the flag alone.

The owner tried the trial on the iPad and decided, the same day: the
mockups are not moving in the right direction, and the phone's layout
as it is feels very good on the iPad. **The tablet keeps the phone's
layout, with minor improvements only.** What chafed: our keyboard is too
narrow there (the key block kept its phone width, about 475 of 820 px),
and fullscreen is unreliable (not part of this ADR; investigated in
`notes/research/tablet/ipad-fullscreen.md`). The mockups are shelved,
not built.

## Decision

### 1. A tablet is a third device flag

`src/core/device.ts` decides three flags once at startup:

- `touch`: as before.
- `tablet`: a touch device, **as the browser reports it** (the coarse
  primary pointer, or the Samsung Internet fallback of ADR 0086), whose
  screen's short side is 600 CSS px or more.
- `phone`: a touch device with a short side under 600, **or a tablet**.

"Phone" in the code is the phone's code paths, CSS (`html.wc-phone`),
layout and keyboard. A tablet uses all of them, so `tablet` implies
`phone` and no reader of `device().phone` had to change. Only two
places read `tablet`:

- `phoneGameWanted` (`src/app/shell.ts`): the phone's game layout, and
  with it our keyboard in the game and on the menu pages, is used on a
  tablet **whatever the window's size**. With the phone flag alone it
  still needs a phone-size window (short side under 600).
- The phone's one-time defaults (§3).

No `wc-tablet` class and no tablet CSS: there is nothing tablet-only to
style. The keyboard's sizes follow the window, not the flag (§4).

What does not change:

- A desktop, including a laptop with a touch screen and a touchpad (its
  primary pointer is fine, so it is not touch).
- A phone.
- `?touch=1` on a desktop: the desktop cockpit with touch behaviours.
  A forced flag does not make a tablet.
- `?phone=1` on a desktop-size window: the old phone layout (ADR 0075),
  which the desktop e2e projects' specs open.

Any touch-first device with a large screen is a tablet by this rule,
for instance a Windows tablet without a keyboard attached. It gets the
phone's layout too; §2 is its way back.

### 2. Flags

- `?tablet=desktop`: a tablet is treated as before this ADR: touch
  only, the desktop cockpit, the device's keyboard. No effect on a
  phone or a desktop. Read at startup, so it must be in the address of
  every load (a bookmark). There is no setting for it.
- `?tablet=phone`: forces `tablet` (and so `phone` and `touch`) on any
  device. It was the trial's flag and stays, for tests and for looking
  at the tablet on a desktop.

### 3. Stored settings are kept as they are

The settings store takes the phone's defaults (`phoneDefaultSettings()`:
text size 14, the phone's panes, weather off) only when nothing is
stored. So:

- **A tablet with no stored settings** starts from the phone's defaults,
  as a new phone does.
- **A tablet that has used WebCockpit before** has the desktop cockpit's
  settings stored. They are kept, all of them: its text size (the
  desktop default is larger than 14), theme, timers and so on now apply
  in the phone's layout. Nothing is rewritten.
- The phone's **one-time defaults** (stage 52: Herblores timers off, the
  Timers pane's time text off, Character out of the strip), which the
  phone's game layout applies once to stored settings older than its
  mark, are **not applied on a tablet** (`phoneDefaultsAtStart`,
  `src/phone/phone-defaults.ts`). On a tablet, settings below the mark
  can only be the desktop cockpit's, and writing three of them over
  would also change what `?tablet=desktop` shows. The phone layer is
  told through a `tablet` dep, since its chunk imports nothing of the
  app.
- **Stored settings are read as a desktop's** (fixed 2026-11-13, review
  of round 54c). As first built, a stored record with no weather choice
  in it (written before the weather effects existed and never saved
  since) was read with the phone's rule (ADR 0092: weather off), so the
  weather went off on such a tablet. The settings store now gets the
  tablet flag and reads what is stored as a desktop does; only its
  defaults for a device with nothing stored are the phone's.
- To get the phone's defaults on such a tablet: clear the site's data
  (or use a private tab to look). There is no "reset everything" in
  the phone's settings page; the text size has its own control in the
  menu sheet. Settings the tablet stores are shared with
  `?tablet=desktop` on the same device.

### 4. The keyboard uses a tablet's width

`src/phone/keyboard-model.ts` stays pure. A **tablet-size window** is
one whose short side is 600 px or more (`okbTabletSize`), judged from
the window's size at each layout, not from the device flag: a tablet's
window made narrow (Split View) gets the phone's sizes, and the phone's
sizes at a phone's sizes are untouched. Every sizing function takes
`tablet` (default false).

| | Phone-size window | Tablet-size window |
| --- | --- | --- |
| Letter key, widest | 48 px portrait, 46 px landscape | 72 px, both |
| Row height | 38–46 px portrait (30 % of the height / 4), 30–36 px landscape | 48–56 px, both (30 % of the height / 4) |
| Portrait block | full width | full width less 12 px at each side |
| Landscape block | between the hot key columns and the compass | the same |
| Page keyboard's side columns (landscape) | 52 px | 72 px |
| Key faces | 19 px letters, 12 px labels, 20 px icons | 25 px, 15 px, 26 px (`data-tablet` on the keyboard) |

At 820 × 1180 with the Swedish layout the block is 796 px wide: eleven
letter keys of exactly 72 px. English has ten keys at the cap (724 px,
centred). At 1180 × 820 the block is 796 px too (the band has room for
82 px keys; the cap holds). The model asks for rows of 56 px at both
sizes; the game layout's allocator then keeps whole rows of game text
free, so the rows on screen are 53 to 56 px. Landscape's low rows (36
px) came from a 360 px high phone and are not used on a tablet-size
window. The keyboard takes about 19 % of the height in portrait and
27 % in landscape (33 % with the digit row).

The page keyboard (ADR 0139) reads the same rule from the page's size,
so the menu pages get the same keys.

Nothing else is resized: the compass (36 / 44 px keys), the hot keys,
the lens, the strip, Comm, the menu sheet and the settings page are the
phone's (the owner: it feels very good as it is).

### 5. The phone chunk rule holds

ADR 0136's rule: the desktop's first load does not grow. The gate is a
few lines in `device.ts` and `shell.ts`, which the desktop already
loads; everything else is in the phone chunk. Measured on a production
build before and after: the same 98 files, the first load's scripts
7 bytes larger in all; the phone chunk 0.6 kB larger and its CSS 0.5 kB.

## Consequences

- An iPad gets the phone's layout and our keyboard with no flag. The
  desktop cockpit on a tablet remains only behind `?tablet=desktop`.
- Wherever older ADRs and `spec.md` say "desktop and tablet", it now
  holds for a tablet only behind `?tablet=desktop`; what they say of
  "the phone" holds for a tablet too.
- A tablet with a physical keyboard attached still gets our on-screen
  keyboard; nothing detects the hardware keyboard (it types into the
  fields as a desktop's does). Not looked at.
- The menu pages on a tablet are drawn in their desktop-width
  arrangement (the 600 px rules do not match) with the phone flag's
  behaviours on top. The trial looked at the start page and two
  dialogs; the editors, History, Export and Spotlights at tablet width
  are a combination nobody designed for.
- The flags are decided once, from the screen. A tablet keeps the
  phone's layout in a narrow split window (the keyboard then has the
  phone's sizes).
- In the `phone` e2e project a wide window is a tablet (a touch
  browser). Its cases of the old phone layout and of the desktop
  cockpit with touch now say `tablet=desktop`.
- Stage 52 passes C–E (scrapping the old phone layout) can go on: the
  tablet reuses the game layout whole, and the old layout is still what
  `?phone=1` gives on a desktop.
- `notes/research/tablet/trial-shots/` shows the trial (the narrow
  keyboard); `docs/stages/img/54-a-*.png` shows this ADR as built.

## To verify on the iPad

Everything here was seen in Chromium's emulation only (no WebKit on the
build machine):

- That iPadOS Safari is found as touch with a short side of 600 or
  more when it asks for the desktop site (its default): the flags do
  not read the user agent, but `(pointer: coarse) and (hover: none)`
  and `screen` must answer as expected. The trial flag forced this.
- The key sizes under the hand, in both orientations; whether 72 × 56
  is right, and the rows in landscape with Safari's bars (the window is
  lower than 820 px there: about 54 px rows).
- What a stored desktop text size looks like in the phone's layout.

## Addendum, 2026-11-16: the keyboard's band in landscape on a tablet

Amends §4 ("Landscape block: between the hot key columns and the
compass" and "Nothing else is resized: the compass") for a tablet-size
window in landscape only. The owner: move the K keys up beside the
command field, furthest right and filling leftwards; make the compass
fill the keyboard's height; let the keys use the width that is left, and
keep them good to type on.

- **Where it applies:** our keyboard open in the game layout, the layout
  in landscape, and the window tablet-size (`okbTabletSize`, short side
  600 px or more; the same window rule as §4, not the device flag). A
  phone in either shape and a tablet in portrait are unchanged; so is a
  tablet's window made narrow (Split View), which gets the phone's band.
  The page keyboard (ADR 0139) is unchanged.
- **The hot keys** leave the band and stand in **one row at the right end
  of the command row**, 8 px from the edge, centred on the row's height,
  at their usual size (44 px). The order mirrors their columns upright:
  K1 rightmost, against the edge, the higher numbers leftwards (K3 K2 K1,
  and K6 … K1 with six), so adding keys never moves the ones a thumb has
  learned, and an empty first column keeps its place as it does upright.
  The command field ends 8 px left of the row (`--wc-okb-krow-w`); with
  the keys hidden by the K key it takes the row's full width.
- **The compass** stands at the far right of the band and is as high as
  it: three square keys `floor((band − 8 − 2 × 3) / 3)` px (some 70 px
  with four rows, about 90 with the digit row up), centred in the band's
  height, so its top lines up with the key caps'. Its letters, the eye
  and the K ring grow with it (`--okb-pad-ck`; the hot keys keep
  `--ph-ck`). It follows the band: the digit row makes it larger. On a
  narrower tablet it gives way first: it is never so large that the
  letter keys get narrower than a tablet's 72 px (down to 44 px keys,
  `OKB_TABLET_PAD_MIN`), and is then centred in the band's height.
- **The block** takes the room left of the compass (8 px margin at the
  left edge, 12 px before the compass), its letter keys at most **84 px**
  (`OKB_UNIT_MAX_TABLET_LAND`; 72 elsewhere on a tablet), centred in that
  room when the cap leaves some over. Rows are as before (48–56 px).
  Measured: 1180 × 820, 84 px keys with the digit row folded, about 79
  with it up (72 before); 1366 × 1024, 84 px and the block centred with
  some 90 px at each side; 1024 × 768 (Swedish), 72 px with a compass of
  64 px keys (English has the room for the full-height compass). The digit row changes the compass's size
  and with it the keys' width, in the one relayout it already causes.
- **The hot key box** with our keyboard typing in it stands above the
  command row (not over its end, where the keys now are), at the right
  edge, without its notch.
- **Fallback:** where the keys would get narrower than 36 px (no
  tablet-size window does) the band is laid out as before (`okbBand`).

Pure parts in `src/phone/keyboard-model.ts` (`okbTabletBand`,
unit-tested); the layer sets `data-okb="row"` and phone.css lays it out.
To verify on the iPad: the 84 px keys and the large compass under the
hand; whether the compass's growth with the digit row (and the keys'
narrowing) is welcome or should stay at the four-row size; the hot keys'
reach at the command row's end.
