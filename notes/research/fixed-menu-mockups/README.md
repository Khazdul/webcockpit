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
