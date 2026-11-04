# Research: MMapper 2D map rendering and the `.mm2` format

Date: 2026-09-28. Source: MMapper **26.06.0** (`/home/ole/build/mmapper/src/MMapper-26.06.0`,
cited as paths relative to its `src/`). This is the version the owner runs (Flatpak
`org.mume.MMapper v26.06.0`). 25.07.0 differs in places, noted where it matters.
Purpose: the spec input for a read-only MMapper-style map pane in WebCockpit.

Status markers: **[verified]** = checked in code and/or by parsing the owner's file;
**[uncertain]** = inferred, check before relying on it.

## 0. TL;DR

- `.mm2` = 8-byte header (magic `FFB2AF01`, BE u32 schema version) + qCompress blob
  (BE u32 uncompressed length + **zlib** stream, no zstd). The rest is QDataStream, big endian.
  The owner's `arda.mm2` is **schema 42** (current). 30 074 rooms, 674 infomarks. A
  TypeScript reader is ~100 lines. Node inflates it in 46 ms and parses it in 34 ms.
- A room is a 1×1 world unit at integer `(x, y, z)`. **+y = north**, drawn with north up.
  In the default 2D view, zoom 1.0 = **44 CSS px per room** on layer 0.
- A room is drawn as textured quads in this order: terrain (or road tile), multiply-tint for
  dark/no-sundeath, streams, trail, mob/load/no-ride overlays, up/down exit icons, doors,
  solid walls, dotted walls. After that come connections (world-space lines 0.045 rooms
  wide, with triangles), door names, infomarks, characters and the prespam path.
- Other z-layers are drawn with fixed dimming rules (§2.4). Layers above the current one
  are drawn untextured.
- Recommendation: **WebGL2 on an OffscreenCanvas in a dedicated worker**, using instanced
  quads and texture arrays. This mirrors MMapper's own batching. The main thread only posts
  small messages (§9).
- **Risk for the build stage:** only 4 912 of the 30 074 rooms in the owner's map have a
  server id (`server_id != 0`). Placing the player with GMCP `Room.Info.id` will fail for
  about 84 % of rooms (§6.3).

## 1. `.mm2` binary format

Reader: `mapstorage/mapstorage.cpp`. Everything is big endian (QDataStream default).
`stream.setVersion(Qt_4_8)` (`:418`) only affects QDateTime, which v42 does not contain.

### 1.1 Header and compression [verified]

| Offset | Type | Value in arda.mm2 | Notes |
|---|---|---|---|
| 0 | i32 BE | `FF B2 AF 01` | `MMAPPER_MAGIC` (`:31`) |
| 4 | u32 BE | `00 00 00 2A` = **42** | schema version (`:220`) |
| 8 | u32 BE | `01 BC D8 CE` = 29 153 486 | uncompressed length (qCompress header, `global/StorageUtils.h:21-36`, `StorageUtils.cpp:40-63`) |
| 12 | bytes | `78 9C …` | zlib (RFC 1950) stream to EOF, inflated with zlib (`zlib_inflate`) |

- Schema versions (`:36-53`): 17, 24 (ridable), 25 (zlib, **no** length prefix), 32 (16-bit
  door flags, infomark class and angle), 33 (16-bit exit flags, 32-bit mob/load flags,
  sundeath), 34 (qCompress), 35, 36 (new coordinate system), 38 (no inbound links), 39
  (upToDate removed), 40 (server id), 41 (death flag), **42 (area) = CURRENT**. Version 37 is
  not accepted. Only 42 needs support, plus a clear error for anything else.
- Browser: `new Response(blob.slice(12)).body.pipeThrough(new DecompressionStream('deflate'))`.
  The `'deflate'` format is zlib-wrapped, which is correct here. Check the result length
  against the header.
- Compression is qCompress-compatible: a 4-byte BE length, then zlib. There is no zstd
  anywhere in mapstorage.

### 1.2 Primitive encodings [verified]

- `u8/u16/u32/i32`: BE.
- `QString`: u32 BE **byte** length, then UTF-16BE. `0xFFFFFFFF` = null string. The owner's
  file has no nulls. Strings can be skipped by length without decoding, which is the fast
  path for desc/contents/note.
- `Coordinate`: 3 × i32 (x, y, z).
- Flag sets: bit *i* = enum ordinal *i* (`enums::bitmaskToFlags`).

### 1.3 Payload (after inflation), v42 branch

```
u32 roomsCount; u32 marksCount; Coordinate position   // last "selected" room pos; arda: (451,-84,0)
roomsCount × Room
marksCount × Infomark
```
(`:462-485`). The parse consumed exactly 29 153 486 bytes, with no trailer [verified].

