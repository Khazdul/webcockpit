# Stage 70 — Presentation film 2

Status: **In progress** (started 2026-11-17). Paused 2026-11-18 after round 1: the owner finds the cut "ganska bra" and will polish it in a new session. No master for now.

## Goal

A new presentation film of about **5:15** that shows the whole client as
it stands at 0.17: playing, panes, settings, scripts, looking back at runs,
the same session on desktop, tablet and phone, accounts, and the
community. It replaces the stage 48 film (3:42), which it may borrow from.
It builds up: each act adds a layer, and the high point is one live
session moving between the three devices.

The pipeline is stage 48's (ADR 0133, `video/README.md`): Remotion plus
Playwright against a mocked MUME WebSocket fed from the owner's runs. The
new scenes are in `video/manuscript-2.md`, which the main session owns. The
old film's manuscript, scenes and takes stay for reference.

## Owner decisions (2026-11-17)

- **Length.** About 5:15.
- **Music.** "Sunset Plains" for now, looped. The owner may swap it later,
  so cuts are **not** tied to the beat grid or to a musical climax. Scenes
  are timed by picture, and the music is laid under them.
- **Captions.** The same balance as the first film: few, plain,
  descriptive, one lower-third style. There are no chapter cards and no
  voiceover. Don't mention tt++.
- **No balloon notices.** No level-up or achievement either.
- **Game material.** The first film's Bree session (run
  `Gittan/2026-11-08T12-07-39` in `video/private/film-runs.jsonl.gz`):
  the mercenary, the West Gate, spells, the wolves and the barman. No new
  logging is needed.
- **Comm is simulated.** The chat lines are staged in the feed, with
  invented names.
- **Community content is real.** The log and the comments now in Random
  Runes, and the real Hall of Fame and warlords, come from
  mumecockpit.com. They are captured once into `video/private/` and served
  to the recording through the cloud fakes. Nothing invented is shown as
  community content.
- **The ending.** Night at the opening becomes dawn at the end, on the
  start page.
- Carried from stage 48: real player names stay in the game, the pointer
  moves like a hand, there is no banding in dark gradients, and
  credentials never go in committed files.

## Plan

1. Storyline: `video/manuscript-2.md`, draft 1. **Done** (approved in
   outline 2026-11-17).
2. Prototype the device transition (~20 s) first. It is the riskiest
   part and the "wow". The owner judges it before the rest is built.
3. Capture the real community content into `video/private/community/`,
   and serve it through the fakes.
4. The detailed manuscript per act, with timings by picture.
5. Record act by act, then the full cut, then the owner's feedback rounds.
6. Master, 4K, and the YouTube upload by the owner.

## Tasks

- [x] Stage file and manuscript draft 1.
- [x] Device-transition prototype (composition `DevicesProto`, `video/out/devices-proto.mp4`; ADR 0133 addendum).
- [x] Community capture (`video/private/community/`) and its loader.
- [x] Simulated Comm lines (feed helper, invented names; `video/feeds/comm.ts`).
- [x] Detailed manuscript (`video/manuscript-2.md`, draft 2).
- [x] Acts 0–3 recorded (night, Bree, the wilds, the wolves; take `film2-a`, `video/out/film2-draft.mp4`).
- [x] Acts 5–6 recorded (make it yours; memory and the account; take `film2-b`, phone shot `film2-phone`).
- [x] Act 4 in the film (the approved device prototype; `DevicesAct`, joined to act 3 without a cut).
- [x] Acts 7–8 recorded (community, dawn; take `film2-b`; community re-captured first).
- [x] The `Film2` composition, full cut, music laid under (`video/out/film2-draft.mp4`, 5:58; `film2-draft-small.mp4` for the phone).
- [ ] Owner feedback rounds.
- [ ] Master and 4K. Not now (owner, 2026-11-18): the H.264 draft stays as it is until the polish session.

## Test guide

### 70a — the device prototype

1. Open `video/out/devices-proto.mp4` (20.6 s) in Firefox, with sound low.
2. What it shows:
   - 0–3 s: the desktop wolf fight.
   - 3–5 s: a pull back into a monitor frame.
   - 5–8 s: the same fight on a tablet.
   - 8–13 s: the phone, where our keyboard types `butch corpse`.
   - 14–20 s: all three side by side in sync, with the caption.
3. Feedback wanted:
   - The frames' look.
   - The pace of the moves.
   - Whether the side-by-side view reads (the text is small there).
   - Tablet portrait or landscape.
   - Whether the camera move is "wow" enough, or should be a slide or
     morph of the picture itself.

### 70b — the full draft (acts 0–8), round 1

1. Open `video/out/film2-draft.mp4` (5:29.7, it ends with the music), or
   `film2-draft-small.mp4` on the phone.
