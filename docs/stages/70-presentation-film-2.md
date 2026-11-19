# Stage 70 — Presentation film 2

Status: **Done** (2026-11-19, round 3 approved).

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
- [x] Owner feedback, round 1 (2026-11-18).
- [x] Owner feedback, round 2 (2026-11-19): all takes re-recorded on 0.21.0 with the fog fix.
- [x] Owner feedback, round 3 (2026-11-19): film2-a, the tablet, the phone and take B re-recorded.
- [ ] Owner feedback on the round 3 draft.
- [x] Master and 4K (round 3, 2026-11-19): `video/out/webcockpit-film2-master.mov` (ProRes 4444), `webcockpit-film2.mp4` (HEVC 10-bit), `-youtube.mp4` (4K H.264, the upload), `-h264.mp4`; all 5:29.67.

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

### 70c — the full draft, round 2

1. Open `video/out/film2-draft.mp4` (5:29.67, it ends with the music), or
   `film2-draft-small.mp4` on the phone. Recorded on 0.21.0 (the caption
   reads 0.21).
2. What it shows:
   - 0:00–0:22 act 0: the start page, Enter MUME, the login.
   - 0:22–1:12 act 1: Bree, Comm, the mercenary, Group, Settings.
   - 1:12–1:42 act 2: the strike, the gate, Map; 1:25 Group docked above
     the map, landing at once as the four-row strip, then Border off and
     Background Clear (no resize on camera); Timers.
   - 1:42–1:58 act 3: the first wolf (no Statistics).
   - 1:58–2:51 act 4: the device act. 2:04 the tablet picks up in the
     wide view under the caption; 2:07 the camera goes in on it; the
     fight, `butch corpse`; 2:13–2:20 by touch: the lens moved, made
     about 1.5 times larger, four taps through its zoom levels; 2:22 the
     phone, Messages (2:31), the pane strip and its band (2:38–2:47);
     2:47–2:51 the camera back out and in to the monitor, into the inn.
   - 2:51–3:34 act 5: Profile; Scripts with Mercenaries on, then its cost
     20 (3:25) and autopay (3:28) in its own settings.
   - 3:34–4:21 act 6: Exit, History, the spotlight, Create account under
     the new caption about the cloud.
   - 4:21–5:11 act 7: the export editor: the pony lines excluded (4:30),
     a comment added (4:35–4:40); Share, Hall of Fame, Publish,
     Community, the watch page opened and closed with the morph (4:57,
     5:05).
   - 5:11–5:30 act 8: the start page at night dissolves into sunrise
     (5:11.5–5:14.1), the end card at 5:16.5, the fade from 5:23.
3. Feedback wanted: the tablet zoom and the lens (pace, the four taps),
   the move back to the monitor, the Mercenaries settings, the export
   editor's steps and its caption, the dissolve to dawn, and the pace
   overall (holds were trimmed to keep the end on the music).

### 70d — the full draft, round 3

1. Open `video/out/film2-draft.mp4` (5:29.67, it ends with the music), or
   `film2-draft-small.mp4` on the phone.
2. What it shows:
   - 0:00–0:22 act 0: the start page, Enter MUME, the login.
   - 0:22–1:18 act 1: Bree; Comm, Eilwen's chat, and Gittan's answer typed
     in the pane's reply line (0:37–0:40), Eilwen's two answers (0:41.6,
     0:43.0); the mercenary; Group; Settings.
   - 1:18–1:48 act 2: the gate, Map, Group docked (1:31), Timers.
   - 1:48–2:04 act 3: the first wolf.
   - 2:04–2:57 act 4: the tablet (in at 2:13, the lens 2:19–2:26), the
     phone from 2:28 (it freezes at 2:53 on a clean prompt under the
     Prancing Pony's sign), back to the monitor 2:53.3–2:56.9.
   - 2:57–3:31 act 5: Profile (the alias on the Lite form, closed at
     3:13), Scripts with Mercenaries, quicker (3:20–3:26).
   - 3:31–4:18 act 6: Exit, History, the spotlight, Create account.
   - 4:18–5:10 act 7: the export editor (excluded lines 4:26, the comment
     4:31–4:36), Hall of Fame, the title "The wolf fur hunt" in the share
     dialog (4:44–4:46), Publish, Community, the watch page started with
     its big play button (5:01), Back.
   - 5:10–5:30 act 8: the start page at night, then a slow dissolve to
     sunrise (5:10.9–5:18.4) under the end card (5:16.5); the fade from
     5:23.
3. Feedback wanted: the Comm reply (its words and pace), the dawn's
   pace, the title in the share dialog, and the pace of acts 5–7 now.

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

### Full draft, round 2 (2026-11-19, on the 5:29 cut)

Times are the owner's, in the 5:29 draft of round 1. Since that cut the
app went to 0.21.0 (stage 74: the new morph clock, the menu's panel
morph, the watch page as a frame on the start surface); every take is
recorded again on it, the community re-captured first (still one listed
run, no stars or comments, two notes).

1. **1:17, fog streaks.** Light vertical streaks along the right screen
   edge where fog bands are. Fixed in the app by another agent.
   **Outcome (2026-11-19, 4e626c52, merged to main before film2-a was
   recorded):** film2-a re-recorded with the fix; the right edge
   (x 1800-1919) during the rain and fog shows no streaks.
2. **1:26, Group docking.** Group got a low height when docked and was
   then dragged taller. It should land at the right height (the slim
   four-row strip) at once; Border off and Background Clear stay, with
   "Panes can be docked and customised."
   **Outcome (2026-11-19, 08c412b3):** the app has no remembered dock
   height for a pane docked from floating: it gets its default rows
   (Group 6), and the lane is shared out by the panes' `desired` sizes.
   With the default map (330) Group got one row. The take now seeds the
   map's own size in the lane (`desired` 60, as a player who had sized
   the map before) off camera, and Group lands at four rows, framed and
   borderless (measured 3.99 rows). No app change, no resize on camera.
   Docked at 1:25.1, Border and Background to 1:32.3.
