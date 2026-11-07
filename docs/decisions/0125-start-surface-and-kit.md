# 0125 — The start surface and the lantern kit

- Status: Accepted
- Date: 2026-11-07
- Related: stage 41 parts 41c (start page layout) and 41e (sub-page kit),
  `docs/stages/41-start-page.md`. Builds on ADR 0010 (chrome), ADR 0013
  (frame stack), ADR 0025 (client notices), ADR 0083 (first paint), ADR
  0116 (menu surfaces), ADR 0123 (Lykta pane frame), ADR 0124 (the start
  page sky). Reference: `notes/research/start-menu-mockups/round6/logo-3.html`
  and the "Baseline" in that folder's README.

## Context

The start page was a cell grid (`useHostGrid`, `GridCtx`) with frames in a
`FrameStack`: a pixel banner, a `<< >>` menu, the quote and a key-hint
row. The owner approved a new page over a living sky: the wordmark, a
menu panel in the Lykta family, quote style A, an almanac, and sub-pages
in the same kind of box with glass buttons and Back. Only the start menu
and the Profile list move now; every other sub-page (Scripts, History,
Credits, About, Import report, Export editor, Profile editor, Spotlights,
the players) must keep working exactly as today until its own stage.

## Decision

**One frame stack, two kinds of frame.** The start page keeps its single
`FrameStack`, so keys (the window capture listener), focus, Esc / Back,
`nav.flash` and `show({ keep: true })` work as before for every frame.
A frame component marked with `lookFrame(…)` (src/chrome/kit/look.tsx)
is a *new-look* frame: free DOM drawn straight over the sky. Any other
frame is an *old-look* frame: the stack's new `wrap` / `frameAttrs`
props make its `.wc-frame` element the cell grid itself (`.wc-screen`
placed in whole pixels as before) with the terminal background around it
(an opaque box-shadow), so it looks and measures exactly as it did, and
its DOM (e.g. `.wc-frame > .wc-ped`) is unchanged.

**Scenery.** The surface (src/chrome/start-surface.tsx) owns what is
around the top frame: the sky, a vignette, the wordmark
(`<Wordmark size="full">`; `small` in the corner for a large box), the
almanac (bottom right) and the client notices. The top frame declares
what it needs with `useScenery`: `main` (the menu: full wordmark,
almanac), `sub` (a normal box: the wordmark scaled to 0.62, as in the
mockup), `large` (a box that nearly fills the window: the wordmark small
in the top left, no almanac), `grid` (an old-look frame: nothing; it
covers the sky). `Box` sets `sub`/`large` itself; old-look frames set
`grid` through the surface's wrapper. The wordmark's measured height is
the CSS variable `--wc-brand-h`, which the frames' layout uses. Below
560 px of height the wordmark goes (the menu always wins, as the old
banner did).

**The sky** (ADR 0124's `mountStartSky`) is mounted once, in the
surface, behind everything, and paused while the start page is hidden
(the game, a player), the document is hidden, or an old-look frame is on
top. Its look reaches the page through a small store in a context
(`useSkyLook`, `useDarkInk`), so only the wordmark and the quote
re-render when it changes. If the sky fails to start, the page uses the
pure `skyLookAt` of the start clock and the plain background.

**Quote colour.** Quote style A's ink comes from
`SkyLook.textBackLuminance`, never from canvas pixels: dark iron-brown
ink above 0.5, pale parchment again below 0.4 (hysteresis), with the
mockup's 2.5 s cross-fade. The almanac follows the same rule (pale on a
soft corner shade, dark ink without the shade on a bright sky): the
mockup's pale almanac did not read on a day sky, above all on a phone.

**Client notices** (ADR 0025) over the sky are small glass pills at the
top right (the update pill reloads on a click); on an old-look frame
they stay the TUI row on the grid's top row, as before.

**Small windows.** New-look frames need 300 × 340 CSS px; below that
the surface shows "Window too small" over the sky and the stack's keys
pause. Between that and the content's height the page scrolls. Old-look
frames keep the cell minimum (Inv §3.1) and its notice, now drawn by the
surface above the grid.

