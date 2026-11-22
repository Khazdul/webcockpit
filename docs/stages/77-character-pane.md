# Stage 77 — The Character pane as a card

This stage is not a spec §5 row. The owner asked for a new Character pane
(2026-11-21): the most important pane, with more data than one view holds,
so it has tabs, and it has to work small. Nine mockup rounds settled the
look and the data. This stage builds it. It replaces the drawing rules of
Inv §2.2. The data rules for XP/TP, the session anchors and the toggles
stay.

**Status: part A under way** (2026-11-22: desk findings written, the
owner's live run and decisions awaited). Each part stops for the owner's
go before the next (owner, 2026-11-22). The owner approved writing the stage from round 9
(2026-11-22, "Ja"). Nothing is built yet.

## What is approved (the source to build from)

The mockup `notes/research/character-pane-mockups/round9.html` is the
reference for the look. It is published at
<https://claude.ai/artifact/ASRXVDkPhvSGYPh88drf9n>. Earlier rounds
(`round1.html` … `round8.html` beside it) show the paths not taken. The
mockup is a test page with inline scripts. Port the look and do not link
the page.

## The owner's decisions (2026-11-21 … 22)

### Layout

1. **Lykta pane, the quiet card (B3).** No gold ornament and no runes. The
   frame follows the pane's border setting like every pane.
2. **A fixed left column that never changes with the tab.** From the top:
   - the **name**, centred above the portrait, in small Cinzel;
   - a **round portrait with a border** (an iron ring);
   - the **level ring** at the bottom centre of the portrait;
   - under it, **five small icons with no text**: sneak, ride, climb, swim
     and the position.

   The race is not written here, because the portrait shows it.
3. **The level ring.** The number sits in the centre. The XP ring is
   outside it: dark gold up to the session start, bright gold for the part
   gained this session. The TP ring is a thin one inside. Hovering the ring
   gives the tooltip `Level 73 / XP 41 % · 210 591 to 74 / TP done`. "To
   level" appears nowhere else.
4. **Tabs as vertical text on the right edge**: STATUS, STATS, LORE.
5. **Vitals at the bottom, across the full width**: HP, MANA and MOVES side
   by side, larger than in Group, and in the same three columns as Group's
   bars. They are always visible and never behind a tab.
6. **The content fills the pane.** The left column spreads name, portrait
   and icons over the height. The right area grows so that no empty band is
   left under either side.
7. **Two height modes now: Large and Medium.** Large has the big portrait
   and Medium a small one. Below Medium the portrait is hidden, and the
   ring and icons stay. The mode follows the pane's size automatically and
   can be locked in the gear. Status never scrolls. **Compact is parked**
   (owner: wait until everything else is in place). The idea on record:
   Stats and Lore open as a box *over* the panes below and never resize the
   pane, so the docked layout never changes.

### Status (GMCP only, no commands)

8. **Mood, Casts, Alertness and Weight**: four values with no boxes, thin
   dividers between them, a small label with an icon, and a large value.
   A value that does not fit is shortened (`aggressive` → `aggres.` →
   `agg.`).
9. **Weight** is the GMCP word `Char.Vitals.carrying` (seen in Cockpit
   logs: `"light"`). It has six steps, as MUME's encumbrance sentences
   (below). The two highest are red and the third highest orange. The full
   sentence is in the tooltip. The number of pounds is never shown: the
   step is relative to the character's stats.
10. **No** wimpy field (the wimpy shows on the HP bar), no Load sentence,
    no affects (they belong in Timers), and no OB/DB/PB/ABS (they are in
    Stats).

### Vitals

11. **"In the bar"**: the label on the left inside the bar, `187 / 270` on
    the right. The number shows **only when the bar's last update was a
    number**. When only the band word is known (`hp-string` and the like,
    in a fight), the bar shows the band as a hatched span and only the
    label. **No band words are ever written.**
12. **Wimpy** is a small arrow under the HP bar at `wimpy / maxhp`. The HP
    tooltip says what it is.
13. **The fight mode**: when an opponent appears, the card switches to
    Status, the other tabs dim (they can still be clicked), the bars grow a
    little, and the position icon becomes the crossed swords in red. After
    the fight the card goes back to the tab you had. The portrait does
    **not** turn red.

### Stats (info poll)

14. **Shields first**: OB, DB, PB and ABS, each in a shield outline with
    its icon. Then the **seven abilities**. Then **Age** and the
    **senses**. Stats is the tallest tab.
15. **Ability deltas**: current is `info %S %i %w %d %o %I %p`, unaffected
    is `info %G`. The difference is shown under the value (`+2` in green,
    `−1` in red). This is the only correct way to compute it (owner).
16. **Age**: the years, which age you are in (`2nd age`), when the next
    starts (`3rd at 64`), a seven-step track, and a modifiers table:

    ```
    MODIFIERS  HP    MANA  MOVES
    POINTS     +14   −1    +7
    REGEN      +1.4  +2.1  +2.4
    ```

    The values are interpolated linearly between the age brackets of
    `help age`, using the race's factor (see "Age" below). Ancient and
    aging get no special marking.
17. **Senses and more**: vision, hearing, smell (`%v %H %s`) and carrying in
    pounds (`%C`).

### Lore (info poll)

18. **Race** comes first: `subrace race` in lower case, for example
    "Tarkhnarb orc", and only the race when there is no subrace. Then
    **Alignment** on a full row (the value from `%q` without "You are … !",
    shortened only if it must be), Citizen, War fame, Purse (gold, silver,
    copper), Height, Weight and Birthday ("in 5 months"). No playtime and
    no session time.

### Clicks (only these)

19. Every click sends a command. **The card shows the new value only when
    GMCP reports it.** Until then the field or icon is dimmed with `⋯`.

    | Element | Click sends |
    |---|---|
    | Mood | the next mood: `change mood <next>` in the order wimpy → prudent → normal → brave → aggressive → wimpy. **Never berserk.** |
    | Casts | the next spell speed: `change spell <next>` (steps and command to be confirmed, see open points) |
    | Alertness | the next step, all of them: `change alertness <next>` (normal → careful → attentive → vigilant → paranoid → normal) |
    | Sneak, climb, swim | `sneak`, `climb`, `swim` (each toggles) |
    | Ride | `lead` when riding, otherwise `ride` |
    | Position | standing → `rest`; resting or sitting → `stand`; sleeping → `wake` |

### Icons (chosen in round 3)

20. Sneak 1 (footprints), Ride 5 (rider), Climb 4 (ladder), Swim 2 (swim
    stroke), Standing 1 (stick figure), OB 1 (sword), DB 3 (feather), PB 2
    (parrying blade), ABS 2 (armour). The paths are in `round9.html`
    (`I = {…}`). Weight has its own icon (a weight). The other positions
    reuse `icons.ts`.

### Group

21. **You are not shown in Group while the Character pane is visible**
    (the owner, round 6). This is a Group option, on by default: "Show
    yourself: always | not when Character is shown".

### Portraits

22. **One portrait per race to begin with.** Placeholders now: the nine
    crude SVG figures of the mockup, with transparent backgrounds. The
    owner generates high-resolution images later. The image contract is
    written like the balloons' (WebP, square, transparent, shown in a
    circle), in `public/portraits/README.md`. The race is matched as for
    the balloon passengers (`passenger.ts`: words, case-insensitively, over
    race and subrace, fallback to a neutral figure).

