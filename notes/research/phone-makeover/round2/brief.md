# Phone in-game makeover, round 2 — shared mockup brief

You write static mockup artboards (phone screens, 390×844) for a design
canvas. Product: WebCockpit, a browser MUD client for the text game MUME.
Round 1 showed five directions; the owner then gave a concrete brief
(below). Round 2 has four directions (F to I); you build ONE.

## Hard rules

- Write only the files you are assigned, with the Write tool, into
  `/tmp/claude-1000/-home-ole-proj-webcockpit/0bc684e4-2427-4b7a-a2de-5044d203b7ad/scratchpad/canvas2/project/`.
  Do NOT publish, do NOT call the Artifact tool, do NOT open a browser,
  render or screenshot, do NOT touch any other file or the repo.
- FIRST read the reference artboard `project/Main.dc.html` there (screen
  F1). Copy its skeleton EXACTLY: doctype, `<head>` with the
  `<script src="./support.js"></script>` line, `<x-dc>`, `<helmet>` with the
  same font links and the WHOLE shared kit `<style>` block byte for byte
  (it holds the map image url; never write that url anywhere else, and
  never in an inline style), then your own classes appended after it, one
  root `<div class="ph">`, and the closing
  `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>`
  block. Give each file its own `<title>`.
- Root is fixed 390×844 with `overflow:hidden`. Count your rows so
  nothing is clipped: game text is 19 px per line, at most 41 characters
  per line, wrapped by hand inside `<pre>`.
- Static markup only. No script-built UI, no iframes, no `<img>`, no
  network except the Google Fonts link and the kit's map url. Close every
  non-void element, quote every attribute. Escape `<`, `>`, `&` in text.
