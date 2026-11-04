#!/usr/bin/env python3
"""Builds the tileset previews of Settings -> Mapper (ADR 0118).

Each concrete set (MMapper's default pixmaps and every set in
src/map/tilesets.ts `TILESETS`) gets one small PNG: the same 6 x 6 scene
(mountains, hills, forest, brush, field, water, shallows, a road and a
little city), north up, drawn with the set's own files at 24 px a room:

    public/map/tilesets/previews/<id>.png    144 x 144

A file is resolved as the renderer resolves it (src/map/tilesets.ts,
src/map/assets.ts): the set's own file when its folder has it, the set's
alias for it (`Tileset.aliases`, mirrored in ALIASES below), else the
default pixmap. The picker draws Shimrod (alternating) from the four
season previews, so it has no file of its own.

A new set: add it to SETS (and its aliases), run the script, commit the
PNG. The unit test (tests/unit/map-tilesets.test.ts) fails until the
preview is there.

Dependency (build time only): Pillow.

    python3 -I scripts/build-tileset-previews.py

Deterministic: the same Pillow (zlib) gives the same bytes.
"""

import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
MAP = ROOT / "public" / "map"
PIXMAPS = MAP / "pixmaps"
TILESETS = MAP / "tilesets"
OUT = TILESETS / "previews"

ROOM = 24  # px per room
SCENE = [
    ["terrain-mountains", "terrain-mountains", "terrain-hills", "terrain-forest", "terrain-forest", "terrain-water"],
    ["terrain-mountains", "terrain-hills", "terrain-brush", "terrain-forest", "terrain-forest", "terrain-water"],
    ["terrain-hills", "terrain-brush", "terrain-field", "terrain-field", "terrain-shallow", "terrain-water"],
    ["road-ew", "road-ew", "road-ew", "road-sw", "terrain-shallow", "terrain-shallow"],
    ["terrain-field", "terrain-field", "terrain-brush", "road-nes", "terrain-city", "terrain-city"],
    ["terrain-brush", "terrain-field", "terrain-field", "road-ns", "terrain-city", "terrain-city"],
]

# Preview id -> folder under tilesets/ (None: the default pixmaps).
SETS = {
    "default": None,
    "shimrod-spring": "shimrod-spring",
    "shimrod-summer": "shimrod-summer",
    "shimrod-autumn": "shimrod-autumn",
    "shimrod-winter": "shimrod-winter",
    "desert": "desert",
    "gefe-rik": "gefe-rik",
    "grays-map": "grays-map",
}

# `Tileset.aliases` in src/map/tilesets.ts: a file the set draws with another of its own.
ALIASES = {
    "grays-map": {"terrain-rapids.png": "terrain-water.png"},
}


def source(folder: str | None, name: str) -> pathlib.Path:
    """The file a set draws for pixmap `name`, as the renderer resolves it."""
    if folder is not None:
        alias = ALIASES.get(folder, {}).get(name)
        if alias is not None:
            return TILESETS / folder / alias
        own = TILESETS / folder / name
        if own.is_file():
            return own
    return PIXMAPS / name


def preview(folder: str | None) -> Image.Image:
    rows = len(SCENE)
    cols = len(SCENE[0])
    out = Image.new("RGB", (cols * ROOM, rows * ROOM))
    cache: dict[str, Image.Image] = {}
    for y, row in enumerate(SCENE):
        for x, key in enumerate(row):
            if key not in cache:
                with Image.open(source(folder, f"{key}.png")) as im:
                    cache[key] = im.convert("RGB").resize((ROOM, ROOM), Image.Resampling.LANCZOS)
            out.paste(cache[key], (x * ROOM, y * ROOM))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for pid, folder in SETS.items():
        if folder is not None and not (TILESETS / folder).is_dir():
            raise SystemExit(f"{TILESETS / folder}: no such tileset folder")
        path = OUT / f"{pid}.png"
        preview(folder).save(path, optimize=True)
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
