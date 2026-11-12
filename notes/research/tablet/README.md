# Tablet layout — mockups

Status: **exploring, nothing decided.** Stage 54
(`docs/stages/54-tablet.md`). Throwaway HTML, written without
rendering; re-derive the look from the real pane code.

## Owner answers (2026-11-12)

- No physical keyboard with the tablet.
- Portrait and landscape must work equally well.
- Play in between: better than the phone, clearly below desktop. Good
  for an XP session, probably not PvP.
- iPad (10th gen, 820 x 1180 CSS px) is the test device; Android tablets
  should work but he has none to test on.
- Of the three first directions (big phone, cockpit for fingers,
  hybrid) the hybrid sounded most right.

## Round 1 (2026-11-12)

Canvas: "WebCockpit tablet layout, round 1" (claude.ai artifact
`XJqC6KnMdxFgFDyTQNPFNe`). Sources in `round1/canvas/` (7 artboards,
`canvas.json`, the shared `kit.css`). The map image is
`../phone-makeover/round2/bree.png`, uploaded to this canvas as its own
asset (`/_blob/…` in the kit).

Two takes on the hybrid:

| | Name | Landscape | Portrait | Keyboard up |
|---|---|---|---|---|
| A | Panes always in view | 80-column text left; fixed column right: Map, one tabbed pane (Group, Timers, Char, Stats), Comm; hot keys and compass at its foot | fixed band on top: Map, tabbed pane, Comm; hot keys and compass over the text bottom right | panes do not move; landscape: keyboard under the text only; portrait: full width, compass on top of it |
| B | The phone grown up | text owns the screen; 230 px lens over the free right margin; Group as a see-through card; a side sheet with full panes and Comm on demand | as the phone; the pane strip shows two panes side by side | not drawn (as the phone) |

Shared: compass and six hot keys bottom right at 54 px; the command
row with the menu key; the fight card on top of the text; our own
keyboard (ADR 0138), never the device's.

Questions put to the owner: A or B (or A in landscape and B in
portrait); the pane set in A; keyboard under the text or full width;
size and place of the compass and hot keys.

## Round 2 (2026-11-12)

Canvas: "WebCockpit tablet layout, round 2" (claude.ai artifact
`YHZrfVfDzqD34mtZfY9o7G`). Sources in `round2/canvas/` (8 artboards,
`canvas.json`, `kit.css`). Written without rendering.

Owner feedback on round 1, the base for round 2 (in full in
`docs/stages/54-tablet.md`): A in both orientations; a finer look from
the desktop's panes; Map, Comm and the pane box toggled; the pane box
swiped, no tabs; pinch zoom on the map; hot keys above the compass;
compass and hot keys hidden and shown together, their room filled; the
control always in view, perhaps a group of icons.

What round 2 draws:

- **Five switches** in the command row, right of the field: Map, Panes,
  Comm, Keys, and fullscreen. A lit icon is on; Comm's carries the
  unread count while Comm is hidden. Alternative X1: the same group in
  a slim top bar with the menu key and the clock.
- **Landscape column:** Map, Comm, then the pane box beside the keys
  (six hot keys in two rows of three above the compass, 54 px). Keys
  hidden: the pane box takes the full width. All three panes off: no
  column, text over the full width, keys over its corner.
- **Portrait band:** Map, pane box, Comm (rail as icons only). Keys
  over the text's bottom right corner; hidden: the field runs the full
  width. Keyboard up: full width, the keys ride above it.
- **Look:** Lykta frames (iron ring with corner rivets, hood plate,
  lamp-lit window, glow in the gap), frosted cards.

Questions put to the owner: switches in the command row or the top
bar; the column's order; keys while typing in portrait; two rows of
three hot keys.
