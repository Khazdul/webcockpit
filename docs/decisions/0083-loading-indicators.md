# 0083 — Loading indicators

- Status: Accepted
- Date: 2026-10-07
- Builds on ADR 0010 (fonts and cell grid, page flow), ADR 0049 (font
  families), ADR 0075 (phone), ADR 0020 and 0082 (map)
- Stage: `docs/stages/24-loading.md`

## Context

Owner request (2026-10-07): the start page appears in pieces, most
visibly on a phone on a slow connection; the bold `<< Enter MUME >>` row
shows before the rest. `index.html` had no markup; the start page is
Preact, mounted after the entry script, the settings (IndexedDB, raced
against 1 s) and the lazy chrome chunk. Every `@font-face` rule is
`font-display: block`, and bold and regular are separate files, so the
selected (bold) row became visible as soon as the bold file landed while
the regular rows were still invisible. The map pane shows a flat grey
box for seconds before the map appears (part B below).

## Decision — start page

1. **A static loader in `index.html`.** One block, centred: a bar of 28
   cells (`█` fill on a `░` track) with the percentage, and a short label
   under it. Inline CSS and JS only; no web font. The font stack is
   system monospace (`ui-monospace, Menlo, Consolas, "Liberation Mono",
   "Courier New", monospace`) and deliberately names no family the app
   declares with `@font-face`: those are `font-display: block` and would
   hide the loader's own text. Colours come from the saved appearance
   like the existing first paint (`--term-bg`, and on a light background
   the light UI roles): fill = the accent role (`#ffaf00`, light
   `#9a5400`), track = hint, text = body. The fill is drawn as one box
   (no seams between `█` cells at fractional pixel ratios, seen on a
   phone); the track is `░` text clipped to its cell width, so a fallback
   font for `░` cannot change the bar's length.

   ```
   ██████████░░░░░░░░░░░░░░░░░░   37%
           Loading interface
   ```

   `pointer-events: none` and the top z-index: it never takes a click,
   and it is removed when done.

2. **Shown after 150 ms.** It is in the DOM from the first parse but
   `opacity: 0` until a 150 ms timer adds `.on`, so a fast (cached)
   start never flashes it. No fade-in: a CSS transition or animation from
   opacity 0 needs rendered frames, and Chromium's paint holding produces
   none while nothing contentful is on the page, which stalled the fade
   in tests.

3. **Real steps.** The inline script defines `window.__wcBoot` with
   `step(percent, label)` (never backwards) and `done()`.
   `src/app/boot-progress.ts` wraps it (`bootStep`, `bootDone`), so
   every call is a no-op where it is absent: the exported HTML replay,
   unit tests. Steps: 0 `Loading client` (the entry chunk is
   downloading) → 20 `Reading settings` (the entry script runs) → 40
   `Loading interface` (settings read) → 70 the chrome chunk or the
   fonts, whichever is still pending → 90 `Starting` → 100 `Ready`
   (mounted). Offline modes (`?replay`, `?fixture`, `?bench`) go to the
   cockpit and remove the loader when `shell.boot()` returns; main.ts
   removes it in a `finally`, so an error never leaves it up.

4. **Font gate.** `main.ts` passes the Shell a `fontsReady` promise:
   `loadFont` (`document.fonts.load` of every face of the selected
   family: regular, bold and its override/fallback faces such as
   WebCockpit Underscore or a WebCockpit Fill face) raced against
   `FONT_GATE_MS` = 4 s. The chrome chunk loads in parallel; the start
   page is mounted when both are done, so it is first laid out with the
   real font and the selected row can no longer show alone. A broken or
   very slow font costs at most 4 s, then the old behaviour
   (`font-display: block`) applies. Glyphs that fall back to DejaVu Sans
   Mono in another family are not gated (they would add a download).

5. **Reveal.** The start host is held at `opacity: 0` while the frame
   stack renders (up to 60 frames), then each child row of the main frame
   (and the notices row) fades in with the Web Animations API
   (`fill: backwards`, so no DOM attribute that Preact owns is touched):
   160 ms each, delayed by its position, top 0 to bottom 160 ms, plus
   80 ms when the loader was shown so it fades out (150 ms) first; about
   400 ms in all. The loader fades out at the same time and is removed.
   `prefers-reduced-motion: reduce`: no fades, instant swap.
   `<html data-wc-boot="ready">` marks the end (tests).

