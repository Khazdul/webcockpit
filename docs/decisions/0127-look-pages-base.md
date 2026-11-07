# 0127 — The look pages base

- Status: Proposed (stage 42 in progress; each package fills its section)
- Date: 2026-11-07
- Related: stage 42 (`docs/stages/42-look-pages-base.md`), ADR 0103 (in-game
  windows), ADR 0123 (Lykta panes), ADR 0124 (start sky), ADR 0125 (start
  surface and the lantern kit), ADR 0126 (wordmark), ADR 0114 and ADR 0018
  (the run log player). Wave-2 stage ADRs: 0128 (43) … 0132 (47).
- Reference: `notes/research/start-menu-mockups/README.md` ("Baseline",
  "Round 7 decisions"), `round7/layout/b-room.html` (layout B),
  `round7/base/` (`gallery.html`, `ingame.html`).

## Context

Stages 43–47 rebuild every remaining start-menu page in the new look, in
parallel worktrees. They can only run in parallel if none of them edits a
shared file, so stage 42 builds everything they share first: the big box
(layout B "Rummet växer"), places (start page, in-game window, the phone's
ESC menu), the kit's controls and overlays, the one in-game window frame
(Lykta), the CodeMirror look, the manual reader and the player core. The
stage file's "API (canonical names)" is the contract; this ADR records how
it was built and why.

Stage 42 runs as seven packages: 42-0 (scaffold, alone), 42a–42f (in
parallel), 42-Z (integration). Each package owns its section below.

## Decision

### 42-0 — Scaffold

**The kit split into modules (no change of behaviour).** `look.tsx` keeps
the frames (`lookFrame`, `isLookFrame`), the scenery (`Scenery`,
`SceneryCtx`, `useScenery`), the places and the box (`Box`, `BackButton`),
and is the kit's barrel: it re-exports `look-keys.ts` (`letterOf`,
`letterAt`, `KeyLabel`, `letterAction`), `look-icons.tsx` (`Icon`, `ICONS`,
`IconName`, `IconDraw`), `look-controls.tsx` (`GlassButton`, `LookFlash` and
the new controls), `look-overlay.tsx`, `look-cursor.ts`, `look-motion.ts` and
`window-chrome.ts`. Pages import from `kit/look` only; a module file names
its owning package in its header. The editor's parts (`look-code.ts`,
`look-manual.tsx`, `look-manual-find.ts`) live in `src/editor/` and are not
in the barrel, so they stay in the lazy editor chunk.

`look-overlay.tsx` imports `lookFrame` from the barrel that re-exports it
(an import cycle): it makes its keys-box frame on first use, never at module
evaluation.

**CSS.** `look.css` keeps the box, its page and the flash and imports
`look-tokens.css` (the `--lk-*` tokens) and `look-glass.css` (the icons'
base rule, the glass buttons, Back and the shortcut letters, which import
the tokens themselves, so the player can import `look-glass.css` alone,
42f). The imports are inlined and deduplicated by the build (the tokens
appear once in the chrome CSS).

**The `.wc-look` scope.** The tokens moved from `.wc-start` to `.wc-look`,
and the start surface's root carries both classes, so nothing changes on
the start page; 42d puts `.wc-look` on the window bodies of look frames and
the ESC menu host, 42f on the player's Back.

**Places are real from 42-0.** `LookPlace = 'start' | 'window' | 'menu'`,
`LookPlaceCtx` (default `'start'`) and `useLookPlace()`; 42d provides the
values in windows and the ESC menu. `InlineBack` already follows the rule
(only in a window and only on a sub-page).