**Room** (`loadRoom`, `:245-296`, v42 branches in bold):

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | **area** | QString | v≥42. 29 distinct values, mostly `""` |
| 2 | name | QString | |
| 3 | description | QString | skip |
| 4 | contents | QString | skip |
| 5 | id | u32 | "external room id", unique, sparse (0…122 271). Exits reference it |
| 6 | **serverId** | u32 | v≥40. `0` = INVALID_SERVER_ROOMID (`map/roomid.h:69`) |
| 7 | note | QString | |
| 8 | terrain | u8 | v≥41: plain enum (below) |
| 9 | light | u8 | 0 UNDEFINED, 1 DARK, 2 LIT |
| 10 | align | u8 | 0 UNDEF, 1 GOOD, 2 NEUTRAL, 3 EVIL |
| 11 | portable | u8 | 0 UNDEF, 1 PORTABLE, 2 NOT_PORTABLE |
| 12 | ridable | u8 | 0 UNDEF, 1 RIDABLE, 2 NOT_RIDABLE |
| 13 | sundeath | u8 | 0 UNDEF, 1 SUNDEATH, 2 NO_SUNDEATH |
| 14 | mobFlags | u32 | bits below |
| 15 | loadFlags | u32 | bits below |
| 16 | position | 3×i32 | used as is for v≥36 (no ESU→ENU flip) |
| 17 | exits | 7 × Exit | order N, S, E, W, U, D, UNKNOWN (`map/ExitDirection.h:13-22`) |

There is no upToDate byte for v≥39.

**Exit** (`loadExits`, `:298-338`): `u16 exitFlags; u16 doorFlags; QString doorName;` then
outgoing room ids as u32 until the terminator `0xFFFFFFFF`. For v≥38 there is **no**
inbound list. Incoming must be rebuilt: if `A.exit[d].out ∋ B`, then
`B.exit[opposite(d)].in ∋ A` (`map/World.cpp:563-580`). `opposite(UNKNOWN)` = UNKNOWN.

**Exit invariants applied after load** (`map/RawExit.cpp:17-90`). The renderer relies on
them:
- EXIT flag := `outgoing non-empty || (EXIT set && outgoing empty)`
- UNMAPPED := `EXIT && outgoing empty`
- DOOR := `EXIT && (DOOR || doorFlags ≠ 0 || doorName ≠ "")`. If there is no door, clear
  doorFlags and doorName.

In arda: 0 exits have outgoing rooms without EXIT, 109 have EXIT without outgoing, and those
109 all carry UNMAPPED already [verified].

**Infomark** (`loadMark`, `:494-553`, v42): `QString text; u8 type; u8 class; i32 angle;
Coordinate pos1; Coordinate pos2`. Positions are in **1/100 room** units
(`INFOMARK_SCALE = 100`, `map/infomark.h:19`), with z in plain layers. A non-TEXT mark has its
text cleared. A TEXT mark with empty text becomes "New Marker". No coordinate transform
applies for v≥36.

### 1.4 Enums (bit/ordinal = position in list)

- Terrain (`map/mmapper2room.h:44-58`): 0 UNDEFINED, 1 INDOORS, 2 CITY, 3 FIELD, 4 FOREST,
  5 HILLS, 6 MOUNTAINS, 7 SHALLOW, 8 WATER, 9 RAPIDS, 10 UNDERWATER, 11 ROAD, 12 BRUSH,
  13 TUNNEL, 14 CAVERN.
- Mob flags (`:133-151`): 0 RENT, 1 SHOP, 2 WEAPON_SHOP, 3 ARMOUR_SHOP, 4 FOOD_SHOP,
  5 PET_SHOP, 6 GUILD, 7 SCOUT_GUILD, 8 MAGE_GUILD, 9 CLERIC_GUILD, 10 WARRIOR_GUILD,
  11 RANGER_GUILD, 12 AGGRESSIVE_MOB, 13 QUEST_MOB, 14 PASSIVE_MOB, 15 ELITE_MOB,
  16 SUPER_MOB, 17 MILKABLE, 18 RATTLESNAKE.
- Load flags (`:170-194`): 0 TREASURE, 1 ARMOUR, 2 WEAPON, 3 WATER, 4 FOOD, 5 HERB, 6 KEY,
  7 MULE, 8 HORSE, 9 PACK_HORSE, 10 TRAINED_HORSE, 11 ROHIRRIM, 12 WARG, 13 BOAT,
  14 ATTENTION, 15 TOWER, 16 CLOCK, 17 MAIL, 18 STABLE, 19 WHITE_WORD, 20 DARK_WORD,
  21 EQUIPMENT, 22 COACH, 23 FERRY, 24 DEATHTRAP.
- Exit flags (`map/ExitFlags.h:12-24`): 0 EXIT, 1 DOOR, 2 ROAD, 3 CLIMB, 4 RANDOM,
  5 SPECIAL, 6 NO_MATCH, 7 FLOW, 8 NO_FLEE, 9 DAMAGE, 10 FALL, 11 GUARDED, 12 UNMAPPED.
