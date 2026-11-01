# Player mockups (stage 32b)

Six design-canvas artboards from 2026-11-01, in a new column "Steg 32" on
the owner's canvas https://claude.ai/artifact/Bap2VJPNro2qcKTDrXXmaj
(private to the owner). Three directions, each drawn as the Spotlights
reel and as the run log player, 1440 × 820 at 1:1. All are clickable: play
and pause (time runs), back and forward 10 s, to the start, speed, the
timeline and its markers, the Panes, Display and Keys menus (Display
changes the game text's size and colours, Panes hides docked panes), and
in Spotlights the previous/next arrows and the filter (kinds, characters,
period rebuild the reel; "Last month" leaves it empty).
`gen.mjs` writes them: `node gen.mjs <folder with canvas/project/>`.
Reference material, not code to copy into `src/`.

Common to all: the ghost look of the in-game popups (stage 30): dark
glass, thin grey stroke icons that light up on hover, toggles and
segmented controls as in Settings. The run log's header line and the key
hints move into the player (a title line and a Keys menu); Esc becomes an
X button as well. Display holds font size (Default, Small, Medium, Large)
and colours (Default, Dark, Teal, Paper, Sepia, Slate), as today's gear.
Spotlights' kinds, characters and period move from the player box into
the info card at the top right.

| Direction | Player | Timeline | Spotlights filter |
|---|---|---|---|
| A · Kompakt ruta | A small box at the bottom right (as today's place). | Today's right-edge strip, as a thin rail with marker tags. | Always in the card: Kinds and Characters fold out, Period is a list. |
| B · Tidslinje i rutan | A wider box at the bottom right of the game text. | Horizontal, inside the box, markers above it; the right-edge strip goes. Spotlights: one coloured segment per spotlight. | Behind a filter icon in the card; closed, one summary line. |
| C · Bottenlist | A full-width bar along the bottom; the game text and the panes end above it, nothing is covered. | Horizontal, the full width. | Kinds as chips (one click each), Characters folds, Period a list. |

Keys proposed: run log ← → back/forward 10 s; Spotlights ← → previous/next
(as today) and Shift+← → 10 s; Home to the start in both.