**Stubs.** Every other name of the API exists with its final type: plain
elements with the right roles and `data-*` hooks (`Seg`: `role=radio` /
`checkbox` + `aria-checked`; `Tabs`: `role=tab` + `aria-selected`; the
dialog's `.wc-lk-dialog[data-dlg]`), working minimal cursors, a no-op
`useWindowChrome`, `useKeyLayer` and `useKeyboardInset`, `useBoxSettled`
always true, `Nav.push(node, { overlay })` accepted as a normal push,
`FrameStackProps.hold` accepted and unused, `BufferOptions.look` and
`SearchOptions.look` / `top` accepted and unused, an empty
`lookCodeTheme()`, and a plain `findInSections`. `IconName` lists every
icon of the API; a name without a drawing yet renders an empty icon. The
player core's API (42f) is not stubbed: no other wave-1 package needs it.

**The gallery.** `src/chrome/kit/gallery/`: `index.tsx` (the `KitGallery`
look frame: `Box size="large" title="Kit"`, a tab per section, `[` / `]`
and 1–9 switch sections outside text fields, Esc back, `?kit=<id>` kept in
the address), `sections.ts` (the sections, found by a Vite glob import of
every other `.tsx` file in the folder) and `kit.ts` (what a section imports:
`KitSection`, `useKitKeys`; a file of its own, so the sections never import
the gallery that loads them). A package adds `gallery/<name>.tsx`
default-exporting `{ title, View }`; the tab order is box, controls,
overlays, windows, code, player, then any other by name.

The glob call is kept out of `.tsx` files, even in comments: the dev
server's dependency scan transforms every file whose text holds it with its
own JSX defaults (React), and then reports `react/jsx-dev-runtime` missing
and skips the pre-bundling.

`?kit` opens it: the start menu pushes it after its first render, once per
page load, through a dynamic import behind
`import.meta.env.DEV || import.meta.env.VITE_KIT`. A normal build holds none
of it (checked: no gallery chunk, no gallery code in any chunk);
`VITE_KIT=1 npm run build` makes a build with it for the benches.

**E2E helpers.** `tests/e2e/look.ts`: `openStart`, `openKit(page,
section?)`, `kitSection`, `openFromMenu(page, key)`, `lookBox`, `startTop`,
`backTo(page, { key? })`, `dialog(page, dlg)`, `win(page, id)`,
`reducedMotion(page)`; one marked block per package for its own helpers.

### 42a — The big box, layout B, places, scenery, sky rate

(42a fills this: `Box` and its slots, the morph proxy and the
choreography, the hold wiring, the box swap, the width cap, `tall`,
`useBoxSettled`, scenery `large` = layout B, `useSkyPause`, `LookWordmark`,
`setRate('calm')`; the measurements and the blur rule.)

### 42b — Controls, widgets, icons, tokens

(42b fills this: the controls and their ARIA, the tokens on dark and
Paper, the inlay's one source, the icon set, `Seal`, `useKeyboardInset`.)

### 42c — Overlays, dialogs, popovers, cursors, letters, the stack

(42c fills this: overlay frames, the hold, key layers, the Esc rule for
fields, `Dialog`, `KeyHelp`, `Popover`, the cursors and the button zone,
`letterAction`.)

### 42d — The window frame (Lykta; dark, Paper) and the ESC menu host

**One frame, Lykta** (`src/chrome/kit/window.tsx`, `window.css`),
re-derived from the round 7 base's in-game window `win-a`: a 5 px iron
band (the start kit's grain over a dark iron gradient) with four small
riveted brackets, a centred iron hood hanging 23 px from the top with the
title (Cinzel Bold 12.5 px, lamp-lit when focused) and the note
(Cormorant Garamond italic, dim), a small iron X on the band at the right,
and the opaque lamp-lit window (`.wc-win-body`: a 1 px black edge, two
warm radial gradients over `#0f0c0a`). On Paper (`data-light` on
`.wc-windows`, from `isLight(settings.appearance.bg)` as before) the band,
brackets and hood turn bronze, the title dark and engraved, the window
cream. Every colour is a `--win-*` custom property on `.wc-windows`, the
Paper values under `.wc-windows[data-light]`; there is no look type, look
prop or `data-look` (Glass dropped, owner 2026-11-07). The cyan border,
the one-cell title row and `.wc-win-title` / `.wc-win-tn` are gone. No
`backdrop-filter` anywhere in a window: the game text scrolls under it.

Behaviour is unchanged (ADR 0103): the bar (the top 24 px) drags, eight
edges and the grip resize in whole cells, a press focuses, without focus
the title dims and the content goes to 55 % (`.wc-win-content`, 0.25 s),
the X is the close request. The resize bands now lie over the band's outer
edge (−3 to +5 px; corners 17 px) instead of the margin cells; the grip sits
in the lit window's bottom right corner, as in the mockup.

**The body in px.** The window's rectangle stays whole cells (the same
minimum 62 × 20, the default, `settings.windows`). Inside it the frame is
CSS px, mirrored by `window-geom.ts` (`BAND_PX` 5, `GLASS_EDGE_PX` 1,
`HOOD_PX` 19, `GRID_GAP_PX` 2) and `windowBody(rect, cellW, cellH)`, a pure
function: the content box below the hood, and the largest whole-cell grid
that fits it with a 2 px gap, centred in whole px. At the default cell
(10 × 19 px) that is `w − 2 × h − 2` cells, exactly the old one-cell
frame's grid, and the minimum window gives a 60 × 18 grid and a
620 × 380 px body (≥ 360 × 260). At small cells an old-look frame can get
one row or column fewer than before; it is today's TUI content and goes in
the next stages.

**The window's stack** (`WindowStack` in `window.tsx`, used by the
windows and the gallery): `LookPlaceCtx` `window`; `frameAttrs` gives a
look frame `wc-look wc-win-look` (absolute over the whole content box, the
kit's tokens, the cell grid's text rules undone: Cormorant 16 px / 1.3,
`--lk-text`) and an old-look frame `wc-screen wc-win-grid` with the grid's
px rectangle (as the start surface places old-look frames). The `wc-page`
container is the content container's (`.wc-lk-win`, 42a), not the frame's.
`windows.tsx` keeps the `WinStack` re-render guard, now on the body's
numbers (size, grid, offset), the cell size, the focus, the epoch and the
chrome store.

**`useWindowChrome({ title?, note? })`** (`window-chrome.ts`). Each window
has a store (`windowChromeStore()`, new on every open); its frames write to
it through `WindowChromeCtx` in layout effects, keyed by the frame and its
mount order. The window shows the chrome of the highest frame that calls
the hook (the one mounted last: a pushed or replacing frame mounts after
the frames below it), not of the top frame as such: a frame without the
call (a dialog, an overlay, an old-look sub-page) leaves the chrome as it
is, and when the caller pops, the frame below's call (or the defaults)
shows again. Each field falls back to the window's default on its own
(`note: ''` shows none). The window's frame reads the store with
`useWindowChromeOf` in a small `Win` component, so a title change
re-renders the frame but never the stack (the guard). Defaults: Profile
"Profile" with the profile's name as the note, Scripts "Scripts"
(`windowDefaults`). Outside a window the hook is a no-op (no store in
context).

**The ESC menu host** (`src/chrome/index.tsx`, `MenuStack`): the menu's
stack gets `LookPlaceCtx` `menu`; a look frame's element gets
`wc-menu-look` (fixed over the whole screen, inside the safe areas) and is
wrapped (`wrap`) in a `.wc-menu-page.wc-look` page carrying `data-light`
on a light game background, so the Paper tokens apply to that page alone
and nothing changes for old-look frames (the overlay itself gets no
`data-light`: `export.css` has `[data-light]` rules that would reach the
old-look Export page). The opaque background is one layer under every
shown look frame (`.wc-overlay:has(… .wc-menu-look:not([hidden]))::before`,
`--term-bg`), not each frame's own, so an overlay frame (42c) shows the
page below it. Old-look frames and the TUI border are drawn as before. No
look frame reaches the ESC menu or a window yet; the hosts are ready for
wave 2 (unit-tested with stand-in frames).

**`ProfileRoot`** moved verbatim to `src/chrome/frames/profile-window.tsx`
(43b owns it); nobody edits `windows.tsx` in wave 2.

**Gallery "Windows"** (`gallery/windows.tsx`): a dark and a Paper stage
over a plain game backdrop, each with two Lykta windows (`.wc-windows`
inside the stage): a look frame that sets its title and note and pushes a
sub-page with `InlineBack`, and on dark an old-look frame on its grid.
They move, resize and take the focus with a press; their stacks take no
keys (the gallery has them). The demo frames draw plain content, not
`Box` (the Box section shows the places).

Tests: `tests/unit/window-frame.test.tsx` (the frame's parts, the
defaults, `useWindowChrome` with revert on pop and field fallback, the
frame element unchanged when a sub-page opens, Paper, focus, the place
`window` and `menu`, the grid and look frame attributes),
`window-geom.test.ts` (`windowBody`), `tests/e2e/look-kit-windows.spec.ts`
(the frame in the game on dark and Paper, the grid on whole cells, the 55 %
dimming, the gallery's title, sub-page, focus and resize); `windows.spec.ts`
checks the title "Profile" and the note "default" (`.wc-win-t`,
`.wc-win-n`). E2E helpers (42d block of `look.ts`): `winTitle`, `winNote`,
`winTop`, `openWin`, `menuLook`.

### 42e — CodeMirror lantern theme, find panel, `LookManual`

(42e fills this: `lookCodeTheme` and the `.wc-code` rules, the lantern find
panel, `LookManual`, `ManualContents`, the find helpers; the manual's
timings.)

### 42f — Player core

(42f fills this: `fmtClock` hours, `back`, `bare`, `press`, the
`openPlayer` result, `embedPlayer`, `viewerControls`, `setPaletteTweak`.)

### 42-Z — Integration

(42-Z fills this: the merged result, the chunk sizes before and after, the
bench numbers, the test hooks, the canonical names table as built.)

## Measurements

Production builds (`vite build`, no `VITE_KIT`), raw / gzip. Each package
adds its row; 42-Z gives the totals against the stage 41 tip.

| Chunk | Stage 41 tip (`ed0a5922`) | After 42-0 | Package |
|---|---|---|---|
| start (`index-*.js`) | 21.77 / 8.18 kB | 21.77 / 8.18 kB | 42-0 |
| chrome JS | 229.55 / 82.60 kB | 229.91 / 82.77 kB | 42-0 |
| chrome CSS | 48.00 / 10.63 kB | 48.04 / 10.65 kB | 42-0 |
| editor JS | 634.13 / 209.14 kB | 634.13 / 209.14 kB | 42-0 |
| player-host JS | 34.69 / 11.42 kB | 34.69 / 11.42 kB | 42-0 |
| gallery | — | none (`VITE_KIT=1`: 1.67 / 0.97 kB JS, 0.56 / 0.31 kB CSS) | 42-0 |
| chrome JS | 229.91 / 82.77 kB (42-0) | 232.08 / 83.50 kB (+0.73 gzip) | 42d alone |
| chrome CSS | 48.04 / 10.65 kB (42-0) | 51.60 / 11.86 kB (+1.21 gzip: the frame, its Paper values, the grain tile) | 42d alone |

## Consequences

- Wave 2 imports from the kit and never edits it; a missing piece is a
  local helper in the page's own files, reported for wave 3.
- The stubs keep every page working while the packages land; a package
  replaces its stubs in place, keeping the names and types.

## Addenda to older ADRs

- ADR 0125: scenery `large` is layout B; the kit is split into modules
  (42-0, 42a).
- ADR 0103: the window frame (42d).
- ADR 0114, ADR 0018: the run log player's Back, h:mm:ss, the `openPlayer`
  result (42f).