- Door flags (`map/DoorFlags.h:12-22`): 0 HIDDEN, 1 NEED_KEY, 2 NO_BLOCK, 3 NO_BREAK,
  4 NO_PICK, 5 DELAYED, 6 CALLABLE, 7 KNOCKABLE, 8 MAGIC, 9 ACTION, 10 NO_BASH.
- Infomark type (`map/infomark.h:38`): 0 TEXT, 1 LINE, 2 ARROW. Class (`:50-59`): 0 GENERIC,
  1 HERB, 2 RIVER, 3 PLACE, 4 MOB, 5 COMMENT, 6 ROAD, 7 OBJECT, 8 ACTION, 9 LOCALITY.

### 1.5 Sanity parse of `~/Downloads/arda.mm2` [verified]

Throwaway scripts (`mm2.py`, `mm2.mjs`) live in the session scratchpad, not in the repo.

- Rooms 30 074, infomarks 674 (614 TEXT, 17 LINE, 43 ARROW; every angle is 0).
- Bounds: x −28…611, y −261…12, **z −1…2** (z histogram: −1: 185, 0: 29 826, 1: 61, 2: 2).
- No coordinate collisions. No dangling exit targets. 176 exits have more than one target.
  7 640 outgoing links go to a non-adjacent room, so they need a connection line. 15
  UNKNOWN-direction exits.
- Terrain counts: FIELD 8 879, FOREST 4 638, INDOORS 2 850, HILLS 2 558, TUNNEL 2 009,
  CAVERN 1 908, WATER 1 631, ROAD 1 517, MOUNTAINS 1 316, CITY 1 061, BRUSH 814, SHALLOW 698,
  UNDERWATER 165, RAPIDS 29, UNDEFINED 1.
- Light: DARK 7 737, LIT 13 642, undefined 8 695. Rooms with road exits: 4 028.
- Instance-count estimates: 43 641 wall edges, 5 686 doors, 4 810 up/down exits, about 7 600
  mob/load overlays.
- A north exit leads to Δ(0,+1) in 19 058 cases, which confirms **+y = north**.
- `serverId == 0` for **25 162** rooms. There are no duplicate non-zero server ids.
- Timing (Node 26): inflate 46 ms, parse 34 ms, decoding names only.

## 2. Coordinates, projection, layers, zoom

### 2.1 World units [verified]
Room `(x,y,z)` covers world `[x,x+1] × [y,y+1]` on plane `z`. The room quad shader offsets
the corner by (0/1, 0/1) (`resources/shaders/legacy/room/tex/acolor/vert.glsl`). Textures are
loaded with `QImage::mirrored()` (`display/Textures.cpp:140,588`) into a y-up GL space. As a
result, **the PNG is drawn upright with its top edge on the north side.** In a y-down canvas:

```
s(z)    = pixels per room on layer z (see 2.2)
screenX = W/2 + (wx − scrollX)·s(z)
screenY = H/2 − (wy − scrollY)·s(z)
room rect: left = W/2 + (x − sx)·s, top = H/2 − (y + 1 − sy)·s, width = height = s
```

### 2.2 Default 2D projection [verified]
The owner's config has `canvas.advanced.use3D=false` and `autoTilt=false`. A fresh config also
defaults to use3D false (`configuration/configuration.cpp:660`). The 2D path is
`ProjectionUtils::calculateViewProjOld` (`display/ProjectionUtils.cpp:107-125`):

- The perspective frustum is `[-0.5,0.5]²` at near=5, the camera is fixed at world z = 60/7,
  and world z is scaled by `ROOM_Z_SCALE = 7`. `BASESIZE = 528` (`display/ProjectionUtils.h:23-24`).
- Derived: **`s(z) = 2640 · zoom / (60 − 7z)`** logical px per room. On layer 0 at zoom 1 this
  is 44 px. On z=+1 it is 49.8 px, on z=−1 39.4 px, on z=2 57.4 px.
- The camera **ignores the current layer**, so off-zero layers are slightly larger or smaller
  and scale about the view center. Replicating this is cheap. An orthographic "same size on
  every layer" view would not be identical.
- The 3D mode (`calculateViewProj`, `:26-105`) is not needed: no tilt, and no 3D per the
  owner.

### 2.3 Zoom and pan [verified]
- `ScaleFactor` (`display/MapCanvasData.h:44-90`): default **1.0**, clamp **0.04…5.0**
  (1.76…220 px/room), step **×1.175** per notch.
- Wheel (`display/mapcanvas.cpp:216-253`): `factor = 1.175^(angleDelta.y/120)`, applied with
  `zoomAt`. That function keeps the world point under the cursor fixed on the current-layer
  plane (`:1050-1088`). **Ctrl+wheel** changes the layer: delta >100 moves down, < −100
  moves up.
- Pan: left-drag in the default MOVE mode (`:503`, `:727-741`). The grabbed world point
  follows the cursor (`scroll = startScroll − (worldNow − worldStart)`).
