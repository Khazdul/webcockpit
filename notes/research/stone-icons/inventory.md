# Stone inventory (stage 77 H8)

Every buff, debuff, herblore, flag and sanctuary the Character card's
stones can show (ADR 0166 points 128–131), from the app's own game data
and from every MUME session at hand. Input for the icon mockup
`round1.html` in this folder. 2026-11-24.

## Sources

| Source | What | Used for |
|---|---|---|
| `src/timers/data/affects.ts` | 47 affects: 12 spell, 19 buff, 16 debuff (Inv §2.6.5) | what the app recognises |
| `src/timers/data/herblores.ts` | 6 herblores, 16 phases (Inv §2.6.10) | the `+` menu |
| `src/panes/character-stones.ts` | `STONE_FLAGS`, `FLAG_TWIN` | flags, sanctuary |
| `~/Downloads/*.log` (7), `*.html` (≈55 MUME logs), `mume-*.txt` (9) | the owner's sessions, Gittan and Rasta | lines, `stat`/`info` |
| `~/Downloads/webcockpit-runs-*.jsonl.gz` (6 exports, 82 runs after dedup by run id and chunk) | the app's run store, full text | lines, `stat`/`info` |
| `/home/ole/MUME/data/runs/*/*.log` (12) | Cockpit's run logs (Rasta, Gittan, Melker) | lines, `stat`/`info` |
| `/home/ole/MUME/data/characters/*/affects_*.json` | what Cockpit tracked per character (Globur, Svin, Rasta, Gittan) | proof an affect happened |
| `~/Downloads/herblore.txt`, `misc.txt` | a player-written herblore and item guide | herblores and potions not in the app |
| `tests/fixtures/timers-demo.log` | the app's demo log | only table affects; nothing new |

The corpus is 161 files, ≈393 000 lines. 46 files hold `stat`
(`Affected by:`) or `info` (`You are subjected to the following temporary
effects:`) blocks.

**How to read the counts.** "Lines" is how often the exact line occurs,
"files" in how many corpus files. The same session can be in an HTML log,
a run export and a Cockpit run, so the counts are upper bounds, not
events. `stat` counts are block lines (one per `stat`/`info` typed).

Legend for **App**: ✔ in the app's table (a stone today, with the group
icon); ✘ not in the table (the reconcile ignores the name, no stone);
◐ partly (a name or a line is missing).

## Buffs

