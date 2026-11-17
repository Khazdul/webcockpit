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
