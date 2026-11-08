# Presentation film — manuscript

Draft 4 (2026-11-08): the first full cut as built (from draft 3, with
every owner comment so far). Next: polish with the owner. Times are music time in "Sunset Plains" by Yoiyami (CC0,
`public/music/sunset-plains.wav`).

## Rules from the owner

- About 3 minutes, never longer than the music. The film ends in
  the music's near-silent break after 3:06.35 (black by about 3:10).
- **Few captions, plain and descriptive, no slogans.** No chapter cards;
  only the opening and end cards sit mid-frame. Don't mention tt++.
  Show rather than tell. Don't caption what the eye already sees (the map
  following the player).
- Little walking: a room or two, with something happening in the game
  while menus are shown.
- No zooms in practice (kept available). Capture is PNG at DPR 1.2,
  lossless into 10-bit masters (ADR 0133).
- Real player names stay (owner, 2026-11-08).
- No panes when the game starts; Settings turns on only Map, Timers and
  Group, each when it is needed. **Comm is never used.**
- Captions sit in one lower-third box style (bottom left). The pointer
  moves like a hand: straight to targets, no waypoints; after a final
  click it stays and fades out.
- Dark gradients must not band (night sky, storm). If the pipeline cannot
  hold them, switch the start page to midday (owner, 2026-11-08).

## Beat grid (confirmed by the owner's ear, 2026-11-08)

**81 bpm**, one beat = 0.740741 s. Beat n sits at 0.4248 + n × 0.740741 s;
bars start on n ≡ 3 (mod 4) (the high click in the check track was on the
downbeats from 1:25). A first estimate of 82.77 bpm drifted and was
rejected by ear.

- **1:19.68** (beat 107, a downbeat): the big drum hit, by far the
  strongest low-end onset in the track. **The lightning strike goes here.**
- **1:25.61** (beat 115): the groove and the theme with drums; 32-beat
  phrases from here: 1:25.61, 1:49.31 (guitar), 2:13.02, 2:36.72.
- Before the drums, 16-beat phrases: 0:14.51, 0:26.36, 0:38.21, 0:50.06,
  1:01.91, 1:13.76. Quiet dip 1:13–1:16.
- The end: the last full hit is **3:06.35** (beat 251); the tail rings
  down to near silence by 3:11.5 and the music restarts at 3:12.28. The
  end card holds to 3:06.35, then fades with the tail; black by about
  3:10.

Cuts and events are placed by beat number (Remotion helper), not seconds.

## Sources

- Game: the owner's Bree session, run `Gittan/2026-11-08T12-07-39` in
  `private/film-runs.jsonl.gz` (time from the run's `startedUs` → content; the run opens in the Prancing Pony's Lodging Foyer): 0:07–0:24 pony,
  group, label, `where` at the fountain; 1:05–1:22 the mercenary hired
  (Tod); 1:28–1:42 west gate, shield/arm/invis; 2:05–2:31 the second wolf
  (attack, Tod joins, assist, kill, butcher); 2:41–4:14 the barman's quest.
- Spotlights and Credits: the five spotlights in the same backup (Rasta
  pkill 2026-09-29 — the owner's pick for the viewer; Gittan 2026-10-11
  pkill Kohrn, achievement, level 45; Gittan 2026-11-02 pkill "a Woman").
- The MUME login screen: the server's welcome text, captured once from
  `wss://mume.org/ws-play/` without logging in.
- The weather is staged with the dev hook (the storm and the strike);
  everything else in the game is the real session, time-compressed.

## Scenes

Part boundaries are where takes may join; within a part the action is
continuous. Game content is the real run, time-compressed, in its real
order; only the weather is staged.

