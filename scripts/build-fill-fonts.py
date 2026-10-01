#!/usr/bin/env python3
"""Builds the "WebCockpit Fill" faces (ADR 0049).

Some terminal fonts WebCockpit offers lack box-drawing, block, quadrant or
shade glyphs that MUME output and the WebCockpit panes use. A glyph that
the font lacks would come from the next family in the CSS stack, at that
family's advance, and break the cell grid. A fill face draws the missing
glyphs from scratch (rectangles; no third-party outlines) at exactly the
host font's advance, units per em and vertical metrics, so the face cannot
change a line box, and it comes first in the host's CSS stack with a
`unicode-range` of only the glyphs that host lacks (src/theme/fonts.ts).

    public/fonts/WebCockpitFill-AP.woff2   for Anonymous Pro (all blocks and shades)
    public/fonts/WebCockpitFill-H.woff2    for Hermit (box lines, quadrants, shades)
    public/fonts/WebCockpitFill-GM.woff2   for Go Mono (quadrants, eighth blocks)
    public/fonts/WebCockpitFill-LC.woff2   for Lucida Console (quadrants, eighth blocks)

One file per host serves both weights: box and block glyphs need not be
bold, and the bold @font-face rule points at the same file so that no
browser synthesises a bold (which widens the advance in Firefox).

Geometry, in the host's font units (HOSTS below):

- The block extent [bottom, top] is the host's own `█` (Anonymous Pro has
  none: its line metrics, -373 .. 1675, which its own `│` spans too). Block,
  half, quadrant and eighth glyphs fill that extent; vertical box lines
  span it, so they reach across the cell into the rows above and below
  (the cell is never higher than the block, src/theme/cells.ts).
- The half-block split is the host's `▀` bottom and `▌` right edge where it
  has them (so quadrants line up with its halves), else the middle.
- Box lines: where the host has `─` / `│` / `═` / `║`, the fill uses their
  position and thickness; otherwise (Hermit) the stroke is the host's `|`
  stem (90 units), centred on the cell's centre line (the middle of the
  host's ascent + descent, where the browser centres the line box).
  Horizontal lines run the full advance, so they meet in the next cell.
- Shades are square patterns of 4 columns x 8 rows that repeat across
  cells: ░ 25 %, ▒ 50 %, ▓ 75 %.

Vertical metrics (hhea, OS/2 typo and win, fsSelection's USE_TYPO_METRICS
bit) and unitsPerEm are the host's, asserted against the bundled host file
where WebCockpit ships it. Lucida Console is never shipped (it is only used
when installed, ADR 0049); its numbers below were measured from
Lucida Console 5.01 (`lucon.ttf`) and are facts about the font, not its
outlines.

Licence: the faces are WebCockpit's own work, under the SIL Open Font
License 1.1 (public/fonts/LICENSE-WebCockpitFill.txt), copyright the
WebCockpit authors.

Dependency (build time only; not an npm or runtime dependency):
Python 3 with fontTools and brotli, e.g.

    python3 -m venv /tmp/wc-font && /tmp/wc-font/bin/pip install fonttools==4.66.1 brotli==1.2.0
    /tmp/wc-font/bin/python scripts/build-fill-fonts.py

Options: `--out DIR` (default public/fonts). The output is reproducible:
the same fontTools / brotli versions give the same bytes. After a rebuild,
update the SHA-256 list in public/fonts/README.md.
"""

import argparse
import hashlib
import pathlib

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

FONTS = pathlib.Path(__file__).resolve().parent.parent / "public" / "fonts"

# The glyphs a terminal font must draw itself (tests/unit/font-glyphs.test.ts
# STRUCTURAL) plus the rest of the common box, quadrant and shade set.
FILL_SET = "─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▀▄▌▐█▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇░▒▓"

