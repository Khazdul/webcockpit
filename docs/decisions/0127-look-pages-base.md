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

(42d fills this: the one Lykta frame and the end of the cyan border,
`useWindowChrome`, the window and menu look hosts, `ProfileRoot` moved.)

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
