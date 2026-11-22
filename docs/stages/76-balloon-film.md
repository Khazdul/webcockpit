# Stage 76 — The balloon film

Not a spec §5 row: the owner's request of 2026-11-21. A short film of its
own (about 1:21) that only shows the balloon notices of 0.22 (stages 69
and 75). It does not replace the presentation films (stages 48 and 70).

Status: **Round 1 rendered** (2026-11-22), waiting for the owner.

The manuscript and the owner's decisions are in
`video/manuscript-balloons.md`, which the main session owns. The pipeline
is ADR 0133's (`video/README.md`).

## Tasks

- [x] Material found: Gittan `2026-10-11T20-56-42` (runs backup of
      2026-11-17: the troll outdoors, the mastiffs' joined sign, the
      achievement), Rasta's export of 2026-11-21 (PvP, level 74).
- [x] Manuscript draft 1, with the owner's answers (2026-11-21).
- [x] Music: two rounds of five candidates; *Into The Wilds* (Scott
      Buckley, CC BY 4.0) chosen 2026-11-22, in `video/public/music/`.
- [x] Gittan's run (already in `private/film-runs.jsonl.gz`) and Rasta's
      run (`node record/balloon-runs.ts <export.html>` →
      `private/balloon-runs.jsonl.gz`); the take specs in
      `video/feeds/balloons.ts`.
- [x] Scenes (`record/scenes/balloons.ts`: `balloons-title`, `-gittan`,
      `-rasta`, `-parade`; state in `record/lib/balloon-state.ts`): weather
      and balloons on, only the map, floating upper right; MUME's clock and
      the sky pinned day / dusk / night; the parade sent from the scene off
      camera.
- [x] Composition `Balloons` (title card with a rising balloon, captions,
      end card with the music credit, picture and music fade).
- [x] Round 1 render and contact sheet for the owner.

## Round 1 (2026-11-22)

`npm run render -- Balloons --out balloon-film --no-4k` →
`video/out/balloon-film.mp4` (HEVC 10-bit) and `balloon-film-h264.mp4`;
contact sheet `video/out/balloon-film-r1-sheet.png`. 82.0 s: title
0:00–0:03.0; Gittan 0:03.0–0:20.9 (troll, mastiffs, chest); Rasta
0:20.9–0:46.8 (Morgrim and Grekko, Voïx, the Dwarf and level 74, Thehippo
and Domon); the parade 0:46.8–1:22 (cut in 1 s after its first balloon is
sent), the end card from 1:15.0; picture and music fade 1:19.5–1:22.
Checked on the sheet and at full size: every sign legible, the hobbit for
Gittan and the goblin for Rasta, the map upper right throughout. In the
caves Rasta's dusk barely shows (the manuscript's open point): only the
balloons' dusk glow tells it.

How the takes are made:

- **Legs.** Each take plays its run in legs: `fast` off the film (the text
  as fast as the page takes it, each kill's 500 ms fold kept whole),
  `real` at the game's pace (what the film shows), `quick` (Rasta's walks
  between the moments, 3–5×; the earlier balloons drift on). Between
  Gittan's three moments the fast legs run with Balloons off, so nothing
  from them lingers in the sky. Commands are typed on a lane of their own,
  so typing never holds the server's text up (a typed `get coins` after
  the troll's death once pushed its XP out of the fold: 1,002 xp instead
  of 6,072).
- **Ratings.** The kill rating is the median of the chain's last 30 mob
  kills. Gittan's take restores her earlier run of that evening
  (`19-48-42`, ten kills) with its times moved to just before now, so the
  live run chains to it. The troll comes out *Good* (6,072 against a median
  of 4,304), the guard's joined sign *Good*.
- **Light.** MUME's clock pinned per take (13:30 / 21:20 / 00:05) and the
  sky's own keys pinned with `__weather.jump` (`sunU` 0.47, 0.95, night);
  the room's weather, fog and light stay the game's, so the caves and the
  hut stay dark inside.