| Stone (as MUME prints it) | App | Start line | End line | Seen (lines/files) |
|---|---|---|---|---|
| comfortable | ✔ | `You feel comfortable.` | `You no longer feel comfortable.` | start 256/22, end 247/21; `stat` 17 files |
| very comfortable | ✔ | `You're starting to feel very comfortable.` | `You no longer feel very comfortable.` | 8/6, 9/7; `stat` 1 file |
| Orkish draught | ✔ | `The draught burns down your throat, …` | `As the warmth of the draught recedes …` | 16/5, 7/4; `stat` 4 files (Rasta) |
| shadow-link | ✔ | `Your focus sharpens as you share an enslaved shadow…` | `Your link to the wraith-world disappears.` | 23/10, 34/11; `stat` 9 files |
| spectral health | ✔ | `A spectral energy courses through your veins.` (refresh `You completely drain …`) | `The spectral energy sustaining your health wanes.` | 7/6, 5/4; `stat` 6 files |
| second wind | ✔ | `You feel a surge of energy as you gain a second wind.` | `Your energy wanes as your second wind fades.` | not in logs; Cockpit state (Svin) |
| Blood of Sauron | ✔ | `You feel a surge of power.` | `The warm taste of blood in your mouth vanishes.` | not in logs; Cockpit state (Rasta) |
| battle glory | ✔ | `Hearing the horn blow, …` | `You feel your newfound strength leaving you again.` | table only |
| miruvor | ✔ | `You feel a pleasant warmth filling your limbs.` | `The warmth of the cordial slowly leaves your body.` | table only |
| growth | ✔ | (none known) | (none known) | table only (`stat`/`info`) |
| anger | ✔ | `You are filled with anger!` | (none; pruned at 30 s) | table only |
| antidote | ✔ | `A warm feeling runs through your body.` | `You feel a strange taste in your mouth.` | table only (see poison: the cure line differs) |
| a pitch-black robe (pale tones) | ✔ | `… your robe glows a pale red.` | `You feel a pale surge of energy flow back into you.` | table only |
| a pure white robe (pale tones) | ✔ | `… your robe glows a pale white.` | same | table only |
| heightened senses | ✔ | `You quaff the potion and a pounding fills your head, …` | `Your new-found clarity fades …` | table only |
| dark aura | ✔ | `You are surrounded by a murky aura.` | `The dark aura surrounding you fades.` | table only |
| smothered | ✔ | `Your lungs seem to burst as …` | `The grip on your lungs recedes.` | table only; typed buff in the table, reads like a debuff (doubt) |
| shadow-veil | ✔ | `You feel your Master's strength join your own.` | `Your Master's strength leaves you.` | table only |
| haste (active) | ✔ | `As you drink the tea, your muscles begin to quiver and twitch.` | `You feel less hasty.` | table only |
| **bloodlust** | ✘ | no line found (appears in `stat` after fights, Rasta) | no line found | `stat` 120 lines / 6 files |
| **some pipe-weed** | ✘ | `You feel focused.` (after `smoke`, also `Just what you needed!`) | no line found | `stat` 34/5; start 9/7 |
| **potion** | ✘ | unknown (candidate `You suddenly feel dizzy and nauseated.`, 10 lines, at login) | unknown | `stat` 47/5 (Rasta) |

## Debuffs

| Stone | App | Start line | End line | Seen (lines/files) |
|---|---|---|---|---|
| tiredness | ✔ | `You feel your muscles relax and your pulse slow …` (golden ruby ring off) | `You feel your muscles regain some of their former energy.` | 70/28, 61/22; `stat` 17 files |
| lethargy | ✔ | `You feel a sudden loss of energy …` (golden topaz ring off) | `You feel your magic energy coming back to you.` | 27/18, 22/15; `stat` 9 files |
| haggardness | ✔ | `You feel a sudden flash of dizziness …` (golden garnet ring off) | `You feel steadier now.` | 10/7, 7/5; `stat` 5 files |
| hunger (twin of the flag) | ◐ | `You are hungry.` (359/21); **`You begin to feel hungry.` missing** (14/12) | `You are full.` 26/18, `You do not feel hungry anymore.` 37/8 | `stat` 8 files |
| thirst (twin of the flag) | ◐ | `You are thirsty.` (328/19); **`You begin to feel thirsty.` missing** (15/12) | `You do not feel thirsty anymore.` 60/24, `You are not thirsty anymore.` 22/14 | `stat` 6 files |
| heavy burden | ✔ | `Your burden is really heavy.` (refresh `… sheer torture.`) | `Your load feels light.` / `… no longer all that heavy.` | 6/4, 21/11; `stat` 3 files |
| blindness (twin of the flag) | ✔ | `You have been blinded!` | `You feel a cloak of blindness dissolve.` | start 1/1 (Rasta, cured by a spell); end not seen |
| winded | ✔ | `Your energy wanes as your second wind fades.` | `You feel less winded.` | not in logs; Cockpit state (Svin) |
| dreaming | ✔ | `As you drink from the murky river, …` | `A deep fog recedes from your sleep, …` | not in logs; Cockpit state (Rasta) |
| depression | ✔ | `Alas, you realise that yet again … Despair settles on you.` | `Your heart feels lighter.` | table only |
| chill touch | ✔ | `An icy gust of wind makes you shiver with cold.` | `You feel warmer.` | table only |
| torpor | ✔ | `As you remove the amulet, a cloud descends over your mind.` | `You feel much better now.` | table only |
| heightened senses (faded) | ✔ | `Your new-found clarity fades …` | `The prickly feeling behind your eyes dissipates.` | table only |
| dark aura (faded) | ✔ | `The dark aura surrounding you fades.` | `The last vestiges of darkness … dissipates.` | table only |
| blindfolded | ✔ | `Tethel gently ties a blindfold over your eyes.` | `Tethel removes your blindfold …` | table only |
| haste (recovery) | ✔ | `You feel less hasty.` | `Your muscles feel normal again.` | table only |
| **panic** | ✘ | follows a failed flee (`PANIC! You couldn't escape!` 110, `You flee head over heels.`) | **`You feel bolder.`** (90/14; 11 of 11 end windows) | `stat` 76/10 |
| **sunlight** | ✘ | **`You blink and feel weaker under the cruel light of the sun.`** (244/9), `The day has begun. You feel so weak under the cruel light!` (12/6) | **`You feel so much better hiding in the shadows!`** (243/9; 7 of 7) | `stat` 22/5 (Rasta, an orc) |
| **unable to quit** | ✘ | no own line (after a fight; `PANIC! You can't quit the fight!` 70/11 is the refusal) | no line | `stat` 216/17 |
| **unable to void** | ✘ | no own line | no line | `stat` 145/11 |
| **unable to sneak** | ✘ | no own line (after a failed flee) | candidate `You feel stealthy again.` (15/3) | `stat` 7/5 |

