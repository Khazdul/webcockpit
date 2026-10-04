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
