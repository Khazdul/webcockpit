# The Character pane film — manuscript

Draft 5 (2026-11-25, round 3 plan, below). Draft 4: round 2. Draft 3: the owner's
answers to draft 2. Draft 2: the owner's
run and story (below). Draft 1 (in git,\n98fc54a3) had the owner's answers to draft 0 (7bb4897f).
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
  Invented by us, in the game's own colour and form (below).
- **The tour** while the card floats in the middle during the coach ride,
  then the dock (owner: ok).
- **Clicks instead of typing**: `r`, `ag`, `wi` are shown as clicks on the
  card (position, Mood) with the game's own answers; the failed
  `cha spellspeed quick` becomes a click on Casts (owner: ok).
- **No phone view.**
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

## Round 3 plan (draft 5, 2026-11-25)

The source for the played text is the owner's edit of round 2's game text:
`~/Downloads/character-film-r2-spellogg_edited.txt` (film time | id | text;
`Lnnnn` = line of the run log, `S-…` = staged). Its times are round 2's and
are to be redone; its content (which lines are kept, the "Ok." after
Gittan's own narrates) is the owner's.

The owner's notes on the round 2 preview:

- **Pace.** Too fast overall. The coach may stay fast-forwarded. Narrates
  and their answers come at natural gaps (an answer never within 5 s; about
  10–15 s). In Tharbad a natural rhythm: rarely more than one room every
  3 s, varied, 1–3 s.
- **Own narrates.** The game window shows only `Ok.` (plain grey) after
  `narr …`, no "You narrate". Comm still shows the narrate (only the game
  window changes).
- **No Paper glimpse.** Instead a calm look at Stats and Lore while the
  card floats, opened about twice as tall and a little wider than round 2
  (Large); no hurry between the tabs. Then the dock.
- **eq.** The list's `<wielded>` … labels went missing: the film's mock
  sends XML mode without escaping `<`/`>` (MUME sends `&lt;`), so the
  client took them as tags. Fix the mock, not the product.
- **No bandit balloon, no tarantulas.** The house, the spiders, the camp,
  the quakes, "hiding…", "attercop" and Sigrun are gone (the owner's edit).
- **Odalric's answer back** (it was in a deleted block), about 10–15 s after
  "assaulted…", while Gittan walks back to the bakery.
- **The rings stay as edited.** "…the strength that welled within you
  subsides" is the Tiredness debuff (STR +2 stays): its stone appears with
  that line. "A sudden loss of energy" is Lethargy, likewise.
- **One balloon only: the achievement's.** Not frozen: it keeps its natural
  motion and may fly on. The fades stay, with new timings: the first fade
  (all but the balloon) starts 1 s earlier than in round 2 (3 s after the
  balloon comes to rest); the balloon's own fade starts when it did in
  round 2 (11 s after rest); both fades take 4 s (twice round 2's).
- **Posters still** (no push-in).
- **No stones caption.**
- The film still ends with the music (3:06.35). The owner allows shorter
  posters and a shorter end sequence to make it fit.

| Film | Beat |
|---|---|
| 0:00–0:07 | Title |
| 0:07–0:22 | Mason Road: map on; `narr off to tharbad…`, `Ok.`; the coach arrives; Character on, floating, Large (about twice round 2's height, a little wider); `st`, `enter coach` |
| 0:22–1:05 | The coach (fast): click on position (`rest`); Thorgrim ~14 s after Gittan's narrate, then Comm on; a calm look at Stats and Lore (a caption each); Mirel; ~12 s later Gittan's answer (`narr …`, `Ok.`); the ring's tooltip; the dock ("It fits any size."); `stat`, `eq` (fixed), the rings: "You feel stronger" (STR 12 +2), Lethargy and Tiredness stones |
| 1:05–1:19 | Tharbad to the bakery, a room every 1–3 s; a drink at the fountain |
| 1:19–1:30 | The bakery: closed, `glare`, the bandit, the flight; `wimpy 100` |
| 1:30–1:49 | To the north gate; `narr assaulted…`, `Ok.`; `invis` |
| 1:49–2:01 | Back to the bakery; Odalric answers on the way |
| 2:01–2:21 | The revenge at the game's pace (fight caption); the baker; `ag`; the kill (no balloon; the XP ring caption) |
| 2:21–2:26 | Click on Mood (aggressive → wimpy, "A click sends the command."); the pie; the achievement |
| ~2:28 | The achievement balloon at rest (natural motion) |
| rest+3 → rest+7 | Everything but the balloon fades (4 s) |
| rest+7 → rest+11 | The balloon alone on black, moving |
| rest+11 → rest+15 | The balloon fades (4 s) |
| ~2:43–2:57 | Three posters, still, about 4.5 s each, short cross-fades |
| ~2:57–3:06.35 | End card |

## Round 2 proposal (draft 4, for the owner's review, 2026-11-25)

The owner's notes on round 1: no fade to black in the middle (2:51); end
shortly after the pie, no coach home; the balloons on (the tarantulas'
joined sign, the bandit's *meh*); a story about pies told in narrates
(Gittan types `narr …` herself in the input line; Public has no reply line);
Comm opened in the coach, docked under the map, no border and no
background, Public, about a third of the height; the end: an achievement
balloon alone on black, three posters, the end card. STR 10 before the
ring, 12 (+2) after. Mood: our choice.

| Film | Beat |
|---|---|
| 0:00–0:07 | Title card |
| 0:07–0:20 | Mason Road. Map on. Gittan: `narr off to tharbad! they say the pork-pies there are worth the whole road south`. The coach arrives; Character on (floats, Medium); `enter coach` |
| 0:20–0:56 | The coach. No tab tour (owner): the ring's tooltip, a click on position (`rest`). Thorgrim: 'bring one for me. two, if the road is long'. Comm on (docked under the map, frameless, clear, ~1/3 height). Mirel: 'tharbad? half of it is under the greyflood and the other half would steal your boots'. Gittan: `narr hobbits have no boots, mirel. my feet and my purse are both well guarded`. Character docked above the map ("fits any size"); a Paper glimpse |
| 0:56–1:04 | Tharbad; the ring: "You feel stronger", STR 10 → 12 (+2) |
| 1:04–1:12 | The bakery closed; the bandit; the flight; `wimpy 100` |
| 1:12–1:20 | Gittan: `narr assaulted in the bakery, and it was CLOSED. this town is crawling with cutpurses`. Odalric: 'closed? now that is the real crime'. Out by the north gate; Gittan: `narr hiding in a little stone house north of the gate. nobody looks for a hobbit in a cellar` |
| 1:20–1:32 | Down; the tarantulas; poisoned (≈1:24, a loud bar); flee up; Gittan: `narr attercop! the cellar is full of spiders. i am going back down with an earthquake or four`; remove poison |
| 1:32–1:48 | Camp fire, four stored earthquakes (mana in four steps), rest, herb |
| 1:48–1:58 | Down, the quakes; both dead: the balloon, the joined sign ("2 kills"). Sigrun: 'did anyone else just feel the ground shake??' |
| 1:58–2:14 | The bakery: the bandit, the baker joins; `ag` typed; the kill: a *meh* balloon; one click on Mood: aggressive → wimpy |
| 2:14–2:18 | `buy pie` ("six copper"), `eat pie` |
| 2:18 | Staged: `Event.Achieved` and "Achievement unlocked: …" in the game pane; the achievement balloon rises |
| ~2:24 | The balloon at rest in its reading place; it stays |
| 2:28–2:30 | Everything but the balloon fades to black |
| 2:30–2:35 | The balloon alone on black (the track's loudest bar, 2:30) |
| 2:35–2:37 | The balloon fades; black |
| 2:37–2:55 | Three posters, about 6 s each, with short cross-fades: `out/posters-0.23/1-faces-of-arda.png`, `2-status-stats-lore.png`, `3-the-stones.png` |
| 2:55–3:06 | End card in the balloon film's style: the Character pane, "Turn it on under Panes → Character", mumecockpit.com, the music credit |

Mood (our choice): no cycling on camera. The card steps wimpy → prudent →
normal → brave → aggressive → wimpy, so: in the fight Gittan types `ag` as
in the run; after the kill one click on Mood takes her from aggressive to
wimpy (the cycle's wrap), with the caption "A click sends the command."
The tour's click is on the position (`rest`). Casts: no click (round 1's
careful dropped).

Achievement text (owner): "Procured a pork-pie in Tharbad."

The coach (owner): no tab tour. The card stays on Status in the coach (the
three posters show the tabs at the end); the ring's tooltip and the click
on position stay.

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
| 328–347 | Camp fire; `store earthquake` ×4 | mana 137 → 55 in four steps (stored spells are no stones: they show in Timers only) |
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
| 8 | 1:52–2:18 | 328–415 | Camp fire; four stored earthquakes; rest, herb, brew | mana down in four steps; the herb stone | — |
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

## Stats and Lore (the owner's screenshots, 2026-11-25)

The poll's answers are not in the log; the mock answers the poll with these.

- **Stats:** STR 12 (+2, the ring's strength), INT 17, WIS 19, DEX 11,
  CON 14, WIL 13, PER 16. Age 55, 3rd age, 4th at 60; points HP +11,
  MANA +2, MOVES +2; regen +0.3, +5.0, +1.3. Vision 35, hearing −5,
  smell −20, carrying 76 lb.
- **Lore:** Fallohide hobbit. Alignment "You must have been sent to Arda to
  free it from the sorrows that weigh upon it". Citizen Bree · Shire ·
  Fornost · GreyHavens · Rivendell. War fame war leader, war points 13.
  Purse 66 gold, 4 silver, 48 copper (42 copper after the pie). Height
  3′1″, weight 4 st 13 lb, birthday in 1 month.
- Before the ring (Bree, the coach, until log s 248.8 "You feel
  stronger"): STR 12 with no `+2` line (owner). The `+2` from then on.

## Narrates (invented, draft)

The form of the owner's runs (as `feeds/balloons.ts`): an empty line, the
line in yellow (ANSI 33) as `Name narrates 'words'`, an empty line,
`Comm.Channel.Text` (`tales`, `talker-type` player), the prompt. Players
are invented. Lower case, as MUME players write.

| Film | Where | Line |
|---|---|---|
| ~0:45 | in the coach | Fenwick narrates 'anyone know when the bakery in tharbad opens?' |
| ~1:26 | after "closed" and the flight | Mirel narrates 'tharbad bakery keeps hobbit hours. second breakfast only' |
| ~1:52 | after the poison | Thorgrim narrates 'never go down into that stone hut north of tharbad. trust me' |
| ~2:34 | after the quakes | Odalric narrates 'did anyone else just feel the ground shake??' |
| ~2:58 | aboard, homeward | Sigrun narrates 'gittan, was the pie worth it?' |

Optional: Gittan answers the last one (`narrate every crumb`); the game's
echo of your own narrate is to be checked in a run before it is staged.

## Open questions for the owner

1. No level-up in the run (150k xp to go): the XP ring's growth is the
   reward.
2. HP never goes low (lowest 172/205): the danger is in the poison and
   the flights, not the bar.