**The start menu** (src/chrome/frames/start-main.tsx): the lantern box
with the plain polished hood; Enter MUME (primary, a rule with a small
diamond under it), Profile, Scripts with the selected profile's name
(`settings.profile`) small, dim and italic, History, Spotlights,
Credits, About, each with a line icon. Selection as round 2's 07 (text
and icon brighten). Keys: ↑ ↓ Tab Shift+Tab Home End (wrap), Enter /
Space, Esc does nothing, and the shortcut letters **E P S H L C A**
(the old menu had none; these are the mockup's, unique, Spotlights = L),
marked in the label by a fine lit underline. Mouse hover selects (the
old page only lightened on hover), on a pointer move, not on
pointerenter, so a page that reappears under a resting pointer (after a
player or a sub-page) keeps its cursor; a click or a tap activates. No
footer, no ⏎, no letters at row ends. Messages (`nav.flash`: "Loading
spotlights…", "Spotlights are not available here.", errors) show as an
italic line at the foot of the panel.

**Enter MUME** shows the cockpit at once (focus and keys go straight to
the input, as before) and fades it in over 280 ms; no fade with
`prefers-reduced-motion`. The mockup's zoom was optional and is left
out.

**The first paint hand-over** (ADR 0083). `revealStart` still waits for
the main frame and the fonts, then removes the first paint's layer
(`bootDone`) and fades the sky, the scenery, the notices and the menu in
as one block (1350 ms, one start time; none with reduced motion); a
sub-page opened during the fade shows at once. The first paint still draws the pixel banner and
the bar on the cell grid until its redesign (41d), so the hand-over is a
fade, not a pixel-identical swap. `startLayout` / `START_MENU_ROWS`
stay in src/chrome/start-layout.ts for the first paint only, and
`bootQuote` still picks the quote, so 41d can lay the quote out the same.

**Fonts.** Cinzel Bold (bundled, ADR 0123) for the labels and buttons;
Cormorant Garamond Medium Italic and Cormorant SC SemiBold are bundled
(OFL, Latin subsets, `START_FACES` in src/theme/fonts.ts) for the quote,
the dim notes and the author. The almanac's time lines use the user's
terminal font.

### The kit (src/chrome/kit/look.tsx, look.css)

- `lookFrame(Component)`: marks a new-look frame; `isLookFrame(node)`.
- `useScenery(s)`; `Box({ title?, size?: 'normal' | 'large', onBack?,
  label?, class?, winClass?, children })`: the iron frame (`.wc-lk-box`)
  with riveted corners (`.wc-lk-br`), the hood (`.wc-lk-hood`, with the
  title or plain with an engraved line) and the lit window
  (`.wc-lk-win`). With `onBack` it is a sub-page: wrapped in its page
  (`.wc-lk-sub`, scrolls when short), Back at the top left, scenery
  `sub` or `large`. `size="large"` is a first cut; its final layout is
  still being designed in mockups.
- `BackButton`, `GlassButton({ label, letter?, icon?, id? (data-btn),
  selected?, disabled?, danger?, title?, onClick })` (`.wc-lk-btn`,
  `.is-sel` for the keyboard's button), `KeyLabel({ text, letter })`
  (`u.wc-sk`), `Icon({ name })` (inline line icons), `LookFlash`
  (`.wc-lk-flash`), `letterOf(e)` and `letterAt(label, letter)`.
- Buttons never take the focus (the stack keeps it); a page handles its
  letters in its `useKeys`.

A sub-page adopts it by wrapping its component in `lookFrame`, rendering
`<Box title=… onBack={() => nav.pop()}>` and moving its key handling to
letters, arrows and Tab zones without hint rows; its sub-frames may stay
old-look frames.

### The Profile list (src/chrome/frames/profiles.tsx)

Rebuilt in the kit after the mockup's `#profilePanel`; every feature of
the TUI list is kept:

- Rows: every stored profile, sorted by name (the Name header toggles
  A–Z / Z–A, as the column header did), the cursor on the selected
  profile at first; the selected profile carries a "Selected" tag (was
  the ✓ column). New: when each was last changed ("2 hours ago", the
  full date as a tooltip) from the stored `modified`.
- Two focus zones, list and buttons: Tab / Shift+Tab toggle; ← / → from
  the list go to the buttons (they were to the left, now they are below),
  ← / → move along the buttons skipping disabled ones, Home / End, ↑
  returns to the list. In the list ↑ ↓, PgUp / PgDn (10), Home / End.
- Enter or a click on a row: select it, or edit it when it is already
  selected (stage 25). Hover moves the cursor.
- Buttons with letters, from either zone: Select (S; disabled on the
  selected profile), New (N → the name prompt, then Blank / Copy), Edit
  (E), Rename (R) and Delete (D → y/N) (both disabled on `default`),
  Import (I; one or more files, native or foreign, then the import
  report), Export (X). With no profile under the cursor, Select, Edit,
  Rename, Delete and Export are disabled. Back (and Esc) return to the
  menu (was the BACK button). Hover moves the cursor on a pointer move.
- Messages unchanged: "Created …", "Renamed to …", "Deleted …",
  "Exported ….tin.", "Export failed: …", "Imported … from ….", "Import
  failed: …", "Could not read profiles: …", "No profile …", "Could not
  open the editor: …". The list reloads whenever it comes back to the
  top. Empty list: "No profiles yet. New makes one."
- The hint "Enter Edit" / "Enter Select" of the footer is now the
  cursor row's tooltip.
- Sub-frames (the name prompt, Blank / Copy, Copy from, Delete confirm,
  the import report, the profile editor) are unchanged old-look frames.

## Consequences

- Tests address the start menu by `.wc-sm-item[data-key=…]` and
  `.wc-sm-item.is-sel .wc-sm-label`, the Profile list by `.wc-pl-row`,
  `.wc-pl-row.is-on`, `[data-btn=…]` and `.wc-lk-flash`.
- The first paint no longer matches the page pixel for pixel (41d).
- The phone's ESC menu still uses the pixel `Banner` (41f decides).
- The sky reaches under the phone's notch and home indicator (the
  surface itself keeps to the safe area).
- Each later sub-page stage moves its frame to the kit; nothing else in
  the stack has to change.

## Addendum 2026-11-07 — integration of 41a–41e (and the 41d first paint)

The sky, the wordmark and the layout were built in parallel against
stubs; put together they changed as follows.

- **Ink.** `SkyLook.textBackLuminance` and `textBack.almanac` are luma
  (ADR 0124), not the stub's relative luminance: dark ink above 0.54,
  pale again below 0.46 (`inkFor`); the quote reads `textBackLuminance`,
  the almanac `textBack.almanac` (`useDarkInk('quote' | 'almanac')`). A
  day sky reads 0.48–0.51 at the quote and 0.39 at the almanac, inside
  or under the band, so both stay pale by day (as in the mockup, whose
  pixels gave the same). For legibility the pale quote gets a heavier
  outline and a soft shade close round the letters on a bright back
  (luma above 0.42, below 0.38 again: `useBrightBack`, `.is-lit`); still
  no backing behind the words.
- **No page vignette.** The sky's air layer has the mockup's vignette and
  the engine its grain; `.wc-start-vignette` is gone (it doubled the
  darkening at the corners).
- **The real view.** Without the engine the surface's look is
  `startSkyLook` for the sky host's measured size (the stub used a fixed
  1440×900), so the wordmark's glint (`look.light` x/y) and the text
  backs are right before and without the engine; the engine computes its
  own look for its host's size.
- **The engine is its own chunk** (`import('../start/sky')`, 9.2 KB
  gzip), imported when the surface mounts; until it mounts the sky host
  carries the look model's CSS gradients (the first paint's pixels).
  `SkyFeed` is the store: the engine's look while mounted (its `onLook`),
  else the still look.
