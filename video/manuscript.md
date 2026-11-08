# Presentation film — manuscript

Draft 2 (2026-11-08), owner feedback folded in. Not yet approved as a
whole. Times are music time in "Sunset Plains" by Yoiyami (CC0,
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
  `private/film-runs.jsonl.gz` (run time → content): 0:07–0:24 pony,
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

| Music | Picture | Caption |
|---|---|---|
| 0:00–0:19 | Start page at dusk: stars, a shooting star, the wordmark. | **WebCockpit** · *mumecockpit.com* |
| 0:19–0:37 | Pointer to Profile; the page grows out of the menu; khazdul highlighted and selected; Back. | *Profiles hold your basic settings.* |
| 0:37–0:51 | Enter MUME, the transition, MUME's login screen held a while; name typed, password masked. | — |
| 0:51–1:08 | Gittan in Bree with only Comm showing (weather off, plain black). Pony and `where` in the game while Settings opens: tabs flicked on the beat, ending on Weather effects; the switch goes on and the sky fades in. Background Black → Paper. Panes: Map on, then Timers, then Group as Tod joins. | *Customise fonts, colours and more.* — at the switch: *Weather effects follow the game.* |
| 1:08–1:18 | Back to Black. Out of the west gate; shield, arm, invis fill Timers. Sky darkens, rain starts. | *The Timers pane tracks spells, buffs and more.* |
| **1:19.68** | **A lightning strike on the drum hit**; the storm sweeps the client. | — |
| 1:19.7–1:31 | The second wolf, about 12 s: attack, Tod joins, assist, the kill, butcher. | After a few seconds: *The Group pane shows your group and follows your fights.* |
| 1:31–1:48 | The inn: the barman looks up, offers the quest, Gittan nods. | — |
| 1:48–2:12 | The barman goes on in the background. Profile window: an alias filled in on the Lite form (e.g. `fk` → `kill wolf`), then Editor shows the same alias as a line of text. Scripts window: the list flicked through. | *Create aliases, actions and keys from the menu or in the editor.* — *A Lua scripting engine for anything more complex.* |
| 2:12–2:36 | Start page → History, the log player replaying the session. Spotlights wall with the five cards; Rasta's PvP kill opens in the viewer. | *Every session is saved and can be replayed.* — *Spotlights collect your kills, deaths, level-ups and achievements.* |
| 2:36–2:58 | Credits book; then quick cuts on the beat (one per two beats): storm, Paper flip, map, spotlight, editor. | *Credits tell your characters' story as a book.* |
| 2:58–3:10 | End card over the sky from the last full hit (3:06.35) it fades with the ringing tail; black by about 3:10. | **WebCockpit** · *mumecockpit.com* · *Free and open source* |

## Open

- Owner still reading draft 2 as a whole (order, missing or surplus).
- Caption wording is draft; the Credits line is the least certain.
- Not in the film for now: import, the export editor and HTML replay,
  the phone. Possibly one cut each in the final montage.
