# Terminal fonts

Self-hosted web fonts for WebCockpit's terminal grid (ADR 0010 "Fonts and
cell grid", ADR 0011, ADR 0043, ADR 0049). Regular and bold only; no
italics (MUME output does not need them; italic runs are synthesised by
the browser). The @font-face rules are generated from
`src/theme/fonts.ts` (`fontFaceCss`); a browser downloads a family only
when the user picks it.

## Files, sources and licences

Every third-party font here is the upstream font file, unmodified and not
subset, converted losslessly to WOFF2 (Cascadia Mono: upstream's own
WOFF2). Names, copyright notices and licence fields are kept, so under
the SIL Open Font License these are not Modified Versions (OFL FAQ 2.2.1,
2.5) and keep their names, Reserved Font Names included.

| Files | Family, version | Source | Licence (file here) |
|---|---|---|---|
| `Agave-Regular.woff2`, `Agave-Bold.woff2` | Agave 39 | `Agave-Regular.ttf`, `Agave-Bold.ttf` from the v39 release, github.com/blobject/agave | SIL OFL 1.1, © 2013-2026 The agave Project Authors (`LICENSE-Agave.txt`) |
| `AnonymousPro-Regular.woff2`, `AnonymousPro-Bold.woff2` | Anonymous Pro 1.002 | `Anonymous Pro.ttf`, `Anonymous Pro B.ttf` from `AnonymousPro-1_002.zip`, marksimonson.com/fonts/view/anonymous-pro | SIL OFL 1.1, © 2009 Mark Simonson, RFN "Anonymous Pro" (`LICENSE-AnonymousPro.txt`) |
| `CascadiaMono-Regular.woff2`, `CascadiaMono-Bold.woff2` | Cascadia Mono 2407.24 | `woff2/static/CascadiaMono-{Regular,Bold}.woff2` from `CascadiaCode-2407.24.zip`, github.com/microsoft/cascadia-code/releases/tag/v2407.24 (used as is) | SIL OFL 1.1, © 2019-Present Microsoft Corporation, RFN "Cascadia Code" (`LICENSE-CascadiaCode.txt`) |
| `DejaVuSansMono.woff2`, `DejaVuSansMono-Bold.woff2` | DejaVu Sans Mono 2.37 | `DejaVuSansMono{,-Bold}.ttf` from npm `dejavu-fonts-ttf@2.37.3` | Bitstream Vera + public domain + Arev (`LICENSE-DejaVu.txt`) |
| `FantasqueSansMono-Regular.woff2`, `FantasqueSansMono-Bold.woff2` | Fantasque Sans Mono 1.8.0, Normal variant | `TTF/FantasqueSansMono-{Regular,Bold}.ttf` from `FantasqueSansMono-Normal.zip`, github.com/belluzj/fantasque-sans/releases/tag/v1.8.0 | SIL OFL 1.1, © 2013-2017 Jany Belluz (`LICENSE-FantasqueSansMono.txt`) |
| `FiraCode-Regular.woff2`, `FiraCode-Bold.woff2` | Fira Code 6.2 (font version 6.002) | `ttf/FiraCode-{Regular,Bold}.ttf` from `Fira_Code_v6.2.zip`, github.com/tonsky/FiraCode/releases/tag/6.2 | SIL OFL 1.1, © 2014 The Fira Code Project Authors (`LICENSE-FiraCode.txt`) |
| `GoMono-Regular.woff2`, `GoMono-Bold.woff2` | Go Mono 2.010 | `Go-Mono.ttf`, `Go-Mono-Bold.ttf` from golang.org/x/image `font/gofont/ttfs` | BSD-style, © 2016 Bigelow & Holmes Inc. (`LICENSE-GoMono.txt`: the Go fonts README and the Go licence) |
| `Hack-Regular.woff2`, `Hack-Bold.woff2` | Hack 3.003 | `ttf/Hack-{Regular,Bold}.ttf` from `Hack-v3.003-ttf.zip`, github.com/source-foundry/Hack/releases/tag/v3.003 | MIT, © 2018 Source Foundry Authors; Bitstream Vera licence, © 2003 Bitstream Inc. (`LICENSE-Hack.txt`) |
| `Hermit-Regular.woff2`, `Hermit-Bold.woff2` | Hermit 2.0 (OTF, CFF outlines) | `Hermit-{Regular,Bold}.otf` from `full-hermit-2.0.tar.gz`, pcaro.es/hermit | SIL OFL 1.1, © 2013 Pablo Caro, RFN "Hermit" (`LICENSE-Hermit.txt`) |
| `IBM3270-Regular.woff2` | IBM 3270 3.0.1 (no bold) | `3270-Regular.ttf` from `3270_fonts_d916271.zip`, github.com/rbanffy/3270font/releases/tag/v3.0.1 | BSD 3-clause, © 2011-2022 Ricardo Banffy and others; Debian logo glyph CC BY-SA 3.0 / LGPL-3; Ubuntu glyphs are trademarks of Canonical (`LICENSE-3270.txt`) |
| `IBMPlexMono-Regular.woff2`, `IBMPlexMono-Bold.woff2` | IBM Plex Mono 2.5.0 (font version 2.005) | `fonts/complete/ttf/IBMPlexMono-{Regular,Bold}.ttf` from `ibm-plex-mono.zip`, github.com/IBM/plex | SIL OFL 1.1, © 2017 IBM Corp., RFN "Plex" (`LICENSE-IBMPlexMono.txt`) |
| `Inconsolata-Regular.woff2`, `Inconsolata-Bold.woff2` | Inconsolata 3.000 | `fonts/ttf/Inconsolata-{Regular,Bold}.ttf` from `fonts_ttf.zip`, github.com/googlefonts/Inconsolata/releases/tag/v3.000 | SIL OFL 1.1, © 2006 The Inconsolata Project Authors (`LICENSE-Inconsolata.txt`) |
| `JetBrainsMonoNL-Regular.woff2`, `JetBrainsMonoNL-Bold.woff2` | JetBrains Mono 2.304, NL build | `fonts/ttf/JetBrainsMonoNL-{Regular,Bold}.ttf`, github.com/JetBrains/JetBrainsMono/releases/tag/v2.304 | SIL OFL 1.1 (`LICENSE-JetBrainsMono-OFL.txt`) |
| `mononoki-Regular.woff2`, `mononoki-Bold.woff2` | mononoki 1.6 (font version 1.006) | `mononoki-{Regular,Bold}.ttf` from `mononoki.zip`, github.com/madmalik/mononoki/releases/tag/1.6 | SIL OFL 1.1, © 2022 Matthias Tellen, RFN "mononoki" (`LICENSE-mononoki.txt`; the font files carry no copyright string) |
| `NotoSansMono-Regular.woff2`, `NotoSansMono-Bold.woff2` | Noto Sans Mono 2.014 | `NotoSansMono/googlefonts/ttf/NotoSansMono-{Regular,Bold}.ttf` from `NotoSansMono-v2.014.zip`, github.com/notofonts/latin-greek-cyrillic | SIL OFL 1.1, © 2022 The Noto Project Authors (`LICENSE-NotoSansMono.txt`) |
| `WebCockpitUnderscore.woff2`, `WebCockpitUnderscore-Bold.woff2` | WebCockpit Underscore | `_` of DejaVu Sans Mono, moved up 278 units, by `scripts/build-underscore-font.py` (ADR 0043) | as DejaVu (a modified version under its own name) |
| `WebCockpitFill-AP.woff2`, `-H`, `-GM`, `-LC` | WebCockpit Fill AP, H, GM, LC 1.000 | drawn by `scripts/build-fill-fonts.py` (ADR 0049) | SIL OFL 1.1, © 2026 The WebCockpit Authors (`LICENSE-WebCockpitFill.txt`) |

