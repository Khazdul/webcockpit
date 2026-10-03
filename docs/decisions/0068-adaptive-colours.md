# 0068 — Adaptive colours

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0051 (the script colour syntax), ADR 0065 (a further
  `Color` range beside the shade roles)

## Context

Stage 16 turns Cockpit's readability modules into a bundled script. They
colour text with fixed 24-bit colours (teal `#3fb0a0`, grey `#6e6e6e`,
gold `#f0c850` …) chosen for a black terminal. On `paper` most of them
are unreadable (gold is 1.6:1), and on the dark presets the grey sits
under 4.5:1. ADR 0061 gave every background preset a palette that keeps
4.5:1, but a script's own truecolor bypasses the palette. The owner chose
(2026-10-03) adaptive colours in the host: a script names a colour, and
WebCockpit adjusts its lightness to the current background; a background
change recolours the scrollback too; every script may use them.

## Decision

### Encoding

A new `Color` range: `ADAPTIVE_COLOR = 0x4000000`, an adaptive colour is
`ADAPTIVE_COLOR | 0xRRGGBB` (the base colour). `isAdaptive(c)`,
`adaptiveColor(rgb24)` (core/types.ts). `isTrueColor` (`< SHADE_COLOR`)
and `shadeRoleOf` (now `< ADAPTIVE_COLOR`) exclude it, so no existing
check mistakes it for another kind.

### Script syntax

A `~` before a colour wherever a script names one: cecho, replaceLine and
pane text tags `<~gold>`, `<~#f0c850>`, `<~240,200,80>`, a background
after the colon (`<~gold:~navy>`, `<:~gold>`, `<white:~gold>`), and
`highlight("~gold")`, `highlight("~#f0c850:~#000080")`,
`highlight("<b><~gold>")`. The rest is any Mudlet colour name, `#rrggbb`
or `r,g,b`; `~ansi_*` is the palette colour itself (the theme already
fits the palette, ADR 0061). An unknown `~` tag stays text, an unknown
`~` highlight colour is an error, as before. `echo` has no colours.
`copy2cecho` writes an adaptive colour back as `<~#rrggbb>`.

### Resolution (src/theme/adaptive.ts, pure)

- **Text** (`adaptFg(base, bg)`): ADR 0061's rule. Unchanged when the
  base already has 4.5:1 against the background, else mixed in RGB
  toward white (a background that takes light ink, `takesDarkInk` false)
  or black by the smallest step that reaches 4.5:1 (`fitContrast`, a
  12-step bisection). Mixing toward white or black keeps the HSL hue. So
  on black Cockpit's teal, gold, pink and lilac are exactly Cockpit's.
- **Fill** (`adaptBg(base, fg, bg)`): moved the other way, toward the
  background's side, by the smallest step that gives the font colour
  4.5:1 on it, so text on the fill stays readable.
- A foreground adapts to the terminal (or pane) background, not to a
  run's own background.

### Rendering and live recolouring

Renderers never resolve. `colorToCss(c, role)` (ui/palette.ts) returns
`var(--wc-af-rrggbb, #rrggbb)` for text and `var(--wc-ab-rrggbb, #rrggbb)`
for a fill, as the inline colour, in every path that already wrote a
truecolor inline: the output pane's run spans and background rows
(`bgCss`, the row's own foreground and its nested spans), the comm pane,
the export editor's model (`runStyle`).

Each themed root holds the resolved value of every adaptive colour in use
as a custom property: `applyTheme(s, root)` calls `applyAdaptive(root,
fg, bg)` (the app's `<html>`, an in-app player's element, the replay
page), and the first use of a colour (`adaptiveCss`) writes its two
properties on every known root. Custom properties inherit, so each span
takes the value of its nearest themed root: a player resolves against
its own background. A background change rewrites the properties and the
scrollback recolours with no re-render. Roots are held by `WeakRef`; an
`applyTheme` with unchanged colours on a known root writes nothing.

The plan said "a class per base colour whose rule is rewritten"; a
custom property per root does the same job and is scoped per themed
root, which one global rule per class could not be.

At most `ADAPTIVE_MAX` (1024) base colours get properties; past that a
colour is resolved once against the last applied background (no live
recolour). Readability uses five.

### Script panes, runs and the player

- Script panes resolve at every render against the pane's effective
  background (`paneLine`: text with `adaptFg`, a fill with `adaptBg`
  under the pane's ink), as is: no light shift, no lift. A pane tint or a
  theme change re-renders the pane.
- Run capture records game lines raw and script panes as their snapshot
  (SPANE): adaptive colours stay `Color` numbers in the log
  (`script-record` accepts them), and the log player and the replay page
  resolve them against their own background. Downloads are the raw log;
  they carry no resolved colours.

### `lineTags()`

A small addition made for the readability script: in a trigger,
`lineTags()` returns the MUME XML elements the line is in (`room`,
`description`, `exits`, `say`, `tell` …), each once, outermost first;
empty without XML or outside a trigger. A script can then skip room
descriptions and what players say.

## Consequences

- Any script can choose colours once and have them read on black, the
  dark presets and paper. Scripts that use plain `#rrggbb` are unchanged.
- One `var()` per adaptive span instead of a hex: the same inline style
  cost as truecolor.
- `tests/unit/adaptive-colors.test.ts`: 4.5:1 on every background
  preset, unchanged when already passing, hue kept, fill rule, the `~`
  syntax, live properties, the overflow, and each renderer.
