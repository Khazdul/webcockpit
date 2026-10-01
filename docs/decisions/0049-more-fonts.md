# 0049 — More terminal fonts, fill faces and Lucida Console

- Status: Accepted
- Date: 2026-10-01
- Builds on ADR 0010 ("Fonts and cell grid"), ADR 0011 (whole-px
  advance), ADR 0043 (the underscore face)

## Context

Options → Appearance → Font offered DejaVu Sans Mono and JetBrains Mono.
The owner wants the common terminal fonts players know, with licences and
credits handled correctly, and Lucida Console for those who have it. A
terminal font must keep the cell grid exact: every glyph one advance
wide, box and block glyphs tiling without seams, no ligatures, and no
box or block glyph taken from another family at another advance.

The candidates were audited (versions, licences, Reserved Font Names,
metrics, glyph coverage, ligature features) before this decision; the
numbers are in `public/fonts/README.md`.

## Decision

### The set

- **Bundled**, regular and bold where upstream has a bold: DejaVu Sans
  Mono (default) and JetBrains Mono as before, plus Agave, Anonymous Pro,
  Cascadia Mono, Fantasque Sans Mono, Fira Code, Go Mono, Hack, Hermit,
  IBM 3270 (no bold), IBM Plex Mono, Inconsolata, mononoki and Noto Sans
  Mono. Cascadia Mono is Cascadia Code without ligatures; Noto Sans Mono
  replaces the deprecated Noto Mono, which has no box or block glyphs
  (owner approved).
- **Lucida Console**, local only (below).
- **Order** in the picker and the ←/→ cycle: alphabetical by label,
  Lucida Console last. **Ids** (`FontId`): `agave`, `anonymous`,
  `cascadia`, `dejavu`, `fantasque`, `firacode`, `gomono`, `hack`,
  `hermit`, `ibm3270`, `plex`, `inconsolata`, `jetbrains`, `mononoki`,
  `notomono`, `lucida`. Migration keeps known ids; anything else becomes
  the default.

### Licences

- The fonts are the upstream files, **unmodified and not subset**,
  converted losslessly to WOFF2 with names and notices kept (Cascadia
  Mono: upstream's own WOFF2). Under the SIL OFL such a conversion is not
  a Modified Version (OFL FAQ 2.2.1, 2.5), so the fonts keep their names,
  Reserved Font Names included. The other licences (Bitstream Vera, MIT,
  BSD) allow redistribution with the notice.
- Every licence text is in `public/fonts/` (`LICENSE-<Font>.txt`). Each
  font is credited with name, version, copyright, licence and source in
  `THIRD_PARTY_NOTICES.md` and `public/fonts/README.md`, and listed in
  About → CREDITS → Fonts (which links the README).
- IBM 3270 carries a Debian logo glyph (CC BY-SA 3.0 / LGPL-3) and Ubuntu
  trademark glyphs; its licence file says so and the notices repeat it.
- **Exported replays** name the fonts actually embedded, each with its
  licence, in the file's notice comment (`fontNotices` in
  `src/replay/export.ts`), instead of a fixed sentence.

### Generated @font-face rules

`src/theme/fonts.css` is gone. The @font-face rules are generated from the
`FONTS` table (`fontFaceCss`, installed by `installFontFaces` at start-up),
so the CSS, the preload links, `loadFont` and the replay export read the
same file names and URLs. `font-display: block` as before. A browser
fetches a face only when text uses it; only the selected family is
preloaded and loaded (checked with a network log: a fresh start fetches
DejaVu and the underscore face only).

### Ligatures

Fira Code and Fantasque Sans Mono have programming ligatures (`calt`) in
every build. Everything drawn in the terminal font already had
`font-variant-ligatures: none` (body, chrome, overlay, editor; `font:
inherit` on fields), which turns off `calt` too. Verified in Chromium and
Firefox: `->`, `!=`, `===`, `<=` and others render identically to one
span per character.

### Fill faces

Anonymous Pro (no blocks or shades), Hermit (no box lines, quadrants or
shades), Go Mono and Lucida Console (no quadrants or eighth blocks) lack
grid glyphs. Taking them from DejaVu would put DejaVu's advance in the
grid. So WebCockpit draws its own:

