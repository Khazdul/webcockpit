# 0076 — Mudlet profile import

- Status: Accepted
- Date: 2026-10-05
- Implements: intent Goal 11 (Mudlet, added 2026-10-05), spec §2.11
- Extends: ADR 0073 (module shape, report, output rules unchanged)
- Research: `notes/research/import/mudlet.md` §1–§9 and the prototype
  `notes/research/import/mudlet-lua-subset-proto.py`

## Context

The owner wants a Mudlet profile to become a plain profile. A common
user mostly has aliases, triggers, keys, highlights, substitutes and some
variables. In Mudlet even a simple item is Lua (`send("...")`), so the
import needs a translator for the common Lua forms. The owner's rule: a
Mudlet import **never creates scripts** (Goal 10); what is not tt++ is
kept in the profile as text. On the owner's own profile a prototype
translated 203 of 212 own items (research §9).

## Decision

### Input

- **XML:** a `MudletPackage` document, any extension (profile saves
  are `*.xml`; *Save Profile As* wrote `*.trigger`). Detected by content:
  `<!DOCTYPE MudletPackage>` or a `MudletPackage` root in the first
  1 KB. Decisive, so a Mudlet file never goes the tt++ path.
- **ZIP:** `.mpackage`/`.zip` (magic `PK\3\4`). `src/import/zip.ts`
  reads the central directory and inflates with
  `DecompressionStream('deflate-raw')`; stored entries are copied. This
  is async, so the UI (`import-load.ts`) unpacks archives before
  `importFiles` and passes the `*.xml` entries on as files. Other
  entries (`config.lua`, images) are ignored; a zip without XML is a
  file warning.
- **Several Mudlet files** are translated in the order chosen into one
  profile, with a `--- name ---` separator as in ADR 0073. Mudlet files
  are not mixed with other formats: if any chosen file is Mudlet, the
  rest are reported as skipped files.
- **XML parser:** a small one of our own in `src/import/xml.ts`
  (elements, attributes, text, the five entities, numeric character
  references, CDATA, comments, the DOCTYPE line) that records each
  element's start line for the report. No DOM, so it runs in the node
  unit tests. Version `1.001` control-picture decoding (U+FFFC + Control
  Picture → the control char) is applied to script text.

### Packages and own items

