# Stage 73 — The shared replay, round 2

Not a spec §5 row: the owner's feedback of 2026-11-18 on stage 71's shared
replay (a share link `/r/<id>`, a Hall of Fame log, an exported HTML
replay: everything played by `openReplay`, `src/replay/page.ts`). History's
run log player and Spotlights are untouched, as in stage 71.

## The owner's direction (2026-11-18)

### Bug

1. When a shared run plays (seen on desktop), the map is sometimes drawn
   **outside the lens** (screenshot: rooms and labels left of the ring and
   past its bottom). The map must always be inside the lens.

### Desktop

2. **No icons at the lens.** The Group and Timers keys go; Group and Timers
   are toggled from the **player box's Panes popup again**, as before stage
   71. The map (the lens) is toggled from there too. Default: the map on,
   Group and Timers off.
3. **Click and drag moves the lens** (it no longer pans the map). The move
   handle and the fullscreen key go: the lens has no keys on desktop.
4. **Four zoom levels**, chosen by tapping one of **four dots at the bottom
   centre of the lens**, as the phone lens does in the game.
5. Rim resize stays as it is.
6. The default place moves **about one row down**.

### Phone and tablet

7. The player box is redone **like the desktop's**: as far right as
   possible (leaving room to the left), **floating over the log**, and it
   **hides itself** as on desktop.
8. **No fight card at the top** in a shared run on phone and tablet.
9. iPad: turning from portrait to landscape during playback in fullscreen
   puts **half the menu below the window**. (Not seen on an Android phone.)
10. The lens is about **50 % larger** by default on a phone.

### The poster

11. A shared run (a share link or a log opened from the community) opens
    with a **presentation layer over the log window**:
    - a large play button in the middle;
    - a glass effect, so it looks a little like a TV screen;
    - the log's title in large title text at the top centre;
    - the MUME Cockpit logo at the bottom right;
    - and something more if it looks good.
    Clicking it starts the run; the layer goes and the log shows as usual.

### Back from a published log

12. On a published log opened from the Community, **Back** first shows the
    start menu and then the Community. It must go **straight to the
    Community**. (Added 2026-11-18, same session.)

### The tileset

13. **Desert** is the tileset of runs published in the Community or shared
    by a link. (Added 2026-11-18, same session.)

## Decisions taken in the session (technical, no owner pick needed)

- Without pan the desktop map always follows the player; the follow key
  and the double click go. The wheel over the lens steps the four levels
  as well as the dots (record in the ADR addendum).
- The poster is shown wherever `openReplay` plays a shared run: the
  watch page's frame (share link and community) and the exported HTML
  file, on every device. It holds the run paused at the start.
- Work is split in three parallel branches (A desktop and the bug, B
  phone and tablet, C the poster), merged on `main` by the main session.

## Plan and tasks

- [x] A. Desktop: the bug (1), points 2–6. ADR 0160 addendum.
      (Branch `stage-73a-desk-lens`.) The bug: Firefox's GPU WebRender
      promotes the busy WebGL canvas to a compositor surface that drops the
      circle (Mozilla bug 2068303); the canvas is now masked to the circle,
      and the lens shifts the map only for the box the cockpit laid out
      (`Cockpit.deskLensLaid`). No keys on the lens; a drag anywhere moves
      it; four dots (8, 14, 24, 44 rooms across; the wheel steps them, kept
      across a seek); the map always follows (the hand lens went from
      map.ts); Map, Group and Timers in the Panes popup (Map on at the
      start); the default place a row lower. Tests: `watch-lens.spec.ts`
      (two tests, the second the bug's), `watch-map-zoom.spec.ts` (the
      wheel's levels), the watch page, replay and viewer specs back on the
      Panes popup; unit `desk-lens.test.ts`, `shared-panes.test.ts`.
      Screenshots `docs/stages/img/73-a-*.png`. Open: the phone lens has
      the same clip-path alone (a mask there is part B's or a follow-up).
- [x] B. Phone and tablet: points 7–10. (Branch `stage-73b-phone`; ADR 0160
      addendum "stage 73 part B".) The box floats at the bottom right and
      hides as on desktop (`PlayerViewOptions.touchFloat`, touch-sized keys;
      upright compact: no To the start, the speed one key), no command row
      kept; the fight card off; the lens ×1.5 on a phone (not a tablet,
      `lensReplayScaledPx`); the box clamped into the visual viewport on
      every resize/turn/fullscreen change (point 9). History's run log
      player keeps its docked bar. Tests: `tests/unit/shared-phone-box.test.ts`,
      `tests/e2e/phone-watch-box.spec.ts`; screenshots
      `docs/stages/img/73-b-*.png`.
- [ ] C. The poster: point 11.
- [ ] D2. The watch page's Back goes straight to the Community (point 12).
- [ ] E2. Desert is the tileset of shared and published runs (point 13).
- [ ] D. Merge, full e2e alone, review.
- [ ] E. Staging deploy, `test:prod` on staging.
- [ ] F. The owner's test on staging; release on his word.

## Test guide

(Written when the build is on staging.)

## Owner feedback
