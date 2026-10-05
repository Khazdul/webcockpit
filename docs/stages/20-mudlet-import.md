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
- `mudlet.ts`: tree walk, packages, folders (no output since round 1),
  gates, patterns, keys, timers, variables, colorizers, report.
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
- [x] B1 unpack archives in import-load
- [x] B2 report frame check
- [x] C1 e2e
- [x] C2 help text
- [x] Release (0.1.48)

Round 1 (owner feedback 2026-10-05):

- [x] R1 no `#class` from Mudlet folders
- [x] R2 no `#nop` per untranslated or disabled item; one summary `#nop` at the end
- [x] R3 pattern gates removed; switched gag/highlight/substitute items excluded; orphan enable/disable dropped with a warning

Round 2:

- [x] R4 colorizers with no foreground and a black/no background give no `#highlight`

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

- **Pattern gates** (ADR amended; removed in round 1, see below): see the ADR. The sync action is one
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

### Round 1 (2026-10-05)

Owner feedback applied in `mudlet.ts` (ADR 0076 amended): no `#class`,
no kept block, one summary `#nop` at the end, pattern gates removed.
Gate placeholders now carry the call name; in `write()` a placeholder
becomes `#variable {mudlet_on_x} {1|0}` only when a translated rule is
switched by `x`, otherwise it is removed (with one `;`) and the item
gets the warning. `usedGates` is filled in `finish()` for translated
items only. Owner's sample: 203 translated, 24 not translated (6
disabled, 18 not translatable), 7 packages; `hidescore1` →
`#action {^(HIDEME)…} {#variable {hiddenAutoScoreSentBalance} {0}}` +
`#gag {^(HIDEME)…}` with a warning that `enableTrigger("hidescore2")`
was dropped; `hidescore2` is excluded. The `^speedwalk$` and
`^bsleep$`/`^bwake$` aliases lose their enable/disable of untranslated
or unknown items, with a warning.

### Round 2 (2026-10-05)

Mudlet writes `mFgColor` as `transparent` when unset and applies fg/bg
only when not transparent (XMLexport.cpp, TTrigger.cpp, checked by the
main session). In `trigger()` a black background is dropped and a
colorizer left with no colour is excluded (no other output) or gets the
note as a warning. Fixture `package.xml` gains `sanc` (excluded) and
`charmie` (action kept, warning). Owner's sample: 195 translated, 32 not
translated (6 disabled, 26 not translatable), 7 packages; 8 of 9
colorizers are excluded, two `#highlight` lines remain (`mobHighlights`,
cyan text).

### B. UI (2026-10-05)

- `src/chrome/frames/import-load.ts`: `loadImportFiles()` now returns an
  async `importFiles` that first runs `unpackArchives` (zips by content,
  `isZip`, not by extension). The `*.xml` entries go on as files
  (`__MACOSX/` and `._` forks ignored): one XML takes the archive's name
  (`MyHighlights.mpackage` → `MyHighlights.xml`, so the profile is
  `MyHighlights`), several are `<archive>_<entry>.xml`. A zip without
  XML or one `readZip` rejects is a file warning in the report (counted
  in Warnings); when nothing is left the import fails with that message
  in the picker's flash row (`Import failed: x.mpackage holds no XML
  file; …`). `isZip`/`readZip` come from the dynamically imported core,
  so the zip reader stays in the lazy `import` chunk (checked in a
  build: `deflate-raw` only in `assets/import-*.js`). The profile picker
  awaits the result.
- B2: the report frame needed no change. On `profile.xml`: `Format
  Mudlet (MudletPackage version 1.001, profile save)`, kept items with
  reasons (`Multiline (AND) trigger`, `Uses tempRegexTrigger`, `Key 'Å'
  (code 197) depends on the keyboard layout`, …), one skipped line per
  package with the replacement (`WebCockpit has a built-in Key manager
  (1 item)` / `Package Port Key Library v1_1_1`).

### C. Tests and docs (2026-10-05)

- Unit: `tests/unit/import/archive.test.ts` (naming, forks, no-XML and
  broken archives, warnings merged into the result, the all-failed
  error). `buildZip` moved to `tests/unit/import/helpers.ts`.
- e2e (`tests/e2e/import.spec.ts`, shared `openProfilePicker`/
  `importFile` helpers): a Mudlet profile save (format, counts, kept
  and package lines, `#alias {^qd$}` in the editor) and
  `tests/fixtures/import/mudlet/MyHighlights.mpackage` (a real zip:
  `config.lua` + `MyHighlights.xml` = `package.xml`; profile
  `MyHighlights`, `#alias {^hl$}` in the editor).
- Profile manual (`src/editor/help.ts`, "Writing a profile"): a line on
  Mudlet profile saves and exported packages (`.xml`/`.mpackage`),
  translated to profile rules, no scripts, untranslatable Lua kept as
  `#nop`.

## Test guide

Run `npm run dev` and open the local address it prints (the release
waits for your go). Start page → Profiles → IMPORT.

1. **Your profile:** choose `export (from save profile as).trigger`
   from Downloads. Check: the report says *Mudlet*, about 195
   translated, 32 not translated, 7 skipped packages, each package line naming
   what replaces it (Key manager, Timers, Comm …).
2. Press **EDIT** and read the profile: rules are flat in source
   order, aliases are `#alias {^name$} {…}`, keys are `#macro`. The
   last line counts what was not translated; the report lists each.
3. **Play with it:** `sd east`, then `c`, `cc`, `o`; `z orc`, then
   F1/F4; `burn` and `normal`; `ga`; `silvery`. Do the commands and the
   `## …` echoes look right?
4. **Colour triggers:** your colorizers (High Spellbuff, Charmies,
   Sanc highl …) have no foreground and a black background in the file,
   so they come out as `<B000000>`, invisible on black. Do they show
   colour in Mudlet?
5. If you have a `.mpackage` from someone, import it too.

Feedback wanted: anything translated wrongly, anything kept that you
think is simple enough to translate, and whether the report is useful.

## Owner feedback

### Round 1 (2026-10-05)

1. **No `#class` at all.** Mudlet folders give no `#class` lines; rules
   are flat in source order.
2. **No `#nop` per untranslated item.** Untranslated and disabled items
   are left out of the profile; one short `#nop` at the end counts them
   and the packages. The report keeps listing every item with its
   reason.
3. **No pattern-gate mechanism.** Items switched by name get a readable
   `#if {$mudlet_on_<name>} {…}` only when their output is plain
   commands. A switched item that would give a gag, highlight or
   substitute is not translated. Enable/disable of an item that was not
   translated is dropped with a warning; no orphan `mudlet_on_*`
   variables.

### Round 2 (2026-10-05)

4. **Invisible colorizers.** The colorizers that keep the text colour on
   a black background showed nothing but filled the profile with
   `#highlight {…} {<B000000>}`. Such a colorizer gives no `#highlight`;
   without other output it is not translated and the report says why. A
   black background beside a real foreground is dropped.