Notes:

- **Cascadia Mono** is Cascadia Code without its programming ligatures.
  Its name ID 13 (licence description) holds a Microsoft "supplied font"
  text, while name ID 14, the repository's `LICENSE` and the release say
  SIL OFL 1.1; the release's licence file is the one shipped here.
- **Noto Sans Mono** replaces the deprecated Noto Mono (which lacks every
  box and block glyph).
- **Ligatures.** Fira Code and Fantasque Sans Mono have programming
  ligatures (`calt`) in every build. A MUD client must not join `->` or
  `!=`: everything drawn in the terminal font has
  `font-variant-ligatures: none` (`src/ui/ui.css`, `src/chrome/kit/kit.css`,
  the editor). JetBrains Mono ships as its "NL" build.
- **Lucida Console** is not here and never will be: it is proprietary
  (Microsoft; Lucida is a trademark of its owner). WebCockpit only uses
  it when it is installed, through `local("Lucida Console")`, and never
  embeds it in an exported replay. Its metrics in `src/theme/fonts.ts`
  and its fill face were measured from Lucida Console 5.01 (`lucon.ttf`).

## Conversion

TTF / OTF → WOFF2 with fontTools 4.66.1 + brotli 1.2.0:

```python
font = TTFont(src, recalcBBoxes=False, recalcTimestamp=False)
font.flavor = "woff2"
font.save(dst)
```

