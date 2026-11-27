# 0171 — Map tokens in the renderer

Date: 2026-11-27. Status: accepted (stage 80 part B). Related: ADR 0020
(the map renderer and its worker), ADR 0057 (marks, the scene), ADR 0122
(the Group pane, its vital colours), ADR 0169 (looks), ADR 0170 (the token
library), `docs/stages/80-character-tokens.md` §7, the mockup
`notes/research/token-mockups/round2.html` (map section, ring R3).

## Context

Stage 80 draws you and the group members on the map as round tokens with
their look, a hue ring, the HP arc and a fan for several in one room,
where the map drew MMapper's coloured boxes. The map is WebGL2 in a
worker, drawn on demand; the cost rule (spec §1.3, intent Goal 1) allows
at most one more draw call and no allocation on an unchanged frame, and
with tokens off the map must be what it was.

## Decision

- **Who owns what.** The main thread owns the hues and the looks:
  `GameState.groupTable` (MMapper's `GroupTable`, `src/map/group.ts`) is
  fed every `Group.*` whether the map is shown or not, and cleared with the
  character. The Map pane's `TokenFeed` (`src/map/tokens-feed.ts`, loaded
  with the map client, only with `ctx.looks`: not in the log player nor
  the replay bundle) builds `tokenState` from it, the resolver (ADR 0169),
  `vitalPct` and `Char.Vitals`, and sends the new message
  `{t:'tokens', on, hp, self:{look, alt?, hp}, members:[{id, color, look,
  alt?, hp}], colors, lib?}` only when its JSON changed, at most once a
  frame and not while the pane is hidden. `alt` is the drawing a library
  or own picture falls back to; `lib` the library's URL prefix.
- **The worker** keeps the last message: every scene it gives the renderer
  gets the main thread's hue for each member id it knows (else the
  tracker's own, so a log player or replay without the message draws what
  it drew) and, with tokens on, the faces (`Scene.tokens`). A `debugScene`
  is decorated the same way (the e2e use it).
- **When tokens are drawn**: `scene.tokens`, not the far style (zoom >
  0.4), and `pxPerRoom(zoom, view.layer) >= 20`. Otherwise `buildScene`
  is the code from before, untouched: a golden test
  (`tests/unit/map-scene-golden.json`, written on the commit before) holds
  its geometry with tokens off, below 20 px and in the far style. An
  unlocated player keeps the far marker; the off-screen and layer arrows,
  the path and the away members' labels are made by the same calls as for
  the boxes (`drawPointers`, the room counts that stack the labels).
- **Layout** (`src/map/render/token-layout.ts`, the mockup's numbers): the
  token (picture, 1 px ring, 1 px outline, and with the arc on the arc's
  room) fills 0.8 room alone (the spec; the mockup had 0.84). The fan:
  the whole one fills 0.7 room at 37 % from the top, the others 0.38 room
  at 78 %, a step of at most 1.05 d, at most three, then `+n`. You lead
  your room when located there, else its first member; back to front
  `+n`, the small ones last to first, the whole one on top (the spec: on
  top; the mockup drew the small ones over it).
- **The draw**: one more instanced draw (`drawArraysInstanced`, a 4-vertex
  strip per token, 16 floats an instance) after the path and before the
  names. The shader works in device pixels from the projected centre (not
  snapped: a moving token glides); every edge is a coverage of the
  distance, ±0.5 px, so the 1 px ring and outline hold at every zoom and
  device scale. Layers, premultiplied, back to front: the disc (the
  mockup's gradient, the picture over it, cropped as the mockup crops a
  drawing ×1.2 and a library picture ×1.12), the outline, the ring, the
  arc's dark backdrop and the arc (from 12 o'clock, clockwise, butt ends).
- **The texture: a `TEXTURE_2D_ARRAY`** of 64 layers of 128 px, RGBA8,
  premultiplied, 8 mip levels, trilinear, made with the first token (so
  tokens off allocates nothing). Chosen over a 1024² atlas: a layer per
  picture cannot bleed into its neighbours at the small mips, and the
  tiles already use arrays. A picture takes a free layer or the least
  recently used one not in the scene being built; the mipmaps are made
  once per scene build that uploaded something. The `+n` glyphs are cells
  of the same array, drawn once per count on a 2D OffscreenCanvas in the
  worker (none at a disc under 9 px, as the mockup).
