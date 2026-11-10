# Phone in-game makeover, round 4 — shared mockup brief

You write static mockup artboards (phone screens, 390×844) for a design
canvas. Product: WebCockpit, a browser MUD client for the text game MUME.
The owner has settled the layout; `project/Main.dc.html` shows it.

## Hard rules

- Write only the files you are assigned into
  `/tmp/claude-1000/-home-ole-proj-webcockpit/0bc684e4-2427-4b7a-a2de-5044d203b7ad/scratchpad/canvas4/project/`.
  Do NOT publish, do NOT call the Artifact tool, do NOT open a browser,
  render or screenshot, do NOT touch any other file or the repo.
- FIRST read `project/Main.dc.html` there. Copy its skeleton EXACTLY:
  doctype, `<head>` with the `<script src="./support.js"></script>` line,
  `<x-dc>`, `<helmet>` with the same font links and the WHOLE shared kit
  `<style>` block byte for byte (it holds the map image url; never write
  that url anywhere else, never in an inline style), then your own
  classes appended after it, one root `<div class="ph">`, and the closing
  `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>`
  block. Give each file its own `<title>`. You may write a file with
  placeholders and fill the shared blocks from Main with a script kept
  OUTSIDE `project/`, to guarantee the byte-for-byte copy.
- Root is fixed 390×844 with `overflow:hidden`. Count rows so nothing is
  clipped: game text is 19 px per line, at most 41 characters per line,
  wrapped by hand inside `<pre>`.
- Static markup only. No script-built UI, no iframes, no `<img>`, no
  network except the Google Fonts link and the kit's map url. Inline
  `<svg>` (also with `<filter>` such as feTurbulence for a grain) is
  allowed. Close every non-void element, quote every attribute. Escape
  `<`, `>`, `&` in text.
- Icons: inline stroke `<svg class="ico" aria-hidden="true">`, never emoji.
- Real `<button>` for everything tappable (never a button inside a
  button), `aria-label` on icon-only buttons. Text contrast at least
  4.5:1 (dim no darker than #8a8a8a on black).
- No fake OS status bar. No rationale or annotation text inside the
  screen: only real UI copy, in English, short. No em dashes in UI copy.

## Look

"Lykta", the desktop client's lantern look: dark iron, lamp colour
#e8c48a, a lamp-lit window (`.win`), frosted cards (`.card`), Cinzel for
titles (`.cz`), black ground, monospace game text in ANSI colours.

## The settled layout (as in Main)

- **No strip or handle at the top.** The fight card (`.fight`) is the
  first thing, only while fighting.
- **Map lens** top right: `.lw` (150 px box) holds the lens button
  (`.map`, `.glass`, `.ring`, `.pips`; a tap steps near / middle / far
  zoom) and three satellite keys on its corners (`.sat`): top left
  **panes** (opens the pane strip), top right **fullscreen**, bottom
  right **Comm** with the unread count. `.sat.on` is the active state.
- **The lens hides** (with its three keys) whenever something would
  collide with it, and returns when there is room.
- **Pane strip**: opened by the lens's panes key. A strip from the top
  edge, 15 to 25 % of the height, ONE pane at a time (Timers, Group,
  Character, Statistics); a sideways swipe changes pane; page dots, no
  tabs. The fight card sits directly UNDER the strip.
- **Comm** opens under the fight card from the Comm key; its lower edge
  is dragged to resize; own compose field "Type a message". No incoming
  message cards anywhere: unread shows only as the badge.
- **Hot keys** (`.hot` with three `.hk`): K1, K2, K3, round and
  see-through, right above the compass in its columns. A tap sends the
  bound command; holding one opens a small box to change it. Defaults:
  K1 `assist`, K2 `bash`, K3 "wimpy at half of current HP" (a special: it
  reads current HP from the game data when pressed and sends
  `change wimpy <half>`; with HP 148 it sends `change wimpy 74`). Each
  can be switched off. The key left of N (`.key.tog`) folds the hot keys
  away or brings them back.
- **Compass** (`.pad`) from the bottom edge: N, W, eye (= look), E, S,
  U, D, F (flee). Non-exits are `.key.off`.
- **Command row** (`.inrow`): menu key far left, narrow field, nothing
  at the right.
- Text must not run under the lens group or the keys: beside the lens
  group lines are at most 22 characters; beside the hot keys and compass
  (the last 7 lines) at most 26.

## Shared content

Rasta (level 25 Warrior, HP 148/200) in Bree, Hill Road (exits north,
south, east), fighting a half-orc ruffian (wounded). Use Main's game
text verbatim unless your screen has fewer rows (drop from the top).

- **Timers**: chips (small `.card` pills) under tiny labels. Spells:
  Armour 12m, Bless 4m, Strength 9m. Sanctuary: You 1m (red). Blinds:
  Dori 24s.
- **Comm**: avatar rail at the left (Public, Group, then people;
  selected has a lamp ring), thread at the right, bottom-anchored. Talk
  to you is a bubble (frosted card, sender in channel colour, dim time),
  yours right-aligned in a lighter lamp tint. Gibur (tell, green
  #5faf5f, initial G): "you at hill road?" 14:01; yours "yes, east of
  the gate" 14:01; "more coming, 2 trolls, hold the gate with Dori"
  14:02. Elanor (E, purple #af87d7).

## Quality bar

Finished-looking, aligned, 8 px rhythm, nothing clipped. When done,
reply with one short paragraph per file on what it shows and any design
choice the owner should know.

## Owner corrections during round 4 (they win over the text above)

- Fight card: names and bars only. "You" (or the tank's name) and the
  enemy's name; no percent, no condition word.
- Hot keys: one vertical column along the right edge above the compass,
  K1 at the bottom (nearest the thumb), K3 at the top.
