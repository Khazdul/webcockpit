# Stage 78 — The Character pane film

Not a spec §5 row: the owner's request of 2026-11-25. A short film of its
own (3:06, the length of its music) that shows the Character pane of 0.23.0
(stage 77) through a small adventure of Gittan's. It does not replace the
presentation films (stages 48 and 70) or the balloon film (stage 76).

Status: **Round 1 being built** (2026-11-25, the owner: "kör på").

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
