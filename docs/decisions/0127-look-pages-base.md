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
