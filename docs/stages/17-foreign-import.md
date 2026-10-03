# Stage 17 — Foreign import (TinTin++, JMC, Powwow)

Owner request 2026-10-03/04: import old settings from other clients.
The format is detected automatically, what can be translated becomes a
new profile, and the user gets feedback on how the import went.

Intent Goal 11, spec §2.11, ADR 0073. Research:
`notes/research/import/`.

## Owner decisions

- 2026-10-04: **formats** are TinTin++, JMC and Powwow. Mudlet is out.
- 2026-10-04: the import shows **feedback**: the detected format, how
  many settings were translated and how many were left, and why.

## Plan

### A. Pure core (`src/import/`)

- `decode.ts`: bytes → text (UTF-8 strict, cp1251/cp1252 fallback, BOM,
  line endings, NFC).
- `detect.ts`: signal scoring, result with format and signals.
- `tintin.ts`, `jmc.ts`, `powwow.ts`: translators to `ImportResult`.
- `keys.ts`: JMC key names and Powwow/tt++ escape sequences → our macro
  key names (reuse `src/script/keys.ts` where it already parses).
- `index.ts`: `importFiles(files)` with multi-file `#read` resolution.
- Unit tests per module with a small corpus under
  `tests/fixtures/import/` (hand-written samples in the style of the
  public files cited in the research; no copied third-party files).
- Every translated profile in the corpus must load in the script engine
  without errors (a test runs the engine's loader over each output).

### B. UI

- Profile picker IMPORT: file input accepts several files; reads bytes
  (`arrayBuffer`), calls the lazy import chunk, saves via
  `profiles.importFile`, then pushes the report frame.
- Report frame (ADR 0073 §Report frame): format, counts, missing
  files, grouped item list, EDIT and OK buttons. Keyboard navigation as
  the other start page frames.
- A plain WebCockpit export still imports silently as before, with the
  short "nothing changed" report.

### C. Tests and docs

- Unit tests (A), one e2e test: import a JMC sample, see the report,
  open the profile.
- Profile editor help / About: one line on supported import formats.

## Tasks

- [ ] A1 decode
- [ ] A2 detect
- [ ] A3 tt++ translator
- [ ] A4 JMC translator
- [ ] A5 Powwow translator
- [ ] A6 keys
- [ ] A7 importFiles + multi-file
- [ ] A8 corpus + engine-load test
- [ ] B1 picker multi-file + bytes
- [ ] B2 report frame
- [ ] C1 e2e
- [ ] C2 help text
- [ ] Release

## Build notes

## Test guide

Open the start page → Profiles → IMPORT.

1. **tt++:** choose your old tt++ file(s). If your setup uses `#read`,
   select the main file and the files it reads at the same time.
   Check: the report says *TinTin++*, the counts look right, and the
   kept lines are the ones you expect (session, split, config…).
2. **JMC:** choose a `.set` file (and `global.set` if you have one).
   Check highlights (colours), hotkeys and actions in the new profile.
3. **Powwow:** choose your powwow definition file. Check that gag
   actions hide lines and that `#bind` keys turned into macros.
4. Press EDIT in the report and read the `#nop` block at the end: is
   anything there that you think should have been translated?

Feedback wanted: wrong format detected? Settings translated wrongly or
not at all? Is the report readable and useful?

## Owner feedback
