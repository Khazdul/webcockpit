# Phone in-game makeover — shared mockup brief

You write static mockup artboards (phone screens, 390×844) for a design
canvas. Product: WebCockpit, a browser MUD client for the text game MUME.
The owner wants a full makeover of the phone layout **inside the game**.
Five directions (A–E) are mocked up in parallel; you build ONE direction.

## Hard rules

- Write only the files you are assigned, with the Write tool, into
  `/tmp/claude-1000/-home-ole-proj-webcockpit/0bc684e4-2427-4b7a-a2de-5044d203b7ad/scratchpad/canvas/project/`.
  Do NOT publish, do NOT call the Artifact tool, do NOT open a browser,
  render or screenshot, do NOT touch any other file or the repo.
- FIRST read the reference artboard `project/Main.dc.html` in that folder
  (screen A1). Copy its skeleton EXACTLY: doctype, `<head>` with the
  `<script src="./support.js"></script>` line, `<x-dc>`, `<helmet>` with the
  same font links and the WHOLE shared kit `<style>` block (you may append
  your own classes after it), one root `<div class="ph">`, and the closing
  `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>`
  block. Give each file its own `<title>`.
- Root is fixed 390×844 with `overflow:hidden`. Make sure the content
  fits: count your rows (game text is 19 px per line, about 41 characters
  per line; wrap by hand inside `<pre>`).
- Static markup only. No script-built UI, no `innerHTML`, no iframes, no
  images, no network except the Google Fonts link. Close every non-void
  element, quote every attribute. Escape `<`, `>`, `&` in text.
- Icons: inline stroke `<svg class="ico" aria-hidden="true">`, never emoji.
- Real `<button>` for everything tappable, `aria-label` on icon-only
  buttons. Touch targets at least 44 px. Text contrast at least 4.5:1
  (dim text no darker than #8a8a8a on black).
- No fake OS status bar, no browser bar. No rationale or annotation text
  inside the screen: only real UI copy, in English, short.
- No em dashes in UI copy.

## Look: "Lykta" (the lantern look), made for the thumb

The desktop client's panes look like lanterns: a dark **iron** band and a
centred **hood** with the pane title in Cinzel Bold, lit in a warm candle
colour ("lamp", #e8c48a); the pane body is a **window** with a faint lamp
glow from the top and a vignette; content sits on **frosted cards**
(lamp at low alpha with a lamp hairline). Game text is plain terminal
text on black, monospace, ANSI colours. The phone keeps exactly that
identity: game text is TUI; everything around it (navigation, sheets,
menus, buttons) is touch-sized Lykta surfaces. The kit classes in
Main.dc.html give you all of it: `.iron`, `.hood`, `.cz` (Cinzel lamp
text), `.win`, `.card`, `.key` (+ `.off`, `.flee`), `.bar` with `.hp .mn
.mv`, `.badge`, `.ico`, `.inrow`, `.field`, `.ib`, and the text colours
`.room .ex .cmd .hit .tell .yell .dim .wh`.

Palette: black #000, text #c6c6c6, bright #e8e8e8, dim #8a8a8a, lamp
#e8c48a, iron #2e2923 / hi #5a5148 / lo #0e0c0a, window base #0b0907,
unread badge #f0b84f on ink #170f03, HP green #45b862, mana blue #4a80e8,
move amber #d79a4a, danger #d75f5f. Channel colours in Comm: tell green
#5faf5f, narrate yellow #d7d75f, say cyan #5fd7d7, yell red #d75f5f,
group/song white. Restrained: no gradient washes beyond the kit's, no
left-border accent cards, no glassy blur everywhere.

## The Comm pane (already built on desktop; reuse its shape)

Comm is conversations: a column of chats and a thread. Pinned at the top
**Public** and **Group**, then private chats per person (coloured initial
in a round avatar, name, time, one-line snippet, unread count badge). The
thread shows messages oldest to newest, bottom-anchored; talk **to you**
is a bubble (frosted card, sender name in channel colour, time dim), your
own lines are right-aligned bubbles in a lighter lamp tint; public
channel lines are plain coloured rows with a short channel tag (Narr,
Yell, Say). On a narrow pane the chat column is an **icon rail** of
avatars with unread dots. A reply on the phone is typed in the normal
input row, which shows whom it goes to (a chip like `tell Gibur`).

## The shared moment (use the same content everywhere)

Character **Rasta** (level 25) in Bree, room **Hill Road** (exits north,
south, east; no west, up or down). Fighting a half-orc ruffian (wounded).
Vitals: HP 74 %, Mana 80 %, Move 90 %. Group: Rasta, Gibur 85/60/70,
Dori 41/–/55 (hurt), a citizen mercenary (NPC, MERC tag, 90 %).
Timers: Armour 12m, Bless 4m, Strength 9m, Sanctuary 1m (urgent, red
time), Blinds: Dori 24s. Game clock 3:40 pm, daytime. Link 38 ms.
Profile "default". A run is being recorded.
Comm: Gibur (tell, 2 unread, 14:02): "more coming, 2 trolls" and before
it "you at hill road?"; your reply earlier "yes, east of the gate".
Elanor (tell, 13:40): "thanks for the lembas". Group: Dori "bashed, hit
it now". Public: Narr Thalion "anyone seen the warg pack near Fornost?",
Yell *Throzghul* "kill them all" (in Orkish), Say a citizen mercenary
"Stand back, citizen."
Game text: use the lines from Main.dc.html (shorten from the top when
you have less room; the newest lines stay at the bottom).

In-game menu entries (replacing the old ESC popup): status line
"Rasta · default · Link 38 ms · Recording"; Reconnect; Statistics;
Profile; Settings (text size, theme, views, weather, input); Fullscreen;
Exit session. Keep these the same in every direction; only the
container differs.

## Light play

The phone is mostly for communication, but walking must not need the
keyboard: north, south, east, west, up, down, and **flee**. Keys for
directions that are not exits of the current room are dim (`.key.off`).
Each direction has its own movement control (see your assignment).

## Quality bar

Each screen should look finished: consistent 8 px rhythm, aligned edges,
real content, nothing clipped at the right edge or bottom. Prefer fewer,
well-made elements. When done, reply with one short paragraph per file
on what it shows and any design choice you made that the owner should
know about.
