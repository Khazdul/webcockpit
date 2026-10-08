#!/usr/bin/env python3
"""Builds WebCockpit's own flow marks for the community tilesets (ADR 0088).

The Gefe & Rik and Gray's Map tilesets (public/map/tilesets/gefe-rik/,
grays-map/) have no `stream-in-*` / `stream-out-*` files. Instead of the
default set's arrows, both get these marks, drawn for WebCockpit (owner,
stage 26 mockups): bare pixel-art "v" chevrons, no line, one per half
room in the flow direction. An in-tile has one on the edge half pointing
to the centre, an out-tile one on the centre half pointing out, so a
through-flow room shows two, evenly spaced at 1/4 and 3/4, and the first
and last room of a run one each. Strokes are 8 px (2 × 2 cells of 4 px).
Up and down draw on the diagonals (up: north-east, down: south-west).

The renderer draws these files as they are, without the WATER tint
(`Tileset.streamsAsIs`), so the colour below is the colour on screen:

    gefe-rik   160 × 160  #4cd8ff  cyan
    grays-map  128 × 128  #c4dcff  light sky blue (on Gray's #bfbffd water)

Transparent texels keep the mark's RGB at alpha 0, so the GPU's linear
filtering and mipmaps blend towards the mark's own colour, not black: no
dark rim around the strokes.

Dependency (build time only): Pillow.

    python3 -I scripts/build-flow-chevrons.py

It writes the 12 files of each set in place, and is deterministic: the
same Pillow (zlib) gives the same bytes.
"""

import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
TILESETS = ROOT / "public" / "map" / "tilesets"

# (folder, tile size in px, RGBA)
SETS = [
    ("gefe-rik", 160, (76, 216, 255, 255)),
    ("grays-map", 128, (196, 220, 255, 255)),
]

CELL = 4  # px per grid cell
DIRS = {
    "north": (0, -1),
    "south": (0, 1),
    "east": (1, 0),
    "west": (-1, 0),
    "up": (1, -1),
    "down": (-1, 1),
}
# The eight grid directions in order around the compass.
EIGHT = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]


def tile(size: int, col: tuple, d: str, outflow: bool) -> Image.Image:
    """One flow mark: direction `d`, an out-tile when `outflow`, else an in-tile."""
    g = size // CELL  # grid cells per side
    c = g // 2  # the centre cell
    # Transparent texels keep the colour: no dark rim when filtered.
    im = Image.new("RGBA", (size, size), col[:3] + (0,))
    px = im.load()

    def dot(x: int, y: int) -> None:
        """A 2 × 2 cell block whose lower-right cell is (x, y)."""
        for yy in (y - 1, y):
            for xx in (x - 1, x):
                if 0 <= xx < g and 0 <= yy < g:
                    for py in range(yy * CELL, yy * CELL + CELL):
                        for qx in range(xx * CELL, xx * CELL + CELL):
                            px[qx, py] = col

    dx, dy = DIRS[d]
    diag = dx and dy
    half = int(g * 0.4) if diag else c  # extent from the centre along the axis
    mid = (half // 2) // 2 * 2  # the chevron's centre, on the 8 px grid
    pdx, pdy = (dx, dy) if outflow else (-dx, -dy)  # where the chevron points
    tip = mid + 2 if outflow else mid - 2
    tx, ty = c + tip * dx, c + tip * dy
    dot(tx, ty)
    i = EIGHT.index((-pdx, -pdy))
    for a in (EIGHT[(i + 1) % 8], EIGHT[(i - 1) % 8]):
        for k in (1, 2):
            dot(tx + 2 * k * a[0], ty + 2 * k * a[1])
    return im


def main() -> None:
    for folder, size, col in SETS:
        out = TILESETS / folder
        if not out.is_dir():
            raise SystemExit(f"{out}: no such tileset folder")
        for d in DIRS:
            tile(size, col, d, False).save(out / f"stream-in-{d}.png")
            tile(size, col, d, True).save(out / f"stream-out-{d}.png")
        print(f"{folder}: 12 flow marks, {size} px")


if __name__ == "__main__":
    main()
