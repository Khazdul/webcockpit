# 0039 — `#message` and the confirmations of typed commands

- Status: Accepted
- Date: 2026-09-30
- Amends: ADR 0038 ("Feedback": the engine prints nothing when a
  definition is accepted), ADR 0015 (P2: the listing forms' output)

## Context

Owner requirement: a command typed on the input line is confirmed
(`#alias zz {smile}` → zz is now an alias), and `#message var` switches
the confirmations for one kind of command off, as in tt++. tt++'s own
lines (`#ALIAS {zz} NOW TRIGGERS {smile} @ {5}.`, `#OK: VARIABLE {target}
HAS BEEN SET TO {ORC}.`) are long and differ from command to command. The
owner wants one restrained form in our colours, lower case, that keeps the
`#` and the braces.

## Decision

### One form

A row is the command as it would stand in a profile, or the command and
its key followed by one state word:

    #word {argument} {argument}      a definition (made, or listed)
    #word {key} state                anything else

Lower case (the player's own text is kept as it is; event names and keys
are shown as the engine stores them), no period, no `[SYSTEM]` prefix, the
default priority left out. A definition row is a valid profile line that
defines the same thing, so a listing can be copied into a profile. The
state words are `removed`, `not found`, `none`, `opened`, `closed`,
`not open`, `on`, `off`.

| Typed | Row |
|---|---|
| `#alias zz smile` | `#alias {zz} {smile}` |
| `#action {^%1 arrives$} {kill %1} {3}` | `#action {^%1 arrives$} {kill %1} {3}` |
| `#action {^%1 leaves$} {follow %1} {5}` | `#action {^%1 leaves$} {follow %1}` |
| `#macro {f5} {draw sword}` | `#macro {F5} {draw sword}` |
| `#substitute {foo} {bar}` | `#substitute {foo} {bar}` |
| `#highlight {orc} {light red}` | `#highlight {orc} {light red}` (the colour shown in that colour) |
| `#gag {^You are hungry}` | `#gag {^You are hungry}` |
| `#variable {target} {orc}` | `#variable {target} {orc}` |
| `#math {n} {6 * 7}`, `#format {s} {%s!} {hi}` | `#variable {n} {42}`, `#variable {s} {hi!}` |
| `#ticker {heal} {cast 'cure light'} {30}` | `#ticker {heal} {cast 'cure light'} {30}` |
| `#delay {1.5} {stand}` | `#delay {1.5} {stand}` |
| `#delay {wake} {stand} {2}` | `#delay {wake} {stand} {2}` |
| `#event {session connected} {look}` | `#event {SESSION CONNECTED} {look}` |
| `#unalias zz` (and every other `#un…`) | `#alias {zz} removed` |
| `#unalias zz`, nothing matched | `#alias {zz} not found` |
| `#unalias {k*}`, up to 5 removed | one `#alias {key} removed` row per key, the state words aligned |
| `#unalias {k*}`, more than 5 removed | `#alias {k*} removed (12)` |
| `#class {pvp} {open}` | `#class {pvp} opened` |
| `#class {pvp} {close}` | `#class {pvp} closed`; when it is not the open class: `#class {pvp} not open` |
| `#class {pvp} {kill}` | `#class {pvp} removed (2)` (entries removed); an open, empty class: `#class {pvp} removed`; else `#class {pvp} not found` |
| `#message variables off`, `#message var` | `#message {variables} off` / `on` |
| `#message all off` | `#message {all} off` |
| `#message nope` | `#message {nope} not found` |
| `#message` | eleven rows `#message {class} on` / `off`, aligned |
| `#alias`, `#alias {k*}`, `#variable`, `#ticker`, `#delay` … | one definition row per entry, the second argument aligned (keys up to 24 cells) |
| `#alias {gc}`, `#variable {target}` | the one definition row |
| a listing that finds nothing | `#alias none`; with a filter or a name: `#alias {q*} not found`, `#variable {x} not found` |

- One row each, never wrapped. A line break in an argument becomes a
  space. When the row is wider than the pane less one cell (80 when the
  pane is not measured), the longest argument is cut and ends in `…`
  inside its braces.
- A rejected definition (unknown colour, unbindable key, bad pattern, a
  ticker without a time, `#message {x} {maybe}`) keeps its `[SYSTEM]`
  line and gets no row.

### When a row is shown

- **Confirmations** (made, removed, not found, class opened …): for the
  commands of the typed line itself, as ADR 0038 defines "typed" (each
  command of a `;` line, the body of a typed `#N` or `#if`). Never for
  commands run by an alias, action, macro, ticker, delay or event, and
  never while a profile loads. Not when `#message` has the command's
  class off.
- **Listings** (a define command without Commands, `#variable {name}`,
  `#message`) are asked for, so they are always shown: from a script too,
  and with the class off.
- The answer to a typed `#message` is always shown.

### `#message`

- `message` is now a command the engine runs (tier `should`; it was
  inert). `#message` lists; `#message {class}` switches the class over;
  `#message {class} {on|off}` sets it; `all` means every class, and
  `#message {all}` switches everything on when anything is off, else off.
- Classes: actions, aliases, classes, delays, events, gags, highlights,
  macros, substitutes, tickers, variables. A class word resolves as a
  command word does: exact name, else the first class in alphabetical
  order that starts with it (`var`, `variable`, `al`, `sub`); a single
  letter that starts several classes names none; `all` is written in
  full.
- Default: everything on. The state belongs to the user rule store, so a
  profile load starts from the default and applies the profile's
  `#message` lines (silently; an unknown class is a load warning), and a
  refused load keeps the running state.
- Display only: with a class off, its commands run and are saved exactly
  as before.
- **Persistence.** A typed `#message` is a typed setting (ADR 0038,
  `TypedChange` `{ op: 'message', changed, off }`). The profile holds only
  what differs from the default: one `#message {class} {off}` line per
  class that is off, `#message {all} {off}` when all are, no line for a
  class that is on. A line for another class keeps its bytes and its
  command word; a new line goes after the last `#message` line, else after
  the last definition (`addCommand`). When the profile sets classes in a
  way that cannot be edited line by line (`all`, a toggle without a
  state), its `#message` lines are written anew. A `#message` on a line
  with several commands is refused with the usual line. A `#message` run
  by a script changes the session only.
- In the document model a `#message` line is a passthrough command node
  (`reason: 'command'`), byte-exact as every node; the editor no longer
  marks it as inert.

### Colours

- The row (`wc-msg`) is coloured by the editor's tt++ lexer
  (`src/editor/syntax.ts`, `wc-syn-*`): command `--c-syn-cmd`, braces
  `--c-syn-brace`, `;` `--c-syn-delim`, `$var` / `%1` `--c-syn-var`,
  colour codes `--c-syn-code`; the rest `--c-item`. The state word is
  `--c-body`, and `--c-note` for `not found`, `not open` and `off`, so
  "nothing was done" and the classes that are off stand out in a column.
- A highlight's colour argument is shown as the highlight will colour the
  game text (the parsed style, through the pane's own run styling).
- The UI tokens assume a dark canvas. On a light terminal background
  (`data-light`, the paper theme) the same roles are mixed from the
  terminal foreground (`color-mix`), so the rows keep their contrast.

### Where the code is

- The engine (`src/script/engine`, no DOM) emits data:
  `EngineOptions.report(Report)`, with `Report` = `set` (one item) |
  `list` (items) | `state` (rows of word, key, state, count)
  (`report.ts`). The confirmation hooks sit next to the ADR 0038 `onTyped`
  calls; nothing on the line or key path changed.
- `src/app/messages.ts` (pure, unit tested) turns a report into
  `StyledRow`s; `App` pushes them with `OutputPane.pushStyled`, the `#help`
  convention (ADR 0037): no bus event, so no action, substitute, gag or
  highlight sees a row and nothing records it. A `StyledRow` segment may
  now carry a game style (`run`) instead of a class.
- The manual has a `#message` section and a paragraph in "Typing
  commands"; an example's `check.says` lists the rows it gives, and the
  manual test expects exactly those (none when it lists none).

## Consequences

- The listing forms changed their output: `#ALIAS {k} {kill %1}` and
  `No aliases defined.` `[SYSTEM]` lines are now `#alias {k} {kill %1}`
  and `#alias none` rows.
- `syntax.ts` moved from the editor chunk to a start-up chunk of its own
  (2.6 kB, 1.1 kB gzip).
- Rows are not recorded, so a log replay does not show them (as `#help`).
- `#help` rows and `[SYSTEM]` lines still use the dark-canvas tokens as
  they are on a light background; only the new rows adapt.
- Entries typed with a class off give no sign at all that they were
  saved; a refused save still prints its line.
