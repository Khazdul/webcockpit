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
mockup's 2.5 s cross-fade. The almanac keeps the mockup's pale text on a
soft corner shade at all times.

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
