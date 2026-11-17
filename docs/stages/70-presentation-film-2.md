# Stage 70 — Presentation film 2

Status: **In progress** (started 2026-11-17).

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
- [ ] Master and 4K.

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

### 70b — the full draft (acts 0–8)

1. Open `video/out/film2-draft.mp4` (5:58), or `film2-draft-small.mp4`
   on the phone. Acts 0–4 are as approved; the new part starts at 2:57.
2. What it shows:
   - 2:57–3:57 act 5: the inn with the barman behind; Profile (`fk` →
     `kill wolf`, the Editor, Find), Scripts (Almanac, Mercenaries on,
     cost 20), Timers dragged to the left dock and back out to float.
   - 3:57–5:06 act 6: Exit, History (the log player in the wolf fight,
     Rasta's Half-Elf spotlight, Diary), Create account (`demo`, a fake
     account), then the same account on a phone with the Bree session.
   - 5:06–5:46 act 7: Share → Hall of Fame → the rules → Publish → the
     link → Open Community (the real log, Random Runes, warlords, players
     online) → the real log's watch page.
   - 5:46–5:58 act 8: back to the start page at sunrise, the end card,
     the fade.
3. Feedback wanted:
   - The length: 5:58, about 30–40 s over the 5:15–5:30 aim. Where to cut
     (candidates: the Timers drag, Diary, the Log in page before Create
     account, the export editor's hold).
   - Hall of Fame (listed) instead of a plain Link, so Open Community
     leads straight to the Community page with the film's run under New.
   - The phone shot's place (right of the middle, the caption at left).
   - The dawn by the watch page's Back (a page load) rather than a sunrise
     on camera.

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
