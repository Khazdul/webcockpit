# Stage 71 — The shared replay with the lens

Not a spec §5 row: the owner's request of 2026-11-17. Panes in a shared run
(a share link `/r/<id>`, the Hall of Fame, an exported HTML replay) land in
odd places. The shared replay is reworked around the map lens: always on,
with Group and Timers reached from it.

Scope (the owner's pick): **shared runs only**, i.e. everything played by
`openReplay` (`src/replay/page.ts`): the watch page's frame
(`src/replay/frame.ts`) and the exported HTML file. History's run log player
and Spotlights keep the full cockpit with every recorded pane, as today.

Published runs follow by themselves: the watch page's frame plays the stored
payload with the site's current runtime (the layout is decided at play time,
`sharedPayload` already overrides the recorded panes). An HTML file exported
before this keeps the runtime it was exported with.

## The owner's direction (2026-11-17)

### Phone and tablet

1. A shared run plays in the game's phone layout (as the run log player on a
   phone already does, stage 55), with the **lens at the top right, always
   on**. Its behaviour (size, zoom by tap and pinch, move and resize by
   touch) is the game's.
2. The lens has two keys: **fullscreen** at the top right, **panes** at the
   top left. No Comm key (a shared run has no Comm).
3. The player box loses its **Fullscreen** and **Panes** buttons.
4. The panes area is where it is in the game: at the top in portrait, at the
   left in landscape. One swipes between **Group** and **Timers**.
5. The panes area is **off at the start**; the panes key turns it on and off.

### Desktop

6. The **lens is always shown at the top right**, a size fitting a desktop.
7. Keys on the lens: **fullscreen** top right, **Group** top left, **Timers**
   bottom right. Group and Timers each toggle their pane on and off.
8. **Bottom left: a move handle** (an icon that says "drag here to move
   me"); dragging it moves the lens.
9. **Click and drag inside the lens pans the map.** The **mouse wheel**
   (and a touchpad swipe) zooms in and out.
10. After a pan the lens stays where it was dragged; a **follow** icon
    appears in the lens, and it (or a **double click**) centres on the
    player again and follows from then on (the owner's pick).
11. With the pointer **near the lens's rim**, a resize cursor shows; dragging
    there resizes the lens.
12. **Group and Timers float**, reasonably large, at the **bottom right**
    (Timers above Group, as in the owner's screenshot of 2026-11-17), both
    **off at the start**.
13. The player box loses its **Panes** button; **Fullscreen** stays.

Where something is unclear, the phone lens's behaviour is the model; ask the
owner if that does not settle it.

## Plan and tasks

- [x] A. Phone and tablet: the shared replay mounts the phone layer
      (`PlayerHostOptions.phone`) in the frame and the HTML file; lens keys
      panes and fullscreen only; panes area off at start; box without
      Fullscreen and Panes. (`src/replay/phone.ts`: the runtime decides the
      device flags; the phone layer is inlined in the replay IIFE and runs
      only on a phone or tablet. `PhoneReplay.fullscreen`, `comm: false`;
      `sharedPhoneSettings`: lens on, strip pages Group then Timers.)
- [x] B. Desktop: the lens over the shared replay (ring look of the phone's
      lens, scaled), pan, wheel zoom, follow icon and double click, move
      handle, rim resize, the three keys. (`src/player/desk-lens.ts`,
      `desk-lens.css`; `Cockpit.setDeskLens`; the map pane's hand lens and
      the worker's `follow`.)
- [x] C. Desktop: Group and Timers as floating panes at the bottom right,
      off at start, toggled by the lens keys; the box without Panes.
      (`deskPaneRects`, `deskPanesLayout`, anchored by the host at every
      layout until the viewer moves one; they stay under the lens.)
- [x] D. Tests (unit and e2e for phone and desktop viewports), ADR, review.
      ADR 0160. Unit: `tests/unit/desk-lens.test.ts`, the worker's follow
      in `map-worker.test.ts`. E2e: `watch-lens.spec.ts` (desktop),
      `phone-watch-lens.spec.ts` (portrait, landscape, fullscreen key); the
      watch page, sandbox, replay, viewer and map zoom specs follow the lens.
      Screenshots: `docs/stages/img/71-*.png`.
- [x] E. Staging (2026-11-18): full e2e alone, staging deploy, `test:prod`
      36/36 on staging.
- [ ] F. The owner's test on staging; a release on his word.

Open after the build:

- The replay runtime (the exported file and the frame) grew from 1 427 KB
  to 1 666 KB (gzip 487 → 553 KB): it carries the phone layer. A slimmer
  replay-only entry of the phone layer is possible if the size matters.
- The desktop lens's zoom and follow state start over after a backward
  seek (a new map worker); its place and size are kept.
- On a phone the watch page scrolls (stage 65): the docked bar is at the
  frame's foot, under the fold until the page is scrolled, as the box was.

## Test guide

Open a shared run: a share link `/r/<id>` or a Hall of Fame log on the
staging site, and an HTML file exported from History (Download as HTML).

On a computer:

1. The map is a round lens at the top right from the start. Group and
   Timers are not shown.
2. Click the lens's top left key (Group) and its bottom right key
   (Timers): each pane floats at the bottom right, Timers above Group.
   Click again to hide them.
3. Drag inside the lens: the map pans and a follow key (a crosshair)
   shows at the bottom of the lens. Click it, or double click the map: the
   map centres on the player and follows again. Scroll the wheel (or swipe
   the touchpad) over the lens to zoom.
4. Drag the bottom left key (four arrows) to move the lens. Point at the
   lens's rim: the cursor becomes a resize arrow; drag to resize.
5. The top right key and F toggle fullscreen; the control box still has
   Fullscreen but no Panes.

On a phone and a tablet (portrait and landscape):

1. The run plays in the game's phone layout with the lens at the top
   right: tap and pinch zoom, move and resize by touch, as in the game.
2. The lens has two keys: panes (top left) and fullscreen (top right).
   The bar at the bottom has no Fullscreen and no Panes.
3. The panes area is off at the start. The panes key opens it at the top
   (portrait) or at the left (landscape) on Group; swipe to Timers.

Feedback wanted: the desktop lens's size and place, how the keys and the
move handle read, whether Group and Timers are large enough and well
placed, the follow behaviour after a pan, and the phone views.

## Owner feedback

Round 1 (2026-11-17, from the screenshots, before staging):

1. [x] The desktop lens's keys stood off the lens at its box's corners. They
   now sit on the diagonals, set into the ring (centre on the ring's outer
   edge, overlapping it and a little of the glass), and are larger (44 px,
   24 px icons; the follow key 38 px).
2. [x] Group and Timers: the same height by default (8–14 rows, a third of
   the height), a row of air between them and a row under the lens when
   there is room. Short of rows both shrink alike to 5 rows; only then the
   air goes (under the lens first). (`deskPaneRects`.)
