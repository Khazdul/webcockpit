# 0038 — Typed settings persist in the profile

- Status: Accepted
- Date: 2026-09-30
- Amends: ADR 0015 ("Live profile and write-back": "Everything else
  created at runtime … lives for the session")

## Context

Owner requirement: a setting made in the game window must be saved
immediately, and there must be no difference between the settings seen
or made in the game window and the ones in ESC → Profile. Until now only
runtime changes to variables with a top-level `#variable` entry were
written back (debounced 1 s); every typed rule vanished at the next
profile load.

## Decision

### What persists

A definition or `#un…` command **typed on the input line** that the
engine accepted is written to the stored text of the loaded profile at
once.

| Typed | Effect on the profile text |
|---|---|
| `#action`, `#alias`, `#highlight`, `#substitute` `{pattern} {body} [{priority}]` | Entry added, or the entry with the same pattern rewritten in place. A redefinition without a priority drops the old one. |
| `#macro {key} {body}` | Same; keys compare normalised (`f5` = `F5`). The file's spelling of the key is kept on a redefinition. |
| `#gag {pattern}`, `#event {name} {body}` | Command line added or rewritten in place. Event names compare upper-cased. |
| `#ticker {name} {body} {seconds}` | Same, with the seconds as the number the engine resolved. |
| `#variable {name} {value}`, and a typed `#math` / `#format` | Existing entry: only its value is spliced. None: a `#variable` entry is added. The value is the resulting one, after expansion. |
| `#unaction`, `#unalias`, `#unhighlight`, `#unsubstitute`, `#ungag`, `#unmacro`, `#unevent`, `#unticker`, `#unvariable` | Every top-level definition of the kind whose key the engine removed is removed (a `*` form removes each key it removed; duplicates of a key all go). |
| `#class {x} {kill}` | As `#un…` for every rule, variable and ticker the engine removed. |
| `#class {x} {open}` / `{close}` | Nothing. |
| Listing forms (`#alias`, `#alias {k*}`, `#variable x`), rejected definitions (unbindable macro key, unknown colour, bad pattern, ticker without a time), `#un…` that removed nothing, `#delay`, `#undelay` | Nothing. |

"Typed" means a command of the typed line itself: each command of a
`;`-separated line, and the commands inside a typed `#N {…}` or
`#if {…} {…}`. A `#N` repeat writes the same entry again, which changes
nothing.

### What does not persist

Anything a script defines at run time — the body of an alias, action,
macro, ticker, delay or event, even when that alias was itself typed —
stays in the session, so temporary rules do not pile up in the profile.
Script-set variables keep the ADR 0015 rule: only an existing top-level
`#variable` entry is updated (debounced 1 s).

Consequences: a typed `#unalias x` of a session-only rule changes
nothing in the text. A typed definition of a key that also exists as a
session-only rule is simply added.

### Exact text

- The written form is always `#<word> {arg} {arg}…`, whatever braces
  were typed. The five lite kinds and variables use `addEntry` /
  `editEntry` / `setVariable` / `removeEntry`. `#gag`, `#ticker` and
  `#event`, and definitions the file holds in an untyped form
  (`#var x 1`), use two new document edits: `addCommand` (placement and
  command word as `addEntry`: after the last command of the same rule,
  word copied from the file) and `rewriteCommand` (keeps id, word,
  indent and line break).
- Keys are compared as the rule store compares them (`storeKey`). A
  redefinition rewrites the last definition of the key (the one that
  wins on load) where it stands.
- Rule patterns and bodies are written raw as typed: the engine stores
  them unexpanded. A variable is written with its resulting name and
  value, and because a `#variable` line is expanded again when the
  profile loads, `$name` / `&name` in them are escaped (`escapeVars`:
  `$x` → `$$x`). The same escape now applies to script-set values.
- Refused, with one `[SYSTEM]` line and no change to the text: an
  argument that is not a safe brace argument (`isSafeArgument`), a key
  defined on a line that holds several commands (`#alias {a} {1};#alias
  {b} {2}`), a stored text with unbalanced braces, and any result that
  would unbalance the text. The engine keeps the rule for the session.
- Everything untouched keeps its bytes (comments, order, formatting,
  line endings).

### `#class`

`#class open` / `close` typed on the input line are session-only and are
not written. An entry typed while a class is open is written as an
ordinary top-level entry; its class membership is not recorded. A typed
`#class kill` removes from the text exactly the keys the engine removed.
This is the simplest rule that keeps the rule set equal; writing class
blocks would need class-aware placement in the document model, which
the editor does not have either.

### Immediately, in order

- Engine hook: `EngineOptions.onTyped(change)` with `TypedChange` =
  `{ op: 'define', kind, key, args }` or `{ op: 'undefine', kind, keys }`.
  It fires only for the user store, with a typed (`direct`) context, not
  while loading. A typed variable set fires `onTyped` instead of
  `onVariable`. `src/script/` stays free of DOM and storage; the pure
  document work is `src/script/persist.ts` (`applyTypedChange`).
- `ProfileWriteBack` (`src/app/writeback.ts`, was `VariableWriteBack`):
  each typed change is its own job on one promise chain, started at
  once. A job reads the latest stored text, applies the change and saves
  when the text changed, so jobs cannot lose each other's updates and an
  editor save in between is kept. A typed variable drops a script value
  queued for the same name. `flush()` resolves when every job so far is
  done.
- Guards: nothing is written without a target (no profile loaded, or
  the last load failed), and nothing in the offline modes (`?replay`,
  a running replay) — this now also covers script-set variables. The
  player gets one line: `Not saved to the profile: …`.

### Both directions agree

- ESC → Profile flushes the write-back before it reads the stored text
  (`beforeLoad`, as before). Exit session awaits the flush before the
  start page shows, so Profile → EDIT there reads the final text.
- A profile load (session start) waits for the write-back, reads the
  text, and loads it with no await in between; it reads again when
  something was typed during the read. The write-back target stays set
  during a reload, so a setting typed while connecting is both saved and
  loaded.
- Apply from the editor reloads the engine from the editor's text and
  drops script values queued by the replaced rules.

### Feedback

The engine prints nothing when a definition is accepted, and saving
adds nothing. Only a refused or failed save prints a line.

## Consequences

Where the running rule set and the stored text can still differ:

- Session rules and undeclared variables made by scripts (by design).
- A script that redefines or removes a rule that is in the text: the
  text keeps the profile's version until the player types the change.
- A refused write (see above), a storage failure, the offline modes, no
  profile loaded: the rule runs for the session; a line says so.
- Order among equal-priority rules: the engine counts a redefinition as
  the newest rule, the text keeps the entry where it stood. The next
  load follows the text.
- Class membership of entries typed while a class is open, and of new
  entries placed after an entry that sits inside a class block of the
  file (the `addEntry` placement rule, as in the editor).
- Apply whose save then fails: the engine runs the editor's text; the
  editor reports `Profile updated, but saving failed`.
- `pagehide` cannot wait for IndexedDB; a setting typed in the last
  milliseconds before the tab closes may be lost (the write starts at
  once, so the window is one store round trip).
