# 0060 — "Bold brightens colours" option

- Status: Accepted
- Date: 2026-10-03

## Context

Cockpit renders SGR bold as font weight only, and so did WebCockpit
(`BOLD_BRIGHTENS = false`, a constant in `src/ui/palette.ts`). MUME sends
mob names as bold in the default foreground; in DejaVu Sans Mono the
bold weight alone is too subtle for some users. xterm and tt++ instead
show bold colours 0–7 as their bright variants 8–15. The owner asked for
an Appearance option, default off.

## Decision

`appearance.boldBright` (boolean, default `false`, migrated as a plain
boolean; it travels with the appearance, so it is in exports, shared
settings and recorded VIEW appearances). Options → Appearance shows it as
"Bold brightens colours: On/Off", after Input color.

It is applied in CSS, not in the renderers, so a toggle changes the rows
already on screen without a redraw (as a palette change does), and each
themed root has its own value (the in-app log player's recorded
appearance differs from the live one):

- The renderers keep the colour index and mark bold runs with classes
  only: `wc-bold` as before, `wc-fbd` for a bold, non-inverse run in the
  default foreground, `wc-inv` for an inverse run.
- `applyTheme` sets `--bold-0` … `--bold-7` (`ansi[i]` off, `ansi[i + 8]`
  on), `--bold-fg` (`currentcolor` off, i.e. unchanged) and
  `--bold-fg-def` (the font colour off; used for default-coloured text
  nested in a bold background row).
- `ui.css` maps `.wc-bold.wc-f0`–`7` (not inverse) to `--bold-<i>` and
  `.wc-fbd` to `--bold-fg`. Inverse runs are not brightened: their fg class
  is the swapped background.
- The bold weight stays in both modes.

**Default foreground** (`boldFg`, `src/theme/apply.ts`): when the font
colour is one of the palette's colours 0–7 it takes the bright twin
(silver `#c0c0c0` = colour 7 → bright white). Any other font colour is
mixed halfway toward the ink the background takes (`takesDarkInk`: white on
dark, black on light). The result is used only if it has more contrast with
the background than the font colour; otherwise the font colour stays.

**Paper** (ADR 0058): "brighter" means stronger ink, i.e. more contrast
with the paper. Ink is already black, and its palette twin (colour 0 → 8,
a mid grey) would be weaker, so bold default text stays black and bold is
weight only there. The paper palette's own 8–15 are the stronger inks for
colours 0–7 (white → bright white is dark grey → black).

## Consequences

- Off is pixel-identical to before.
- 256-colour and truecolor runs are never brightened (inline styles).
- `BOLD_BRIGHTENS` and `effectiveFg` are removed.
