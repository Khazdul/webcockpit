# 0062 — Font colour presets named after the background themes

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0061 (the font colour column)

## Context

ADR 0061 gave each dark background its own font colour, nine new hex
values that showed as codes in Options → Appearance ("Font color:
#d5c4a1"). The owner wanted named colours instead, silver and ink kept
as they are, and not too many choices.

## Decision

`TERMINAL_FG_PRESETS` becomes, in cycle order:

| Name | Hex | Used by |
|---|---|---|
| sage | `#778a8d` | (kept, Cockpit ramp) |
| silver | `#c0c0c0` | black, grey, orange |
| mist | `#93a1a1` | teal |
| wheat | `#d5c4a1` | red, green, sepia |
| lavender | `#a9b1d6` | blue |
| frost | `#d8dee9` | purple, slate |
| ink | `#000000` | paper |

- ash, stone and shadow are removed (shadow is under 3:1 on every dark
  preset; the ramp gave six greys and no tints). A saved font colour
  that was one of them still works and shows as its hex code.
- Each theme's colour 7 is set to its font colour, so the font colour
  stays colour 7 and bold brightens it to colour 15 (ADR 0060). All are
  at least 5.6:1 on their background.
- `wheat`, not `sand`, so it is not confused with the Input color "Sand".

## Consequences

- The unit test checks that every background theme's font colour is a
  named preset.
