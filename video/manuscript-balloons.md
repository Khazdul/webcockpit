# The balloon film — manuscript

Draft 1 (2026-11-21). A short film of its own (about 1:15) that only shows
the balloon notices of 0.22 (stages 69 and 75, ADR 0159). It does not
replace the presentation films (`manuscript.md`, `manuscript-2.md`). Same
pipeline (ADR 0133, `README.md`): Playwright takes against the mocked MUME
WebSocket, cut in Remotion.

## The owner's decisions (2026-11-21)

- **Material.** Gittan (hobbit passenger), then Rasta (goblin passenger),
  then a parade of a selection of the other passengers.
- **Length.** About 1:15, with more tempo than the earlier films.
- **Names.** Real names stay, the PvP victims on Rasta's signs included.
- **Captions.** A few short ones, plus a title card and an end card.
- **Light.** Day (Gittan) → dusk (Rasta) → night (the parade).
- **Camera.** No zoom: the whole window throughout.
- **Panes.** Only the map, floating in the upper right, not large.
- **The parade.** One at a time, not too dense (about 3 s apart), not all
  eight: varied races and varied balloons (moods). A caption says it is a
  selection and how many unique balloons there are in all.
- **The opening.** A short, slightly comic title card: "WebCockpit, now
  with balloons" or similar.
- **Music.** More tempo; five candidates in `~/Downloads/ballong-musik/`.

## Facts the captions rest on

- 8 passengers (dwarf, elf, human, hobbit, troll, goblin, orc, Black
  Númenórean), chosen by the race the player plays (stage 75).
- 10 balloons per passenger (`feed.ts MOODS`: poor, meh, calibrating, good,
  great, superb, PvP, level up, death, achievement), each its own envelope
  and passenger pose: **80 unique balloons**.
- Kills within the readable spot join one sign (count, summed XP, the best
  face; +0.7 s each, capped).
- Off by default: Settings → Weather effects → Balloons. Desktop only.

## Sources

- **Gittan:** `Gittan/2026-10-11T20-56-42` (runs backup
  `~/Downloads/webcockpit-runs-2026-11-17.jsonl.gz`; to be copied into
  `private/film-runs.jsonl.gz` or a second private backup). Gloomy Valley
  (forest): the olog-hai troll at 388 s. The Ancient Broken Road: a prison
  guard (1406 s), two mastiffs 2 s apart (1412, 1414: a joined sign without
  any staging), smugglers, goblin warriors; the achievement *"You unlocked
  an ornate elven chest!"* at 1651 s in the Chieftain's Throneroom.
- **Rasta:** the export `~/Downloads/mume-Rasta-2026-11-21T21-47-52(1).html`
  (run 2 in its payload). The Old East Road caves: Morgrim (2382 s), Grekko
  (2386), Voïx (2423), a Dwarf and **level 74** (2448), Thehippo (2476),
  Domon (2480).
- **The parade:** staged with `#weather balloon as <passenger> <what>`,
  typed off camera (or sent from the scene directly).

## Acts (about 1:15; times as cut, by picture)

### 0 · Title (0:00–0:05)

A card in the start page's type on its night sky. A balloon rises through
it. Text (owner, 2026-11-21): *WebCockpit 0.22* / *Now with hot-air
balloons.* / small: *(Because: Why not?)*

### 1 · Gittan, by day (0:05–0:32)

1. Gloomy Valley in daylight, the map floating upper right. The group
   kills the olog-hai troll; the hobbit's balloon comes up with its sign
   and drifts away into the sky. Caption: *Every kill sends up a balloon.*
2. Cut to the Ancient Broken Road: the prison guard, then the two mastiffs
   on one sign. Caption: *Kills close together share a sign.*
3. The Throneroom: unlock, open, the chest. The achievement balloon.
   Caption: *Level ups and achievements get one of their own.*

### 2 · Rasta, at dusk (0:32–0:52)

1. Cut to Rasta in the caves off the Old East Road. Caption: *The
   passenger follows the race you play.* The goblin.
2. The PvP kills in real order (time compressed): the player-kill
   balloons; the level 74 balloon beside the Dwarf's.

### 3 · The parade, at night (0:52–1:10)

Outdoors under the night sky. About six passengers, about 3 s apart, each
on a different balloon. Proposal:

| # | Passenger | Balloon |
|---|---|---|
| 1 | dwarf | superb |
| 2 | elf | achievement |
| 3 | troll | poor |
| 4 | human | level up |
| 5 | orc | PvP |
| 6 | Black Númenórean | death |

Caption: *A selection: 8 passengers, 10 balloons each. 80 in all.*

### 4 · End card (1:10–1:15)

*Turn them on in Settings → Weather effects.* /
*WebCockpit 0.22 · mumecockpit.com · Free and open source*. The picture
fades with the music.

## Light underground (owner, 2026-11-21)

Both runs' balloon moments are mostly underground (building, cavern),
where the sky shows only its tint. Decided: open outdoors in daylight
(the troll in Gloomy Valley), then let the caves be dark: the contrast
tells it. The parade is outdoors under the night sky. Room environments
are not staged.

## Open

- The music: five candidates in `~/Downloads/ballong-musik/kandidater.html`.
  Two of them (#1 Hitctrl, #3 peastman) are CC BY 3.0 and need a credit
  line on the end card and in the YouTube description.
- Whether Rasta's dusk shows at all in the caves (to be judged on the
  first take).
