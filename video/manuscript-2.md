# Presentation film 2 — manuscript

Draft 1 (2026-11-17). The storyline the owner approved in outline
(`docs/stages/70-presentation-film-2.md`). Times are rough targets by
picture. They are **not** tied to the music ("Sunset Plains" looped, to
be swapped later perhaps).

## Rules

These are carried from the first film (`manuscript.md`), with the stage 70
changes:

- **Captions.** Few, plain and descriptive; one lower-third style; no
  chapter cards; no voiceover; no tt++. Show rather than tell.
- **No balloons, no level-up, no achievement.**
- **Comm is shown,** with staged lines from invented names.
- **The community content is real**, captured from mumecockpit.com.
- **The game.** Real names stay in the game. The game material is the
  Bree session `Gittan/2026-11-08T12-07-39`, time-compressed, in real
  order. Only the weather and the Comm lines are staged.
- **The pointer.** It moves like a hand. A final click stays, then fades.
- **Cuts.** Game moments join with plain cuts.

## The arc: one player's journey (~5:15)

| # | Act | Rough time | Picture | Caption ideas |
|---|---|---|---|---|
| 0 | Night | 0:00–0:25 | The start page at night, with the shooting star. Enter MUME, then MUME's real login screen. | *Live demo of WebCockpit 0.17 / Try it at mumecockpit.com* |
| 1 | Bree | 0:25–1:05 | The Prancing Pony. A staged chat comes in: **Comm** turns on and shows Public and a chat with bubbles. The mercenary arrives from the west and is hired, and **Group** opens. A quick **Settings** round: backgrounds and fonts, then weather effects on. | *Conversations get their own pane.* |
| 2 | The wilds | 1:05–1:45 | Out through the West Gate. **Map** docks in, perhaps with a quick tileset switch. Spells are cast and **Timers** fills. The storm builds, then the lightning strike. | *The Timers pane tracks spells, buffs and more.* |
| 3 | The wolves | 1:45–2:25 | The room name first, then the attack. The **fight card** and Group in the fight. **Statistics** shows the kill feed, the tiles and the Last kill card. | *Statistics follow every kill.* |
| 4 | Make it yours | 2:25–3:00 | **Profile**: an alias on Lite and in the Editor. **Scripts**: Lua, then Mercenaries. A pane is dragged out to float, in the lantern look. | as in the first film, tightened |
| 5 | Memory | 3:00–3:35 | **History** with its tabs Sessions, Spotlights and Diary. The log player replays the wolf fight just seen. One spotlight plays in the viewer. | *Every session is saved and can be replayed.* |
| 6 | Everywhere (the high point) | 3:35–4:25 | The same live session goes on. The desktop view shrinks into a generic screen frame and slides over to a tablet, its layout reflowing while the game runs. Then it goes to a phone: the fight card, the map lens zoomed, our keyboard typing a command, the compass. Then all three side by side, in sync. Then **Create account**, and the phone opens History with the same run. | *The same session on every screen.* — *An account keeps it all in sync.* |
| 7 | Community | 4:25–5:00 | The export editor, then **Share** gives a link. The watch page shows stars and comments. **Hall of Fame**. The **Community** page: Random Runes, warlords, "N online". All of it is real content. | *Share your runs.* |
| 8 | Dawn | 5:00–5:15 | Back on the start page, where night has turned to sunrise. The end card. | *WebCockpit 0.17 / mumecockpit.com · Free and open source* |

## Sources

- **Game:** `feeds/film.ts` excerpts (`merc`, `gate`, `wolf`, `barman`)
  from `private/film-runs.jsonl.gz`.
- **History, Spotlights:** the five film runs in the same backup.
- **Comm:** staged lines with invented names, mixed into the feed.
- **Community:** `private/community/`, captured from mumecockpit.com.
- **The MUME login screen:** `private/mume-login.json` (the first film's
  capture).

## Open

- How the device transition looks: settled by the prototype.
- Whether the account scene creates the account on the desktop or on the
  phone.
