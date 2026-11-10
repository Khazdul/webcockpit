# Phone in-game makeover, round 3 — shared mockup brief

You write static mockup artboards (phone screens, 390×844) for a design
canvas. Product: WebCockpit, a browser MUD client for the text game MUME.
The owner has settled the layout; round 3 varies the look of the map
lens and shows the remaining states.

## Hard rules

- Write only the files you are assigned into
  `/tmp/claude-1000/-home-ole-proj-webcockpit/0bc684e4-2427-4b7a-a2de-5044d203b7ad/scratchpad/canvas3/project/`.
  Do NOT publish, do NOT call the Artifact tool, do NOT open a browser,
  render or screenshot, do NOT touch any other file or the repo.
- FIRST read the reference artboard `project/Main.dc.html` there. Copy
  its skeleton EXACTLY: doctype, `<head>` with the
  `<script src="./support.js"></script>` line, `<x-dc>`, `<helmet>` with the
  same font links and the WHOLE shared kit `<style>` block byte for byte
  (it holds the map image url; never write that url anywhere else, never
  in an inline style), then your own classes appended after it, one root
  `<div class="ph">`, and the closing
  `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>`
  block. Give each file its own `<title>`. (You may write a file with
  placeholders and fill the shared blocks from Main with a script in the
  scratchpad, to guarantee the byte-for-byte copy.)
- Root is fixed 390×844 with `overflow:hidden`. Count rows so nothing is
  clipped: game text is 19 px per line, at most 41 characters per line,
  wrapped by hand inside `<pre>`.
- Static markup only. No script-built UI, no iframes, no `<img>`, no
  network except the Google Fonts link and the kit's map url. Close every
  non-void element, quote every attribute. Escape `<`, `>`, `&` in text.
- Icons: inline stroke `<svg class="ico" aria-hidden="true">`, never emoji.
- Real `<button>` for everything tappable, `aria-label` on icon-only
  buttons. Touch targets at least 44 px, except the compass keys (40 px,
  the owner's wish). Text contrast at least 4.5:1 (dim no darker than
  #8a8a8a on black).
- No fake OS status bar. No rationale or annotation text inside the
  screen: only real UI copy, in English, short. No em dashes in UI copy.
- A class of your own on a `<button>` wins over the kit's reset.

## Look

"Lykta", the desktop client's lantern look, made for the thumb: dark
iron bands, a centred hood with a title in Cinzel (`.cz`), a lamp-lit
window (`.win`), frosted cards (`.card`). Lamp colour #e8c48a, black
ground, monospace game text in ANSI colours. Restrained.

## The settled layout (Main shows it; do not change it unless told)

Top to bottom:

1. **Pane strip.** Closed it is the kit's `.lip`, a thin iron lip with a
   grab line across the top edge. Pulled down it is a strip 15 to 25 % of
   the height showing ONE pane (Timers, Group, Character, Statistics);
   a sideways swipe changes pane; small page dots, NO tabs.
2. **Fight card** (kit `.fight`), only while fighting, directly UNDER the
   strip. When the strip is pulled down the fight card moves down with it
   and stays right under it.
3. **Comm** opens under the fight card when the chat key is tapped. Its
   lower edge can be dragged to resize it. It has its own compose field
   with the discreet placeholder "Type a message".
4. **Game text**, full strength everywhere.
5. **Map lens**: a round window on the map (kit `.lens` button holding
   `.map` and `.glass`), top right under the fight card, with a glossy
   glass shine so it reads as a watch face or compass. A tap steps
   between three fixed zoom levels: near (`.map.near`), middle (`.map`),
   far (`.map.far`); `.pips` shows which. The player's room (a yellow
   square in the image) is always the centre.
6. **Chat key** (`.chatb`) top right, on the lens rim. Unread messages
   show only as a count badge on it. There are NO incoming message cards
   on the screen.
7. **Compass** (`.pad`) in the bottom right corner, starting at the
   bottom edge: N, W, eye (= look), E, S, and the letters U, D, and F
   (flee, `.key.flee`, left of S). Keys that are not exits are `.key.off`.
8. **Command row** (`.inrow`): menu key at the far left, a narrower
   field, nothing at the right (the corner belongs to the compass).

Text must not run under the lens or the compass: the lines beside the
lens are at most 24 characters, the last 4 lines at most 26 (as in Main).

## Shared content

Character Rasta (level 25 Warrior) in Bree, Hill Road (exits north,
south, east). Fighting a half-orc ruffian (wounded). Use Main's game
text verbatim unless your screen needs fewer lines (drop from the top,
keep the newest at the bottom; if the lens moves, keep the lines beside
it short).

- **Timers**: chips (small `.card` pills) under tiny labels. Spells:
  Armour 12m, Bless 4m, Strength 9m. Sanctuary: You 1m (red, urgent).
  Blinds: Dori 24s.
- **Group**: rows with name and three thin bars (HP, mana, move): Rasta
  74/80/90, Gibur 85/60/70, Dori 41/–/55 (red HP, "hurt"), a citizen
  mercenary (MERC tag) 90/–/–.
- **Character**: Rasta, level 25 Warrior, HP 148/200, Mana 64/80, Move
  126/140, Fighting, TNL 41k.
- **Statistics**: four tiles (Avg/kill 2.1k, Median 1.8k, XP/h 38k,
  Kills 14) and the last kill "a grim outlaw 2.6k Great".
- **Comm**: a rail of round avatars at the left (Public, Group, then
  people; selected has a lamp ring; unread dot), the thread at the
  right, bottom-anchored. Talk to you is a bubble (frosted card, sender
  in channel colour, dim time), your own lines right-aligned in a
  lighter lamp tint. Gibur (tell, green #5faf5f, initial G): "you at
  hill road?" 14:01; yours "yes, east of the gate" 14:01; "more coming,
  2 trolls, hold the gate with Dori" 14:02. Elanor (initial E, purple
  #af87d7). Group: Dori "bashed, hit it now".

## Quality bar

Each screen should look finished: aligned edges, 8 px rhythm, real
content, nothing clipped. When done, reply with one short paragraph per
file on what it shows and any design choice the owner should know.
