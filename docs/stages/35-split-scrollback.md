# Stage 35 — Split scrollback

Status: **Owner testing** (2026-11-03). Branch `stage-35-split-scrollback`.

## Goal

Scrolled back on a computer, the bottom of the game window keeps showing
the live game; scrolling back to the bottom removes the split; the
divider can be dragged. ADR 0117, study `notes/research/split-scrollback.md`.

## Owner brief (2026-11-03)

- Scrolled back, you cannot follow the game. Want the split screen other
  clients have, gone at the bottom, with a draggable border. Only if
  nothing else gets worse.
- Answers: commands can be sent and play goes on as usual while scrolled
  (no snap back). Always on, not a setting. Maybe not on phone/tablet
  (touch); priority is the computer, touch may get a simpler variant or
  none. Default share 30 %.
- The grey row should look more clearly like a screen divider, and show
  a drag up/down icon on hover.

## Tasks

- [x] `OutputPane`: split option, divider, tail element, open/close with
      the ADR 0045 anchor, PgUp opens before stepping
- [x] Tail: incremental clones, partial, re-clone of mutated rows
      (echo on prompt, `insertAfter`), `aria-hidden`, copy-on-select
- [x] Divider look (TUI rule, label, hover, drag cursor) and drag with
      snapping and clamps; `settings.output.splitShare` + migration
- [x] NAWS rows from `.wc-output`
- [x] No snap on send while split (desktop); touch unchanged
- [x] Off in the log player and HTML replay
- [x] Unit tests; e2e in Chromium and Firefox (open/close, anchoring
      through trims and width changes, NAWS unchanged, drag, send keeps
      the split, touch emulation unchanged); ADR 0045 tests adapted
- [x] Screenshots on Black and Paper, reviewed
- [x] Inv §1.1 / spec §2.2 notes

## Build notes

- A mouse selection stays in the half it starts in (added in review):
  dragging from the upper half into the tail ends at the last row above
  the divider, and from the tail upward at the tail's first row. Without
  it both browsers copied the newest rows twice, or the whole scrollback
  below the view.
- Touch devices, the log player and the HTML replay keep the old tail bar.

## Test guide

Dev server (`npm run dev`, http://localhost:5173/) on the branch, on the
computer; connect to MUME and play a little so text keeps coming.

1. **Open:** scroll up with the wheel (or PgUp). The text you are reading
   stays put, a divider appears, and below it the game goes on live.
2. **Play while split:** type commands and press Enter. The commands go
   out and the answers show below the divider; the scrollback stays.
3. **Close:** scroll the upper half all the way down, or press PgDn until
   the end, or Esc. The divider goes and the window is whole again, with
   no jump.
4. **Drag:** hover the divider (up/down arrow cursor, brighter line) and
   drag it up and down. It moves by whole rows; the input keeps the focus.
   Scroll up again later, and after a reload: the size is kept.
5. **Copy:** select text in the upper half and in the live part. The
   selection is copied (paste somewhere to check); a drag across the
   divider copies only the half it started in.
6. **Themes:** look at the divider on a dark background and on Paper.

Feedback wanted: does the divider read clearly as a divider (colour,
line, text)? Is the hover strong enough, especially on Paper? Is 30 % a
good default? Anything that feels different from before when you are not
scrolled?

## Owner feedback

(after testing)
