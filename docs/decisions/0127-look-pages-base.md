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

**Files.** `look-controls.tsx` (the components), `look-controls.css` (their
look; imported by the module, so it rides in the chrome chunk with the
kit), `look-glass.css` (the glass buttons, Back, the icons' base rule and
the shortcut letters; shared with the player), `look-tokens.css`,
`look-icons.tsx`, and one added export in `src/start/wordmark-svg.ts`
(`INLAY_TOKENS`). Re-derived from the round 7 base
(`round7/base/base.css`, `gallery.html`) in the app's classes, never
copied.

**Tokens.** Every colour a control reads is a `--lk-*` custom property on
`.wc-look`; the Paper values sit under `[data-light] .wc-look` and
`.wc-look[data-light]`, so a window body or the ESC menu on the Paper
background turns every control light with no per-control rule (a handful
of Paper rules remain where the light needs another shape: no glows, the
toggle's groove, the chosen option's edge). The API's list is the
contract (`--lk-text … --lk-win-fill-large`, the type, `--lk-box-m`, the
inlay, `--lk-ts`); the kit adds its own working tokens beside it
(`--lk-on-glow`, `--lk-ic-on`, `--lk-danger-hot`, `--lk-danger-glow`,
`--lk-sk`, `--lk-sk-on`, `--lk-glass*`, `--lk-back-text`, `--lk-well-lip`,
`--lk-well-in`, `--lk-option-bg`, `--lk-row`, `--lk-row-sh`,
`--lk-scroll-thumb*`, `--lk-flash*`, `--lk-inlay-metal`), which pages may
read but should not need to set. `--lk-accent` and `--lk-gold` are both
the base's gold (`#e9c47c`; Paper `#8a5a0e`): accent is the role (focus
rings, the changed-setting mark), gold the colour (Saved, stars), so a
later change of the accent does not recolour the stars. `--lk-soon` is
History's warm "soon" (`#e8a65e`). `--lk-mono` is the user's terminal
font (`--font-mono`), not the mockups' JetBrains Mono (open question 1).
`--lk-box-m` is `clamp(12px, 1.9vw, 28px)`, 6 px at ≤ 600 px and on the
phone; `--lk-ts` is 0.2 with reduced motion. The window fills on Paper are
the opaque cream of the window body (`#f7f0de`).

**The inlay's one source.** `--lk-inlay-hi / -mid / -lo` are the
wordmark's day metal's first three stops, `--lk-inlay-ink` COCKPIT's ink,
`--lk-rivet-*` the day rivets; `--lk-inlay-metal` is the whole banded
metal as one gradient (the Credits drop cap, the Spotlights playhead).
`wordmark-svg.ts` exports `INLAY_TOKENS` (pure, tree-shaken from the
start chunk) and `tests/unit/look-controls.test.tsx` compares the CSS with
it, so a tint change in one place fails the test until the other follows.
The inlay has no Paper value: it is metal, it reflects either way.

