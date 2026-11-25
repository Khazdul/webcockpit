# Character card: every hover text, with a proposal

Research note, 2026-11-25, for the owner's review.

**Decided 2026-11-25: all ok but T31 (kept as it is).** Built in ADR 0166
addendum 40.

**The principle** (the owner, 2026-11-25): "I don't want so much
irrelevant information when hovering. That it is a malus you understand
yourself from the stone being red. It is enough that it lists the
wounds." So a tooltip is a title and the one fact the player can't see
on the card. Out go: explanations of what the colour, icon, bar or
position already says, sources ("from the info poll"), kinds ("Debuff"),
and click hints where the click is obvious. Commit c6bb5697 (ADR 0166
addendum 39, point 241) already took the source and kind lines out of
the stones' tooltips. What is left of them is reviewed here too (T16–T31).

Answer per number: "ok", or the change you want.

**How the tooltips work** (`src/panes/pane-tooltip.ts`). Each tooltip
has a bold title (`data-tip-title`) and a body (`data-tip`). With
`setTip`, a tooltip whose body is empty does not show at all, so a
one-line tooltip has to be passed as the body with no title (the tabs do
this). A live tip (`setLiveTip`, used by the stones and the `+n`) can
show a title alone. A body that only repeats the title is left out. No
tooltip is an accessible name: nothing points `aria-describedby` at it.
Where the card has an accessible name, it is a separate `aria-label`
(icons, status cells, tabs), so removing the hover text removes no name.
Each row below says so where it matters.

**Where it applies.** The compact card and the phone strip use the same
DOM elements and the same tooltips. Two places differ:
- In the compact card the status cells show a letter plus a short form
  (`M aggr`), and the shields lose their labels in the chip forms. So
  the whole word (T2–T6) and the shield's name (T12–T15) are facts you
  can't see there.
- The ring and the tabs do not exist in the compact card.

On touch, a tap's `pointerdown` cancels the pending hover, so as far as
the code reads, tooltips do not show on a phone.

## Portrait and ring

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T1 | Level ring (`character-model.ts:236–252`, set at `character-dom.ts:186`) | Title `Level 34` (`Level unknown`). Body: `XP 62 % · 1 234 567 to 35` (without `· … to 35` when to-next is not known), or `XP unknown`; then `TP 40 %` or `TP done` when TP is known. Example: **Level 34** / `XP 62 % · 1 234 567 to 35` / `TP 40 %` | Keep the title and the XP and TP lines. Remove the `XP unknown` line (an empty ring already says it). | The exact percentage and the XP to the next level are not on the card. The title names what the ring's number is. |

The portrait, the disc and the name have no tooltip. Keep it that way.

## Status cells

Built in `statusView` (`character-model.ts:349–374`), with the click text
from `clickView` (`character-model.ts:265–270`), and set at
`character-dom.ts:306`. The accessible name `Mood: aggressive` etc. is
set separately (`setClick` at `character-dom.ts:194`, and `aria-label`
for Weight at `:304`). It stays whatever happens to the tooltip.

