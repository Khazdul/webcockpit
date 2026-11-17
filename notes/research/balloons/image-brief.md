# Balloon goblin: the image-generator brief

Given to the owner in chat on 2026-11-17 (in Swedish; the prompts in
English). The file contract (sizes, names, anchor, fallbacks) is
authoritative in ADR 0159 and `public/balloons/README.md`; this note keeps
the working order and the prompts so a later session can pick it up.

## Tool

ChatGPT image generation is recommended: it can edit the same image
("change only the expression"), which keeps the character consistent, and
it gives a transparent background. Midjourney: use the master image as a
character reference (`--cref <url>`) and `--no text, background`.

## Order

1. Find the goblin: a master image (the calibrating face).
2. The other moods by editing the master image (always from the master,
   not from the last edit).
3. The balloon with an empty basket.
4. Cut out the basket's front wall (Photopea), same canvas.
5. Clean up and export: background off, align the heads, sizes, WebP.
6. Drop the files in `public/balloons/goblin/`; the next build uses them.

## 1. The master image

```
Character design for a small comic goblin who rides a hot-air balloon.
Tolkien-inspired goblin, not cute-cartoon and not grotesque: grey-green skin,
long pointed ears that droop sideways, a big hooked nose, small yellow eyes,
a few thin strands of hair, a worn brown leather jerkin with a patched
shoulder. Personality: gloomy, world-weary, quietly comic, like a tired
clerk who has seen too much.

Framing: chest-up portrait, facing the viewer in a slight three-quarter view,
both forearms resting forward horizontally at the bottom of the image as if
leaning on the rim of a basket. The body is cut straight off at the bottom
edge of the image.

Style: storybook illustration with bold clean dark outlines, flat colours
with soft shading, high contrast, simple shapes, very readable at a small
size (the image will be shown about 80 pixels tall). Light from the upper
left. No drop shadow, no ground, no scenery, no props, no text, no letters.
Transparent background.

Expression: blank and indifferent, half-closed eyelids, flat mouth.
Square image, 1024×1024. The head is centred horizontally, its centre about
40% down from the top, and the head is about 37% of the image width.
```

Saved as `passenger-calibrating`.

## 2. The other moods

```
Edit this exact image. Keep everything identical (the character, clothes,
pose, arms, framing, size, position, colours, line style, lighting and the
transparent background) and change ONLY the facial expression to:
<EXPRESSION>
No text. Same 1024×1024 canvas.
```

| File | `<EXPRESSION>` |
|---|---|
| `passenger-poor` | utterly miserable: eyebrows raised in the middle, eyes looking down, deep frown, one tear on the cheek, ears drooping lower |
| `passenger-meh` | bored and unimpressed: heavy half-closed eyelids, mouth in a wavy sigh, a tiny puff of breath |
| `passenger-good` | grudgingly pleased: a reluctant crooked half-smile, one eyebrow slightly raised |
| `passenger-great` | pleasantly surprised: wide open eyes, raised eyebrows, small open grin showing one tooth, a slight blush, ears perked up |
| `passenger-superb` | ecstatic: squeezed-shut happy eyes, huge open grin with crooked teeth, blush, ears pointing up; both arms raised high in triumph (the arms may change) |
| `passenger-pvp` | fierce battle grin: narrowed eyes, bared teeth, eyebrows angled down, ears pulled back |
| `passenger-levelup` | overjoyed and proud, beaming grin, fists raised in triumph (the arms may change) |
| `passenger-death` | comically dead: X-shaped eyes, tongue out, paler greyish skin, ears limp |
| `passenger-achievement` | smug and proud, chin up, eyes half-closed in satisfaction, a small medal on the chest |

## 3. The balloon

```
A patched, slightly shabby hot-air balloon for a gloomy goblin, storybook
illustration in the same style as the attached character: bold clean dark
outlines, flat colours with soft shading, light from the upper left.

The envelope: a classic teardrop balloon with vertical stripes in faded
ochre and dull brick red, one or two sewn-on patches, a little worn. Below
it a small burner with a tiny flame, four ropes down to a small round wicker
basket. The basket is EMPTY (no one in it), seen slightly from above so its
open rim is visible.

Portrait canvas 1024×1536, the balloon centred. The envelope fills roughly
the top 65% of the image. The basket rim is about 36% of the image width,
centred, at about 79% down. The basket bottom is at about 96% down.
No text, no ground, no sky, no scenery, no shadow. Transparent background.
```

Attach the master image as the style reference.

## 4–5. Basket front, clean-up, export

- Duplicate the balloon layer, keep only the basket's front wall (from the
  rim down), export it on the same 1024×1536 canvas as `basket-front`.
- Fully transparent background (remove.bg or Photopea's Select subject).
- Stack all passenger images as layers and toggle them: the head must not
  jump; move the ones that do.
- Zoom out to about 80 px tall: the expression must still read.
- WebP with alpha, quality about 85, ideally under 150 KB each.

## Later

- Blink: "change ONLY the eyes to fully closed" →
  `passenger-<mood>-blink.webp`. Wave: "change ONLY the right arm, now
  waving" → `passenger-wave.webp`. Same size and placement.
- Seasons: "add a knitted winter hood, change nothing else"; each season a
  set of its own.
