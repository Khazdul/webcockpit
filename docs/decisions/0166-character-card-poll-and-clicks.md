# 0166 — The Character card: the hidden info poll, clicks as commands

Date: 2026-11-22. Status: accepted, not built (stage 77, decided after
part A; parts B–G build it and add addenda). Related: ADR 0052 (exact or
band), ADR 0122 (the Lykta panes), ADR 0006 and 0016 (the run log).

## Context

The Character pane becomes a card (stage 77). Status comes from GMCP.
Stats and Lore need values that only `info <format>` gives, so the client
sends it and hides the answer. Some fields send commands when clicked.
Part A measured MUME live (`docs/stages/77-character-pane.md`, "Live
results"):

- `info` keeps its place in the command queue but takes no 250 ms slot.
  After a cast it is answered when the cast is over.
- The answer wraps at the window's width, at spaces as far as seen.
- One prompt closes everything a pulse printed.
- GMCP sends a pulse's last state, and only when it changed.

## Decision

The poll:

1. The sentinels are ASCII with a nonce per poll, so a connection without
   UTF-8 works and nobody can fake one in a say or tell.
2. The fields are separated by ` | `. The reader joins the lines with a
   space, removes SGR, splits at `|` and trims.
3. One poll is outstanding at a time. Nothing is hidden before its start
   sentinel, however late that comes. Hiding ends at the end sentinel or
   2 s after the start sentinel.
4. The answer's own blank lines go with it. The prompt goes only when the
   answer was all that pulse showed. The partial line is covered too.
5. The poll's command and answer are kept out of the run log by a mark of
   their own. A display gag and `echo: false` do not do it, since the
   recorder takes `cmd.sent` and `text.line` before the display pipeline.
6. No poll without a key or click from the player in the last 5 minutes
   (the owner), so that an open tab does not defeat MUME's idle timeout.

Clicks:

7. A click sends with `sendCommand`, so no alias can change it (Khazdul
   has `sleep`, `normal` and `quick`). It is echoed and logged like a
   typed command (the owner).
8. The value changes only from GMCP. The pending mark ends at the change
   or after 3 s. A later change still shows.

Race:

9. Race and subrace are matched on words and stems, never whole strings,
   as only one real pair is confirmed. An unknown race gets the neutral
   portrait and no age track or modifiers, never a guessed factor.

## Consequences

- The poll does not delay the player's commands.
- A shared or replayed run has no trace of the poll, so a replay cannot
  fill Stats and Lore.
- A prompt shared with other output stays.
- The wrap below one word's width is unverified until part C's test on a
  phone.

## Addendum (part B, 2026-11-22): the model

A correction first: "ADR 0052 (exact or band)" in the heading above means
Cockpit's ADR 0052 (`src/gmcp/bands.ts`), not this project's ADR 0052
(pixel scrolling in panes).

Exact or band:

10. Each bar keeps whether its last update was a number. A numeric `hp`
    is exact, also with `hp-string` beside it. Only `hp-string` is band.
    A message with neither leaves it. A null number is not exact. The
    merged values cannot tell this, so `CharModel` keeps it as state of
    its own and counts a flip as a change.
11. Excluded state folding (ADR 0019) keeps it: after the merged
    `Char.Vitals` the block has one word-only record with the bars that
    ended as band though a number is in the merged one. The fold's check
    compares the state. Replays shared before this stay as folded: a bar
    that ended a cut as band shows as exact there until its next update.
12. Spell effort and `carrying` words that are not in the lists are kept
    as sent, `carrying` without a step.

Race and age:

13. A factor needs a known kind. An Elf, and also a Man, of unknown or no
    kind has none. A bare "Black" draws the Númenórean passenger but
    gives no factor.
14. The brackets are help's printed years, not a product. The age is
    fractional (12 months of 30 days) for the modifiers and the track, as
    help calls the change linear and gradual. The brackets are whole
    years, so the age shown is the same either way. Below the 1st bracket
    and from the 7th on nothing changes. Values are rounded only where
    shown.
15. The birthday counts a started month whole ("in 5 months" from 7
    months 7 days), and is "today" at 0 and 0.

The answer's reader (`src/gmcp/info-answer.ts`):

16. The field list lives there only, and part C builds the format from
    it. The text is split at `|` alone, so ` | ` and a bare `|` both read.
17. A wrong field count is no answer. An unreadable or empty field is
    null and the others are kept. `%G` is one field: all seven values or
    none.
18. Tolerated beyond the one sample: singular forms, a part left out of
    the height, weight or money, "and" and commas in number words, a
    break after a hyphen, thousands separators (commas), a sign on a
    number. Their wording is inferred. Other shapes are unreadable and
    never guessed, war fame without its number and a purse that names no
    coin included.
