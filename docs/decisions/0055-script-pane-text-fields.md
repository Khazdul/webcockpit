# 0055 — Script pane text fields

- Status: Accepted
- Date: 2026-10-02
- Builds on spec §2.10 ("Panes"), ADR 0053 (script panes), ADR 0015 and
  ADR 0026 (keys and macros), ADR 0051 (host)

## Context

Stage 12's key manager asks for the key's name in its pick window
(owner, 2026-10-02): the player types the name in the window instead of
on the input line. Script panes had text, gauges and links, but no way
to type into them. The game's input line owns the keyboard: macros run
from its document-level keydown listener, and the cockpit and the input
line take the focus back after clicks.

## Decision

### The Lua API

- `pane:setInput(row, col, len, opts)` puts an editable one-line field
  on `len` cells of `row` from `col` (1-based) and returns a `PaneField`
  object (userdata, like `Pane`). `opts` (optional): `value`,
  `placeholder`, `maxLength` (at most 500), and the functions
  `onSubmit(text)` (Enter), `onCancel()` (Esc), `onChange(text)` (every
  edit) and `onKey(key)`.
- `onKey` gets the canonical key name (as `tempKey` names keys) of
  `ArrowUp`, `ArrowDown`, `PageUp`, `PageDown`, `Tab` and `Shift+Tab`.
  These keys are not handled by the field, so a script can move a
  selection while the player types.
- Field methods: `:focus()` (cursor at the end), `:select()` (focus with
  all text selected, so typing replaces it), `:value()` (nil once the
  field is gone), `:setValue(text)` (no `onChange`), `:remove()`.
- Like links, a field belongs to its row: `setLine`, `gauge` and `clear`
  on the row remove it, as do `pane:close()` and the script stopping. A
  removed field's methods do nothing. A new field drops the fields it
  overlaps.
- Functions in an options table: `LuaArgs.table` turns functions into
  `undefined`, so the runtime gains `LuaArgs.fieldFunction(i, key)`
  (one `lua_rawget` of a string key, a new reference or null). No other
  runtime change.

### Content model

- `PaneContent.fields`: `{row, col, len, id, value, placeholder,
  maxLength}`; `addField`, `field`, `setFieldValue`, `removeField`;
  `onDropField` reports every dropped field (the host releases its
  functions). The value is one line (newlines become spaces, control
  characters go) and cut to `maxLength`.
- **Runs.** `snapshot()` bakes each field's value into its line as
  underlined text, padded to the field's width. The record format, the
  log player and the HTML replay are unchanged: they draw the field as
  plain text. A value change bumps the content version and the host
  calls `view.changed()`, so the recorder coalesces value changes like
  any pane change (≤ one record per 16 ms).

### Drawing

- The live pane puts a native `<input>` over the field's cells. It sits
  in a layer of its own inside the pane element, beside the content
  (the rows are rebuilt with `replaceChildren` whenever the line count
  changes, which would blur a focused input inside them).
- TUI look: no border, outline, padding or radius; `font: inherit` and
  `letter-spacing: inherit`, so the text keeps the cell advance (as the
  input line, ADR 0050); transparent background over a band drawn in the
  cells in the pane's `track` shade (the gauges' empty part), so it
  follows the tint and light/dark like gauges. Text in the pane's ink
  colour, placeholder in the `label` shade, selection in `glow` with
  `paneBg` text (as a hovered link); the native caret in the text colour.
  A native input keeps IME, selection, clipboard and undo for free; the
  input line's block caret was not reused (it is the input line's own
  element and blink timer).
- A field whose row is scrolled out (more lines than rows) has no input.
  A focus asked for before the field is drawn (a new temporary pane is
  0 × 0 until the next layout) is applied once it is.

### Focus and keys

- Clicking the field or `:focus()`/`:select()` takes the focus from the
  input line.
- **Keys never leak.** The input line's capture listener already ignores
  keys aimed at another text field (`isOtherInteractive`), so macros,
  script keys (`tempKey`) and the input line's own keys do not run while
  a field has the focus. The field's own keydown handler consumes every
  Ctrl/Alt/Meta key except editing keys (Ctrl/Meta + A C V X Z Y,
  Shift+Z, word moves and deletes, Home/End, Alt+Backspace), so the
  browser's Ctrl+S, Ctrl+P, Alt+Left … do not fire either. AltGr
  characters (Ctrl+Alt on Windows) type as usual. F-keys keep their
  browser meaning.
- **Focus back.** Enter and Esc give the focus to the input line first,
  then report submit / cancel (the handler can call `:focus()` again,
  e.g. after an invalid entry). A click anywhere else in the cockpit
  already gives it back (the cockpit's mouseup); the cockpit now skips
  that for a click on a field (`.wc-spane-field`). A field removed or
  closed while it has the focus gives it back (`Cockpit.focusInput()`,
  passed to the pane as `onFocusInput`).
- The input line's window-focus handler no longer takes the focus from
  another text field that had it, so switching windows and back keeps
  the field focused.

## Consequences

- One more object class in the API; `@api 1` scripts are unaffected.
- A field is a DOM element per visible field (no per-frame cost while
  idle; positions are refreshed on render).
- Touch devices get the native on-screen keyboard for a field.
- Open: the caret is the browser's thin caret, not the input line's
  block cursor; a later round can draw a cell caret if the owner wants
  the same cursor style.

## Feedback round 2 (2026-10-02)

The owner saw the old text through a rename field (`$deerpopop` over
`$deer`) and a field that stayed after a click elsewhere, half in place.

- **Opaque.** The cells under a field are blanked when the row is drawn
  (`fieldBands` writes spaces on the `track` band), and the input's own
  background is the band colour, so nothing shows through in any tint.
- **Readable.** The text and the caret are in the pane's `vtext` shade
  (as a gauge label on its track), not the dimmer ink; the placeholder
  is `label`. vtext on track is 7.2–7.7:1 for every pane colour on a dark and a light terminal (unit test).
- **`onBlur(text)`.** A new option: called when the field loses the
  keyboard other than by Enter or Esc (a click elsewhere), with its
  value. Not called for Enter/Esc (they move the focus themselves and
  report submit/cancel), for a field that is being removed, or when the
  whole window loses the focus (the field keeps it for when the window
  comes back). The field itself stays until the script removes it, so a
  blur never leaves a half state: it is either still a working field or
  gone.

## Addendum — `keys` for a field's onKey (2026-10-08)

The owner asked that Ctrl+F toggle the Map search pane and put the
cursor in its query field. Showing it works with `tempKey`; closing it
from the field did not, since keys never leak out of a field (above).

`pane:setInput{keys = {...}}` lists more key names (as `tempKey` names
them; an unknown name is an error) that the field reports to `onKey`
like the arrows, instead of consuming them. The rule that macros and
script keys do not run in a field stays: the script opts in per field,
for its own keys. Enter and Esc stay the field's (handled first). The
bundled `mapsearch` binds Ctrl+F with `tempKey` and lists it in its
query field's `keys`.
