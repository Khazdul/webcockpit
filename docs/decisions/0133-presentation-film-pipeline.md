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
