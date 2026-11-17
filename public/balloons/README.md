# Balloon skins (raster)

The balloon notices (stage 69, ADR 0159) draw the SVG goblin unless a raster
skin's files are here. The client uses `goblin/` as soon as it holds the three
required files (`balloon.webp`, `basket-front.webp`,
`passenger-calibrating.webp`); which files exist is read at build time, so add
them and rebuild. Code: `src/weather/balloons/image-skin.ts`.

## Files: `public/balloons/<skin>/`, all transparent WebP

| File | Size | What |
| --- | --- | --- |
| `balloon.webp` | 1024 × 1536 | Envelope, ropes and the whole empty basket. The basket's rim spans about x 330–694 at y ≈ 1210; its bottom is at y ≈ 1480. |
| `basket-front.webp` | 1024 × 1536 | The same canvas, only the basket's front wall (drawn over the passenger). |
| `passenger-<mood>.webp` | 1024 × 1024 | One per mood: `poor`, `meh`, `calibrating`, `good`, `great`, `superb`, `pvp`. Chest-up, head centre at (512, 400), head about 380 px wide, the body cut straight at the bottom edge. |
| `passenger-<mood>-blink.webp` | 1024 × 1024 | Optional: the `blink` action for that mood. |
| `passenger-wave.webp` | 1024 × 1024 | Optional: the `wave` action. |

- The passenger is placed on the balloon canvas at 50 % (512 × 512) with its
  top left at (256, 900): its lower half is behind `basket-front.webp`.
- A missing mood shows `calibrating`.
- Shown 150 CSS px wide, so the files are about 3× the screen's pixels.
- The sign (the kill, the XP, the rating) is HTML under the basket's bottom,
  never part of an image.
