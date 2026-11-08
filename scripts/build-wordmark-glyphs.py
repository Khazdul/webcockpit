#!/usr/bin/env python3
"""Builds the start page wordmark's letter outlines (ADR 0126,
src/start/wordmark-glyphs.ts).

The wordmark (src/start/wordmark-svg.ts) draws "MUME" and "COCKPIT" as SVG
paths, never as live text, so it looks the same before any web font has
loaded (the first paint, ADR 0083) and on every device. The outlines come
from Cinzel, the variable font (wght 400..900) of the Cinzel Project:

    Cinzel[wght].ttf, version 2.000, from google/fonts ofl/cinzel/
    (https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf),
    sha256 f4d83d34d1f6c741193e4acf4b3dff9531e5a67b6aa65228d00a7db72a4e0f34,
    SIL OFL 1.1, no Reserved Font Name (public/fonts/LICENSE-Cinzel.txt).

The font file is not shipped and not committed; only the few outlines are,
as a drawing (a logo made with the font, OFL FAQ 1.1).

    MUME     wght 900 (Black, as the approved mockup), letters set by their
             advances plus 0.045 em (round6/logo-3.html), no kerning
    COCKPIT  wght 600, tracked 0.95 em (the mockup's letter-spacing)
    M        wght 900 alone (the favicon, scripts/build-favicons.ts)

Units: 1000 per em, y down, baseline at y = 0, the word's left edge at
x = 0. Coordinates are rounded to whole units (0.14 px on a 660 px wide
mark) and written as relative path commands to keep the module small.

Run (fontTools only, as scripts/build-fill-fonts.py):

    python3 scripts/build-wordmark-glyphs.py /path/to/Cinzel[wght].ttf
"""

import hashlib
import pathlib
import sys

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "start" / "wordmark-glyphs.ts"
SHA256 = "f4d83d34d1f6c741193e4acf4b3dff9531e5a67b6aa65228d00a7db72a4e0f34"

MUME_WGHT = 900
MUME_GAP = 45  # 0.045 em between letters
COCKPIT_WGHT = 600
COCKPIT_TRACK = 950  # 0.95 em


class RelPen(BasePen):
    """Collects a glyph's outline, offset by (dx, 0) and flipped to y down, as rounded absolute points."""

    def __init__(self, glyphset, dx):
        super().__init__(glyphset)
        self.dx = dx
        self.ops = []  # (cmd, [points])

    def p(self, pt):
        return (round(pt[0] + self.dx), round(-pt[1]))

    def _moveTo(self, pt):
        self.ops.append(("M", [self.p(pt)]))

    def _lineTo(self, pt):
        self.ops.append(("L", [self.p(pt)]))

    def _qCurveToOne(self, p1, p2):
        self.ops.append(("Q", [self.p(p1), self.p(p2)]))

    def _curveToOne(self, p1, p2, p3):
        self.ops.append(("C", [self.p(p1), self.p(p2), self.p(p3)]))

    def _closePath(self):
        self.ops.append(("Z", []))

    _endPath = _closePath


def num(n, first):
    """A number in a path, with the separator it needs (none before a minus sign)."""
    s = str(n)
    return s if first or s.startswith("-") else " " + s


def serialise(ops):
    """Relative commands from the rounded absolute points (no drift: each delta is exact)."""
    out = []
    cur = (0, 0)
    start = (0, 0)
    last = None
    for cmd, pts in ops:
        if cmd == "Z":
            out.append("z")
            cur = start
            last = "z"
            continue
        if cmd == "M":
            # the first move is absolute, the rest relative
            x, y = pts[0]
            if not out:
                out.append(f"M{x}{num(y, False)}")
            else:
                out.append(f"m{num(x - cur[0], True)}{num(y - cur[1], False)}")
            cur = start = (x, y)
            last = "m"
            continue
        if cmd == "L":
            x, y = pts[0]
            ddx, ddy = x - cur[0], y - cur[1]
            if ddy == 0:
                c, args = "h", [ddx]
            elif ddx == 0:
                c, args = "v", [ddy]
            else:
                c, args = "l", [ddx, ddy]
            cur = (x, y)
        else:
            c = cmd.lower()
            args = []
            for x, y in pts:
                args += [x - cur[0], y - cur[1]]
            cur = pts[-1]
        if c == last:
            # an implicit repeat of the command: the letter can go
            out.append("".join(num(a, False) for a in args))
        else:
            out.append(c + "".join(num(a, i == 0) for i, a in enumerate(args)))
        last = c
    return "".join(out)


def word(font, text, wght, gap):
    gs = font.getGlyphSet(location={"wght": wght})
    cmap = font.getBestCmap()
    x = 0
    ops = []
    for i, ch in enumerate(text):
        g = gs[cmap[ord(ch)]]
        pen = RelPen(gs, x)
        g.draw(pen)
        ops += pen.ops
        x += g.width + (gap if i < len(text) - 1 else 0)
    xs = [p[0] for _, pts in ops for p in pts]
    ys = [p[1] for _, pts in ops for p in pts]
    return {
        "d": serialise(ops),
        "x0": min(xs),
        "x1": max(xs),
        "top": min(ys),
        "bottom": max(ys),
    }


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = pathlib.Path(sys.argv[1])
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SHA256:
        sys.exit(f"{path}: sha256 {digest}, expected {SHA256} (Cinzel 2.000 variable)")
    font = TTFont(path)
    cap = font["OS/2"].sCapHeight
    mume = word(font, "MUME", MUME_WGHT, MUME_GAP)
    cockpit = word(font, "COCKPIT", COCKPIT_WGHT, COCKPIT_TRACK)
    m = word(font, "M", MUME_WGHT, 0)

    def obj(name, w, doc):
        return (
            f"/** {doc} */\n"
            f"export const {name}: Glyphs = {{\n"
            f"  d: '{w['d']}',\n"
            f"  x0: {w['x0']},\n  x1: {w['x1']},\n  top: {w['top']},\n  bottom: {w['bottom']},\n"
            "};\n"
        )

    OUT.write_text(
        "// GENERATED by scripts/build-wordmark-glyphs.py from Cinzel 2.000 (SIL OFL 1.1,\n"
        "// public/fonts/LICENSE-Cinzel.txt); do not edit. ADR 0126.\n"
        "// Units: 1000 per em, y down, baseline y = 0, the word's left edge at x = 0.\n"
        "\n"
        "export interface Glyphs {\n"
        "  /** The outline (SVG path data). */\n"
        "  d: string;\n"
        "  /** Ink bounds. */\n"
        "  x0: number;\n  x1: number;\n  top: number;\n  bottom: number;\n"
        "}\n"
        "\n"
        f"/** Cinzel's cap height (units). */\nexport const CAP = {cap};\n\n"
        + obj("MUME", mume, f"MUME, wght {MUME_WGHT}, {MUME_GAP} units between letters.")
        + "\n"
        + obj("COCKPIT", cockpit, f"COCKPIT, wght {COCKPIT_WGHT}, tracked {COCKPIT_TRACK} units.")
        + "\n"
        + obj("M_ONLY", m, f"The M alone, wght {MUME_WGHT} (the favicon).")
    )
    print(f"{OUT.relative_to(ROOT)}: MUME {len(mume['d'])} B, COCKPIT {len(cockpit['d'])} B, M {len(m['d'])} B")


if __name__ == "__main__":
    main()