3. **1:56, Statistics.** Drop the Statistics segment and its caption.
   **Outcome (2026-11-19, 08c412b3, 32e6b6e4):** gone from film2-a and
   take B; the first wolf plays a little quicker (1.4×) and acts 2-3 move
   3 s earlier: act 4 starts at 1:58.0 (was 2:03).
4. **2:10, the tablet.** Zoom in on the live tablet; by touch, fairly
   quickly: move the lens a little, make it about 50 % larger, zoom a few
   times. Drop the phone's landscape turn and its lens.
   **Outcome (2026-11-19, b279da83):** the tablet take is at DPR 1.5. The
   caption is read in the wide view (2:04-2:08), then the camera goes in
   on the tablet (2:07.2-2:08.7): the fight, `butch corpse` on our
   keyboard; the lens dragged a little (2:13.4), held and pulled from 190
   to 285 px (2:14.9), four taps (2:16.9-2:19.6: mid, far, area, back to
   near). Out again at 2:20.5; the phone at 2:22.1. No landscape: the
   phone keeps our keyboard, Messages with two chats, the strip swipes
   and its resize.
5. **2:55, back to the desktop.** A camera move instead of the cut.
   **Outcome (2026-11-19, b279da83, 32e6b6e4):** 2:47.3-2:50.9 (3.6 s,
   one eased move): the phone sleeps, the camera goes out to about the
   wide view and in to the monitor, which wakes on take B (the inn's
   sign) 0.5 s into the move; the act's last frame is take B's `film0`
   full-frame, so act 5 runs on without a cut.
6. **3:25, Mercenaries.** Cost 20 and autopay on from the script's own
   settings in Scripts, not the pane; about 2 s before each click.
   **Outcome (2026-11-19, 32e6b6e4):** Mercenaries on (3:22.1), cost 20
   (3:25.1), autopay on (3:28.4), each after a 2 s rest on it; the pane
   reads `Autopay [on] Cost [1g]` with Tod (staged as before). The pane
   click is gone. The Lua caption stays over it.
7. **4:33, the account.** Drop the phone shot and its caption; a lower
   third while the account is being created.
   **Outcome (2026-11-19, 32e6b6e4):** `film2-phone`, `PhoneShot` and the
   split are gone. "Create an account and your settings are kept / in the
   cloud, in sync across your devices." (two lines) from the Create
   account page (4:08.0) to the recovery code (4:17.7). The account's own
   reload ("Loading client") is now cut over (a plain cut at a page
   load).
8. **4:50, sharing.** Exclude a few lines and add a comment in the
   export editor first; then Share. New caption.
   **Outcome (2026-11-19, 32e6b6e4):** the pony lines (`lead pony` to
   `gro pony`) dragged over and excluded (4:27.6-4:29.8), the cursor to
   the top, Add comment, "Two wolves on the way out of Bree." typed and
   saved (4:34.7-4:40.1); then Hall of Fame, the dialog, Publish, the
   link. "Edit, comment on and share your runs with friends or the
   community." from the editor (4:24.4) to Community (4:53.8).

**With 0.21 (no item):** the watch page opens and closes with the morph
on camera (4:57.0, 5:05.3), no page-load cuts. Without a reload the
start page no longer comes up at sunrise by itself, so act 8 is: Back to
the start page at night, then a 2.6 s dissolve to the same page loaded
again at sunrise (5:11.5-5:14.1). The Panes popup morphs in now, so the
films' pane step takes the row once the popup has landed (a quick click
once turned Character on).

