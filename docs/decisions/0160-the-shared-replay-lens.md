# 0160 — The shared replay's lens

Date: 2026-11-17. Status: accepted (built on `stage-71-shared-replay-lens`;
stage 71).

## Context

Panes in a shared run (a share link `/r/<id>`, the Hall of Fame, an
exported HTML replay) landed in odd places: the recorded layout with only
Map, Timers and Group allowed (ADR 0154/0155, `SHARED_PANES`), all off at
the start, turned on from the control box's Panes popup. On a phone the
frame ran the desktop cockpit: the replay runtime decided no device flags
(ADR 0156). The owner's direction (stage 71 file): every shared run plays
around the map lens, always on, with Group and Timers reached from it; on
a phone and tablet the game's phone layout and lens, on a computer a lens
of the same look at a desktop size. History's run log player and
Spotlights stay as they are.

## Decision

### Scope and the switch

- `openReplay` (src/replay/page.ts) is the one place: it plays the watch
  page's frame and the exported HTML file, so both get it, and a run
  published before this gets it too (the frame plays it with the site's
  current runtime). An HTML file exported before keeps its own runtime.
- `PlayerHostOptions.lens` (src/app/player-host.ts) says "a shared run's
  lens", with the player's own fullscreen (`{is, toggle}`: the document's
  in the file, the frame's in the frame, ADR 0154). The host then mounts
  the phone layer in its shared mode (with `phone`) or the desktop lens
  (without), never in a bare view.
- The control box loses Panes in both (`viewerSettings: 'display'`: the
  Display popup only). On a phone it also loses Fullscreen (it is a key on
  the lens); on a computer Fullscreen stays in the box and is a key on the
  lens as well.

### Phone and tablet: the phone layer in the replay runtime

- The runtime decides the device flags as the app does: `initDevice` runs
  in `startReplay` and `startFrame` (src/replay/phone.ts `replayPhone`).
  The frame's window has the device's pointer and screen, so a phone is a
  phone there; `html.wc-touch`/`wc-phone` come with it. This replaces ADR
  0156's "the frame decides no device flags" for the replay runtime (the
  map's pointer-type rule stays and still matters on a desktop with a
  touch screen).
- **How the replay bundle gets the phone layer:** a dynamic
  `import('../phone')` (and `../app/phone-kit`) in `replayPhone`, taken
  only when `device().phone`. The runtime is one IIFE (vite.config.ts
  `bundleReplayRuntime`): the bundler inlines the dynamic import, so the
  exported file and the frame stay self-contained (no chunk to fetch: the
  file may be opened from `file://`, and the frame's CSP names only its
  one inline script). The phone layer's module is evaluated only on a
  phone or tablet; a computer carries its bytes and never runs it, and
  phone.css is scoped under `html.wc-phone`, so it matches nothing there.
  Cost, measured on this branch: `replay/replay.js` 1 427 KB → 1 666 KB
  (gzip 487 → 553 KB); `r/frame.html` the same. A separate chunk was not
  possible for the reasons above; a slimmer replay-only entry of the phone
  layer (without the menu sheet, the keyboard, the hot keys) is a possible
  follow-up if the file size matters.
- The phone layer's controls (`Seg`, `Toggle`, from the chrome chunk) are
  optional over a replay: only the menu's settings page uses them, and it
  is never shown there. `PhoneLiveDeps` still requires them.
- `PhoneReplay` gets `fullscreen` (a key on the lens's top right corner,
  the player's own fullscreen) and `comm: false` (no Comm key: a shared
  run has no Comm). The layer's settings in a shared run
  (`sharedPhoneSettings`): the lens always shown, the strip's pages Group
  then Timers. The strip is closed at the start (as ever) and the panes key
  opens it; a swipe goes between the two pages. Everything else (lens size,
  tap and pinch zoom, move and resize by touch, the strip at the top in
  portrait and at the left in landscape) is the run log player's (stage
  55).

### Desktop: the desktop lens

