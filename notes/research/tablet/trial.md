# Tablet trial: the phone layout on an iPad-size screen

Stage 54, a look-see before the tablet stage is designed. The phone's game
layout (ADR 0136/0137) with our own keyboard (ADR 0138/0139) runs
**unchanged** on a tablet-size screen behind a development trial flag.
Nothing was tuned for tablets. This note says how to open it and what was
seen. Not an ADR, not a decision.

**Afterwards (2026-11-12):** the owner chose this layout for the tablet
(ADR 0140). A tablet now gets it with no flag, the keyboard was widened
for tablet-size windows, and "today's tablet" below is behind
`?tablet=desktop` (on a touch device `?touch=1` no longer gives it). The
script became `scripts/tablet-shots.ts` and now writes
`docs/stages/img/54-a-*.png`; the pictures in `trial-shots/` are the
trial as it was and are not remade. The rest of this note is unchanged.

## How to open it

Dev server (`npm run dev`, or `npm run dev:tailnet` for the iPad), then:

| What | Query |
| --- | --- |
| The trial, live (start page, Enter MUME) | `/?tablet=phone` |
| The trial, the demo log replayed offline | `/?fixture=gmcp-demo.log&speed=0&tablet=phone` |
| The trial, the offline cockpit (empty) | `/?replay&tablet=phone` |
| Today's tablet, for comparison | no flag on the iPad; `/?fixture=gmcp-demo.log&speed=0&touch=1` on a desktop |

`?tablet=phone` forces the phone flag (as `?phone=1`) and makes the shell
use the phone game layout whatever the window's size. `?phone=1` alone is
unchanged: on a window with a short side of 600 px or more it still gives
the old phone layout. Without the flag nothing differs. The flag works in a
production build too (it is not dev-only), but is not meant to be told to
users.

The flag is read once at start-up: it must be in the URL of every load (a
bookmark, or a home-screen icon made from that URL).

Settings caveat (inferred from `src/settings/store.ts`, not tried on a
device): the phone's defaults (text size 14, the phone's panes) apply only
to an install with no stored settings. An iPad that has already run
WebCockpit as a desktop keeps its stored settings (text size and so on) in
the trial. Open the trial in a private tab, or clear the site's data, to
see what the screenshots show.

## How the pictures were made

`node scripts/tablet-trial-shots.ts` (Chromium, 820 × 1180 and 1180 × 820
CSS px, device scale 2, mobile and touch emulation, an empty browser
profile, the fixtures `map-demo.log` + `gmcp-demo.log`). WebKit is not
installed on this machine, so **nothing here was seen in Safari**. The
pictures and `measures.json` (the px boxes read from the DOM) are in
`trial-shots/`.

| State | Portrait | Landscape |
| --- | --- | --- |
| Game at rest | `rest-portrait.png` | `rest-landscape.png` |
| Keyboard up (command field tapped, "kill orc" typed) | `keyboard-portrait.png` | `keyboard-landscape.png` |
| Pane strip open, Timers (empty in the fixture) | `strip-portrait.png` | `strip-landscape.png` |
| Pane strip, Group page (after a swipe) | `strip-group-portrait.png` | `strip-group-landscape.png` |
| Comm open on a chat (mocked connection, a fight) | `comm-portrait.png` | `comm-landscape.png` |
| Comm with our keyboard on its reply line | `comm-keyboard-portrait.png` | `comm-keyboard-landscape.png` |
| Menu sheet | `menu-portrait.png` | `menu-landscape.png` |
| Settings page (from the sheet) | `settings-portrait.png` | `settings-landscape.png` |
| Start page | `start-portrait.png` | `start-landscape.png` |
| Start → Profile → Rename, page keyboard up | `start-profile-keyboard-portrait.png` | `start-profile-keyboard-landscape.png` |
| Start → Scripts → New, page keyboard up | `start-script-keyboard-portrait.png` | `start-script-keyboard-landscape.png` |
| Today's tablet (`?touch=1`, desktop cockpit) at rest | `today-rest-portrait.png` | `today-rest-landscape.png` |