The result is byte-for-byte reproducible. Glyph outlines, advances, names
and every other table are as upstream, apart from what WOFF2 itself does:
the `DSIG` table is dropped (a signature cannot survive the conversion),
`head.flags` bit 11 ("converted losslessly") is set, and `glyf` / `loca`
are stored in WOFF2's transformed form. DejaVu Sans Mono and JetBrains
Mono were converted earlier with fontTools 4.66.0 and the default
`TTFont(src)` (which also updated `head.modified`).

## Glyph faces

- **WebCockpit Underscore** (ADR 0043) holds one glyph: DejaVu Sans
  Mono's `_` (U+005F), its outline moved up 278 of 2048 units (y −483 … −403
  becomes −205 … −125; bold −483 … −293 becomes −205 … −15) so that it ends
  inside the cell. Everything else is DejaVu's: the advance (1233), the
  outline's width and thickness, the glyph's hinting program with DejaVu's
  `fpgm` / `prep` / `cvt ` / `gasp`, and hhea / OS/2 / head / post line
  metrics (asserted by the script and by `tests/unit/font-glyphs.test.ts`),
  so it cannot change a line box or the cell. The copyright notice is kept
  (name ID 0); the family name is our own, as the Bitstream Vera licence asks
  of a modified version (`LICENSE-DejaVu.txt`). It comes first in the
  DejaVu stack with `unicode-range: U+5F`; no other stack uses it.
  - **Build** (build time only, no npm dependency): Python 3 with fontTools
    and brotli, e.g. `python3 -m venv /tmp/wc-font &&
    /tmp/wc-font/bin/pip install fonttools==4.66.0 brotli==1.2.0 &&
    /tmp/wc-font/bin/python scripts/build-underscore-font.py`. The files
    here were built with fontTools 4.66.0 + brotli 1.2.0; the output is
    byte-for-byte reproducible with those versions. `--raise N` builds
    another shift (`--out DIR` elsewhere).
