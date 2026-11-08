# 0133 — The presentation film's pipeline

- Status: Accepted (pipeline and test scene built; the film itself to follow)
- Date: 2026-11-08
- Related: `video/README.md`, `scripts/lib/mume-feed.ts` (the mocked
  session shared with `scripts/screenshots.ts`), ADR 0092 (new-player
  defaults, which the recordings show), ADR 0093 (sunrise and sunset by
  the clock), ADR 0020 (map tracking).

## Context

The owner wants a presentation film of WebCockpit: about three minutes,
1920×1080 at 60 fps, English text, music, cut from scripted recordings of
the real client so that every take can be redone when the client changes.
This ADR covers the pipeline and its first test scene, "An evening in
Bree" (`TestBree`, about 18 s); the real Bree session for the full film
comes later from the owner.

Two things shape it. The client draws the map (WebGL2) and the weather
(2D canvas) in workers on OffscreenCanvas, and the UI moves with CSS
transitions and keyframes. And the owner's machine is a Hyprland
(Wayland) laptop with an Intel iGPU and an RTX 3050 Ti, ffmpeg with
libx264 and NVENC, Node 26, 20 cores.

## Decision

### Real-time capture through the DevTools screencast

The recorder (`video/record/`) runs Playwright's Chromium against the
vite dev server, opens a CDP session and calls `Page.startScreencast`
(`everyNthFrame: 1`, `maxWidth`/`maxHeight` the full device-pixel size),
acks each frame at once, writes it to a temp directory and keeps its
`metadata.timestamp`. Afterwards ffmpeg's concat demuxer holds each frame
until the next one's timestamp and the `fps=60` filter resamples to
constant 60 fps. A page that does not change sends no frames; those
stretches become repeated frames, as on a screen.

Rejected:

- **Playwright's `recordVideo`**: VP8 WebM at about 1 Mbit/s, scaled to a
  fixed size, 25 fps-ish; the small TUI text smears. No control.
- **Virtual time, one frame at a time** (`page.clock`,
  `HeadlessExperimental.beginFrame`, Remotion-style frame stepping): the
  map and weather workers run on their own clocks and OffscreenCanvas,
  and CSS animations run on the compositor; none of them follow a
  virtual clock. The film has to be filmed in real time.
- **Screen grabbing a headed window** (x11grab, wf-recorder): depends on
  the desktop, and under a tiling compositor the window size is not
  ours to set (see the headed rows below).

`--force-device-scale-factor=<dpr>` is needed besides the context's
`deviceScaleFactor`: the screencast captures at the *screen's* scale, so
without it a DPR 2 page came out 1600×900 while the page itself rendered
at 3200×1800.

### The capture mode: new headless on the Intel GPU, DPR 2, JPEG 95

Measured with `npm run record -- bree --measure`: the bree scene, 1600×900
CSS px, the stats over the stretch from the sunset's start to the night's
second (the walk, the map, the sunset rays; about 12.8 s). "Min" is the
fewest frames in any 1 s window; it falls at the end of that stretch,
where the sky itself slows into the night (all fast modes show the same
40 → 30 → 24 frames there), so the mean and the per-second counts during
the walk say more. `node record/gpu-probe.ts` shows which renderer each
flag set gives WebGL2.

