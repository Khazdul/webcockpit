# 0088 — Community tilesets: Gefe & Rik, Gray's Map

- Status: Accepted
- Date: 2026-10-08
- Amends: ADR 0082 (tileset catalogue, `TilesetOverlay`, the renderer's
  flow tint, the replay payload), ADR 0085 (`mapper.background`)
- Stage: `docs/stages/26-community-tilesets.md`

## Context

Owner request (2026-10-08): add two community tilesets for MMapper to
Options → Mapper → Tileset, after Desert:

- **Gefe & Rik** v0.1 (2025) by Octavia (octavia-mc), after Gefe and
  Rik's classic MUME maps:
  https://github.com/octavia-mc/gefe-rik-mmapper-tileset/releases/tag/v0.1
- **Gray's Map** v1.1 (2026) by Sunnyl75, a homage to the maps of Gray's
  Mapeditor: https://github.com/Sunnyl75/Gray-s-Map-Tileset/releases/tag/v1.1

Both are MIT licensed (© 2025 octavia-mc, © 2026 Sunnyl75), with no
AI clause and no NC/ND parts. Both are drawn for a white background (Gefe's
README: "Set your background to white"). Neither has flow marks
(`stream-in/out-*`), and Gray's Map has no `terrain-rapids`. Gefe mixes
128 px (roads, trails), 160 px (most) and one 200 px file
(`mob-questmob`); Gray's are all 128 px.

## Decision

### Files

- `public/map/tilesets/gefe-rik/` and `grays-map/`: the renderer's files
  (`RENDERER_PIXMAPS`) from each release, copied **unmodified**, as ADR
  0082. Left out: Gefe's `options/` folder, `update0.png` and
  `terrain-deathtrap.png`; Gray's `load-pony.png`, `mob-genericguild.png`
  and `terrain-deathtrap.png` (none is a renderer file).
- Everything a set lacks comes from MMapper's default set, the normal
  per-file fallback (owner). `lacks`, from the unit test:
  - Gefe & Rik (26): `char-arrows`, 23 load icons (all but `attention`
    and `water`), `mob-milkable`, `mob-rattlesnake`.
  - Gray's Map (37): `char-arrows`, `char-room-sel`, the four walls,
    `door-up/down`, the four up/down and climb exits, 16 load icons,
    `mob-elitemob`, `-milkable`, `-passivemob`, `-questmob`,
    `-rattlesnake`, `-smob`, `no-ride`, `terrain-indoors`, `terrain-road`.

### Our flow marks