Today a clickable cell has **no tooltip at all** when there is no click:
in a replay or the log player, when the value is unknown, and in
berserk (not in the cycle). In those cases the compact card's short form
has no full word anywhere on hover.

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T2 | Mood cell | Title `Mood: aggressive`. Body `Click: change mood wimpy` (cycle wimpy→prudent→normal→brave→aggressive→wimpy, never berserk). No tooltip when there is no click. | Title `Mood: aggressive`, body `Click: wimpy`. Without a click (replay, berserk, unknown), one line `Mood: aggressive`. | The next step is the one fact you can't see. "change mood" is the command's wording, and it is noise. The whole word is needed where the cell shows `aggr`. |
| T3 | Casts cell | Title `Casts: normal`. Body `Click: change spellcasting careful` (quick→fast→normal→careful→thorough→quick). | Title `Casts: normal`, body `Click: careful`. Without a click, one line. | As T2. |
| T4 | Alertness cell | Title `Alertness: normal`. Body `Click: change alertness careful` (normal→careful→attentive→vigilant→paranoid→normal). | Title `Alertness: normal`, body `Click: careful`. Without a click, one line. | As T2. |
| T5 | Pending click (the status cells and the five icons, `character-model.ts:268`) | The body becomes `Waiting for the game.` for up to 3 s. | Remove the body. The title stays. | The dimmed value and the pending mark already show that it waits. |
| T6 | Weight cell (no click) | Title `Weight: heavy`. Body is MUME's sentence for the step (`LOAD_SENTENCES`, `character-model.ts:306–313`): peanuts `Peanuts.`, uncomfortable `A tad uncomfortable, but no problem.`, heavy `Heavy, but we will manage...`, really heavy `That is really heavy!`, painful `You are trying to forget the pain...`, torture `Every single move is sheer torture...`. For an unknown word the body is the word. Unknown weight: no tooltip. | One line, `Weight: heavy`. Drop the sentence. | The colour and the step meter say how bad it is. The sentence is flavour. The whole word is still needed for `rhvy`/`unc`. |

## Position icons (and the four toggles)

Built in `iconsView` (`character-model.ts:292–301`) and set at
`character-dom.ts:230`. The accessible name (`Sneak: on`, `Standing`)
comes from `setClick` (`character-dom.ts:194`) and stays. As with the
cells, today there is **no tooltip** wherever there is no click: in a
replay, while fighting, and while incapacitated, stunned, dying or of
unknown position.

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T7 | Sneak icon | Title `Sneak: on` / `Sneak: off`. Body `Click: sneak`. | One line, `Sneak`, always. | Lit or dim already says on or off. The click is an obvious toggle. The small icon needs its name. |
| T8 | Ride icon | Title `Ride: on` / `Ride: off`. Body `Click: lead` (on) / `Click: ride` (off). | One line, `Ride`, always. | As T7. Ride and lead are the toggle's two directions. If you find `lead` not obvious, keep `Click: lead` only while riding. |
| T9 | Climb icon | Title `Climb: on/off`. Body `Click: climb`. | One line, `Climb`. | As T7. |
| T10 | Swim icon | Title `Swim: on/off`. Body `Click: swim`. | One line, `Swim`. | As T7. |
| T11 | Position icon | Title: `Standing`, `Resting`, `Sitting`, `Sleeping`, `Incapacitated`, `Stunned`, `Dying`, `Position unknown`, or `Fighting` (red swords). Body `Click: rest` (standing), `Click: stand` (resting, sitting), `Click: wake` (sleeping). No tooltip when fighting, incapacitated, stunned, dying, unknown or in a replay. | Title the word, always (also `Fighting`, `Stunned`). Keep the body `Click: rest` / `Click: stand` / `Click: wake`. | Resting and sitting share an icon, and so do sleeping, incapacitated, stunned and dying. The click is **not** obvious (a click on standing makes you rest), so its hint stays. |

## Shields

Built in `shieldsView` (`character-model.ts:450–474`) and set at
`character-dom.ts:339`. These have no `aria-label`. Their visible value
and label are the accessible text, and the tooltip never was the name.

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T12 | OB shield | Title `OB 12` (before the poll: `OB`). Body `Offensive bonus` / `From the info poll (also while Status is shown).`, or before the first answer `Offensive bonus` / `Waiting for the info poll.` | One line, `Offensive bonus`. | The value is on the shield, `⋯` says it is waiting, and the source is noise. The full name is needed where the chips hide the label. |
| T13 | DB shield | Same pattern: `DB 8` / `Defensive bonus` / source or waiting line. | One line, `Defensive bonus`. | As T12. |
| T14 | PB shield | `PB 15` / `Parry bonus` / … | One line, `Parry bonus`. | As T12. |
| T15 | ABS shield | `ABS 20` / `Armour absorption` / … | One line, `Armour absorption`. | As T12. |

