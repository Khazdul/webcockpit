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

**The stack's model.** The frames live in a ref that `nav` changes at once
(two pushes in one task both count, and the hold can be decided in the
same call) and a render is asked for after each change; the state hook
held only a counter. Each entry gained `overlay` and its key `layers`.

**Overlay frames.** `nav.push(node, { overlay: true })`: the frame below
stays drawn under the overlay, `inert`, and marked `data-under`; the
overlay frame (`data-overlay`) gets the keys as any top frame, and an
unhandled Esc pops it. Chains work (a dialog over a dialog: the page and
the first dialog stay drawn). The page is the topmost frame that is not an
overlay: it keeps the stack's flash while overlays are up (an overlay's
`useFlash()` is null), so a dialog's `nav.flash(…)` before its `nav.pop()`
shows on the page; an overlay push does not clear the flash, a normal push
still does. `replace` keeps an overlay an overlay. The stack measures the
page's box (its first `.wc-lk-box`, else `.wc-lk-win`) and sets its
rectangle inside each overlay frame as `--wc-ov-l/t/w/h` (clipped to the
frame, kept current by a `ResizeObserver`), so a dialog centres over the
box below, not over the whole surface; with nothing to measure (an
old-look page) the dialog centres in the frame. An overlay frame must be a
look frame (`lookFrame`), or the start surface would draw it on the cell
grid.

**`hidden` stays "not the top".** Only the top frame lacks the `hidden`
attribute; a frame drawn under an overlay or held keeps it and is shown by
CSS (`.wc-frame[hidden]:is([data-under], [data-held]) { display: block }`
in `look-overlay.css`). So every existing selector of the form
`.wc-frame:not([hidden])` (about twenty specs, the e2e helpers'
`startTop`) still means the top frame, and `inert` takes the drawn frames
out of the accessibility tree and of every pointer and focus path.

**The hold.** `FrameStackProps.hold(from, to, dir)` is asked on a push or
a pop that changes the page (never for an overlay's own push or pop);
`from` is the page that was shown, `to` the one shown next. A push keeps
the frame below drawn (`data-held="push"`, inert) for the answer in ms; a
pop keeps the popped frame mounted (the same instance, after the frames in
the same keyed list, `data-held="pop"`, inert, out of the key path) for
the answer, then unmounts it. One hold at a time: the next push or pop
ends the last, so a Back during an opening makes the frame below the top
again at once, and the frame being opened becomes the held popped one (42a
fades it from where it is). These two attributes are the surface's hooks
for its fades (42a).

**Key layers.** `useKeyLayer(handler, active = true)` adds a layer to the
frame's entry while active; the stack asks the top frame's layers, the
most recently activated first, then the frame's handler (also for a close
request's synthetic Esc). A layer returning false passes the key on.

**The Esc rule.** Look frames and overlay frames only: an Esc that no
layer and not the frame's handler consumes, pressed in a text field
(`input`, `textarea`, contenteditable) inside the top frame, blurs the
field and focuses the stack host; it does not pop. The next Esc goes back.
Old-look frames keep Esc = back from anywhere (the profile editor's
CodeMirror and the TUI fields are unchanged). Ctrl+S / Ctrl+F / Ctrl+H
reach the frame's handler from fields as before (tested). The stack reads
`lookFrame`'s marker key itself (a unit test keeps it in step with
`isLookFrame`) instead of importing the barrel: `stack.tsx` lives in the
chunk the chrome shares with the editors, and an import of `look.tsx`
there moved the whole lantern kit (6.6 kB) out of the chrome chunk into
that shared one.

**`Dialog`.** A small Lykta box: the box's iron, smaller brackets, the
hood with the title (the accessible name), an opaque lit window (0.94, no
`backdrop-filter`), the content, an error line (`role=alert`) and a row of
glass buttons; on a dim radial veil (a plain fill). It rises 8 px and
fades in 300 ms (a fade only with reduced motion). Keys: its letters
(outside text fields), Enter presses the keyboard's button (the primary
until Tab / ← → walk the enabled buttons; Tab rings, ← → stop at the
ends), Space as Enter outside fields, Esc `onCancel`, any other key too
with `anyKeyCancels` (a click on the veil as well). A dialog holds every
plain key (nav keys and characters) so the page never acts on one; keys
with Ctrl / Alt / Meta and the F-keys pass. In its text fields the editing
keys stay the field's; Enter, Esc and Tab are the dialog's. As an overlay
frame its handler is the frame's (`useKeys`); `inline` it is a key layer
over the page's handler, drawn over its nearest positioned ancestor, and
marked `data-wc-own-keys`, so keys typed in its own fields bypass the
stack (and the page) and its own `keydown` handles Enter / Esc / Tab
there. The focus returns to the stack host when a closing dialog held it.
Paper: a bronze frame and a parchment window under `[data-light]`.
Content helpers: `.wc-lk-q` (the question), `.wc-lk-qn` (a dim note);
fields take the dialog's width.

