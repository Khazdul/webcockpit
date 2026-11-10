# Phone in-game makeover — mockups, round 1

Date: 2026-11-10. Status: **exploring, nothing decided.** Owner request: a
full makeover of the phone layout inside the game. The ESC popup menu and
the tab strip feel dated; the start menu is fine on the phone now.
Builds on `notes/research/phone-review.md` (2026-11-01, parked).

Canvas: "WebCockpit phone in-game makeover" (claude.ai artifact
`KjAKHvuzPkrmkGb6W9jSJc`). Sources: `canvas/` (20 artboards and
`canvas.json`), `brief.md` (the shared brief). Throwaway HTML, written
without rendering; re-derive the look from the real pane code.

## Owner answers (2026-11-10)

- Ambition: **light play**. The phone is mostly for communication.
- Look: leaning towards the desktop look (Lykta) made for the thumb.
- Movement: a touch or joystick feel for N S E W, up and down, plus a
  flee button. To be explored.
- Comm: the existing Comm pane should suit the phone well; the question
  is how to raise and lower it neatly.
- Idea: the map as a dim background behind the game text, saving space,
  as long as the text stays readable.
- Navigation and menu: explore several variants.

## Directions

| | Name | Comm | Movement | Menu |
|---|---|---|---|---|
| A | Drawer | sheet from the bottom, ticker at rest | see-through compass over the text | bottom sheet |
| B | Map behind | curtain from the top | thumb stick; map dim behind the text | full page |
| C | Deck | a deck under the game | D-pad deck with quick buttons | a deck (no popup) |
| D | Pages | a full page, swipe sideways | key row above the input | drawer from the right |
| E | Lantern | tell bubble, floating window | hold and drag the lantern button | ring menu |

## Round 2 (2026-11-10)

Canvas: "WebCockpit phone makeover, round 2" (claude.ai artifact
`ApQTsLFSjCj6bSksiZJhcE`). Sources in `round2/`: `canvas/` (18
artboards), `brief.md`, `bree.png` (a real map of Bree, Shimrod Summer,
14 rooms across, made by `shot.ts`; the artboards load it as an uploaded
asset, `/_blob/…` in the kit).

Owner feedback on round 1, the base for round 2:

- The compass of A1 is the best movement control. Keys as small as a
  finger can still hit; the eye is look; Flee left of S (the old Flee
  could not be reached by the thumb).
- The map drawn in about the top third of the text background, fading in
  as the text fades out; the centre (your room) must read. Shimrod
  alternating, zoom and settings locked for the phone, about 6 to 7 rooms
  in each direction.
- A fight card at the top as in A1, only while fighting, HP against HP
  (yours or the tank's name against the enemy), as slim as possible.
- A chat icon top right unfolds Comm. A private message (the bubble
  kind) shows as a slim truncated card at the top; a tap on it or the
  icon unfolds Comm over the upper part (about the map's area). The
  compose field says only "type message", discreetly.
- The input row with the menu button and the simple settings (font
  size, black/paper) of A1/A4 are good.
- Other panes (Timers, Group, Character, Statistics): a strip pulled
  down from the top, 15 to 25 % of the height, one pane at a time, tabs.

| | Direction | What it tries |
|---|---|---|
| F | The brief as written | six screens |
| G | One shelf | Comm and the panes share one pull-down with tabs |
| H | The map | breathing (blooms when quiet), a round lens, hold the eye to peek |
| I | Thumb reach | Chat and Panes keys bottom left; content still shows at the top |

Next: the owner's reactions to round 2.