- **WebCockpit Fill** faces (ADR 0049) draw the box-drawing, block,
  quadrant and shade glyphs a host font lacks, from rectangles (no
  third-party outlines), at the host's units per em, advance and line
  metrics (hhea, OS/2 typo and win), so they cannot change a line box.
  Blocks fill the host's `█` extent (Anonymous Pro has none: its line
  metrics); halves and quadrants split where the host's `▀` / `▌` do;
  box lines use the host's line positions and thickness, or for Hermit
  its `|` stem (90 units) on the cell's centre line. One file serves both
  weights. Each comes first in its host's stack with a `unicode-range` of
  exactly the glyphs the host lacks:

  | Face | Host | Glyphs |
  |---|---|---|
  | WebCockpit Fill AP | Anonymous Pro | `▀▄▌▐█▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇░▒▓` |
  | WebCockpit Fill H | Hermit | `─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▖▗▘▝▚▞▛▜▙▟░▒▓` |
  | WebCockpit Fill GM | Go Mono | `▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇` |
  | WebCockpit Fill LC | Lucida Console | `▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇` |

  - **Build:** `/tmp/wc-font/bin/python scripts/build-fill-fonts.py`
    (fontTools 4.66.1 + brotli 1.2.0; reproducible byte for byte; it
    asserts the host numbers against the host files here).

## Fallbacks per family

- **Symbols** a family lacks (`✦ ✧ ⚔ ★ ☆ ⚠ ✖` and others, per family) come
  from DejaVu Sans Mono, the last family in every stack, at DejaVu's
  advance.
- **Agave Bold** covers Latin and a few symbols but no box or block glyph.
  Its bold @font-face rule has a `unicode-range` of exactly its cmap; the
  rest of a bold run falls to "WebCockpit Agave Regular", which is
  `Agave-Regular.woff2` for both weights (same file, fetched once).
- **IBM 3270** has no bold and **Lucida Console** is used regular only:
  their bold @font-face rules point at the regular face. A synthetic bold
  is wider in Firefox (measured: 10.8 → 11.2 px per cell at 20 px) and
  would break the grid.

## Glyph coverage

`tests/unit/font-glyphs.test.ts` reads the cmaps of these files and checks,
per family and weight, that the family with its glyph faces draws every
box, block, quadrant and shade glyph the UI uses (Inv §10.1), that each
fill face draws exactly what its host lacks, and that the advances and
line metrics below match the files.

## Metrics

Read with fontTools; update them if a font file changes. `█` is the glyph's
y-range in font units. The cell height in em (`blockEm`) is the tallest
cell `█` still covers where browsers put it: a line box of height L
centres the font's ascent + descent, so the baseline sits (A − D) / 2
above the box's middle, and both ends of `█` must lie L / 2 or more from
it. A and D are hhea's ascender and descender (Linux, macOS) or OS/2
win (Windows), typo where `USE_TYPO_METRICS` is set; the smallest result
wins. For a `█` centred on those metrics this is its full height.

| Font | units/em | advance | `█` y-range | hhea A / D | typo or win A / D | `blockEm` | `advanceEm` |
|---|---|---|---|---|---|---|---|
| Agave | 2048 | 1024 | −544 … 1568 | 1536 / 512 | typo 1536 / 512 | 2112/2048 | 1024/2048 |
| Anonymous Pro | 2048 | 1118 | none (−373 … 1675) | 1675 / 373 | win 1675 / 373 | 2048/2048 | 1118/2048 |
| Cascadia Mono | 2048 | 1200 | −480 … 2226 | 1900 / 480 | typo 1900 / 480 | 2380/2048 | 1200/2048 |
| DejaVu Sans Mono | 2048 | 1233 | −512 … 1921 | 1901 / 483 | win 1901 / 483 | 2433/2048 (ink height, ADR 0010) | 1233/2048 |
| Fantasque Sans Mono | 2048 | 1060 | −505 … 1820 | 1700 / 398 | typo 1650 / 398 | 2262/2048 | 1060/2048 |
| Fira Code | 1950 | 1200 | −600 … 1800 | 1800 / 600 | typo 1800 / 600 | 2400/1950 | 1200/1950 |
| Go Mono | 2048 | 1229 | −432 … 1935 | 1935 / 432 | win 1935 / 432 | 2367/2048 | 1229/2048 |
| Hack | 2048 | 1233 | −512 … 1950 | 1901 / 483 | win 1901 / 483 | 2442/2048 | 1233/2048 |
| Hermit | 1000 | 618 | −375 … 875 | 1000 / 414 | win 1000 / 414 | 1164/1000 | 618/1000 |
| IBM 3270 | 2000 | 1080 | −400 … 1600 | 1600 / 400 | typo 1600 / 400 | 2000/2000 | 1080/2000 |
| IBM Plex Mono | 1000 | 600 | −350 … 950 | 1025 / 275 | win 1025 / 275 | 1150/1000 | 600/1000 |
| Inconsolata | 1000 | 500 | −400 … 1000 | 859 / 190 | typo 859 / 190 | 1331/1000 | 500/1000 |
| JetBrains Mono NL | 1000 | 600 | −300 … 1020 | 1020 / 300 | typo 1020 / 300 | 1320/1000 | 600/1000 |
| mononoki | 1024 | 575 | −250 … 900 | 900 / 250 | win 900 / 250 | 1150/1024 | 575/1024 |
| Noto Sans Mono | 1000 | 600 | −240 … 973 | 1069 / 293 | typo 1069 / 293 | 1170/1000 | 600/1000 |
| Lucida Console 5.01 (not shipped) | 2048 | 1234 | −432 … 1616 | 1616 / 432 | win 1616 / 432 | 2048/2048 | 1234/2048 |

