# 0041 — The chrome and the client's rows on a light background

- Status: Accepted
- Date: 2026-09-30
- Amends: ADR 0010 ("Theme": the UI roles are static), ADR 0039
  ("Colours": the `[data-light] .wc-msg` mixes)

## Context

The UI colour roles (`--c-*`, Inv §10.3) were one static table that
assumed a dark canvas. With the `paper` background (`#f4ecd8`) the whole
chrome (start page, ESC menu, Options, Profile, the profile editor with
EDITOR and HELP, About, Statistics, History), the `[SYSTEM]` lines and
the `#help` rows were drawn in white, light grey and pale yellow on
cream: `--c-active` 1.2:1, `--c-item` 1.6:1, `--c-yellow` 1.2:1. The
owner reported it as hard to read. ADR 0039 had worked around it for the
confirmation rows only.

## Decision

The roles are light-aware at the token level. `themeColors(bg)`
(`src/theme/apply.ts`) picks the tables `rootTokens` publishes; no
component or stylesheet needs to know.

1. **Dark background** (`isLight(bg)` false): `UI_COLORS`,
   `BANNER_COLORS`, `UI_MESSAGE_COLORS`, `STATS_COLORS` exactly as
   before.
2. **Light background**: `UI_COLORS_LIGHT`, `BANNER_COLORS_LIGHT`,
   `STATS_COLORS_LIGHT` (`src/theme/presets.ts`), hand-tuned on `paper`.
   Each role keeps its identity in dark ink: titles teal, the cursor and
   accent amber-brown, `[SYSTEM]` a dark yellow, errors red, ok green,
   notes ochre, and active > hover > item > body > hint > off in
   contrast.
3. **Other light backgrounds** (a custom colour): each text role is
   mixed toward black by the smallest step that reaches its least
   contrast (`UI_MIN_CONTRAST`, `STATS_MIN_CONTRAST`,
   `BANNER_MIN_CONTRAST`; `fitContrast` in `src/theme/color.ts`). On
   `paper` nothing moves.
4. **Fills follow the background**: `sel-fg` is the background itself (a
   selected row is a dark bar with the paper's colour as ink; `sel-bg`
   and `focus-bg` are held to 4.5:1 against it), `off` and
   `scroll-track` are the background 30 % toward black, `brace-match-bg`
   16 %, `--st-track` 12 %. `--c-line-hl` was already derived (12 %).
5. **A background that counts as light but is dark to the eye** (HSL
   L > 58 with a WCAG luminance under 0.179, e.g. a saturated blue):
   the dark tables, each text role lightened toward white to the same
   contrasts. Black and white ink contrast equally at luminance 0.179
   (4.58:1), so 4.5:1 can always be reached.
6. `--ui-*` (not used by any stylesheet today): `lightShift` and 4.5:1.

`data-light` is unchanged (`isLight`).

### The light table (contrast against `#f4ecd8`)

| Role | Dark | Light | Contrast | Least |
|---|---|---|---|---|
| title | `#00d7d7` | `#006068` | 6.2 | 4.5 |
| section | `#008787` | `#2f7474` | 4.6 | 4.5 |
| header | `#ffd060` | `#7a5200` | 5.9 | 4.5 |
| active | `#ffffff` | `#000000` | 17.8 | 4.5 |
| hover | `#dadada` | `#1c1a15` | 14.8 | 4.5 |
| item | `#bcbcbc` | `#3a362e` | 10.2 | 4.5 |
| body | `#8a8a8a` | `#5c564a` | 6.2 | 4.5 |
| hint | `#585858` | `#797160` | 4.1 | 3 |
| off | `#3a3a3a` | bg 30 % → black (`#aba597`) | 2.1 | — |
| accent, cursor | `#ffaf00` | `#9a5400` | 4.9 | 4.5 |
| yellow (`[SYSTEM]`) | `#ffd75f` | `#6e5a00` | 5.7 | 4.5 |
| err | `#ff5f5f` | `#b3261e` | 5.6 | 4.5 |
| danger | `#a04030` | `#9c3a2a` | 5.8 | 4.5 |
| ok | `#7ac46f` | `#2e6b26` | 5.5 | 4.5 |
| note | `#b8923c` | `#7a5a10` | 5.4 | 4.5 |
| quote | `#8a8a8a` | `#797160` | 4.1 | 3 |
| quote-attr | `#87af87` | `#4a6e4a` | 4.9 | 4.5 |
| sel-fg | `#000000` | the background | — | — |
| sel-bg | `#bcbcbc` | `#5a5448` | 6.4 (to sel-fg) | 4.5 |
| focus-bg | `#ffaf00` | `#8a4c00` | 5.7 (to sel-fg) | 4.5 |
| scroll-thumb | `#ffffff` | `#2a261e` | 12.8 | 4.5 |
| scroll-track | `#585858` | bg 30 % → black | 2.1 | — |
| syn-cmd | `#5fafaf` | `#1f6f78` | 5.0 | 4.5 |
| syn-brace | `#8290a0` | `#5a6878` | 4.8 | 4.5 |
| syn-delim | `#c8a060` | `#8a5a12` | 5.0 | 4.5 |
| syn-var | `#87af87` | `#3a7030` | 5.0 | 4.5 |
| syn-code | `#9b86b3` | `#6a4a90` | 6.0 | 4.5 |
| brace-match-bg | `#3a3a3a` | bg 16 % → black | 1.4 | — |

Statistics / History (`--st-*`): value `#000000`, label `#5c564a`,
gained `#26731b`, loss and pvp `#b3261e`, tp `#8a5a00`, total and arrow
`#3a362e`, ally `#006068`, star `#8a5e00` (all ≥ 4.5), hint `#797160`,
thumb `#7c7564` (≥ 3), track bg 12 % → black.

Banner: word `#00727a` (4.8), word-dim `#3a9aa0`, stars `#b9cfc8` /
`#6aa6a6` / `#0a6f74` (the bright tier is the darkest: a star "lights
up" by standing out from the paper).

### Around the tokens

- `src/ui/ui.css`: the `[data-light] .wc-msg` mixes of ADR 0039 are
  removed; the rows use the tokens on every background. `.wc-comment`
  uses `--c-yellow`.
- `credits.css`: the text is `--c-active` (white on dark as before).
  `export.css`: the comment colour is `--c-yellow`; on `data-light` the
  cursor band is `--c-line-hl`, excluded lines `--c-hint`, the exclusion
  marks `--c-danger`.
- UI pane (`src/panes/ui.ts`): on a light pane the base ink, the prefix
  and the value colours are held to 4.5:1 (the yellow value was 1.4:1).
- The log player and the HTML replay call `applyTheme` on their own
  element, so they get the tables of the viewer's / the recorded
  background as the app does.

## Consequences

- `tests/unit/theme-light.test.ts` checks every text role against
  `paper` and against a grid of over 700 light backgrounds (every hue, five
  saturations, six lightnesses), the bars' ink, the order of emphasis,
  and that the dark tables and tokens are what they were.
- A new role must be added to the dark table, the light table and the
  least-contrast table; the test compares their keys.
- On a light background other than `paper` the colours move toward
  black and lose saturation the darker the background is; near the
  middle (luminance ≈ 0.18) every text role is close to plain black or
  white. That is the price of always being readable.
- A dark custom background that is not far from the middle (`#808080`)
  still gets the dark tables as they are, as before.
- Not changed: pane internals other than the UI pane. The pane frame and
  its title use the frame colour (L80 on a light background), which is
  faint on paper by design of the frame; the clock strip and the player
  controls keep their own light handling.
