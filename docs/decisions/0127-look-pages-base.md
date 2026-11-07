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

**`Box` adapts to its place.** `start`: without `onBack` the menu panel;
with it a sub-page, `normal` (centred under the 0.62 wordmark, as stage 41),
`tall` (a normal box that grows to the window's bottom margin, its content
box filling it; on the phone the wordmark and the almanac hide for it and
the box starts near the top), or `large` (layout B: `.wc-lk-large`, inset
`--lk-box-m` on every side, `clamp(12px, 1.9vw, 28px)`, 6 px under 600 px;
`maxWidth` caps it, centred, through `--lk-box-maxw`). `window`: no iron,
hood or Back (`.wc-lk-inwin`, the content box fills the window body; the
window's title bar carries the title, the page calls `useWindowChrome`
itself: `Box` does not). `menu`: a full-screen box with the hood and Back
(`.wc-lk-box-full`), no blur. Every place's content box (`.wc-lk-win`) is a
flex column, `min-height: 0`, and an inline-size container named `wc-page`;
`BoxHead` / `BoxFoot` are `flex: none`, `BoxBody` fills and scrolls
natively. The large window's padding uses `:where()` so a page's own
`winClass` padding wins. A new `title` cross-fades in the hood (200 ms).
A `Box` inside a box sets no scenery and reports nothing (the gallery's
place previews): `Box` provides `SceneryCtx` and `BoxHostCtx` as null to
its children.