## Was any size-gated code in the way?

No. Every state above ran with the flag alone; no change beyond the flag
was needed. What was looked for:

- `src/app/shell.ts` `phoneSizeWindow` (short side < 600): the one gate,
  now passed by the flag (`phoneGameWanted`).
- `src/core/device.ts` `PHONE_MAX_SHORT_SIDE`: the phone flag itself,
  forced by the flag.
- Portrait or landscape (`landscapeLayout`, `src/layout/phone-viewport.ts`):
  from the window's shape and `screen.orientation`, no size limit. 1180 × 820
  gets the landscape arrangement of ADR 0137 (side column, large keys).
- Compass key size (`src/phone/compass-size.ts`): 36 px in portrait, 44 px
  in landscape where the height holds them; no upper size, nothing scales
  with the screen.
- Lens (`fitLens`, the allocator): only lower limits. The default lens is
  190 px whatever the screen.
- `src/phone/phone.css` media queries: `max-height: 480px` and
  `max-height: 640px` only. They compact pages under the page keyboard on a
  low screen (a phone on its side). A tablet never matches them, so it
  gets the roomy variants. Nothing breaks.
- Other `max-width: 600px` rules (look kit, spotlights, history dialogs,
  manual, code look) are the narrow-phone variants of the menu pages. A
  tablet is wider, so the menu pages are drawn as on a desktop, with the
  phone flag's behaviours on top (see below).

## Sizes (CSS px, from `measures.json`)

| Part | Portrait 820 × 1180 | Landscape 1180 × 820 |
| --- | --- | --- |
| Text cell (Hack, text size 14) | 8 × 14 | 8 × 14 |
| Text area | 102 columns × 80 rows (816 px wide) | 147 columns × 54 rows (1176 px wide) |
| Text area, strip or Comm open | 102 columns, fewer rows | 88 columns (704 px), the column takes 59 (472 px) |
| Lens | 190 px circle, top right | 190 px circle, top right |
| Lens satellites (panes, fullscreen, Comm) | 40 px | 40 px |
| Compass | 114 × 114, keys 36 | 138 × 138, keys 44 |
| Hot keys | 36 px, one column above the compass | 44 px, one column above the compass |
| Menu button | 44 × 44 | 44 × 44 |
| Command field | 600 px wide (x 73 to 673) | 936 px wide; 1082 px with the keyboard up |
| Keyboard, game | 186 px high (16 % of the height) | 148 px high (18 %) |
| Keyboard, menu pages (with the Esc/Tab/arrows row) | 234 px high | 148 px high (page keys beside the block) |
| Letter key | 48 × 45 | 46 × 36 |
| Space | 168 × 45 | 161 × 36 |
| Key block | about 475 px wide, centred (58 % of the width) | about 455 px wide, centred (39 %) |
| Pane strip | 238 px high (17 rows), full width | the side column, 472 × 812 |
| Comm | 476 px high (34 rows), full width; 392 with keyboard | the side column, 472 × 812; 672 high with keyboard |
| Menu sheet | 458 px high, full width | 458 px high, full width |
| Today's tablet: text cell | 10 × 18 | 10 × 18 |
| Today's tablet: text area | 31 columns (310 px) | 67 columns (670 px) |

## Observations

"Seen" is what the screenshots show. "Inferred" is reasoning from the code
or the numbers and has not been watched happening.

### Game at rest

- Seen, both: the layout is whole. Text, lens, compass, hot keys, menu
  button and command field are all there and nothing overlaps or is cut.
- Seen, both: everything keeps its phone size, so on this screen the
  controls are small islands in the corners. Compass (114 or 138 px) and
  lens (190 px) are the same px as on a phone while the screen is twice as
  wide.
- Seen, portrait: 102 columns × 80 rows of text. MUME's lines are mostly
  under 80 columns, so the right fifth of the text area is empty apart from
  the lens and the keys. A very long stretch of small text (14 px rows) to
  read on a 10.9" screen; whether 14 is the right text size at tablet
  viewing distance must be judged on the device.