- Mouse Forward/Back buttons: layer up/down (`:458-464`). Zoom-in, zoom-out and reset
  actions set 1.0 (`:1119-1144`).
- Detail cutoffs (`configuration/configuration.h:179-183`): connections and door names need
  zoom ≥ **0.15**. Door names need ≥ **0.4**. Infomarks need ≥ **0.25**. Characters switch
  to "far" (outline) style at zoom ≤ **0.4**.

### 2.4 Layers [verified]
- Meshes are built per z-layer and held in a `std::map`, so layers are drawn **ascending**
  (`display/MapBatches.h:62`, `display/mapcanvas_gl.cpp:988-996`).
- Just before the current layer is drawn: clear depth, then a **full-screen quad in the
  background color at α 0.5** (`:979-994`). This fades everything drawn below. The fade is
  skipped if the current layer has no rooms.
- Per-layer tint color: `≤ current` → white α 0.90; `> current` → gray70 `#B3B3B3` α 0.20
  (`display/MapCanvasRoomDrawer.cpp:1025-1026`).
- **Layers above the current one** (`drawUpperLayersTextured=false`, the default): no
  terrain texture. A white α 0.20 quad is drawn per room instead. The dark and no-sundeath
  tints still apply, but streams, trails and overlays are skipped. Walls, doors and up/down
  icons are still drawn with the gray70 α 0.2 color (`:1012-1072`).
- Any layer other than the current one gets a final per-room overlay (`:1074-1084`). The
  color is black α `0.5 + 0.03·|Δz|` below, and black α `0.1 + 0.03·|Δz|` above (black
  because textures are disabled there).
- Connections on other layers: gray70 α 0.1 (`display/Connections.cpp:630-648`). Door names
  and infomarks appear on the current layer only.
- The current layer changes to the player's z on every move (`display/mapcanvas.cpp:1146-1158`).

### 2.5 Centering [verified]
On every position change: `setCurrentLayer(pos.z)` and `scroll = (x + 0.5, y + 0.5)`. This is
a hard recenter with no animation (`display/mapcanvas.cpp:1146-1158`). On map load,
`onMovement()` runs with the stored position.

## 3. Room drawing

### 3.1 Per-room visit (`display/MapCanvasRoomDrawer.cpp:233-399`)
1. **Terrain.** If terrain == ROAD, use `road-<idx>.png`. Otherwise use
   `terrain-<name>.png`. `idx` comes from the NESW exits that have the ROAD flag
   (`display/RoadIndex.cpp`). Suffix letters are in order n, e, s, w: `none`, `n`, `e`, `s`,
   `w`, `ne`, `ns`, `nw`, `es`, `ew`, `sw`, `nes`, `new`, `nsw`, `esw`, `all`
   (`display/Filenames.cpp:26-62`). **`terrain-road.png` is never drawn.**
2. **Trail.** Only when terrain ≠ ROAD and at least one exit has ROAD: `trail-<idx>.png`
   (`:154-168`).
3. **Tint.** DARK light → `ROOM_DARK #A19494`. Else NO_SUNDEATH → `ROOM_NO_SUNDEATH #D4C7C7`.
   Applied as a **multiply**: `glBlendFuncSeparate(ZERO, SRC_COLOR, …)`
   (`opengl/legacy/Binders.cpp:24-26`). In Canvas2D this is `globalCompositeOperation =
   'multiply'`. It affects terrain only, because trails and overlays are drawn after it.
4. **Overlays.** One per set mob flag (`mob-<name>.png`), then one per set load flag
   (`load-<name>.png`), then `no-ride.png` if ridable == NOT_RIDABLE. `load-deathtrap.png` is
   fully opaque and hides the room.
5. **NESW edges.** For each direction (`:295-351`):
   - If `showUnmappedExits` (default **true**, owner true) and the exit is UNMAPPED: dotted
     line, `#FF7F00` (darkOrange1).
   - Else: a dotted colored line from the first matching flag, in this order:
     NO_FLEE `#7B3F00`, RANDOM `#FF0000`, FALL or DAMAGE `#00FFFF`, SPECIAL `#CC19CC`,
     CLIMB `#B3B3B3`, GUARDED `#FFFF00`, NO_MATCH `#0000FF`. Also a stream-out icon if FLOW.
   - No EXIT, or DOOR: a **solid wall**, `#000000`. (If there is no EXIT but there are
     outgoing rooms, it is a red20 `#330000` dotted "bug" line, which cannot happen after the
     invariants.)
   - DOOR: an additional door icon `door-<dir>.png`, `#000000`.
   - If there are incoming links and any source exit into this room has FLOW: a
     `stream-in-<dir>.png`.
