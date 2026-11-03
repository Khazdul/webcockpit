# Stage 35 — Split scrollback

Status: **In progress** (2026-11-03).

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

- [ ] `OutputPane`: split option, divider, tail element, open/close with
      the ADR 0045 anchor, PgUp opens before stepping
- [ ] Tail: incremental clones, partial, re-clone of mutated rows
      (echo on prompt, `insertAfter`), `aria-hidden`, copy-on-select
- [ ] Divider look (TUI rule, label, hover, drag cursor) and drag with
      snapping and clamps; `settings.output.splitShare` + migration
- [ ] NAWS rows from `.wc-output`
- [ ] No snap on send while split (desktop); touch unchanged
- [ ] Off in the log player and HTML replay
- [ ] Unit tests; e2e in Chromium and Firefox (open/close, anchoring
      through trims and width changes, NAWS unchanged, drag, send keeps
      the split, touch emulation unchanged); ADR 0045 tests adapted
- [ ] Screenshots on Black and Paper, reviewed
- [ ] Inv §1.1 / spec §2.2 notes

## Test guide

(written when built)

## Owner feedback

(after testing)