- A **package** is a top-level folder whose `name` equals its
  `packageName`, or any item whose `packageName` is listed in
  `HostPackage/mInstalledPackages`. Folders where they differ (the
  owner's `target_aliases` on `### Spells`) are own items.
- Package items are **skipped**: one report item per package, with the
  item count and, when known, the built-in replacement: Port Key
  Library → Key manager; MumeSpellTimers → Timers pane; comLibrary →
  Comm pane; XPCounter → Character pane and Statistics; QC → the
  profile's own `#alias`/`#action`; Mudlet's default packages
  (`run-lua-code`, `echo`, `deleteOldProfiles`, `enable-accessibility`,
  `mpkg`, `gui-drop`, `generic_mapper`) → not needed. Other packages:
  "third-party package, not imported".
- Package functions are never inlined. A call into one makes the item
  kept.
- *Amended 2026-10-05 (build):* a file that holds nothing but packages
  and is no profile save (an exported `.mpackage`/`.xml`) is what the
  user chose to import: its packages are translated as own items, except
  those with a built-in replacement, which are skipped as above.

### Folders and enabled state

- Folders become `#class {path} {open}` … `{close}` with the folder
  path joined by `/` (brace- and `;`-safe), as JMC groups do.
- A disabled item (or one in a disabled folder) that no body enables by
  name is written in the kept block as `#nop {Disabled in Mudlet: …}`
  with its translated text (the Powwow precedent).
- `enableTrigger/Alias/Key/Timer("name")` and the `disable…` forms
  become a **gate variable** `mudlet_on_<name>` (1/0). Every rule made
  from an item with that name (or inside a folder with that name) is
  wrapped in `#if {$mudlet_on_<name>}`. Its start value is the item's
  `isActive`. A gated alias sends the typed input in its `#else`
  (`%0`). *Amended 2026-10-05 (build):* a gated gag, highlight or
  substitute is not written ungated (a gated `.*` gag would hide every
  line); its pattern starts with `${mudlet_gate_<name>}`, which is empty
  when on and the never-matching `%!{(?!)}` when off. One
  `#action {%*} {…} {1}` copies these from `mudlet_on_<name>` at the
  start of every line, so a trigger that gags its line and then
  disables itself still gags that line (our actions run before gags).

### Patterns

- **Aliases** (always PCRE): `regexToPattern` (common.ts) when it gives
  a plain tt++ pattern, else the `{regex}` form with groups shifted.
  Mudlet aliases are anchored by the user; the translation keeps the
  anchors, so `^c$` does not also catch `c foo`. An optional tail
  `^word(?: (.+))?$` is kept as a regex alias, not split.
- **Triggers:** type 0 substring → literal pattern; 1 regex → as for
  aliases; 2 begin-of-line → `^text`; 3 exact → `^text$`. Types 4 (Lua
  function), 5 (line spacer), 6 (colour), 7 (prompt), multiline (AND)
  triggers, `isPerlSlashGOption`, chains (a non-folder trigger with
  children) and filters are kept, the chain with its children. Several
  patterns (OR) → one rule per pattern with the same body.
- **Colorizer** triggers → `#highlight {pattern} {<Frrggbb>[<Brrggbb>]}`
  from `mFgColor`/`mBgColor` (`transparent` omitted), plus an
  `#action` when the item also has a body. A regex with capture groups
  colours only the groups, as Mudlet does: each top-level group becomes
  `%!{(?<=before)group(?=after)}`.
- **Keys:** Qt `keyCode` + `keyModifier` → ADR 0005 names (`F1`,
  `Ctrl+S`, `Alt+Down`, `Numpad8` for the keypad bit, `KeyA`/`Digit1`
  for printable ASCII). A non-ASCII printable key (e.g. 197 `Å`) depends
  on the keyboard layout: kept with that reason.
- **Timers:** an active, non-temporary, non-offset timer →
  `#ticker {name} {body} {seconds}`. Offset timers and timers with no
  translatable body are kept.

### Bodies: the Lua subset (`src/import/mudlet-lua.ts`)

A lexer and recursive parser for statements, not a Lua interpreter. An
item body becomes tt++ only if every statement is in the subset;
otherwise the whole item is kept, with the first unsupported construct
as the reason (`uses tempRegexTrigger`, `for loop`, `calls
MumeSpellTimers.attemptBlind`).

- The `command`/`mCommand` field is copied as typed text and comes
  before the translated script.
- **Statements:** `send(x[, echo])`, `sendAll(…)`, `expandAlias(x)` →
  commands (the echo flag is dropped); `x = e` / `local x = e` →
  `#variable`; `x = x + n` and other arithmetic → `#math`;
  `x = a or b` → `#if` on `a` being empty; `if/elseif/else` → `#if`;
  `echo/cecho/decho/hecho` → `#showme` with colours converted;
  `deleteLine()` → a separate `#gag {pattern}` beside the action;
  `selectString(lit, 1)` + `fg/bg` (+ `resetFormat`/`deselect`) →
  `#highlight`; `selectString` + `replace(t)`, `replaceLine(t)`,
  `creplaceLine(t)` → `#substitute`; `selectCurrentLine` + `fg/bg` →
  `#highlight` on the trigger's pattern; `moveCursor`, `getLineCount`,
  `deselect`, `resetFormat` as parts of these idioms are dropped;
  `tempTimer(n, function … end | [[…]])` with a translatable body →
  `#delay {n} {…}`; enable/disable → the gate variable; `return` at the
  end of a body is dropped.
- **Expressions:** string literals (`"…"`, `'…'`, `[[…]]`), numbers,
  globals → `$name`, `matches[n]` → `%(n-1)`, `..` concatenation,
  `tonumber`/`tostring` (dropped), `utf8/string.upper/lower` (dropped,
  warning), `true/false` → `1/0`, `nil` → empty, comparisons
  (`== ~= < > <= >=`), `and/or/not`. A string comparison quotes both
  sides (`"$x" == "orc"`); a truth test `if x then` → `"$x" != "" &&
  "$x" != "0"`. `;` in literal text is escaped.
- **Colours in echoes:** Mudlet `<name>` from Mudlet's colour table →
  `<Frrggbb>` (`<reset>` → `<088>`); `decho` `<r,g,b[:r,g,b]>` and
  `hecho` `#rrggbb` → `<Frrggbb><Brrggbb>`; `<b>`, `<i>`, `<u>` are
  dropped; a trailing `\n` is dropped.
- **Inlining:** a global `function f(a, b)` defined in an own Script
  whose body is itself in the subset is inlined at each call with the
  arguments substituted (non-recursive, depth ≤ 3). Other calls to
  user functions make the item kept.
- **Variables:** every global the rules read gets a start value, since
  tt++ prints an unset `$x` literally: from `VariablePackage` (strings,
  numbers, booleans as 1/0; tables kept), from top-level defaults in own
  Scripts (`x = x or "v"`, `x = "v"`), else empty with one file
  warning listing them. Locals become profile variables of the same
  name.
- **Alias expansion:** Mudlet's `send` skips aliases, tt++ bodies do
  not. A sent command whose first word is the name of an imported alias
  gets a warning.
- **Own Scripts** are not imported as scripts. A Script fully consumed
  (only inlinable functions and defaults) counts as translated; any
  other Script is kept, as are event-handler Scripts, Action buttons
  and table variables.

### Output and report

As ADR 0073: header `#nop`, translated rules in source order, then the
`#nop {--- Not translated ---}` block with kept items. A kept item is
one `#nop {<reason> (<kind> <name>): <source>}` with braces made safe;
the Lua code keeps its newlines when the engine's `#nop` accepts them,
else they become `\n` text. The report source text is
`<kind> <name>  <pattern>`, the line is the element's start line in the
XML. The format name is `Mudlet`; signals: `MudletPackage version …`,
`profile save` (HostPackage present), `package archive`.

## Consequences

- Most simple Mudlet setups import fully; real Lua programs stay as
  readable `#nop` text that the user can port by hand or ask about.
- The Lua subset is deliberately small and grows only from real files.
- `ImportFormat` gains `mudlet`; nothing else in ADR 0073 changes.