| Mode | Renderer | Size | Mean fps | Min fps (1 s) | Gaps > 50 ms | Longest gap |
|---|---|---|---|---|---|---|
| `headless-2` (headless shell as is) | SwiftShader (CPU) | 3200×1800 | 10.2 | 2 | 116 | 886 ms |
| `headless-1.5` | SwiftShader | 2400×1350 | 17.3 | 7 | 40 | 804 ms |
| `nvidia-2` (ANGLE Vulkan, no surface) | RTX 3050 Ti | 3200×1800 | 18.4 | 9 | 57 | 122 ms |
| `nvidia-2-png` | RTX 3050 Ti | 3200×1800 | 14.8 | 8 | 174 | 144 ms |
| `intel-2` (ANGLE GL, chosen) | Iris Xe | 3200×1800 | 45.8–50.0 | 36–39 | 1–4 | 58–64 ms |
| `intel-2-q90` | Iris Xe | 3200×1800 | 52.8 | 41 | 2 | 54 ms |
| `intel-2-png` | Iris Xe | 3200×1800 | 29.7 | 17 | 100 | 173 ms |
| `intel-1.5` | Iris Xe | 2400×1350 | 56.7 | 39 | 0 | 36 ms |
| `headed-2` (a real window) | Iris Xe | 1917×816 (!) | 57.0 | 40 | 0 | 42 ms |

During the walk `intel-2` delivers 46–50 frames a second, `intel-1.5` and
the headed window 56–61. Notes:

- The first fast numbers (55 fps at DPR 2) came from
  `--use-angle=vulkan`, which in fact left the page **without WebGL2**:
  the map pane said "WebGL2 is not available" and drew nothing. Every
  mode in the table was re-measured with the map drawing; the probe is
  there so this is checked, not assumed.
- The discrete GPU is slow here: every frame is read back across PRIME to
  the CPU for the screencast. The Intel iGPU shares memory and wins.
- PNG frames cost the browser more than JPEG encoding at this size; JPEG
  quality 95 (4:2:0, as the H.264 output is anyway) shows no visible loss
  on the TUI text at 100 % crops. Quality 90 is a little faster.
- A headed window is the fastest, but Hyprland tiles it: one take came
  out 1917×816 (the tile), another 1500×858, so its size cannot be
  promised. Kept as a mode, not the default.
- The headless shell with the Intel flags (`--use-angle=gl-egl`) is as fast
  as the new headless mode (49.3 fps); the new headless mode is kept for
  being the full browser.

**Chosen: `intel-2`** (`channel: 'chromium'`, `--use-gl=angle
--use-angle=gl --ignore-gpu-blocklist --enable-gpu-rasterization`, DPR 2,
JPEG 95). DPR 2 keeps the TUI text sharp when the camera zooms into a
pane (at the TestBree zoom one recording pixel is about one film pixel);
the price is about 48 fps instead of 60 during busy stretches, filled by
repeated frames. `intel-1.5` is the smooth alternative if the owner finds
the 48 fps visible and the zooms stay small.

### Encoding: libx264, near-lossless, short GOP

`-crf 12 -preset medium -tune animation`, yuv420p, BT.709 limited range
tagged (the JPEG frames are converted from full range), `-g 30
-keyint_min 30 -sc_threshold 0` (a keyframe every 0.5 s, so Remotion
Studio seeks quickly), `+faststart`. About 40 MB for an 18 s take; it
encodes in about 22 s on 20 cores. Offline, quality first; `h264_nvenc` is
the fallback if takes grow long.

### The timeline JSON