- **Lifetime.** The engine is mounted while the start page is visible and
  **disposed when it is hidden** (Enter MUME, the log player): an hour of
  play should not keep its canvases (about 20 MB at 1728×1000 @2) and
  listeners; it mounts again on `show()` (with or without `keep`, ADR
  0018), costs 4–9 ms and fades its canvases in over its CSS sky. It is
  paused (`setPaused(true)`) while the document is hidden or an old-look
  frame covers it. On the first boot it mounts only after the reveal's
  fade (`skyHold`, ADR 0083 addendum).
- **Layout against the mockup.** The mockup's wordmark canvas had sky
  above the letters: about 0.15 of the mark's width (75 px at 1440×900).
  The wordmark box now has that headroom as padding
  (`--wc-brand-pad`, `src/start/geometry.css`), shrinking on short
  windows (`(100vh − 680px) × 0.4`) so the menu and the quote still fit at
  1280×720 (the mockup pushed the quote off-screen there); as padding it
  scales with the sub-page's 0.62 wordmark, as in the mockup. The phone's
  own `--wc-brand-top: 26px` went: the same rule puts MUME where the
  mockup has it. Screenshots (day, dawn, dusk, night, winter night with
  snow, spring rain; 1440×900, 1280×720, 390×844; menu and Profile list)
  match the mockup's positions within a few px; `size="large"` has no
  user yet.