2. What it shows:
   - 0:00–0:22 act 0: the start page (now with the owner row and
     Community), Enter MUME, the login.
   - 0:22–1:10 act 1: Bree, Comm, the mercenary, Group (already set),
     Settings with Paper, Teal and Black.
   - 1:10–1:46 act 2: the strike, the gate, Map; 1:21–1:36 Group docked
     above the map, borderless, clear and a slim strip ("Panes can be
     docked and customised."); Timers without time text.
   - 1:46–2:03 act 3: the wolf, Statistics.
   - 2:03–2:53 act 4: the device act; on the phone the strip made about
     half as tall at 2:40.
   - 2:53–3:39 act 5: Profile, Scripts, Mercenaries on with Tod in its
     pane, the cost changed to 1 gold in the pane (3:32).
   - 3:39–4:40 act 6: Exit, History (log player, the Half-Elf spotlight
     about 12 s), Create account, the phone (4:32–4:40).
   - 4:40–5:11 act 7: Share → Hall of Fame → Publish → Community → the
     watch page.
   - 5:11–5:30 act 8: the start page at sunrise, the end card at 5:16.5,
     the fade with the music's tail from 5:23.
3. Feedback wanted: the docking segment (pace, the caption), the shorter
   phone strip, the Mercenaries staging, and the ending on the music.

## Owner feedback

### Device prototype, round 1 (2026-11-17)

0. The main problem: it looks as if one plays on all three devices at the
   same time, which is misleading. The story is "the same session goes on
   on another device", one device live at a time. Drop the closing shot of
   all three in sync and its caption ("The same session on every
   screen."). When the camera leaves a device, its screen clearly stops
   being live (frozen where it was left, then dimmed or asleep), and the
   next device picks up exactly there. A new caption for the act: plain,
   descriptive, no slogan.
1. The iPad is shown in landscape (1180×820 CSS, mobile and touch; the
   phone's layout by default, ADR 0140).
2. Never zoom in on the iPad: the camera passes it at the overview scale
   (it may be the live one for a few seconds in the wide view).
3. At the phone, zoom in until only the phone is shown. Then, by touch,
   with the fingertip rings:
   a. Open Messages (the phone's Comm) and jump between two
      conversations. Comm is simulated: staged lines with invented names,
      arriving shortly before so an unread count shows; the staging is a
      small reusable feed helper.
   b. Hide Messages, open the pane strip, swipe between Group and Timers.
   c. Rotate the phone to landscape (the frame turns 90° in Remotion; a
      landscape take, ADR 0137).
   d. In landscape, move the map lens a little and make it slightly
      larger, by touch.
4. Everything else as before. The prototype may grow past 20 s; a calm
   pace (about 2 s of rest before each touch).

**Verdict on round 1 (2026-11-17, 55 s cut):** "Det här blir bra":
approved. The prototype becomes act 4 of the film, right after the wolves
(manuscript draft 2).

Open from the community capture (2026-11-17): the one real published run
has no stars or comments, and the Hall of Fame is empty (five votes
needed). Re-capture (`node record/capture-community.ts`) before act 7 is
recorded. A share on camera adds the film account's run as a second log.

### Full draft, round 1 (2026-11-18, on the 5:58 cut)

Times are the owner's, roughly, in the 5:58 draft.

1. **0:03.** Community is missing from the start menu. Act 0 runs with the
   cloud flags like the rest, so the menu matches act 6.
   **Outcome (2026-11-18, 9e933cce):** act 0 runs on the cloud fakes with the captured community; the menu has the owner row (Guest · log in) and Community, as in act 6.
2. **1:00.** Don't show Group's settings being turned on (NPC visibility
   All, Fight card). They are on from the start, off camera.
   **Outcome (2026-11-18, 9e933cce):** NPC visibility All and the Fight card are set off camera; Group just comes on (0:47).
3. **1:21.** Backgrounds: Paper, Teal, Black. Hold Paper and Teal about
   1 s longer each.
   **Outcome (2026-11-18, 9e933cce):** Paper, Teal, Black, each held about 3 s (1:02.6, 1:05.6, 1:08.6).
4. **1:43.** Timers is shown with "Time text" off.
   **Outcome (2026-11-18, 9e933cce, 8e8a1467, bfd95311):** Time text is off in every take, desktop, tablet and phone.
5. **1:36, before Timers.** A new segment with a caption in the spirit of
   "Panes can be docked and customised":
   - Group is moved to dock at the top, above the map.
   - Its borders are turned off, and the background is set to Clear.
   - Group is resized so that it sits relative to the map as in
     `img/70-group-docked-target.png` (a slim strip over the map's
     column).
   - The rest of the film carries on with that layout.
   **Outcome (2026-11-18, 9e933cce, 30ba9d2e):** 1:20.8–1:35.5, after Map: Group dragged to the right screen edge and docked above the map, Border off, Background Clear (both tooltips shown), its lower edge dragged down to four rows (its two members), as in the picture. Caption "Panes can be docked and customised." Every later take starts in that layout (Character kept off: the shorter map lane would have given it room).
6. **2:40 (the phone).** The upper pane part is resized to about half its
   present height, to show it can be set to taste. No caption.
   **Outcome (2026-11-18, 8e8a1467):** after the swipes the strip's band is dragged up, from about 190 to 85 px (2:39.7). No caption.
7. **3:42, Mercenaries.** The script looks as if it had been on when the
   mercenary was hired, so our grouped mercenary shows as registered in
   it. This is staged on purpose, to show the script with an active
   mercenary. The cost is changed to 1 gold by tapping the field in the
   mercenary pane.
   **Outcome (2026-11-18, bfd95311):** staged as asked: the script's store holds Tod's contract before the take, so switching it on shows "Tod ● here" with about 22 minutes left; the cost goes to 1 gold by a click on Cost [10s] in the pane (3:32.6; MERC "Payments are now 1 gold"). The cost choice in Scripts is no longer touched.
8. **3:49.** The dock demo (Timers dragged into a dock and back) goes; 5
   covers it.
   **Outcome (2026-11-18, bfd95311):** the Timers drag is gone.
9. **4:23.** About 4 s more on the spotlight in the viewer.
   **Outcome (2026-11-18, bfd95311):** the spotlight plays 12 s in the viewer (3:58.4–4:11.9).
10. **5:30.** The music ends at 5:29.7 ("Sunset Plains" is 5:29.68 long).
    The whole film must end with the music, with no loop. The film is
    rebalanced to land there, and the main session proposes how.
   **Outcome (2026-11-18, 30ba9d2e):** the film is 19,780 frames, 5:29.67, the music's own end (329.68 s, no loop, no fade of the music). The end card comes at 5:16.5; the picture fades with the tail from 5:23.0. Per act against the 5:58 draft: acts 0–3 +1 s (the gear −10, act 1 tightened −6, the docking +15, backgrounds +2), act 4 −5 (the walk at 2×, the phone's steps closer; the strip resize +2), act 5 −15 (the dock demo, the cost choice, shorter holds), act 6 −7 (Diary, the Log in page cut, shorter code and player holds; the spotlight +4), act 7 −9 (no row press, shorter holds and play), act 8 +7 (the start page and card held to the music's tail).
11. **Community and the watch page** must look as they do now, after the
    owner's own changes made in parallel (stages 71–73, up to 0.20.1).
    The film's takes are recorded on current main.
   **Outcome (2026-11-18, all takes):** every take recorded on main at 0.20.1 (the caption reads 0.20); Community shows Log of the day, and the watch page the lens. The community re-captured first: still 1 listed run, no stars, no comments, 2 notes, no Hall of Fame.

**The main session's plan for 10.** With 2–9, the cut would run to about
6:13, so about 45 s must go.
- Act 1: tighten the arrival, the fountain and the mercenary. The pause
  before the gold stays at about 2.5 s. About −8 s.
- Act 4: compress the phone's walk into Bree and the gate call. Messages,
  the panes and the turn stay. About −8 s.
- Act 5: shorter holds on arriving at the inn and in Profile. About −5 s.
- Act 6: Diary goes, the Log in page is skipped, and the recovery code is
  held shorter. About −10 s.
- Act 7: from 40 s to about 30 s, with a shorter export editor hold and a
  shorter play on the watch page. About −10 s.
- Act 8: the end card is timed to the music's tail, and the last frame is
  at 5:29.7. About −4 s.

**Verdict on round 1 (2026-11-18):** "Det är ganska bra." No full-quality
master now. The owner picks it up in a new session to polish it.

**Where to start next session:**
- The cut: `video/out/film2-draft.mp4` (5:29.67), and the copy for the
  owner's phone, `film2-draft-small.mp4` (under 30 MB).
- The render config is the git-ignored `video/out/tmp/h264.config.ts`.
  Recreate it if `out/` is cleaned.
- Re-record with `npm run record -- film2-a | devices-tablet |
  devices-phone | film2-b | film2-phone`, one at a time, on port 5189.
- Known small things:
  - the wolf shows as a third row in the Group strip;
  - the account reload and the log player's start show loading for a
    moment;
  - the last start page's quote no longer fades on camera;
  - there are no stars or comments on the real log. Re-capture with
    `node record/capture-community.ts` before act 7 is re-recorded.
