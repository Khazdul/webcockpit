#!/usr/bin/env python3
"""Builds the one-glyph face "WebCockpit Underscore" (ADR 0043).

The cell is lower than DejaVu Sans Mono's ascent + descent (src/theme/cells.ts
rounds it down so block glyphs tile), and DejaVu draws `_` in its lowest
descender row, which then falls outside the cell at many settings. This
script takes `_` (U+005F) from the bundled DejaVu Sans Mono files, moves
its outline up by RAISE font units and writes it as a font of its own:

    public/fonts/WebCockpitUnderscore.woff2        (from DejaVuSansMono.woff2)
    public/fonts/WebCockpitUnderscore-Bold.woff2   (from DejaVuSansMono-Bold.woff2)

Nothing else differs from DejaVu: the advance width, the outline's width
and thickness, the hinting program of the glyph (it measures from the
glyph origin, so it follows the move), and the vertical metrics (hhea,
OS/2), which the script asserts. The face can therefore not change a line
box. The family name is our own, as the Bitstream Vera / DejaVu licence
asks of a modified version (public/fonts/LICENSE-DejaVu.txt).

Dependency (build time only; not an npm or runtime dependency):
Python 3 with fontTools and brotli, e.g.

    python3 -m venv /tmp/wc-font && /tmp/wc-font/bin/pip install fonttools==4.66.0 brotli==1.2.0
    /tmp/wc-font/bin/python scripts/build-underscore-font.py

Options: `--raise N` (font units, default RAISE), `--out DIR` (default
public/fonts). The output is reproducible: the same input files and
fontTools / brotli versions give the same bytes. After a rebuild, update
the SHA-256 list in public/fonts/README.md.
"""

import argparse
import hashlib
import pathlib

from fontTools import subset
from fontTools.ttLib import TTFont

# Font units (DejaVu has 2048 per em). Chosen by measurement, see ADR 0043.
RAISE = 278

FAMILY = "WebCockpit Underscore"
PS_FAMILY = "WebCockpitUnderscore"
FONTS = pathlib.Path(__file__).resolve().parent.parent / "public" / "fonts"
FACES = [
    ("DejaVuSansMono.woff2", "WebCockpitUnderscore.woff2", "Regular"),
    ("DejaVuSansMono-Bold.woff2", "WebCockpitUnderscore-Bold.woff2", "Bold"),
]
VERTICAL = {
    "hhea": ["ascent", "descent", "lineGap"],
    "OS/2": ["sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent", "fsSelection"],
    "head": ["unitsPerEm"],
    "post": ["underlinePosition", "underlineThickness"],
}


def vertical(font):
    return {(t, k): getattr(font[t], k) for t, keys in VERTICAL.items() for k in keys}


def build(src, dst, style, up):
    font = TTFont(src, recalcTimestamp=False)
    before = vertical(font)
    advance = font["hmtx"]["underscore"]

    opts = subset.Options()
    opts.hinting = True  # keep fpgm / prep / cvt and the glyph program
    opts.layout_features = []
    opts.notdef_outline = False
    opts.name_IDs = [0]  # the copyright notice; the names are rewritten below
    opts.name_languages = ["*"]
    opts.drop_tables += ["FFTM", "GDEF", "GPOS", "GSUB"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[0x5F])
    sub.subset(font)

    glyph = font["glyf"]["underscore"]
    glyph.coordinates.translate((0, up))
    glyph.recalcBounds(font["glyf"])

    name = font["name"]
    copyright_ = name.getDebugName(0) or ""
    name.names = []
    full = FAMILY if style == "Regular" else f"{FAMILY} {style}"
    records = {
        0: copyright_ + f"\nThe underscore of DejaVu Sans Mono, moved up {up} units for WebCockpit.",
        1: FAMILY,
        2: style,
        3: f"WebCockpit: {full}: underscore +{up}",
        4: full,
        5: f"Version 1.0; derived from DejaVu Sans Mono 2.37; raise {up}",
        6: f"{PS_FAMILY}-{style}",
    }
    for name_id, text in records.items():
        name.setName(text, name_id, 3, 1, 0x409)

    assert font["hmtx"]["underscore"] == advance, "advance changed"
    assert vertical(font) == before, "vertical metrics changed"
    assert sorted(font.getBestCmap()) == [0x5F], "more than U+005F mapped"

    font.flavor = "woff2"
    font.save(dst)
    data = pathlib.Path(dst).read_bytes()
    print(f"{hashlib.sha256(data).hexdigest()}  {pathlib.Path(dst).name}  ({len(data)} bytes, y {glyph.yMin} .. {glyph.yMax})")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raise", dest="up", type=int, default=RAISE)
    ap.add_argument("--out", type=pathlib.Path, default=FONTS)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for src, dst, style in FACES:
        build(FONTS / src, args.out / dst, style, args.up)


if __name__ == "__main__":
    main()
