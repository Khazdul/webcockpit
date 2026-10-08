# 0085 — Map background colour

- Status: Accepted
- Date: 2026-10-08
- Amends: ADR 0020 (map: the renderer cleared to MMapper's fixed
  `#2e3436`; `MainToWorker`)
- Builds on ADR 0082 (Options → Mapper rows, settings sent to the worker)
- Stage: `docs/stages/25-polish.md` (B5)

## Context

Owner request (stage 25): let the user choose the map's background in
Options → Mapper. The default stays today's colour, MMapper's `#2e3436`
(the owner's MMapper config). The user picks a common named colour or
types an exact code. Saved with the other map settings and applied live.

Where the colour is used today: the worker clears every frame to it
(`webgl.ts`), and draws it at 50 % over the layers below the player's
(the fade that makes lower layers recede). The pane's CSS background
(`.wc-map`, panes.css) shows it before the first frame, under the
loading overlay (ADR 0083).

## Decision

1. **Setting.** `mapper.background`, a `#rrggbb` string, default
   `#2e3436`. Migration keeps any hex colour (normalised to lower-case
   `#rrggbb`, `#rgb` expanded) and falls back to the default for
   anything else. Additive: no settings version bump.
2. **Choices.** `src/map/backgrounds.ts` holds the list, default first:
   Default, Black, Dark grey, Grey, Navy, Dark blue, Dark teal, Dark
   green, Olive, Dark brown, Maroon, Dark purple. All dark: white has at
   least 7:1 contrast on each (unit test), so the white connection lines,
   infomark text and the player's marks read as before. No light colours
   are offered; a typed code may be anything.
3. **Options UI** (the TUI patterns of Appearance): a cycler row
   `Background: <name>` (a typed colour shows as its code and leads the
   cycle, like Appearance → Background); Enter opens *Map background*, a
   radio list like the font picker with a swatch of the colour under the
   cursor, and *Colour code…*, a `#rrggbb` prompt like the ANSI colour
   prompt (bad input: "Use #rrggbb, e.g. #1c1c1c."). Confirming the code
   returns to Options → Mapper with a flash.
4. **Worker.** `init` carries an optional `background`; a new
   `{ t: 'background', color }` message changes it. The core keeps it as
   RGBA (`hexRgba`, palette.ts; an invalid code reads as the default),
   gives it to every renderer it builds (also after a context restore)
   through the optional `Renderer.setBackground`, and asks for a redraw.
   The WebGL renderer uses it for the clear and the lower-layer fade.
5. **Pane.** The Map pane sets `--map-bg` (and `data-map-bg`) on its
   content from the setting and follows changes; `.wc-map` uses
   `var(--map-bg, #2e3436)`, so the area before the first frame and
   under the loading overlay matches the map. The overlay's dark pill
   is unchanged: it reads on every listed colour.
6. **Replay.** The HTML replay's payload carries the exporter's
   settings, so it draws with the exporter's background; the log player
   uses the viewer's own.

## Consequences

- No automatic contrast. On a light typed colour (e.g. `#ffffff`) the
  white connection lines on the current layer and white infomark text
  disappear, and black exit walls show more. Tiles themselves stay
  legible on any colour (they are opaque). This is the user's choice;
  the list itself avoids it.
- The lower-layer fade uses the chosen colour, so lower layers recede
  into it the way they do into the default.
- Protocol: an older worker ignores `background` (unknown messages are
  ignored), so `MAP_PROTOCOL_VERSION` stays 1.

## Addendum — stage 25 round 2 (2026-10-08)

Owner feedback round 1: "Background" → "Background colour", add "Dark
paper", and pick the named colour or the code directly in the Mapper
menu, a check box before each, choosing one unchecks the other.

1. **Rows.** The Map background page and its radio list are gone.
   Options → Mapper has two check-box rows (the menu's glyph block):
   `[X] Background colour: <name>` (←→ cycles the named list, Default
   first; Enter or a click checks it) and `[ ] Background colour code:
   #rrggbb` (Enter or a click opens the existing validated `#rrggbb`
   prompt, prefilled with the remembered code; a valid code checks the
   row; ←→ checks it again with the remembered code). Exactly one is
   checked: the code row while `mapper.background` is not a named colour.
   While the code row is checked the named row offers Default. A typed
   code that equals a named colour shows as that name (the same colour).
2. **`mapper.backgroundCode`**: the last typed code, `''` for none.
   Additive, no version bump. Migration keeps a hex code (normalised);
   without one, a round-1 typed background (not a named colour) becomes
   the remembered code. `mapper.background` keeps its meaning (the
   colour drawn), so the worker, the pane and the replay are unchanged.
3. **Dark paper** `#e8dfc8`, last in the list: a shade darker than the
   Appearance paper background (`#f4ecd8`), the only light choice.
4. **Legibility on a light background.** The renderer treats a
   background as light by WCAG luminance ≥ 0.1791 (the ink flip point of
   `takesDarkInk`; `isLightBackground`, palette.ts; `mapBgIsLight` in
   backgrounds.ts agrees). On a light one the colour shader's new `uInk`
   (0.85) takes that share of each colour's white part away for the
   current layer's connections and the infomark lines: white becomes
   `#262626`, red stays red, cyan darkens. Tiles, walls (already black),
   door names and infomark text (on their own dark or tinted boxes) are
   unchanged; the lower-layer fade blends into the paper as it does into
   the default. Dark backgrounds pass `uInk = 0` and draw exactly as
   before. The unit test now asks 7:1 for white on every dark choice and
   7:1 for `#262626` on every light one (Dark paper ≈ 11:1). This also
   makes a light typed code legible, which ADR 0085's consequences
   called the user's problem.

## Addendum — stage 25 round 3 (2026-10-08)

Owner feedback round 2: the typed colour code "didn't look good"; remove
it. Also: the named list must include Black and White.

1. **Named list only.** Typed colour codes are removed at the owner's
   request. Options → Mapper has one cycler row, `Background colour:
   <name>` (no check box): ←→ cycles the named list, Default first;
   Enter or a click steps forward like the menu's other cyclers. The
   code row, its `#rrggbb` prompt and swatch are gone.
2. **Settings.** `mapper.backgroundCode` is removed (a stored one is
   dropped on load). Migration keeps `mapper.background` only when it is
   one of the named colours (normalised); anything else, including a
   code typed in rounds 1–2, falls back to the default. No version bump.
   The worker, the pane and the replay are unchanged.
3. **White** `#ffffff`, last in the list after Dark paper (the light
   end). Black was already there. White is light by the same luminance
   threshold, so it takes the dark-lines path of round 2 (`#262626`
   lines, ≈ 15:1 on white; unit test asks 7:1 for every light choice).
4. Dark paper and the dark lines on light backgrounds stay.

## Addendum — Transparent (2026-10-08)

The owner asked for "transparent" as a map background, if not too
involved.

1. **Choice.** `Transparent` is last in the named list; the setting
   stores the word `transparent` (migration keeps it, also as the
   remembered background of ADR 0088).
2. **Meaning.** The map draws on the Map pane's own background: the
   pane's tint fill, else the terminal background
   (`paneEffectiveBg`). The pane resolves it (`mapBgEffective`) and
   sends that `#rrggbb` to the worker, and follows changes to the theme
   and the pane's colour.
3. **Why not a see-through canvas.** The WebGL context is opaque
   (`alpha: false`) and the lower-layer fade blends into the background
   colour. A real alpha canvas would need premultiplied blending
   throughout and a new fade, and would only differ where something lies
   behind the pane, which is the pane's own opaque background. Resolving
   to that colour looks the same, keeps the fade, and picks dark lines
   on a light (paper) pane by the existing rule. Worker and protocol are
   unchanged.
