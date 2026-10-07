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
- [ ] B. Worker progress messages, map overlay bar, tileset-switch overlay
- [ ] C. Tests, ADR 0083, test guide

## Test guide

(Written when A–C are done.)

## Owner feedback