Grid settings per family (`src/theme/fonts.ts`, `src/theme/cells.ts`,
ADR 0049), chosen by a seam sweep of every size 6–32 in Chromium and
Firefox on Linux:

- `cellMargin` 0.5 px for every family added in ADR 0049 (mononoki
  1 px, JetBrains Mono 0.1 px, DejaVu Sans Mono 0): the cell is rounded
  down from `px × blockEm − cellMargin`, so `█` always reaches past both
  cell edges.
- `wholePx` for Go Mono, IBM 3270, IBM Plex Mono and Lucida Console:
  whole-px font sizes whose advance is less than 0.45 px over a whole
  px. Chrome on Linux draws these fonts at the size rounded to whole px,
  so a fractional size rounded down made `█` narrower than the cell.
- `halfUpPx` for JetBrains Mono: the same Chrome rounding, fixed by
  raising a size with a fraction under half a px to the next half px
  (13.333 → 13.5), which Chrome rounds up; cell widths stay the same.

Rows of the chrome kit (`.wc-line`) and the panes (`.wc-prow`) clip
sideways only, so blocks and box lines join across rows there as in the
output pane (ADR 0049 "Clipped rows"). The sweep above was repeated at
device pixel ratio 2: clean in Firefox; the Chromium leftovers at ratio
2 and both browsers at fractional ratios are listed in the ADR.

At device pixel ratios other than 1 the cell is fitted to device pixels
(ADR 0050): whole device px in Firefox and in Chrome at fractional
ratios, whole CSS px with a little more height margin in Chrome at 200 %.
The ratio-1 cells above are unchanged. The per-ratio sweep results are
in ADR 0050.

SHA-256:

