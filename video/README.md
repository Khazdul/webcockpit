# The WebCockpit presentation film

Scripted recordings of the client, cut in [Remotion](https://www.remotion.dev/).
The film is 1920×1080 at 60 fps; its text is English. How and why: ADR 0133
(`docs/decisions/0133-presentation-film-pipeline.md`).

This is its own npm package (React and Remotion stay out of the app). The
recorder uses the repository's Playwright and dev server, so install both:

```sh
npm ci                      # in the repository root
cd video && npm ci
npx remotion browser ensure # Remotion's own headless Chrome, once
```

## Record a scene

```sh
npm run record -- take-a                     # the film's take A (0:00–1:33), public/recordings/take-a.*
npm run record -- take-b                     # the film's take B (1:33–3:10)
npm run record -- part1                      # part 1 alone (public/recordings/part1.*)
npm run record -- part1 --mode intel-2       # another capture mode (record/lib/browser.ts)
npm run record -- bree --measure             # every mode: an fps table, no files kept
node record/gpu-probe.ts                     # which flags give WebGL2 on which GPU
node record/capture-login.ts                 # MUME's real welcome screen → private/ (once)
node record/feed-info.ts [name] [-v]         # what the film's excerpts come to
node record/frames.ts <mp4> <png> <t…>       # a contact sheet, to check a take by eye
```

The film is written in `manuscript.md` (the director's script and its beat
grid). Its scenes start from the same prepared browser
(`record/lib/film-state.ts`: khazdul bundled but `default` selected, weather
off, no panes, the five film runs restored, the page's date, MUME's clock,
the start page's sky and `Math.random` pinned). Scenes move the pointer with
`Pointer` from `record/lib/mouse.ts` (seeded, hand-like, straight to each
target) and fire the start page's shooting star with `shootingStar` (a
dev-server hook). Game excerpts come from the owner's runs backup in
`private/film-runs.jsonl.gz` through `record/lib/run-feed.ts`; the specs (run
id and seconds) are in `feeds/film.ts`. MUME's login screen is the real one,
captured once into `private/mume-login.json` and replayed by
`record/lib/mume-login.ts`.

The recorder starts the repository's dev server on port 5189 (`WC_VIDEO_PORT`)
unless one answers there, logs in through a **mocked** MUME WebSocket (nothing
reaches mume.org) and plays the scene's feed (`feeds/`, invented names only).
It films in real time through the DevTools screencast with PNG frames at
1920×1080 (1600×900 CSS px at device scale 1.2; a scene that zooms asks for
2), then encodes them losslessly (libx264rgb, QP 0) at a constant 60 fps.
JPEG frames band dark gradients (ADR 0133 addendum; `node record/banding.ts`
shows each stage).
It prints the capture rate it got; ADR 0133 has the measured table.

Each recording comes with `<scene>.json`: size, fps, length, the capture
stats, the scene's **markers** (`{ t, kind, label, box? }`, seconds from the
first frame, boxes in video pixels) and the **input** log (every key, pointer
move, press, release and wheel, same clock, video pixels). The compositions
take all their times and boxes from it, so a new take needs no retiming.

A scene is a file in `record/scenes/` (`setup` off camera, `run` on camera);
add it to `SCENES` in `record/record.ts`. Type with `play(..., { typeDelay })`
from `scripts/lib/mume-feed.ts`; move the pointer with `glide` / `glideClick`
from `record/lib/mouse.ts` (smooth, eased paths; never a jump). The recording
is headless and has no pointer of its own: `src/components/Cursor.tsx` draws
one from the input log.

## Preview and render

```sh
npm run studio                       # Remotion Studio in the browser
npm run render -- Film --out webcockpit-demo   # the whole film: out/webcockpit-demo-master.mov (ProRes 4444), then
                                     #   webcockpit-demo.mp4 (HEVC 10-bit), -youtube.mp4 (4K H.264, the upload), -h264.mp4
npm run render -- Film --out webcockpit-demo --no-4k   # without the YouTube 4K variant
npm run render -- Part1              # the same for part 1 alone
node record/thumbnail.ts             # out/thumbnail/: the start page at 3840×2160, for the YouTube thumbnail
npm run render -- TestBree           # out/test-bree.mp4 (the pipeline test)
npm run typecheck
```

Compositions live in `src/compositions/` and are registered in `src/Root.tsx`;
`src/components/` has the camera (zoom into a timeline box), the captions
(`LowerThird`, `TitleCard`) and the pointer. Time things by the music's beats
with `beat(n)` from `src/beats.ts` (scene scripts use `beatS(n)`).

## Files that stay local

Ignored by git: `public/recordings/` (takes), `public/music/`, `out/`,
`private/`, `node_modules/`, `.env.local`.

- **Music** goes in `public/music/`. The film uses *Sunset Plains* by
  Yoiyami (CC0, opengameart.org): `public/music/sunset-plains.wav`, with its
  licence note beside it (`sunset-plains-license.txt`). Copy both from the
  owner's music folder.
- **Fonts** in `public/fonts/` are the start page's (Cinzel, Cormorant
  Garamond; SIL OFL 1.1, licences beside them) and are committed.
- **Raw logs**, the film's runs backup (`private/film-runs.jsonl.gz`) and the
  captured login screen stay in `private/`; scenes read them there and only
  the excerpt specs are committed. The film shows real player names (owner,
  2026-11-08); a feed *committed* to the repository still uses invented ones.
- **Credentials** (only for a scene that logs in to the real game, which none
  does yet): `MUME_USER` and `MUME_PASSWORD` from the environment or from
  `video/.env.local`. Never in a file that is committed.

Remotion is free for individuals and companies of up to three people (its
licence, remotion.dev/license).