**Controls and their ARIA.** Buttons, options, tabs, checks, toggles and
fold heads never take the DOM focus (`tabIndex=-1`, the press's
`mousedown` default prevented); the page's keys reach them through
`selected` / `.is-sel` and the letter marked in the label. Text fields and
selects are real elements and do take the focus while typed in (the
stack's Esc rule gives it back, 42c).

| Control | Element and ARIA | Notes |
|---|---|---|
| `GlassButton` | `button.wc-lk-btn[data-btn]`, `aria-disabled`, `aria-keyshortcuts`; icon-only: `aria-label` = `title` | `.is-primary` (fuller glass), `.is-danger`, `.is-small` (28 px), `.is-icon` (square), `keep-ic`; the phone hides icons except `keep-ic` and icon-only |
| `Seg` | one choice: `radiogroup` of `radio`; `multi`: `group` of `checkbox`; both `aria-checked`, `[data-opt]` | `kind="pills"`: one line scrolling sideways, the keyboard's (or the chosen) pill kept in view by setting the row's own `scrollLeft` (never `scrollIntoView`, which would scroll the page); a click on the chosen option of a single `Seg` is a no-op |
| `Tabs` | `tablist` of `tab`, `aria-selected`, `[data-tab]` | a fine lit underline; scrolls sideways when narrow |
| `Field`, `TextArea` | `label.wc-lk-field[data-field]` > caps label, `input` / `textarea.wc-lk-input`; `aria-invalid` and `aria-describedby` (the error or hint line) | `onCommit` is the input's `change` (Enter or leaving after a change); `user-select: text`; kept above the soft keyboard (below) |
| `Check` | `button[role=checkbox]`, `aria-checked`, `[data-field]` | a small well with a lit tick |
| `Toggle` | `button[role=switch]`, `aria-checked`, `aria-label` | groove, riveted knob, "On / Off", the label |
| `Select` | a native `select` (`aria-label`) in a well, its label, a chevron mask in the dim ink | options take the theme's `--lk-option-bg` |
| `Table`, `TableRow` | `table` > `row` of `columnheader` (`aria-sort`, `[data-dir]` `1` ▴ / `-1` ▾, `[data-key]`) and `rowgroup.wc-lk-tbody` > `row.wc-lk-tr[data-id]` | `scroll` (+ `bodyRef`): the heads stay, the rows scroll in the iron scrollbar; `stackBelow`: a `ResizeObserver` on the table sets `.is-stacked` (heads hidden, two-line rows) below that width; `TableRow` also takes a cursor's `rowProps` and a `class`; lining tabular figures |
| `Rule`, `OrnRule`, `Fold`, `Well`, `Stars` | `h3.wc-lk-sec` + hairline; `separator`; `button[aria-expanded]`; a solid well; `img` "n of max" | `Fold` takes a `class` (a page's `.is-cur`) |
| `LookFlash` | `status`, `aria-live=polite` | controlled (`flash`) it renders without a frame (a dialog, the gallery); otherwise the stack's flash |

Two small additions to the API, both optional: `Table` `scroll` /
`bodyRef` (History's fixed heads over scrolling rows needed a body element
the table owns), and `class` on `TableRow` and `Fold`.

**Rows and helpers.** `.wc-lk-rows > .wc-lk-row` (cards; `.is-flat`
hairlines), `.is-on` brightens the text only, `.is-idle` a dimmer chosen
row while the keyboard is elsewhere, `.is-cur` a fine lit tick at the left
(also on table rows), `.is-disabled`. `.wc-lk-scroll` is the thin iron
native scrollbar (`scrollbar-width: thin` plus the WebKit rules). Text:
`.wc-lk-sec`, `.wc-lk-lead`, `.wc-lk-txt`, `.wc-lk-kv` (a `dl`),
`.wc-lk-empty`, `.wc-lk-dim / -faint / -gold / -ok / -bad / -mono`; links
in `.wc-look` are lit and underlined, except inside an old-look frame on
the cell grid (`.wc-screen`), which keeps its TUI look.

**Icons.** Every name of the API is drawn (`ICONS` is now a full
`Record<IconName, …>`, so a missing drawing is a type error): 16 × 16 line
drawings in one stroke weight with round caps, the start menu's at 18
(the door 22), and the two skip buttons (`back10`, `fwd10`) at 24 with a
small "10" (`text` in the icon is filled, not stroked) and their own
stroke width. A page's own drawing stays an `IconDraw`.

**`Seal`.** The "M" mark is `public/favicon.svg` as an `img` (base-URL
aware): the favicon's own drawing (`scripts/build-favicons.ts`), no SVG ids
to clash when several show, no bundle bytes, and already cached by the
browser.

**`useKeyboardInset`.** `keyboardInset()` is the layout viewport's height
the visual viewport does not cover (`innerHeight − height − offsetTop`); a
pinch zoom (scale > 1) is told apart by comparing `height × scale`. The
hook listens to the visual viewport's `resize` and `scroll` and updates at
most once a frame. Fields also keep themselves above the keyboard: when
the visual viewport shrinks under a focused field, it scrolls into view
(`block: nearest`).

**Phone and touch.** `@media (pointer: coarse)`: every kit target
(buttons, Back, options, tabs, checks, toggles, fields, selects, fold
heads, rows, table rows) is at least 40 px high, icon-only buttons as
wide. Nothing depends on hover: on `hover: none` / coarse pointers a
sticky `:hover` after a tap does not light a button or an option (only the
keyboard's `.is-sel` and the chosen state light).

**Performance.** No `backdrop-filter` on any inner surface (wells, rows,
tables, cards, the select): solid or plain translucent fills. The glass
buttons keep their small `blur(4px)` over the sky and in dark windows (an
opaque body under them); on Paper it is off (`--lk-glass-blur: none`).
Transitions are colour, opacity and the knob's transform, scaled by
`--lk-ts`; with reduced motion the knob and the fold chevron do not move
at all.

**Gallery.** `gallery/controls.tsx` (+ `controls.css`): every control in
every state and every icon, on a chosen surface: over the sky, in a dark
window body or a Paper one (stand-ins for 42d's body; `?kit=controls&
surface=paper` opens on one). Keys: ← → the keyboard's button, ↑ ↓ the
keyboard's option, Enter presses, S / W / P the surface, L / E / H the
view.

**Open.** The start page bundles only Cormorant Garamond *Medium Italic*
(stage 41, `src/theme/fonts.ts` `START_FACES`), so upright `--lk-serif`
text (body text, rows, fields, the kv values) renders in that italic
face. The pages of stages 43–47 set a lot of upright Cormorant; adding the
upright Medium face (Latin subset, OFL) to `START_FACES` is a change in a
file outside 42b (reported for 42-Z).

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

The code wells and the manuals of the new-look pages, in the lazy editor
chunk: `src/editor/look-code.ts|css`, `cm.ts` (the `look` option),
`search.ts`, `look-manual.tsx|css`, `look-manual-find.ts`. Nothing on
today's pages changes: `tui` stays the default look, and the TUI find
panel and manual (`manual-view.tsx`) are untouched (one fix: the TUI
panel now redraws its count when typing finds nothing).

**`lookCodeTheme()`** returns the structure only (an `EditorView.theme`)
and `EditorView.editorAttributes` with `LOOK_CODE_CLASS` (`wc-code`), so
a buffer is styled without its host doing anything. Every colour is a
`--lk-code-*` custom property of `look-code.css`, defined on `.wc-code`
(and on `.wc-lk-search`, `.wc-lk-manual`) for dark and again under
`[data-light]` for Paper: one theme object for both backgrounds, and a
window that turns Paper needs no reconfigure. The font is `--lk-mono`
(the user's terminal font; open question 1), 13.5 px on a whole-pixel
22 px row (12.5 / 20 px on the phone) so rows never drift; the gutter is
a darker strip with a hairline; the current line is a faint band with a
lit 2 px tick, only while focused; the caret and the native selection are
warm; search matches are soft amber with a ring, the current one
brighter; the matching bracket is a fine ring (tt++ `.wc-brace-match`
and Lua `.cm-matchingBracket` alike); lint ranges get a dashed underline
(error red, warning gold) and the lint gutter a lit dot (a ring for a
warning). The token palette is the round 7 base's: tt++ `wc-syn-cmd`
keyword gold, `brace` / `delim` operator, `var` the teal name colour,
`code` (colour codes, escapes) number orange, inert commands a wavy gold
underline; Lua `wc-lua-kw|str|comment|num|std` (keyword, string green,
comment italic grey, number, API names teal). The rules are keyed
`.wc-code .wc-syn-*` / `.wc-code .wc-lua-*` (and, for the matches,
`.wc-code.cm-editor .cm-scroller .cm-line …`), so they outrank the TUI's
global `wc-syn-*` and `.wc-ped-buffer` rules whatever the CSS order. The
Lua pop-up plates (completion, hover, signature, the lint tooltip) stay
44b's (`lua-cm.ts`, `script-editor.css`).

**`BufferOptions.look = 'lantern'`** (cm.ts) swaps `theme()` for
`lookCodeTheme()` and asks `searchExtension` for the lantern panel at the
top. 44b's Lua buffer does the same in `lua-cm.ts`:
`lookCodeTheme()` instead of `theme()`, `searchExtension({ look:
'lantern', top: true, onFocus })`.

**The lantern find panel** (`searchExtension({ look: 'lantern', top })`).
The panel logic (the query from the fields, typing seeks from where the
search began, next / previous, replace one / all, the keys) moved into a
base class shared by both looks; the lantern subclass draws the kit's
`Field` (mono), the count, a multi `Seg` (Case / Word / Regex) and
icon-only `GlassButton`s (up, down, close), plus a Replace row (`Field`,
Replace, All) when the buffer is editable, with Preact into the panel's
element (`render()` per sync; a dozen elements). The root keeps
`.wc-search` beside `.wc-lk-search`, so `searchFocused` and the frames'
`closest('.wc-search')` focus checks hold; look-code.css undoes the TUI
grid rules on it. Keys are unchanged (`searchFrameKey`; Enter / F3 /
Ctrl+G next, Shift previous, Enter in Replace replaces, Ctrl+Enter all,
Alt+C/W/R, Tab and ↑↓ between the fields, Esc closes). Buttons never take
the focus (the field keeps it). A step selects the field's text (that is
CodeMirror's own `findNext`, as in the TUI). The panel is an inner
surface: an opaque plate with a ring and a drop shadow, no blur; with
`top` it drops in (250 ms × `--lk-ts`; a 150 ms fade with reduced
motion). Hooks: `.wc-lk-search`, `[data-field=find|replace] input`,
`.wc-search-count` (`.is-bad`), `[data-opt=case|word|regex]`,
`[data-btn=prev|next|close|replace|all]`.

**`look-manual-find.ts`** (pure). A section is drawn as blocks
(`manualBlocks`: the heading, each syntax line, each paragraph, each `- `
item without its dash, the labels "Parameters" and "Returns" (a
`Parameters:` line's items become parameters, `Returns: x` the label and
the paragraph x), each example note and each example line, with the
example's index and language). A block's text is exactly the text the
reader draws for it (links and colours are spans inside it), so a match
(section, block, from, to) maps straight onto the block's text nodes, and
a match never spans two blocks (the TUI's rule: within one row).
`findInSections` (cap 1000, `capped`), `firstInSection` (typing searches
from the current section on, wrapping), `sectionCountText` (the panels'
"3 of 12", "12 matches", "No matches", "Bad regex", "1000+"),
`matchesByBlock`. The blocks are cached per section object.

**`LookManual`** (the API's props, plus two additions: `example(line,
lang)` gets the line's language, and `codeLine(line, lang, luaKnown?)` is
exported as the ready-made example hook; `ManualContents` takes `active`,
the fine tick while the list has the keys).

- *Layout.* A head (the Contents button under 700 px; the find, always
  with `find: 'head'`, after Ctrl+F with `'bar'`), then the contents (250
  px, `contents: 'own'`) beside the text. The reader is an inline-size
  container (`wc-lkman`): under 700 px of its own width the contents
  become an opaque overlay over the text (opened by Contents, Tab or ←;
  Esc, a choice or → / Enter closes it), the find's toggles hide (Alt
  keys still work); under 560 px the text steps down a size. The text is
  the script manual A's typesetting: group dividers with hairlines,
  Cinzel headings (a code name such as `#alias` or `string.format` in the
  terminal font), syntax lines in a well, paragraphs at 76ch, diamond
  lists, the small-caps labels, parameters `name (type): text`, italic
  example notes, examples in `.wc-code` wells (`pre.wc-lk-mcode`, one
  `span.wc-lk-mline` per line). A list item's leading name (`- name: …`)
  becomes a link when the host's `link(name)` returns a section (the Lua
  index). Coarse pointers: contents entries and group heads 40 px.
- *Drawing in chunks.* The first screen (24 sections, or through
  `initial` and 8 more) is drawn with the reader; the rest in idle chunks
  of 32 (`requestIdleCallback`, `setTimeout` without it) as empty
  placeholders until then (480 px). A section's element is cached, so a
  chunk diffs only the new ones. A jump or a match beyond the drawn
  sections draws through it first. Sections are `content-visibility:
  auto` (`contain-intrinsic-size: auto 480px`).
- *Jumps.* `goto` puts the section's own top at the text's top (so the
  browser's scroll anchor is the section itself: sections above it that
  are laid out late, or fonts, do not move it) and settles over three
  frames, cancelled by the reader's wheel, touch, press or scroll keys.
  Measured need: without it the target drifted out of view in Firefox
  (and in Chromium under load).
- *The current section* comes from an `IntersectionObserver` with a 1 px
  band 24 px under the text's top (rebuilt only when the text's height
  changes); the spy never reads layout per scroll event. While a jump
  settles, its reports are stale and ignored (the jump has set the
  section). `n` is the next section; `p` the current one's heading when
  the text is below it, else the previous one (and always the previous
  one right after a jump). `onSection` hears every change.
- *Keys* (`ctl.key`, the host's frame calls it first): ↑↓ 44 px (in the
  contents: the section), PgUp / PgDn and Space / Enter a page (Shift
  back), Home / End, ← / Tab to the contents and → / Enter / Tab back,
  `n` / `p`, Ctrl+F (open or select), F3 / Ctrl+G (Shift back), Alt+C/W/R.
  In the find field: Enter next (Shift previous), Tab back to the text,
  Esc clears the query (`head`) or closes the bar (`bar`) and leaves the
  field; letters and arrows are the field's. Esc outside the field: the
  overlay, then a non-empty find, else `false` (the host's Back). Tab and
  ← are the host's with `contents: 'none'`.
- *Marks.* The CSS Custom Highlight API: two highlights shared by every
  reader on the page (`wc-lk-find`, `wc-lk-find-now` with priority 1;
  each reader registers its ranges, the registry is rebuilt from all of
  them), so the profile Help and the script manual can be open in two
  windows at once. The ranges are built once per result (and when a chunk
  draws more sections); a step changes only the current one. Where the
  API is missing (happy-dom; older browsers) the blocks with matches
  are drawn with `mark.wc-lk-mark` (`.is-now`) instead. A step or a new
  query scrolls the current match's block into view only when it is not.
- *Find memory.* `memory.query` is written on every change and read at
  mount; the bar reopens with it.

**`ManualContents`**: the groups as folding heads with counts; a group of
over 30 sections starts folded unless it holds the current section, and
opens when the current section moves into it (it can be folded again);
the current entry is lit (`.is-on`, `aria-current`) and kept in view by
setting the list's own `scrollTop` on a change (never `scrollIntoView`).
Folded groups draw no entries. The profile editor's rail (43) uses it
with `contents: 'none'`; the gallery's "Host rail" shows that pairing.

**Gallery section "Code"** (`gallery/code.tsx|css`): Dark / Paper; a
lantern tt++ buffer (Ctrl+F, Ctrl+H, the brace ring, the inert-command
underline, the line and column under it); the Lua and tt++ palettes
through `codeLine`; the profile and script manuals with contents own or a
host rail and find in the head or as a bar (`data-open-ms`: the time from
the choice to the first frame with the manual). The editor parts load
with a dynamic import, as the pages load the editor chunk.

**Tests.** `tests/unit/look-manual-find.test.ts` (the blocks of both
manuals, the toggles, a bad regex, the 1000 cap, the count texts,
`firstInSection`), `tests/unit/look-manual.test.tsx` (every block of both
manuals drawn with exactly its text, with the hooks; groups, lists,
parameters, examples; the Lua index links; `codeLine`; the contents,
folding and counts; `goto`, `initial`, `onSection`; n / p, Tab, ↑↓, the
narrow overlay; find in the head and as a bar with marks, the toggles,
Bad regex, the buttons, the memory; drawing in chunks and through a
match), `tests/e2e/look-kit-code.spec.ts` (the lantern panel at the top:
n of m, toggles, Bad regex, Replace, All, Esc; the manual's n / p, find
with marks and Esc, the Lua links, the narrow overlay, the host rail and
the find bar, Paper). E2E helpers (42e block of `look.ts`):
`lanternFind`, `lookManual`, `manualSection`, `manualMarks`,
`openKitCode`.

**Found on the way (for 42-Z, not 42e's files):** the app ships only
Cormorant Garamond *Medium Italic* (`src/theme/fonts.ts` `START_FACES`,
declared as the family's only face), so every upright `--lk-serif` text
(the manual's body, the page texts of 43–47) renders italic. The pages
need the upright Medium face (latin subset) beside it.

### 42f — Player core

The core that stage 45 (the run log player) and stage 46 (the Spotlights
viewer) build on, in `src/player/strip.ts`, `view.ts`, `player.css`,
`src/app/player-host.ts`, `shell.ts` and `src/chrome/kit/hooks.ts`.

**h:mm:ss.** `fmtClock(ms, hours = false)`: with `hours`, `h:mm:ss` from
one hour (`1:34:07`, hours not padded, `100:01:01` past 99) and today's
`MM:SS` below (`02:02`), so a short session reads as before. The view's
`hours` option uses it for the clock and the rail's time hint (the marker
tips hold no times). On for the run log player (and for stage 46's
viewer); off by default, so the HTML replay keeps `MM:SS` (`221:07`).

**Back.** The view option `back: { title }` adds the kit's Back
(`button.wc-lk-back.wc-pv-back.wc-look`, the kit's chevron and "Back",
`title` and `aria-label` from the option, `tabIndex -1`, a press never
takes the focus) as the first child of `.wc-player-chrome`, at 10 / 6 px
from the top left. Being part of the chrome it fades and stops taking the
pointer with it (`[data-hidden]`), with no work of its own. A click closes
an open popup, then calls `onEsc` (as Close and Esc). The header's left
part moves right of Back when, centred, it would meet it: Back's right
edge is measured once (`offsetLeft + offsetWidth + 8`, the first render
where it has a size), and the header then starts there and narrows to
the room left, so the hints give way first and the left part is cut, never
covered. The chrome's `button { all: unset }` reset skips Back through
`:where(:not(.wc-pv-back))`, keeping the reset's old specificity so the
box's own rules still win over it. The run log player keeps Close and the
header's `ESC Back` (stage 45's open question 1; default: keep all three).

*Deviation: the CSS.* The stage file had `player.css` import
`look-glass.css`. Measured on a build, that adds 1.46 kB gzip to the HTML
replay bundle (budget: 1.5 kB) before 42b grows the glass rules and the
tokens, for a Back the replay never shows. So `player.css` imports
nothing: the in-app player only opens from the start page (History, the
Spotlights page, the dev hooks after boot), whose chrome chunk has already
put the kit's glass rules and the `--lk-*` tokens in the document; the
Back carries `.wc-look` itself for the tokens (and their Paper values
under a light player's `[data-light]`). A player shown without the chrome
CSS would draw Back as a plain button; none does.

**Bare.** The view option `bare` builds no chrome in the page: an empty
`.wc-player-chrome[data-bare]`, no header, rail, markers, control box,
popups (the `settings` option is ignored), hint, tip or Back, and nothing
auto-hides (`startHidden` is ignored). The keys, the pause cursor line,
the wheel and clicks on lines stay the view's, and `render` only keeps
`data-playing` / `data-seeking`. The host keeps no rail width for a bare
view: the stage takes the whole width and the font fit uses it
(`railW` 0, per `openChain`).

**press.** `PlayerView.press(act)` with `PlayerAct = 'start' | 'back' |
'play' | 'fwd' | 'slower' | 'faster'`: the control box's buttons for a
page's own controls; `play` plays or pauses and, paused with the cursor
moved, resumes from the cursor line as Space does.

**Keys while parked.** The view owns every key through a window capture
listener (ADR 0018). It now lets a key pass when its root is not shown: not
connected, or the root or an ancestor `hidden` or with an inline `display:
none` (no layout read; one parent walk per key). So an embedded host
parked under its page (stage 46 keeps the host alive on the wall) does not
take the page's keys, and the full-page player no longer swallows keys
while it loads hidden.

**The open's result.** `type PlayerOpenResult = { ok: true } | { ok:
false; error: string }` (in `hooks.ts`). `ChromeServices.openPlayer(session)`
and `Shell.openPlayer` / `openPlayerChain` resolve to it once the player
shows or did not open. The reasons are sentences for History's error box
(stage 45): `The run log is not stored.` (no stored run of the session),
`The run log is empty.` (runs with no text; both thrown by
`PlayerHost.open`, which used to open an empty player), a read error's own
message, `Another player is open.`, `The player opens from the start page
only.` and `The player was closed while it opened.` A failure is still
logged to the console. `PlayerHost.open(session, lib, opts?)` takes the
mode, as `openChain`.

**The run log mode.** The shell opens the run log player (`openPlayer`,
and the dev hook's `openPlayerChain`) with `view: { back: { title: 'Back
to History (Esc)' }, hours: true }`. `PlayerOpenOptions.view` passes
`hours`, `back` and `bare` through. The Spotlights reel is unchanged (its
options are `spotlight-mode.ts`'s, stage 46's).

**Embedded.** `ChromeServices.embedPlayer(slot)` / `Shell.embedPlayer`: a
`PlayerHost` whose root is `slot` (the host's `.wc-player` fills it,
`height: 100%`, and its ResizeObserver follows the slot's size), with a
no-op `onClose`. The start page stays shown; the host is the shell's
`playerHost` (the dev hook `__wc.shell.playerHost`) until it is disposed
(`onDispose` clears it; `close()` disposes, and shows or hides nothing).
While it lives, `openPlayer`, `openSpotlights` and a second `embedPlayer`
are refused (null for `embedPlayer`). The caller opens what it plays
(`host.open` / `openChain`). Both kinds of host come from one loader in
the shell (`makeHost`: the refusals, the one dynamic import, the host as
`playerHost`), so the start chunk holds the player chunk's import once.

**Viewer controls and the palette tweak.** `PlayerHost.viewerControls(
displayOnly)` is public (it was the private `controls(panes)`): the same
`ViewerControls` the box's popups use, over the host's overrides, so a
page's own Display popover and the font and colours hold across the
chains a host plays. `PlayerHost.setPaletteTweak(map | null)`: ANSI index
→ colour, applied in `compose()` over the recorded palette (to
`appearance.ansi`, so `--ansi-N` and the bold tokens follow) only while
the viewer's theme is Default; a chosen theme keeps its own colours, and
null drops it. For stage 46's brighter red (`{ 1: '#c43c3c' }`); the run
log player and the replay set none.

**Gallery.** Section "Player" (`gallery/player.tsx`): an embedded host in
a 340 px slot playing a bare, `hours` view of a stored session (one of
several runs first, as the dev hook picks) or, without one, a built-in
sample of 1 h 34 min 7 s with every seventh line in ANSI red; buttons
calling `press`; a readout in `h:mm:ss`; the Display colours through
`viewerControls(true)`; the palette tweak; Park (the slot `hidden`: the
keys go back to the gallery). While the player is shown it has the keys
(Esc leaves the gallery).

**Tests.** Unit: `player-timeline.test.ts` (`fmtClock` with and without
hours), `player-modes.test.ts` (hours, Back and its popup rule, the
header moving right of Back, `press`, bare, keys while parked,
`viewerControls`, `setPaletteTweak`, `open`'s rejections and modes).
E2E: `player-core.spec.ts` (History → Run log: Back top left, in Cinzel,
clear of the header, hides with the chrome after 6 s, returns to History
with its cursor; a 1h34m log reads `1:34:07` and the position `1:02:03`;
a 420 px window keeps the header right of Back; the HTML replay has no
Back and `94:07`; a broken session resolves `{ ok: false, error: 'The run
log is not stored.' }`; `embedPlayer` fills its slot, follows it, is the
`playerHost`, refuses a second player and hands back on `close()`; the
gallery section). Helpers in `tests/e2e/look.ts`: `playerBack`,
`playerClock`, `longLogText`, `openLongPlayer`.

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
| start (`index-*.js`) | 21.77 / 8.18 kB (42-0) | 21.77 / 8.18 kB (unchanged: `INLAY_TOKENS` is tree-shaken) | 42b alone |
| chrome JS | 229.91 / 82.77 kB (42-0) | 233.20 / 84.06 kB (+3.29 / +1.29 over 42-0) | 42b alone |
| chrome CSS | 48.04 / 10.65 kB (42-0) | 70.06 / 14.80 kB (+22.02 / +4.15 over 42-0: `look-controls.css`) | 42b alone |
| editor JS, player-host JS | (42-0) | unchanged | 42b alone |
| chrome JS | (42-0) | 240.25 / 86.36 kB (+10.34 / +3.59) | 42a alone |
| chrome CSS | (42-0) | 51.64 / 11.28 kB (+3.60 / +0.63) | 42a alone |
| start (`index-*.js`) | (42-0) | 21.77 / 8.18 kB (unchanged) | 42a alone |
| gallery | (42-0) | `VITE_KIT=1`: 6.42 / 2.90 kB JS, 1.62 / 0.70 kB CSS (with the Box section) | 42a alone |

42f alone, on the 42-0 tip (`2c2601bd`), same build; the replay bundle's
gzip is `gzip -9` of `dist/replay/replay.js` (the HTML replay carries it
and `player.css`):

| Chunk | 42-0 tip | With 42f | Budget |
|---|---|---|---|
| start (`index-*.js`) | 21.77 / 8.18 kB | 22.43 / 8.43 kB | "unchanged": +0.25 kB gzip, the shell's part of the API (the result's reasons, `embedPlayer`, the run log mode); the shell lives in the start chunk |
| player-host JS | 34.69 / 11.42 kB | 36.75 / 12.07 kB | ≤ +2 kB: +0.65 kB gzip |
| player-host CSS | 10.02 / 2.46 kB | 10.12 / 2.49 kB | (with JS) +0.68 kB gzip in all |
| chrome JS, CSS | 229.91 / 82.77, 48.04 / 10.65 kB | unchanged | — |
| HTML replay bundle | 1319.53 kB / 453 855 B | 1321.75 kB / 454 263 B | ≤ +1.5 kB gzip: +0.41 kB (importing `look-glass.css` in `player.css`, as first planned, measured +1.46 kB) |

42c, against the 42-0 tip (`2c2601bd`), raw / gzip: chrome CSS 48.04 /
10.65 → 52.91 / 11.68 kB (`look-overlay.css`); the shared chunk that holds
`stack.tsx` (`scripts-model-*.js`, loaded with the chrome and the editors)
41.21 / 15.62 → 43.60 / 16.44 kB; chrome JS, start, editor and
player-host unchanged (`Dialog`, `Popover`, the cursors and the zone are
tree-shaken until a page uses them; wave 2 adds them).

42e alone, against the 42-0 tip (`2c2601bd`), raw / gzip:

| Chunk | 42-0 tip | With 42e | Note |
|---|---|---|---|
| editor JS | 634.14 / 209.14 kB | 639.94 / 210.67 kB | +1.53 gzip: the lantern theme and find panel |
| editor CSS | 6.61 / 1.61 kB | 11.98 / 3.07 kB | +1.46 gzip: `look-code.css` |
| chrome JS | 229.92 / 82.78 kB | 226.89 / 81.57 kB | `look-controls.tsx` moves out (below) |
| shared chunk (Preact, the stack) | 41.22 / 15.63 kB (`scripts-model-*`) | 45.93 / 17.38 kB (`look-controls-*`) | the editor now imports the kit's controls, so they join the chunk that the chrome and the editors share (named after a module in it); the chrome's load: +0.54 kB gzip |
| start (`index-*.js`) | 21.77 / 8.18 kB | 21.77 / 8.19 kB | unchanged |
| editor, once a page imports `LookManual` (measured with an import added to `src/editor/index.ts`) | (42-0) | JS 654.59 / 215.82 kB, CSS 20.57 / 4.92 kB | JS +6.68 gzip (within the +8 kB budget); with the CSS +9.99 kB gzip in all, over it by about 2 kB if the CSS counts |

The manual's timings: a production build with `VITE_KIT=1` (`vite
preview`), real windows (Wayland, i7-12700H with Iris Xe), 1440 × 900,
five runs each, medians (the script manual, 188 sections; the gallery's
`data-open-ms` and an input event with the whole word, then each
keystroke of "t" … "timer"):

| | Chromium | Firefox |
|---|---|---|
| open the script manual, cold (the first in the page): the choice → the first frame with it | 17.6 ms | 27.6 ms |
| open it again (warm) | 13.9 ms | 17.1 ms |
| find "timer": the input → the first frame with its 50 marks | 10.5 ms | 11.9 ms |
| a keystroke → its frame | 16.4 ms | 14.6 ms |
| a keystroke's work (the input → rendered, the marks set), median / max | 4.4 / 11.8 ms | 7.1 / 23.6 ms (the 1000 marks of "t") |
| long tasks (> 50 ms) while opening | none | — (no API) |
| an idle frame, for reference | 15.6 ms | 15.0 ms |

Before the chunked drawing the cold open was 58 ms (Chromium) and 65 ms
(Firefox), with one 57–60 ms long task each time. Headless runs are not
used: headless Firefox draws in software and its idle frames take 58 ms.

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