- **Shared geometry.** The places of the sky, the wordmark and the menu
  panel are in `src/start/geometry.css`, which the first paint inlines,
  so its sky, wordmark and loading panel sit exactly where the surface
  puts them (ADR 0083 addendum).
- **Glass over the moving sky: kept.** Measured on the integrated page
  (production build, `bench/start-page-bench.ts`, real windows on the
  Iris Xe laptop; `bench/results/start-page-headed.md`), with and without
  every `backdrop-filter`:

  | browser | geometry | day, fair: glass / flat | winter night, snow: glass / flat |
  |---|---|---|---|
  | Chromium | 1728×1000 @2 | 56.1 / 56.3 fps | 57.0 / 56.3 fps |
  | Chromium | 390×844 @3 | 56.5 / 56.6 fps | 56.5 / 56.5 fps |
  | Firefox | 1728×1000 @2 | 58.0 / 58.0 fps | 56.2 / 54.5 fps |
  | Firefox | 390×844 @3 | 56.2 / 57.0 fps | 57.8 / 58.8 fps |

  Every run stayed at the high tier; the sky's own work was 0.3–1.0 ms
  median, under 5 ms max; no long frame (> 50 ms) in Chromium. The blur
  costs nothing measurable, so the panel and the buttons keep it. The
  page as a whole drops a few frames against the sky alone (57–60 fps
  in its harness). Diagnosis runs pointed at the wordmark's sheen (a
  transform animation inside a CSS-masked element): without it Chromium
  reached 60 fps in most runs, but the runs were noisy (other load on
  the machine) and not conclusive; left as is and noted for the owner.
  In the dev server Firefox ran at 31–48 fps on the app page (module
  loading and the dev client); always measure a build.

## Addendum 2026-11-07 — actions on the row (the Profile list)

The owner, after testing: choosing a profile and then an action in a
separate button row is awkward; each profile row gets its own buttons,
shown only on the highlighted row. This replaces the two focus zones and
the seven-button row described above under "The Profile list".

- **The highlighted row** (↑ ↓, a hover or a click / tap) shows small
  glass buttons inside it: **Select** (only when it is not the selected
  profile), **Edit**, **Rename**, **Delete** (Rename and Delete disabled
  on `default`, with a tooltip saying why). Other rows show none. The
  selected profile keeps its "Selected" tag; the selection style is
  unchanged (the row brightens, no glow, no glide; the buttons fade in
  over 150 ms, none with reduced motion).
- **Page buttons** at the foot: **New**, **Import**, **Export** (Export
  takes the highlighted profile; its tooltip names it).
- **Layout.** On a wide box the buttons sit on the row's line between
  the name and the Changed column (`grid-template-areas: "name acts
  time"`), so a row without buttons looks as before and nothing shifts
  as the highlight moves. Below 620 px of list width (a container query
  on `.wc-pl-list`) and on the phone they take a line of their own under
  the name and share its width (40 px high on the phone, labels without
  icons). The highlighted row grows downwards only, so a hover cannot
  make the rows jump under the pointer; the list scrolls the highlight
  into view after a key, never after a pointer move.
- **Keys.** ↑ ↓ PgUp PgDn (10) Home End move the highlight from anywhere;
  on a row button the same button follows to the new row (Select falls
  back to Edit on the selected profile), from a page button the keys go
  back to the row. **Tab / Shift+Tab** walk one ring — the row, its
  enabled buttons, the enabled page buttons — and wrap; **← / →** walk
  the same order and stop at the ends. **Enter / Space** press the
  keyboard's button; on the row itself Enter selects the profile, and on
  the profile that is already selected it opens the editor (stage 25's
  "the second click edits", kept because Enter on the selected profile
  has nothing else to do). Letters marked in the labels: **S E R D** act
  on the highlighted row, **N I X** anywhere on the page. Esc and Back
  return to the menu.
- **Mouse and touch.** A pointer move highlights (as the start menu);
  a click or tap on a row that is not highlighted highlights it, on the
  highlighted row it does what Enter does. On a touch screen (no hover)
  the first tap therefore shows the row's buttons and the second selects.