6. **Up/down** (`:354-398`). UNMAPPED is shown as a dotted `#FF7F00` icon. For a normal
   EXIT: `exit-up.png`/`exit-down.png` in `#FFFFFF`. With CLIMB it uses
   `exit-climb-up/down.png` in `#808080`. Other special flags use the dotted color list
   above, for example NO_FLEE. A door on an up/down exit adds `door-up/down.png` in black.
   FLOW adds a stream out, and there is also a stream in.

All wall, door and exit icons are gray+alpha white PNGs. The shader computes
`vertexColor × layerColor × texel` (`room/tex/acolor/frag.glsl`), so they are tinted.

### 3.2 Draw order within a layer (`LayerMeshes::render`, `:1007-1085`)
terrain (α 0.9 layer color) → tints (multiply) → streams in/out (`#4CD8FF` × layer color) →
trails → overlays → up/down exits → doors → solid walls → dotted walls → other-layer dim quad.
After that, per layer: connections, then door names (`display/mapcanvas_gl.cpp:948-977`).
Then over the whole map: infomarks (current layer), selections, characters and paths
(`:542-546`).

Terrain is drawn at α 0.9 over the background `#2E3436` (`configuration.cpp:628`), so 10 %
of the background shows through.

### 3.3 Dotted walls [verified]
These are generated in code, not loaded from a PNG (`display/Textures.cpp:290-368`). There
are 8 manual mip levels, 128→1 px. At 128/64 px the image is a 4-px-thick edge band with the
pattern `##..` (2 px on, 2 px off, so 32 dashes per edge). At 32 px it is 2 px thick, at
16 px 1 px. At 8 px it is 2 single pixels; at 4 and 2 px, half- or quarter-alpha pixels. The
band is rotated for E/W and mirrored for N/W. Filtering is NEAREST_MIPMAP_NEAREST at build
time, then set to trilinear (below). Solid `wall-*.png` is a 4/128 px band (1/32 room) on the
edge.

### 3.4 Sampling [verified]
File textures get full mip chains and **LINEAR_MIPMAP_LINEAR** min / LINEAR mag
(trilinear filtering defaults on, and the owner has it on), with MirroredRepeat wrap
(`Textures.cpp:137-153, 274-288, 760-768`). Files are grouped into 2D texture arrays by
size: "terrain+road" 128, "load+mob+no_ride" 128, "exits" 128, trails 64, doors, walls,
streams and so on (`:614-649`). An image that does not match its group size is resized
(`:590-601`). In WebGL2, `TEXTURE_2D_ARRAY` + `generateMipmap` + `LINEAR_MIPMAP_LINEAR`
reproduces this. In Canvas2D, set `imageSmoothingQuality='high'`. It only approximates
trilinear.

### 3.5 Tileset (`src/resources/pixmaps`, 126 files, all bundled in `resources/mmapper2.qrc`)
There is **one** tileset. No alternate or classic pixmap set ships in 26.06. The build
downloads `github.com/MUME/images` (tag v26.04.0), but that contains only area art (`areas/*.jpg`
and mp3), not tiles (`external/images/CMakeLists.txt`). Files can be overridden at runtime
from `canvas.resourcesDir/pixmaps/` (`display/Filenames.cpp:137-159`). The owner's directory
does not exist, so the owner sees the defaults.

| Files | Size | PNG color type | Used for |
|---|---|---|---|
| `terrain-{undefined,indoors,city,field,forest,hills,mountains,shallow,water,rapids,underwater,road,brush,tunnel,cavern}.png` | 128² | RGB (opaque) | terrain (road unused) |
| `road-{none,n,e,s,w,ne,ns,nw,es,ew,sw,nes,new,nsw,esw,all}.png` | 128² | RGB | ROAD terrain |
| `trail-{…same 16…}.png` | 64² | RGBA | trail overlay |
| `mob-{rent,shop,weaponshop,armourshop,foodshop,petshop,guild,scoutguild,mageguild,clericguild,warriorguild,rangerguild,aggmob,questmob,passivemob,elitemob,smob,milkable,rattlesnake}.png` | 128² | RGBA | mob-flag overlays (`parser/AbstractParser-Commands.cpp:176-194`) |
| `load-{treasure,armour,weapon,water,food,herb,key,mule,horse,pack,trained,rohirrim,warg,boat,attention,watch,clock,mail,stable,whiteword,darkword,equipment,coach,ferry,deathtrap}.png` | 128² | RGBA/GA (deathtrap RGB) | load-flag overlays (`:208-232`; TOWER→`watch`, PACK_HORSE→`pack`, TRAINED_HORSE→`trained`) |
| `no-ride.png` | 128² | RGBA | NOT_RIDABLE (small red ✕, upper right) |
| `wall-{north,south,east,west}.png` | 128² | GA | solid walls |
| `door-{north,south,east,west,up,down}.png` | 256² | GA | doors |
| `exit-{up,down,climb-up,climb-down}.png` | 128² | GA | up/down exits (circle+dot = up, top-right; circle+✕ = down, bottom-left) |
| `stream-{in,out}-{north,south,east,west,up,down}.png` | 128² | GA | FLOW (tinted `#4CD8FF`) |
| `char-room-sel.png` | 256² | GA | the player's/group member's room square |
| `char-arrows.png` | 256² | GA | 2×2 atlas of off-screen arrows |
| `room-highlight.png` | 256² | GA | small dot, top-left (missing-server-id / unsaved markers; **owner has these off**) |
| `room-sel*.png` (4) | 256² | RGBA | editor selection (not needed) |
| `mellon.png` | 313×309 | RGB | not used on the map |