- **The map is the cockpit's one map pane**, as on the phone: a new
  `Cockpit.setDeskLens(box)` leaves the map out of the docks and floats
  (allocated as off) and places it borderless in the whole cells that hold
  the circle, above the floats (`DESK_LENS_Z` 40, under the player's chrome
  at 50). The lens module (src/player/desk-lens.ts) clips it to the circle
  (`--dl-size`), shifts it by the part of a cell that is left (`translate`)
  and draws the dressing over it in the phone lens's look, scaled: ring
  10 px, keys 36 px hanging 10 px over the box. Nothing of the phone's
  module or CSS is used on a computer: the look is copied into
  desk-lens.css, so a computer never loads the phone layer.
- **Keys:** Group top left, fullscreen top right, Timers bottom right, the
  move handle bottom left (a four-arrow glyph, `cursor: grab`, title
  "Drag to move the map"). Group and Timers toggle the viewer's pane
  overrides (`withPane`), so they hold across the App rebuilt by a backward
  seek; the keys are lit by what the composed settings say.
- **The map takes the mouse inside the glass:** a hand lens
  (`MapLens.hand`): drag pans, the wheel and a touchpad zoom; while the map
  follows the player the wheel zooms round the centre (the player stays in
  the middle), after a pan round the pointer. No hover box. It opens at a
  zoom of eight rooms across the lens; after that the zoom is the wheel's
  (a resize shows more or less of the map, unlike the phone's levels).
- **Follow (the owner's pick):** a pan lets go of the player. The map
  worker takes a new `follow` message: while off, a located move does not
  re-centre the view; on, it centres on the player at once and follows
  again. The follow key (a crosshair at the bottom of the glass) shows
  while the map does not follow; it, or a double click on the map, follows
  again. The plain map pane never sends `follow`, so its behaviour is
  unchanged.
- **Rim resize:** a band from 5 px inside the glass to 6 px past the ring,
  cut as a ring with an even-odd `clip-path: path()` so the pointer finds
  it only there; its cursor is the resize cursor along the radius at the
  pointer (`rimCursor`). A drag resizes round the centre, between 140 px
  and the player's short side (at most 640 px).
- **Place and size:** the default is the top right corner, under the
  header's row, clear of the markers left of the rail; the diameter 32 %
  of the player's short side within 200–340 px. The host keeps the place
  (as distance from the right edge and from the top) and size across App
  rebuilds; never stored. A drag lays out at most once a frame through the
  cockpit's coalescing; the window changing size clamps the lens back in.
- **Group and Timers float at the bottom right** (`deskPaneRects`,
  `deskPanesLayout`): taken out of the docks, a third of the width (30–56
  columns), Group a third of the height (8–16 rows), Timers right above it
  (6–12 rows), or at the bottom when Group is off; 64 px above the bottom
  edge for the control box and two columns from the right edge for the
  markers. Where the lens stands over their columns they give up rows to
  stay under it (Timers first). The host anchors them to the cockpit's grid
  at every layout (the composed settings' layout, `anchorDeskPanes`) until
  the viewer moves or resizes one: then the viewer's layout override
  stands, as for any player (ADR 0021).

## Consequences

- Shared runs look the same wherever they are played, and the map is
  always there; the Panes popup is gone from them.
- The replay runtime is about 17 % larger (above).
- The watch page's map specs test the lens instead of the Panes popup;
  `phone-watch-map-zoom` tests the phone lens's pinch levels.
- The zoom and the follow state start over after a backward seek (a new
  App and map worker); the lens's place and size do not.

## Addendum (owner's feedback round 1, 2026-11-17)

The corner keys sit on the lens's diagonals, centred on the ring's outer
edge (`--dl-key-at` in desk-lens.css), 44 px. Group and Timers share one
height and keep a row of air between them and under the lens while the
rows allow; the air goes before either float drops below 5 rows.

## Addendum (stage 73 part A, 2026-11-18): the desktop lens, round 2

The owner's direction (docs/stages/73-shared-replay-round-2.md, points 1–6).

- **The bug: the map outside the lens.** The owner's screenshot (Firefox,
  `docs/stages/img/73-owner-map-outside-lens.png`) shows the map in the
  whole cells round the ring: the pane's rectangle without its circle.
  The JS state was right in every case we could make (resizes, a backward
  seek, moves and resizes of the lens: `clip-path`, `--dl-size`, the shift
  and the cells agree, and a red fill over the pane shows nothing outside
  the circle in headless Chromium and Firefox). The cause is the
  compositor: a large WebGL canvas that presents frame after frame (the
  map following the player while the run plays) may be promoted by
  Firefox's GPU WebRender to a compositor surface of its own, which keeps
  only the rectangle of an ancestor's rounded clip (Mozilla bug 2068303,
  open; reported on macOS, the same carve-out serves the layer compositor
  elsewhere). Hence "sometimes": only while the canvas is promoted. The
  fix, the workaround that bug names: the canvas itself is masked to the
  circle (`mask-image: radial-gradient(...)` in desk-lens.css), which makes
  WebRender refuse the promotion; the pane's `clip-path` stays (hit
  testing, the rest of the pane). As hygiene, the lens now shifts and
  clips the map only for the box the cockpit laid the pane's cells out for
  (`Cockpit.deskLensLaid`), never for one given since: before, a box given
  inside a layout's listener was drawn with the previous layout's cells
  until the next frame (longer while a seek holds the paint gate).
  Headless browsers have no GPU compositor, so no e2e can make the
  promotion happen: `watch-lens.spec.ts` checks that the canvas carries
  the mask and that nothing of the pane paints outside the circle through
  resizes, a backward seek, a move and a resize. The phone lens
  (src/phone, `--ph-lens-size`) uses the same clip-path alone; a phone has
  not shown it, but Firefox on Android could. Left to the phone's owner
  (stage 73 part B) or a follow-up.
