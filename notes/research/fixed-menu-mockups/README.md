# Fixed menu mockups (stage 30)

Five design-canvas artboards from 2026-10-22, the source of the owner's
canvas at https://claude.ai/artifact/Bap2VJPNro2qcKTDrXXmaj (private to the
owner). Each file is a self-contained Design Component (`.dc.html`): the
bottom of the client at 1:1 (game text, input row, the menu left of a
docked Comm pane) and the menu zoomed, at rest and with Settings hovered.

They render only inside the design canvas (`support.js`, `<x-dc>`,
`<sc-for>`), not as plain pages. The CSS in each `<helmet><style>` holds the
look. Reference material, not code to copy into `src/`.

| File | Direction |
|---|---|
| `1-status-line.dc.html` | Discreet. Plain TUI words with `│` separators, tmux-like; inverse cell on hover. |
| `2-ghost-icons.dc.html` | Discreet. Thin dark-grey stroke icons straight on black; light up on hover. |
| `3-recessed-tray.dc.html` | Discreet. A slightly sunken dark tray with engraved separators. |
| `4-glass-plate.dc.html` | Stands out. The panes' frosted glass and engraved ink; a plate rising from the bottom edge with fillets. |
| `5-instrument-panel.dc.html` | Stands out. Dark bezel, amber clock readout, amber icons that glow on hover. |

## 30a refinement (2026-10-31)

The owner picked direction 2 (ghost icons). Six artboards in a new column
on the same canvas, following the spec in `docs/stages/30-fixed-menu.md`.
Panes, Settings, Exit and the pane gear are clickable (toggles, tabs,
stars, Reset layout confirm).

| File | Shows |
|---|---|
| `30a-1-bar.dc.html` | The bar (clock, link dot, Profile, Scripts, Panes, Settings, Fullscreen, Exit): at rest, Profile hover, slow link, disconnected notice. |
| `30a-2-panes.dc.html` | Panes popup: show/hide per pane, script panes, Reset layout with confirm. |
| `30a-3-settings.dc.html` | Settings popup, modern controls, tabs Appearance, Text input, Mapper, Weather effects. |
| `30a-4-exit.dc.html` | Exit popup with the run rating. |
| `30a-5-pane-gear.dc.html` | Gear first in a pane's hover row; Comm settings beside the pane. |
| `30a-6-windows.dc.html` | Profile window (focused, cyan glass rim, grip nameplate, X plate, corner grips, Lite at full width) over a dimmed Scripts window. |
