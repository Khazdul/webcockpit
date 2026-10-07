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

(Placeholder: part B of stage 24, written by that part.)

## Consequences

- A cold start on a slow connection shows a bar from about 150 ms and
  then the whole start page at once, in its real font. A fast start
  shows no loader and only the short fade.
- The start page now waits for the font files before it is drawn; the
  4 s cap bounds that.
- `index.html` carries about 3 KB of inline loader code; other entry
  points need nothing.
