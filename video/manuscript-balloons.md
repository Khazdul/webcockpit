# The balloon film — manuscript

Draft 4 (2026-11-22): the title's name is MUMECOCKPIT.
Draft 3: round 2 approved with two changes, the title's third
line and the setting's own description (the owner: "kör vi på detta").
Draft 2: a new film after the owner's review of round 1
(draft 1 is in git, cb4dd880). Much slower, one place, daylight, every
balloon sent by a typed command. A film of its own that only shows the
balloon notices of 0.22 (stages 69 and 75, ADR 0159); it does not replace
the presentation films. Same pipeline (ADR 0133, `README.md`).

## The owner's decisions (2026-11-22)

- **Slow.** The film may be longer. Every balloon flies at the real speed:
  nothing sped up, no time compression while a balloon is up.
- **One place.** Gittan at the fountain in Bree for the whole film. It is
  there for the look of the whole: text and balloons in one window.
- **The screen is full of text from the first frame of the game.**
- **Life in the room.** Things may happen meanwhile: mobs walk in and out,
  a simulated narrate. Staged lines have the game's real form and colours.
- **Light.** A clear day. A bird now and then, and the day sky's small
  cloud tufts (no cloud cover).
- **The map.** The only pane: floating, with its border and the glass
  background, one text row from the top edge and one row from the right.
- **The commands show.** Gittan types `#weather balloon as …` for each
  balloon.
- **Not crowded.** Never more than about 2.5–3 balloons on screen at
  once. The next comes when the one before has stopped and moved on a bit.
- **The setting on camera.** Balloons is off; the pointer switches it on.
  Its description no longer lists what sends a balloon (a product change,
  `BALLOONS_ROW.help`): *A companion in a hot-air balloon reacts to what
  happens in the game. Desktop only.*
- **The title's joke is back** (dropped in draft 2): it comes 7–8 s in,
  stays 3–4 s, then the film starts.
- **The end.** Fade to black, then the end card in the title's style.
- **Camera.** No zoom.
- **Music.** *Into The Wilds* by Scott Buckley (2024, 4:07, CC BY 4.0),
  `public/music/into-the-wilds.mp3`. Faded at a phrase's end under the end
  card. Credit, in the YouTube description from the moment of upload (the
  track is in Content ID) and small on the end card:
  `'Into The Wilds' (edited) by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au`

## The place

Run `Gittan/2026-11-08T12-07-39` (`private/film-runs.jsonl.gz`), the
`pony` excerpt of `feeds/film.ts` (the presentation film's act 1): out of
the inn to *Sign of the Prancing Pony Inn* at about 23 s, the fountain,
`dr water`. A city room outdoors. She does not leave it. (The mercenary is
hired later, at the End of Mason Road; he is not needed here.)

Before the first frame the run's earlier text is fed, with more of the
run's Bree text before it if needed, until the window is full, ending with
her arrival at the fountain.

## Acts (times approximate; the balloons decide)

### 0 · Title, on black (0:00–0:13)

1. *MumeCockpit 0.22* fades in and stands alone for about 2 s.
   (The owner, 2026-11-22: the name on screen is MUMECOCKPIT, one word,
   not WEBCOCKPIT. The title face sets lower case as small capitals.)
2. *Now with hot-air balloons.* fades in below it. Both stay to be read.
3. At 7–8 s *(Nobody asked. We did it anyway.)* fades in below, smaller.
   The two lines above do not move. It is fully readable for 3–4 s.
4. Fade out of all three. No balloon, no sky.

The acts after the title keep their lengths and move with it (about 4 s
later than the times below); the music's end is found again.

### 1 · The fountain (0:09–0:25)

1. Fade in to the game: full of text, day, the map.
2. About 6 s in: the pointer opens Settings → Weather effects, rests by
   Balloons long enough to see where it is, switches it on, rests, closes.

### 2 · The goblin (0:25–1:10)

Gittan types each command at a readable pace.

| # | `#weather balloon as …` | The next one after |
|---|---|---|
| 1 | `goblin calibrating` | about 14 s (the first takes its time) |
| 2 | `goblin superb` | 8–10 s |
| 3 | `goblin achievement` | 8–10 s |
| 4 | `goblin death` | 8–10 s |

Caption, with the second balloon: *Balloons rise for kills, level ups and
achievements. And when you die.*

### 3 · The other races (1:10–2:15)

One of each of the other seven, somewhat quicker, as far as "not crowded"
allows. Kills alternate with the other moments, so that no two kills join
one sign.

| # | `#weather balloon as …` |
|---|---|
| 5 | `dwarf great` |
| 6 | `hobbit levelup` |
| 7 | `troll poor` |
| 8 | `human achievement` |
| 9 | `orc meh` |
| 10 | `numenorean death` |
| 11 | `elf pvp` (the sample's victim is an orc) |

Caption, from about the second of them: *The passenger follows your race.
8 passengers, 10 balloons each: 80 in all.*

### 4 · The end, on black (about 2:15–2:30)

The last balloon is read and drifts on a bit. Fade to black. The end card
in the title's style: *Turn them on in Settings → Weather effects.* /
*mumecockpit.com* / small: the music credit. It fades with the music.

## When the rules collide

"Real speed" and "not crowded" win over the times and the gaps above:
lengthen a gap, and with it the film. Never speed a balloon up.

## YouTube

Proposed to the owner 2026-11-22, with the chapters of round 4's times.
No `#weather` in it: YouTube makes a hashtag of it.

```text
TITLE
MumeCockpit 0.22: Now with hot-air balloons

DESCRIPTION
MumeCockpit is a free MUD client for MUME (Multi-Users in Middle-earth). It runs in your browser, on desktop, tablet and phone.

New in 0.22: hot-air balloons. Nobody asked. We did it anyway.

A companion of your race rises in a balloon and reacts to what happens in the game. There are 8 companions with 10 balloons each, 80 in all. In this demo they are sent by command, so you can see more of them.

To turn them on: Settings → Weather effects → Balloons (desktop only).

0:00 Nobody asked
0:13 Bree: turning on the balloons
0:31 The many moods of a goblin
1:20 The other races
2:46 We did it anyway

▶ Play: https://mumecockpit.com
🌍 MUME: https://mume.org
🎵 Music: 'Into The Wilds' (edited) by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au
License: https://creativecommons.org/licenses/by/4.0/
```
