# 0164 — The morph's proxy on the compositor (phones and tablets), and what the transitions cost

Date: 2026-11-19. Status: accepted (built on `stage-74b`, stage 74 part
B). Related: ADR 0127 (layout B and its morph: the plan, the proxy, the
measured blur rule), ADR 0125 (the start surface), ADR 0140 (the device
flags), ADR 0135 (Firefox's frame pacing).

Numbering note: part A of stage 74 was built in parallel; if a number
collides at the merge, the main session renumbers.

## Context

The owner's report (stage 74): the start menu's page transitions are
sometimes choppy; clearest on his phone (a Samsung S21) when About opens,
and, he thinks, only the first time. He asked for a review of how the
transitions work and for them to be as smooth as they can be, on the
phone above all and on other devices too.

The morph (ADR 0127) moved an empty iron frame, the proxy, from the old
box's rectangle to the new one's by animating its `left`, `top`, `width`
and `height`: layout properties, so every frame of the flight was a
layout, a paint and a new raster of the whole proxy, and every frame
needed the main thread.

## What was measured

`bench/transition-bench.ts` plays the transitions in headless Chromium on
a production build: a phone (360 × 800 at ratio 3, the CPU throttled 4×
and 6×), a tablet both ways (820 × 1180 at ratio 2, 4×) and two desktop
windows (1920 × 1080 and 2560 × 1440, 1× and 4×), each page's first visit
after a fresh load and its second; frame intervals, a DevTools trace by
kind, long tasks, and which animations the compositor refuses.
`bench/transition-stall.ts` blocks the main thread mid-flight and watches
the proxy from outside (a screencast). `bench/transition-shots.ts`
photographs the flight at fixed times and compares two builds. Numbers:
`bench/results/transitions-74-*.md`.

What the bench cannot see: the CPU throttle slows the main thread only;
raster and the GPU process run at this machine's speed, and its GPU is no
phone's. So it shows main-thread work exactly and raster work only as
"how much is asked for".

Findings:

1. **The flight depended on the main thread, frame by frame.** With the
   main thread blocked for 500 ms a third of a second into About's
   opening, the laid-out proxy stood still for the whole block (21 frames
   presented, its edge on one row) and then jumped 155 px. Nothing in a
   steady run blocks that long, but a first visit has such moments (2, 3).
2. **A first visit costs two to three times a second one in the click
   frame** (the new page's mount, first style and first layout: on the
   phone at 4× about 135 ms against 63 for About; first-time text
   shaping is the largest part), and more GPU work (first raster of the
   page's text). No font, image or chunk is fetched (they are all there
   from the start page), and About's own flag lookups (`privacy-accounts`,
   `privacy-share`) belong to the privacy leaf, not to About.
3. **Scripts' first visit ran a 180–320 ms main-thread task in the middle
   of its opening** (phone and tablet at 4× and 6×; 45 ms on an
   unthrottled desktop):
   the page's syntax check of the stored scripts loads and compiles the
   Lua runtime (WebAssembly) the first time. It landed 120–150 ms after
   the tap, in the items' fade and the start of the flight.
4. **The proxy was nearly all of the raster work of a transition.** With
   software raster (so that raster shows as CPU time) a phone's opening
   asked for about 850 ms of raster, 84 ms without the proxy; a tablet's
   for 2.3 s; a 2560 × 1440 window for 3.1 s against 0.37 s. The sky's canvases were a few
   per cent; the wordmark and the scenery move by transform and opacity
   already. In the GPU process the same shows as 30–45 % of its time
   over a transition.
5. **On this machine's GPU the frame intervals of the laid-out flight are
   clean at every size** (no interval over 34 ms in a steady run, desktop
   and phone geometry alike). The costs of 1–4 are real but do not show
   as dropped frames here; on a phone's GPU they may.

## Decision

- **On a phone or a tablet the proxy flies on the compositor.** It is
  drawn in pieces that take only a transform or an opacity
  (`proxyFlight`, src/chrome/kit/look-motion.ts): the pane (the iron and
  the window glass) drawn once at the larger of the flight's two sizes
  and scaled; the outer shadows drawn once per end and cross-faded; the
  four edges scaled along their length only, so every line keeps its
  width; the four corners with their brackets and the hood's holder only
  moved. Every transform is `translate() scale()` from the viewport's
  origin, linear in the easing's progress: the geometry is the one the
  animated `left`, `top`, `width` and `height` had, and `MOTION` is
  untouched. A frame of the flight is then no layout, no paint and no
  raster, and needs nothing of the main thread: under the same 500 ms
  block the proxy moved on every one of the 26 frames presented. The GPU
  process's time over a transition fell by 30–45 % on the phone and the
  tablet geometries, and the raster asked for (software raster) to a
  fifth on the phone (about 850 → 110–170 ms) and an eighth on the
  tablet (2.3 s → 0.3 s). The frame intervals are as before there
  (clean in both builds on this machine); the click frame is 5–25 ms
  longer under the 4–6× throttle (the pieces' animations are set up in
  it).