## Data

### Where each value comes from

| Value | Source |
|---|---|
| Name, level, XP, TP | GMCP `Char.Name`, `Char.Vitals`, `Char.StatusVars` (as today) |
| HP/mana/moves, the band words | `Char.Vitals` `hp`/`hp-string`/`maxhp` and the like (the exact-or-band rule of ADR 0052) |
| Mood, alertness, position, toggles | `Char.Vitals` |
| Casts | `Char.Vitals` `spell-effort` (seen: `"normal"`) |
| Weight step | `Char.Vitals` `carrying` (seen: `"light"`) |
| Wimpy | `Char.Vitals` and the text lines (as today) |
| Race, subrace | `Char.StatusVars` |
| Everything in Stats and Lore | the hidden `info` poll |

### MUME's encumbrance sentences (`info %F`, from the owner)

Light to heavy: `Peanuts.` · `A tad uncomfortable, but no problem.` ·
`Heavy, but we will manage...` · `That is really heavy!` ·
`You are trying to forget the pain...` ·
`Every single move is sheer torture...`

The words that `carrying` sends for each step are not known yet (see open
points). Lines the game prints when the step changes (owner): `Your load
feels light.`, `Your burden is heavy.`, `Your burden is really heavy.`,
`Your burden is no longer all that heavy.`, `Your burden is painful to
carry.` They are not needed while `carrying` covers the step. Keep them on
record in case it does not.

### Age (`help age`, from the owner)

Age brackets for Men (other) and Bears: 18 24 32 40 50 65 90. The other
races scale them by a factor: 1.5 for Dúnadan, Númenórean and Hobbit; 2.0
for Half-elf, Dwarf, Orc and Troll; 2.5 Silvan; 3.0 Sinda; 3.5 Noldo. The
modifiers per age (abilities, points, regeneration) are the table in the
owner's message of 2026-11-22. Copy it into the code as data with a
comment naming `help age`. The change between brackets is linear.

### The hidden info poll

