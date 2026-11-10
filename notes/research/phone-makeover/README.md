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

## Round 3 (2026-11-10)

Canvas: "WebCockpit phone makeover, round 3" (claude.ai artifact
`VQB7oi7qi7TcXhjyqHm8Em`). Sources in `round3/`: `canvas/` (10
artboards), `brief.md` (holds the settled layout). The map image is
`round2/bree.png`, uploaded to this canvas as its own asset.

Owner feedback on round 2, now the settled layout:

- The fight card sits right UNDER the top pane strip and follows it down
  when the strip is pulled.
- Panes in the strip change by a sideways swipe (from I): no tabs.
- The map is a round lens (from H3) with a glossy glass shine, like a
  watch face or compass. A tap steps three fixed zoom levels (very near,
  middle, far out).
- No incoming message cards on the screen: they cover the game. The chat
  icon (top right, as in F) only gets an unread indicator. Comm opens
  under the fight card; its lower edge is dragged to resize it.
- Compass: U and D as letters, F for flee. It starts at the bottom edge;
  the command field is narrower to make room. The history key at the
  bottom right is removed (risk of hitting it by mistake).
- Menu: Reconnect, Profile, Scripts, Settings, text size, Black/Paper.
  Statistics is a pane in the strip, not a menu row. Settings holds a
  small selection, not everything from the desktop.

Round 3 shows the lens in five looks (iron porthole, brass compass,
watch dial, seeing stone, corner dial) and the remaining states (strip
pulled, Comm open, far zoom, menu, settings). Kept by Claude's choice,
for the owner to confirm: Exit session in the menu.

## Round 4 (2026-11-10)

Canvas: "WebCockpit phone makeover, round 4" (claude.ai artifact
`62assXw69FZVhw9fU8dGks`). Sources in `round4/`: `canvas/` (8
artboards), `brief.md` (the settled layout plus the corrections).

Owner feedback on round 3:

- Lens 1 (iron porthole) is the best. Wanted: five variations of it with
  more glass-lens effect and a very subtle texture on the ring so it
  pops.
- The lens disappears when it would collide with something and returns
  when there is room.
- Exit session stays in the menu.
- No pull-down strip at the top (it costs screen). Three keys on the
  lens instead: top left opens the pane strip, top right toggles
  fullscreen, bottom right is Comm with the unread count.
- Up to three round, see-through hot keys K1, K2, K3 above the compass,
  each can be switched off and rebound. Defaults: assist, bash, and
  "change wimpy to 50 % of current HP" (a special: needs a script on
  GMCP vitals). A key left of N folds them in and out. Holding one opens
  a box to rebind it.
- During the round: the fight card shows names and bars only (no
  condition word, no percent); the hot keys stand in one column along
  the right edge with K1 at the bottom.

Round 4 shows the porthole in five variations (cast, hammered, turned,
knurled with a brass hairline, lamp-lit patina) and three states (strip
open, hold K3 to rebind, Comm tall with the lens hidden).

Next: the owner picks a lens variation; then a stage file and an intent
Goal 12 amendment (light play).
