# 0061 — Every background preset sets its own font colour and palette

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0058 (paper sets its own font colour and palette)

## Context

ADR 0058 gave `paper` its own ink and palette. On the dark presets the
DOS palette stayed, and its dark half reads poorly there: blue is
1.0–1.2:1, red 1.4–1.7:1 and magenta 1.6–2.0:1, worst on teal, sepia and
slate. The owner asked for the same care for every non-black background,
and chose: a distinct theme per background (not DOS hues lifted), every
colour at least 4.5:1, black left as DOS, and a matching font colour.

## Decision

`BACKGROUND_THEMES` (`src/theme/presets.ts`) holds a font colour and a
16-colour palette per background preset; `backgroundTheme(bg)` looks it
up (null for an off-palette colour).

| Preset | Background | After | Font colour |
|---|---|---|---|
| black | `#000000` | DOS (unchanged) | `#c0c0c0` |
| paper | `#f4ecd8` | PAPER_PALETTE (ADR 0058) | `#000000` |
| red | `#1a0e0e` | Kanagawa Dragon | `#c8c093` |
| green | `#0e1a0e` | Everforest | `#d3c6aa` |
| blue | `#0e141c` | Tokyo Night | `#a9b1d6` |
| grey | `#161616` | Tomorrow Night | `#c5c8c6` |
| orange | `#1c140a` | Ayu | `#bfbdb6` |
| purple | `#16101c` | Dracula | `#d6d4e0` |
| teal | `#002b36` | Solarized | `#93a1a1` |
| sepia | `#2b1b12` | Gruvbox | `#d5c4a1` |
| slate | `#1c2128` | Nord | `#d8dee9` |

- Each dark palette starts from the named theme's colours. A colour under
  4.5:1 is mixed toward white by the smallest step that reaches it, so
  the hue stays; a bright colour is lifted further when it would not be
  at least 15 % stronger than its normal twin (unless the twin is already
  above 9:1).
- Colour 0 is the theme's black, a shade above the background (it is also
  the SGR 40 fill). Colour 8 is a muted grey at 4.5:1 or better.
- The font colour is colour 7, so with "Bold brightens colours" (ADR
  0060) bold default text takes colour 15.

`backgroundPatch` (`src/chrome/frames/options.tsx`):

- Landing on any preset sets `bg`, its `fg` and its `ansi`; black
  restores silver and DOS.
- Landing on an off-palette colour from `paper` restores the defaults
  (as before); from anything else only `bg` changes.

"Reset palette" resets to the current background's palette (DOS on
black or an off-palette colour).

## Consequences

- Cycling the background replaces a custom palette and font colour on
  every preset, not only on paper. Both can still be changed after.
- `tests/unit/paper-background.test.ts` checks a theme for every preset,
  4.5:1 for colours 1–15 and the font colour (all 16 on paper), fg =
  colour 7 and colour 15 stronger than 7 on the dark presets.
- The log player's viewer themes (ADR 0021) are untouched: they set
  background and font colour only.