## Stones

Built in `stoneTip` (`character-stones.ts:305–318`, the texts at
`:57–64`, `:199`, `:250`) and set live at `character-dom.ts:447`. The
title is always the stone's name. Stones have no accessible name at all
(an icon in a span). The tooltip never was one, so this is a gap that
exists today, not one that changes.

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T16 | Every stone's title | The name, capitalised: `Bless`, `Poisoned`, `Wounded`, `Light wound(s)`, `Sanctuary`, the herblore's name. | Keep. | The icon alone doesn't say which affect it is. |
| T17 | Timed stone's time | `1:23 left (of 5:00).`, `45s left (of 2:00).`, or `1:23 left.` when the duration is not known. | Shorten to `1:23 left`. | The exact time is not on the stone. The bar already shows how much of the whole is left. |
| T18 | Stone with no end (tracked, full bar) | `No end time.` | Remove (title only). | The full bar says it. |
| T19 | Untimed stone (seen only in stat/info/poll) | Title only (the body went in c6bb5697). | Keep. | Already minimal. |
| T20 | Poisoned flag | `Loses HP over time.` | Remove (title only). | The red stone says it is a malus, and what poison does is known. |
| T21 | Blind flag (only when no Blindness debuff is timed) | `Cannot see.` | Remove. | As T20. |
| T22 | Snared flag | `Cannot leave the room.` | Remove. | As T20. |
| T23 | Wounded, with listed wounds | Title `Wounded`. Body: the wound lines, one per line, e.g. `Deep wound on your left arm` | Keep. | Your rule: it is enough that it lists the wounds. |
| T24 | Wounded, no list yet (GMCP flag only) | `Bleeding.` | Remove (title only). | The red stone says it. |
| T25 | Light wound(s) (dimmed stone) | Title `Light wound` / `Light wounds`. Body: the lines. | Keep. | As T23. |
| T26 | Hungry flag (only when no Hunger debuff is timed) | `Regenerates slower.` | Remove. | As T20. |
| T27 | Thirsty flag (as T26, Thirst) | `Regenerates slower.` | Remove. | As T20. |
| T28 | Sanctuary from the GMCP flag alone | `A white aura: half damage.` | Remove (title only). | The sanctuary stone's colour and icon say it. A cast sanctuary shows T17's time line. |
| T29 | Herblore stone, × hint | `Hover: × stops it.` | Remove. | The × appears on hover by itself (and on touch after a first tap). |
| T30 | Ending soon | `Ending soon (≤ 30 s).` (`timers.warnAt`) | Remove. | The stone's ending mark and the time line say it. |
| T31 | Herblore `+` (`character-dom.ts:459`) | Title `Herblores`. Body `Click: start a herblore.` | One line, `Start a herblore`. | A bare `+` is not self-explanatory, so this click hint stays. |
| T32 | `+n` badge (`character-dom.ts:464–472`) | Title `+3`. Body `3 more (no room). Click for the list:` and then one row per hidden stone, `Bless  3m`, `Armour  on`. | Body: the rows only (`Bless  3m` …). No title, no header line. | `+3` is on the badge, and "no room" is obvious. The names are the fact you can't see. The click opens the same list, so it needs no hint. |

## Vitals bars