# A fixed date (head.created / head.modified) keeps the output reproducible.
TIMESTAMP = 3_870_000_000  # 2026-08-23, seconds since 1904-01-01
VERSION = "Version 1.000"
COPYRIGHT = "Copyright 2026 The WebCockpit Authors (https://github.com/Khazdul/webcockpit)"
LICENSE = (
    "This Font Software is licensed under the SIL Open Font License, Version 1.1. "
    "This license is available with a FAQ at: https://openfontlicense.org"
)
LICENSE_URL = "https://openfontlicense.org"

# key: (family suffix, host file under public/fonts or None, host metrics)
#   upm, adv: units per em and the advance of every glyph
#   hhea: (ascender, descender, lineGap); typo: same for OS/2 sTypo*;
#   win: (usWinAscent, usWinDescent); useTypo: fsSelection bit 7
#   block: (bottom, top) of the block extent; split: (x, y) of the halves
#   hline / vline: (from, to) of the light lines; dbl: ((lower), (upper)) and
#   ((left), (right)) of the double lines. None: not needed (the host has them).
HOSTS = {
    "AP": dict(
        host="AnonymousPro-Regular.woff2",
        hosts=["AnonymousPro-Regular.woff2", "AnonymousPro-Bold.woff2"],
        upm=2048, adv=1118,
        hhea=(1675, -373, 0), typo=(1675, -373, 0), win=(1675, 373), useTypo=False,
        block=(-373, 1675), split=(559, 651),
        hline=(584, 721), vline=(397, 535), dbl=None,
    ),
    "H": dict(
        host="Hermit-Regular.woff2",
        hosts=["Hermit-Regular.woff2", "Hermit-Bold.woff2"],
        upm=1000, adv=618,
        hhea=(1000, -414, 0), typo=(750, -250, 92), win=(1000, 414), useTypo=False,
        block=(-375, 875), split=(309, 250),
        # Centre line (1000 - 414) / 2 = 293; the stroke is Hermit's `|` (264 .. 354).
        hline=(248, 338), vline=(264, 354),
        dbl=(((158, 248), (338, 428)), ((174, 264), (354, 444))),
    ),
    "GM": dict(
        host="GoMono-Regular.woff2",
        hosts=["GoMono-Regular.woff2", "GoMono-Bold.woff2"],
        upm=2048, adv=1229,
        hhea=(1935, -432, 0), typo=(1579, -395, 393), win=(1935, 432), useTypo=False,
        block=(-432, 1935), split=(615, 752),
        hline=(678, 826), vline=(541, 689), dbl=None,
    ),
    "LC": dict(
        host=None,
        hosts=[],
        upm=2048, adv=1234,
        hhea=(1616, -432, 0), typo=(1604, -420, 167), win=(1616, 432), useTypo=False,
        block=(-432, 1616), split=(617, 592),
        hline=(518, 666), vline=(543, 691), dbl=None,
        # The glyphs Lucida Console 5.01 lacks from FILL_SET.
        missing="▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇",
    ),
}


