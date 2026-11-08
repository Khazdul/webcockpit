# Presentation film — manuscript

Final (2026-11-08): the film as published, after four owner feedback
rounds (`docs/stages/48-presentation-film.md`). 3:42.45. Times are music time in "Sunset Plains" by Yoiyami (CC0,
`public/music/sunset-plains.wav`).

## Rules from the owner

- About 3 minutes, never longer than the music. The final cut runs to
  3:42 and ends with a music fade (owner rounds 2–3).
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
| **Opening** 0:00–0:13 | Start page in the middle of the night (MUME 00:05, faint clouds, stars); the client's own shooting star at 0:05.0 (dev hook). Profile is warmed off camera before 0:00. | Lower third, beats 3–15: *Live demo of WebCockpit 0.3.2* / *Try it at mumecockpit.com* (version read at render time) |
| 0:13–0:23 | Profile pressed on beat 17 (0:13.02); khazdul Selected on beat 23; Back on beat 27. | *Profiles hold your basic settings.* |
| 0:23–0:36 | Enter MUME on beat 31 (0:23.39); the pointer stays and fades. MUME's real welcome screen, held about 3.6 s; name Enter beat 43, password (masked) Enter beat 46. | — |
| 0:36–0:56 | Gittan arrives in the Lodging Foyer; lead pony, group it (never labelled). **Group** on at 0:45.7, floating; its gear's tooltip, then NPC visibility **All** (the pony appears) and **Fight card** on, about 2 s rest before each. | — |
| 0:56–1:14 | **Settings**: tabs two beats each, ending on **Weather effects**; the switch goes on and the night sky fades in (a clear night is pinned). Appearance: the font list open about 2 s; backgrounds **Paper** (1:08) → **Teal** → **Sepia** → **Black**. | *Weather effects follow the game.* — *Customise fonts, colours and more.* |
| 1:13–1:19.68 | "A citizen mercenary has arrived from the west." (staged); 10 silver refused, 2.6 s idle, 1 gold; out of Bree's street in the rain. | — |
| **1:19.68** | **A lightning strike on the drum hit** (beat 107), in Bree's street before the West Gate; Tod grouped. | — |
| 1:21–1:50 | **Timers** on (1:25), floating; shield, armour and shroud fill it. Its settings, calmly (Herblores is off from the start): Grid, Circles, 2 columns, back to Bars and Flow. **Map** on, docked (1:43.8); a few rooms walked. | From about 1:25, 4 s: *The Timers pane tracks spells, buffs and more.* |
| 1:50–2:10 | The second wolf at about game tempo (1.15×): Grassy Hills by name, `k wolf`, Tod joins, assist, the kill, butcher. Plain cut in. | *The Group pane shows your group and follows your fights.* |
| 2:10.05–2:51 (cut on beat 175) | The inn; the barman at 1× behind. **Profile**: caption first, the pointer slowly to the menu-bar icon, tooltip, click; the alias `fk` → `kill wolf` on the Lite form, then **Editor** (Find, the line held 5 s). **Scripts** the same way: Almanac briefly, then **Mercenaries**: switched on, cost **20** silver pressed. | *Open the profile to create aliases, actions and keys from the menu or in the editor.* — *A Lua scripting engine for anything more complex.* |
| 2:51.7–3:03 | Exit to the start page (night, the film's own clock), held; **History**: the Bree session's log player with small text and narrower panes. | *Every session is saved and can be replayed.* |
| 3:03–3:27 | **Spotlights** wall held; Rasta's PvP kill of *a Half-Elf* (#2) opened, played whole, then about 4 s of the next (*Kohrn the Orc*); Back, Back. | *Spotlights collect your kills, deaths, level-ups and achievements.* |
| 3:28–3:33 | **Credits**: the book held about 4.5 s, no Next; Back. | *Credits tell your characters' story as a book.* |
| 3:33–3:42.45 | The start page (the quote fades); the end card at 3:35.0: *WebCockpit 0.3.2* / *mumecockpit.com · Free and open source*. Picture and music fade together from beat 295 (3:38.94); black at 3:42.45. | (the card) |

Game moments join with plain cuts (no dips, owner round 4). Group and
Timers float stacked left of the map's lane for the whole game (22 × 12
cells each).

## Open

- Published on YouTube 2026-11-08 (`out/webcockpit-demo-youtube.mp4`).
- Known, accepted: the strike reads mostly as a sky flash; History and
  Spotlights show an empty box about 1 s as they grow in; the quote fades
  before the end card (a new take B would fix it).
- Not in the film: import, the export editor and HTML replay, the phone.