**The morph (`src/chrome/start-morph.tsx`, `MorphStage`).** Every frame on
the start surface is wrapped (the surface's `wrap`) in a `LookHost`, which
adds no element (a wrapper element broke the many `.wc-frame > …`
selectors of the specs): it takes its frame's outermost box's report
(`BoxHostCtx`: element and kind, `menu | normal | tall | large`; `grid` for
an old-look frame) and tells the stage when its frame becomes the top
one. The stage plans the change with `morphPlan(from, to, reduced)` (pure,
in `look-motion.ts`, unit-tested) and runs it with Web Animations, all on
the document timeline, so the hand-overs fall on one frame:

- the new box is laid out at its final size at once and hidden with a
  `visibility` animation until the landing (pages measure the real box at
  mount; the e2e spec's ResizeObserver log sees one size);
- the proxy (`.wc-lk-morph`: the four brackets, the hood, the window glass;
  `position: fixed`, `contain: strict`, `hidden` when idle) animates
  `left/top/width/height` with `fill: backwards` and `visibility: visible`
  in its keyframes, so it is gone on the very frame its animation ends and
  the real box shows; its hood animates its width (74 px until 25 %, or
  back by 75 %);
- the content (the window's children, the hood's title, Back) fades in
  320 ms after the landing; the old box's content fades out before the
  flight when the stack still draws it;
- the old frame's own scenery is marked `.wc-lk-fades` (the menu's quote)
  and fades with it; the wordmark and the almanac are CSS transitions on
  the surface's classes (`is-large`, `is-lift-sub` when it lifts from the
  sub-page's smaller mark, `is-from-large` for the settle timing), so a
  reversal turns them round by itself;
- a frame change during a flight starts the next flight from the proxy's
  current rectangle at once (a newer animation wins over an older one on
  the same element, so nothing needs cancelling but the proxy's).

Pairs: menu or normal → large `open`, large → menu or normal `close`,
large → large and normal → normal `swap` (the content cross-fades 140 / 220
ms; a different rectangle flies 380 ms), menu ↔ normal and anything with an
old-look frame `none` (stage 41's behaviour). Reduced motion: `open` and
`close` are a `fade` of the whole boxes (260 / 240 ms), `swap` keeps its
content fades, no proxy.

**The hold.** The surface passes `hold` to the stack (`morphHold(kind of
the current top, dir)`: 350 ms from the menu (the quote's fade), 200 from a
normal box, 240 from or popping a large one, 140 popping a normal one; 0
when either frame is old-look) and hides the held frame itself as soon as
its plan is done with it (a `visibility` animation, cancelled when that
frame is the top again). Until 42c's hold lands the old frame goes at once:
the plan then has no content fade (`shown: false`), and the proxy starts
from the old box's last rectangle, kept current by a ResizeObserver on
the top box (and the surface's size), never per frame. A popped frame
stays the stage's last top after it unmounts (an unmount runs before the
next frame's effects) and keeps its last box report, so the close starts
from it.

**Settled.** `useBoxSettled()` reads the frame host's state: false from the
mount until the content's fade-in animations have finished (and not before
their planned length); true at once with reduced motion, when nothing
morphs, and outside the start surface (the context's default).

**Scenery `large` is layout B** (ADR 0125 addendum): no wordmark (it lifts
46 px and fades, 620 ms; it settles back after a 320 ms delay over 700
ms), no almanac (it fades 350 ms and comes back 0.92 s after the close
began; its clock stops while hidden), no quote. The wordmark stays the
full one (stage 41's corner mark is gone) and its sheen stops while large.

**The sky.** `StartSkyHandle.setRate('calm')` caps every canvas at
32 ms between repaints (stars, clouds, rain and snow; `calmTier`), set by
the surface while the top box is large and covers ≥ 85 % of the view
(`CALM_COVER`; the sky's root carries `data-sky-rate` once it changes). A capped box at 1440 px
covers about 79 %: full rate. `useSkyPause(on)` pauses the sky while `on`
and its frame is the top one (a counter on the surface; no-op elsewhere).
`LookWordmark({ size })` is the wordmark inside page content, following
the sky's light, its sheen only while its frame is the top one.

**The blur rule: kept.** Measured on a `VITE_KIT=1` production build,
Iris Xe, real windows, Chromium and Firefox, 1728×1000 @2 and 390×844 @3
(`bench/look-box-bench.ts`, `bench/results/look-box.md`): the large box
with the blur idles at 60 fps, at or above the menu (58.2–59.8), no frame
over 50 ms, so large boxes keep `blur(9px)` and the 0.68 fill
(`--lk-large-blur`, `--lk-large-fill`; the gallery's Box section switches
them for comparison).

**The morph's cost.** No long animation frame (none over 20 ms in
Chromium; the main thread idles), 56–60 fps, but 2–11 of a morph's ~80
frames skip one vsync (33 ms; max 50 ms once per browser), against about
1.5 a second on the idle menu. The proxy's repaint is part of it (no
proxy: 0–3 skips), the large window's blur appearing and the content's
fade are the rest. The target "no frame over 16 ms during a morph" is not
met on this machine: open for 42-Z (a lighter proxy during the flight).

**The gallery's Box section** (`gallery/box.tsx`): demos of a large box, a
capped one (1180 px), a tall box, normal → normal, large → large (History
1180 → Export full width); each demo shows `useBoxSettled`, counts `x`
presses (keys during a morph) and logs its box's sizes (`__lkBoxLog`); the
sky pause toggle, the glass switch and the three places side by side. With
`?kit` in the address, `k` on the start menu reopens the gallery (the
menu → large morph for the benches and specs; dev and `VITE_KIT` only).

**Test hooks.** `.wc-start[data-lk-morph]` (the running plan's type, gone
when it ends), `.wc-start[data-lk-box]` (the top box's kind),
`.wc-lk-morph` (the proxy), `[data-sky-rate]` on the sky's root; e2e
helpers `morphDone`, `morphProxy`, `openBoxDemo`, `boxLogs`
(`tests/e2e/look.ts`). `openKit` now reads the gallery's own hood
(`:scope > .wc-lk-hood`), since sections draw boxes inside it.

### 42b — Controls, widgets, icons, tokens

(42b fills this: the controls and their ARIA, the tokens on dark and
Paper, the inlay's one source, the icon set, `Seal`, `useKeyboardInset`.)

### 42c — Overlays, dialogs, popovers, cursors, letters, the stack

(42c fills this: overlay frames, the hold, key layers, the Esc rule for
fields, `Dialog`, `KeyHelp`, `Popover`, the cursors and the button zone,
`letterAction`.)

### 42d — The window frame (Lykta; dark, Paper) and the ESC menu host

(42d fills this: the one Lykta frame and the end of the cyan border,
`useWindowChrome`, the window and menu look hosts, `ProfileRoot` moved.)

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
| chrome JS | | 240.25 / 86.36 kB (+10.34 / +3.59) | 42a |
| chrome CSS | | 51.64 / 11.28 kB (+3.60 / +0.63) | 42a |
| start (`index-*.js`) | | 21.77 / 8.18 kB (unchanged) | 42a |
| gallery | | `VITE_KIT=1`: 6.42 / 2.90 kB JS, 1.62 / 0.70 kB CSS (with the Box section) | 42a |

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