def shapes(ch, h):
    """The rectangles (x0, y0, x1, y1) that draw `ch` for host `h`."""
    W = h["adv"]
    bb, bt = h["block"]
    xs, ys = h["split"]
    full = lambda x0, x1: (x0, bb, x1, bt)  # noqa: E731
    q = {
        "ul": (0, ys, xs, bt), "ur": (xs, ys, W, bt),
        "ll": (0, bb, xs, ys), "lr": (xs, bb, W, ys),
    }
    quads = {
        "▖": ["ll"], "▗": ["lr"], "▘": ["ul"], "▝": ["ur"],
        "▚": ["ul", "lr"], "▞": ["ur", "ll"],
        "▛": ["ul", "ur", "ll"], "▜": ["ul", "ur", "lr"],
        "▙": ["ul", "ll", "lr"], "▟": ["ur", "ll", "lr"],
    }
    if ch in quads:
        return [q[k] for k in quads[ch]]
    if ch == "█":
        return [full(0, W)]
    if ch == "▀":
        return [(0, ys, W, bt)]
    if ch == "▄":
        return [(0, bb, W, ys)]
    if ch == "▌":
        return [full(0, xs)]
    if ch == "▐":
        return [full(xs, W)]
    eighths = {"▁": 1, "▂": 2, "▃": 3, "▅": 5, "▆": 6, "▇": 7}
    if ch in eighths:
        return [(0, bb, W, bb + round(eighths[ch] * (bt - bb) / 8))]
    if ch in "░▒▓":
        cols = [round(i * W / 4) for i in range(5)]
        rows = [bb + round(j * (bt - bb) / 8) for j in range(9)]
        out = []
        for j in range(8):
            for i in range(4):
                light = j % 2 == 0 and i % 2 == (j // 2) % 2
                on = {"░": light, "▒": (i + j) % 2 == 0, "▓": not light}[ch]
                if on:
                    out.append((cols[i], rows[j], cols[i + 1], rows[j + 1]))
        return out
    # Light box lines.
    hy0, hy1 = h["hline"]
    vx0, vx1 = h["vline"]
    left, right = (0, hy0, vx1, hy1), (vx0, hy0, W, hy1)
    up, down = (vx0, hy0, vx1, bt), (vx0, bb, vx1, hy1)
    light = {
        "─": [(0, hy0, W, hy1)], "│": [(vx0, bb, vx1, bt)],
        "┌": [right, down], "┐": [left, down], "└": [right, up], "┘": [left, up],
        "├": [(vx0, bb, vx1, bt), right], "┤": [(vx0, bb, vx1, bt), left],
        "┬": [(0, hy0, W, hy1), down], "┴": [(0, hy0, W, hy1), up],
        "┼": [(0, hy0, W, hy1), (vx0, bb, vx1, bt)],
    }
    if ch in light:
        return light[ch]
    # Double box lines: lo / hi are the lower / upper horizontal strokes,
    # l / r the left / right vertical strokes.
    (lo, hi), (l, r) = h["dbl"]
    H = lambda y, x0, x1: (x0, y[0], x1, y[1])  # noqa: E731
    V = lambda x, y0, y1: (x[0], y0, x[1], y1)  # noqa: E731
    double = {
        "═": [H(lo, 0, W), H(hi, 0, W)],
        "║": [V(l, bb, bt), V(r, bb, bt)],
        "╔": [H(hi, l[0], W), V(l, bb, hi[1]), H(lo, r[0], W), V(r, bb, lo[1])],
        "╗": [H(hi, 0, r[1]), V(r, bb, hi[1]), H(lo, 0, l[1]), V(l, bb, lo[1])],
        "╚": [H(lo, l[0], W), V(l, lo[0], bt), H(hi, r[0], W), V(r, hi[0], bt)],
        "╝": [H(lo, 0, r[1]), V(r, lo[0], bt), H(hi, 0, l[1]), V(l, hi[0], bt)],
        "╠": [V(l, bb, bt), V(r, bb, lo[1]), V(r, hi[0], bt), H(hi, r[0], W), H(lo, r[0], W)],
        "╣": [V(r, bb, bt), V(l, bb, lo[1]), V(l, hi[0], bt), H(hi, 0, l[1]), H(lo, 0, l[1])],
        "╦": [H(hi, 0, W), H(lo, 0, l[1]), H(lo, r[0], W), V(l, bb, lo[1]), V(r, bb, lo[1])],
        "╩": [H(lo, 0, W), H(hi, 0, l[1]), H(hi, r[0], W), V(l, hi[0], bt), V(r, hi[0], bt)],
        "╬": [
            H(lo, 0, l[1]), H(lo, r[0], W), H(hi, 0, l[1]), H(hi, r[0], W),
            V(l, bb, lo[1]), V(r, bb, lo[1]), V(l, hi[0], bt), V(r, hi[0], bt),
        ],
    }
    return double[ch]


def union_contours(rects):
    """Outline contours of the union of axis-aligned rectangles.

    Clockwise outer contours (TrueType), no overlaps: the union is traced on
    the grid of all rectangle edges. Rectangles that touch only at a corner
    (▚ ▞, the shades) give separate contours.
    """
    xs = sorted({v for r in rects for v in (r[0], r[2])})
    ys = sorted({v for r in rects for v in (r[1], r[3])})
    fill = set()
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if any(r[0] < cx < r[2] and r[1] < cy < r[3] for r in rects):
                fill.add((i, j))
    # Directed boundary edges with the filled side on the right (clockwise
    # in y-up coordinates): bottom edge left→right... becomes right→left.
    edges = {}
    for i, j in fill:
        x0, x1, y0, y1 = xs[i], xs[i + 1], ys[j], ys[j + 1]
        if (i, j - 1) not in fill:
            edges.setdefault((x1, y0), []).append((x0, y0))  # bottom, leftwards
        if (i, j + 1) not in fill:
            edges.setdefault((x0, y1), []).append((x1, y1))  # top, rightwards
        if (i - 1, j) not in fill:
            edges.setdefault((x0, y0), []).append((x0, y1))  # left, upwards
        if (i + 1, j) not in fill:
            edges.setdefault((x1, y1), []).append((x1, y0))  # right, downwards
    contours = []
    while edges:
        start = min(edges)
        pts = [start]
        prev = None
        cur = start
        while True:
            outs = edges[cur]
            if len(outs) == 1 or prev is None:
                nxt = outs[0]
            else:
                # Two contours touch at this corner: turn right, which keeps
                # each filled square its own contour.
                dx, dy = cur[0] - prev[0], cur[1] - prev[1]
                right = (cur[0] + _sign(dy), cur[1] - _sign(dx))
                nxt = next((o for o in outs if _dir(cur, o) == _dir(cur, right)), outs[0])
            outs.remove(nxt)
            if not outs:
                del edges[cur]
            prev, cur = cur, nxt
            if cur == start:
                break
            pts.append(cur)
        contours.append(_simplify(pts))
    return contours


def _sign(v):
    return (v > 0) - (v < 0)


def _dir(a, b):
    return (_sign(b[0] - a[0]), _sign(b[1] - a[1]))


def _simplify(pts):
    """Drops points in the middle of a straight run."""
    out = []
    n = len(pts)
    for k in range(n):
        a, b, c = pts[k - 1], pts[k], pts[(k + 1) % n]
        if _dir(a, b) != _dir(b, c):
            out.append(b)
    return out


def check_host(key, h):
    """Asserts the HOSTS numbers against the bundled host files."""
    for name in h["hosts"]:
        f = TTFont(FONTS / name)
        assert f["head"].unitsPerEm == h["upm"], (key, name, "unitsPerEm")
        hh, os2 = f["hhea"], f["OS/2"]
        assert (hh.ascent, hh.descent, hh.lineGap) == h["hhea"], (key, name, "hhea")
        assert (os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap) == h["typo"], (key, name, "typo")
        assert (os2.usWinAscent, os2.usWinDescent) == h["win"], (key, name, "win")
        assert bool(os2.fsSelection & 0x80) == h["useTypo"], (key, name, "USE_TYPO_METRICS")
        widths = {f["hmtx"][g][0] for g in f.getGlyphOrder()} - {0}
        cmap = f.getBestCmap()
        cmap_widths = {f["hmtx"][cmap[c]][0] for c in cmap if 0x20 <= c < 0x7F}
        assert cmap_widths == {h["adv"]}, (key, name, "advance", widths)


def missing(key, h):
    """The FILL_SET glyphs the host lacks (in every weight)."""
    if not h["hosts"]:
        return h["missing"]
    out = set()
    for name in h["hosts"]:
        cmap = TTFont(FONTS / name).getBestCmap()
        out |= {c for c in FILL_SET if ord(c) not in cmap}
    return "".join(c for c in FILL_SET if c in out)


def build(key, h, dst):
    check_host(key, h)
    chars = missing(key, h)
    family = f"WebCockpit Fill {key}"
    ps = f"WebCockpitFill{key}-Regular"
    names = [".notdef"] + [f"uni{ord(c):04X}" for c in chars]
    glyphs, metrics = {}, {}
    pen = TTGlyphPen(None)
    glyphs[".notdef"] = pen.glyph()
    metrics[".notdef"] = (h["adv"], 0)
    for c, gname in zip(chars, names[1:]):
        pen = TTGlyphPen(None)
        rects = shapes(c, h)
        for contour in union_contours(rects):
            pen.moveTo(contour[0])
            for p in contour[1:]:
                pen.lineTo(p)
            pen.closePath()
        glyphs[gname] = pen.glyph()
        metrics[gname] = (h["adv"], min(r[0] for r in rects))

    fb = FontBuilder(h["upm"], isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({ord(c): g for c, g in zip(chars, names[1:])})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    asc, desc, gap = h["hhea"]
    fb.setupHorizontalHeader(ascent=asc, descent=desc, lineGap=gap)
    fb.setupNameTable(
        {
            "copyright": COPYRIGHT,
            "familyName": family,
            "styleName": "Regular",
            "uniqueFontIdentifier": f"WebCockpit: {family}: {VERSION}",
            "fullName": family,
            "version": VERSION,
            "psName": ps,
            "description": f"Box-drawing and block glyphs for the {key} host font in WebCockpit (ADR 0049).",
            "licenseDescription": LICENSE,
            "licenseInfoURL": LICENSE_URL,
        },
        mac=False,
    )
    ta, td, tg = h["typo"]
    wa, wd = h["win"]
    fb.setupOS2(
        version=4,
        xAvgCharWidth=h["adv"],
        usWeightClass=400,
        fsType=0,
        sTypoAscender=ta,
        sTypoDescender=td,
        sTypoLineGap=tg,
        usWinAscent=wa,
        usWinDescent=wd,
        fsSelection=0x40 | (0x80 if h["useTypo"] else 0),
        achVendID="NONE",
        panose=_panose(),
        sxHeight=0,
        sCapHeight=0,
    )
    fb.setupPost(isFixedPitch=1, underlinePosition=-h["upm"] // 10, underlineThickness=h["upm"] // 20)
    fb.setupHead(unitsPerEm=h["upm"], created=TIMESTAMP, modified=TIMESTAMP, fontRevision=1.0)
    font = fb.font
    font["OS/2"].recalcUnicodeRanges(font)
    font.recalcTimestamp = False
    font.flavor = "woff2"
    font.save(dst)

    # Re-read and check what the browser will see.
    back = TTFont(dst)
    assert back["head"].unitsPerEm == h["upm"]
    assert (back["hhea"].ascent, back["hhea"].descent, back["hhea"].lineGap) == h["hhea"]
    o = back["OS/2"]
    assert (o.sTypoAscender, o.sTypoDescender, o.sTypoLineGap, o.usWinAscent, o.usWinDescent) == (*h["typo"], *h["win"])
    assert {back["hmtx"][g][0] for g in back.getGlyphOrder()} == {h["adv"]}
    assert "".join(sorted(map(chr, back.getBestCmap()))) == "".join(sorted(chars))
    data = pathlib.Path(dst).read_bytes()
    print(f"{hashlib.sha256(data).hexdigest()}  {pathlib.Path(dst).name}  ({len(data)} bytes) {chars}")


def _panose():
    from fontTools.ttLib.tables.O_S_2f_2 import Panose

    p = Panose()
    p.bFamilyType = 2
    p.bProportion = 9  # monospaced
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=pathlib.Path, default=FONTS)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for key, h in HOSTS.items():
        build(key, h, args.out / f"WebCockpitFill-{key}.woff2")


if __name__ == "__main__":
    main()
