# Stage 78 — The Character pane film

Not a spec §5 row: the owner's request of 2026-11-25. A short film of its
own (3:06, the length of its music) that shows the Character pane of 0.23.0
(stage 77) through a small adventure of Gittan's. It does not replace the
presentation films (stages 48 and 70) or the balloon film (stage 76).

Status: **Built: round 3 is the film** (2026-11-26). Left to the main
session: the YouTube title and description; to the owner: the upload.

The manuscript and the owner's decisions are in
`video/manuscript-character.md` (draft 3), which the main session owns.
The pipeline is ADR 0133's (`video/README.md`); the balloon film
(stage 76) is the nearest example.

## Material

- Gittan's run `~/Downloads/Gittan-2026-11-25T18-59-11.log` (629 s, played
  for the film): Bree → coach → Tharbad, the bakery and the bandit, the
  tarantulas and the poison, four stored earthquakes, the bandit again, a
  pie, the coach home.
- Stats and Lore values from the owner's screenshots (the manuscript);
  the poll's answers are not in the run log by design.
- Music: *No Good Layabout*, Kevin MacLeod, CC BY 4.0,
  `video/public/music/no-good-layabout.mp3` (local; licence file in
  `~/Downloads/charpane-musik/`).

## Tasks

- [x] Music: two rounds of ten; *No Good Layabout* chosen 2026-11-25.
- [x] The run played by the owner; manuscript drafts 0–3 with his answers.
- [x] The run into the film's private runs (`node record/character-runs.ts
      <log>` → `private/character-runs.jsonl.gz`); the take spec in
      `video/feeds/character.ts`.
- [x] The mock answers the hidden info poll with Gittan's values.
- [x] Staged lines: the narrates; the clicks that replace `r`, `ag`, `wi`
      and the failed `cha spellspeed quick` (with the game's own answers).
- [x] Scene (`record/scenes/character.ts`, `character-tour`): the mapper on,
      the Character pane on (floating, Medium), the tour in the coach, a
      Paper glimpse, the dock above the mapper.
- [x] Composition `Character`: title, captions, end card with the music
      credit; 3:06.
- [x] Round 1 render and contact sheet for the owner.
- [x] Round 2 and round 3 previews; round 3 approved with no fight caption.
- [x] Round 3: the full-quality take, the sharp posters, the three files.
- [ ] The YouTube title and description (end of the manuscript).

## Round 1 (2026-11-25)

`npm run record -- character-tour` (frame-stepped, 12–17 min), then
`npm run render -- Character --out character-film-r1 --no-4k` →
`video/out/character-film-r1.mp4` (HEVC 10-bit) and
`character-film-r1-h264.mp4` (copy in the owner's Downloads); contact
sheet `video/out/character-film-r1-sheet.png`. 3:06.35, the music's whole
length; it ends by itself.

| Film | Beat | The card |
|---|---|---|
| 0:00–0:08 | Title: MumeCockpit 0.23, *The Character pane.* | — |
| 0:09.6 | `l` at Mason Road (the room as MUME showed it to Gittan in her run of 11-08) | off |
| 0:12.4 | Panes → Map: docked right, finds Mason Road | off |
| 0:15.75 | "The coach from Fornost has arrived." | off |
| 0:17.8 | Panes → Character: floats in the middle, Medium (38 × 9 cells of content) | Status; caption "The Character pane." |
| 0:22.8, 0:28.4 | `st`, `enter coach` typed | standing |
| 0:29.8 | — | caption Status |
| 0:34.0 | click on the position icon: `rest`, "You sit down and rest your tired bones." | resting |
| 0:37.0 | the tour while the coach waits: Stats | STR 12, age, senses; caption |
| 0:41.6 / 0:43.4 | Lore, scrolled by the wheel | race … purse; caption |
| 0:45.0 | Fenwick narrates | |
| 0:47.0 / 0:48.4 | Status again; the level ring's tooltip (Level 45, XP 89 %) | |
| 0:52.0 | click on Mood: `change mood prudent` echoed, the cell pending, "Ok." and GMCP | prudent; caption "A click sends the command." |
| 0:58.8 / 1:01.8 | dragged by its title to the top right edge: docked above the map; made five rows taller by the seam | Large; caption "It fits any size." |
| 1:03.3–1:11.2 | Settings → Appearance → Background: Paper (1:07.2–1:10.4), back to Black | the Paper card |
| 1:11.7 | "You feel stronger." (the ring) | stones; caption |
| 1:18–1:27 | Tharbad, the bakery closed, the bandit, the flight, `wimpy 100`; Mirel narrates | the swords for a blink; the wimpy arrow at 100 |
| 1:27–1:40 | invisible, the north gate, the locks, the stone building | shroud stone |
| 1:40.0 / 1:44.0 | the tarantulas; poisoned; flee up; remove poison | swords; the poison stone; caption |
| 1:53.0 | Thorgrim narrates; camp fire, four stored earthquakes | mana 137 → 119 → 102 → 82 → 61 |
| 2:02.4 | click on the position icon: `rest` by the fire | resting; then the herb, the brew (mana /152) |
| 2:20.8 | down; the quakes | fight |
| 2:30.0 | both tarantulas dead (the track's peak) | the XP ring; caption |
| 2:34.6 | Odalric narrates; back to the bakery | |
| 2:42.3–2:44.2 | three clicks on Mood in the fight: normal, brave, aggressive | |
| 2:45.2 | click on Casts: `change spellcasting careful` | careful |
| 2:49.7 | click on Mood after the kill: `change mood wimpy` | wimpy |
| 2:50.5 | `buy pie` ("six copper"), `eat pie` | purse 48 → 42 copper (at the next poll) |
| 2:52.1 | the wait for the coach home cut (a dip to black) | |
| 2:56.2 | aboard; Sigrun narrates | resting |
| 2:59.3 | "The coach starts moving towards Bree and Fornost." | |
| 3:01.4–3:06.35 | the end card: Turn it on under Panes → Character; mumecockpit.com; the music's credit | |

How the take is made:

- **One take on the frame clock.** The run plays in legs (`LEGS` in
  `feeds/character.ts`, log seconds → take seconds): real pace where the
  card is shown (the coach's arrival, the bakery, the tarantulas, the
  quakes), 1.6–3.7× for the walks and the camp, 9× for the ride, one cut
  (the wait for the coach home, 117 s of log). Commands are typed on
  camera where their leg plays at 1.8× or slower and no menu is open,
  else sent as a typed command is (the same echo).
- **The poll.** The mock answers every `info WC<nonce>[…]` with Gittan's
  values at that moment of the run: the shields of the run's own
  `WebCockpit.Shields` records, the vitals of its GMCP (`xxx` in a fight),
  the affects of its three `stat` lists, wimpy 204 → 100, the purse 48 →
  42 copper after the pie, STR 12 (+2 from "You feel stronger"). 18 polls
  answered; none showed in the game pane. Prompts go as XML prompts, as
  the poll waits for one; the login's width commands get MUME's `Ok.`.
  Gittan's sex is remembered before login, so no probe goes.
- **The clicks.** Each is the card's own command (`sendCommand`, echoed as
  the product does), and the mock answers it a pulse (0.35 s) later in
  MUME's form (`Ok.`, GMCP; `rest`: the run's own lines). The run's `r`,
  `ag`, `wi` and `cha spellspeed quick` and their answers are left out.
- **Staged beyond the run:** the `l` at Mason Road (the room as MUME
  showed it in Gittan's run of 2026-11-08), the five narrates, Room.Info
  sent again once the map has read its file, and the mana after the first
  and the third stored earthquake (119, 82: MUME sent only 102 and 61).
- **The map's worker** starts on camera, after the take froze time: the
  frame clock now lets a late worker join (`frame-clock.ts`).
- **The dev server** for the take ran from a clean worktree at `main`
  (another session was editing `src/` and Vite reloaded the page mid-take
  once).

Deviations from the manuscript:

- **The order in the coach:** the dock comes before the Paper glimpse
  (Settings opens over the middle of the screen, where the card floated).
  The dock is a drag to the right edge, then a resize by the seam (9 → 14
  rows), which is the "fits any size" moment.
- **Mood by clicks:** the card steps through the cycle, so the tour's
  click leaves Gittan prudent, the fight takes three clicks (normal, brave,
  aggressive) for the run's one `ag`, and `wi` is one click. The flight at
  the bakery comes while she is prudent (the wimpy flees her all the same).
- **Casts:** one click is normal → careful, not the owner's quick (three
  more clicks would have been needed in the fight).
- **STR before the ring:** 12 with no +2, as the owner said; after it 12
  (+2), so the unaffected value answered is 10 (a 12 → 12 change).
- **Lengths:** title 8 s; Mason Road 0:08–0:34; the tour 0:34–1:11 (the
  rings come at 1:11, not 1:10); the take ends 3:01.4 and the end card is
  readable about 3.9 s.
- **No Gittan answer** to Sigrun (the echo of one's own narrate is not
  confirmed).
- **Stones:** what the product shows from the run (Timers' own trackers);
  the ring's strength shows as the product classes it.

Found in the product (not changed):

- **An open Settings list closes when the game's text arrives.** The
  dropdown (`src/chrome/popups/controls.tsx`) closes on any scroll outside
  it, and the game pane's own scroll as new lines come in is one: while
  MUME is talking, a player cannot pick from Background, Font and the like.
  The take holds the game's text for the second the list is open.

## Test guide (round 1)

Open `video/out/character-film-r1-h264.mp4` (or the copy in Downloads),
full screen, with sound:

1. **The tour (0:34–1:11):** Is the floating card large enough to read?
   Too fast or too slow? Should the composition zoom into it?
2. **Mood by clicks:** prudent in the coach and three clicks in the fight:
   acceptable, or should the tour's click go elsewhere?
3. **Captions:** the nine, their wording and place (high on the left).
4. **The end:** is the end card long enough before the music ends?

## Round 2 (2026-11-25, manuscript draft 4): the preview

The owner's review copy first, at phone quality:
`/home/ole/Downloads/character-film-r2-preview.mp4` (960×540 H.264,
yuv420p, AAC, faststart, 3:06.35). How: the same frame-stepped take at a
quarter of the pixels (`npm run record -- character-tour --mode
intel-0.6-png`, 7.5 min), the composition rendered at `--scale=0.5`, the
posters from the 2560×1440 PNGs. Timing, story and the end are the final
film's; only the sharpness is not. The full-quality take, the sharp
posters and the 1080p files wait for the owner's OK on the preview.

| Film | Beat |
|---|---|
| 0:00–0:07 | Title |
| 0:09.7 | Map on (docked right), finds Mason Road (the `l` is in the window from the start) |
| 0:12.9 | Gittan types `narr off to tharbad! …`; MUME's own-narrate echo |
| 0:15.6 | The coach has arrived; Character on: floats in the middle, Medium; caption |
| 0:17.8 / 0:20.8 | `st`, `enter coach` |
| 0:22.2 | Click on the position icon: `rest` |
| 0:24.4 | The level ring's tooltip |
| 0:27.6 | Thorgrim narrates |
| 0:30.8 | Panes → Comm: docked under the map, borderless and clear, Public, 16 rows |
| 0:33.4 / 0:39.0 | Mirel narrates; Gittan answers (`narr hobbits have no boots …`) |
| 0:43.2 / 0:46.2 | The card docked above the map, then five rows taller; caption "It fits any size." Lane: Character 14, map 17, Comm 16 |
| 0:51.7–0:54.9 | Paper, back to Black |
| 1:00.1 | "You feel stronger."; STR 10 → 12 (+2) at the next poll; caption (stones) |
| 1:05–1:11 | The bakery closed; `glare`; the bandit; the flight; `wimpy 100` |
| 1:15.7 / 1:17.0 / 1:20.4 | Gittan: `narr assaulted in the bakery …`; Odalric; Gittan: `narr hiding in a little stone house …` |
| 1:20.7 / 1:24.7 | The tarantulas; poisoned; caption |
| 1:28.3 / 1:32.5 | Flee up; Gittan: `narr attercop! …`; remove poison |
| 1:33–1:48 | Camp fire, four stored earthquakes (mana in four steps); 1:41.1 click on position (`rest`); herb, brew |
| 1:49.7–1:57.5 | Down; the quakes; both dead: one balloon, "2 kills"; caption (the XP ring) |
| 1:59.4 | Sigrun narrates |
| 2:06.5 | `ag` typed (the run's) |
| 2:11.9 | The bandit dead: a balloon rated *meh* (650 xp against the chain's median of 1,260) |
| 2:12.3 | Click on Mood: `change mood wimpy` (the cycle's wrap); caption "A click sends the command." |
| 2:13.5 / 2:15.8 | `buy pie` ("six copper"), `eat pie` |
| 2:16.6 | Staged: Event.Achieved and "Achievement unlocked: Procured a pork-pie in Tharbad." |
| 2:24.1 | Its balloon at rest; the picture stands still from 2:24.4 |
| 2:28.1–2:30.1 | Everything but the balloon fades to black |
| 2:30.1–2:35.1 | The balloon alone (the loud bar at 2:30) |
| 2:35.1–2:37.1 | The balloon fades |
| 2:37.1–2:55.8 | Three posters, 6.7 s each, 0.7 s cross-fades, a push-in 1.00 → 1.04 |
| 2:55.1–3:06.35 | The end card (the balloon film's style), to the last frame |

How, beyond round 1:

- **Narrates.** Hers are typed in the input line (`narr …`) and answered in
  the fixture's form (GMCP `Comm.Channel.Text` talker `you`, the yellow
  `You narrate '…'`, a blank line, the prompt); the others' as round 1.
- **Balloons.** Weather effects on for the balloons alone (sky, weather,
  fog, darkness and the rest off, so the window looks as in round 1); the
  hobbit passenger follows her race. The ratings are honest: Gittan's run
  of 2026-11-02 (seven kills, median 1,257) is restored with its times
  moved to end 90 s before the take's run, so the live run chains to it
  (and the balloons are switched off and on in the setup, the balloon
  film's workaround). The tarantulas die in one pulse and share a sign
  ("2 kills"); its face is the joined kill's (*superb*). The bandit's
  650 xp is *meh*.
- **The end.** At the achievement balloon's rest the page is shot once
  more with only that balloon drawn (`public/recordings/character-balloon.png`,
  transparent); the composition stands the take still at that frame (the
  balloon moves on after about 4 s at rest), fades it under the cutout,
  then the cutout itself.
- **Comm's height.** The map's place in the lane is 18 rows before the
  take, so the card's dock and resize take their rows from the map and
  Comm keeps its 16.
- **The frame clock** gives a worker born after the freeze 60 s to answer
  a step: the map reading its file once took more than the 8 s.

Deviations from draft 4:

- The beats run 1–2 s from the table here and there (Character on at
  0:15.6, Tharbad's ring at 1:00, the achievement at 2:16.6, the
  balloon's rest at 2:24.1); the balloon alone sits on 2:30.1–2:35.1 as
  asked.
- The tarantulas' joined sign has the *superb* face: that is the kill's
  rating, which the product draws on a joined sign too.

## Round 3 (2026-11-25, manuscript draft 5): the preview

`/home/ole/Downloads/character-film-r3-preview.mp4` (960×540 H.264,
yuv420p, AAC, faststart, 9 MB, 3:06.35), made as round 2's preview (the
stepped take at `--mode intel-0.6-png`, the composition at
`--scale=0.5`). The played text for the owner's next edit:
`/home/ole/Downloads/character-film-r3-spellogg.txt` (`node
record/character-played.ts <run log> <out>`; the same ids, and exactly
the L-lines of his edit). The full-quality take waits for his OK.

| Film | Beat |
|---|---|
| 0:00–0:07 | Title |
| 0:09.7 | Map on (docked right) |
| 0:12.9 | `narr off to tharbad! …`, `Ok.` |
| 0:13.9 | The coach from Fornost has arrived |
| 0:15.6 | Character on: floats in the middle, Large (46 × 20 cells); caption |
| 0:18.3 / 0:21.8 | `st`, `enter coach` |
| 0:23.2 | Click on position: `rest` |
| 0:26.9 | Thorgrim (14 s after her narrate) |
| 0:30.1 | Comm on: under the map, borderless, clear, Public, 16 rows |
| 0:32.2 / 0:38.4 | Stats, Lore (6.2 s each, a caption each) |
| 0:44.6 | Status again |
| 0:45.4 | Mirel |
| 0:47.0 | The ring's tooltip |
| 0:53.2 / 0:56.2 | Docked above the map, five rows taller; caption "It fits any size." |
| 0:57.9 | `narr hobbits have no boots …`, `Ok.` (12.5 s after Mirel) |
| 0:58.5–1:04.6 | `stat`, the walls, `eq` (its labels back), the rings: Lethargy's stone (1:02.6), "You feel stronger" (1:04.6) |
| 1:05.1 | West Alley; Tiredness's stone (1:05.8); `st`; east to the fountain (1:09.2), a drink |
| 1:12.4–1:15.6 | North, east, `open exit`, east: the bakery |
| 1:17–1:24 | Closed; `glare`; the bandit; the flight; `wimpy 100` |
| 1:25.3–1:31.1 | South, east, east, north, north: before the north gate |
| 1:35.4 | `narr assaulted in the bakery …`, `Ok.` |
| 1:41.7 | `invis`; the shroud |
| 1:46.6–1:58.0 | (the owner's cut) back to the bakery; Odalric at 1:47.6 (12.2 s after "assaulted") |
| 1:58.1 | The bandit; caption (fight); the baker; `cast n 'lightning bolt'`; `ag` (2:08.0) |
| 2:17.3 | The bandit dead; caption (the XP ring) |
| 2:17.8 | Click on Mood: `change mood wimpy`; caption "A click sends the command." |
| 2:19.0 / 2:21.3 | `buy pie`, `eat pie` |
| 2:22.0 | The achievement (staged) |
| 2:29.35 | Its balloon at rest |
| 2:32.35–2:36.35 | Everything but the balloon fades |
| 2:36.35–2:40.35 | The balloon alone, flying on |
| 2:40.35–2:44.35 | The balloon fades |
| 2:44.35–2:58.05 | Three posters, still, 4.9 s each, 0.5 s cross-fades |
| 2:57.55–3:06.35 | The end card (8.8 s) |

How, beyond round 2:

- **The owner's edit** decides the run's text: the log lines he left out
  are `DELETED_LINES` (227–271, 348–352, 500–1002). Their GMCP goes with
  them (the rooms of the stone house and the way back are not played; the
  bars stay true by the next values). The XP those stretches gave (the
  tarantulas', 10,933) is taken off every later Char.Vitals xp, so the
  ring grows only at the bandit. Kept: every GMCP line between kept text.
- **eq.** The mock now escapes `&`, `<`, `>` in every text line it sends
  (MUME's XML mode); prompts were escaped already. The list is back and
  left-aligned.
- **Her own narrates:** the game window gets only `Ok.`; Comm keeps the
  narrate (Comm.Channel.Text, talker `you`).
- **The balloon's own layer.** Balloons are off until 2:19.5 (switched in
  the settings, no UI), so only the achievement gets one. From 2.5 s
  after its rest every frame is shot twice in the stepped take: the
  frame, then the page with only the `.wc-balloon` drawn on a
  transparent background (786 PNGs in `public/recordings/
  character-balloon/`). The composition lays those over the take frame
  for frame, so the balloon keeps moving while the rest fades.
- **Posters** still; their length is what leaves the end card 8.8 s
  (4.9 s each here).

Found in the product (not changed): **"You feel stronger." gives no
stone.** Lethargy's ("a sudden loss of energy") and Tiredness's ("… the
strength that welled within you subsides") stones come with their lines,
but the topaz ring's strength (L0297–L0301) shows no buff stone; the poll
still lists `strength` and STR shows 12 (+2).

Left over: the card's Lore at Large still shows "↓ more" (the birthday
is under the fold).

### Round 3 final (2026-11-26)

The owner approved the preview with one change: no fight caption
(f7387d9e). Nothing else changed: the full-quality take (`npm run record
-- character-tour`, 12.6 min) has the preview's times to the frame (the
balloon at rest at take 142.35 s, 786 balloon-only frames, 17 polls, the
same five answers), now at 1920 × 1080; the balloon's frames too.

`npm run render -- Character --out character-film-r3` (17 min). In
`video/out/`:

| File | Format | Size |
|---|---|---|
| `character-film-r3.mp4` | 1920×1080, HEVC Main 10, yuv420p10le | 40 MB |
| `character-film-r3-h264.mp4` | 1920×1080, H.264 High, yuv420p (copy in the owner's Downloads) | 45 MB |
| `character-film-r3-youtube.mp4` | 3840×2160, H.264 High, yuv420p: **the upload** | 312 MB |
| `character-film-r3-master.mov` | ProRes 4444 master | 10.2 GB |
| `character-film-r3-sheet.png` | the contact sheet | |

All three: 186.35 s (3:06.35), 11,181 frames, exactly 60 fps, AAC 48 kHz
stereo (the music, mean −19.8 dB at 2:30), the end card's credit legible
(checked on the 4K frame). On the sheet: the captions, the eq list with
its labels, the Large card's Stats and Lore, the balloon's fades, the
three posters, the end card.

**The posters, sharp.** The poster session's sources are in
`video/record/posters/` (committed; `shots/` local). The card shots are
now taken at scale 4 (`capture.ts`, `POSTER_SHOT_DSF`), the pages
rendered at scale 2 (`render.ts`): 5120 × 2880 PNGs in
`video/public/posters/` (gitignored). `render.ts` reports every shot's
pixels against the device pixels it is drawn at: the least 1.00 (the
fight card), so no poster pixel is ever enlarged, in the 1080p files or
the 4K one (round 2's shots were 0.50–0.64 at that size). In the render's
frames the posters match their sources downscaled.