## 4. Connections (`display/Connections.cpp`, `display/ConnectionLineBuilder.cpp`)

The code is geometric and short. **Port it verbatim** (`:232-618`, `ConnectionLineBuilder.cpp:11-176`).

- Only drawn at zoom ≥ 0.15. They are built per layer: a connection is added to layer L if
  either end is on L (`:374-376`).
- Two-way means `target.exit[opposite(dir)].out ∋ source` and `source.exit[dir].in ∋ target`.
  A two-way connection is drawn once (smaller id, or both layers if z differs) (`:265-290`).
- **Adjacent two-way in matching directions** (Δ=(0,±1,0) N/S or (±1,0,0) E/W): **nothing**
  is drawn. Adjacency shows only through the missing wall (`:380-403`).
- Everything else is a polyline plus triangles, in world units relative to the source room
  corner (dX, dY = target − source):
  - Start stubs: N (0.75,0.9)→(0.75,1.1); S (0.25,0.1)→(0.25,−0.1); E (0.9,0.75)→(1.1,0.75);
    W (0.1,0.25)→(−0.1,0.25). UP not adjacent: (0.63,0.75),(0.55,0.75). DOWN: (0.37,0.25),(0.45,0.25).
    UNKNOWN: (0.5,0.5),(0.75,0.25).
  - Two-way end: the mirror of the start stub at the target (for example a S end is
    (dX+0.25,dY−0.1)→(dX+0.25,dY+0.1)). Triangles at **both** ends, except for U/D
    (`:490-570`).
  - One-way end: on the *other* lane (0.25↔0.75), so a one-way and a two-way connection never
    overlap. There is a single arrow triangle at the target only (`:572-611`). For U/D/UNKNOWN
    targets it is the small triangle (0.5,0.5),(0.55,0.3),(0.7,0.45) (`:613-618`).
- Line = quads **0.045 room wide** (`:33`). The first and last segments are extended by half
  a width. A segment that changes z gets **α 0.1**. A segment ≥ 3 rooms long is split:
  1.5 rooms solid at each end and a **α 0.1** middle (`:777-881`). That is why long
  connections look like "stubs with a faint line".
- Color: `connectionNormalColor` **#FFFFFF**. If either side lacks the EXIT flag, it is
  **#FF0000** (`:405-413`). The red batch draws after the normal one.
- "White lines with circle endpoints" in the screenshot are most likely up/down links. Their
  stubs start at the edge of the `exit-up` circle (centre 0.75,0.75, r≈0.14) or the
  `exit-down` circle (0.25,0.25). There are no circle primitives in the connection code
  [uncertain; confirm against the screenshot].
- 25.07 drew these lines as 2-px screen-space GL lines. 26.06 uses world-space quads, so the
  lines thicken with zoom.

**Door names** (`:139-230`) are drawn only for **hidden** doors that have a name, at zoom ≥ 0.4
(`drawDoorNames` default true), on the current layer. The text is the name, plus ` [L/NPd]`
when NEED_KEY, NO_PICK or DELAYED are set. It is placed at (x+0.6, y+off), where off is
N 0.85 / S 0.35 / W 0.7 / E 0.55 / U 1.05 / D 0.2. If both sides are hidden and adjacent, the
label is merged ("a/b") at midpoint + (0.6, 0.7). The text is white, centered, on black
α 0.4 at fixed pixel size.

## 5. Infomarks (`display/Infomarks.cpp`)

- Only the current layer (`pos1.z`), zoom ≥ 0.25 (`:384-396`). Built once and cached until
  the marks change.
- World position = `pos/100`. Color by class (`:42-70`): HERB `#00FF00`, RIVER `#4CD8FF`,
  MOB `#FF0000`, COMMENT `#C0C0C0`, ROAD `#8C533A`, OBJECT `#FFFF00`.
  GENERIC/PLACE/ACTION/LOCALITY use the default, which is **black for TEXT** and **white for
  LINE/ARROW**. All get **α 0.55** (`:254`).
- TEXT: fixed-pixel-size text (it does **not** scale with zoom) anchored at `pos1`. The
  anchor is the left end of the **baseline** (`opengl/Font.cpp:419-421`) and the text grows
  up and to the right. The background box is the glyph bounds + 2 px horizontal / 1 px
  vertical margin, filled with the class color α 0.55. Text color = `textColor(bg)`, which is
  white if perceived brightness is < 50 %, else black (`global/Color.cpp:212-228`). So:
  generic → white on translucent black; herb, object, comment and river → black text; mob and
  road → white. ACTION is italic (shear x += y/6). LOCALITY is underlined. `angle` rotates the
  glyph offsets in screen space, CCW in y-up (arda: always 0).
