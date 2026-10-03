# 0073 — Foreign profile import (TinTin++, JMC, Powwow)

- Status: Accepted
- Date: 2026-10-04
- Implements: intent Goal 11, spec §2.11
- Research: `notes/research/import/` (README, `tintin.md`, `jmc.md`,
  `powwow.md`; `mudlet.md` is kept for reference, Mudlet is out of scope)

## Context

The owner wants old settings from TinTin++, JMC and Powwow to become a
WebCockpit profile automatically, with feedback on how the import went.
The profile language is a tt++ subset (spec §3), so tt++ is close to a
copy, JMC is a TinTin 1.5 dialect, and Powwow is a different syntax that
maps rule by rule. Mudlet was researched and dropped by the owner
(mostly Lua; low yield).

## Decision

### Module shape

- `src/import/` holds pure code, no DOM: `decode.ts` (bytes → text),
  `detect.ts` (text → format + signals), `tintin.ts`, `jmc.ts`,
  `powwow.ts` (text → `ImportResult`), `keys.ts` (foreign key names and
  byte sequences → our macro key names), `index.ts` (`importFiles`).
- It is a lazy chunk, loaded only when IMPORT is used. Nothing on the
  start-up path imports it.
- `ImportResult`: `{ format, signals, profileText, items: ImportItem[],
  counts, missingFiles }`. `ImportItem`: `{ file, line, source,
  outcome: 'translated' | 'kept' | 'skipped', reason?, warning? }`.

### Input and decoding

- The picker's file input takes several files. The entry file is the
  one that no other chosen file `#read`s (ties: first chosen).
  `#read`, `#class {x} {read} {file}` (tt++) and `#read` (JMC) are
  resolved by base name, case-insensitive, among the chosen files and
  inlined in place (`#class … read` becomes open … close; `#session`'s
  fourth argument, a file, is inlined too). A cycle or a missing file is
  a report line; the `#read` itself is kept inert. Chosen files that
  nothing reads are appended after the entry with a file warning (JMC's
  `global.set` is never the entry and comes last, as JMC reads it).
- Decoding: strict `TextDecoder('utf-8', { fatal: true })`, else
  windows-1251 if more than a third of the high bytes fall in the
  Cyrillic letter range 0xC0–0xFF *and* the result has Cyrillic words,
  else windows-1252. BOM stripped (a UTF-16 BOM decodes as UTF-16),
  CRLF/CR → LF, NFC. A file not read as UTF-8 gets a file warning naming
  the encoding.

### Detection

Score per format from signals (research files §Detection). Examples:

- Powwow: first line `#savefile-version` (decisive);
  `#action [>%<=+-]` label rules ending in `=`; `#mark x=attr`;
  `#bind name ^[`; `#(@` / `#($`; `#groupdelim`, `#delim`.
- JMC: `.set` name; the 3.7 state header (`#multiaction`, `#presub`,
  `#togglesubs`, `#verbat`, `#colon`, `#race format`, `#codepage {`,
  `#oob {GMCP}`, `#ticksize`); `#action TEXT|RAW|COLOR`; `#hot(key)`
  with `Ctrl+`/`Alt+`; `#group local|global`; `%%n`; highlight whose
  first argument is a JMC colour list.
- tt++: the default. Signals listed only for the report (`#class`,
  `#ticker`, `#event`, `#macro`, `%w`/`%d`/`%*`, `<xyz>` codes).

Highest score wins if it has at least one decisive signal or a margin
of 2; otherwise tt++. The report names the format and up to three
deciding signals.

### Translation rules (summary; details in the research files)

