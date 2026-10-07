# Stage 24 — Loading indicators

Owner request 2026-10-07: the start page appears in pieces (the
`<< Enter MUME >>` row often shows before the rest, more visibly on a
phone with a slow connection). Show a TUI-style loading bar while the
start page loads and fade the menu in when everything is ready. The map
pane shows a flat grey box for seconds before the map appears, and the
stage 22 tilesets made it heavier; give it a loading bar that fits the
map pane.

Spec §2.5 (start page), §2.9 (map), ADR 0020 (map), ADR 0082
(tilesets), ADR 0083 (this stage).

## Findings (2026-10-07)

- `index.html` has no markup; the start page is drawn by Preact after
  `main.ts` → settings (IndexedDB, raced against 1 s) → lazy `chrome`
  chunk (123 KB) → `mountStartPage`.
- All `@font-face` rules use `font-display:block`. Bold and regular are
  separate files (Hack 106 + 108 KB). The selected row is bold
  (`kit.css`), so it becomes visible when the bold file lands while the
  regular rows are still invisible. That is the "Enter MUME first" effect.
- Map: `arda.mm2` is 5.8 MB, fetched with `arrayBuffer()` (no progress),
  then inflate, parse, hash, meshes. Tiles: default 0.7 MB / 126 files,
  a Shimrod set about 6 MB / 104 files, loaded with `Promise.all` in
  parallel with the map. The pane is `#2e3436` with no text until the
  first complete frame.

## Plan

### A. Start page

- A static loader in `index.html` (inline CSS, no web font needed,
  colours from the saved appearance like today's first paint): one
  centred line with a block-glyph bar (`█` fill on a `░` track) and a
  short label, shown from the first paint, before any JS runs.
- Boot advances the bar through real steps: entry script running,
  settings read, fonts loaded, chrome chunk loaded, start page mounted.
- The start page is revealed only when the selected font's faces
  (regular, bold and the override faces the start page uses) are
  loaded (`document.fonts.load`), with a timeout fallback so a broken
  font never blocks the client.
- Reveal: the loader fades out, then the banner, menu rows, quote and
  footer fade in (short, lightly staggered top to bottom).
  `prefers-reduced-motion`: no animation, instant swap.
- A fast cached load should not flash the bar: show it only after a
  short delay (about 150 ms), but still hold the menu until fonts are
  ready.

### B. Map pane

- The worker posts progress: map bytes (streaming `fetch` reader with
  `Content-Length`; indeterminate if the length is missing or does not
  match), tiles loaded / total, and the phases unpack, build, draw.
- The pane shows a centred overlay over the grey: a TUI bar in the
  same glyph style plus a label (`Loading map 2.1 / 5.8 MB`,
  `Loading tiles 40 / 104`, `Building map…`), weighted into one bar.
  It fades out on the first complete frame.
- Tileset switch in Options → Mapper: the same overlay while the new
  tiles load, if it takes more than a short delay.
- Uses the pane's own colours (`--pane-shade-*`, `--term-fg`); the
  error notice keeps working as today.

### C. Verify

- Unit tests for progress arithmetic; e2e: loader present before the
  start page, removed after; menu rows all visible at once; map overlay
  shows progress and disappears on load. Throttled-network check by hand
  (Playwright route delay) for both.
- Typecheck, unit, e2e, build:pages smoke. Release on the owner's go.

## Tasks

- [x] A. Static loader in `index.html`, boot progress steps, font gate,
  fade-in reveal (ADR 0083; `src/app/boot-progress.ts`,
  `tests/e2e/loading.spec.ts`)
- [x] B. Worker progress messages, map overlay bar, tileset-switch overlay
  (`src/map/progress.ts`, `src/panes/map-loading.ts`,
  `tests/e2e/map-loading.spec.ts`)
- [x] C. Map bar drawn like the start loader (solid fill box, clipped `░`
  track), known size of the bundled map as the progress total when the
  host gzips it (GitHub Pages does), ADR 0083 map pane, test guide

### Round 1 — start page

- [x] First paint: the banner in index.html before the app loads, at its
  final place (shared start layout, cell grid, crop), in subsets of the
  selected family's faces (`scripts/build-banner-faces.py`,
  `src/boot/first-paint.ts`, inlined by `firstPaintPlugin`); stars
  twinkle and hand their clock to the app's banner
- [x] The bar below the banner, where the menu appears; real byte
  progress in production builds (`__wcBootSizes`)
- [x] Font gate on the real font load: fonts preloaded by the first paint,
  `FONT_GATE_MS` 4 s → 45 s (safety net only)
- [x] Reveal: the app's banner replaces the first paint's in one frame;
  menu, quote, footer fade in over about 2 s (1400 ms per row, 600 ms
  stagger); reduced motion instant