- **Focus.** Buttons never take the DOM focus (the stack keeps it).
  After Rename the highlight is on the new name and the keys on the row;
  after Delete the highlight goes to the neighbour in the order shown
  (the row below, or above at the end; `DeleteFrame`'s `next`).
- Tests address the row buttons as `.wc-pl-row.is-on [data-btn=…]`
  (there is only one set, so `.wc-start [data-btn="EDIT"]` still
  works) and the page buttons as `.wc-pl-btns [data-btn=…]`; a click
  meant for the row itself goes to its name (`.wc-pl-n`), since the
  buttons fill the middle of a wide row.

## Addendum (2026-11-07): the profile name sits on Profile

The owner moved the selected profile's name from the Scripts row to the
Profile row ("PROFILE (khazdul)"): it names what the Profile page
changes. Scripts has no note now.

## Addendum 2026-11-07 — the Enter MUME transition

The owner asked for more than the 280 ms fade: everything folds away
until only the sky is left, the sky zooms in a little, then a somewhat
slower fade into the game. It replaces the fade above
(`src/chrome/enter-transition.ts`, `StartPageHandle.leave`, `Shell.enter`).

- **Phases** (Web Animations, one clock from the Enter key or click, all
  `fill: 'forwards'`):

  | phase | what | start | length | easing |
  |---|---|---|---|---|
  | fold | the menu panel folds up into its hood (`scale(1, 0.06)` at 62 %, then narrows and fades; its rows fade in the first 40 %); the wordmark (lifts 10 px), the quote (sinks 10 px), the almanac and the notice pills fade | 0 | 380 ms (fades 323 ms) | ease-in-out (fades linear) |
  | zoom | the sky host scales to 1.07 about 50 % 45 % | 220 ms | 1280 ms | ease-in-out |
  | fade | the whole surface fades out over the cockpit | 660 ms | 840 ms | ease-in-out |

  Total 1.5 s. The sky alone (zooming) shows from about 380 to 660 ms;
  the fade starts while the zoom is still moving and the zoom eases out
  under it, so the motion never stops before the game is there. Tuned
  from stepped frames and a video at 1440×900 and on the Pixel 7.
- **The cockpit is underneath from the first moment.** `Shell.enter`
  builds the App, lifts the start page's host out of the flow
  (`position: fixed` at its own rectangle, `z-index: 500`, no pointer
  events), shows the cockpit, focuses its input and connects, all in the
  task of the Enter key; the game's text may arrive under the fade. When
  the fade is over the page is hidden (the sky disposed, as before) and
  its host's inline style restored.
- **Input.** Keys belong to the game input from the first moment: the
  start page's frame stack is inactive while it leaves (its key listener
  goes in the render; its focus trap now checks `active` itself, as its
  passive effect's cleanup only runs after the next paint), and the page
  takes no pointer events (`.wc-start.is-leaving`). So nothing typed
  during the transition is lost, nothing reaches the start menu, and a
  second Enter or click is the cockpit's (an empty line or a click on
  the output), never a second Enter MUME (`enter()` also returns at once
  while the cockpit is the view).
