# Stage 76 — The balloon film

Not a spec §5 row: the owner's request of 2026-11-21. A short film of its
own (2:57) that only shows the balloon notices of 0.22 (stages 69
and 75). It does not replace the presentation films (stages 48 and 70).

Status: **Built; closed for the session of 2026-11-22.** The film is
round 4 (`video/out/balloon-film-r4*`, copies in the owner's Downloads).
Left to the owner: the upload. The Balloons help text it shows
(`ec5bc166`) is committed and goes out with the next release; the owner
does not want a release of its own for it.

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
- [x] Round 3: the Balloons row's new help (`ec5bc166`, ADR 0159
      addendum; typecheck, unit tests, balloons e2e).
- [x] Round 3: the title's third line, the take recorded again (bird
      flocks pinned to round 2's), the music's new phrase end.
- [x] Round 3: the three files (1080p HEVC and H.264, 4K for YouTube),
      each checked; contact sheet.
- [x] Round 4: the title says MUMECOCKPIT (`3a0cf362`); rendered from
      round 3's take, compared with its master.
- [x] The YouTube title and description (end of the manuscript).
- [ ] The next release carries `ec5bc166` (the Balloons help text).
- [ ] The owner: the last look and the upload (the music credit in the
      description from the first moment).

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

## Round 3 (2026-11-22, manuscript draft 3): the final film

`npm run record -- balloons-fountain` (12 min), then
`npm run render -- Balloons --out balloon-film-r3` (18 min, with the 4K
file: `record/master.ts`, as film 2's upload). In `video/out/`:

| File | Format |
|---|---|
| `balloon-film-r3.mp4` | 1920×1080, HEVC Main 10, yuv420p10le |
| `balloon-film-r3-h264.mp4` | 1920×1080, H.264 High, yuv420p |
| `balloon-film-r3-youtube.mp4` | 3840×2160, H.264 High 5.2, yuv420p, about 17 Mbit/s: **the upload** |
| `balloon-film-r3-sheet.png` | the contact sheet |

All three: 177.4 s (2:57.4), 10,644 frames, exactly 60 fps.

| | Round 2 | Round 3 |
|---|---|---|
| The title's third line | – | in 0:07.2–0:07.9, whole until 0:11.4, all out by 0:12.7 |
| The game starts | 0:09.4 | 0:13.1 |
| Balloons switched on | 0:20.6 | 0:24.3 |
| Captions | 0:42.9–0:58.9, 1:29.2–1:45.2 | 0:46.6–1:02.6, 1:32.9–1:48.9 |
| The game out | 2:39.4–2:42.4 | 2:43.1–2:46.1 |
| End card | from 2:43.0, whole 6.9 s | from 2:46.7, whole 2:48.0–2:55.0 (7.0 s), out by 2:57.0 |
| Music fade | 2:42.8–2:53.8 | 2:46.0–2:57.0 |

Every balloon's times are round 2's plus 3.7 s.

- **Nothing else changed.** Against round 2's take (`out/round2-takes/`):
  balloon boxes 0 px apart on all 9,181 frames, the keys and the four
  presses identical, text, input line and map pixel-identical. The panel
  keeps its size and the switch its place.
- **The birds.** Their flocks were random per take (the sky worker's
  `Math.random`), so a new take would have flown others. They are now
  pinned to round 2's, measured bird by bird (`FLOCKS` in
  `feeds/balloons.ts`): the same 20 birds in six flocks, five flocks
  within 3 px, the big one 12 px ahead. The wing beats differ.
- **The music** ends at 177.0 s: the harmony turns there, on its 4 s
  grid, and the next phrase's downbeat strikes at 177.04. It is at
  −34.6 dB at 2:54, −56.2 at 2:56 and silent from 2:56.75. The end card's
  fades are a little shorter (in 1.3 s, out 2.0 s; were 1.5 and 2.4) so
  it keeps its read time without waiting for the next phrase end.

### Motion

`record/motion.ts` now looks at the whole lane (x 1040–1920, y 0–1056,
the map left out) and at each balloon, and lists nearly still steps
besides exact repeats (round 2's check saw neither the top of the lane nor
a slow balloon, and missed the step at 1:59.433).

- **No repeated frame in any of the three files**: 60.00 new pictures a
  second from 0:31.4 to 2:45.8, also in the worst 5 s.
- Nearly still steps (under 35 % of the steps round them), 21–26 a file,
  single frames but for slivers: a balloon's first or last sliver at the
  edge (it moves on every frame), or a balloon at rest whose position the
  client rounds to 0.1 CSS px (`balloons.ts` `toFixed(1)`), so that now
  and then one frame's 0.12 px step is 0. Round 2's 1:59.433 is one of
  these: in the take and the master, not from the encoder; here it is
  2:03.133. No hold over 34 ms but in those slivers. Not changed: product
  code, and 0.12 px.

## Round 4 (2026-11-22): the title's name

The owner: the title shall say MUMECOCKPIT, not WEBCOCKPIT, without doing
all of it again. One line in `Balloons.tsx` (3a0cf362), rendered from
round 3's take as `out/balloon-film-r4*`; nothing recorded again. Against
round 3's master: the title differs, the audio is identical, and after
the title only 19 frames (18.87–19.95 s) differ, in the antialiasing of
the drawn pointer at the Settings icon. Upload r4,
not r3. The presentation films still say WebCockpit on their cards.

## Test guide

Open `video/out/balloon-film-r4-youtube.mp4` (or
`balloon-film-r4.mp4` on a 1080p screen) in a 60 fps player, full screen:

1. **The title**: MUMECOCKPIT 0.22; the third line at 0:07–0:08, long enough, then the game
   at about 0:13.
2. **The setting** (0:19–0:26): the new description reads well.
3. **The end**: the end card long enough, the music's last phrase.
4. **The upload**: `balloon-film-r4-youtube.mp4`, with the title and
   description at the end of `video/manuscript-balloons.md`. The credit is in the
   description from the moment of upload (Content ID):
   `'Into The Wilds' (edited) by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au`
   Afterwards look at YouTube's 2160p60 for smoothness.

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

### Round 2 (2026-11-22): approved, with two changes

"JAg gillar inte beskrivningen av "Balloons" i weather effects menyn. Vi
behöver inte lista så exakt alla saker som skapar ballonger. Gör om den
till något i stil med att en "companion i en luftballong" reagerar på
händelser från spelet. Lägg till det där vi pratade om tidigare: nobody
asked we did it anyway. Den kommer ca 7-8 sekunder in och visas ca 3-4
sekunder. Sen börjar vi. Bygg sen om också kör vi på detta."

- The Balloons row's help says that a companion in a hot-air balloon
  reacts to what happens in the game, without listing the events.
- The title gets its third line, *(Nobody asked. We did it anyway.)*, at
  7–8 s for 3–4 s; then the film starts.
- Then build it: this is the film.

`video/manuscript-balloons.md`, draft 3.

### Round 3 (2026-11-22): the title's name

"Det står WEBCOCKPIT i början. Det ska stå MUMECOCKPIT. Kan vi åtgärda
det utan att göra om allt?" → round 4.

### The release (2026-11-22)

"du behöver inte releasa än. commita så tar jag det vid nästa release."
