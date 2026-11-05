# Pane look: "Lykta" (lantern) — mockups and owner decisions

Research for stage 40 (not yet started). Three mockup rounds on 2026-11-05;
the owner chose **round 3, variant 17 "Lykta"** as the new look for all panes.

## Files

- `round1-content-styles.html` — round 1: five content styles for Group and
  Timers inside today's glass frame (Relief, Smedja, Alkemi, Runsten, Pixel).
  Artifact: https://claude.ai/artifact/7eF6rTmHBotfjjMqyny1iK
- `round2-stone-and-pixel.html` — round 2: ten frame + content designs
  combining Runsten and Pixel. Sources in `round2-src/`.
  Artifact: https://claude.ai/artifact/UX4VRGZ9KHohkEGP59gBzp
- `round3-between.html` — round 3: ten designs between today and round 2,
  with controls for pane tint (the seven `PANE_TINTS`), frame on/off,
  glass/clear background and a black page or weather sky behind.
  Artifact: https://claude.ai/artifact/9zg7kNykk6ckJr2TwFoxwL
- `round3-src/` — round 3 sources: `base.html` (data, rendering, tint tokens,
  states), `variants/NN.css|json`, `build.mjs` (`node build.mjs out.html [NN…]`),
  `BRIEF.md` (the constraints the variants were designed under).
  **`round3-src/variants/17.css` is the reference for the chosen look.**
- `s17*.png` — 17 in the default state, red + clear over the weather sky,
  and blue with the frame off.

The mockups are throwaway CSS over a simplified DOM; never copy them as is.
They show the intent; the build must re-derive it from the real frame code
(`src/panes/frame.ts`, `src/layout/layout.css`, ADR 0091 and its addenda).

## Owner feedback, in order

1. Today the frame has depth and a slight retro game feel (the engraved
   nameplate), but the Group and Timers content (stage 39) is flat and
   modern. Wanted: content with depth, softer, playful, textures and
   ornaments instead of lines; members and timers as cards.
2. Round 1: liked **5 Pixel** best, **4 Runsten** interesting. Realised the
   frame no longer fits: **the pane and its content must feel like one
   object that melts together**, so the frame is redesigned too.
3. Round 2: liked **7 Obsidian, 9 Stilla pixel, 10 Fackelsken** most, but
   every frame was a little too retro: dial the retro touch back. Must still
   work with **any pane colour, the border off, and a clear background**.
4. Round 3: chose **17 Lykta** as the new look for panes.

## 17 Lykta in short

A thin (≈5 px) band of dark iron with a faint tint, riveted L-shaped corner
brackets, a small centred iron hood holding the title (Cinzel, lit from
behind). The window is lit from within by `--lamp` (the tint hue mixed with
a warm candle white; Plain/Grey give candle light): a hot spot under the
hood falling off to a dark vignette. Rows, the fight zone and chips are
frosted glass with a lit top edge; bars are glossy tubes. Frame off: the
inner light and frosted cards remain. Clear: no fill; the lamp shows as an
inner edge glow plus a halo; cards get some `--pane-fill` backing.

## Owner decisions for the build (2026-11-05)

1. **Scope: all panes** (frame for every pane; content styling where it
   applies — Group, Timers, and the others as fits).
2. **Title centred** (today it is at the left, from the fourth cell).
3. **Outer glow kept, but within the gap between panes** (as far as is
   practical; in the mockup it spread ≈ 20 px and would bleed onto
   neighbours ~4 px away).
4. **Light background (Paper) in the same stage.**
5. Build thoroughly and carefully, in a new session.

## Known things the mockup glosses over

- The frame must stay in the pane's outer cell ring on whole device pixels
  at every DPR (`frameGeometry`, `framePlate`); the hood and brackets need
  the same treatment.
- Cost: the glass rim with weather uses backdrop blur in four strips (ADR
  0091 addendum); the lamp light, vignette and frosted cards must stay cheap
  with many panes, weather on, and in floating panes.
- Clear panes, borderless hover title (stage 29), floating panes, spanning
  panes, script panes (pane API), the map pane, and the output panes all
  meet the new frame.
- Light theme (Paper) has no design yet: the lamp idea needs a light-side
  counterpart.
- `oklch(from …)` relative colours were used in the mockup; check browser
  support against our targets or compute in `src/theme/`.