- **The sky keeps running** during the zoom: the transform is the
  compositor's (the canvases are not repainted larger), and pausing the
  engine would freeze rain and snow mid-air. Measured in headless
  Chromium (1440×900, SwiftShader): main-thread work over the 1.6 s was
  261 ms against 138 ms for the idle page and 196 ms for the reduced
  fade (the App's first build and layout, the connection), no long
  task; pausing the engine changed nothing measurable. Headless
  rendering drops some frames (33 ms) while two full-window layers
  blend; a real GPU should not. Headless Firefox is no guide (it draws
  the idle start page at about 20 fps; during the transition it ran
  no worse, with or without the engine paused). To be judged by the
  owner in a real window.
- **Back to the start page** (Exit, even during the transition) shows
  it as it was: `show()` and `hide()` cancel the animations after their
  render in the same task, and the shell restores the host.
- **`prefers-reduced-motion`**: a 220 ms ease-out fade of the surface;
  nothing folds or zooms. (The old 280 ms fade had none; a short fade
  is not motion.) Without Web Animations the switch is at once.

## Addendum 2026-11-07 (later) — the transition, slower, scrolling away

After trying it the owner wanted no folding and an unhurried pace: the
wordmark and the menu panel scroll up out of view, the almanac (bottom
right) is pushed down out of view, then the sky zooms in for 1-2 s, then
a 1-2 s fade into the game. Replaces the phases above (the rest of that
addendum holds: the cockpit underneath from the first moment, the keys,
the sky running, reduced motion, going back).

| phase | what | start | length | easing |
|---|---|---|---|---|
| leave | the wordmark, the panel and the quote move up together (`translate`) by the quote's bottom + 48 px, so all clear the top edge; the almanac moves down past the bottom edge; the notice pills fade in the first half | 0 | 900 ms | ease-in (gathers speed) |
| zoom | the sky host scales to 1.1 about 50 % 45 %; most of the travel in its first ~1.8 s, a soft tail through the fade | 700 ms | 3000 ms | `cubic-bezier(0.35, 0, 0.25, 1)` |
| fade | the whole surface fades out over the cockpit | 2200 ms | 1500 ms | ease-in-out |

Total 3.7 s; the sky alone shows from about 0.9 to 2.2 s. Distances are
measured when the transition starts (a resize during it keeps them). The
timings live in `src/chrome/enter-transition.ts`.

## Addendum 2026-11-07 (third round) — fade in place, a longer zoom

The upward scroll did not look good: the wordmark, the panel, the quote
and the notices now fade where they are; the almanac is still pushed
down, a little faster. A quicker reveal of the sky, a longer zoom and a
slower fade; a slightly longer transition overall. Replaces the table
above:

| phase | what | start | length | easing |
|---|---|---|---|---|
| leave | the wordmark, panel, quote and notice pills fade in place | 0 | 600 ms | ease-in-out |
| slide | the almanac moves down past the bottom edge | 0 | 700 ms | ease-in |
| zoom | the sky host scales to 1.1 about 50 % 45 %, most of it in the first ~2.3 s | 450 ms | 3850 ms | `cubic-bezier(0.35, 0, 0.25, 1)` |
| fade | the whole surface fades out over the cockpit | 2300 ms | 2000 ms | ease-in-out |

Total 4.3 s; the sky alone shows from about 0.7 to 2.3 s.

## Addendum 2026-11-07 (fourth round) — a 4 s fade that sweeps up

The owner wanted the fade into the game twice as long and softer, the
bottom clearing a little before the top. The fade is now 4000 ms (from
2300 ms) and two animations on the surface:

- **The sweep**: a vertical `mask-image` three surface heights tall
  (opaque in its top third, clear in its bottom third, a ramp one height
  tall between) slides from `0 0%` to `0 100%`
  (`cubic-bezier(0.35, 0, 0.9, 0.9)`): the bottom clears first and the
  clear edge climbs as a soft ramp, never a line.
- **The opacity** under it: `cubic-bezier(0.5, 0, 0.7, 0.6)`, slow at
  first so the sweep leads, then the whole surface thins away.

The zoom runs on through it (450 ms to 6300 ms, to 1.12). Total 6.3 s;
in stepped frames the sky is gone at about 5.5 s by day, sooner at night
(the dark upper sky melts into the dark cockpit). Mask positions are not
compositor-only, so the surface is re-rastered during the fade; the sky
under it repaints every frame anyway. Reduced motion is unchanged (a
220 ms plain fade, no sweep).

## Addendum 2026-11-07 — names that differ only in case

Profile names are unique case-sensitively (ADR 0010), so `gibur` and
`Gibur` can both exist, and in the Profile list's display face (Cinzel,
whose lower case is small caps) they look nearly identical. When the
list holds two or more names that are equal ignoring case
(`caseTwins` in `src/profiles/names.ts`), each of those rows gets a
second line with the real spelling in the plain mono face (12 px,
`--lk-dim`, a step brighter on the highlighted row, the time column's
face), followed by the Selected tag when that row is the selected
profile (`.wc-pl-sub` > `.wc-pl-case`, `.wc-pl-tag`). Rows without a
case twin look as before. The second line fits the 54 px row on a wide
box; on a narrow box or a phone the row grows anyway.

The start menu's Profile note needs no change: it is set in Cormorant
Garamond italic with no `text-transform` or small caps, so it already
shows the real spelling, "(Gibur)" or "(gibur)", always (not only when a
twin exists).
