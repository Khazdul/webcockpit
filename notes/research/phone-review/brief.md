# WebCockpit phone review — shared mockup brief

You are building static mockup artboards for a design canvas. WebCockpit is a
browser MUD client for MUME (repo /home/ole/proj/webcockpit, read-only for you).
Today's phone UI: screenshots in
`notes/research/phone-review/shots/` (a subset; `tour/` regenerates all 58)
(look at 01, 25, 26, 27, 28, 29, 30, 33, 36, 39, 49 at least, and index.md).
These show the visual identity: black background, monospace (Hack) cell grid,
amber selected tab, teal pixel wordmark "MUME COCKPIT", ANSI colours.

The owner wants a phone-first redesign. **Desktop must not change at all**:
everything here is phone-only (gated by a phone flag). Mockups are in English
(the UI language); keep copy short and real.

## Hard rules for every artboard

- One file per artboard: `<root>/project/<Name>.dc.html`, root =
  `notes/research/phone-review` (sources now in `canvas/`)
  Write each with the Write tool. Do NOT call the Artifact tool, do NOT
  publish, do NOT open a browser or render. Do not touch the repo.
- Format (Design Component). Exact skeleton:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>A03 Game, companion</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
body{margin:0}
/* page basics and shared classes here */
</style>
</helmet>
<div style="width: 390px; height: 844px; ...">
  ... markup ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
renderVals() { return {}; }
}
</script>
</body>
</html>
```

  - Keep `<script src="./support.js"></script>` EXACTLY. Close every
    non-void element, quote every attribute.
  - Root is FIXED size: portrait phone 390×844, landscape phone 844×390,
    tablet 1180×820. Put `overflow:hidden` on the root.
  - `{{hole}}` lookups only if you use renderVals; static markup is fine and
    preferred. No `innerHTML`, no script-built UI, no global key handlers,
    no iframes, no network except the Google Fonts `<link>` in `<helmet>`.
  - Icons: inline stroke `<svg aria-hidden="true">`, never emoji. Box-drawing
    and arrow characters in text are fine (it is a TUI client).
  - Accessible as drawn: real `<button>` for buttons, `<input>` + `<label>`
    for fields, `aria-label` on icon-only buttons. Text contrast ≥ 4.5:1.
  - Touch targets ≥ 44 px tall (this is a main point of the redesign).
  - No fake OS status bar (no clock/battery row). The browser address bar is
    not drawn either; assume fullscreen/installed or ignore it.
  - No rationale text inside artboards: the screen is the screen. Only real
    UI copy. (Annotations go elsewhere.)
- Game text font: JetBrains Mono (stand-in for Hack), 15px, line-height
  18px, so ~42 columns across 390 px like the real phone. Text is real MUME
  text, wrapped by hand at ≤ 42 chars per line in portrait (use
  `white-space: pre` blocks).

## Palette (dark default, "black" background)

bg #000000, text #c6c6c6, dim #8a8a8a, faint #4a4a4a, frame #3a3a3a,
accent (selected tab, cursor) #ffaf00, teal (wordmark) #00c8c8,
ANSI: red #d75f5f, green #5faf5f, yellow #d7d75f, blue #5f87d7,
magenta #af5faf, cyan #00afaf, white #e8e8e8, prompt `*=>` in text colour,
echoed command in #87afd7.
Hybrid/native surface panel: #121416, raised #1b1e21, border #2a2e33.
Bars: HP #d75f5f, Mana #5f87d7, Move #5faf5f, empty part #262626.
Paper theme (one artboard per direction may show it): bg #f4ecd8,
text #2b2b2b, panel #ebe1c8.

## The shared moment (use the same content everywhere)

Character **Rasta** (level 25), in Bree. Last room **Hill Road**. Mid-fight
with a half-orc ruffian. Group: Rasta (you) HP 74% Mana 80% Move 90%,
Gibur 85/60/70, Dori 41/–/55 (hurt), a citizen mercenary (NPC, 90%).
Opponent: half-orc ruffian, Wounded. Game clock 3:40, daytime ☼.
Link 38 ms. Profile "default". A run is being recorded.
Timers: armour 12m, bless 4m, strength 9m, sanctuary 1m (blinking/urgent),
"blind: Dori 0:24" (debuff).

Game text sample (portrait, ≤42 cols):

```
Hill Road
The white gravelled road bordered with
white stone blocks flows naturally
though Bree-hill, slightly narrowing
where it intersects with an entrance to
a large grassy park to the east.
Exits: north, south, east.

*=> kill ruffian
You attack a half-orc ruffian.
You slash a half-orc ruffian hard.        (red)

*= HP:Fine R:Fine>
A half-orc ruffian slashes you.
Gibur tells you 'more coming, 2 trolls'   (green)
*Throzghul* yells loudly from the east    (red name)
'kill them all' in Orkish.
A citizen mercenary (MERC) heroically
rescues Dori.
You cleave a half-orc ruffian extremely   (red)
hard.

