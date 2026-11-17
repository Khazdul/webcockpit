# Presentation film 2 — manuscript

Draft 2 (2026-11-17), the detailed manuscript. Its device act is the
approved prototype (`DevicesProto`, round 1, "Det här blir bra"). The
owner's decisions are in `docs/stages/70-presentation-film-2.md`. Times
are targets by picture. They are **not** tied to the music ("Sunset Plains",
looped under the film, perhaps swapped later).

## Rules

- **Captions.** Few, plain and descriptive; one lower-third style; no
  chapter cards; no voiceover; no tt++. Show rather than tell; don't
  caption what the eye already sees.
- **No balloons, no level-up, no achievement.**
- **Comm is simulated.** Staged lines from invented names, through
  `feeds/comm.ts`. The names are Eilwen and Hamlin, plus at most one more
  invented name for Public.
- **The community content is real.** It comes from `private/community/`;
  re-capture it before act 7 is recorded.
- **The game.** Real names stay in the game. The game material is the
  Bree session `Gittan/2026-11-08T12-07-39`, time-compressed, in real
  order. Only the weather and the Comm lines are staged.
- **The pointer and the touches.** The pointer moves like a hand, and a
  final click stays, then fades. Touches show fingertip rings. Rest about
  2 s before each settings click or touch, so each step can be read.
- **Cuts.** Game moments join with plain cuts.
- **Panes.** No panes at the start. Each pane is turned on when the story
  needs it.

## Order (changed from draft 1)

The device act follows the wolves directly. The prototype is built on
that fight: it starts on the desktop at `k wolf` and walks back into Bree
on the phone. Doing it there keeps the game moment continuous, and the
desktop pages (acts 5–6) then play with the inn behind them, as in the
first film.

## Acts (~5:20 in all)

### 0 · Night (0:00–0:22)

- The start page at night (as in the first film: clock, sky and seed
  pinned). The shooting star comes at about 0:05.
- Lower third: *Live demo of WebCockpit 0.17 / Try it at
  mumecockpit.com* (the version is read at render time).
- Enter MUME, then MUME's real welcome screen, held about 3 s. The name
  and password (masked) are typed.

### 1 · Bree (0:22–1:10)

1. Gittan arrives in the Prancing Pony. No panes yet.
2. A staged Public line and a tell from Eilwen come in. **Comm** is turned
   on from the menu bar's Panes as a floating pane, and shows Public and
   the chat with Eilwen as bubbles. Caption: *Conversations get a pane of
   their own.*
3. The mercenary "has arrived from the west". The 10 silver is refused,
   then a pause of about 2.5 s, then 1 gold. **Group** is turned on as a
   floating pane, and its gear's tooltip shows. NPC visibility goes to
   All so the pony shows, and Fight card is turned on. No caption: it
   comes in act 3.
4. **Settings**: tabs about 1.5 s each, then **Weather effects** on, and
   the night sky fades in. Appearance: the font list open about 2 s;
   backgrounds Paper, then one more, then Black. Caption: *Customise fonts,
   colours and more.*

### 2 · The wilds (1:10–1:50)

1. Out through the West Gate. **Map** on, docked; a few rooms walked.
2. The spells (shield, armour, shroud). **Timers** is turned on, floating,
   and fills. Caption: *The Timers pane tracks spells, buffs and more.*
3. The storm builds, then the lightning strike in the street before the
   gate (staged with the dev hook).
4. Panes as in the first film: Group and Timers stacked left of the map,
   in the lower part of the screen. Comm is closed before the gate, or
   parked so it doesn't cover the map; the recording decides.

### 3 · The wolves (1:50–2:25)

1. The first wolf if the run has one; otherwise the walk to the second.
   The room name is seen first, then the attack. Fight card and Group
   during the fight.
2. **Statistics** is turned on and shows the kill feed, the tiles and the
   Last kill card. Caption: *Statistics follow every kill.* — then *The
   Group pane shows your group and follows your fights.* only if the
   first caption doesn't already carry it; keep one caption if possible.
3. The second wolf: `k wolf` on the desktop. This is the device act's
   start, joined to it without a cut if the take allows.

### 4 · Everywhere (2:25–3:20)

This is the prototype, round 1, as approved:

1. Desktop, then the wide view. The fight goes on on the landscape tablet
   (never zoomed), with `butch corpse` typed on our keyboard.
2. The phone, alone in frame. It walks into Bree and the gate is called.
3. The tells from Eilwen and Hamlin, then Messages, two chats.
4. The pane strip: Timers, Group, Timers.
5. Turn to landscape; the lens is moved and enlarged.

Caption: *The same session, picked up on a tablet, then on a phone.* The
act ends on the phone in landscape at the Prancing Pony's sign. Then a
plain cut back to the desktop.

### 5 · Make it yours (3:20–3:55)

On the desktop, in the inn, with the barman's quest running slowly behind
(as in the first film):

1. **Profile**: the caption first, then the pointer to the menu-bar icon,
   the tooltip, and the click. An alias on the Lite form (`fk` → `kill
   wolf`), then **Editor** with Find, the line held about 3 s. Caption:
   *Open the profile to create aliases, actions and keys from the menu or
   in the editor.*
2. **Scripts**: Almanac briefly, then **Mercenaries** switched on with its
   cost set to 20. Caption: *A Lua scripting engine for anything more
   complex.*
3. Back in the game, one pane (Timers) is dragged from floating to a dock
   and back, to show the panes move freely. No caption.

### 6 · Memory and the account (3:55–4:35)

1. Exit to the start page (night, held about 2 s).
2. **History**: the tabs Sessions, then Spotlights, then Diary, about 2 s
   each. Sessions: the Bree session's log player plays the wolf fight.
   Caption: *Every session is saved and can be replayed.*
3. Spotlights: Rasta's PvP kill of *a Half-Elf* plays in the viewer (about
   8 s), then Back.
4. **Create account** on the start page, with the film's fake account and
   the password field masked. The start page's owner row appears. Then the
   phone in its frame (a short shot, no rotation): logged in, History
   opens, and the same Bree session is there. Caption: *An account keeps
   profiles, scripts, settings and runs in sync.*

### 7 · Community (4:35–5:05)

1. History, then the export editor for the Bree session, then **Link /
   Share**. The share dialog (its rules) is seen, then the link.
2. The **Community** page: the real published log ("Moria e-gate battle",
   Rasta, by khazdul), Random Runes with the two real notes, the
   warlords, "N players online". If the re-capture has stars or comments,
   the watch page of that log is opened and shows them, with its player
   running a few seconds. Caption: *Share your runs with the community.*
3. The film's own shared run may appear as a second log. It is the film's
   own content, not invented community content.

### 8 · Dawn (5:05–5:20)

Back on the start page, where night has turned to sunrise (the clock is
moved off camera between act 7 and 8, or the sun rises on camera if it
reads well). The end card: *WebCockpit 0.17 / mumecockpit.com · Free and
open source*. Picture and music fade together.

## Sources

- **Game:** `feeds/film.ts` excerpts (`merc`, `gate`, `wolf`, `barman`; a
  first-wolf excerpt is to be found) from `private/film-runs.jsonl.gz`.
- **Device act:** `src/devices.ts` and `record/scenes/devices.ts`.
- **History, Spotlights:** the five film runs in the same backup.
- **Comm:** `feeds/comm.ts`, invented names.
- **Community:** `private/community/`, through `record/lib/community.ts`.
- **The MUME login screen:** `private/mume-login.json`.

## Open

- Whether act 3 and act 4 join without a cut (the same desktop take).
- The dawn: on camera or by a cut.
