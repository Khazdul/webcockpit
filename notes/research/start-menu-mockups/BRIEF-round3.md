# Start menu — round 3 brief (the sea)

Builds on `round2/base.html`. The rules of `BRIEF.md` and `BRIEF-round2.md`
still apply (menu, weather director, sun/moon, game time, demo panel,
profile page, sizes, screenshots, no commits) except where this file
changes them.

## Owner feedback on round 2 (2026-11-06)

Wordmark
- **Logo A** (round-2 `logo.html` A, which is what base.html uses) is the
  choice. **Tone the lava down** so it is more subtle, and give the lava
  areas a **thin border/rim** so they look **sunk into** the letters (an
  inset channel with a dark edge and a lit lip), not floating on top.

Menu panel
- The thin stone-like frame is fine. **The plate at the top centre (the
  hood with the small lantern) gets another texture, e.g. glossy**
  (polished, lacquered or burnished metal with a clean specular highlight).

Landscape — the mountains are dropped
- Every mountain range looked awful by day: the terrain reads as
  **pixelated**, and it clashes with the **razor-sharp vector trees**.
  At night it was OK (only outlines visible). Rule: **no heightfield
  terrain, no mountains.** Everything in the scene shares one rendering
  language: smooth shapes, soft gradients and haze — never low-res raster
  next to crisp vectors.
- Trees: the owner likes the **swaying tree tops in base.html** when only
  the **upper parts** are visible and they stand **densely clumped**
  (`round2/shots/base-*` lower band). Trees seen top-to-bottom, and above
  all **lone trees, look bad** — avoid both.

New scene (owner's idea)
- We stand on a hill thick with trees, looking out over the **sea**.
- **Tree tops** rise in the **lower right and lower left**, **smaller trees
  in the lower middle**.
- The **horizon** cuts across somewhere above the middle; below it the
  **sea moves quietly** (slow swells, a glitter path under sun or moon,
  cloud and sky reflections, calm).
- A **ship** like the Elves' ships in Tolkien (slender, high curved prow,
  pale sail; an original design, not film art) moves **slowly and far
  away** across the sea.
- Perhaps the **top of a cottage roof** with a **smoking chimney** pokes up
  from the forest fairly close to us. **Keep it simple and not too close**:
  too much detail will disappoint; a roof ridge and chimney among the tree
  tops is enough.
- Seasons: snow on the tree tops in winter (snow always falls in winter),
  autumn leaves (some broadleaf tops among the conifers), blossom in
  spring. Seabirds (gulls) may replace land birds over the water.

Sub-pages (owner, 2026-11-06, later the same day)
- Profile buttons (New, Edit, Import, Export, Delete): not the current
  texture; **glass buttons** (frosted, lit top edge) or no texture.
- **No key-shortcut hint rows** anywhere (we are leaving the TUI). Instead
  the **shortcut letter is marked** in the label (e.g. the N in NEW).
  Up/down needs no hint.
- **A Back button on every sub-page**, always in the same place; Esc still
  goes back.

Menu selection (owner, 2026-11-06, final)
- Use the selection of **`round2/07-falls.html`**: the chosen row's text and
  icon brighten; no glide, no glow, no sweep. (An earlier request to go back
  to round 1's glide was withdrawn.)
- **No shortcut letter at the right end of menu rows** (the faint P, S, H…
  and ⏎). The shortcut is marked inside the label, as on sub-pages.
- **Only one lantern**: the small one in the hood plate at the top centre of
  the start menu panel (under the wordmark). None on profile rows or
  anywhere else.