- Seen, landscape: 147 columns. More than half of the width right of the
  text is black. This is the most wasteful state.
- Inferred: the compass and hot keys sit in the bottom right corner, made
  for a thumb of the hand that holds a phone. On an iPad held in two hands
  the right thumb reaches it in landscape, hardly in portrait without
  shifting the grip; on a table it is a finger's work. 36 px keys are small
  for that.

### Keyboard up (game)

- Seen, both: it works. The command field, compass and hot keys rise above
  the keyboard (portrait) or stand beside it (landscape: hot keys left of
  the block, compass right), the text reflows, the lens stays.
- Seen, both: the key block keeps its phone width (about 475 and 455 px)
  and is centred, with empty bands on both sides (about 170 px each in
  portrait; in landscape about 255 px left of the hot keys and 265 px
  between the block and the compass). The keys (48 × 45, 46 × 36) are
  phone-size: fine for one thumb or one finger, far apart from the hands'
  natural places for two-thumb typing on a tablet, and too narrow for ten
  fingers. iPadOS's own keyboard is about twice as wide.
- Seen, both: the keyboard takes only 16 to 18 % of the height, so a lot of
  text stays visible (67 rows in portrait, 44 in landscape). That is a real
  gain over the device keyboard.
- Inferred: in landscape the keyboard rows drop to 36 px because the
  landscape rule was made for a 360 px high phone. On an 820 px high screen
  there is no need for the low rows.

### Pane strip

- Seen, portrait: the strip is 238 px high across the full 816 px. Group
  shows its four members in full-width rows with three very long bars
  each, and most of the strip's area is empty (Timers with nothing running
  is an empty band). The lens moves down under it.
- Seen, landscape: the strip is the left column, 472 px wide and the full
  height. Four group rows at the top, the rest (about 620 px) empty. The
  text keeps 88 columns, which is still enough for MUME.
- Seen, both: one pane at a time, by swipe, with page dots. On this screen
  there is room for several panes at once (today's tablet shows map,
  Timers, Group and Comm together); the one-at-a-time strip is the phone's
  compromise and looks it.

### Comm

- Seen, portrait: Comm takes 476 px at the top, full width; the chat's
  lines use the left half, the reply line is 786 px wide. The fight card
  stands under it, then the text with the lens pushed down to the middle
  of the screen (y 535).
- Seen, landscape: Comm is the left column (472 px), the chat at its foot,
  about 560 px of empty column above it. Works as a layout; reads as a
  chat window beside the game, which suits a tablet better than the
  portrait arrangement does.
- Seen, both, keyboard on the reply line: works, the reply line stays
  above the keys ("hej" typed). In landscape the column ends at the
  keyboard's top.
