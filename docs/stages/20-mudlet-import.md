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

- [ ] A1 xml parser
- [ ] A2 zip reader
- [ ] A3 Lua subset translator
- [ ] A4 Mudlet translator
- [ ] A5 detect/index/types
- [ ] A6 fixtures, unit tests, corpus load test, owner-sample smoke
- [ ] B1 unpack archives in import-load
- [ ] B2 report frame check
- [ ] C1 e2e
- [ ] C2 help text
- [ ] Release

## Build notes

## Test guide

## Owner feedback