- **UTF-8.** The mock now asks for UTF-8 (CHARSET) as MUME does; without it
  "Voïx" and "Númenórean" came out as Latin-1 mojibake.

Deviations from the manuscript:

- **Act lengths.** Title 3.0 s, Gittan about 18 s, Rasta about 26 s, the
  parade about 35 s with the end card over its last 7 s (manuscript: 5,
  27, 20, 18, 5). Each sign needs about 6 s to arrive; seven moments plus
  the parade fill the 82 s.
- **The parade's pace.** A kill that comes while the last kill's balloon is
  still arriving or readable joins its sign, whoever flies it (balloons.ts
  joins on the latest kill balloon). Three of the six are kills (superb,
  poor, PvP), so each waits for the one before to leave: the six go up at
  0, 2.6, 10.6, 13.2, 21.3, 23.9 s instead of every 3 s. At a strict 3 s
  the troll's and the orc's kills joined the dwarf's sign ("3 kills").
- **The parade's signs** are sent directly (`balloons.show(notice, {
  passenger })`, the same call `#weather balloon as` makes) with texts of
  their own: A mountain troll 20,648 xp (dwarf, Superb), "You found the
  hidden path to Rivendell!" (elf), A field mouse 140 xp (troll, Poor),
  Level 37 (human), *Brandir the Dúnadan Man* 46,200 xp (orc, PvP), You
  died (Black Númenórean). The command's samples would have put "Grimbold
  the Orc" on the orc's PvP sign.
- **The parade's room** is Gittan at the Gates of Ingrove (a field, a clear
  sky), the run's first seconds there.
- **Gittan's second moment** starts at the first mastiff: the guard's
  balloon is already coming up, and both mastiffs join it (one sign, "3
  kills", as the game gives it: the first mastiff dies 5.3 s after the
  guard, inside the arrival).
- **The title's balloon** is a still of the hobbit's rig rising through the
  card (a PNG taken off camera), its sign an achievement of its own: "You
  unlocked hot-air balloons!".

Found on the way (product, not changed): **the balloons' rating misses the
chain's earlier runs after a login.** `notices.ts` reads the chain when
the balloons start and again on `run_start`, but at `run_start` the
recorder has not yet written the run (`runId` is still empty and its
summary with `previousRunId` comes with the first chunk, up to 2 s later),
so `chainEvents()` returns the live run alone and the first kills of every
session show *calibrating*. The Statistics pane reloads and is right. The
film works around it the way a player could: Balloons switched off and on
in the take's setup, after the run is stored.

## Test guide

Open `video/out/balloon-film-h264.mp4` (or `balloon-film.mp4` in a player
with HEVC 10-bit). Look at:

1. The title: does the rising balloon and "(Because: Why not?)" work?
2. Gittan: is each sign readable long enough (troll, the joined mastiffs,
   the chest)?
3. Rasta: does the dusk show at all in the caves? Is the level 74 balloon
   beside the Dwarf's clear?
4. The parade: is the uneven pace (kills about 10 s apart) acceptable, or
   should the kills move (a different order) or the parade lose one?
5. The end card and the fade with the music.

## Owner feedback

### Round 1 (2026-11-22): a new manuscript

- Much slower; the film may be longer. The title on black, without
  "(Because: Why not?)".
- No montage of runs: Gittan stays at the fountain in Bree, the window full
  of text, some life in the room (mobs, a simulated narrate in real
  colours). Day, a bird now and then, small clouds.
- The map with border and glass, one row from the top and right edges.
- The setting shown and switched on; then the balloons, sent by typed
  `#weather balloon` commands at real speed: four goblins (calibrating,
  superb, achievement, death), then one of each other race. At most about
  three on screen.
- A caption on what triggers them, one on how many there are. Fade to
  black, then the end card.

The whole of it: `video/manuscript-balloons.md`, draft 2.
