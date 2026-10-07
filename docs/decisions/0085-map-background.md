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