- Seen: the chat rail is icons only (the phone's narrow rail) although the
  column has room for names.

### Menu sheet and Settings

- Seen, both: the sheet works and is full width (820 and 1180 px) and
  458 px high. Rows are 1150 px wide in landscape with the label at the far
  left and the value at the far right; it looks stretched, nothing is
  broken. In landscape the sheet covers 56 % of the height.
- Seen, both: the Settings page is full screen, rows full width, labels left
  and controls right with up to 1000 px between them. Usable, stretched. A
  centred column of a phone's width, or a sheet beside the game, would fit
  the screen better.

### Start page and its pages with the page keyboard

- Seen, both: the start page is the desktop one (the wordmark, the framed
  menu box, centred) and looks right on a tablet. Menu items are 52 px
  high, fine for a finger.
- Seen, both: Profile → Rename and Scripts → New open our page keyboard
  under the dialog; the field is in view, the typed text shows, the page
  ends at the keyboard's top. Portrait has the Esc/Tab/arrows row above the
  letters (234 px in all); landscape has those keys beside the block
  (148 px).
- Seen, portrait, Profile: a third of the screen between the dialog and the
  keyboard is empty sky; fine.
- Seen, both, Scripts: the Scripts page is drawn in its desktop arrangement
  (list, detail and, in landscape, the help column) because the window is
  wider than the 600 px rules. It fits. The phone flag's behaviours apply
  on top of a desktop-size page: not looked at beyond these two dialogs.
- Not looked at: the script editor and the profile editor under the page
  keyboard, History, Export, Spotlights, the log player. They have their own
  phone rules (`device().phone` in `src/chrome/kit/widgets.tsx`,
  `statistics.tsx`, the editors) which now meet a wide window, a
  combination nobody has designed for.

### Today's tablet, for comparison (`?touch=1`)

- Seen, portrait: the desktop cockpit with its larger text (a 10 × 18 px
  cell against the trial's 8 × 14). The game text gets
  31 columns (310 px) and every MUME line wraps; the map, Timers, Group and
  Comm take the right 500 px. This is clearly worse for reading than the
  trial's 102 columns.
- Seen, landscape: 67 columns of text, still wrapping MUME's 80-column
  lines; the panes at the right.
- Seen, both: the panes are all visible at once and are legible, which the
  trial cannot do.
- Seen: in these two pictures the map shows another area (New Orc Caves)
  than the player's room; the script's wait for the map timed out. Not
  investigated: it may be the fixture replay in the desktop cockpit rather
  than anything about tablets. Do not read the map in these two pictures.
- Not shown, inferred: today's tablet has no keyboard of ours; a tap on
  the command line raises iPadOS's keyboard, which is much higher than
  ours (roughly half of a landscape screen). Emulation shows no device
  keyboard, so there is no picture of it.

## What only a real iPad can answer

None of this could be judged in Chromium's emulation:

- Safari itself: rendering, fonts, the map lens's WebGL/canvas speed.
- The visual viewport and the URL/tab bar: `installPhoneViewport` follows
  `visualViewport`; iPadOS Safari's bars (and the compact tab bar) change
  the height. Whether the bottom row (menu button, command field, compass)
  clears the home indicator and the rounded corners (safe areas) needs the
  device.
- The device keyboard must stay down: our keyboard relies on the fields
  not raising iOS's keyboard (`inputmode`/read-only tricks made for iPhone
  Safari and Android). iPadOS also has the floating keyboard, the shortcut
  bar and hardware keyboards (Magic Keyboard, Bluetooth): with a hardware
  keyboard attached our on-screen keyboard is pointless, and nothing detects
  that.
- The viewport meta the phone flag sets (no zoom). iPadOS Safari may ask
  for the desktop site by default ("Request Desktop Website" is on for
  iPad), which changes the user agent and possibly the viewport handling.
  The trial flag does not depend on the user agent, but the meta's effect
  should be checked.
- Fullscreen: the lens's fullscreen satellite and the start page's corner
  button use the Fullscreen API, which iPadOS supports for elements (unlike
  iPhone). Untested.
- Split View, Slide Over and Stage Manager: the window can be any size,
  including narrower than 600 px. The trial flag keeps the phone layout at
  every size; the real stage must decide what a resized window does (the
  flags are decided once at start-up today).
- Rotation with the app open: decided-once flags, layout follows the
  window; the e2e specs cover phones only.
- Touch feel: key size and reach of the compass, hot keys and keyboard with
  the iPad held or lying on a table; swipes on the strip; the drag and
  hold-drag of the lens; haptics (no vibration API on iOS).
- Text size: 14 on a phone at 30 cm is not 14 on a tablet at 50 cm.
- Wake lock, the automatic reconnect and resume after the tab was in the
  background, on iPadOS.
- Pencil and mouse/trackpad pointers (`touchInteraction` treats pen and
  mouse as not-a-finger).

## What this suggests for the tablet stage (opinion, not a decision)

- The phone layout runs on a tablet without code changes, so a tablet
  layout can start from it rather than from the desktop cockpit.
- What the tablet's size asks for: larger keys and controls, a keyboard
  that uses the width (or splits for thumbs), the empty right part of the
  text area used for panes that stay open (the landscape side column is a
  start), and menu pages that do not stretch to the full width.
- Today's desktop cockpit on a tablet is poor in portrait (31 columns) and
  has no keyboard of ours; its strength is several panes at once.