- **No keys on the lens.** Group, Timers, fullscreen, the move handle and
  the follow key go. **Map, Group and Timers are the control box's Panes
  popup's again** (`viewerSettings: true` on a computer; a phone keeps
  `'display'`). Map turns the lens on and off (`DeskLensDeps.mapOn`, the
  composed settings' `panes.map.on`): off, the cockpit gets no lens box
  and the map pane is off as any pane. The host composes `map.on = true`
  under the viewer's overrides in a shared run on a computer, so the map
  is on at the start and Reset layout keeps it on; Group and Timers are
  off at the start (the shared payload's panes) and float at the bottom
  right as before.
- **A drag anywhere on the lens moves it.** The glass (`.wc-dl-glass`, a
  circle over the map, `cursor: grab`) takes the mouse; the map never does
  (its lens look is the phone's, without `hand`). The rim's band lies
  above the glass in the DOM, so it wins where the two meet.
- **Without a pan the map always follows the player.** The hand lens of
  `MapPane` (pan, wheel zoom, `following`, the double click) is removed.
  The worker's `follow` message stays: harmless, always on, unit-tested.
- **Four zoom levels** (`DESK_LENS_ROOMS` 8, 14, 24 and 44 rooms across
  the lens; the nearest, stage 71's opening zoom, is the default). The
  zoom follows the diameter, as on the phone: a resize shows the same
  rooms larger or smaller. Four dots at the bottom centre of the glass in
  the phone's pip look (copied into desk-lens.css; 7 px dots in 16 px
  buttons) pick a level; the lit one is the level. **The wheel over the
  lens steps one level** per 60 px gathered (a mouse notch is 100; a
  touchpad's small deltas, Ctrl or not, gather) and then rests 220 ms, so
  a touchpad's coasting does not run through all four; up is nearer, as
  the map pane's wheel; clamped, no wrap. The host keeps the level across
  App rebuilds with the place and size (it no longer starts over after a
  backward seek).
- **The default place is a row lower**: two rows down from the top
  (`deskLensDefault`).
## Addendum (stage 73 part B, 2026-11-18): phone and tablet

- **The box floats** (owner's point 7). A shared run on a phone or tablet
  has no docked bar: the cockpit keeps no command row
  (`phoneReplay.bar` false) and the control box is the desktop's, at the
  bottom right left of the rail's markers, over the log
  (`PlayerViewOptions.touchFloat`). It hides as on a computer: 6 s after the
  last activity in play, not in pause; a tap on the log shows it (the
  tap's click presses nothing that appeared under it, as before), and a
  tap on the lens's keys reaches the lens while it is hidden. The header
  keeps the docked one's rule (no key hints, from the game text's left
  edge, ending left of the lens's corner key: the host's `TouchHead`).
  Keys are touch-sized (`data-touch`: 36 px, Play 40 px); compact (a phone
  upright) the box drops To the start and the stepper arrows and the speed
  is one key that steps round, so it leaves the left part of the width to
  the log (238 of 376 px on a Pixel 7). History's run log player keeps
  its docked bar.
- **No fight card** (point 8): `sharedPhoneSettings` sets
  `phone.fightCard` off.
- **The lens half as large again on a phone** (point 10):
  `PhoneReplay.lensScale` 1.5 (`SHARED_PHONE_LENS_SCALE`, not on a tablet:
  `PlayerPhone.tablet` from `device().tablet`), through
  `lensReplayScaledPx`: at most half the player's width upright and two
  thirds of its height on its side (ring included), at most 285 px, never
  under the run log player's size. A tablet is already at the lens's
  largest (190 px) and keeps it.
- **The iPad turn in fullscreen** (point 9). Not reproducible without a
  device. The docked bar was placed in absolute px (`top`, `height`) from
  the cockpit's command-row rectangle and the root's `clientHeight`, taken
  at the cockpit's layout; iPadOS reports a turn's new size in steps and
  late in fullscreen (the layout viewport and the visual viewport disagree
  for a while), so a rectangle measured on one step and a window shown on
  the next puts part of the bar under the bottom edge. Android delivers
  the sizes together, which fits it not being seen there. The fix does
  not depend on that order: the floating box is anchored by CSS `bottom`
  to the root (no measured rectangle), and is lifted and moved in by what
  the root reaches past the visible part of the window (`boxLift` against
  `visibleBox`: the visual viewport, within the layout viewport). It is
  measured again on the window's `resize` and `orientationchange`, the
  visual viewport's `resize` and `scroll`, and `fullscreenchange`
  (prefixed too), and once more 150 ms and 500 ms later. Tested in
  Chromium by turning a tablet's metrics while the frame is in fullscreen,
  and by laying the frame's root out 60 px taller than its window (the
  box stays inside; without the lift it does not). WebKit is not
  installed here, so not run on WebKit.

## Addendum (stage 73 round 3, 2026-11-18): the iPad fullscreen turn

The owner's iPad after 0.20.0: turned while the shared run was in
fullscreen, the view kept a size of the old orientation (portrait →
landscape: the view spilled below and half the box showed; landscape →
portrait: black rows above it), and after leaving fullscreen the page had
a black band at the top and black over the right (or bottom) 25–30 %:
820/1180, a side of the old orientation.

**Causes found** (WebKit is not installed here, so not seen on WebKit;
the first two reproduced in Chromium by emulating the steps iPadOS takes):

1. **The frame's cockpit kept the upright layout on its side.** The phone
   layout lies on its side when the cockpit is wider than tall *and*
   `screen.orientation` does not say portrait (`landscapeLayout`). iPadOS
   reports the new size before the new orientation; the size's
   ResizeObserver laid the cockpit out upright in a landscape window, and
   the orientation that came after it laid out nothing
   (`src/layout/cockpit.ts` `relayoutPhoneGame`).
2. **The watch page's root was sized by the measured visual viewport.**
   On a phone or tablet `#app` is `position: fixed` at
   `top: var(--wc-vv-top)` and `height: var(--wc-vv-h)` (ui.css, published
   by `installPhoneViewport`), and the watch page's `.wc-watch` (a
   `.wc-chrome`) is placed inside it. A visual viewport that did not report
   the turn (the page is not shown while the frame is in fullscreen) left
   the whole page at the old height and offset: black at the bottom and a
   band at the top after fullscreen ended.
3. **Likely, not provable here:** the first view's height in `100dvh`
   (`.wc-watch-screen`), and WebKit's own layout size of the page, may keep
   the old orientation's for a while after a turn in fullscreen; the frame's
   window may get its resize late or not at all.

**The fix:**

- The cockpit lays out again on `orientationchange` and
  `screen.orientation`'s `change` (phone only).
- The watch page's root fills the window by CSS (`#app.wc-watch-app` at
  `top: 0; bottom: 0`, watch.css), not by the measured viewport. The first
  view's height is `.wc-watch`'s own (`--wc-watch-vh`, measured from that
  CSS box, falling back to `100dvh`; a computer never sets it).
- Both windows follow every source of a change and measure again a few
  times up to a second after it (`src/core/viewport-settle.ts`
  `watchViewport`: resize, orientationchange, `screen.orientation`,
  visual viewport resize and scroll, fullscreenchange with its prefix, a
  ResizeObserver of the root; ticks at 0, 50, 200, 500 and 1000 ms, ending
  early when two reads agree after 500 ms). The page (`src/watch/turn.ts`,
  touch devices only) tells the frame at each tick with a new message,
  `{t: 'wc-relayout', v: 1, debug?}`, taken only from `parent`; the frame
  (`src/replay/frame-fit.ts`, phone or tablet only) then lays the player out
  again (`PlayerHost.nudgeLayout`: cells, cockpit, the lens's size, the
  box).
- Where the frame's root does not fill the frame's window after a tick (laid
  out at the old size), it is sized to the window by number
  (`wc-frame-sized` on `<html>`, `--wc-frame-w/h` through CSSOM, no style
  attribute). In fullscreen, once the turn has settled, a window larger than
  the turned screen and the other way round is taken as the old
  orientation's, and the root takes the screen's size. Each tick takes the
  class away and measures CSS's layout first, so the numbers stand only
  while CSS is wrong.
- Leaving fullscreen: both windows scroll back to the top, and the page
  writes its viewport meta once changed (`minimum-scale=1`) and back, so
  WebKit computes the page's layout size again; at once and 500 ms later.
- Desktop: none of it runs (the page's watch only on a touch device, the
  frame's only in the phone layout). Android: the same sizes come out, a
  few more layouts after a change.

**The diagnostic switch:** `?fsdebug` on the watch page (`/r/<id>?fsdebug`)
shows a small readout at the page's bottom left and the frame's top left
(src/core/fs-debug.ts; text only, a class for the look, no style attribute:
the frame's CSP): each window's inner size and `documentElement` client
size, the visual viewport with its offsets and scale, the screen with its
orientation (and `window.orientation`), fullscreen yes/no, the roots', the
cockpit's, the box's and the frame's rectangles, whether the frame's root
is sized by number, and the last event with its time. The page's lines are
posted to the frame (`wc-play`'s `prefs.fsdebug`, `wc-relayout`'s `debug`,
capped, plain text) and shown under the frame's own, since in fullscreen
only the frame shows. Off by default.

Tested in Chromium (`phone-watch-box`): turning a tablet in fullscreen
with the size first and the orientation later, both ways; the frame's root
laid out at the old orientation's size with no resize after it; leaving
fullscreen with the page's visual viewport still published at the old
height. Each asserts that the frame's root and cockpit fill its window,
the box is inside it, the cockpit lies the right way, and the page's root
boxes fill the window with the frame inside them. Without the fix the
three parts fail (the cockpit upright, the root at the old size, the page
at the old height).