- LINE: a quad 0.045 rooms wide from pos1 to pos2.
- ARROW: a shaft from pos1 to (pos2.x − 0.2, pos2.y), plus the triangle
  (dx−0.2, dy±0.07)→(dx, dy). **The head always points +x**, whatever the arrow direction.
  This is a quirk to replicate (`:280-287`).
- Font (all map text): the bitmap BMFont **Cantarell 18 px** (`Cantarell18.fnt` + `_0.png`;
  27/36 for DPR >1.25/>1.75), line height 18, base 15 (`opengl/Font.cpp:709-740`,
  `resources/fonts/`). Text is drawn without depth, with pixel snapping.
  [uncertain] Cantarell's license (SIL OFL upstream) is not in MMapper's fonts/LICENSE.
  Verify it before bundling the .fnt/.png, or load Cantarell as a web font instead.

## 6. Player position and the prespam path

### 6.1 Current room (`display/Characters.cpp:460-497, 52-104, 229-298`)
- Your color: `groupManager.color` default and owner value **#FFFF00**
  (`configuration.cpp:755`).
- Zoom > 0.4: `char-room-sel.png` tinted with the color covers the room quad. The corners are
  white, the edges gray (alpha bbox 21…235 of 256). This is the "yellow square".
- Zoom ≤ 0.4 ("far"): a square outline with 2-px lines at α 0.9, a fill at α 0.1, and a
  "beacon" at α 0.1. The beacon is a 3D column 50 units high and makes little sense in a
  top-down view, so skip it [uncertain how it looks in 2D].
- Off-screen (room not within a 12-px margin): a screen-space arrow from `char-arrows.png`,
  48×48 px (±24 px). The filled variant is the PNG's top-right quadrant, the outline variant
  the bottom-left. It is placed on the 24-px margin along the line from view center to
  target and rotated to point at it; the PNG arrow points right at 0° (`:367-394`,
  `display/MapCanvasData.cpp:295-342`).
- On a different layer than the one viewed: an up or down arrow (a world-space quad
  a(−0.5,0), b(0.75,−0.5), c(0.25,0), d(0.75,0.5), rotated 90°/270°) at the room center.

### 6.2 Prespammed path (`Characters.cpp:113-147, 356-365`; `mapdata/mapdata.cpp:75-123`)
- Drawn as quads **0.1 room wide** in the player color, from the current room center through
  each predicted room center. There is an **8-px** point (square GL point) at the end. It is
  drawn without depth, over everything.
- Queue input (`parser/AbstractParser-Commands.cpp:428-460`, `parser/abstractparser.cpp:722-730`):
  each typed `n/s/e/w/u/d` (full or abbreviated) is enqueued immediately when sent, and so is
  a bare `look`/`l`.
- Queue removal:
  - one entry per room-arrival event (`parser/mumexmlparser.cpp:559-567`). If the dequeued
    command ≠ the actual move, the **whole queue is cleared**;
  - failure messages pop the head (`parser/AbstractParser-Actions.cpp:66-95`): "Alas, you
    cannot go that way...", "…seems to be closed.", "You need to swim to go there.",
    "You are too exhausted.", and others;
  - "You are dead!" clears it.
- Path walk (`mapdata.cpp:75-107`): LOOK is skipped. A non-direction stops the walk. An exit
  without EXIT is **skipped** (continue). An exit whose target count ≠ 1 stops the walk.

### 6.3 Finding the player's room (for WebCockpit)
MMapper uses its path machine. With GMCP, `Room.Info.id` equals the room's `serverId`. The
owner's map has a server id for only **4 912 / 30 074** rooms. Use id matching where it exists.
Elsewhere the build stage needs a fallback: match on name, description and exits, or start
from the last known room and follow the move direction. This is a scope decision to raise
with the owner or in the spec.

## 7. Group members (`display/Characters.cpp:499-547`, `group/`)

- Source: GMCP `Group.Set/Add/Update`. The fields read are `mapid` (int → ServerRoomId),
  `name`, `label`, `type` and `room` (the room name, not used for drawing)
  (`group/CGroupChar.cpp:56-176`). Your own room comes from `Room.Info.id`
  (`group/mmapper2group.cpp:137-161`).
- A member is drawn **only if `mapid` matches a room's serverId**. It is skipped for
  "unknown" rooms and for yourself.
- [resolved 2026-11-04] MUME sends `mapid` and `room` on every member. Player members stay
  in the set when they are elsewhere, so they do show on other rooms; NPC members are only
  reported in your room (`notes/research/gmcp-group.md`, ADR 0120).
