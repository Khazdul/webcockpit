# 0066 — Options → Text input

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0063 (the input toggles leave the Options hub)

## Context

The owner asked for the input line's settings in one place: the two
toggles that ADR 0063 put directly in the Options hub, and the cursor
style and blink rows that sat in Appearance. Appearance is about how the
output looks; the caret belongs with the line it marks.

## Decision

A new Options hub entry, right after Appearance:

```
Panes / Mapper / Appearance / Text input / Spotlights / Scripts
(blank)
Back
```

`TextInputOptionsFrame` (`src/chrome/frames/options-input.tsx`):

```
[ ] Auto-clear input
[ ] Input autosuggest
<< Cursor style: beam >>
<< Cursor blink: On >>
(blank)
Back
```

- The toggles keep ADR 0063's idiom (glyph block; Enter, Space, click
  and ←/→ flip them). The cursor rows keep Appearance's cyclers (←/→,
  and Enter for blink). Every change writes the store at once.
- Settings keys are unchanged: `input.autoClear`, `input.autosuggest`,
  `appearance.cursorStyle`, `appearance.cursorBlink`. The cursor keys
  stay in `appearance`, so "Reset appearance" still resets them (it is
  the only reset that touches them) and no migration is needed.
- Appearance loses the two cursor rows. The preview box never drew a
  caret, so it is unaffected; the two freed rows leave room for one more
  preview line (`Elrond narrates '…'` in palette colour 3), and the
  frame still fits at 800 px with the box 52 wide.

## Consequences

- Keyboard paths into Appearance are two rows shorter; Scripts is one
  row further down the hub.
