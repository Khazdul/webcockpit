# Portrait style guide

The style lead's rules for the Character card portraits (brief.md step 2).
The reference drawings are the dwarves, `stage/draw/dwarves.ts`; the
shared parts are `stage/parts.ts`. Build on both: import them, do not
copy them. Sheets: `sheets/dwarves.png` (every column) and
`sheets/dwarves-medium.png` (Medium at 3×).

The look is the balloon dwarf's tinted engraving
(`src/weather/balloons/passengers/dwarf.ts`, `head0`): a flat tinted
fill, an ink outline that wobbles, hatching for shadow, light strands for
sheen, paper grain over all of it, and eyes that are alive.

## 1. The frame and the head units

Draw every head in **head units**, the balloon dwarf's own system.
`svg()` in parts.ts places it with `FRAME` and thickens it with `LINE`.

| Head units | Meaning |
|---|---|
| y = 0 | the eye line; the eyes at x = ±21 (`eye()`) |
| y ≈ -10.5 | the brows (`brow()`) |
| y ≈ -24 | the top of the face (brow band of a helm, the hairline) |
| y ≈ -74 … -80 | the crown of a helm (a tall helm or hat may reach -104) |
| y ≈ 33 | the end of the nose |
| y ≈ 35–41 | the mouth: never lower than 41 |
| y ≈ 45–47 | a beardless chin: never lower than 47 |
| y ≈ 50–60 | the neck ends, the shoulders begin at the sides |
| x = ±44…±47 | the face at the cheeks (a Broadbeam ±55); the women ±42…±44 |
| x = ±56 | a helm's brim |
| x = ±100…±125 | the shoulders' edge (they leave the circle; that is fine) |

`FRAME` (the 200 square: `translate(100,ey) scale(s)`):

- **Large**: s = .9, ey = 94. The eye line lands at y = 94, the helm crown
  at ≈ 27, the mouth at ≈ 126–131, a beardless chin at ≈ 136. The level ring
  covers a circle of radius 32 at (100, 168) at Large (top at y ≈ 136,
  x 68–132): the mouth stays above it, the chin just touches it. The beard,
  the neck and the chest go under the ring; that is expected.
- **Medium**: s = .98, ey = 74. The ring is half the disc there (top at
  y = 100) and the vignette darkens the outer third, so the head is bigger
  and higher: helm, brows, eyes and nose above the ring. The mouth is under
  it; colour and silhouette tell the figure, not the mouth.

