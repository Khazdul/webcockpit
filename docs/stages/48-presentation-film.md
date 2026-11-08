# Stage 48 — Presentation film

Status: **Owner testing** (first full cut, 2026-11-08). Branch
`worktree-agent-aaa28cb01f9b220f5`.

## Goal

A presentation film of about 3 minutes: what WebCockpit is, how it works,
its best features. It is made as code, so it can be re-rendered after
every polish round:

- **Remotion** (React → MP4) in `video/`, with its own `package.json`.
- **Playwright** drives the real client against a mocked MUME WebSocket
  fed from the owner's own runs.
- The music is "Sunset Plains" by Yoiyami (CC0). On-screen text is in
  English; there is no voiceover.

The pipeline and its choices are in ADR 0133 and its addenda. The scenes
are in `video/manuscript.md`, which the main session owns. How to record
and render is in `video/README.md`.

## Owner decisions (2026-11-08)

- **Length and ending.** About 3 minutes, never longer than the music.
  The film ends in the break after the last full hit (3:06.35).
- **Captions.** English, few, plain, descriptive, with no slogans and no
  chapter cards.
  - There is one lower-third box style.
  - Don't mention tt++.
  - Show rather than tell.
  - Don't caption the map following the player.
- **The opening.** It starts on the start page in the middle of the
  night, with a shooting star after about 5 s.
  - A lower third reads *Live demo of WebCockpit 0.3.2 / Try it at
    mumecockpit.com*.
  - The film goes into Profile at about 13 s, selects khazdul, goes back,
    and presses Enter MUME.
  - The login screen is held a while.
- **In the game.**
  - There are no panes at the start. Settings turns on only Map, Timers
    and Group, each when it is needed.
  - Comm is never shown.
  - Weather effects come in when they are switched on.
  - The background goes Black → Paper → Black, with the Settings tabs
    flicked quickly.
- **The game content.** It comes from the owner's Bree session (run
  `Gittan/2026-11-08T12-07-39`), with little walking.
  - Only the second wolf fight is shown.
  - The barman's quest is shown.
  - Real names stay.
- **The pages.** Profile with an alias on the Lite form and in the
  Editor; Scripts and the Lua engine; History and the log player.
  - Spotlights uses the owner's five, with Rasta's PvP kill of *a
    Half-Elf* in the viewer.
  - Credits is built from those spotlights.
- **The beat grid.** 81 bpm, confirmed by ear. The lightning strike is on
  the drum hit at 1:19.68.
- **The pointer.** It moves like a hand, not "like an AI". After a final
  click it stays and fades.
- **The dark gradients.** They must not band. The night stays, because
  the lossless pipeline holds it; midday was the fallback.
- **Security.** MUD credentials never go in committed files. Private
  material lives in `video/private/`, which git ignores.

## Tasks

- [x] Pipeline: CDP screencast, lossless intermediate, ProRes master,
  then HEVC 10-bit, H.264 and 4K (ADR 0133).
- [x] Mock MUME feed from the run backup (`video/record/lib/run-feed.ts`).
- [x] The real MUME welcome screen, captured without credentials.
- [x] Dev-only shooting-star hook (`window.__wcSky.shoot`).
- [x] The human-like pointer, and the cursor drawn in Remotion.
- [x] The beat grid and its helpers (`video/src/beats.ts`).
- [x] The banding fix: PNG capture at DPR 1.2, then a lossless
  intermediate, then 10-bit masters.
- [x] Part 1, reworked after owner feedback.
- [x] The whole film, built from manuscript draft 3: take A and take B,
  the `Film` composition, the montage and the end card.
- [x] Polish pass:
  - [x] night sky on every start page in take B;
  - [x] no quote under the end card;
  - [x] the Timers caption after the spells land.
- [ ] Owner review of the full film, then polish rounds.
- [ ] 4K variant for upload (`npm run render -- Film --out webcockpit-demo`).
- [ ] Decide: the "Offline replay mode" client bug. Pressing Enter MUME
  before `shell.boot()` returns prints "[SYSTEM] Offline replay mode." on
  a real connection.

## Test guide

1. Open `video/out/webcockpit-demo-h264.mp4` in Firefox (the HEVC file
   `webcockpit-demo.mp4` is the better master for other players). Watch
   it with sound.