| Music | Picture | Caption |
|---|---|---|
| **Part 1** 0:00–0:13 | Start page in the middle of the night (MUME 00:05, faint clouds, stars); the client's own shooting star at 0:05.0 (dev hook). | Lower third, beats 3–15: *Live demo of WebCockpit 0.3.2* / *Try it at mumecockpit.com* (version read at render time) |
| 0:13–0:23 | Profile pressed on beat 17 (0:13.02); khazdul Selected on beat 23; Back on beat 27. | *Profiles hold your basic settings.* |
| 0:23–0:38 | Enter MUME on beat 31 (0:23.39); the pointer stays and fades. MUME's real welcome screen up by about 0:28, held about 3.5 s; name Enter beat 43, password (masked) Enter beat 47. | — |
| 0:35.9–0:44 | MUME's post-login lines; Gittan arrives in the Prancing Pony's Lodging Foyer: room, people, prompt, a moment of life. No panes. No fade: the game continues. | — |
| **Part 2** 0:44–1:06 | In the game: lead pony, group it, label it, two rooms south to the fountain (outdoors). Settings opens from the menu bar on beat 69: tabs flicked on beats 71–73, ending on **Weather effects**; the switch goes on (beat 75) and the night sky fades in over the client (a clear night is pinned; the run says late afternoon). `where` after Settings closes (popups take the keys). Then Appearance: background **Black → Paper** (1:00.8, about 0.4 s after beat 81), held, back to **Black** on beat 85. | At the switch: *Weather effects follow the game.* — at Paper: *Customise fonts, colours and more.* |
| 1:06–1:15 | Panes from the menu bar: **Map** on at 1:08.4 (the map follows by itself, no caption); the mercenary hired (10 silver refused, 1 gold), **Group** on at 1:15.2 as Tod joins (`label Tod` dropped; the label arrives through GMCP). | — |
| 1:15–1:19.68 | Out of the west gate; rain from 1:15.6, heavy from 1:17.9; **Timers** on at 1:18.4. | — |
| **Part 3** **1:19.68** | **A lightning strike on the drum hit** (beat 107, flash measured at 1:19.65); shield, armour and shroud fill the Timers pane. | From about 1:23.6, 4 s: *The Timers pane tracks spells, buffs and more.* |
| 1:23–1:33 | The second wolf only: attack, Tod joins, assist, the kill, butcher. | 1 s after the Timers caption, until the cut: *The Group pane shows your group and follows your fights.* |
| 1:33.02–1:49 (cut on beat 125) | Back into the inn (a short cut); the barman looks up, offers the quest, Gittan nods. | — |
| 1:49.31–2:13 | The barman's monologue goes on behind. **Profile** window from the menu bar on beat 147: the alias `fk` → `kill wolf` on the Lite form (1:51.9), then **Editor** (1:56.5; Find jumps to the alias). Then **Scripts** (about 2:01.9): rows flicked on beats 165–171, ending on Mercenaries, its settings and help shown. | *Create aliases, actions and keys from the menu or in the editor.* — *A Lua scripting engine for anything more complex.* |
| **Part 4** 2:13.02–2:25 | Exit on beat 179 to the start page (night, the film's own clock); **History**: the Bree session chosen, its log player (2:17.5) replays the session a few seconds. | *Every session is saved and can be replayed.* |
| 2:25.2–2:36.72 | **Spotlights** wall with the five cards (viewer at 2:27.8); Rasta's PvP kill (*a Half-Elf*) opens in the viewer and plays. | *Spotlights collect your kills, deaths, level-ups and achievements.* |
| **Part 5** 2:36.72–2:44 | **Credits**: the book, a page turned on beat 215. | *Credits tell your characters' story as a book.* |
| 2:44–2:58 | Montage, beats 221–239: nine two-beat cuts from the film (the shooting star, the sky fading in, the Paper flip, the map, the strike, the wolf, the editor, the log player, the spotlight). No captions. | — |
| 2:58–3:10 | End card from beat 239 over the night start page (quote hidden), same box style, centred low: *WebCockpit 0.3.2* / *mumecockpit.com · Free and open source*. From the last full hit (3:06.35) it fades with the ringing tail; black by about 3:10. | (the card) |

## Open

- Polish after the owner has seen the whole film. Known: the strike
  reads mostly as a sky flash (the bolt is partly behind the panes);
  History, Spotlights and Credits show an empty box for about 1 s as
  they grow in; Paper is 0.4 s late; the layout reflows while the Panes
  popup is open.
- Caption wording is draft; the Credits line is the least certain.
- Not in the film for now: import, the export editor and HTML replay,
  the phone. Possibly one cut each in the final montage.
