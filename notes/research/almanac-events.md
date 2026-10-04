# Almanac: time-dependent things in MUME

Research notes for a planned almanac script pane (clock, seasons, moon,
upcoming events). Not authoritative. Sources are Faine's text files
(saved by the owner 2026-10-04: `strategy.txt`, `quest.html`,
`miscinfo.txt`, `misc.txt`, `Herbs.txt`, `herblore.txt`), mume.org help
pages, the yllemo wiki and mumewiki.kalka.org.

## Calendar facts

- 1 game hour = 1 real minute; 1 game minute = 1 real second.
- Day 24 real min, month (30 days) 12 real h, season (3 months) 36 real
  h, year 6 real days.
- Moon: synodic cycle 29 d 12 h 44 m game time (MMapper PR 313), about
  11.8 real hours. Drifts against the 30-day month.
- Faine (quest.html, Ingrove): "the phase changes only when the calendar
  is restarted", i.e. the moon's offset against the calendar is fixed
  until a MUME reboot or reset. A sync must therefore also learn the
  moon offset, not only the date.
- Months, Sindarin names and dawn/dusk hours: mume.org/help/months
  (already in `src/gmcp/clock.ts`).
- Moonrise depends on phase and month: "if month is wrong, moon can
  rise after sun, and go down before night comes" (strategy.txt, Moria
  West Gate). We have no moonrise model yet; MMapper has one.

## Events by condition

Moon:

| Thing | Condition | Where | Source |
|---|---|---|---|
| Dead Knight slab | moonrise while moon is 3/4 waxing or full (two moonrises per cycle) | Barrow by Nen-i-Sul | strategy.txt "Dead Knight" |
| Ingrove warg pack | every full moon in Afteryule, Solmath, Rethe (3–4 per year) | Wolf Glade SE of NOC → Beorning village | quest.html (Ingrove citizenship) |
| Moria West Gate quest | night, after moonrise, detect magic, `exa inscription` | West Gate, wait some n | strategy.txt "Moria" |
| Hrivesur's tomb (Ancient Dwarven Home) | cloudless night and moonlight | sw of Hrivesur, near Grey Havens | strategy.txt |
| Faintly glowing stone | turns to dark stone when the moon is set | item | misc.txt |
| Moon pool (ring focus) | dip at the proper time (moon) | Eressea tower | miscinfo.txt |

Sun and hour:

| Thing | Condition | Where | Source |
|---|---|---|---|
| Sundeath | trolls in a sunlit room die | anywhere outdoors | mume.org wiki |
| Spirit Knight door | midnight, say "open durin" (dwarves any time) | Morthan s 2w 4s e 2s w | strategy.txt |
| Overseer slab | sunrise, say "By the might of Aule I command thee to open" in Khuzdul | Wyrdda ford 4n 4e 4n 5w n, turf | strategy.txt "Overseer" |
| White Ship | arrives at midnight | Harlond, after "sail west" to Cirdan | miscinfo.txt |
| Sun pool (ring focus) | dip during sunrise | Valinor | miscinfo.txt |
| Galadriel's mirror (Witch-King) | at night | Lorien | strategy.txt |
| Enidale's ghost | appears at nightfall | ruined barn e/n of orc rider camp across Anduin | quest.html |
| Dagnir's ghost | visible at night only | south of Lorien, marshes | quest.html |

Season:

| Thing | Condition | Where | Source |
|---|---|---|---|
| Spirit Knight | impossible in winter (water frozen) | Morthan | strategy.txt |
| Shire wolfpack | repops once per winter | Dwaling | quest.html (Shire citizenship) |
| Baneberries | autumn and winter only | 6e from Amanrandil, vines n of Tharbad, … | Herbs.txt |
| Juniper | "certain yeartime only" at the Scary spot (season unknown) | hills of Scary, 3e from "A Spring" | Herbs.txt |
| Burnished hewing-spear | once a year, spring or summer | Rushak, Dunland | yllemo wiki (not in Faine) |
| Black Ice zone | closed in winter (underwater access) | — | Mumepedia (not in Faine) |
| Cold-proof shoes | fewer moves in winter | item effect | misc.txt |

Not time-bound but zone-state (out of scope for the almanac, maybe later):
Moria Deeps repop every 7 s, tower repop rules, artifacts decay after
3 or 7 real days, West Gate blocked 20–30 min after entry.

## Open questions

- Moonrise/moonset model (needed for Dead Knight, West Gate, Hrivesur).
- Juniper's season.
- Exact Ingrove pack spawn time within the full moon.

## Round 2 sources (2026-10-04)

`~/mumeinfo.txt` (owner's MUME info dump, all 3775 lines read) and all
43 quest pages on mume.yllemo.com (adventure:quests).

New candidates:

| Thing | Condition | Where | Source | Confidence |
|---|---|---|---|---|
| Eblees moan (way out) | every sunrise and sunset, lasts one game hour | Eblees maze, N Mirkwood (6e 2s from Vale forest gate) | mumeinfo L2433, L3193 | clear |
| Dol Guldur bat swarm | night: attacks players in outdoor rooms; by day sleeps in caves | eastern DG zones | mumeinfo L2612, L966 | clear |
| Ebon Wraith fall | only at night (rumoured, unconfirmed) | Mirkwood | mumeinfo L3191 | vague |
| Elderberries | load in winter, not in autumn (one observation) | Fangorn | mumeinfo L240 | vague |
| Dense Forest `exits` trick | daytime only | E of Dwarf Homes, Blue Mountains (Vig's quest) | mumeinfo L1064, yllemo vig_s_quest | clear, minor |
| Visored helmet levers | set to today's game date (from `time`) | N of Forlond | mumeinfo L3044 | clear (date helper, not a window) |

Detail for existing rows:

- Hrivesur's tomb: moon visible, at least half moon, not cloudy or foggy;
  also needed to loot (L1073, L1091).
- Dagnir's ghost: seen around 3–4 am, not at midnight (L1553).
- Dead Knight trigger: "As the full moon rises, a faint silver tracery
  appears on a mound." (L2277–2279).
- Overseer: trigger "The rising sun illuminates the rolling landscape.",
  success "A creaking sound is suddenly heard from the rock wall to the
  north." Still valid after 2022 (L2835–2857).
- Shire wolfpack: can also pop in the Old Forest (L1186).
- Faintly glowing stone loads on the Dunlending animist, Broghha's
  village (L2230).
- Ingrove full-moon dates per calendar epoch (L1774–1784, yllemo) and the
  old moon model (L3412–3445) predate the moon change (MMapper PR 313,
  "invalid since the moon was changed by Dain"). Not used.

Real-time bound (outside the game-time model): Tethel weekly, Oakscar
3 RL days after restart, Rahku inactive for days, Dunadan Ranger wipe
~1 month, Ost-in-Edhil forge knowledge 2 days–1 week, Lonely Giant
40–48 game hours deadline.