- [x] Verify under Chromium network emulation (`scripts/throttled-start.ts`,
  Regular 3G / 4G / none); e2e `loading.spec.ts`, `phone-loading.spec.ts`;
  ADR 0083 start page items
- [x] Owner test

### Round 2 — start page

- [x] Reproduce at 3G in Chromium and Firefox, dev server and production
  build: `scripts/throttle-proxy.ts` (shared 750 kbit/s, 100 ms per
  request), `scripts/throttled-start.ts --browser --via proxy --dev
  --video` (per-row opacity, font face load times, video)
- [x] Cause: the DejaVu Sans Mono fallback face loaded only after the
  start page was laid out; while it loaded, `font-display: block` hid all
  regular-weight text, so the bold selected row faded in alone (ADR 0083
  item 5)
- [x] Fix: fallback face preloaded and gated (`renderFaces`), the reveal
  waits for `document.fonts.ready`; one fade for all rows, 1350 ms, no
  stagger
- [x] Regression e2e (`loading.spec.ts`, new install with DejaVu held:
  rows sampled per frame, no face loading while the menu shows; fails on
  the round 1 code)
- [x] Owner test

### Round 1 — map pane

- [x] Modern, discreet overlay: small `system-ui` label, thin rounded
  bar, soft translucent pill, fixed neutral colours (ADR 0083 item 9)
- [x] Owner test

## Test guide

**Desktop.** Open the client in Chrome or Firefox, open DevTools →
Network, tick *Disable cache* and set throttling to *Slow 4G* (then try
*3G*). Reload.

1. Start page: the MUME / COCKPIT banner with its stars is there from
   the first moment, in its real place. Under it, where the menu will
   be, a bar with a percentage and a label (`Loading client` → … →
   `Ready`) fills as the files arrive. When everything is in, the bar
   fades and the menu, quote and footer fade in together (about 1.3 s).
   The banner does not move or flicker when the app takes over, and the
   stars keep twinkling. No row (such as `<< Enter MUME >>`) appears on
   its own or ahead of the others; nothing pops in after the fade.
2. Enter the cockpit (or `?replay`) so the Map pane opens. Instead of a
   grey box, a small rounded pill in the middle shows a small label over
   a thin modern bar:
   `Loading map  2.1 / 5.8 MB`, then `Unpacking map…`, `Building map…`,
   `Loading tiles  40 / 126`, `Drawing map…`. The bar only moves forward
   and fades out when the map is drawn.
3. Options → Mapper → `Tileset`: switch to another set (←→). With the
   throttling still on, the same pill shows `Loading tiles  n / m` until
   the new tiles are drawn.
4. Turn throttling off and reload: the banner at once, no bar flash, and
   the same fade of the menu (about 1.3 s).
5. With a non-default font or a light theme (Options → Appearance),
   reload: the early banner uses that font and those colours too.

**Phone.** Open the link on mobile data (or after clearing the site's
data). Check the same: the banner at once, the bar under it, the menu
fading in all at once, and the map bar when the map opens. A larger
font that makes the screen narrower than 45 columns crops the starfield;
the early banner should be cropped the same way.

**Feedback wanted:** the look of the bars and labels (size, colours,
wording), the fade speed (too slow / too fast), and anything that still
pops in piece by piece.

## Owner feedback

### Round 1 (2026-10-07)

1. Start page, Regular 3G (~30 s): `<< Enter MUME >>` still appears
   before the rest, and no fade is visible. Regular 4G (~10–15 s): all
   at once, no visible fade. The fade must be clearly visible, a nice
   effect of about 1–2 s.
2. Map bar works, but the TUI look does not fit the map pane. Make it
   discreet and modern: much smaller font, an ordinary modern progress
   bar. The mapper window is deliberately more modern, a contrast to
   the rest of the client.
3. Tileset switch works as expected.
4. Unthrottled: everything fast, no piecemeal rows. The fade is a bit
   too fast.
5. General: the banner should be visible at once when the page opens,
   before loading starts. When loading is done, the menus fade in
   slowly, about 2 s.

Diagnosis: the font gate's 4 s safety timeout (`FONT_GATE_MS`) fires
before the font files arrive on 3G, so the reveal ran unguarded; the
reveal's 160 ms per row is too short to notice.

### Round 2 (2026-10-07)

1. Regular 3G: `<< Enter MUME >>` still shows first, then the other
   rows fade in.
2. Regular 4G and unthrottled: looks good.
3. Shorten the fade by about a third.

### Round 3 (2026-10-07)

Owner: "Nu ser det bra ut." Start page and map bar approved. Stage
done; not released yet (release on the owner's go).