- **On a desktop the proxy stays one laid-out box**, as ADR 0127 built
  it. In pieces, the large pieces are rastered whole in one go when the
  flight starts (or, drawn ahead of it, when the tap lands), and on a
  1920 × 1080 or 2560 × 1440 window that cost one or two intervals of
  35–75 ms that the laid-out proxy does not drop there (it spreads the
  same raster over the flight's frames, which a desktop GPU keeps up
  with). A desktop has the main thread to spare; a phone has not. The
  rule is `proxyInPieces()` (src/chrome/start-morph.tsx): the device's
  `phone` flag (ADR 0140: phones and tablets). `?morph=pieces` and
  `?morph=layout` force either, to compare on a device.
- **Scripts checks its scripts' syntax once the page has settled**
  (`useBoxSettled`): the Lua runtime's first compile no longer lands in
  the morph. The marks of a script that does not compile come a moment
  after the page (they were asynchronous before).
- The choreography's look and timings are unchanged.

## As built

- `look-motion.ts`: `ProxyPiece`, `proxyAt`, `proxyFlight`, `snapRect`
  (pure; the rectangles are snapped to device pixels, as layout paints a
  box, so the pieces' lines are as sharp as the box's at both ends).
- `start-morph.tsx`: `proxyInPieces`, `MorphStage.flyPieces`; the proxy's
  rectangle mid-flight (a reversal starts from it) is its pane's. The
  promises of the file's header stand: final size at mount, focus at
  mount, keys at once, reversal from where the proxy is, reduced motion.
- `start-surface.tsx` `MorphProxy`: the markup of either proxy.
  `look.css`: the laid-out proxy as it was; `.wc-lk-px` and its pieces.
- The hood's width is still a laid-out animation in both (a 74–200 px
  plate; in pieces its position is its holder's transform, so a late
  main-thread frame can only delay its widening).

The look, compared picture by picture at fixed times of the plan
(`transition-shots.ts`): on the desktop geometries the two builds are
identical, pixel for pixel, throughout the flight. In pieces, at the
large end the frame matches the real box within 2 of 255 everywhere on
its edges, and is closer to it than the laid-out proxy was (whose paint
containment cut the brackets' outer pixel row). Accepted differences in
pieces: mid-flight the edges lie between pixel rows (a transform is not
snapped per frame as layout is); at the small end the glass's top glow
and inner shadow are the large box's, shrunk (the menu panel it hands
over to has another glass anyway: blurred, ADR 0127); the outer shadows
are a blend of the two ends' in between.

## Tried and not kept

- **The pieces on every device.** Measured worse on the desktop windows
  (above).
- **Two panes cross-faded** (exact glass at both ends): one more
  full-size layer in the start burst; the single pane's difference is
  the small end's glow only.
- **Drawing what waits ahead of time** (the proxy before it shows and the
  new page before it lands at an opacity of 0.004, so the compositor
  rasters them while the old content fades): it did move the raster away
  from the landing, but into one burst 60–150 ms after the tap that was
  larger than what it replaced (50–100 ms intervals on the desktops).
- `will-change: transform` on the scaled pieces (to keep a scaled-up
  piece's raster small): no gain; the first raster is at the scale the
  piece starts at.
- A main-thread "ticker" animation beside the pieces (to imitate the
  laid-out flight's steady commits): no effect on the start burst.

## Left

- The first-visit click frame (finding 2) is the new page's own mount
  and first layout; it comes before any motion and delays the plan as a
  whole rather than breaking it. Warming a page's text shaping at idle
  would take perhaps a third off it; not done (no measured dropped
  frame, and it spends work on pages that may never open).
- A large → large swap (About → Privacy) and History's tab changes fade
  whole pages of text: every faded child becomes a layer for the fade,
  one burst of raster at its start (an interval of 35–50 ms now and then
  on the desktops, both builds). Fading the window as one layer would
  avoid it but changes what stays lit during the swap: a matter of look.
- Enter MUME's transition: the sky's zoom and the fades are compositor
  animations; its sweep animates `mask-position`, which no browser
  composites, so the whole surface is repainted per frame for 4 s. Not
  touched (it would be a rebuild of the sweep as a translated mask).
- Dialogs, popovers, History's card and the arrival on a page: opacity
  and transform only, nothing to do.
- Firefox: Playwright's headless Firefox composites in software on a
  timer (intervals of 130–320 ms at these sizes in both builds), so it
  can only say that nothing changed on the desktop, which runs the same
  laid-out proxy as before. The pieces in a real Firefox (Firefox for
  Android would get them) are not measured; transform and opacity
  animations are compositor animations there too.
- Whether the pieces are in fact smoother on the owner's phone, and
  whether a phone's GPU pays visibly for the start burst, only the phone
  can tell: `?morph=layout` and `?morph=pieces` are there for that.
