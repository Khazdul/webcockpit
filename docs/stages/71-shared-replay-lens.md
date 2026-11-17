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

- [ ] A. Phone and tablet: the shared replay mounts the phone layer
      (`PlayerHostOptions.phone`) in the frame and the HTML file; lens keys
      panes and fullscreen only; panes area off at start; box without
      Fullscreen and Panes.
- [ ] B. Desktop: the lens over the shared replay (ring look of the phone's
      lens, scaled), pan, wheel zoom, follow icon and double click, move
      handle, rim resize, the three keys.
- [ ] C. Desktop: Group and Timers as floating panes at the bottom right,
      off at start, toggled by the lens keys; the box without Panes.
- [ ] D. Tests (unit and e2e for phone and desktop viewports), ADR, review.
- [ ] E. Staging; the owner's test.

## Test guide

(Written when built.)

## Owner feedback

(After the test.)