Head width: the face ±42…±55 head units (38–50 px of the 200). A helm or a
hood up to ±64 (the Broadbeam's helm), ±78 a hood with its fall. Keep the
crown inside the circle at Large (y ≥ 20 in the square).

## 2. Lines and the filter

- Author stroke widths in head units as the balloon does: outlines 1.1–1.3,
  inner lines .9, fine strands and wrinkles .5–.6, sheen strands 1.1.
  `svg()` multiplies every `stroke-width="…"` by `LINE`: **1.45 at Large**
  (the balloon's `thick`), **2.6 at Medium**. A width given as a computed
  attribute string is caught too; a CSS width is not (do not use CSS).
- Every visible part sits in a `pen(c, …)` group: the filter, the ink
  stroke `INK`, round joins and caps. Shading paths inside it use
  `stroke="none"`.
- Two filters, one wobble (`penFilter`, `WOBBLE`, `INKS` in parts.ts). Both
  share the pen wobble (Large `freq .03, scale 2.6, grain .5`; Medium scale
  1.6), so their outlines line up. They differ in ink and grain:
  - **`f`, the ink pen** (`pen(c, …)`): blot 1.5, bias -.7, grain alpha
    1.05/-.55 (Medium .7/-.45): the balloon's blotchy engraving. Use it for
    metal, cloth, leather, dark hair and beards.
  - **`fs`, the soft pen** (`pen(c, …, true)`): blot .55, bias -.42, grain
    .5/-.4 (Medium .5/-.4, .4/-.36). Use it for **skin** (face, nose,
    mouth, eyes) and **light masses** (white, grey or fair hair and beards,
    pale cloth). The full ink on these reads as freckles and stains.
  - The knob is `INKS` in parts.ts: change it there for every race, never
    per drawing.
- `c.fine(s)` keeps `s` at Large only. Put through it: ink strands,
  wrinkles, rivets, studs, stitching, the brow hairs, the lines under the
  eyes, small gems that turn to noise.

## 3. Light

From the viewer's **upper right**, always. The viewer's left side of every
mass carries the shadow: hatch `p` (38°) over a shadow band, hatch `q`
(-52°) over the narrow outer edge, and a 20–30 % brown (`#4e2f20`) tone
under the hatch on the face. The right side gets highlights: a white
stroke at 25–50 % on metal, the light strands on hair, a pale sheen on the
nose (`#f3dcc0` at 40 %). Gradients run left (dark) to right (light): `lg()`.
`mass(d, fill, sw, shadow, c, deep)` is fill + `p` over `shadow` + `q` over
`deep` in one call.

## 4. Palette

Muted, earthy, never pure. Saturation stays low except for one house mark
per figure, which may be strong (the Firebeard's red, the Longbeard's
blue): that mark is what tells the figures apart in Medium.

- **Skin** (dwarves): `['#92705a', '#c2a085', '#e2c7a8']` (shadow, mid,
  light) as the `s` gradient; lids a little darker than the mid
  (`dark(mid, .1)`), the lower lid the mid. Cheek blush `#9c4a36`/`#b25a44`
  at 16 % (women 30 %). Ruddier (Firebeard) or tanner (Broadbeam) by
  shifting the three stops, not by saturating them.
- **Hair**: a two-stop gradient `h` (shadow, light) plus a sheen colour for
  the light strands, about `light(hair, .5)`: brown `#4a2f23→#80543b`
  sheen `#d6ccb9`; white `#9d978c→#e2ddd2` sheen `#fbf8f0`; red
  `#7a2410→#c4501e` sheen `#f3a24c`; black `#161312→#3a3330` sheen
  `#8a8f96` (a cold sheen on black).
- **Metal**: iron `i` `#30353a→#596067→#8c949a`; bronze `b`
  `#5c4724→#94793f→#c4a868`; copper `#4e2a1a→#8e5532→#c98b5c`; dark iron
  `#22262a→#464c52→#7a8288`; gold trim `#d8b45a`; silver `#d6dbde`.
- **Cloth**: Durin's blue `#1f2c44→#344b70→#5b7299`; oxblood leather
  `#3a1e16→#5e2c22→#84463a`; mail `#7c858b` with the `m` ring pattern.
- **Eyes**: irises dark and warm (`#3a2414`) unless the people's mark says
  otherwise (the Longbeard's `#3c5270`). Whites are never white: `#d9cdb3`.
- **Background**: transparent. The disc's own gradient shows through, in
  dark and in Paper alike, and the figure fills most of the circle. No
  backdrop for the dwarves; a race may add one only if its silhouette
  fails on both disc colours (record why).

## 5. Eyes, brows, hair, beards

- **Eyes**: `eye(c, side, EyeO)` / `eyes(c, EyeO, BrowO)`. The socket is a
  soft masked tone plus a hatched crease under the brow (not a hatched
  ellipse: that read as spectacles). Inside the almond: the iris
  (r 3.6), pupil, a catch light at the upper left (`#fff8e6`), the upper lid
  (`lid`: 1.2 alert, 2.8 old and kind, 3.6–4 calm or heavy) and the lower lid
  (`low`: 0 relaxed, 2 a squint of anger). The lash line is the heavy
  stroke over the almond. Women: `lash: true` (heavier line, three flicks
  at the outer corner, one faint line under) and `size: 1.06`. Age: `age`
  adds crow's feet and a bag. Never draw a fixed stare: some lid always.
- **Brows**: `brow(c, side, BrowO)`: the balloon's bushy brow (a filled
  hook with light hairs and ink hairs) at `sc` 1.16; `rot` drops the inner
  ends (16 a scowl); `dy` lowers it; `thin: true` the women's slender
  arch. In Medium the hairs go and the fill is lightened toward the hair
  colour so the brow still reads as a bar.
- **Hair and beard masses**: a closed shape with the `h` gradient, `mass()`
  shading on the left, then `strands(c, dark, light, sheen)`: ink strands
  (.55, 72 %) following the fall of the hair, and fewer light strands (1.1)
  on the lit side and the middle. Strands curve and vary; parallel evenly
  spaced strands look like pinstripes (fixed on the Broadbeam). Medium keeps
  only the light strands, thicker and fainter.
- **Moustache**: the balloon's two lobes (`lobe()` in dwarves.ts), the left
  lobe hatched. Variations change the tips (a droop, `flameLobe()` sweeps
  them up), not the root under the nose.
- **Braids**: `braid(c, x, y, links, scale, spec)`: alternating links with a
  sheen tick, a metal ring and a tuft. Men hang them from the beard's
  flanks; women wear two thick ones from under the headgear down the front
  of the shoulders (where a man's beard falls), which keeps the same
  silhouette mass in Medium.

## 6. Men and women

Kept: the people's headgear, armour and cloth, palette, eye drawing, the
house mark, the frame and the light. Changed for a woman:

- no beard or moustache (decision, approved by the main session on
  2026-11-23: Tolkien's dwarf women are said to look
  like the men, but at 100 px a beard reads only as a man; the house mark
  moves to the hair instead: length, colour, wildness);
- a face a little narrower (jaw × .96–.98) and shorter, tapering to a
  rounded chin at y ≈ 47 with a soft shadow under it; a visible neck and a
  bronze gorget with a gem;
- a smaller nose drawn without a closed outline (only the shadow-side line,
  the nostrils and a tone), fuller lips (`lips()`), blush 30 %;
- slender brows (`thin`), lashes, eyes 6 % larger, fewer lines under them;
- hair framing the temples, long hair behind the shoulders, the two front
  braids: the parts.ts helpers, all taking one `HairO` (`near` fill, `cols`
  shadow/light/sheen, `len`, `jaw`, `wild` 0 smooth or 1 a mane of rounded
  tongues, `braids` with links/scale/x/top/ring, or omitted for loose
  hair). `longHair(c, o)` under the face, `temples(c, o)` over the face,
  `frontBraids(c, o)` last, over the shoulders and the headgear's rim.
  `braid(c, x, y, links, sc, cols, ring)` is the single braid (the men's
  beard braids use it too). dwarves.ts `hairOf()` is the example;
- the base woman's helm loses the nasal and shows a garnet on the band.

A race that does have bearded women (none that I know) still follows the
"reads as a woman at 100 px" rule.

## 7. Subraces as variations

A subrace is the base `Spec` spread with a few fields changed
(`{ ...BASE, hair, helm, beard, bust, jaw, wide, brow, eye }`): the same
drawing functions, never a new head. Push one or two marks hard enough to
survive Medium:

- **Colour** first (hair, cloth, metal): the dwarves differ in Medium by
  brown + iron, white + blue, red + copper, black + dark iron.
- **Silhouette** second: a dome helm, a hood, a tall cone, a flat wide
  helm with cheek guards; the beard's outline (rounded, long and broad,
  flaring tongues, square).
- **Face** third (Large only): brows and lids for temperament (the
  Firebeard's scowl and squint, the Broadbeam's heavy calm lids, the
  Longbeard's age lines), the jaw factor (Broadbeam 1.16, shoulders 1.32).

## 8. Medium (40 px)

- `LINE.medium` 2.6, the gentler filter, hatch as a flat tone (`shade()`
  draws a solid 42 % tile so the same `url(#…p)` works), mail as a tone.
- No fine strokes (`c.fine`), brows without hairs, fewer strands.
- The head larger and higher (`FRAME.medium`). Judge Medium on
  `dwarves-medium.png`: four figures must be told apart by colour at a
  glance, in dark and in Paper.

## 9. Pitfalls I hit

- A hatched ellipse round each eye looks like goggles at Large: use the
  masked socket tone and the crease (now in `eye()`).
- The balloon nose with its closed outline on a woman reads as a man's
  potato nose: the women's nose has no outline.
- A beardless face on the male head shape is a square boy: taper the jaw,
  shorten it, show a neck.
- Spiky "flame" locks at the temples read as horns or fins: put a hair
  mass with rounded tongues behind the braids instead.
- A plait in the beard's centre lands under the ring: keep marks at the
  sides or above y ≈ 45.
- Two concentric arches (a hood rim over the hood) read as a double band:
  one fold line with a highlight is enough.
- The full ink pen on skin and white hair reads as freckles and stains at
  XL: draw those in the soft pen (`pen(c, …, true)`).
- `px()`/`mir()`/`wx()` only handle absolute M L C Q S T Z paths (pairs):
  never pass them H, V, A or relative commands.
- The stage page imports every `draw/*.ts` and expects a `portraits`
  export: put shared helpers in `parts.ts` (or your own file outside
  `draw/`), never a helper-only file in `draw/`.
- Type-check the stage files: they are outside `tsconfig.json`'s include;
  a throwaway tsconfig that extends it and includes
  `notes/research/portraits/stage/parts.ts` and `draw/*.ts` works (create
  it in the worktree root so the type roots resolve, delete it after).