```
fe09e040c8d9246f9e4f71e4345d3d9230573d51e8abaea565718c4bd0e28e51  Agave-Bold.woff2
5c0a8ecc05629c2a574e995942ed2dbc4b684223fda33aa1c898db11ee6f1721  Agave-Regular.woff2
ffefff0dece1c2edcfe90d7348869aa1d2f9e34a4a2454fd31acd82715bab964  AnonymousPro-Bold.woff2
ebe57882f58621f8317650f7f49556cd7a385c75f036afaf1b5c73ed8fdbae8d  AnonymousPro-Regular.woff2
d84776a2893f382b96c8bfe085d438dc07f2fdd98210fa9f2d3ac62d82a7aef4  CascadiaMono-Bold.woff2
abbf67cceb200508c9590ac9b75b37dd2211f58ea56279f1fa6ec87265f9d713  CascadiaMono-Regular.woff2
989f3749f990060bc0f303d3d966fd2b2e45780023bd19a29c7376b58489d2f1  DejaVuSansMono-Bold.woff2
b4fd85623f52f10eca9846a209e62c57bfb58871f15beae604ac33e8245cac90  DejaVuSansMono.woff2
e17a23da11a1eb3b0aa1a07c67a7eb9257b8a2b17e4389df7b70e8b51002dee4  FantasqueSansMono-Bold.woff2
9275f4d5df297aac90080131ad11a79700e977dc4b90ba439d4281e4e24ef7f9  FantasqueSansMono-Regular.woff2
d15cd3f7782dd730f657166efed75e6f96f8e85006304623f4b750e7c9f15248  FiraCode-Bold.woff2
63699de93026d6571026178ebd82b2fd89c629686aaea949e601ee97a6f345f5  FiraCode-Regular.woff2
3ee2508a17f1c4697e97aab6f98ea3b575dfbd37b8cedb6b9ad28205e89b4eb8  GoMono-Bold.woff2
024ad7946415a4b4d0b91facd8b0a153e0f1707d2d6dc0a72de924bad4ae7f0c  GoMono-Regular.woff2
95650ac0087c0d95e15ca6b061774aede0975dad9f8c481810d6660e2322ee3e  Hack-Bold.woff2
29c0c3dd3b64ea24570d0d43a076970c18572fbf1477e74486921183ac171ab5  Hack-Regular.woff2
8c056775d7f709ad4c923d8cc60473aa02926d94962bb6b5466889edf028864a  Hermit-Bold.woff2
542a5ac4615ab96f344118e2946e3573175b87314bb96b59e02055840d1a0905  Hermit-Regular.woff2
310a33ae82c795d57f380e50e860843f2420f6b7045446572901d1623b885e28  IBM3270-Regular.woff2
6b4ea2bb13e6104a3cf70317154db46de07a6ff1e62facaf505639a6be5b120f  IBMPlexMono-Bold.woff2
f05fb22e714aa0aa9b00e1253db0efa5315c02bc16d4fddfb590a1ff4527c24d  IBMPlexMono-Regular.woff2
f0777dcacc78627f09bdf8e3c7ce238969a40c6691f01cecfe191ad0f35e5ae3  Inconsolata-Bold.woff2
01239936a0bbafe5a23c354e20da07b410da48669c65df8c6be8273444e9d0b3  Inconsolata-Regular.woff2
e3962097261521ce30c210647f7390bf21a272eb8e8cf385f52c4d3bc62d6239  JetBrainsMonoNL-Bold.woff2
65ff29926fb333554c24ece283274c139ff732a3c06fdada0da92dd173dcb731  JetBrainsMonoNL-Regular.woff2
696b9e03967136d6763382783f9d2da4fbe88acc7d1538765c8819321a8c6505  mononoki-Bold.woff2
69f3619faa861759cb3e74df70ee56d3a25d5734e37c9f8be44af082d95ddfd7  mononoki-Regular.woff2
831b27e6eb222fffd1c5f1bb9507da1934661c69c9bb465167948fb8f8d35b0c  NotoSansMono-Bold.woff2
6f931a70336eb70286e76a91a5a75bdd9e82d1a395135f82fee69f3c011ed9f6  NotoSansMono-Regular.woff2
798668d8e435cc9401d29362d489c4f2566a19011f7d1e78bfd084d39453b8a7  WebCockpitFill-AP.woff2
2f9804f19d1a763ee421885d92c5b0087b370d228c278f40a2ca476362c83e02  WebCockpitFill-GM.woff2
5cc68a47f995bd566821e605a91499c8b56f0df08c06fcf5a4dc7870fa624073  WebCockpitFill-H.woff2
d2fd8383f464793b48c4e5eb9e273d30777983ba66c661a69999bdc8135effd4  WebCockpitFill-LC.woff2
1574740026f01361c29c02fa6bdddc68c32c2e4669786a679238fd96b6e16657  WebCockpitUnderscore-Bold.woff2
8e5cbcfc1f3e464bb1635757d54f6507c3e5621be36c8ccb9ffa9894628d8867  WebCockpitUnderscore.woff2
```