Beside each take, `<scene>.json`: the video's size, DPR, fps, frames and
length; the capture stats (whole take, the scene's `active` stretch, and
frames per second); the scene's **markers** `{ t, kind, label, box? }` (s
from the first frame; boxes from `locator.boundingBox()` × DPR, in video
px); and the **input** log: every key, pointer move, press, release and
wheel, logged in the page (`Date.now()`, the same wall clock as the
frames' timestamps), in video px. A later scene clicks through the
Settings popup, so pointer logging is required, not optional: scene
scripts move the pointer with `glide`/`glideClick` (`record/lib/mouse.ts`:
an eased arc, one step per display frame), never a jump. The headless
recording has no pointer of its own; `src/components/Cursor.tsx` draws one
from the log, inside the camera so it zooms with the picture.

A marker can also be set ahead of time (`markAt`), e.g. the night's
second of the sunset, which the scene knows when it starts the turn.

### The mocked feed: determinism, no real server

Takes log in through a mocked MUME WebSocket (`page.routeWebSocket`), as
the README screenshots do; the feed comes from the repository's fixtures
(invented names) through `scripts/lib/mume-feed.ts`, now shared by both.
MUME's date is pinned (`wc.clock`), the weather by the dev hook
`__weather`. Commands are typed visibly (`keyboard.type` with a delay) at
a pace a viewer can follow (about one move a second). A sunset that takes
a minute of game clock is played whole, five times faster
(`setSpeed(5)` with `emit('sun.set', { from: -60 })`, as the weather demo
does). A take is therefore the same every time, up to frame timing.

### Remotion for the cut

`video/` is its own npm package (Remotion 4.0.541, React 19.3.1, pinned)
with its own tsconfig; the root tsconfig, vitest and Playwright do not
see it. Compositions read their length, times and boxes from the
timeline, so a new take needs no retiming. Remotion renders with its own
headless Chrome (`npx remotion browser ensure`), PNG frames, H.264 CRF 14,
preset slow. Titles use the start page's fonts (Cinzel, Cormorant
Garamond; SIL OFL 1.1, copied with their licences to
`video/public/fonts/`). Remotion's licence is free for individuals and
companies of up to three people.

### Credentials and private material

No scene logs in to the real game yet. If one must, the credentials come
only from `MUME_USER` / `MUME_PASSWORD` in the environment or from
`video/.env.local` (gitignored), never from a committed file. The owner's
raw logs and backups stay in `video/private/` (gitignored); a feed made
from one is committed only after other players' names are replaced with
invented ones. Recordings, music (`video/public/music/`, with its licence
note) and renders (`video/out/`) are gitignored.

## Consequences

- `npm run record -- bree` takes about 47 s (setup about 10 s off camera,
  18 s on camera, 22 s encoding); `npm run render -- TestBree` about 60 s
  for 18 s of film (1062 frames at 1920×1080).
- The capture rate depends on the machine: on another one, run
  `--measure` and `gpu-probe.ts` first. The Intel flags assume a Mesa
  GL driver.
- Busy stretches run at about 48 fps (repeated frames in a 60 fps file).
  Quiet stretches send fewer frames because nothing changes.
- `scripts/screenshots.ts` behaves as before; its feed, login and weather
  helpers moved to `scripts/lib/mume-feed.ts` (with `connect`/`play` for
  paced playback) and its dev server start to `scripts/lib/dev-server.ts`.

## Open questions for the owner

- Caption wording and type: "MUME, in a browser tab." / "WebCockpit ·
  nothing to install, just a link"; "The map follows every step." /
  "Rooms and exits drawn as you walk Bree."; "Dusk falls over Bree." /
  "Weather and daylight follow the game." (the sunset runs five times
  faster than in the game).
- The zoom into the map: how deep and how long (now about 1.55×, held
  about 2.5 s).
- DPR 2 at about 48 fps, or DPR 1.5 at about 58 fps with softer zooms.

## Addendum (2026-11-08): the film's groundwork and part 1

Owner decisions since: no zooms in practice (the camera stays available),
so takes were captured at DPR 1.5 (`intel-1.5`), and since the banding
work below at **DPR 1.2 with PNG frames** (`intel-1.2-png`), unless a
scene asks for another mode (`Scene.mode`; the bree test scene zooms and
uses `intel-2`); few captions, plain and descriptive; real player names
stay. The film follows `video/manuscript.md` (the director's script, beat
grid at 81 bpm).