- "WebCockpit Fill AP", "H", "GM", "LC" (`public/fonts/WebCockpitFill-*.woff2`,
  built by `scripts/build-fill-fonts.py`, reproducible). Rectangles only,
  traced into clean contours; **no third-party outlines**. Only numbers
  are taken from the host: units per em, advance, hhea / OS/2 typo and
  win metrics, the `█` extent, where its halves split, and its line
  positions and thickness (Hermit has no lines: its `|` stem, 90 units,
  on the cell's centre line). Identical vertical metrics mean the face
  cannot change a line box; blocks fill the host's `█` extent and
  vertical lines span it, so they meet across rows; horizontal lines run
  the full advance.
- Anonymous Pro has no `█`: its block extent is its line metrics
  (−373 … 1675), which its own `│` spans; its `blockEm` is 2048/2048.
- Each face comes first in its host's stack with a `unicode-range` of
  exactly the glyphs the host lacks from the grid set
  (`─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▀▄▌▐█▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇░▒▓`), the same mechanism
  as the underscore face. One file serves both weights (box glyphs need
  not be bold); the bold rule points at it so no synthetic bold appears.
- Names avoid every Reserved Font Name. The faces are separate fonts, not
  modifications of the hosts. **Licence: SIL OFL 1.1, © the WebCockpit
  authors** — they are embedded in exported HTML replays, which anyone
  may pass on, and the OFL is the standard licence for that; it is also
  GPL-compatible for the app itself.

### Families without a full bold

- **Agave Bold** covers Latin and a few symbols but no box or block glyph.
  Its bold rule has a `unicode-range` of exactly its cmap; the rest of a
  bold run falls to "WebCockpit Agave Regular", Agave-Regular.woff2 for
  both weights (same file, one fetch). So bold box and block glyphs are
  Agave's own at Agave's advance. Verified: bold and regular box/block
  rows are pixel-identical; bold letters are bold.
- **IBM 3270 and Lucida Console** have no bold. Firefox's synthetic bold
  widens the advance (measured 10.8 → 11.2 px at 20 px), Chrome's does
  not. Their bold @font-face rules point at the regular face, so no
  browser synthesises a bold and the grid stays exact (bold text in these
  two fonts looks regular; colour still marks it).

### Lucida Console

- Proprietary: never shipped, never preloaded by URL, never embedded.
  `@font-face { font-family: "WebCockpit Lucida"; src: local("Lucida
  Console"), local("LucidaConsole") }` for both weights.
- **Detection** (`detectLocalFonts`, at start-up, raced with loading the
  settings): a `FontFace` with those `local()` sources loads when the font
  is installed and fails when not. No canvas measuring.
- Offered in the picker and the cycle only when found. Anywhere it is set
  but not available — another device, an imported profile, a recorded
  VIEW, the exported replay page (which never looks) — `effectiveFont`
  renders and measures DejaVu Sans Mono and the stored value is kept. The
  Font item then shows DejaVu Sans Mono.
- The replay export maps it to DejaVu Sans Mono (`bundledFont`), both for
  the exporter's font and for VIEW entries.
- Metrics measured from Lucida Console 5.01 (`lucon.ttf`, the owner's
  copy, used for measuring and testing only): advance 1234/2048, `█` and
  line metrics −432 … 1616, `blockEm` 2048/2048. Another version with a
  different advance is measured at run time (`measureCell`); within
  0.5 px it is corrected by letter-spacing, beyond that the measured
  advance is used.

### Cell height: the cover height

ADR 0010 took the cell height from the ink height of `█`. That assumes
`█` is centred on the font's ascent + descent, which holds for DejaVu and
JetBrains Mono but not for most new fonts (Cascadia's `█` reaches 326
units above its ascender, for Windows' win metrics). The browser centres
ascent + descent in the line box, so the baseline sits (A − D) / 2 above
the box's middle and `█` covers a line box of height L only if both its
ends lie L / 2 or more from that middle. `blockEm` is now that **cover
height**, the smallest over the metrics browsers use (hhea on Linux and
macOS; win, or typo where `USE_TYPO_METRICS` is set, on Windows). For a
centred `█` it is the ink height, as before; DejaVu keeps its value.

### Grid settings from a seam sweep

Every family was rendered at every size 6–32 in Chromium and Firefox
(Linux) as rows of `█`, `│` / `║`, `─`, halves, quadrants and bold `█`;
seams were counted from screenshots. Two per-family settings came out
of it:

- **`cellMargin`** (px): the cell height is rounded down from
  `px × blockEm − cellMargin`. Where `█` fills the cell exactly (a tight
  cover height, or a block equal to the line metrics), browsers that
  round the baseline left hairline seams or a 1 px gap between rows.
  0.5 px for every new family; 1 px for mononoki (its `█` and `│` equal
  its line metrics; Chrome left a 1 px gap at sizes 26–27 with 0.5); 0
  for DejaVu Sans Mono and JetBrains Mono, which keep their cells.
- **`wholePx`**: Chrome on Linux draws Go Mono, IBM 3270, IBM Plex Mono
  and Lucida Console at the font size rounded to whole px (their hinting
  does not stretch `█` to the cell as DejaVu's does), so at a fractional
  size rounded down `█` was narrower than the cell and runs of it showed
  vertical seams. These families use whole px sizes (`fontPx`) whose
  advance is less than 0.45 px over a whole px: Chrome rounds the
  advance down to the cell and `█` overlaps it; Firefox lays out the
  exact advance and `measureCell` takes the excess off with
  letter-spacing (its limit, `MAX_LS`, is now 0.5 px). A size setting
  can move by a px or two.

After both, no family shows a seam or gap at any size in either browser,
apart from thin box lines at sizes ≤ 10 (anti-aliasing; DejaVu has the
same).

### Symbols

Symbols a family lacks (`✦ ✧ ⚔ ★ ☆ ⚠ ✖` and others, per family) still come
from DejaVu Sans Mono, the last family in every stack, at DejaVu's
advance: a row with such a symbol is off by the advance difference after
it (up to about 0.13 em with Inconsolata). Accepted for now (as with
JetBrains Mono before, whose difference is 0.002 em).

## Consequences

- 29 new font files (25 upstream, 4 fill faces), about 2 MB in the
  repository and the site; a player downloads only the family they pick
  (about 100–400 KB).
- Exported replays embed only the bundled families in use, each file
  once; a family whose two weights share a file (IBM 3270, the fill
  faces, Agave Regular) repeats its data in the second rule.
- Not checked: Windows and macOS rendering (different rasterisers and
  metrics: the cover height takes the Windows metrics into account, the
  seam sweep ran on Linux only).
- JetBrains Mono (unchanged here) shows the same Chrome seams at sizes
  8–9, 13–14, 18–19, 23–24, 28–29 and a Firefox seam at 25; `wholePx`
  would fix them but changes its cells, so it is left for the owner to
  decide.