- Icons: inline stroke `<svg class="ico" aria-hidden="true">`, never emoji.
- Real `<button>` for everything tappable, `aria-label` on icon-only
  buttons. Touch targets at least 44 px, EXCEPT the compass keys, which
  the owner wants as small as a thumb can still hit: 40 px (the kit's
  `.pad`). Text contrast at least 4.5:1 (dim text no darker than #8a8a8a).
- No fake OS status bar. No rationale or annotation text inside the
  screen: only real UI copy, in English, short. No em dashes in UI copy.
- When your own class sits on a `<button>`, it wins over the kit's reset
  (the reset is `:where(.ph) button`), so no `.ph` prefixes are needed.

## Look

"Lykta", the desktop client's lantern look, made for the thumb: dark
iron bands, a centred hood with the title in Cinzel (`.cz`), a lamp-lit
window (`.win`), frosted cards (`.card`), an opaque raised card
(`.solid`) for things that float over the map or text. Lamp colour
#e8c48a, black ground, monospace game text in ANSI colours. Restrained:
no gradient washes beyond the kit's, no left-border accent cards.

## The owner's brief (round 2). Everything here is fixed unless your
## assignment says you challenge it.

1. **Compass** (kit `.pad`, exactly as in Main): 3×3 grid of 40 px keys
   at the bottom right over the text. N top centre; W, eye (= look), E in
   the middle row; S bottom centre; Up top right; Down bottom right;
   **Flee bottom left (left of S)**, `.key.flee`, running-figure icon.
   Keys for directions that are not exits of the room are `.key.off`.
2. **Input row** (as in Main): menu button left, field, history right.
3. **Map behind the text, top third.** The kit's `.map` layer is a real
   map of Bree (Shimrod tiles, about 6 to 7 rooms in each direction, the
   player's room marked by a yellow square exactly in the centre of the
   layer; zoom and settings are locked on the phone). It sits at the top,
   330 px tall, and fades out downward. The game text runs over the whole
   screen; with `.gt.fade` its top lines fade out as the map fades in.
   It must feel as if the text has the whole surface. The middle of the
   map (the player's room) must stay clearly visible: never cover the
   centre of the map (x 150 to 240, y 120 to 210) with rest-state chrome.
4. **Fight card** at the very top, ONLY while fighting, as slim as it
   can be and still look good: HP against HP. Either your HP against the
   enemy, or, when someone else is tanking, the tank's NAME and HP
   against the enemy. Kit markup:

   ```html
   <div class="fight">
     <div class="l"><div class="n"><span class="wh">You</span><span>74%</span></div><span class="bar" style="display:block"><i class="hp" style="width:74%"></i></span></div>
     <div class="vs">vs</div>
     <div class="r"><div class="n"><span class="hit">wounded</span><span class="wh">a half-orc ruffian</span></div><span class="bar" style="display:block"><i class="foe" style="width:45%"></i></span></div>
   </div>
   ```
   (MUME gives the enemy's condition as a word, so the enemy bar is in
   steps: healthy 100, fine 85, hurt 65, wounded 45, bad 25, awful 10.)
5. **Chat key** top right (kit `.chatb`, with a `.badge` when unread): a
   shortcut that unfolds Comm.
6. **Private message card**: when a private message arrives (the kind
   Comm draws as a bubble: a tell, whisper or ask to you), a slim card
   drops in at the top: sender and message on one line, truncated with an
   ellipsis, discreet. Kit: `<button class="toast solid">` with `.av`
   (initial) and `.t`. Tapping the card or the chat key unfolds Comm.
7. **Comm unfolds over the upper part of the screen**, about the area
   the map uses (roughly the top 330 to 380 px), the game text and
   compass stay below. Comm is conversations: a rail of round avatars at
   the left (Public, Group, then people; selected has a lamp ring; unread
   dot), the thread at the right, bottom-anchored. Talk to you is a
   bubble (frosted card, sender in channel colour, dim time); your own
   lines are right-aligned bubbles in a lighter lamp tint; public lines
   are plain coloured rows with a short tag (Narr, Yell, Say). Comm has
   its OWN compose field at its bottom edge, with the discreet
   placeholder "Type a message" (dim, 13 px) and a small send key. No
   "tell Gibur" chip anywhere. The normal input row stays for commands.
8. **All other panes** (Timers, Group, Character, Statistics) live in a
   **strip pulled down from the top**, 15 to 25 % of the height (about
   130 to 210 px), one pane at a time, with tabs to switch between them.
   Pulled by the kit's `.pull` handle at the top centre; dragging sets
   the height. Comm is NOT in this strip.
9. **Menu**: a bottom sheet (iron top edge, "Menu" hood, grab handle,
   `.win` body): a status card "Rasta · default · Link 38 ms ·
   Recording" (red dot); rows Reconnect, Statistics, Profile, Settings,
   Fullscreen (56 px, icon left, chevron where it opens something); a
   quick row with text size (A−, 15, A+) and theme swatches Black and
   Paper; Exit session last in the danger colour (#d75f5f).

## Pane content for the strip (keep it compact, real, and the same)

- **Timers**: chips (small `.card` pills, icon + name + time) grouped by
  a tiny label: Spells: Armour 12m, Bless 4m, Strength 9m. Sanctuary:
  You 1m (time in red, urgent). Blinds: Dori 24s.
- **Group**: rows with name and three thin bars (HP, mana, move): Rasta
  74/80/90, Gibur 85/60/70, Dori 41/–/55 (HP bar red, "hurt"), a citizen
  mercenary (MERC tag) 90/–/–.
- **Character**: Rasta, level 25 Warrior, HP 148/200, Mana 64/80, Move
  126/140, position Fighting or Standing, TNL 41k.
- **Statistics**: four tiles (Avg/kill 2.1k, Median 1.8k, XP/h 38k,
  Kills 14) and the last kill "a grim outlaw 2.6k Great".

## The shared moments

- **Walking (rest)**: Main's text, in Bree on Hill Road (exits north,
  south, east; no west, up, down). No fight card.
- **Fighting**: Rasta against a half-orc ruffian (wounded). Use this
  text (newest at the bottom; drop lines from the top when short of
  room):

```
*=> kill ruffian
You attack a half-orc ruffian.
You slash a half-orc ruffian hard.              (.hit)

*= HP:Fine R:Fine>
A half-orc ruffian slashes you.
*Throzghul* yells loudly from the east          (.hit name, .yell rest)
'kill them all' in Orkish.                      (.yell)
A citizen mercenary (MERC) heroically
rescues Dori.
You cleave a half-orc ruffian extremely         (.hit)
hard.                                           (.hit)
A half-orc ruffian is stunned!
Dori narrates 'bashed, hit it now'              (.yell)
You slash a half-orc ruffian very hard.         (.hit)
A half-orc ruffian panics, and attempts
to flee.

*= HP:Fine R:Hurt>
A half-orc ruffian slashes Dori.                (.dim)
You pierce a half-orc ruffian hard.             (.hit)

*= HP:Fine R:Bad>
```
  Precede it with Main's walking text so the screen is full.
- **Comm content**: Gibur (tell, green #5faf5f, initial G): "you at
  hill road?" 14:01, then yours "yes, east of the gate" 14:01, then
  "more coming, 2 trolls, get to the gate and hold it with Dori" 14:02
  (unread; long on purpose so the top card truncates it). Elanor (tell,
  initial E, purple #af87d7): "thanks for the lembas" 13:40. Group: Dori
  "bashed, hit it now". Public: Narr Thalion "anyone seen the warg pack
  near Fornost?", Yell *Throzghul* "kill them all".

## Quality bar

Each screen should look finished: aligned edges, 8 px rhythm, real
content, nothing clipped at the right edge or bottom, nothing important
hidden under the compass (the last ~7 text lines are at most 26
characters wide where they pass the compass, or accept that the compass
covers line ends as in Main). When done, reply with one short paragraph
per file on what it shows and any design choice the owner should know.