**`KeyHelp`, `openKeyHelp`.** A two-column grid (`dl`), the keys in the
terminal font, what they do in the serif; `openKeyHelp` pushes it in a
`Dialog` (`data-dlg="keys"`, one OK, any key closes) as an overlay frame.

**`Popover`.** A small lit plate (iron edge, lit lip, dark glass; Paper:
parchment) placed by script under its anchor in its offset parent's px
(above when there is no room below), kept inside it, current on resize.
Esc closes it through a key layer (and from its own fields through its own
`keydown`: it carries `data-wc-own-keys`); a press outside it and outside
its anchor closes it (the anchor's own click toggles). No
`backdrop-filter`.

**Cursors.** `useListCursor` and `useGridCursor` share one core: a pointer
*move* (not `pointerenter`) moves the cursor, a touch never hovers; after
a key the cursor's row (`[data-i]` inside `scrollRef`) is scrolled into
view (`block: nearest`), never after a pointer. Mouse and pen: with
`activateOn: 'click'` (default) a click moves and activates, with
`'dblclick'` a click moves and a double click activates. Touch:
`'tap-activates'` (default with `click`) a tap activates;
`'tap-selects'` (default with `dblclick`) the first tap moves, a tap on
the cursor's row activates; a touch double tap never activates twice. The
pointer type is read on `pointerdown` (`rowProps` adds `onPointerDown`; a
`click` is not a `PointerEvent` in every engine). The grid: ← → one item
across the row ends (around the ends with `wrap`), ↑ ↓ one row (↓ onto a
shorter last row goes to its last item), PgUp / PgDn `page` items in whole
rows. The cursor stays inside `count` when the list shrinks.

**`useButtonZone`.** One ring: the list, then the enabled buttons; Tab
forward, Shift+Tab back. In the buttons ← → (and ↑ ↓) walk the enabled
ones and stop at the ends (wrap with `wrap`). A button that becomes
disabled hands the keyboard to the next enabled one, else the one before,
else the list. Added: an optional `press(id)` so Enter / Space in the
zone press the keyboard's button (without it the page reads `sel`).

**`letterAction`.** Fires only outside text fields (`input`, `textarea`,
`select`, contenteditable) and without Ctrl / Alt / Meta; Shift is allowed
(Caps Lock); the map's letters in either case. `inTextField` is exported
from `look-keys.ts` (the dialog uses it).

**The gallery's Overlays section** (`gallery/overlays.tsx`): every dialog
shape as an overlay frame (a question with Y / N / Esc that flashes on the
page, an input dialog with a `Field` and its error, an error dialog, an
any-key dialog, the keys box), an inline dialog in a panel (with a Paper
toggle), a popover with a `Seg`, a `Toggle` and a `Field`, a filter
`Field` (the Esc rule), a 30-row list with its cursor and a button zone
(one button can be disabled), and a grid with its cursor. Layout by inline
styles (the section has no stylesheet; the gallery is dev only).

**Test hooks.** `.wc-frame[data-overlay]`, `[data-under]`,
`[data-held="push" | "pop"]`, `.wc-stack.has-overlay`,
`.wc-lk-dialog[data-dlg]` (`.wc-lk-btn[data-btn]`, `.is-sel`,
`.wc-lk-dialog-err`), `.wc-lk-veil.is-inline`, `.wc-lk-keyhelp`,
`.wc-lk-pop`; e2e helpers `drawnBelow`, `overlayTop`, `dialogButton`,
`dialogSel`, `kitOut` in `tests/e2e/look.ts`.

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

42c, against the 42-0 tip (`2c2601bd`), raw / gzip: chrome CSS 48.04 /
10.65 → 52.91 / 11.68 kB (`look-overlay.css`); the shared chunk that holds
`stack.tsx` (`scripts-model-*.js`, loaded with the chrome and the editors)
41.21 / 15.62 → 43.60 / 16.44 kB; chrome JS, start, editor and
player-host unchanged (`Dialog`, `Popover`, the cursors and the zone are
tree-shaken until a page uses them; wave 2 adds them).

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