Seen once or twice and not mapped: `Your head stops stinging.` (15/8, an end
line with no known start), `You feel your Master's influence decreasing.`
(52 lines, one Rasta file).

## Herblores

The app's six (the Timers `+` menu, manual only). No herblore name ever
appears in a `stat` or `info` block in the logs, though Cockpit had
`Healing` running for Rasta and Globur: MUME seems not to list herblore
effects there (a doubt worth one live `stat` while a herblore runs).

| Herblore | App | Phases (app) | Product (herblore.txt) |
|---|---|---|---|
| Healing | ✔ | Healing, Healing (low) | fragrant herbal philtre |
| Travelling | ✔ | Travelling, (med), (min) | mug of brew |
| Clearthought | ✔ | Clearthought, (low), (neg) debuff | pungent brew |
| Walking | ✔ | Walking, (med), (min) | bowl of brew |
| Haste | ✔ | Haste, Haste (recovery) debuff | cup of thistle tea |
| Dark aura | ✔ | Dark aura, Dark aura (faded) debuff | scorched leather flask (dark-draught) |

In MUME but not in the catalogue (`herblore.txt`; none seen in the logs):

| Herblore | Effect phases (herblore.txt) | Note |
|---|---|---|
| Seeing | night vision; perception +3 / +2 / +1 (10 h, 15 h, 40 h) | 3 phases |
| Shadows | shroud; perception −3, then DB +2, then DB +1 | first phase a debuff |
| Skillful-oil | OB/DB +5 (8 h), then OB −5 DB −10 (4 h) | buff → debuff |
| Soothing-draught | HP regen +15 (4 h), then +5 and DEX −2 (5 h) | |
| Strength | STR +2 (120 h) | one phase |
| Orc-balm | HP regen +16/+8/+4, mana regen −6/−3/−1 | 3 phases, Torc |
| Heightened-senses | the affects `heightened senses` / `(faded)` | the game prints lines: already an affect |
| Antidote | a cure; the affect `antidote` | already an affect |

Instant or cure only (no stone): Baker, Leaf-cake, Orc-draught (its
`Orkish draught` affect is a buff above), Drake-slumber. The six poisons
(arachnia, belladonna, hemlock, psylonia, venom; drake-slumber) are
poisons you put on a weapon; on you they are the GMCP `poison` flag and a
`poison (type: …)` line in `stat`.

## Flags (GMCP, your own)

