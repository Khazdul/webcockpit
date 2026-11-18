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

- [ ] A. Desktop: the bug (1), points 2–6. ADR 0160 addendum.
- [ ] B. Phone and tablet: points 7–10.
- [ ] C. The poster: point 11.
- [ ] D2. The watch page's Back goes straight to the Community (point 12).
- [x] E2. Desert is the tileset of shared and published runs (owner,
  2026-11-18; point 13). The watch page retiles any payload not in Desert
  before the frame gets it (runs already published too); new links embed
  Desert (+2.9 MB on the demo), the default tiles when Desert would pass
  the 5 MiB limit. ADR 0154 addendum 2026-11-18.
- [ ] D. Merge, full e2e alone, review.
- [ ] E. Staging deploy, `test:prod` on staging.
- [ ] F. The owner's test on staging; release on his word.

## Test guide

(Written when the build is on staging.)

## Owner feedback
