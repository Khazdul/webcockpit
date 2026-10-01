# 0051 — User scripts: Lua 5.4 in wasm, sandbox and host bridge

- Status: Accepted
- Date: 2026-10-01
- Builds on intent Goal 10, spec §2.10, ADR 0015 (script engine),
  ADR 0016 (run capture of panes)

## Context

Intent Goal 10 adds a script library beside the profile. Owner decisions
are in `notes/research/scripting.md`. Scripts must trigger on text,
aliases, keys, timers and GMCP, send and echo, and draw TUI panes, without
breaking the latency budgets (spec §1.3). Scripts are shared as files,
so a script is untrusted code. Intent names password phishing as a
concern.

A spike (2026-10-01, wasmoon 1.16.0, Node, Chromium and Firefox) measured
the candidates. Its key numbers are below.

## Decision

### Language and runtime

- **Lua 5.4 via wasmoon** (MIT, bundles PUC Lua 5.4, MIT). MUME players
  know Lua from Mudlet and Cockpit.
- **Lazy.** The wasmoon chunk and `glue.wasm` load only when at least
  one script is enabled. Together they are about 125 KB brotli, and the
  first engine is ready in about 60 ms. Cold start is unaffected.
- **Self-hosted wasm.** The file is always imported with
  `wasmoon/dist/glue.wasm?url`. wasmoon's default fetches it from unpkg,
  which spec §1.5 forbids.
- **Upstream build first.** wasmoon ships an emscripten build with
  ASSERTIONS on (extra getters on `globalThis`, per-call checks). We use
  it as is. Our own build of the C source is considered only if a
  benchmark fails.

### One engine, one environment per script

- One factory and one engine for all scripts. A separate engine per
  script costs 8× more to create, and a separate factory costs megabytes.
- Each script loads with `load(src, "@<name>", "t", env)`. `env` is its
  own table whose `__index` is a read-only base.
- Library tables (`string`, `table`, `math`, …) reach scripts as
  read-only proxies, so one script cannot change them for another.
- **Ownership.** The host keeps a registry per script: triggers, aliases,
  keys, timers, event handlers, panes, links. Disable, save and reload
  release everything, so scripts never clean up after themselves.

### Sandbox

- **Whitelist.** After the standard libraries open, every global not on
  the whitelist is deleted. The whitelist is the base functions,
  `string`, `table`, `math`, `utf8` and `coroutine`. Gone are `io`,
  `os`, `package`, `debug`, `load`, `loadstring`, `dofile`, `require`,
  `collectgarbage` and `string.dump`. The host keeps `load` as a local
  for its own use.
- Scripts reach the outside only through the script API (spec §2.10).
  There is no storage, network, DOM, password, profile text or other
  script's state. `store` is a per-script key-value area.
- **Instruction budget.** Every host→Lua call runs with a count hook,
  `lua_sethook(COUNT)` set from JS, at 1 M instructions per call.
  - An abort takes about 9 ms. The engine stays usable.
  - After the first abort the hook re-arms with count 1 ("poison"), so
    `pcall` and coroutines cannot swallow the abort.
  - The script is then disabled with a UI message.
- **Memory cap.** The engine is created with `traceAllocations` and a
  memory maximum (32 MB for all scripts). Without a cap, wasm memory
  grows to gigabytes and never shrinks.
- **Failures.** A script that raises errors 5 times within 10 seconds is
  disabled. Every error goes to UI messages as
  `<script>:<line>: <message>`.

### Host bridge on the raw C API

wasmoon's wrapper costs too much on the line path. Measured per call:

| Path | Cost |
|---|---|
| Wrapper, 80-char line | 5–6 µs |
| Wrapper, line plus captures | 13–22 µs |
| Raw C API, 80-char line | 1.0–1.5 µs |
| Raw C API, 10-field table plus call | 2.2 µs |
| Raw Lua → JS call | 0.1–0.3 µs |

The host therefore uses a thin bridge of its own on the raw exports:

- registry references for callbacks;
- a preallocated UTF-8 buffer (`encodeInto`, then `lua_pushlstring`);
- `lua_pcallk` with the hook armed;
- API functions as `addFunction` C closures.

`doStringSync` is used only at setup, followed by `settop`, because it
leaves its return values on the stack.

- **Matching stays in TypeScript.** Script triggers and aliases are
  compiled by the existing pattern compiler and live in a third rule
  store, `scripts`, beside `system` and `user` (ADR 0015). Lua is called
  only on a match.
  - The 500-patterns-in-Lua path measured 63–70 µs per line and is not
    used.
  - Captures are passed as positional strings, and the Mudlet-style
    `matches` table is built in the same call.
- **Synchronous.** Only engine creation is async. Every call on the line
  path is synchronous, so gag and substitute from Lua apply to the line
  being processed.
- **Lines before the engine is ready.** Script rules register only once
  the engine is up, at most about 60 ms after the enabled list is read.
  Lines that arrive before that do not run scripts.

### GMCP and events

- Lua sees a global `gmcp` table, as in Mudlet. It is updated by the
  host for each received message, as a raw-built table (about 2 µs per
  message).
- Event handlers get the event name and its arguments. GMCP events are
  named `gmcp.<Package>.<Message>`.

### Panes and runs

- A script pane is a cell grid of styled spans, gauges and link ranges.
  It is drawn by the existing pane frame and grid code, never with HTML.
- Pane updates are recorded in the run capture as pane-content events,
  one snapshot per changed frame, coalesced to at most one per animation
  frame. The log player and the HTML replay draw them like built-in
  panes without running Lua.

### Storage and files

- New IndexedDB store `scripts` (DB version bump): a user script record
  holds id, name, source, enabled, created and updated.
- Script settings and `store` data live in a separate `scriptData`
  store, keyed by script name, so that a bundled script can be replaced
  without losing them.
- **Bundled scripts** ship as `.lua` files in the build and are
  read-only. Enabled state and settings are kept per name. *Duplicate*
  creates a user script named `<name>-copy`.
- **Export and import:** one `.lua` file per script. Its header carries
  the metadata (`@name`, `@summary`, `@api`, `@setting`, `@help`). Import
  shows the code and a warning that the script can send commands to the
  game.

### `#script` and `#lua`

- `#script <sub> …` with a known subcommand (`list`, `help`, `set`,
  `enable`, `disable`, `reload`) acts on the library.
- Any other form keeps today's inert behaviour and editor hint, so
  pasted tt++ `#script {var} {shell}` lines stay harmless.
- `#lua {name} {function} {args…}` calls a function the script has
  exported with `export(name, fn)`. Other `#lua` forms stay inert.

## Consequences

- One shared wasm instance costs about 4–6 MB of memory once any script
  is enabled.
- A script can still `send` anything the player could type. This is
  accepted: automation is the player's responsibility (intent
  non-goals). The import warning names it.
- The API becomes a contract once scripts are shared. `@api 1` lets a
  later breaking change detect old scripts and refuse them clearly.
- Fallback if wasm becomes a problem: fengari (Lua 5.3, pure JS,
  65 KB brotli, slower). It is not planned.
