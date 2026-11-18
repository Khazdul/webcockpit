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
- [x] C. The poster: point 11 (branch `stage-73c-poster`, ADR 0162).
  `src/replay/poster.ts` + `poster.css`, mounted by `openReplay(…,
  { poster: true })` from the frame and the exported file: a glass tube
  face (vignette, scanlines, glare; CSS only), the title in Cinzel at the
  top, the character, date and played length under it, an amber play ring
  in the middle, the wordmark (drawn from the start page's glyphs, no
  style attributes: the frame's CSP) at the bottom right. The run waits
  paused at its start; a click or tap anywhere, Enter or Space plays it;
  other keys are swallowed while it is up. E2e specs that drive a shared
  run click it away first (`startRun`, tests/e2e/watch-page.ts).
  Screenshots `img/73-c-desktop.png`, `img/73-c-phone-portrait.png`,
  `img/73-c-phone-landscape.png`. Runtime: `replay/replay.js` 1,666,034 →
  1,679,518 B (+13.5 KB, +5.0 KB gzip); `r/frame.html` 1,668.7 → 1,682.0 kB.
  Tests: unit 5567 passed; e2e of the touched and the replay, watch,
  sandbox, share, community, export and phone specs (Chromium, Firefox,
  phone) 192 passed, 1 skipped, 0 failed. Note: the poster's date is the
  recording's (as the replay header), the band's is the publication's.
- [x] D2. The watch page's Back goes straight to the Community (owner, 2026-11-18; point 12).
  The start page loaded with `?community` / `?account…` holds its menu and
  scenery hidden over the sky, morph and hold off, until the page is pushed
  (3 s safety timeout); the flags and the chunk are asked at once. Branch
  `stage-73d-watch-back`. ADR 0155 addendum 2026-11-18.
- [x] E2. Desert is the tileset of shared and published runs (owner,
  2026-11-18; point 13). The watch page gives every payload Desert's
  tiles before the frame gets it, so runs already published show it too;
  links keep storing the small default tiles (embedding Desert measured
  +2.9 MB per link: dropped). ADR 0154 addendum 2026-11-18.
- [ ] D. Merge, full e2e alone, review.
      Review fixes (2026-11-18): (1) the desk lens keeps its box in the
      cockpit while Map is off (the cockpit places no map then), so Map on
      lays the map straight into the lens, never docked or floating for a
      layout (`watch-lens.spec.ts` watches the pane); (2) the watch page
      posts the Desert retile only when its JSON is within
      `PAYLOAD_JSON_MAX` and passes `validatePayload`, else the original
      bytes (`retiledWire`, unit in `shared-tiles.test.ts`); (3) the poster
      swallows the auto-repeats of the Space/Enter that started the run
      until its keyup (unit in `replay-poster.test.ts`); (4) `openReplay`
      takes the poster away when the player fails to open, and rethrows.
- [ ] E. Staging deploy, `test:prod` on staging.
- [ ] F. The owner's test on staging; release on his word.

## Test guide

(Written when the build is on staging.)

## Owner feedback