- **Only Stats and Lore send commands.** Status never does.
- **One command with sentinels**, so the answer can be found and hidden:
  `info ‹wc‹%l|%O|%D|%k|%A|%S|%i|%w|%d|%o|%I|%p|%G|%a|%N|%n|%h|%W|%C|%F|%q|%c|%r|%K|%v|%H|%s›wc›`
  (the final field list follows the tabs). Everything from the start
  sentinel to the end sentinel is removed from the game pane, the
  scrollback and the run log, together with the prompt directly after it.
  If the end sentinel does not come within 2 s, hiding stops, so real game
  text is never eaten. The command is not echoed and not in the input
  history. When the player types `info` themselves, the answer shows as
  usual (it has no sentinels).
- **When:** on opening Stats or Lore if the data is older than 30 s, then
  every 5 minutes while one of them is open. Never more often than every
  10 s. Not while fighting. The age of the data shows in a small line in
  the tab ("info 12 s ago").
- **To verify live before building the gag:** that `info` bypasses MUME's
  250 ms command queue (the owner's understanding), how the answer wraps
  across lines, and whether the thousand separators need `%,`.

## Plan

Record the technical decisions in **ADR 0166** (the card, the poll, the
click-to-command rule) and in an addendum to ADR 0122 (Group's "show
yourself").

### A. Live facts first (main session, with the owner's character)

Log `Char.Vitals` and `Char.StatusVars` for a while: the `carrying` words
and how many steps they have, `spell-effort`'s words, `race`/`subrace` for
the owner's characters. Send one sentinel `info` by hand and look at the
raw answer. Write the findings into this file before parts C–D.

### B. The model

- `CharModel.view()` gains mood, alertness, spell effort, carrying step,
  position, race and subrace, and per vital whether the last update was a
  number (for the "number only when exact" rule).
- A pure `age.ts`: race factor, the brackets, the interpolated modifiers.
  Unit tests against the table (Rasta: orc, 57 → 2nd age, HP +14, MANA −1,
  MOVES +7, regen +1.4 / +2.1 / +2.4).
- A pure parser for the poll's answer (fields between `|`), with the
  height and weight words, the money and the alignment sentence. Tested on
  the owner's sample output.

### C. The poll

- A small module that sends the sentinel command, hides the answer
  (display pipeline gag, with the 2 s limit) and fills an `InfoModel`.
- Triggered by the tabs as above. Off switch in the gear ("Fetch Stats and
  Lore from the game"), on by default.

### D. The card

- `src/panes/character.ts` becomes DOM like Group/Timers (ADR 0122): left
  column, the three tabs, vitals, the fight mode, the two height modes and
  the automatic choice between them.
- Clicks send commands through the normal send path (shown in the game
  pane like a typed command, or not? see open points) and mark the element
  pending until GMCP reports a change, or 3 s pass.
- Tooltips only on the level ring, HP (exact or span, and wimpy), the
  abilities (current, unaffected, delta), the weight (the sentence), and
  the clickable fields (what a click sends).
- Paper (light) counterpart as for the other Lykta panes.

### E. Portraits

- Nine placeholder SVGs from the mockup. A per-race lookup reusing the
  passenger matching. The README with the image contract for the owner.

### F. Group

- The "show yourself" option. Hidden by default while a Character pane is
  shown in the layout.

### G. Tests

- Unit: age, the poll parser, exact-or-band, the click → command table
  (never berserk), the mood/alertness cycles, ride → lead.
- e2e: the card from a GMCP fixture; tabs; the fight mode; a click sends
  the command and the value changes only after the fixture's GMCP; the
  poll's answer is hidden from the game pane; Group without you.

## Part A: findings

### Known before the live run (2026-11-22)

Sources: MUME's help on mume.org, the owner's Cockpit run logs
(`/home/ole/MUME/data/runs`, text only, no GMCP in them) and this
repository's code.

**Spell speed** (`help change_spellcasting`, `help cast`):

- The command is `change spellcasting <speed>`. Without an argument it
  shows a menu. The five speeds: quick, fast, normal, careful, thorough.
- `help gmcp_char` gives `spell-effort` as `"quick"`, `"fast"`, etc.
  `help effort` uses other forms (quickly, normally, …), so the GMCP
  words for all five are to be seen live.

**`carrying`:** `help gmcp_char` says only "string describing how heavy
load you are carrying". Text lines seen in the logs: `Your load feels
light.`, `Your burden is heavy.`, `Your burden is really heavy.`,
`Your burden is sheer torture.` (not in the list above), `Your burden is
no longer all that heavy.`

**Race:** the help's example is `"race": "Troll", "subrace": "Cave
Troll"`. The subrace can hold the race, so decision 18's `subrace race`
would write "cave troll troll". The rule waits for the live strings.

**`info`** (`help info_format` and the logs):

- `%.` is a new line, `%%` a percent sign, `%,` toggles the separators,
  `%(` and `%)` colour. `%m` is the spell speed.
- Numbers come with ANSI colour in plain `info`.
- `%K` answers a word and a number (`known (5)`).
- `%b` is one field with seven labelled values (`Str:14 Int:15 Wis:16
  Dex:8 Con:10 Wil:16 Per:8`). `%G` is probably shaped the same, so the
  parser cannot expect one number per field.
- An answer is followed by an empty line and then the prompt.
- Other lines can come between the command and the answer (seen: an
  arrival, a say), so the answer is not simply the next line.

**The 250 ms queue:**

- Commands sent together are answered one per pulse, about 250 ms apart
  (the bursts inspected in the logs).
- `info` is **not answered at once**: nearly all of the 29 logged
  answers came on the same 250 ms grid as other commands, 40–285 ms
  after sending when nothing was in the way.
- Whether it **takes a slot** in the queue cannot be seen in the logs
  (it was never sent in a burst). The live run measures it.

**Conflicts with the plan, found in the code:**

- The sentinel `‹wc›` is not Latin-1. Without UTF-8 it is sent as
  `?wc?`. An ASCII sentinel is needed, with a nonce per poll so that
  nobody can fake one in a say or tell.
- A display gag does not keep the poll out of the run log: the recorder
  takes `text.line` before the pipeline, and `cmd.sent` also with
  `echo: false`. Part C needs its own mark on both.
- There is no dimmed echo for client-sent commands. Comm's reply field
  echoes like a typed command, and `echo: false` shows nothing.
- `sendCommand` does not expand aliases. Clicks should use it, since the
  Khazdul profile has aliases named `sleep`, `normal` and `quick`.
- A poll every 5 minutes is a game command from an idle player and may
  defeat MUME's idle timeout (unlike `Core.Ping`). The owner decides.

### The live run (the owner)

The run log (`#runlog`) has every GMCP message, every sent command and
every line with colours and a microsecond time stamp. XML tags are not
in it (the assembler takes them out before capture, as before a gag).
Logs hold tells: never commit one.

All lines below pass the script engine unchanged with an empty profile,
the template and Khazdul. Wait for the answers between lines.

1. A safe room, standing, not fighting, a caster:

       info
       info WC1[%l|%O|%D|%k|%A|%S|%i|%w|%d|%o|%I|%p|%G|%a|%N|%n|%h|%W|%C|%F|%q|%c|%r|%K|%v|%H|%s]WC1
       info ‹wc‹%l|%F›wc›
       info WC3[%B][%b][%G][%S %i %w %d %o %I %p]WC3
       info WC4[%x|%,%x|%,%x|%g|%(%l%)|%m|%R|%Y|%y]WC4
       info WC5[first%.second]WC5
       info WC6[%q|%q|%q|%q|%q|%q|%q|%q|%q|%q|%q|%q]WC6

2. The queue (the cast shows whether `info` waits for or breaks a spell):

       look;look;look;look;look
       info WC-A1;info WC-A2;info WC-A3;info WC-A4;info WC-A5
       look;look;look;look;info WC-B
       info WC-C1;info WC-C2;info WC-C3;info WC-C4;look
       cast 'armour';info WC-D

3. Asleep:

       sle
       info WC-E[%l|%F]
       wake
       stand

4. The steps behind the three clickable fields, then back to the
   player's own values:

       change spellcasting
       change spellcasting quick;change spellcasting fast;change spellcasting normal;change spellcasting careful;change spellcasting thorough
       change alertness
       change alertness careful;change alertness attentive;change alertness vigilant;change alertness paranoid;change alertness normal
       change mood
       change mood prudent;change mood normal;change mood brave;change mood aggressive;change mood wimpy

5. The weight: from as light as is safe to as heavy as possible and
   down again. At the start and after each change of step:

       info WC-W[%C|%F]

6. `#runlog`. Then for each other character: log in and send

       info
       info WC-R[%M|%c|%q|%h|%W|%r|%K]
       #runlog

### Live results

*Awaiting the owner's run logs.*

## Open points

- The `carrying` words and the number of steps (A).
- Spell speed: command and steps are known (part A). The owner confirms
  the click's cycle (suggestion: quick → fast → normal → careful →
  thorough → quick). The GMCP words are seen in the live run.
- `race`/`subrace` strings beyond Man/Dunadan, Elf/Noldo and Tarkhnarb orc.
- Whether a click's command shows in the game pane like a typed one
  (suggestion, revised in part A: yes, exactly like a typed one, as
  Comm's reply does. A dimmed echo does not exist today).
- Whether the poll goes on while the player is idle (suggestion: no poll
  without a key or click from the player in the last 5 minutes).
- Whether `info` takes a queue slot or disturbs a cast (A). If it does,
  the poll's rules are decided again before part C.
- The race line when the subrace holds the race ("Cave Troll").
- Compact mode (parked).

## Test guide (for the owner)

*To be written when the stage is built.*

## Owner feedback

*None yet.*
