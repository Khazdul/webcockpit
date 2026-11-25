# The Character pane film — manuscript

Draft 2 (2026-11-25): the owner's run and story (below). Draft 1 (in git,\n98fc54a3) had the owner's answers to draft 0 (7bb4897f).
Not approved. A film of its own about the Character pane of 0.23.0
(stage 77), recorded after the release is published. Same pipeline as the
balloon film (ADR 0133, `README.md`).

## The owner's decisions (2026-11-25)

- **A story that builds.** Something happens in the game: Gittan goes on a
  small adventure that shows the pane's functions.
- **The pane starts off.** The film shows where it is switched on, then the
  tabs.
- **The story (the owner's run).** Mason Road in Bree: the coach from
  Fornost arrives and Gittan boards it. The coach rolls and stops a few
  times until Tharbad (cut down: it takes long). To the bakery for a pie;
  a bandit attacks. Out through the north gate to shelter in a small stone
  building: two spiders, poisoned, flee up, a camp fire, remove poison.
  Four earthquakes stored for revenge, down, cast. Then enough: back, kill
  the bandit, buy a pie, the coach home to Bree.
- **The layout (the owner's picture).** The mapper is switched on first
  (docked right). Then the Character pane: it comes up in the middle, a
  little smaller than in the picture but large enough for the shields and
  the portrait (about Medium). Then it is docked above the mapper.
- **Narrates**, as in the balloon film: they made the game feel alive.
- **Captions on chosen moments only.** One short caption per tab and a few
  more (below). Not every detail.
- **Other sizes: yes.** The card is shown in more than one size (Large →
  Medium; the phone view, to confirm with the owner — see open questions).
- **Paper: a quick glimpse.** Lykta for the film, Paper for a moment.
- **Music.** *No Good Layabout* by Kevin MacLeod (3:06, CC BY 4.0, in
  Content ID), `public/music/no-good-layabout.mp3` (local, the folder is
  gitignored; source copy and licence file in
  `~/Downloads/charpane-musik/6 No Good Layabout - Kevin MacLeod*`).
  Chosen from two rounds of ten. **The film is as long as the track**
  (186.4 s); it ends on its own, so no fade is needed. (Draft 0 had
  *Sancho Panza gets a Latte*; the owner changed his mind.)

Credit (YouTube description from the first moment, small on the end card):

```
"No Good Layabout" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0
https://creativecommons.org/licenses/by/4.0/
```

## The track's shape (measured, short-term loudness)

124 BPM, walking bass, piano and drums, a clarinet solo in the middle
(Incompetech's catalogue). Integrated −19.4 LUFS. A soft start to about
0:12 (−24), then about −20 throughout, with louder moments near 0:42,
1:24 and the loudest at 2:30 (−16.5). Dips near 2:00 and 2:18–2:28 just
before that peak. Ends at 3:06. To be checked by ear: the phrase starts and
where the clarinet solo begins and ends, so the cuts land on them.

## The run (Gittan, `~/Downloads/Gittan-2026-11-25T18-59-11.log`)

629 s, played by the owner 2026-11-25 for the film. Log seconds:

| Log s | What happens | The card |
|---|---|---|
| 0–55 | Mason Road, Bree; the coach from Fornost arrives (42.8), `enter coach` (55.4) | resting → standing → resting |
| 55–250 | The coach: Bree's western gate, the Greenway, the Road to Tharbad, a ford, Jasper's Tavern (182), Tharbad (241.8). The owner switched themes on the way (76–91, Paper at 76.5) | sleeping/sitting/resting |
| 239–251 | Ring swaps: "You feel stronger" (strength), the ruby ring's mana aura | buff stones |
| 259–265 | The bakery: closed ("open in a couple of hours"); `glare`, the bandit attacks, Gittan flees at once (mood wimpy) | fight mode on and off in 0.5 s |
| 266 | `wimpy 100` | the wimpy arrow at 100/205 |
| 284–308 | `invis`, through the north gate, picks locks, down into the stone building | invisibility stone, gone at 308 |
| 308–316 | Two huge tarantulas; poisoned (312), flees up (315.8) | fight mode, the poison stone |
| 324–326 | `remp`: the poison is gone | the stone goes |
| 328–347 | Camp fire; `store earthquake` ×4 | mana 137 → 55 in four steps; four stored-spell stones |
| 347–415 | Rest, `mix clear` ("You feel bolder"), `quaff brew`, `stat` twice | herb stone; mana back to 96 |
| 416–424.5 | Down; four earthquakes; both tarantulas dead | fight mode; XP +9,5k (the ring's bright gold) |
| 448–468 | The bakery again: the bandit; the baker joins; lightning bolt; `ag` (mood aggressive, 460), kill (467.7), `wi` (wimpy again) | fight mode; Mood changes twice |
| 469–472 | `buy pie` ("six copper"), `eat pie` | the purse |
| 474–629 | Back to the coach; waits (483–581); `enter coach` (590); "The coach starts moving towards Bree and Fornost." (629.3) | resting |

Not in the log: the info poll's answers (hidden from the run log by design,
ADR 0166), so Stats and Lore need their values given to the mock.
`cha spellspeed quick` (461) failed ("No field by that name"). HP never
went low (lowest 172/205). The weight stays `heavy` throughout.

## Outline (draft 2, to the track; film s ← log s)

| # | Film | Log | Beat | The card | Caption |
|---|---|---|---|---|---|
| 1 | 0:00–0:08 | — | Title card (the soft start) | — | — |
| 2 | 0:08–0:34 | 0–61 | Mason Road. The mapper switched on (docked right), the coach arrives, the Character pane switched on: it floats in the middle at a Medium size (shields and portrait show). `enter coach`; rest | the card appears | "Character pane" |
| 3 | 0:34–1:10 | 61–250, cut hard | The coach rolls (its stops as beats). The tour: Status, Stats, Lore, the level ring's tooltip; a glimpse of Paper; then the card is docked above the mapper (the layout of the owner's picture) | the tabs; the dock | one per tab; "fits any size" at the dock |
| 4 | 1:10–1:20 | 239–259 | Tharbad: the rings ("You feel stronger"), the walk to the bakery | buff stones | "stones" |
| 5 | 1:20–1:28 | 259–268 | Closed. The bandit; Gittan flees; `wimpy 100` | fight mode for a blink; the wimpy arrow | — |
| 6 | 1:28–1:40 | 284–308 | Invisible, out through the north gate, down into the stone building | invisibility stone | — |
| 7 | 1:40–1:52 | 308–326 | The tarantulas; poisoned; flee up; remove poison | fight mode, the poison stone comes and goes | "fight mode" |
| 8 | 1:52–2:18 | 328–415 | Camp fire; four stored earthquakes; rest, herb, brew | mana down in four steps; four stones; the herb stone | — |
| 9 | 2:18–2:30 | 415–424 | The dip: down the stairs, the quakes cast | fight mode | — |
| 10 | 2:30–2:36 | 424.5 | The peak: both tarantulas dead | the XP ring grows | "the XP ring" |
| 11 | 2:36–2:54 | 448–472 | Revenge: the bandit, the baker joins, the kill; a pie for six copper | Mood changes (clicks?), the purse | — |
| 12 | 2:54–3:06 | 590–629 | Aboard; "The coach starts moving towards Bree and Fornost."; end card | — | the music credit |

## The log session (the owner, with Gittan)

The film can only show what is in the log, so play these live:

- Open **Stats and Lore** (before and after the fight), so the info poll's
  answers are in the run.
- **Click** in the card (mood, sneak, ride, position), so the GMCP answers
  come with it.
- Cast the buffs and set wimpy during the run.
- A fight that is a little dangerous: a debuff, HP down towards the wimpy,
  mana spent; then loot (a heavier weight step) and if possible a level.
- Play calmly, 20–30 minutes; we cut the best moments together.

## Open questions for the owner

1. The tour while the card floats in the middle during the coach ride,
   then the dock? (Proposed.)
2. The typed `r`, `ag` and `wi` shown as clicks on the card instead
   (position, Mood), with the game's own answers? And the failed
   `cha spellspeed quick` replaced by a click on Casts?
3. Stats and Lore: the poll's answers are not in the log. Screenshots of
   Gittan's Stats and Lore tabs give the mock its values.
4. The phone view: dropped for time? The dock already shows the card
   change size.
5. Narrates: three to five staged ones with invented names (proposals in
   the reply of 2026-11-25), or does the owner write them?
6. No level-up in the run (150k xp to go); the XP ring's growth is the
   reward.
