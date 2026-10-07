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

## Test guide

**Desktop.** Open the client in Chrome or Firefox, open DevTools →
Network, tick *Disable cache* and set throttling to *Slow 4G* (then try
*3G*). Reload.

1. Start page: after a moment a bar with a percentage and a short label
   appears in the middle (`Loading client` → … → `Ready`). Then the whole
   start page fades in at once, in its real font. No row (such as
   `<< Enter MUME >>`) should appear on its own before the others.
2. Enter the cockpit (or `?replay`) so the Map pane opens. Instead of a
   grey box, a small box in the middle shows a label over a bar:
   `Loading map  2.1 / 5.8 MB`, then `Unpacking map…`, `Building map…`,
   `Loading tiles  40 / 126`, `Drawing map…`. The bar only moves forward
   and fades out when the map is drawn.
3. Options → Mapper → `Tileset`: switch to another set (←→). With the
   throttling still on, the same box shows `Loading tiles  n / m` until
   the new tiles are drawn.
4. Turn throttling off and reload: on a fast load there should be no
   flash of either bar, only the short fade-in.

**Phone.** Open the link on mobile data (or after clearing the site's
data). Check the same: the start bar, the start page appearing all at
once, and the map bar when the map opens. Check that both bars are solid,
without thin lines between the cells.

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
