# 0119 — Profile editor LITE keys: n on the kind row, no find

- Status: Accepted
- Date: 2026-11-04
- Supersedes: the "LITE" part of ADR 0070 (Ctrl+F / Ctrl+H flip to
  EDITOR with the search panel open)
- Related: stage 37 (`docs/stages/37-profile-lite-keys.md`). ADR 0105
  (LITE applies by itself), Inv §5.8 (focus zones).

## Context

The owner's feedback on the profile editor's LITE view (2026-11-04), in
game and from the start menu's Profile:

- To add an entry you had to go down from the kind row (ACTIONS,
  HIGHLIGHTS, MACROS …) into the list before `n` worked. The kind row is
  where you land, so `n` should work there.
- Ctrl+F and Ctrl+H in LITE flipped to EDITOR with the search panel open
  (ADR 0070). LITE is the simple view; a key that throws you into the
  text editor is a surprise there. The owner wants them gone from LITE.

## Decision

- **`n` on the kind row** (zone `kind`): plain `n` (no Ctrl, Alt or Meta)
  creates a new entry of the current kind, exactly as `n` in the list
  (`newEntry()`): the entry is added, the Pattern field gets the focus; a
  macro starts key capture; on a phone a macro shows the "Key capture:
  desktop only." flash instead. `n` works on the kind row and in the list
  only, not on the LITE / EDITOR / HELP toggle or in the detail panel
  (where it is typed).
- **Del stays list-only.** On the kind row it does nothing.
- **No find in LITE.** Ctrl+F and Ctrl+H (and Cmd on a Mac) are swallowed
  in LITE, the HELP view excepted: the key handler consumes them, so the
  browser's own find bar or history does not open, and nothing else
  happens. EDITOR keeps Ctrl+F (find) and Ctrl+H (replace) through
  `search.ts`; HELP keeps Ctrl+F in the manual (ADR 0070, unchanged).
  The pending-search plumbing (open the panel once the new buffer is
  mounted, the cursor at the selected entry) is removed with it.
- **Footer hints** in LITE, longest first, the first that fits the width:
  - kind row: `n New · Tab Cycle · ESC Back`, then `n New · ESC Back`,
    then `ESC Back`
  - list: `n New · Del Delete · Tab Cycle · ESC Back`, then
    `n New · Del Delete · ESC Back`, then the kind row's shorter ones
  - elsewhere (toggle, detail panel): `Tab Cycle · ESC Back`, then
    `ESC Back`

  Only the `ESC …` token is tappable, as before (ADR 0075 §2); `n New`
  has its tap path in the list's `+ New entry` row.

## Consequences

- Find and replace across the profile text is in EDITOR only, one click
  on the toggle away. ADR 0070's reasoning that LITE needs no find of its
  own (a short list, filtered by kind) still holds.
- Ctrl+F in LITE is dead on purpose: it does not open the browser's find
  bar either, which would search the page rather than the profile.