| Flag | App | Twin affect (one stone) | `stat` form | Seen |
|---|---|---|---|---|
| poison | ✔ | none (`poison (type: poison)` in `stat` is ignored) | `poison (type: poison)` | `stat` 5/2 (Gittan); start candidate `You feel really bad.` (1), cured by `A warm feeling runs through your body, you feel better.` (3/3; differs from the table's `antidote` start) |
| blind | ✔ | blindness | `blindness` | see blindness |
| snared | ✔ | none | not in `stat` | GMCP only; `Thick cobwebs cover the tunnel, ensnaring you …` 3 |
| wound | ✔ | none (`a light wound at the right leg (clean)` lines are ignored) | `a <light/deep/serious/critical> wound at the <part> (clean/dirty/dirty, suppurating)` | `stat` 60 lines / 8 files; start `You feel a sharp pain there!` 31/10 |
| hungry | ✔ | hunger | `hunger` | GMCP `"hungry":true` 2 |
| thirsty | ✔ | thirst | `thirst` | GMCP `"thirsty":true` 3 |

Not stones (ADR 0166 point 128): slept, bashed, waiting.

## Sanctuary

| Stone | App | Start | End | Seen |
|---|---|---|---|---|
| sanctuary (yours) | ✔ (a spell; the one exception) | `You start glowing.` | `The white aura around your body fades.` | 10/3, 10/3; `stat` 3 files |

## Not stones, seen in the logs

- **Spells** (ADR 0166 point 128): armour (`stat` 40 files), shield (35),
  detect magic (33), strength (25), shroud (20), breath of briskness (12),
  bless (7). Never seen: detect evil, sense life, night vision,
  protection from evil.
- **Stored spells**: `stored spell earthquake`, `stored spell armour`.
- **Ring buffs** (equipment, not in `stat`): golden topaz ring `You feel a
  sudden aura of energy coalescing …` (24/16), golden ruby ring `The blood
  coursing through your veins quickens, …` (69/26), golden garnet ring `A
  calm serenity fills your body, …` (13). Taking the ring off starts
  lethargy, tiredness, haggardness. They have start lines but no `stat`
  name; the card could show them only as new buffs of their own.

## Counts

| Group | Stones | App recognises | Not yet |
|---|---|---|---|
| Buffs | 22 | 19 | 3 (bloodlust, some pipe-weed, potion) |
| Debuffs | 21 | 16 (hunger, thirst ◐) | 5 (panic, sunlight, unable to quit, unable to void, unable to sneak) |
| Herblores | 6 in the app + 6 in MUME | 6 | 6 (Seeing, Shadows, Skillful-oil, Soothing-draught, Strength, Orc-balm) |
| Flags | 6 | 6 | (`poison (type: …)` and `… wound …` `stat` lines are not tied to them) |
| Sanctuary | 1 | 1 | — |
| **All** | **62** | **48** | **14** |

Of the 35 recognised buffs and debuffs, 12 occur in the logs, 4 more only
in Cockpit's saved state (second wind, winded, Blood of Sauron, dreaming),
and 19 are known only from Cockpit's table. Blindness, hunger and thirst share a stone with their flags, so
the mockup draws them once, under Flags (59 stones there).

## Gaps for the icons pass

1. **Eight `stat` names the reconcile drops**: bloodlust, some pipe-weed,
   potion, panic, sunlight, unable to quit, unable to void, unable to
   sneak. All untimed (no known durations); panic and sunlight have clear
   start and end lines, pipe-weed a start.
2. **Two start lines**: `You begin to feel hungry.` and `You begin to feel
   thirsty.` (14 and 15 lines) are not in hunger's and thirst's table.
3. **Poison and wound in `stat`**: `poison (type: X)` and `a <degree> wound
   at the <part> (<state>)` could feed the flag stones a tooltip (type,
   part, degree) or several wound stones.
4. **Herblores**: six MUME herblores are missing from the catalogue; their
   durations come from a player guide, not from logs.
5. **Doubts**: smothered is a buff in the table but reads as a debuff;
   haste (active) / Haste and dark aura / Dark aura exist both as a
   game-detected affect and as a herblore, so both stones can show at
   once; whether MUME lists herblores in `stat` at all.