Built in `hpTip` (`character-model.ts:416–433`) and set at
`character-dom.ts:791`. There is no `aria-label`; the visible label and
numbers are the text.

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T33 | HP bar, exact | Title `HP 120 / 158 · 76 %`. | Keep. | The percentage is not on the bar, and in the narrow forms neither is the max. |
| T34 | HP bar, band only | Title `HP`. Body `Only the band is known (50–75 %).`, or `(100 %)` when lo = hi. | Title `HP 50–75 %` (`HP 100 %`), no body. | The hatched span shows that it is a band. "Only … is known" explains the look. |
| T35 | HP bar, nothing known | Title `HP`. Body `Unknown.` | Remove the body. With no wimpy either, no tooltip. | The empty bar says it. |
| T36 | Wimpy, set | `Wimpy 30: you flee below the arrow.` | Shorten to `Wimpy 30`. | The arrow is on the bar. The number is the fact you can't see. |
| T37 | Wimpy 0 | `No wimpy.` | Remove. | No arrow says it. |
| T38 | Wimpy unknown | `Wimpy unknown.` | Remove. | Noise. |

The Mana and Moves bars have no tooltip. Proposal: keep none. (If you
want HP's `· 76 %` on them too, say so.)

## Purse

Built in `purseTip` (`character-stones.ts:465–471`) and set at
`character-dom.ts:529–530`. The coins themselves have no tooltip. The
coin colour says the metal.

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T39 | Purse, whole content | Title `Purse`. Line 1 `12 gold, 3 silver, 45 copper.` | Show a tooltip only when a coin is hidden, as one line, `12 gold, 3 silver, 45 copper`. When all three coins show, no tooltip. | With all three coins shown, nothing is hidden. |
| T40 | Purse, fit line | `Only the gold fits beside the stones.` / `Gold and silver fit beside the stones.` | Remove. | It explains the layout. |
| T41 | Purse, source line | `From the info poll.` | Remove. | A source line. |

## Tabs

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T42 | Tab as numeral I / II / III (`character-dom.ts:1051`) | One line: `Status` / `Stats` / `Lore`, only while the numerals show. The words form has no tooltip. | Keep. | A numeral doesn't say its name. The `aria-label` (`:933`) is separate and always set. |

## Stats

Built in `statsView` (`character-model.ts:509–523`) and set at
`character-dom.ts:668`. These are boxes with no `aria-label`.

| # | Element | Current text | Proposal | Reason |
|---|---|---|---|---|
| T43 | Ability box, title (STR, INT, WIS, DEX, CON, WIL, PER) | `STR 18` | Remove the title. | Both the label and the value are in the box. |
| T44 | Ability, unaffected line | `Unaffected 16` | Keep as the only line, and only when the delta is not 0: `Unaffected 16`. | The one value that is not on the card. |
| T45 | Ability, delta line | `+2 from affects` / `−1 from affects` | Remove. | The `+2` / `−1` is drawn in the box. |
| T46 | Ability, no delta | `No change from affects` | Remove (no tooltip). | No delta drawn already says it. |
| T47 | Ability, unknown | `Unknown.` | Remove (no tooltip). | `—` says it. |

Age (years, age name, `3rd at 64`, the track), the Modifiers table
(Points/Regen × HP/MANA/MOVES), and the senses (Vision, Hearing, Smell,
Carrying) have no tooltip. Proposal: keep none.

## Lore

Race, Alignment, Citizen, War fame, War points, Purse (gold, silver and
copper coins), Height, Weight and Birthday have no tooltip. Proposal:
keep none.

## Menus and other

None of these has a hover text today. Proposal: keep none.

- The data-age line (`info 12 s ago`, `12 s ago`, `fetch off`;
  `character-model.ts:585`) and the quiet text (`No data yet. It comes
  when the game is quiet.`, etc.).
- The herblore `+` menu (`timers.ts:266`, `HerbMenu`): its rows are
  `✓`/`+` and a name. The `aria-label` `Start Athelas` / `Athelas
  (running)` is a name only, not a hover text.
- The `+n` list (`character-dom.ts:541`, `StoneList`): icon, name, time.
  Its × has the `aria-label` `Stop Bless`, which is not a hover text.
- The herblore stone's × (`character-dom.ts:404–408`): the `aria-label`
  is `Stop this herblore`. Hovering it shows the stone's own tooltip
  (T16/T17).