2. Check that it follows the music.
   - Profile is pressed on beat 17.
   - Enter MUME is pressed on beat 31.
   - The strike lands on the drum hit at 1:19.68.
   - Scenes change on the phrases (1:49.31, 2:13.02, 2:36.72).
   - The end card fades with the last hit.
3. Feedback wanted:
   - **The pace and the content of each scene.** Is anything too fast,
     too slow, or missing?
   - **Caption wording.** The Credits line is the least certain.
   - **The strike.** It reads mostly as a sky flash, because the bolt is
     partly behind the panes.
   - **Small things:**
     - empty boxes for about 1 s on History, Spotlights and Credits as
       they grow in;
     - Paper lands about 0.4 s after its beat;
     - the layout reflows while the Panes popup is open.
   - **The start page** captures at about 46 fps. Is it smooth enough?
   - **The montage's nine clips.** Do they fit, and should import, the
     export editor or the phone get a cut?

## Owner feedback

### Round 1 (2026-11-08, on the first full cut)

1. Part 1: the transition into Profile hitches just after the click.
2. Part 1: after Enter MUME, as the zoom starts, the sky/clouds change in
   one jump and it zooms into other clouds than those seen before.
3. Never label the pony (the "MINE" label looks ugly). Lead and group
   it, then open the Group pane and, from its settings, turn on showing
   unlabelled NPCs: shows both the pane and that an unlabelled mount
   can be shown. Group also has "Fight card" on.
4. Settings: dwell twice as long on each tab; show two more backgrounds
   besides Paper; open the font drop-down briefly (no change).
5. A pause of a couple of seconds between giving the mercenary 10 silver
   and 1 gold.
6. After the spells and the Timers caption, dwell; walk a few rooms
   instead of jumping straight into the fight.
7. The fight: show entering the room (room name) before hitting the
   wolf.
8. After the Group caption, open the Group pane's settings and hold them
   at least 5–6 s so they can be read.
9. At 1:48 the Timers pane cannot hold all timers: Timers and Group one
   row taller for the whole film.
10. Profile and Scripts: the caption first, then the pointer goes slowly
    to the menu-bar icon, hovers until its tooltip shows, then clicks.
11. Back on the start page: dwell longer there and in History; longer on
    Spotlights before clicking.
12. Credits: it presses Next though Next cannot be pressed. Show it 4–5 s,
    then press Back.
13. After Credits, back on the start page, the film is done: no montage,
    no return to the game. Stay on the start page and fade out.
14. Fit the lengths so the film lands at about the same total time.

**Outcome (2026-11-08, re-recorded, commits up to 52191b81):** all 14
done.
- (1) The Profile hitch was the page's first-open cost; Profile is now
  warmed off camera.
- (2) The sky jump came from our staging: the captured welcome screen
  synced the clock. Only the film sets the clock now.
- Map-on moved to the walk after the strike (no room before it).
- (5) The silver-to-gold gap shows only about 1.2 s (a pause cap in
  take A): to raise next round.

### Round 2 (2026-11-08, on the round 1 cut)

1. Group must not open docked to the right: a smaller floating pane,
   bottom right/middle.
2. The Group settings go too fast to see: show the gear's tooltip before
   the click, then wait a few seconds before each setting is clicked.
3. Timers also opens as a smaller floating pane next to Group. Then go
   through its settings the same way, calmly (at least 8–10 s): turn off
   Herblores, toggle the display (grid, circles, columns, back to bars).
4. The Map opens docked as now (it looks good); Group and Timers float
   over it, far down to the right, side by side.
5. No Group settings after the wolf.
6. A clearer fade or transition of the whole game window when the film
   jumps between game moments (login and mercenary, the wolf, the bar).
7. Caption: "Open the profile to create aliases, actions and keys from
   the menu or in the editor."
8. The editor's search result: about 3 s more.
9. Scripts: the rows change too fast to read; stop on Almanac.
10. History: the log plays with the small text size; the right-docked
    panes about 20 % narrower (the two columns of the right dock stay
    equally wide).
11. (Carried from round 1) The mercenary: 2–3 s between 10 silver and
    1 gold.
12. Spotlights: press **Play all** instead of opening one card; show
    just enough to see the first spotlight happen (+ about 1 s). Then go
    back less hastily: Back, Back, visibly. Credits stays (owner's
    answer): Credits 4–5 s, Back. Then the start page at least 3–5 s,
    the music fades, the end.
