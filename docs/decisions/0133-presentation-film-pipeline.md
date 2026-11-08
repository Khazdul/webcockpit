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
so takes are captured at **DPR 1.5** (`intel-1.5`, about 58 fps on the
start page) unless a scene asks for `intel-2` (`Scene.mode`; the bree
test scene does); few captions, plain and descriptive; real player names
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
weather off; Map, Timers and Group hidden, Comm shown; the five runs of the
film backup restored through `__wc.runs().restore()`; the page's `Date`
shifted to 2026-11-08 19:40 by an init script (`newPage({ now })`: rAF,
timers and `performance` untouched, unlike Playwright's `page.clock`;
workers keep the real date, so a scene that pins the weather by the clock
should not shift far); MUME's clock at 23:15 on 15 Wedmath, just after
sunset, so the start page shows dusk with the stars coming out, darkening
to night over the take (a shooting star crosses when the sky is dark
enough; the takes so far had one near 0:34). The input log now uses the page's
`performance` clock, which the shift leaves alone.

**Captions** (`src/components/Caption.tsx`): `LowerThird`, one short plain
sentence in Cormorant Garamond low on the left on a solid scrim (92 %
black; the blurred band of the test scene let text show through), and
`TitleCard` (Cinzel over Cormorant italic, centred on a point) for the
opening and end cards. Both fade in with a 12 px rise and fade out in
0.45 s, inside a 5 % safe margin.

**Beats** (`src/beats.ts`): `beatS(n)` = 0.4248 + n × 60/81 s, `beat(n)`
the frame, `isDownbeat(n)` for n ≡ 3 (mod 4). Scene scripts time their
clicks by it too, so a take is already in step with the music and the
composition only lines it up (no retiming, no cuts inside an action).

**Part 1** (music 0:00 to 0:50.06, beat 67): one take,
`record/scenes/part1.ts` → `src/compositions/Part1.tsx`. Profile is
clicked on beat 27 (0:20.43), khazdul highlighted on beat 31 and its Select
on beat 35 (the phrase at 0:26.36), Back on beat 41, Enter MUME on beat 47
(0:35.24, rather than beat 51 at 0:38.21: the client's transition takes
about 4.5 s, and MUME's screen should be held a few seconds before the
name), the name's Enter on beat 61, the password's on beat 65. The opening
card (WebCockpit · mumecockpit.com) stands left of the menu from beat 3
to beat 15, clear of the wordmark and the menu. A take is about 54 s
(93 s with setup and encoding); the render about 100 s.

**Found on the way** (client, not fixed here): when Enter MUME is pressed
before `shell.boot()` has returned (fast automation; the start page's
reveal still running), `src/main.ts` prints `[SYSTEM] Offline replay
mode.` on a real connection. A person is unlikely to be that fast; the
film waits.
