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
npm run record -- bree                       # public/recordings/bree.mp4 + bree.json
npm run record -- bree --mode intel-1.5      # another capture mode (record/lib/browser.ts)
npm run record -- bree --measure             # every mode: an fps table, no files kept
node record/gpu-probe.ts                     # which flags give WebGL2 on which GPU
```

The recorder starts the repository's dev server on port 5189 (`WC_VIDEO_PORT`)
unless one answers there, logs in through a **mocked** MUME WebSocket (nothing
reaches mume.org) and plays the scene's feed (`feeds/`, invented names only).
It films in real time through the DevTools screencast at 3200×1800 (1600×900
CSS px at device scale 2), then encodes the frames to constant 60 fps H.264.
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
npm run render -- TestBree           # out/test-bree.mp4
npm run typecheck
```

Compositions live in `src/compositions/` and are registered in `src/Root.tsx`;
`src/components/` has the camera (zoom into a timeline box), titles and
captions, and the pointer.

## Files that stay local

Ignored by git: `public/recordings/` (takes), `public/music/`, `out/`,
`private/`, `node_modules/`, `.env.local`.

- **Music** goes in `public/music/`. The test scene uses *Sunset Plains* by
  Yoiyami (CC0, opengameart.org): `public/music/sunset-plains.wav`, with its
  licence note beside it (`sunset-plains-license.txt`). Copy both from the
  owner's music folder.
- **Fonts** in `public/fonts/` are the start page's (Cinzel, Cormorant
  Garamond; SIL OFL 1.1, licences beside them) and are committed.
- **Raw logs** of real sessions go in `private/`. A feed made from one is
  committed only after other players' names are replaced by invented ones.
- **Credentials** (only for a scene that logs in to the real game, which none
  does yet): `MUME_USER` and `MUME_PASSWORD` from the environment or from
  `video/.env.local`. Never in a file that is committed.

Remotion is free for individuals and companies of up to three people (its
licence, remotion.dev/license).