- **The pictures** (`src/map/worker/token-images.ts`): library tokens are
  fetched by the worker (`${BASE_URL}tokens/t/<id>.webp`, `'self'`) and
  decoded premultiplied; drawings are asked of the main thread
  (`tokenArt` → `tokenImage`), which bakes each (id, sex) once at 128 px
  with `portraitArt` (one at a time, after a `setTimeout`, never in the
  game path) and transfers an ImageBitmap; never a `data:` URL in the
  worker. Own images (part D) answer with bytes through `ownBytes`. A
  failed picture uses `alt`. The decoded sources (at most 96) stay in the
  worker, so a renderer built again after a lost context uploads them
  again without asking.
- **Nothing per frame**: the scene meshes and the token instances are
  rebuilt only when the scene, the font or the view changed, now compared
  field by field (the old key was a template string made every frame);
  `tokensDrawn` (`data-map-tokens`, tokens/+n/arcs, for the tests) is
  posted only when the counts change.
- **HP colours**: `vitalTone` (`src/gmcp/vital-tone.ts`: orange at 45 %
  and below, red at 25 % and below) is the Group bars' `vitalColor` and
  the arc's; `hpToneColors` gives Group's HP bar colour (the setting) and
  the signal colours, for the side of the map's background.
- **Switches**: `mapper.tokens` and `mapper.tokenHp` (part A) in Settings
  → Mapper, which is also the map pane's gear.

## Measurements

The draw count (`tests/unit/map-tokens.test.ts`, a wrapped WebGL2, the
rent room at zoom 1, you and eight members): boxes 44 draw calls, tokens
44 (the box draw goes, the token draw comes); an unchanged frame uploads
no buffer and no texture and draws the same 44.

The map bench (`node bench/browser-bench.ts --only budgets,map`, owner
geometry 1728 × 1000 at ratio 2, Firefox and Chromium on the GPU):

geometry 1728 × 1000 at ratio 2, Firefox 155 and Chromium 153 on the
GPU; `bench/results/tokens-80-before.md` and `-after.md`). Power: on mains
for every run (`cat /sys/class/power_supply/BAT*/status`: `Charging`
before, between and after), screen not locked. "Before" is HEAD
`0697db71` (part A done) with this bench and fixture copied in, where
`mapper.tokens` does nothing: both token-scene rows draw boxes there.

Token scene (`tests/fixtures/map-tokens.log` fed every 100 ms; text
frames; painted median / p95 / max ms, late frames):

| | Firefox off | Firefox on | Chromium off | Chromium on |
|---|---|---|---|---|
| before (boxes both) | 11.8 / 27.9 / 59.1, 19 late | 10.9 / 23.3 / 55.6, 11 late | 12.6 / 20.7 / 23.3, 0 | 12.9 / 21.2 / 24.1, 0 |
| after | 11.2 / 29.3 / 91.0, 20 late | 11.6 / 28.2 / 78.0, 18 late | 10.7 / 20.2 / 22.6, 0 | 9.3 / 17.2 / 18.0, 0 |

Firefox's late frames come with the token feed's Group traffic whether
tokens are drawn or not (19 of them before, with boxes); none is "ours"
(script longer than a frame). The existing benches, before → after (the
first "before" ran at load 5–10, the token runs at 1–3):

| | before | after |
|---|---|---|
| Firefox frame → paint, map on (median / p95 / max) | 11.2 / 19.2 / 29.8 | 10.2 / 19.0 / 29.0 |
| Firefox burst + GMCP, map on (lines/s; max frame) | 30 194; 263 | 30 272; 293 |
| Firefox map load (first complete frame, worker) | 513 ms | 486 ms |
| Chromium frame → paint, map on | 11.9 / 20.0 / 22.3 | 12.2 / 20.2 / 22.3 |
| Chromium burst + GMCP, map on | 74 132; 24.5 | 69 493; 44.1 |
| Chromium map load (worker; longest main task) | 503 ms; 11.9 | 517 ms; 11.3 |

Within the runs' noise (the same runs before the change vary as much:
Chromium's burst with the map on was 74 222 lines/s in the token run's
"before", Firefox's burst max frame 266).

## Consequences

- Part C takes the hues from `game.groupTable` (`colorOf`, `get`,
  `values`) and the bar colours from `vitalColor`/`vitalTone`, so the
  pane and the map agree; a member assignment changes the map's token
  through the looks store, which the feed follows.
- Part D answers `tokenArt` for an own image with its bytes.
- A token picture that changes needs a new id (the worker keeps decoded
  pictures by key for the page's life).
