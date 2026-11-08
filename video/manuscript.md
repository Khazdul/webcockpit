# Presentation film — manuscript

Draft 3 (2026-11-08): every owner comment so far folded in. The owner
asked for the whole film to be built from this, autonomously, then
polished together. Times are music time in "Sunset Plains" by Yoiyami (CC0,
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
- No zooms in practice (kept available). Capture at DPR 1.5 (about 58 fps,
  ADR 0133).
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
| 0:38–0:50 | MUME's post-login lines; Gittan arrives in the Prancing Pony's Lodging Foyer: room, people, prompt, a moment of life. No panes. No fade: the game continues. | — |
| **Part 2** 0:50–1:06 | In the game: lead pony, group it, label it, two rooms south to the fountain (outdoors), `where`. Meanwhile Settings opens from the menu bar: tabs flicked on the beat, ending on **Weather effects**; the switch goes on and the night sky fades in over the client. Then Appearance: background **Black → Paper**, held a moment, back to **Black**. | At the switch: *Weather effects follow the game.* — at Paper: *Customise fonts, colours and more.* |
| 1:06–1:13 | Panes from the menu bar: **Map** on (the map follows by itself, no caption); the mercenary hired (10 silver refused, 1 gold), **Group** on as Tod joins. | — |
| 1:13–1:19.68 | Out of the west gate; **Timers** on; shield, arm, invis fill it. The sky darkens and rain starts. | *The Timers pane tracks spells, buffs and more.* |
| **Part 3** **1:19.68** | **A lightning strike on the drum hit** (beat 107); the storm sweeps the client. | — |
| 1:19.7–1:31 | The second wolf only, about 12 s: attack, Tod joins, assist, the kill, butcher. | After a few seconds: *The Group pane shows your group and follows your fights.* |
| 1:31–1:49 | Back into the inn (a short cut); the barman looks up, offers the quest, Gittan nods. | — |
| 1:49.31–2:13 | The barman's monologue goes on behind. **Profile** window from the menu bar: an alias filled in on the Lite form (e.g. `fk` → `kill wolf`), then **Editor** shows the same alias as a line of text. Then **Scripts**: the list flicked through, one script's settings and help shown. | *Create aliases, actions and keys from the menu or in the editor.* — *A Lua scripting engine for anything more complex.* |
| **Part 4** 2:13.02–2:25 | Exit to the start page; **History**: the Bree session chosen, its log player replays the session a few seconds. | *Every session is saved and can be replayed.* |
| 2:25–2:36.72 | **Spotlights** wall with the five cards; Rasta's PvP kill (*a Half-Elf*) opens in the viewer and plays. | *Spotlights collect your kills, deaths, level-ups and achievements.* |
| **Part 5** 2:36.72–2:44 | **Credits**: the book, a page turned. | *Credits tell your characters' story as a book.* |
| 2:44–2:58 | Quick cuts on the beat (one per two beats) from the film: the shooting star, the Paper flip, the map, the strike, the editor, the spotlight. No captions. | — |
| 2:58–3:10 | End card over the night start page, same box style, centred low: *WebCockpit 0.3.2* / *mumecockpit.com · Free and open source*. From the last full hit (3:06.35) it fades with the ringing tail; black by about 3:10. | (the card) |

## Open

- Polish after the owner has seen the whole film.
- Caption wording is draft; the Credits line is the least certain.
- Not in the film for now: import, the export editor and HTML replay,
  the phone. Possibly one cut each in the final montage.