- The flow marks of both sets are WebCockpit's own (owner, mockup rounds
  1–6): bare pixel-art "v" chevrons, no line, one per half room in the
  flow direction (two in a through-flow room, one in the first and last
  room of a run), 8 px strokes on a 4 px grid; up and down on the
  diagonals. Gefe & Rik 160² in cyan `#4cd8ff`; Gray's Map 128² in light
  sky blue `#c4dcff` (on Gray's `#bfbffd` water).
- `scripts/build-flow-chevrons.py` (Pillow, `python3 -I`, deterministic)
  writes the 12 files of each set into its folder. They are credited as
  WebCockpit's, under WebCockpit's licence, not the sets' MIT terms.
- **No dark rim.** Transparent texels keep the mark's RGB at alpha 0, so
  linear filtering and mipmaps blend the stroke edges towards the mark's
  colour, not towards black.

### Catalogue fields (`Tileset`, all optional, data only)

- `aliases`: a renderer file the set draws with another of its own
  files. Gray's Map: `terrain-rapids.png` → `terrain-water.png` (owner:
  rapids draw Gray's water). An aliased file is neither in the folder
  nor in `lacks`; `tilesetOverlay` carries `aliases` on the
  `TilesetOverlay` and `overlayPath` serves `<dir><alias>`, so only the
  set's existing file is fetched and no copy ships. Still nothing is
  probed: the lists decide. The unit test checks that an alias is a
  renderer file the set does not lack and that its target is in the
  folder.
- `background`: the background the set is drawn for, one of the named
  map backgrounds (`#ffffff` for both). `TilesetChoice.background`
  carries it to Options.
- `streamsAsIs`: the set's `stream-*` files are drawn as they are,
  without the river (`WATER`) tint MMapper applies to its white arrows.

### Renderer

- `TilesetOverlay.streamsAsIs` travels with the overlay (`{t:'assets'}`
  and `init`, additive; `MAP_PROTOCOL_VERSION` stays 1). The worker core
  turns the source into a `TileStyle` (`{streamsAsIs}`) and passes it to
  `createRenderer` (and so to a renderer rebuilt after a context restore)
  and to `Renderer.setAssets(assets, style)`. The WebGL renderer applies
  the style when the new tiles are swapped in, so the old set never draws
  with the new set's style. With `streamsAsIs` the streams draw with the
  layer colour itself; otherwise `WATER × colour`, exactly as before: the
  default set, Shimrod and Desert are unchanged.
- **Mixed sizes.** The existing sizing copes: each array takes its
  largest file (ADR 0082), so Gefe's 128² array becomes 200² (the
  questmob) and the 128² and 160² files are rescaled to it; the doors
  array is 160² and the trails 128² (as Shimrod's). WebGL2 needs no
  power of two (mip levels: `floor(log2(200)) + 1` = 8). Gray's main
  array stays 128², its trails 128², and its doors array 256² (the
  default up/down doors and room square it lacks set the size). Gefe's
  96-layer array at 200² is about 20 MB of texture with mipmaps, less
  than Shimrod's 34 MB.

### HTML replay

- The export embeds each pixmap through `overlayPath`, so an aliased
  file is embedded under the path it stands in for
  (`pixmaps/terrain-rapids.png` holds Gray's water) and the page needs no
  tileset logic. The untinted streams travel as `ReplayMap.streamsAsIs`
  (optional, written only when true); `replayMapHost` puts it on the
  inline `AssetSource` (`streamsAsIs`, additive), and the worker reads it
  as it reads an overlay's.

### Background switch and restore (Options → Mapper)

- `mapper.backgroundBefore` (additive, no version bump): the background
  the user had before choosing a set with a recommended background; `''`
  for none. Migration keeps it only when it is a named background
  (normalised), else `''`.
- `chooseTileset(mapper, next)` (pure, src/map/tilesets.ts) gives the new
  `tileset`, `background` and `backgroundBefore`:
  - **To a set with a background:** the background becomes the set's.
    The user's colour is remembered only if the set left had no
    background, so Gefe & Rik → Gray's Map keeps the dark colour
    remembered from before Gefe & Rik.
  - **To a set without one, from a set with one:** the remembered colour
    is restored only if the background still equals the set's
    recommended one (a colour the user picked by hand on the light set
    stays), and the memory is cleared either way.
  - **Between sets without one:** the background is untouched.
- The Tileset row's ←→ applies it; the Background colour row follows at
  once. The light background takes ADR 0085's dark-lines path (white
  connection lines draw `#262626`). Dark rooms keep the normal darkness
  tint on white (owner).
- Credit lines: `Tiles by Octavia, after Gefe & Rik's maps` and `Tiles by
  Sunnyl75, after Gray's Mapeditor`.

### Credits

- `public/map/README` and `THIRD_PARTY_NOTICES.md`: each set with its
  release URL, that the files are copied unmodified (which files were
  left out), the full MIT text (copyright line and permission notice),
  the original maps' credits (Gefe and Rik's maps, mume.kyrania.com, and
  Eolo; Gray's Mapeditor: Gray, later versions and ports by Morfizm,
  Dorien/White, Moonshade and Waba), and that the flow marks are
  WebCockpit's own.

## Consequences

- The deploy grows by about 0.40 MB (Gefe & Rik 53 kB, Gray's Map
  349 kB, of which our 24 flow marks are 11 kB), fetched only for the
  chosen set while the map is on.
- Adding a set stays data: a folder, a `TILESETS` entry (with the
  optional `aliases`, `background`, `streamsAsIs`), a `TILESET_CHOICES`
  row and the credits.
- Gefe's README also suggests magenta connections and lighter
  dark/no-sundeath tints; not done (the owner keeps the normal darkness
  tint; connection colours are not configurable).
