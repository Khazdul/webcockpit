# Stage 76 — The balloon film

Not a spec §5 row: the owner's request of 2026-11-21. A short film of its
own (about 1:21) that only shows the balloon notices of 0.22 (stages 69
and 75). It does not replace the presentation films (stages 48 and 70).

Status: **Round 2 rendered** (2026-11-22, manuscript draft 2), waiting
for the owner.

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
- [x] Round 2 (draft 2): one take at the fountain (`balloons-fountain`),
      the typed commands, the setting on camera, the two black cards;
      round 1's scenes, feeds and helpers removed (in git at b7d18ceb).
- [x] The stutter's causes found and fixed (frame-stepped capture, the
      encoder's timebase; ADR 0133 addendum).
- [x] Round 2 render, contact sheet, motion measured on the encodes.

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

## Round 2 (2026-11-22, manuscript draft 2)

`npm run record -- balloons-fountain` (12 min), then
`npm run render -- Balloons --out balloon-film-r2 --no-4k` →
`video/out/balloon-film-r2.mp4` (HEVC 10-bit) and
`balloon-film-r2-h264.mp4`; contact sheet
`video/out/balloon-film-r2-sheet.png`. 2:54.2: the title 0:00–0:09.0, the
game 0:09.4–2:42.4 (Balloons switched on at 0:20.6), the end card from
2:43.0, the music faded 2:42.8–2:53.8 into a phrase's end.

| # | `#weather balloon as …` | Enter | Gap | At rest | Out of view |
|---|---|---|---|---|---|
| 1 | goblin calibrating | 0:27.4 | | 0:34.7 | 0:47.0 |
| 2 | goblin superb | 0:41.4 | 14.0 | 0:48.8 | 1:00.9 |
| 3 | goblin achievement | 0:53.1 | 11.7 | 1:00.5 | 1:12.7 |
| 4 | goblin death | 1:05.0 | 11.9 | 1:12.3 | 1:24.3 |
| 5 | dwarf great | 1:16.7 | 11.8 | 1:24.1 | 1:36.4 |
| 6 | hobbit levelup | 1:27.7 | 11.0 | 1:35.2 | 1:47.3 |
| 7 | troll poor | 1:38.6 | 10.8 | 1:45.9 | 1:58.0 |
| 8 | human achievement | 1:49.4 | 10.8 | 1:56.8 | 2:09.0 |
| 9 | orc meh | 2:00.4 | 11.0 | 2:07.7 | 2:19.8 |
| 10 | numenorean death | 2:11.2 | 10.8 | 2:18.6 | 2:30.7 |
| 11 | elf pvp | 2:22.1 | 10.9 | 2:29.6 | 2:42.1 |

Counted in the DOM on every frame: **at most 2** balloons in view (2 for
80.0 s, 1 for 54.6 s, none for 18.4 s), at most 3 flights alive, so the
client's early fade (5) is never reached; no sign took a second kill; the
commands printed nothing. The captions stand 0:42.9–0:58.9 and 1:29.2–1:45.2.
The map's first pixel is 22 px (one row) from the top and from the right
edge, its dark iron 25 and 25.

### The stutter

Causes (ADR 0133, addendum of 2026-11-22): the recorder's CFR step kept at
most 25 pictures a second (ffmpeg's 1/25 s image timebase); the screencast
dropped frames to the sky canvas's 30 or 12 fps; its arrival timestamps
jittered. The page held 60 fps. Fixed: the encoder's timebase for all
screencast takes, and this take is frame-stepped (1/60 s of the page's
time per frame). Measured with `record/motion.ts` on the encoded films,
in the balloons' lane (HEVC and H.264 the same):

| | Round 1, 3–82 s | Round 1, parade only | Round 2, 27.75–160 s |
|---|---|---|---|
| New pictures a second | 25.3 | 24.2 | **60.0** |
| Repeated steps | 2738 of 4733 | 1108 of 1859 | **0 of 7934** |
| Longest hold | 683 ms (lane partly empty) | 133 ms | **17 ms** |
| Holds over 33 ms | 738 | 306 | **0** |
| Worst 5 s: pictures a second | 19.2 | 19.4 | **60.0** |
| Worst 5 s: holds over 33 ms | 42 | 53 | **0** |

Per moving balloon in round 2: 0 repeats in 11,721 steps, every interval
17 ms. Speed: the first balloon against a real-time run of the same seed
differs by one frame's travel at most (2.2 px) from 1 to 17 s.

Left: the sky's cloud tufts step under 1 px at 3 fps, as in the client
(`FPS_STILL`). The take cannot show a hitch of the page's own (a
passenger's first load); that is for a live check.

### Deviations from the manuscript, and why

- **2:54 instead of about 2:30**, and the gaps 10.8–11.9 s instead of
  8–10: a balloon takes about 7.4 s to come to rest and 3 s to be read,
  and the next waits until it has moved on ("When the rules collide").
- **At most 2 on screen**, under the limit of about 3: what that spacing
  gives with flights that leave fairly soon.
- **The commands show in the input line only.** The client does not echo
  `#` commands into the game's text, and none is staged: a command is
  typed, stands 0.55 s before Enter, and stays selected in the line until
  the next is typed (about 6–8 s).
- **`dr water` is on camera**: the window is filled up to her arrival and
  `whe`, so the first act has a typed game command. The pony's label is
  left out, as in the films.
- **The flights' seeds are chosen** (only the top and right paths, clear
  of each other's signs); the birds are five crossings sent through the
  dev hook besides the sky's own.
- **The page is 1918 px wide** at x 2 of the frame: floats sit on whole
  cells, and only so is the map exactly one row from both edges. The two
  columns are black on the sky's black left band.

## Test guide

Open `video/out/balloon-film-r2.mp4` in a 60 fps player (or
`balloon-film-r2-h264.mp4`), full screen. Look at:

1. **Motion**: do the balloons, the birds and the pointer move smoothly?
2. **Pace**: is about 11 s between balloons right, and is one or two on
   screen too sparse?
3. **The commands**: is it clear that they are typed, down in the input
   line? (They do not appear in the game's text.)
4. **The setting**: is it clear what is switched on (0:15–0:23)?
5. **The room's life and the sky**: enough, or too much?
6. **The captions and the two cards**: time to read, and the music's end.

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
