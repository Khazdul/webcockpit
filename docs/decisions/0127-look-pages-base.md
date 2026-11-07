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
