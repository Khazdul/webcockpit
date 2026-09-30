# 0040 — `_send` removed

- Status: Accepted
- Date: 2026-09-30

## Context

ADR 0036 deprecated `_send` (a helper from the terminal client that echoed
a command and sent it) but kept it in the engine for stored profiles. The
owner (2026-09-30) wants it gone from the engine.

## Decision

- The engine no longer knows `_send`. It is an ordinary word: sent to the
  game as written, or an alias if the profile defines one. The editor's
  "`_send` is built in" warning is gone.
- So that old profiles keep working, `stripSend` (`src/profiles/migrate.ts`)
  drops the word wherever it starts a command (after a line start, `{` or
  `;`). `ProfileStore.init()` applies it to every stored profile (it saves
  only profiles that change), and `importFile` applies it to imported text.
- Nothing else in the text changes.

## Consequences

- One behaviour difference: `_send x` skipped alias lookup; a plain `x` is
  matched against aliases. A profile that used `_send` to get past its own
  alias of the same first word now runs that alias (an alias still never
  re-enters itself, ADR 0015).
- A tab that was opened before this release keeps its old engine until it
  is reloaded; a newer tab may clean the stored profile meanwhile, which
  the old engine runs just as well.

Amends 0036 ("`_send` deprecated but still honoured") and 0015 (`_send`
built-in, echo note).