- Colors: member colors come from a golden-angle generator (`group/ColorGenerator.cpp`):
  HSL(hue, 255, 127) with hue starting at the hue of your color (yellow = 60), then
  +137.508° per new member (198°, 335°, 113°, …). Released hues are reused first. NPCs can be
  forced to `npcColor` (default `#C0C0C0`) when the override is on (default off).
- Several characters in one room: your room is reserved first, so group members in your room
  draw **rotated by n × 14.32°** (`45/π`) and unfilled. You draw last, axis-aligned
  (`:229-263`, `:475-481`).
- Name labels: for members not in your room, at fixed pixel size, centered, with the
  baseline half a room plus 2 px above the room center. Background is the member color at
  α 0.6, text is `textColor(color)`. Labels in the same room stack by font height. Off-screen
  members get the edge arrow (outline or filled) and a label at the proxy point
  (`:396-458`).

## 8. Interaction summary (read-only clone)
- Left-drag pans. The wheel zooms around the cursor (×1.175 per 120 units). Ctrl+wheel
  changes the layer. Zoom range 0.04…5.
- Each move recenters on the player (hard snap) and sets the layer to the player's z.
- Nothing else is needed (editing, selection and connection modes are editor features).

## 9. Rendering tech for the browser

**MMapper's strategy** (`display/MapCanvasRoomDrawer.cpp:870-1152`, `display/mapcanvas_gl.cpp:418-470`):
- The whole map is meshed **asynchronously on a background thread** (`std::async`), per
  layer, whenever the map changes. The meshes are uploaded once as static VBOs.
- Each frame redraws every layer from those VBOs and changes only the view matrix.
- Every room element is an instanced unit quad `ivec4(x, y, z, texLayer | colorId<<8)`, grouped
  by texture array. There are roughly a dozen draw calls per layer.
- Frames are rendered **on demand** (`FrameManager`, max 60 fps). No continuous loop runs.

**Recommendation: WebGL2 in a dedicated worker via `OffscreenCanvas`.**
- The worker owns the fetch (or File) → `DecompressionStream('deflate')` → parse → mesh
  build → WebGL2 render. The main thread only does
  `canvas.transferControlToOffscreen()` and posts small messages: resize/DPR, pointer and
  wheel deltas, current room, prespam queue and group positions. The worker never blocks
  input or text rendering. Parsing (≈80 ms total in Node) happens off the main thread.
- Mirror MMapper's pipeline: `TEXTURE_2D_ARRAY`s (a 128 group for terrain, road, mob, load,
  no-ride, walls, exits and streams, trails upscaled or their own 64 array, a 256 group for
  doors, char-room-sel and arrows) with `generateMipmap` and trilinear filtering. A per-layer
  static instance buffer holds `x, y, z, layer, colorId`. The named-color palette goes in a
  uniform array. Draws per layer follow the §3.2 order. The multiply tint is
  `blendFuncSeparate(ZERO, SRC_COLOR, ZERO, ONE)`.
- Scale: ≈30 k terrain + ≈45 k walls + ≈20 k other quads + ≈8 k connection segments. That is
  trivial for the GPU, even with the whole map visible at zoom 0.04.
- Render only when something changes (view, position, prespam, group). Use the worker's
  `requestAnimationFrame` to coalesce. [uncertain] Worker rAF is in Chrome and Firefox; use a
  `setTimeout` fallback. OffscreenCanvas WebGL needs Safari ≥ 17.
- Text (door names, infomarks, group names): draw MMapper's Cantarell BMFont atlas as
  textured quads in the same WebGL context. The look is identical and no font loading is
  needed in the worker. The alternative is an `OffscreenCanvas` 2D glyph cache.
- Canvas2D is a fallback only. It would need per-zoom cached chunk bitmaps (for example
  32×32-room tiles) to stay fast at far zoom. At zoom 0.04, about 100 k `drawImage` calls per
  frame is too slow, and exact mipmap and blend parity is harder.
- Keep the parsed map compact: typed arrays for coordinates, flags and exits, and names only
  if a room-info feature needs them. Descriptions and contents are skipped by length.

## 10. Owner's MMapper settings (Flatpak config, for reference)
`~/.var/app/org.mume.MMapper/config/MUME/MMapper2.conf` [verified]:

- background `#2e3436`, connection `#ffffff`, dark `#a19494`, dark-lit `#d4c7c7`
- `Draw door names=true`, `Draw not mapped exits=true`, `Draw upper layers textured=false`
- `Show missing map id=false`, `Show unsaved changes=false`, `Use trilinear filtering=true`
- `use3D=false`, `autoTilt=false`, 0 AA samples, group color `#ffff00`, npc override off

These match MMapper's defaults except the two "show" flags. The defaults read from an empty
config are **true** (`configuration.cpp:650-651`) and would draw a yellow dot on every room
without a server id. The clone should follow the owner (off).
