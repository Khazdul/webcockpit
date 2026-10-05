# Stage 20 — Mudlet import

Owner request 2026-10-05: import a Mudlet profile as a plain profile.
Aliases, triggers, keys, highlights, substitutes and variables become
tt++ rules; nothing is added to the Scripts page.

Intent Goal 11 (Mudlet), spec §2.11, ADR 0076. Research:
`notes/research/import/mudlet.md` §8–§9.

## Owner decisions

- 2026-10-05: Mudlet is in scope (intent Goal 11).
- 2026-10-05: a Mudlet import produces **only a tt++ profile**, never
  scripts. What cannot be translated is kept visibly.
- 2026-10-05: installed third-party packages are not imported; the
  report names the built-in replacement.

## Plan

### A. Pure core (`src/import/`)

- `xml.ts`: minimal XML parser with line numbers.
- `zip.ts`: async zip reader (central directory, deflate-raw).
- `mudlet-lua.ts`: Lua-subset lexer, parser and tt++ emitter, function
  inlining, colour conversion.
- `mudlet.ts`: tree walk, packages, folders → `#class`, gates, patterns,
  keys, timers, variables, colorizers, kept block.
- `detect.ts`, `types.ts`, `index.ts`: format `mudlet`.
- Fixtures `tests/fixtures/import/mudlet/` (hand-written in the style of
  real files) and unit tests; every output loads in the engine (corpus
  test). A local smoke test runs the owner's sample from `~/Downloads`
  when present (skipped otherwise; not committed).

### B. UI

- `import-load.ts`: unpack `.mpackage`/`.zip` before `importFiles`.
- Report frame: format `Mudlet`, package lines.

### C. Tests and docs

- e2e: import a Mudlet XML fixture, see the report, open the profile.
- Help line in the profile manual: Mudlet in the import formats.

## Tasks

- [x] A1 xml parser
- [x] A2 zip reader
- [x] A3 Lua subset translator
- [x] A4 Mudlet translator
- [x] A5 detect/index/types
- [x] A6 fixtures, unit tests, corpus load test, owner-sample smoke
- [ ] B1 unpack archives in import-load
- [ ] B2 report frame check
- [ ] C1 e2e
- [ ] C2 help text
- [ ] Release

## Build notes

### A. Pure core (2026-10-05)

`src/import/`: `xml.ts`, `zip.ts`, `mudlet-lua.ts` (lexer, full Lua
parser, subset emitter), `mudlet.ts`, `keys.ts` (`qtKey`), wiring in
`detect.ts`/`types.ts`/`index.ts`. Tests: `xml`, `zip`, `mudlet-lua`,
`mudlet`, `keys`, corpus (fixtures `tests/fixtures/import/mudlet/`:
`profile.xml` a profile save, `package.xml` a package export) and
`mudlet-sample.test.ts` (owner's file from `~/Downloads`, skipped when
absent; `MUDLET_SAMPLE_PRINT=1` prints counts, kept items and samples).

Owner's sample: 204 translated, 23 kept, 7 packages skipped; the
profile loads with no warnings. Kept: 7 disabled items, 3 package
calls (`MumeSpellTimers.attemptBlind`, incl. F2 via `castSpell`), two
for loops, `tempRegexTrigger`/`killTrigger`, `speedwalk`, `reconnect`,
a table (`autoStab`), the keyCode-197 key, the `blindList` table and 6
Scripts that are not fully inlinable.

Engine facts the translation relies on (checked in `src/script/`):

- `#if {c} {…} #elseif {c} {…} #else {…}` on one line continues the
  chain; string `==` has a glob right side, so a literal with `*` is put
  on the left (`"*orc*" == "$mees"`).
- `#nop {…}` may span lines when its braces balance; kept Lua keeps its
  newlines.
- Body text: `\;`, `\{`, `\}`, `\$`, `\%`, `\&` stay escaped in stored
  `#variable` values and are removed when the text is used. `%1`
  before a digit is written `%01` (two-digit argument form); `$x` before
  a name character is written `${x}`.
- Pattern aliases are matched from the start of the input; `^c$` does
  not take `c foo`. `%0` of a pattern alias is the whole match.
- A pattern with `$name` or `${name}` is compiled per line with the
  variable expanded (used for pattern gates).
- Actions with a lower priority run first; actions run before the
  display copy's substitutes, gags and highlights.

Decisions and refinements (ADR 0076 amended where a decision changed):

- **Pattern gates** (ADR amended): see the ADR. The sync action is one
  `#action {%*} {…} {1}` for all pattern-gated names. Gate start values
  are written only for gates some translated rule reads. Gates are found
  from Lua tokens, so a commented-out `--disableTrigger("x")` does not
  gate `x` (the owner's `hidescore1`).
- **Exported package files** (ADR amended): a file of only packages and
  no `HostPackage` is translated, except replaced packages.
- **Colorizer captures** (ADR amended): groups only, via lookarounds.
  Mudlet's colouring of groups is from memory of `TTrigger.cpp` [U].
- Regex patterns use `regexToPattern(…, split)`: literal runs stay
  literal and only regex atoms go into `%!{…}` (`day%!{.}`); a regex
  `x(?:SEP(Y))?$` becomes `x%!{(?:SEP|$)}{(?:Y)?}$` (`.+` → `.*`).
  `regexToPattern` no longer lets a literal leading `^` become an anchor
  (all formats). When groups cannot map and the body uses no `matches`,
  the whole regex is `%!{…}`; otherwise the item is kept.
- Lua: constant conditions fold (`if sd_1 then` with `"exit"` bound);
  `x = x or ""` is dropped; `x = a or x` → `#if` without `#else`; `a or b`
  used as text splits the statement into `#if` branches (`c and v or w`
  is the ternary); comparisons/`not` assigned to a variable → 1/0.
  `return f(x)` at the end still runs `f(x)`. Inlined arguments are
  closed over the caller, so a parameter never captures a caller name. A
  function that is one `return e` inlines in expressions.
- `send` whose text starts with `#` is kept (tt++ would run it). An empty
  send is dropped with a warning. The alias warning tests each imported
  alias pattern against the sent text (variables as `x`).
- `command`/`mCommand`: `;;` separates commands (Mudlet's default
  separator); a single `;` is literal.
- Reasons say `calls f` for user and package functions and `uses f` for
  Mudlet and Lua library functions (`uses tempRegexTrigger`, `uses
  math.min`); an inlined failure names the function (`… (in castSpell)`).
- Scripts: defaults from every own Script (also kept ones) give start
  values; an unconditional `x = v` wins over a saved variable, `x = x or
  v` only fills in. A Script is translated when it only defines
  in-subset functions and defaults; empty ones are skipped.
- Disabled items are kept as `#nop {Disabled in Mudlet (<kind> <name>):
  <rules>}` with the rules on separate lines.
- `src/chrome/frames/import-report.tsx` got `mudlet: 'Mudlet'` in its
  format-name map (needed for the type check; part B checks the frame).

## Test guide

## Owner feedback