6. **First boot only.** The gate and the reveal run only in
   `Shell.boot()` with `fontsReady` set. Returning to the start page
   (Exit session, the log player, ESC menu) is instant as before, and a
   Shell built without `fontsReady` (unit tests) shows at once.

## Decision — map pane

7. **Worker progress.** The map worker reports loading progress with two
   new protocol messages (additive, protocol version unchanged).
   `progress` carries the map load in flight (`req`, phase
   `fetch|unpack|parse|build`, bytes read and the expected total) and the
   file count of the current tile source (`done/total`, counted by
   wrapping the asset resolver, so it includes the character arrows and
   the map font). `tilesDrawn` follows the first complete frame after an
   `assets` change. `arda.mm2` is read from a streaming body
   (`readBody`). The total is Content-Length only when the body is not
   content-encoded; otherwise it is the source's known size (`size` on a
   `url` source, below), and it falls to 0 (unknown) when neither is
   available or the bytes exceed it. With an unknown length the label
   shows MB received and the download share of the bar stays empty until
   the fetch ends. Phase changes are posted at once (the worker blocks
   during parse and mesh building); byte and file counts are throttled to
   one message per 50 ms, and nothing is posted after `loaded`/`error`.
   Imported maps begin at unpack, replay subsets at build. The renderer's
   `complete` is false while a tileset swap is pending, and a failed map
   font counts as complete (otherwise the overlay would wait forever).

8. **Known size of the bundled map.** GitHub Pages serves `arda.mm2`
   gzip-encoded when the browser accepts it (checked 2026-10-07 on
   mumecockpit.com: `content-encoding: gzip`, `content-length: 5815932`
   encoded against 5814236 plain; the file is already deflated, so gzip
   gains nothing). The browser's reader yields decoded bytes, so the
   encoded length cannot be the total, and the download would always show
   as unknown on the live site. The build therefore embeds the file's size
   (`__WC_MAP_BYTES__`, `statSync` of `public/map/arda.mm2` in
   `vite.config.ts`; `BUNDLED_MAP_BYTES` in `src/map/progress.ts`), and the
   bundled map's `url` source carries it as `size`. It is the same file the
   build copies, so it matches; if it ever did not, an overflow drops to
   unknown and a short body only stops the bar early.

9. **The overlay.** The pane folds the reports into one weighted bar:
   download 0.55, unpack 0.07, parse 0.14, build 0.06, tiles 0.18
   (without a download the rest is scaled to 1; a tileset change uses
   tiles alone), from the bench scaled to a remote load. The bar never
   moves backwards within a load. The overlay is a centred box in the
   pane's own background, a label over a 28-cell bar (cols − 4 in a
   narrow pane, min 4). The bar is drawn like the start page loader: the
   filled whole cells as one solid box `n ch` wide (no seams between `█`
   glyphs, seen on a phone and in Firefox) and the track as `░` text
   clipped to its cells. Colours: label `--pane-shade-label`, fill
   `--pane-shade-glow`, track `--pane-shade-mid`. It appears after
   200 ms, fades out over 250 ms on `drawn` / `tilesDrawn`, instant with
   prefers-reduced-motion. Errors hide it and use the existing notice.
   The HTML replay runs the same code.

   ```
        Loading map  2.1 / 5.8 MB
   ██████████░░░░░░░░░░░░░░░░░░
   ```

## Consequences

- A cold start on a slow connection shows a bar from about 150 ms and
  then the whole start page at once, in its real font. A fast start
  shows no loader and only the short fade.
- The start page now waits for the font files before it is drawn; the
  4 s cap bounds that.
- `index.html` carries about 3 KB of inline loader code; other entry
  points need nothing.
- A cold map load shows where the time goes (download, unpack, build,
  tiles) instead of a grey box; a tileset switch that takes longer than
  200 ms shows the tile count.
- Both bars share one look (28 cells, solid fill, `░` track), with
  colours from their context (boot UI roles; pane shades).