*= HP:Hurt R:Wounded>
```

Comm messages (newest last): Gibur narrates 'orcs gathering at the ford';
Gibur tells you 'meet me at the Pony, bring the merc'; Dori says 'I can smell
them'; Ecthel asks 'anyone near Rivendell?'; Lindir sings 'A Elbereth
Gilthoniel'; Gibur tells you 'more coming, 2 trolls'; *Throzghul* yells 'kill
them all'. Channel colours: narrates yellow, tells green, says cyan, yells
magenta/red, asks cyan, sings dim. Channels: Narrates, Tells, Says, Yells,
Prayers, Emotes, Whispers, Questions, Songs, Socials.

Saved characters on the launcher: **Rasta** (last played 2 h ago, password
remembered) and **Gittan** (yesterday, name only).

Command history: `kill ruffian`, `n`, `look`, `tell gibur on my way`,
`rescue dori`, `flee`.

Quick buttons (default set, derived from the profile's numpad macros:
Numpad8 north, 2 south, 4 west, 6 east, 9 up, 3 down, 5 exits, 0 flee,
+ open exit, − close exit): N S E W U D, Flee, Look/Exits, Open, Close, plus
user ones: `rescue dori`, `score`, `bash`.

## The proposal (same features in every direction; directions differ in look and navigation)

Ambition levels: **L1 Companion** (read, chat, check status/map, type
commands) and **L2 Light play** (L1 plus touch buttons: direction pad,
quick buttons, history chips, so you can walk and do simple things without
the keyboard). Full play is out of scope.

1. **Launcher (start page).** Smaller wordmark at the top. Character cards
   (Rasta, Gittan) each with a big Play button → connects and logs in with
   the saved name (and password if remembered). "+ Add character". Secondary
   entries: History, Spotlights, Profile, Scripts, About (Credits merged
   into About). No keyboard footer hints (`↑↓ Navigate` is gone). Update
   notice / storage warning as a small banner when present.
2. **Add character / quick login.** Fields: Character name, Password,
   checkbox "Remember password on this device" with the warning "Stored
   unencrypted in this browser.", Profile (default), [Save & play]. A
   "Play without saving" link (plain connect, MUME asks as today).
3. **Game, L1.** Game text gets nearly all the space. Navigation to the
   views GAME, COMM, STATUS, MAP (STATUS = CHAR + GRP + TIME combined).
   Unread badge on COMM (e.g. 3). Input row at the bottom with a big menu
   button (≥ 44 px). When scrolled back: a "↓ 12 new lines" pill that jumps
   to the bottom.
4. **Game, L2.** As L1 plus: a one-line status strip (HP/Mana/Move bars and
   "ruffian: Wounded"), a quick-button bar (N S E W U D, Flee, … more), and a
   way to show a full direction pad. A tell arriving while on GAME shows a
   small toast "Gibur: more coming, 2 trolls" with Reply.
5. **Keyboard up.** The on-screen keyboard takes ~45 % (draw a plain grey
   block labelled nothing, ~300 px tall, keys suggested by a faint grid, at
   the bottom). The nav bar hides; the status strip stays (L2); a chip row
   right above the keyboard: history chips (`kill ruffian`, `n`, `look`,
   `rescue dori`) + a history button ↑ + an autosuggest chip if typing.
6. **COMM.** Channel filter chips (tap toggles; long-press solo, show one
   chip as solo), message list, tapping a message shows actions "Reply →
   tell Gibur", "Copy". Input prefilled `tell gibur ` after Reply.
7. **STATUS.** Combined: character (name, level, HP/Mana/Move with numbers,
   mood, alertness, sneak/ride/climb/swim state shown clearly ON/OFF),
   group with labelled bars and numbers, timers list with remaining time.
8. **MAP.** Map view (draw a simple tile map: rooms as small squares joined
   by lines, the player room highlighted, room name "Hill Road" header),
   zoom +/−, re-centre; L2: direction pad overlay at bottom right.
9. **In-game menu.** Header: "Rasta · Link 38 ms · Recording". Items:
   Statistics (run in progress), Quick buttons & profile, Settings,
   Fullscreen (Android only), About, Disconnect, Exit session (rating stars
   on exit: 5 stars, big targets). No "Continue" row (closing = back).
10. **Settings (phone subset).** Text size stepper (− 14 +) with a live
    preview line; Theme swatches (Black, Slate, Teal, Sepia, Paper, more…);
    Font (Hack ▸ picker); Views/tabs (toggle + drag-reorder: COMM, STATUS,
    MAP, script panes); Communication channels (chips); Group NPCs
    (Off / Labeled / All); Timers groups shown (Spells, Buffs, Debuffs,
    Stored, Blinds, Charmies); Map: tileset, room notes; Weather effects
    (one switch); Input: auto-clear, autosuggest; Phone: Keep screen on
    while connected, Reconnect automatically, Vibrate on tell. Last line,
    dim: "Pane colours, borders, palette, cursor and layout are set on a
    computer."
11. **Disconnected / auto-reconnect.** On return from the background with a
    dead link: banner "Connection lost in the background — reconnecting…"
    with Cancel; then "Logged in as Rasta" and the game continues. If it
    fails: a clear "Reconnect" button over the game.
12. **Quick buttons & profile.** Edit the quick buttons (label → command,
    reorder, add, delete), "Import from profile macros" and pick the active
    profile. Profile editing depth differs per direction (see your brief).
13. **Landscape (844×390).** Game text left (~60 %), a side view right
    (COMM or STATUS selectable), input under the game. L2: compact pad.

What is removed on the phone (do not show these): pane tint/border grid,
ANSI palette editor, padding, input colour, cursor style/blink, bold
brightens, scrollback setting, reset layout, map import / background colour /
hover size, keyboard footers, Credits as its own page, macro key capture,
export editor, backup/restore, script editor.
