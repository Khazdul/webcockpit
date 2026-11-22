# Stage 77 — The Character pane as a card

This stage is not a spec §5 row. The owner asked for a new Character pane
(2026-11-21): the most important pane, with more data than one view holds,
so it has tabs, and it has to work small. Nine mockup rounds settled the
look and the data. This stage builds it. It replaces the drawing rules of
Inv §2.2. The data rules for XP/TP, the session anchors and the toggles
stay.

**Status: part A done** (2026-11-22: measured live with Rasta, the other
races parked, the open points decided, ADR 0166). **Part B done**
(on main, the owner looked). **Part C done** (on main, tested
live 2026-11-22). **Part D done** (on main 2026-11-22, the
owner looked; polish is a pass of its own, H below). **Part E built**
(2026-11-22, branch `stage-77e`: waiting for the owner's look). The wimpy point is decided (open points). Each part stops for the owner's
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
9. **Weight** is the GMCP word `Char.Vitals.carrying` (the six words:
   part A, "Live results"), shown as sent, so the lightest reads
   `peanuts` (owner, after part A). It has six steps, as MUME's encumbrance sentences
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

18. **Race** comes first (owner, after part A): a subrace that names the
    race stands alone, with the race's word in lower case ("Tarkhnarb
    orc", "Cave troll"), and so does Black Númenórean. Otherwise
    `subrace race` ("Dúnadan man"), and only the race when there is no
    subrace. Then
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
    | Casts | the next spell speed: `change spellcasting <next>` in the order quick → fast → normal → careful → thorough → quick (owner, after part A) |
    | Alertness | the next step, all of them: `change alertness <next>` (normal → careful → attentive → vigilant → paranoid → normal) |
    | Sneak, climb, swim | `sneak`, `climb`, `swim` (each toggles) |
    | Ride | `lead` when riding, otherwise `ride` |
    | Position | standing → `rest`; resting or sitting → `stand`; sleeping → `wake` |

    A click's command shows in the game pane exactly like a typed one
    (owner, after part A).

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
| HP/mana/moves, the band words | `Char.Vitals` `hp`/`hp-string`/`maxhp` and the like (the exact-or-band rule of Cockpit's ADR 0052, `src/gmcp/bands.ts`) |
| Mood, alertness, position, toggles | `Char.Vitals` |
| Casts | `Char.Vitals` `spell-effort` (seen: `"normal"`, `"thorough"`) |
| Weight step | `Char.Vitals` `carrying` (six words, part A) |
| Wimpy | **not in GMCP** (found in part B): `%y` of the poll (once at login, then with it), the lines `Wimpy set to: N` and `Wimpy removed.`, and 0 on berserk |
| Race, subrace | `Char.StatusVars` |
| Everything in Stats and Lore | the hidden `info` poll |

### MUME's encumbrance sentences (`info %F`, from the owner)

Light to heavy: `Peanuts.` · `A tad uncomfortable, but no problem.` ·
`Heavy, but we will manage...` · `That is really heavy!` ·
`You are trying to forget the pain...` ·
`Every single move is sheer torture...`

The word `carrying` sends for each step, and the line the game prints
when the step changes, are in part A, "Live results". `carrying` covers
every step, so the lines are not needed.

### Age (`help age`, from the owner)

Age brackets for Men (other) and Bears: 18 24 32 40 50 65 90. The other
races scale them by a factor: 1.5 for Dúnadan, Númenórean and Hobbit; 2.0
for Half-elf, Dwarf, Orc and Troll; 2.5 Silvan; 3.0 Sinda; 3.5 Noldo. The
modifiers per age (abilities, points, regeneration) are the table in the
owner's message of 2026-11-22. Copy it into the code as data with a
comment naming `help age`. The change between brackets is linear.

### The hidden info poll

- **Only Stats and Lore send commands**, with one exception (owner, after
  part B): one poll at login, for the wimpy (`%y`, a field of every poll).
  Status never does.
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
  10 s. Not while fighting, and not without a key or click from the
  player in the last 5 minutes (owner, after part A). The age of the data shows in a small line in
  the tab ("info 12 s ago").
- **Verified live (part A, "Live results"), and it changes the above:**
  the 2 s limit counts from the start sentinel, the sentinel is ASCII with
  a nonce, the fields are separated by ` | `, and the prompt and blank
  lines are hidden by the rules written there.

## Plan

Each part ends with a stop: the owner looks and says go before the next.

- [x] A. Live facts
- [x] B. The model (also: the fixtures' invented `light`, `passengerOf`'s
      bare Bear and "Half-elven")
- [x] C. The poll (tested live: "Live results, part C")
- [x] D. The card (tried live, the phone too)
- [x] E. Portraits (built; the owner's look pending)
- [ ] F. Group
- [ ] G. Tests (most came with A–D; left: Group without you, a last
      full run)
- [ ] H. Polish of the card (the owner's list first)

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
- ADR 0166 addendum 3 has the build's decisions. The tabs come with D, so
  C gives them the trigger to call, and a dev server only `#infopoll`
  for the live checks (D removes it).
- Live checks beside the three above: that the login poll is sent at a
  real login's first prompt, that a pager and the line editor get no poll,
  and what `%y` is with the wimpy removed.

### D. The card

- ADR 0166 addendum 6 has the build's decisions. `#infopoll` goes. The
  phone's settings page gets the poll's switch.

- `src/panes/character.ts` becomes DOM like Group/Timers (ADR 0122): left
  column, the three tabs, vitals, the fight mode, the two height modes and
  the automatic choice between them.
- Clicks send commands through `sendCommand` (no aliases, echoed like a
  typed command, ADR 0166) and mark the element
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

### H. Polish (the owner, after D; a pass of its own)

The owner looks closely and decides first. Named so far:

- the layout's details in general;
- how the pane behaves docked;
- the tab buttons at some sizes;
- a nicer MOOD / CASTS / ALERTNESS / WEIGHT;
- the phone: decided after D, Character is on and first in the strip
  (ADR 0166 point 47; done).

Decided: Stats and Lore keep their scroll (ADR 0166 point 46).

## Part A: findings

### Known before the live run (2026-11-22)

Where "Live results" below says otherwise, the live result holds.

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

Done with Rasta 2026-11-22, steps 1–6. The other characters of step 6 are
parked (the owner: a large job, to be completed when needed).

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

Rasta, a Tarkhnarb orc, level 74, 0.22.0's run log of 2026-11-22 11:58
(98 columns). Not committed.

**GMCP**

    Char.StatusVars {"fullname":"Rasta Fari","level":74,"name":"Rasta","next-level-tp":205300,"next-level-xp":85000000,"race":"Orc","subclass":"Champion","subrace":"Tarkhnarb Orc"}

`carrying`, all six steps, each seen with `info %C|%F` beside it:

| `carrying` | `info %F` | Line on the change | Pounds (Rasta) |
|---|---|---|---|
| `peanuts` | Peanuts. | Your load feels light. | 9 |
| `uncomfortable` | A tad uncomfortable, but no problem. | Your burden is slightly uncomfortable. | 17–63 |
| `heavy` | Heavy, but we will manage... | Your burden is heavy. | 71–140 |
| `really heavy` | That is really heavy! | Your burden is really heavy. | 148–198 |
| `painful` | You are trying to forget the pain... | Your burden is painful to carry. | 206–221 |
| `torture` | Every single move is sheer torture... | Your burden is sheer torture. | 229–260 |

- There is no `light`. The mockup and three fixtures (`gmcp-demo`,
  `runs-demo`, the weather test) made it up. Part B corrects the fixtures.
- A step can be jumped (peanuts → heavy in one `get`).
- `spell-effort`: `normal` and `thorough` seen; `quick` and `fast` are in
  the help; `careful` only in the menu. All equal the menu's words, so the
  menu's five are used and an unknown word is shown as sent.
- The menus of `change spellcasting`, `change alertness` and `change mood`
  have exactly the steps of decision 19.
- **GMCP sends the state once per pulse, and only if it changed.** Five
  changes in one pulse gave only the last value, and five ending on the
  start value gave no message. A click on a value already set therefore
  ends by the 3 s limit.
- `wake` gives `sitting`; a second click (`stand`) is needed to stand.

**The queue**

| Sent at once | Answered |
|---|---|
| five `look` | five pulses, 250 ms apart |
| five `info` | all in one pulse |
| four `look`, then `info` | `info` on the fifth pulse, after the looks |
| four `info`, then `look` | all five in one pulse |
| `info`, `buy`, `info` (35 times) | the first `info` and `buy` in one pulse, the last `info` a pulse later |
| `cast 'armour'`, then `info` | the spell completes, `info` a pulse after it |
| `info` while asleep | answered as usual |

- **`info` keeps its place in the queue but takes no slot.** It does not
  jump past anything, and it does not delay the command after it. The
  poll costs the player nothing.
- `change spellcasting/alertness/mood` take no slot either.
- It did not break the cast. It waited for it (1.9 s after sending). So a
  2 s limit from sending is wrong: wait for the start sentinel as long as
  it takes (one poll outstanding at a time), hide nothing meanwhile, and
  count the 2 s from the start sentinel.
- Not measured: `info` in a fight (the poll does not run there).

**The raw answer**

    WC1[74|81|13|85|70|16|16|16|11|12|16|8|Str:16 Int:16 Wis:16 Dex:11 Con:12 Wil:16
    Per:8|57|7|7|four feet eleven|eight stone and five pounds|ninety-seven pounds|Heavy, but we will
    manage...|You are totally corrupted by the Evilness of Morgoth!|GoblinTown|␛[32m380␛[0m gold coins,
    ␛[32m5␛[0m silver pennies, and ␛[32m49␛[0m copper pennies|warlord (19)|25|10|20]WC1

- **It wraps at the window's width** (97 of 98 columns) although
  `change width all 500` was accepted. The break replaces a space and the
  colour codes do not count. So the fields are separated by ` | `, the
  lines joined with a space, split at `|` and trimmed. A width narrower
  than one word is untested (part C, on a phone).
- The whole answer comes in one frame, with nothing interleaved. Other
  lines can stand before or after it in the same frame.
- An empty line follows it. When the answer was queued, an empty line
  also comes before it. **One prompt closes the whole pulse**, not each
  answer: five infos gave one prompt, and after `info` + `look` the
  prompt is the look's. Hide the prompt only when the answer was all the
  pulse showed.
- A partial line can be drawn before it completes, so the gag covers
  `text.partial` too.
- `‹wc›` came back intact, as UTF-8 was agreed. ASCII is still used, for
  a connection without it.
- Only `%r` is coloured (strip it). `%(…%)` adds colour, `%.` breaks the
  line, `%,` toggles separators and they are off by default, so `%,` is
  not needed.

**The fields' shapes**

| Field | Value | For the parser |
|---|---|---|
| `%O %D %k %A` | `81 13 85 70` | bare numbers, no `%` |
| `%S %i %w %d %o %I %p` | `16 16 16 11 12 16 8` | bare numbers |
| `%G` | `Str:16 Int:16 Wis:16 Dex:11 Con:12 Wil:16 Per:8` | one field, seven labelled values |
| `%b`, `%B` | `Str:14 Int:15 Wis:16 Dex:8 Con:10 Wil:16 Per:8` | not what the deltas use |
| `%a %N %n` | `57 7 7` | years, months, days |
| `%h`, `%W` | `four feet eleven`, `eight stone and five pounds` | number words |
| `%C` | `ninety-seven pounds`, `one hundred two pounds` | number words to `97 lb`; 35 samples in the run |
| `%c` | `GoblinTown` | shown as sent; how several are separated is unknown |
| `%K` | `warlord (19)` | word and war points |
| `%q`, `%r` | as in the sample | |
| `%v %H %s` | `25 10 20` | bare numbers |

No affect on an ability was active, so every delta was 0. The first run
with a strength spell checks decision 15 (part C).

**Races without logging in every character**

MUME writes a player's race in game text in the same form as `subrace`
(`You are a male Tarkhnarb Orc.` = `"Tarkhnarb Orc"`). The owner's
Cockpit logs show other players as Silvan Elf, Sindarin Elf, Noldorin
Elf, Half-Elf, Broadbeam Dwarf, Fallohide Hobbit, Hill Troll and Black
Númenórean. The help adds the names Dúnadan, Eriadorian, Rohirrim,
Beorning, Firebeard, Longbeard, Harfoot, Stoor, Cave Troll, Mountain
Troll, Morruhk and Zaugurz. That these are the GMCP strings is inferred
from the one confirmed case, so nothing matches a whole string:

- **Match on words and stems** over both fields. Note the adjective
  forms: the age factor must take Noldo and Noldorin, Sinda and Sindarin,
  Dúnadan and Dúnedain.
- **An unknown string** gets the neutral portrait, its own text as the
  race, and no age track or modifiers (never a guessed factor).
- `passengerOf` was run on 26 likely pairs: 24 right. A `Bear` with no
  subrace and the spelling `Half-elven` (war lists) fall to the goblin.
  Part B fixes both, which also fixes the balloons.
- **Completion needs no test:** every run log already has `StatusVars`.
  When the owner happens to play another race, its `#runlog` is enough.

## Part B: what was built

Tested 2026-11-22: typecheck; 5689 unit tests; full e2e at 5 workers 2026
passed, 52 skipped, 3 failed in Firefox (`import.spec.ts:148`,
`menu-sub-morph.spec.ts:73` and `:207`), all pass when run alone.

For the owner to look at: the table below (is any value wrong for
Rasta?), and that today's Character pane looks and updates as before.

`CharModel.view()` has the card's values; `src/gmcp/race.ts` (race line,
age factor), `src/gmcp/age.ts` (ages, modifiers, birthday) and
`src/gmcp/info-answer.ts` (the field list and the reader) are new, pure
modules. Decisions: ADR 0166's addendum (part B).

- A shared run's folding keeps exact or band.
- The balloons' passenger: a bare Bear and Half-elven no longer goblins.
- The present pane looks the same and still skips renders for values it
  does not draw.
- `runs-demo.gen.ts` no longer reproduces its fixture from today's
  sources (the default settings have moved on). It was regenerated with
  the sources of 8176e1ad, which reproduce it byte for byte.

Read from the owner's run log of part A (not committed) by the new model:

| | Read as |
|---|---|
| Race, age factor | Tarkhnarb orc, 2.0 |
| Weight | all six words on steps 0–5; 97 lb |
| OB, DB, PB, ABS | 81, 13, 85, 70 |
| Abilities | 16 16 16 11 12 16 8, every delta 0 |
| Age | 57, 2nd age, 3rd at 64, birthday in 5 months |
| Points, regeneration | +14 −1 +7, +1.4 +2.2 +2.4 |
| Height, weight | 4′11″, 8 st 5 lb |
| Purse, war fame | 380 5 49, warlord 19 |

The mana regeneration is +2.2, not the plan's +2.1: the plan counted 57
whole years, the card counts 57 years 7 months 7 days, as `help age`'s
"linear and gradual". The unit test keeps the plan's case at exactly 57.

## Part C: what was built

`src/gmcp/info-filter.ts` (takes the answer out before the bus),
`info-poll.ts` (when it is sent), `info-model.ts`, the Character gear's
switch and, on the dev server only, `#infopoll`. Part D calls
`ctx.openInfo()` when Stats or Lore shows and the returned function when
it hides, reads `ctx.game.info` (part `'info'` of `game.subscribe`), and
deletes `src/app/info-poll-command.ts` with its lines in `App.onCommand`.

Tested 2026-11-22: typecheck; 5785 unit tests; a throwaway random test of
the filter (200 000 streams, no game line lost or moved); full e2e at 5
workers 2036 passed, 52 skipped, 3 failed. `menu-sub-morph.spec.ts:174`
passed when run alone. `layout.spec.ts:71` (both browsers) was this part:
the Gear moves the title (ADR 0166 point 31). The test now checks that
rule, and it passes with the pane specs (82). **Nothing is tried against
MUME.**

### Live results, part C (Gittan, a Fallohide hobbit, level 45, 2026-11-22)

From the owner's scrollback and report:

| Check | Result |
|---|---|
| 1. Login poll | works: the first data had wimpy 204, nothing in the scrollback |
| 2. The values | equal to a typed `info`, a negative DB too; MUME takes the 160 characters |
| 3. Line editor | failed in the second try (`change editor line`): the poll was sent into the text at `: `. Fixed (ADR 0166 point 32); third try: gate closed at `: `, open and sent at the game prompt after `%q` |
| 4. Pager | not sent ("the last output is not a game prompt") |
| 5. `change wimpy 33%` | `Wimpy set to: 68`, hit points (10%: 21; 500 gave 205, the max). `change wimpy 0` prints `Wimpy set to: 0`, and `%y` is then 0 |
| 6. Strength | str 12, unaffected 10, delta 2, as `info`'s `Str:12(10)` |
| 7. Phone | ok (the owner) |
| 8. Off | "the setting is off", the wimpy unknown |
| 9. Run log | clean: the 18:47 log has the login poll's and one `#infopoll`'s session and no command, sentinel or field of either |

- **The line editor still matters before D.** `write <title>` at a board
  printed only a prompt and the game went on. That fits `change editor
  mume` on this character (stage 23's known state; inferred, no GMCP from
  that session seen). MUME's default is `line` (`help change editor`),
  whose prompt is `:` and which reads every line sent (`help editor`,
  `%q` cancels). Those players would get D's 5 minute poll into their
  text if that prompt is an XML prompt. So it is tested with `change
  editor line`, and does not wait for stage 23.
- `StatusVars`: `"race":"Hobbit"`, `"subrace":"Fallohide"`, the second
  real pair: the subrace does not always hold the race. The model reads
  Fallohide hobbit, factor 1.5, the hobbit passenger.
- `%c` with several: `Bree Shire Fornost GreyHavens Rivendell`, separated
  by spaces, the names without spaces. D shows them as a list.
- `%q` is not always "You are …": `You must have been sent to Arda to
  free it from the sorrows that weigh upon it`, kept whole. D must fit a
  sentence that long (decision 18's shortening).
- DB follows the position (-31 resting, 19 standing), so Stats can be
  stale by up to the poll's interval.

Decided by the owner: a switch also on the phone's settings page (built
in D), and the moved title is fine (ADR 0166 point 31). Point 33 is
answered by point 34.
Until part D, a release from main would send the login poll and show a
switch that names tabs which do not exist yet.

## Part D: what was built

`src/panes/character-model.ts` (what is drawn), `character-layout.ts`
(how big; both pure), `character-dom.ts`, `character.css`, `character.ts`
(when). The gear has Height (Auto, Large, Medium), the phone's settings
page the poll's switch, and `#infopoll` is gone. ADR 0166 addendum 7 has
what was decided while building.

- For E: `neutralFigure()` in `character-dom.ts`, in `.wc-cc-disc`
  (60 × 75, clipped to the circle).
- For F: nothing is exported. "Shown" is the Character shell's `visible`
  (the phone's strip too), which Group cannot read today.

Tested 2026-11-22: typecheck; 5879 unit; a production build; the
screenshots beside round 9. Full e2e at 5 workers: 2066 passed, 52 skipped, 2 failed in Firefox (`group-pane:49`, `profile-place:444`); both files pass when run alone. Nothing is tried against MUME, on a
real phone or in Safari.

Known: at today's default height (9 rows) Stats and Lore scroll, with
`↓ more`. They fit at the mockup's own heights. The owner chose the
scroll.

## Part E: what was built

`raceKind` (`src/gmcp/race.ts`) is the one classifier, used by
`passengerOf` (unchanged results) and by `portraitOf`
(`src/panes/portrait.ts`). The nine figures and the neutral one are in
`src/panes/portrait-figures.ts`. `public/portraits/README.md` holds the
image contract. ADR 0166 addendum 10 records the decisions. There are no
raster files yet, so nothing is requested, and the replay runtime never
requests one. Dev only: `?portrait=<id or race words>`.

Tested 2026-11-22: typecheck; 5890 unit; a production build (no image
bundled; a test `orc.webp` was clipped and shown, then removed); the
two Character e2e files (29 passed). The full e2e run is not done.

## Open points

Decided by the owner 2026-11-22, after part B: **wimpy** is not in GMCP,
so `%y` joins the poll and the poll is sent once at login, also with no
tab open (the exception to "Only Stats and Lore send commands"). After
that the value follows:

- `Wimpy set to: N` and `Wimpy removed.` (the client's rules since
  before). In the Cockpit logs: 54 such lines, and no case where `stat`
  or `info` showed a change that had no such line.
- A mood that becomes berserk sets it to 0 (`help mood`; not seen live).
- Each poll after that.

To check live in part C: what `change wimpy 33%` prints. The rule reads
the line's number as hit points.

Decided by the owner 2026-11-22, all five as suggested, and written into
decisions 9, 18 and 19 and the poll's rules: the Casts cycle, the click's
echo, no poll while idle, the race line, `peanuts`.

Parked:

- `race`/`subrace` of the other races (completed from run logs as they
  come; the rules above work without them).
- Compact mode.

## Test guide (for the owner)

### Part E, portraits (the test server, no MUME needed)

Open `http://localhost:5173/?fixture=gmcp-demo.log&speed=0`. The demo's
Dúnadan man has the **human** portrait. Add `&portrait=` with one of
`human`, `elf`, `halfelf`, `dwarf`, `hobbit`, `beorning`, `orc`,
`troll`, `numenorean` or `neutral` (race words work too:
`&portrait=Cave%20Troll`) to see each of them.

1. Each of the nine in the Large card. Then the gear's Height → Medium.
2. The same with Paper (Appearance → background paper).
3. A phone: `&phone=1` with a portrait, then the panes key.
4. Live, if MUME is up: your own character's race gives its portrait.

Wanted: are the placeholders fine until your images come? Does the
framing in `public/portraits/README.md` suit what you will draw (head
centre about (512, 480), about 300–340 px wide, shoulders cut by the
circle, the ring over the bottom centre)?


### Part D, the card (the test server, MUME up)

1. Log in and reload once: Status, the ring, the icons and the bars are
   right. Hover the ring and HP.
2. STATS, then LORE: values within some seconds, no `info` in the game.
3. Click Mood, Casts, Alertness and each icon: the command echoes, `⋯`,
   then the new value. Mood never goes to berserk.
4. The line editor: `change editor line`, then `write test` at a board.
   At the `: ` prompt click Mood: nothing is sent. Then `%q`, and the
   click works again.
5. A fight from Stats: Status, red swords, bands as hatched spans. After
   it Stats is back.
6. Resize, float, Paper, and Height in the gear.
7. A phone: the panes key opens on Character (first and on by default
   since point 47). The tabs and icons can be hit, and the poll's switch
   is under Panes in the settings.

Wanted: is it round 9? And at 9 rows, is scrolling Stats and Lore fine,
or should the default pane be taller?

### Part C, live (done; `#infopoll` is gone since part D)

`#infopoll` sends a poll if it may (else says why) and prints the last
answer: type it again for the new one. At most one poll in 10 s.

1. Log in. Within some seconds the pane's WIMPY shows your value, and no
   `info` or answer shows in the game.
2. `#infopoll` twice: the values are right, failures 0.
3. The line editor, in a note you will throw away: start it, type nothing,
   wait 3 s, `#infopoll`. It must say not sent. Again after somebody's
   text has arrived in it, if that happens. If it says sent: stop and
   tell, part D must not be built on it.
4. The pager (a long help): wait 3 s, `#infopoll`. It must say not sent.
5. `change wimpy 33%`: what does MUME print, and does WIMPY show hit
   points? Then remove the wimpy, `#infopoll` twice: what is `wimpy`?
6. A strength spell on, `#infopoll` twice: str has the delta.
7. A phone, upright: `#infopoll` twice. Failures 0, nothing of the answer
   in the game.
8. The gear's switch off, log in again: `#infopoll` says the setting is
   off, WIMPY is empty until a wimpy line.
9. `#runlog`: no `info WC` in the file. Hand it over (it is not
   committed).

## Owner feedback

- 2026-11-22, part B, the demo fixture on the test server: "Provade och
  den ser ut som tidigare. Kör på" (B approved, C's go). MUME was down,
  so berserk's wimpy 0 is not seen live.
- 2026-11-22, part C live: 1, 2, 4–8 work. On 3: "Jag tror itne
  rededitorn fungerar riktigt", perhaps not important until remote
  editing is picked up (answered above: it is, for `change editor
  line`).
- 2026-11-22, after C: "Okej på allt. Kör på" (the phone switch, the
  moved title, D's go).
- 2026-11-22, part D live: 1–3 and 5 ok. 4 was not understood (the guide
  did not say how to get into the editor; now it does). 6: "Allting
  verkar fungera som vi tänkt och det ser snyggt ut. Jag kommer dock
  vilja finputsa många olika detaljer" (part H). 7: not tested, as
  Character was not among the strip's panes (off by default; the guide
  did not say so). "Scroll känns rätt." The pass is rounded off and the
  stage goes on in a new one.
- 2026-11-22, after D: 4 tried, "Det fungerar som önskat (mood skickade
  inget)". 7: "jag slog på character och det såg bra ut i telefonen och
  fungerade bra. Ändra gärna så att default är att chracter pane öppnas
  först när man fäller ner panes + att character pane är på som default"
  (done, ADR 0166 point 47). "Vi kör vidare enligt planen och tar E
  härnäst i ett nytt pass."