- **tt++:** text passes through. Fixed up: `/* */` comments become
  `#nop` lines; 1.x forms are rewritten with a warning (`#highlight`
  argument order, literal `else`, `#antisubstitute` kept); `#config`,
  `#session`, `#split`, `#send` and screen commands are skipped; inert
  commands stay in place verbatim and are counted as *kept*. Commands the
  engine would reject on every load (unknown words such as `#killall` or
  1.x `#tick*`, `#class` forms other than open/close/kill, undecodable
  macro keys, free text) stay in place as `#nop {<reason>: <line>}`.
  Comments are carried over as `#nop` and are not report items. tt++'s GMCP events
  (`IAC SB GMCP <Mod> IAC SE`) are renamed to ours with a warning that
  arguments differ.
- **JMC:** command char from the file; abbreviations expanded;
  `TEXT/RAW/COLOR` word removed (RAW/COLOR kept); `{prio} {group}`
  become `#action` priority and `#class` blocks; `%%n` de-nested by
  brace depth per definition level (a nested definition gets one more
  `%` per level, as tt++ strips one per pass); regex `/re/flags` → `{regex}` with groups shifted;
  `#highlight` colour list → `<xyz>`/names, arguments swapped;
  `#substitute {x} {.}` → `#gag`; `#hot`/`#hotkey` → `#macro`;
  `#variable`; `#if a b c` stays (the engine runs the third-argument
  form); `#wait` → `#delay` around the rest of the command list;
  `#tickon` → `#ticker` of the `#ticksize` length with a warning
  (`#ticksize` alone is skipped); `##` comments →
  `#nop`. JScript (`#use`, `#scriptlet`) and `#status` are kept.
- **Powwow:** `#alias n=t` → `#alias {n} {t}`; actions → `#action`
  with `&n` → `%n`, `$n` → `%S`-style word capture, `$0` → `%0`;
  implicit gag handled (`#print` removed, no `#print` → the action also
  gags the line; `#print text` → `#showme`); `@group` → `#class`
  (labels are not mapped); disabled (`-`)
  actions are kept (as `#nop`, translated text) since the profile
  language has no disabled rule; regexp actions (`%`) → `{regex}` with groups shifted;
  `#mark` → `#highlight`; `#bind` sequences decoded to key names →
  `#macro`, `&edit-function` bindings skipped; `#(@x = n)` / `#($x =
  "s")` → `#variable`; `#init` → `#event {SESSION CONNECTED}`
  (`#identify`, `#request` dropped); `#in` →
  `#delay`. Expressions other than plain assignments and simple
  arithmetic are kept. `#option`, `#host`, `#setvar`, `#nice` and other
  client state are skipped.
- **First-match semantics:** JMC (with `#multiaction OFF`) and Powwow
  fire only the first matching action. The translation keeps their
  definition order (the engine runs equal priorities in definition
  order; JMC priority numbers are kept) and adds one warning for the
  whole file: tt++ fires every match.

### Output

- The profile starts with
  `#nop {Imported from <format> file <name> on <date>. See the import report.}`.
- Translated items follow in source order. Kept foreign lines go under
  `#nop {--- Not translated ---}` as `#nop {<reason>: <line>}`; braces in
  the line that would unbalance are written `\{`/`\}`. tt++ inert
  commands stay in place, verbatim.
- The profile is saved via the existing `ProfileStore.importFile`, so
  naming, collisions and `stripSend` are unchanged. A file the detector
  calls a native tt++/WebCockpit profile with no fix-ups gives a short
  report ("tt++, N rules, nothing changed"); its text is stored as read,
  without the header.

### Report frame

A frame pushed after import, in the start page's TUI style:
`IMPORT REPORT` title; format line; counts line `Translated n · Kept n ·
Skipped n · Warnings n`; missing files; then a scrollable list grouped
by outcome (kept, skipped, warnings), each row `file:line  reason` with
the source text dimmed. Buttons: EDIT (opens the profile editor), OK.

## Consequences

- The `/* */` comment gap in the engine (research `tintin.md`) is fixed
  by the importer rewriting comments, not by changing the engine. The
  engine bug stays open as its own item.
- Translation quality is bounded by our subset; the report makes the
  gap visible instead of hiding it.
- Mudlet import can be added later as another `src/import/*.ts` without
  changing the shape.