**Length.** Still 19,780 frames, 5:29.67, the music once. The round 2
content came out about 30 s longer (the tablet's lens, the return move,
the Mercenaries settings, the export edits, the morphs), so holds were
trimmed in take B (shorter rests between steps outside settings, the
spotlight 10 s instead of 12, the log player 3.6 s, Exit without its
tooltip, the watch page's play 1.4 s) and in the device act (1.7 s).
The end card is at 5:16.5 as before, 2.4 s after the dawn is in.

**Where to start next session (after round 2):**
- The cut: `video/out/film2-draft.mp4` (5:29.67) and
  `film2-draft-small.mp4` for the phone; contact sheet
  `film2-draft-sheet.png`.
- Re-record with `npm run record -- film2-a | devices-tablet |
  devices-phone | film2-b` (no `film2-phone` any more), one at a time,
  on port 5189. The device schedule is `video/src/devices.ts`; take B's
  length decides where the end card can come (`film2Plan` warns past
  318.5 s).
- Known small things: the tablet's and phone's captures run at about
  12 frames a second where only the sky moves (more while a finger
  moves); the watch page shows "Loading the log" for about 2 s after its
  morph; the night start page's pointer rests in the bottom right corner
  under the dissolve.
- No master yet (ProRes / 4K): the main session renders it.

### Full draft, round 3 (2026-11-19, on the round 2 cut)

Times are the owner's, in the round 2 draft (5:29.67).

1. **0:43, a reply in Comm.** Gittan answers Eilwen in the Comm pane's
   own input: out to hunt wolves, hoping for a wolf fur; Eilwen answers
   that she saw a pack outside the West Gate, then "be safe!".
   **Outcome (2026-11-19, 4111b7eb):** the reply stays where the chat
   is, before the mercenary is hired, so he is not named: "heading out to
   hunt wolves, hoping for a wolf fur!", typed in the reply line
   (0:37.2–0:40.1; the pane sends `tell Eilwen …`). MUME's answer is
   staged as the owner's runs have it ("Ok." and the tell filed as
   yours), then Eilwen: "saw a pack just outside the west gate earlier"
   (0:41.6) and "be safe!" (0:43.0). The mercenary arrives 6 s later
   than before (0:44.4). The device takes carry the same talk, and
   Eilwen's tell on the way back now asks "back already? any luck with
   the furs?".
2. **2:29, "east east".** Two echoed commands just before a game window
   freezes. **Outcome (2026-11-19, 4111b7eb):** they were the phone's
   last compass taps. The run typed `e e` ahead of the answers; a tap is
   slower, so they landed after the Prancing Pony's sign and were echoed
   under it, where the phone is left. The walk now drops a command typed
   ahead of the last one's answer and one just before the walk's last
   room; the phone freezes on a clean prompt (2:53.3). The game is fed by
   the run either way.
3. **2:59, Profile.** Drop the Editor. **Outcome (2026-11-19,
   494e265e):** the alias on the Lite form, about 2 s, closed (2:59.3–
   3:13.1, was 2:53–3:11). Caption: "Open the profile to create aliases,
   actions and keys."
4. **3:30, Mercenaries quicker.** **Outcome (2026-11-19, 494e265e):**
   about 1 s on each step (was 2 s) and brisker pointer moves (no
   overshoot): Mercenaries 3:20.0, on 3:22.0, cost 20 3:23.7, autopay
   3:25.5 (the four took 9.3 s, now 5.5 s).
5. **4:39, the comment.** **Outcome (2026-11-19, 494e265e):** "Hunting
   wolves for their furs outside Bree." (4:30.7–4:36.4).
6. **4:46, a title.** **Outcome (2026-11-19, 494e265e):** the title is
   set where the share sets it, in the Hall of Fame dialog's Title
   field: the proposed title selected and typed over as "The wolf fur
   hunt" (4:44.4–4:46.4), then the rules and Publish. The film's run is
   listed under that title on the Community page.
7. **5:01, the big play button.** **Outcome (2026-11-19, 494e265e):** the
   watch page is started with the play button in the middle of the frame
   (5:00.9), then the arrows go into the battle.
8. **5:12, a slower dawn.** **Outcome (2026-11-19, 494e265e):** the
   dissolve from the night start page to the sunrise is 7.5 s (was 2.6),
   from 0.5 s after the night page is back: 5:10.9–5:18.4, under the end
   card (5:16.5, as before); the tail's fade from 5:23.0.

**Length.** Still 19,780 frames, 5:29.67, the card at 5:16.5. The Comm
reply added 6 s to act 1; dropping the Editor and the quicker
Mercenaries gave about 9 s back, the title took about 3 s. The night start
page comes back at 5:10.4, as in round 2. All four takes were recorded
again (film2-a, devices-tablet, devices-phone, film2-b).

**Verdict on round 3 (2026-11-19):** "Det här ser bra ut. Vi nöjer oss så här." Done. The upload is `video/out/webcockpit-film2-youtube.mp4` (4K H.264, 759.6 MiB).
