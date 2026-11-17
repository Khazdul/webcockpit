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
- [ ] Simulated Comm lines (feed helper, invented names).
- [ ] Acts 0–3 recorded (night, Bree, the wilds, the wolves).
- [ ] Acts 4–5 recorded (make it yours, memory).
- [ ] Act 6 recorded (everywhere: three devices, account).
- [ ] Acts 7–8 recorded (community, dawn).
- [ ] The `Film2` composition, full cut, music laid under.
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

## Owner feedback

(None yet.)

Open from the community capture (2026-11-17): the one real published run
has no stars or comments, and the Hall of Fame is empty (five votes
needed). Re-capture (`node record/capture-community.ts`) before act 7 is
recorded. A share on camera adds the film account's run as a second log.