**Run log → feed** (`video/record/lib/run-feed.ts`). `loadBackup` reads a
runs backup (format: `src/runs/library.ts`); `excerptFeed` turns an
excerpt (run id, seconds from the run's start, `speed`, `drop` ranges,
`dropLines`/`dropCmds` patterns, `maxGap`) into timed Steps: the server's
lines at their compressed times, commands typed so that their Enter lands
when the player sent them. Dropped ranges lose their text and commands but
keep their GMCP (sent at the cut), so the panes never disagree with the
text. `prime` is every GMCP record before the excerpt (no text, no
`Comm.Channel.Text`): Char, Group, Room, the map's position and the timers
are right at the first visible line. `play()` (scripts/lib/mume-feed.ts)
takes an optional `at` per step for this. The excerpt specs are committed
(`video/feeds/film.ts`); the log stays in the gitignored `video/private/`.
`node record/feed-info.ts` shows what each excerpt comes to without its
content.

**MUME's login screen.** On a real connection the client shows, after
Enter MUME's transition (the scenery fades, the sky zooms and fades out
over the cockpit, about 4.5 s): `[SYSTEM] Connecting to MUME...`,
`[SYSTEM] Connected.`, `[SYSTEM] Profile <name> loaded.`, then MUME's
welcome text ending in `By what name do you wish to be known?`. It was
captured once (`node record/capture-login.ts`): the real client against
the real server through a Playwright WebSocket proxy that lets only telnet
negotiation and GMCP through (Core.Hello, Core.Supports.Set, pings) and
types nothing, so no name or password is ever sent. The server's frames
and their timing go to `video/private/mume-login.json` (MUME's text, not
committed). The mock (`record/lib/mume-login.ts`) replays them, then plays
MUME's side of a login: after the name `IAC WILL ECHO` and `Password: `
(staged, not captured: capturing it would mean sending a name), after the
password `IAC WONT ECHO`. The client masks the input line while the
server echoes. The scene types `Gittan` and a made-up password into a
socket that goes nowhere.

