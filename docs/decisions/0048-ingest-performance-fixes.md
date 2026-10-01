# 0048 — Ingest performance fixes: rules that keep results identical

- Status: Accepted
- Date: 2026-10-01
- Builds on ADR 0044 (performance rules); stage 8 part C items #4, #7,
  #10, #11 and the ingest small fixes

## Context

The performance review (`notes/research/perf-review/B-ingest.md`) measured
experiment patches for the ingest path: telnet → assembler → engine →
recorder. Turned into production code, each change must give exactly the
results the old code gave: the same lines, runs, raw text, rule matches,
stored log and events. These are the choices made to guarantee that.

## Decision

- **Assembler raw (#4).** `Line.raw` is appended lazily as one slice per
  stretch between dropped constructs; the SGR parameter array keeps its
  capacity. Checked byte-identical against the old assembler on every
  real log (ANSI and an XML rewrite, random chunking); unit tests cover
  24-bit and 256-colour rows.
- **Telnet (#10).** The data state finds the next IAC and NUL with
  `indexOf` and reuses each position until passed, so a frame full of
  NULs or IACs stays linear.
- **Literal gates (#11).** Per rule list, one RegExp of the rules'
  required literals (`CompiledPattern.literal`). When it fails, the loop
  jumps between the rules without a literal (catch-alls, `%i`, `$var`
  patterns, wildcard-only patterns); when it passes, every rule runs its
  own checks as before. Substitutes drop the gate as soon as one changes
  the text (a substitute may write a later rule's literal); gags and
  highlights are gated on the substituted text. Gates live in a WeakMap
  keyed by the copy-on-write rule list and are built on a list's 8th use,
  so lists rebuilt on every line never compile one. Lists under 4 rules
  are not gated. `EngineOptions.literalGates: false` turns them off for
  differential tests and benchmarks.
- **Recorder (#7).** Bytes are counted per captured line (`utf8Length`,
  identical to `TextEncoder`, lone surrogates as U+FFFD). A chunk is cut
  before a line would take it over 256 KB (a longer single line is a
  chunk of its own) and written right away; one `append` per chunk, each
  after the previous transaction completed, so each is its own task. The
  stored format is unchanged: chunks still split only at line ends.
- **XML tag stack.** At most 32 open elements; opening one more closes
  the outermost at that point (as if its end tag came there).
- **GMCP package key.** The `gmcp` bus event gains `key`, the package in
  lower case, set by its producers; subscribers use `gmcpKey(m)`, which
  falls back to `pkg.toLowerCase()` so emitters in tests may omit it.
- **Run events and the group.** The App's `RunEventDeriver` reads
  GameState's `GroupModel` (`shareGroup`) instead of applying `Group.*`
  to a second model. It checks the allies after GameState has applied the
  message, whether GameState is subscribed before or after it. Standalone
  derivers (tests, demo generation) keep their own model.
- **Comm archive.** Appends made in one task are written in one
  transaction at the end of the task (a microtask), in order. No timer:
  nothing outlives the task, so nothing is lost on unload. Reads and
  prunes write the queue first.

## Consequences

- The review's estimate stands: SGR-heavy ingest about −45 %, normal text
  about −25 %, and the engine at 500 rules about half (Node A/B:
  16.5 → 8.2 µs per line). The quiet-machine pass measures the browser
  numbers.
- A failed comm write now rejects every append of its batch.
