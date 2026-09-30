# Bundled fonts

Self-hosted web fonts for WebCockpit (ADR 0010 "Fonts and cell grid",
ADR 0011). Regular and bold only; no italics (MUME output does not need
them; italic runs are synthesised by the browser).

| File | Family | Source | Licence |
|---|---|---|---|
| `DejaVuSansMono.woff2` | DejaVu Sans Mono | `DejaVuSansMono.ttf` from npm `dejavu-fonts-ttf@2.37.3` (DejaVu 2.37) | Bitstream Vera + public domain + Arev — `LICENSE-DejaVu.txt` |
| `DejaVuSansMono-Bold.woff2` | DejaVu Sans Mono Bold | `DejaVuSansMono-Bold.ttf`, same package | same |
| `WebCockpitUnderscore.woff2` | WebCockpit Underscore | `_` of `DejaVuSansMono.woff2` above, moved up 278 units, by `scripts/build-underscore-font.py` | same as DejaVu (modified version, own name) |
| `WebCockpitUnderscore-Bold.woff2` | WebCockpit Underscore Bold | `_` of `DejaVuSansMono-Bold.woff2`, same | same |
| `JetBrainsMonoNL-Regular.woff2` | JetBrains Mono (NL) | `fonts/ttf/JetBrainsMonoNL-Regular.ttf` from the JetBrains Mono v2.304 release zip (github.com/JetBrains/JetBrainsMono/releases/tag/v2.304) | SIL OFL 1.1 — `LICENSE-JetBrainsMono-OFL.txt` |
| `JetBrainsMonoNL-Bold.woff2` | JetBrains Mono Bold (NL) | `fonts/ttf/JetBrainsMonoNL-Bold.ttf`, same release | same |

- **Conversion.** TTF → WOFF2 with fontTools 4.66.0 + brotli 1.2.0
  (`TTFont(src); font.flavor = 'woff2'; font.save(dst)`). No glyphs,
  metrics or names were changed; the files are not subset.
- **WebCockpit Underscore** (ADR 0043) holds one glyph: DejaVu Sans
  Mono's `_` (U+005F), its outline moved up 278 of 2048 units (y −483 … −403
  becomes −205 … −125; bold −483 … −293 becomes −205 … −15) so that it ends
  inside the cell. Everything else is DejaVu's: the advance (1233), the
  outline's width and thickness, the glyph's hinting program with DejaVu's
  `fpgm` / `prep` / `cvt ` / `gasp`, and hhea / OS/2 / head / post line
  metrics (asserted by the script and by `tests/unit/font-glyphs.test.ts`),
  so it cannot change a line box or the cell. The copyright notice is kept
  (name ID 0); the family name is our own, as the Bitstream Vera licence asks
  of a modified version (`LICENSE-DejaVu.txt`). In the CSS it comes first in
  the DejaVu stack with `unicode-range: U+5F` (src/theme/fonts.css,
  src/theme/fonts.ts); the JetBrains stack does not use it.
  - **Build** (build time only, no npm dependency): Python 3 with fontTools
    and brotli, e.g. `python3 -m venv /tmp/wc-font &&
    /tmp/wc-font/bin/pip install fonttools==4.66.0 brotli==1.2.0 &&
    /tmp/wc-font/bin/python scripts/build-underscore-font.py`. The files
    here were built with fontTools 4.66.0 + brotli 1.2.0; the output is
    byte-for-byte reproducible with those versions. `--raise N` builds
    another shift (`--out DIR` elsewhere).
- **JetBrains Mono "NL"** is the no-ligatures build. A MUD client must not
  turn `->` or `!=` into ligatures. The @font-face family name is
  `JetBrains Mono` (src/theme/fonts.css).
- **Glyph coverage** (Inv §10.1) is checked by
  `tests/unit/font-glyphs.test.ts`, which reads the cmap from these files:
  - DejaVu Sans Mono (regular, bold): every listed glyph, plus `═║•…`.
  - JetBrains Mono (regular, bold): every box-drawing, half-block,
    quadrant, block and shade glyph. Missing symbols: `✦ ✧ ⚔ ♦ ★ ✖`.
    They come from DejaVu Sans Mono, the next family in the CSS stack.
- **Metrics used by the cell grid** (src/theme/fonts.ts, read with
  fontTools; update them if a font file changes):

  | Font | units/em | advance | `█` y-range | `blockEm` | `advanceEm` |
  |---|---|---|---|---|---|
  | DejaVu Sans Mono | 2048 | 1233 | −512 … 1921 | 2433/2048 | 1233/2048 |
  | JetBrains Mono NL | 1000 | 600 | −300 … 1020 | 1320/1000 | 600/1000 |

SHA-256:

```
b4fd85623f52f10eca9846a209e62c57bfb58871f15beae604ac33e8245cac90  DejaVuSansMono.woff2
989f3749f990060bc0f303d3d966fd2b2e45780023bd19a29c7376b58489d2f1  DejaVuSansMono-Bold.woff2
65ff29926fb333554c24ece283274c139ff732a3c06fdada0da92dd173dcb731  JetBrainsMonoNL-Regular.woff2
e3962097261521ce30c210647f7390bf21a272eb8e8cf385f52c4d3bc62d6239  JetBrainsMonoNL-Bold.woff2
8e5cbcfc1f3e464bb1635757d54f6507c3e5621be36c8ccb9ffa9894628d8867  WebCockpitUnderscore.woff2
1574740026f01361c29c02fa6bdddc68c32c2e4669786a679238fd96b6e16657  WebCockpitUnderscore-Bold.woff2
```