**Prepared state** (`record/lib/film-state.ts`): a fresh profile with the
new-player defaults; the bundled `khazdul` present and `default` selected;
weather off; **no panes at all** (owner: Comm is not used in the film; the
Settings scene switches on Map, Timers and Group); the five runs of the
film backup restored through `__wc.runs().restore()`; the page's `Date`
shifted to 2026-11-08 19:40 by an init script (`newPage({ now })`: rAF,
timers and `performance` untouched, unlike Playwright's `page.clock`;
workers keep the real date, so a scene that pins the weather by the clock
should not shift far); MUME's clock at 00:05 on 16 Wedmath (the middle of
the night) and the start page's sky `?skyWeather=fair` (a few clouds, the
stars showing through); the page's `Math.random` seeded (`newPage({ seed
})`, mulberry32), so the start page's quote and anything else random come
out the same on every take (seed 1: "Not all those who wander are lost.",
short enough to leave room for the lower third). The input log uses the
page's `performance` clock, which the date shift leaves alone.

**The shooting star on demand** (a dev-server hook in the client): the
start page's sky only starts shooting stars by itself (the first about
12 s after the page is dark enough, and never with clouds over 0.25, which
`fair` is). The owner wants one about 5–6 s into the film, so the sky
engine's handle has `shoot(at?)` (a star now, whatever the sky; its start,
direction and angle optional), defined only when `import.meta.env.DEV`
(absent from a production build, checked in `dist/`), and the start
surface publishes the handle as `globalThis.__wcSky` on the dev server
(in production still only with `?skyStats`, as before). `Bodies.shoot`
is the same code `update` now calls for its own stars. The film calls it
at 0:05.0 (`film-state.ts` `shootingStar`), top right, heading right.

**The pointer** (`record/lib/mouse.ts` `Pointer`; owner: the first take's
pointer looked scripted): straight to each target, no stops on the way; a
Fitts-like time (180 + 165 × log2(d / w + 1) ms, ±10 %); minimum-jerk
progress on warped time (t^0.72), so a fast start and a long deceleration;
a quadratic path bowed sideways by 3–11 % of the distance at a random point;
on moves over 180 px, three times in ten, 4–10 px past the target and back;
a landing point off the centre inside the target; a 150–350 ms pause before
the press and a 60–115 ms press; a drift of a pixel or so every 0.35–0.9 s
while it rests; steps 13–19 ms apart. All from a seeded generator, so a
retake moves the same; `clickAt(el, t)` plans the move so the press lands
at `t`. Typing is uneven the same way (85–205 ms between keys, seeded). The
cursor overlay hides a pointer that has rested 4.5 s and fades it back in
when it moves.

**Captions** (`src/components/Caption.tsx`): `LowerThird`, one or two short
plain lines in Cormorant Garamond low on the left on a solid scrim (92 %
black; the blurred band of the test scene let text show through), and
`TitleCard` (Cinzel over Cormorant italic, centred on a point) for the end
card. Both fade in with a 12 px rise and fade out in 0.45 s, inside a 5 %
safe margin.

**Beats** (`src/beats.ts`): `beatS(n)` = 0.4248 + n × 60/81 s, `beat(n)`
the frame, `isDownbeat(n)` for n ≡ 3 (mod 4). Scene scripts time their
presses by it too, so a take is already in step with the music and the
composition only lines it up (no retiming, no cuts inside an action).

**Part 1** (music 0:00 to beat 59, 0:44.13; owner: into Profile at
12–13 s, then Gittan arriving in the game): one take,
`record/scenes/part1.ts` → `src/compositions/Part1.tsx`. The shooting star
at 0:05.0; the lower third "Live demo of WebCockpit <version>" / "Try it at
mumecockpit.com" from beat 3 to beat 15 (the version read from the
repository's package.json when the film is bundled); Profile pressed on
beat 17 (0:13.02); the pointer on khazdul's row on beat 20 and its Select
on beat 23 (0:17.46); Back on beat 27 (0:20.43); Enter MUME on beat 31
(0:23.39), after which the pointer stays where it clicked and the overlay
fades it out there (2.5 s at rest; the start page is gone by then, so no
hover state lingers); MUME's screen up by about 0:28 (the client's
transition takes about 4.5 s); the name's Enter on beat 43 (0:32.28), the
password's on beat 47 (0:35.24); Gittan arrives at 0:35.9 (below); the
part ends on beat 59 (a bar, 0:44.13) with no fade, the game running:
part 2 continues from this state (the run's `gro pony` at 8.6 s lands at
about 0:44.5). "Profiles hold your basic settings." from 0.9 s after
Profile until just before Back. Every press landed within 30 ms of its
beat. A take is about 48 s (78 s with setup and encoding).

**Arriving in the game** (`feeds/arrival.ts`). MUME's text after a
password was never captured (that needs real credentials), and no log
here has a fresh login: the Bree run starts at Char.Name, and the owner's
Cockpit run logs (`/home/ole/MUME/data/runs`, read only) start after their
logins; the one login in them is a reconnect ("Reconnecting.", the room,
MUME's Discord notice, the prompt). So the arrival is staged from the run:
all its GMCP before its start (Char.Name puts the client in playing, and
the client prints `[SYSTEM] Gittan logged in.` by itself), then the room
as that GMCP has it (Lodging Foyer; Barliman, the pony, an elite guard
from Room.Chars.Set; no description, Gittan plays in brief mode, as her
own `l` shows), MUME's Discord notice as it follows the room in that log,
and the run's first prompt. Then the run plays on in real time from
0.5 s (its two `Ok.` for the owner's start-up script left out): the guard
leaves south, `l`, `lead pony`. No panes.

**Dark gradients** (owner: blocky banding around the Profiles box's frame
and glow, crawling where the sky changes colour). Measured with
`record/banding.ts` (the start page at night, sky frozen, Profile open;
the same crop of the box's corner and glow from each stage, boosted with
curves 0/0 0.25/1 1/1) and `record/master-test.ts` (the final encodings,
and each re-encoded as YouTube would: 8-bit VP9 at 6 Mbit/s for 1080p,
18 Mbit/s for 4K):

- The browser's own picture (`page.screenshot`, and a PNG screencast
  frame) is smooth; the sky carries a fine grain of its own.
- **JPEG screencast frames are where it starts**: q95 has 8×8 blocks and
  stepped purple arcs round the glow; q100 still has the arcs (Chrome's
  JPEG is 4:2:0 at any quality). Only PNG frames are clean.
- x264 CRF 12 `-tune animation` 4:2:0 then blocked them further, and the
  8-bit CRF 14 render added its own steps.
- Lossless intermediates from the PNG frame: libx264rgb QP 0 is
  bit-exact through Remotion's OffthreadVideo (PSNR ∞ against the frame,
  checked with `src/DecodeTest.tsx`); x264 4:4:4 QP 0 52.5 dB and ProRes
  4444 51.1 dB (their YUV rounding), both clean too.
- Finals from the ProRes master: H.264 8-bit CRF 14 keeps a faint
  contour round the glow; 10-bit (H.264 High 10, HEVC Main10) is clean.
  Added grain (`noise` ±3 levels) made the 10-bit file 70–90 Mbit/s and
  turned to blotches in the 6 Mbit/s VP9 re-encode, so none is added: the
  sky's own grain dithers. The 4K upload's VP9 re-encode at 18 Mbit/s
  keeps the glow smooth.

Capture rates with PNG (part 1's start page, frames a second while the sky
moves): DPR 1.5 about 34 (`intel-1.5-png`, mean 27.7 over the take), DPR
1.2 about 46 (`intel-1.2-png`, mean 36.5; NVIDIA 24.5), JPEG q100 at DPR
1.5 about 59. The cost is Chrome's PNG encoder (acking without writing
the frames gave 45 fps at DPR 1.2), so it is a ceiling, not ours to tune.

Chosen: **capture PNG at DPR 1.2** (1600×900 CSS is 1920×1080, the film's
own size, so no scaling after; Chrome gives 1920×1079 frames, padded with a
black row); the recording **libx264rgb QP 0**, RGB, GOP 30 (about 4 MB a
second of film); Remotion renders a **ProRes 4444 master**
(yuv444p10le requested; 2.3 GB for part 1, 90 s); `record/master.ts` then
makes **`<name>.mp4`, HEVC Main10 CRF 14** (aq-mode 3, no SAO; 6 MB, 66 s),
**`<name>-4k.mp4`, HEVC Main10 3840×2160** (Lanczos, CRF 16; 12 MB, 215 s)
for the YouTube upload, and **`<name>-h264.mp4`, H.264 8-bit CRF 12**
(22 s) for players without HEVC 10-bit (browsers). `npm run render`
does both steps (about 6.5 min for part 1; `--no-4k` skips the 4K
variant). A scene with fast motion that needs 60 fps can ask for
`intel-1.2-q100` and accept JPEG's chroma steps; part 1 stays PNG: its
start page moves slowly, and 46 frames a second of it play smoothly.

**Found on the way** (client, not fixed here): when Enter MUME is pressed
before `shell.boot()` has returned (fast automation; the start page's
reveal still running), `src/main.ts` prints `[SYSTEM] Offline replay
mode.` on a real connection. A person is unlikely to be that fast; the
film waits.

## Addendum (2026-11-08): the whole film, first cut

Built from `video/manuscript.md` draft 3 while the owner was away, for him
to watch and polish. Composition `Film` (`src/compositions/Film.tsx`),
two takes:

- **Take A** (`record/scenes/take-a.ts`), music 0:00 to beat 125
  (1:33.02): part 1 (`opening` in `scenes/part1.ts`), part 2 and the
  first half of part 3 in one continuous take. After the arrival the run
  is cut into segments that keep its order (pony and fountain; `where`;
  the mercenary; the West Gate; the casts; the second wolf), each started
  at its music time at its own speed (1 to 2.4), with the GMCP of what is
  cut between them sent at the next one's start (`Excerpt.primeFrom`), so
  the map, Group and Timers stay right. A game track, a pointer track and
  a weather track run side by side; no command is typed while a popup
  holds the keys.
- **Take B** (`record/scenes/take-b.ts`), beat 125 to the end: off camera
  the run is played fast to just before the inn (so the panes carry its
  state), Map, Group and Timers on, weather on (following the game: night
  by then, indoors), khazdul selected; on camera the inn and the barman,
  his monologue at 3.1× behind the Profile and Scripts windows, Exit,
  History's log player, Spotlights' viewer, Credits, and the start page,
  which holds under the montage and the end card.

**Staged** (everything else is the owner's run, time-compressed):

- The weather, after the switch is flipped on camera at the fountain:
  `__weather.jump` to a clear night (the run says late afternoon; the
  manuscript asks for the night sky), clouds and light rain at 1:15.6,
  heavy rain at 1:17.9, and `emit('strike', { storm: true })` called
  210 ms before beat 107: the return stroke's flash was measured on the
  take's frames (mean brightness of the game area) to land on 1:19.67.
  The bolt itself comes down between the text and the Map pane (it
  avoids the map), so the strike reads mostly as the sky's flash.
- When the Map pane comes on, the fountain's Room.Info is sent again (it
  counts as a look) once the map has read its map file (it reads it the
  first time its pane appears; a Room.Info before that is not placed):
  the map was hidden when Gittan got there and would otherwise show its
  default place until her next move. Its default view still shows for
  about 0.3 s while it reads ("Drawing map…").
- Take B's windows (Profile, Scripts) are placed a little shorter than
  their default (settings `windows`, in cells) so the lower thirds sit
  below them; Find in the Editor goes to the new alias (khazdul is 500
  lines long).

**The pointer** gained `clickAt(…, { quick: true })` for clicks a beat
apart (the Settings tabs, a Panes row after its popup): no wait for the
target to settle, a 30 % shorter move, a 40–90 ms pause.

Rendering the whole film's ProRes master (about 11.6 GB) filled /tmp (a
tmpfs here), where Remotion stages it, and its ffmpeg quit mid-render;
`record/render.ts` now points TMPDIR at `video/out/tmp`. The film renders
in about 14 minutes (master 7.5, HEVC 5, H.264 1.5); the 4K variant would
add about 15.

**Capture**: both takes PNG at DPR 1.2. Frames a second are what the page
sends: about 46 on the start page, 12 while the clear night sky is the
only thing moving (its stars repaint at about 12 Hz: content, not
capture), 50–55 in the storm and the fight, 24–45 in take B's windows and
pages. No take needed JPEG.

The montage (beats 221–239) is nine cuts of two beats from the takes:
the shooting star, the sky fading in, Paper, the map, the strike, the
wolf fight, the profile editor, the log player, the spotlight. The end
card (beat 239) is the lower-third box centred low over take B's start
page; from beat 251 the picture and the music fade, black at 3:10.

**Polish (2026-11-08).** Take B's start page kept the game's clock: the
run's GMCP synced `wc.clock` to its own time, so History, Spotlights and
Credits stood under a sunset and the end card under dusk on another date.
Take B now lets only the film's pin write `wc.clock` (an init script drops
writes whose precision is not `unset`), so every start-page moment is the
opening's night (16th of Wedmath, T.A. 3039, fair). The start page's quote
is hidden on the recorded page under the montage (an injected style at
beat 233), so the end card stands on the sky alone. The Timers caption now
starts once Shield, Armour and Shroud are in the pane (0.4 s into the wolf
segment, 4 s long) and the Group caption follows a second later until just
before the cut. The film is rendered to temporary names and moved over
`webcockpit-demo.mp4` and `-h264.mp4` when done, so a playable film is
always there.
