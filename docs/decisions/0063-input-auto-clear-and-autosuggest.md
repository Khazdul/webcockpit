# 0063 — Input line options: auto-clear and autosuggest

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0010 (settings), ADR 0015 (macro keys)

## Context

The owner asked for two on/off rows directly in the Options hub, as in
Cockpit's in-game Options frame: one that empties the input line after
Enter, and Cockpit's fish-style inline history suggestion. Both change
how the command line behaves, not what the screen shows.

## Decision

### Settings

`Settings.input = { autoClear, autosuggest }`, both `false` by default;
`migrateInput` keeps only booleans. It is not part of `ViewSnapshot`: a
log player replays the recorder's screen, not their command line.
`App` pushes both values into `InputPane` (`setAutoClear`,
`setAutosuggest`) at start and on every settings change, so a toggle
applies live.

### Options hub

```
Panes / Mapper / Appearance / Spotlights / Scripts
(blank)
[ ] Auto-clear input
[ ] Input autosuggest
(blank)
Back
```

Glyph rows in the kit's left-aligned glyph block. Enter, Space, click and
←/→ all flip the row (the kit idiom for `[X]` rows, as on Group and
Mapper), and every flip writes the store at once.

### Auto-clear

Off: unchanged (tt++ style, the sent text stays, fully selected). On:
after a non-empty Enter the line is empty. History is recorded exactly as
before, so Up recalls the command just sent. Password mode already
clears. The Enter path only reads one boolean (ADR 0044 rule 3).

### Autosuggest (behaviour after Cockpit, new code)

- The suggestion is the rest of the newest history entry that starts
  with the line and is longer than it (an equal entry is skipped, so a
  bare `cast ` sent earlier does not hide older `cast …` entries).
- Nothing until the line holds a space: `kill` suggests nothing, `kill `
  suggests the newest `kill …`, and never `killer`.
- Shown only with the caret at the end and nothing selected, never in
  password mode, and **not while browsing history** (Up/Down). A
  recalled entry is fully selected anyway; after an arrow collapses the
  selection the line is still a history entry, and a second, different
  entry greyed after it would read as part of it. The first edit ends
  browsing and the suggestion returns. Up/Down are unchanged: Cockpit's
  prefix-filtered browse is not ported.
- Right at the end, or End with the caret already at the end, takes the
  whole suggestion into the line. Not sent: Enter sends the line only.
- Tab takes the next word: the leading whitespace run plus the
  following non-whitespace run (`kill ` → `kill orc` → `kill orc the`).
  Tab had no input-line meaning before (the browser moved the focus;
  focus comes back with the next key). It is only taken while a
  suggestion shows, and, as in Cockpit, a Tab right after Tab filled
  the line is swallowed so hammering Tab does not move the focus.
  Otherwise Tab keeps its old behaviour. Shift+Tab is never taken.
- A bound macro wins over Right, End and Tab as over every key: the
  macro lookup runs before the pane's own keys (ADR 0015). The
  input-line key table (`INPUT_LINE_KEYS`, shown by the macro editor)
  notes the new meanings.

### Drawing

`.wc-input-ghost` spans the field (clipped at its edge, like the
password mask) and is placed with `text-indent` = line length in
columns × cell width − `scrollLeft`, in the same animation frame as the
custom caret; key handlers never draw it. The block caret shows the
suggestion's first character under it. The colour is `--ansi-8`, which
every background theme keeps as a muted grey at 4.5:1 or better (ADR
0061). With the option off and no ghost on screen, the caret frame does
no extra work; the history scan (at most 1000 entries) runs only when
the option is on.

## Consequences

- `Settings` gains a section; older stored settings load with both off.
- With autosuggest on, Tab and the end-of-line Right/End act on the
  suggestion when one shows; binding them as macros still overrides.
