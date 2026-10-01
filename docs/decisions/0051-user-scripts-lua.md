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

## Package notes

### P0 — Lua runtime (2026-10-01)

**Module** `src/lua/`: `index.ts` (public surface), `load.ts` (lazy
loader), `runtime.ts` (engine, scripts, bridge), `sandbox.ts` (setup
chunk and `<close>` scan), `raw.ts` (C API types), `wasm-url.ts`.
Import it dynamically; nothing in the cold-start chunk may import it.
The build emits `assets/glue-<hash>.wasm`, a ~110 KB wasmoon chunk and
a ~14 KB runtime chunk, none preloaded.

```ts
const rt = await loadLuaRuntime();          // one per app
rt.defineFunction('send', (a) => { send(a.string(1)); });
rt.setGlobal(['gmcp', 'Char', 'Vitals'], msg); // into the shared base
const r = rt.loadScript('looter', source);  // LoadResult
if (r.ok) {
  const res = r.script.call(ref, line, cap1); // CallResult
  r.script.release(ref); r.script.unload();
}
```

- `LoadResult`/`CallResult`: `{ ok: true, … }` or `{ ok: false, kind,
  message }`, `kind` one of `syntax` (load only), `error`, `budget`,
  `memory`. Messages start `<name>:<line>:` when Lua knows the line.
  After `budget` or `memory` the caller disables the script; the
  runtime itself stays usable (tested).
- `defineFunction(name, impl)`: a C closure in the shared base.
  `impl(args)` reads arguments with `args.string/optString/number/
  optNumber/boolean/function/optFunction/table/value/type/count` and
  returns one value or `undefined`. Any JS exception becomes a Lua
  error at the caller's line (`bad argument #1 to 'send' (string
  expected, got nil)` for the checked readers).
- `args.function(i)` returns a `LuaRef` owned by `rt.current`, the
  script whose code is running. `unload` releases the environment and
  every reference of the script; `release(ref)` drops one.
- Values: JS strings, numbers (safe integers become Lua integers),
  booleans, null/undefined (nil), arrays and plain objects (new
  tables). Back from Lua: nil is `undefined`; a table with keys 1..n
  is an array, any other an object; functions read as `undefined`.
  Nesting is limited to 32 levels.
- Host functions may call back into Lua (`script.call` inside `impl`);
  nested calls share the outer call's budget.
- `stats()`: stack top (constant between calls), heap bytes, script
  count and `direct` (see below).

**Decisions.**

- *Read-only proxies are shared, not per script.* Each library is one
  proxy table with `__index` to the real table, `__newindex` raising,
  `__pairs` iterating without handing out the real table, and
  `__metatable = false`. `rawset` is wrapped to refuse proxies. So a
  library cannot be changed at all; a script can only shadow a name in
  its own `_ENV`. The environment metatable (`__index` = base) and the
  string metatable are hidden the same way, so the base and the real
  `string` table are unreachable.
- *No Lua `load` at all.* Scripts compile with `luaL_loadbufferx`
  (mode `t`, chunk `@<name>`) and get their environment through
  `lua_setupvalue`. `collectgarbage` is kept by the host only (a full
  collection runs after an out-of-memory abort).
- *Budget by counting.* The hook fires every 10 000 instructions and
  aborts at the 100th fire (1 M). Re-arming on every fire keeps a
  coroutine that was poisoned in an earlier call from aborting early.
  If the budget ran out during a call, the result is `budget` even when
  the call returned normally (a host function swallowed a nested abort,
  or a tail call returned without another instruction).
- *Hook-off paths closed.* Lua runs code with hooks off while an error
  raised by the hook unwinds, until a pcall recovers. Three paths ran
  user code there and are closed: `xpcall` message handlers (`xpcall`
  is rebuilt on `pcall`, so the handler runs after the unwind),
  `__close` of `<close>` variables in a coroutine killed by the abort
  (`<close>` is refused at load, `name:line: <close> variables are not
  allowed`; a light tokenizer skips strings and comments), and `__gc`
  finalizers, which also run outside host calls (`setmetatable`
  refuses a metatable with `__gc`).
- *Memory headroom.* The 32 MB cap applies while Lua runs. Between
  calls the host pushes arguments outside any protected call, where a
  memory error would panic the state, so the cap is raised by 4 MB
  there.
- *Direct wasm exports.* The upstream build's ASSERTIONS wrappers cost
  about 30 ns per C API call. The loader wraps `WebAssembly.instantiate`
  and `instantiateStreaming` while wasmoon instantiates, keeps the
  instance's exports and restores both; the bridge calls them directly
  (falls back to the wrappers if the capture fails). The wasm file and
  wasmoon's code are unchanged.
- *Node.* The loader reads `glue.wasm` from node_modules
  (`createRequire().resolve`) when `process.getBuiltinModule` exists,
  so Vitest and `node bench/lua-bench.ts` work without Vite.

**Measured** (`node bench/lua-bench.ts`, Node 26, i7-12700H; hook
armed): engine ready 30–38 ms; trigger call with an 80-character line
and 2 captures 1.35 µs; 10-field GMCP table plus call 2.5 µs; Lua → JS
`send` 0.17 µs; runaway loop aborted after 7 ms. In the production
build: 1.26 µs (Chromium) and 1.44 µs (Firefox) for the trigger call.

**For P1.**

- Lua code runs only inside `loadScript` and `script.call`; never call
  wasmoon's wrapper (`engine.doString`, `global.get`): it bypasses the
  hook.
- A base value set with `setGlobal` is a plain table shared by every
  script: a script can modify `gmcp.Char` for the others. Rebuild it
  per message (as `setGlobal` does) or wrap it read-only if that
  matters.
- `print` is still the base function (writes to the browser console);
  redefine it with `defineFunction` to echo.
- A redefined host function keeps its old C closure alive (closures
  are never freed until `close`); define the API once.
- Known limit: one C call that runs long (a pathological Lua pattern
  such as `("a"):rep(1e5):find(".-.-.-b")`) counts as one instruction
  and is not interrupted. Only the memory cap bounds `string.rep` and
  friends.

### P1 — script API and integration (2026-10-01)

**Modules.** `src/scripts/`: `library.ts` (the library service),
`header.ts` (header parser), `bundled.ts` (bundled registry:
`src/scripts/bundled/*.lua`, none yet), `host.ts` (runtime owner and
API), `patterns.ts`, `colors.ts`, `guard.ts`, `command-rows.ts`.
`index.ts` exports the library and header only: the host is a lazy
chunk (~24 KB) that App imports when a script is enabled or `#script` /
`#lua` is typed; `src/lua` (~20 KB plus wasmoon) loads only when a
script is enabled. `src/script/script-keys.ts` holds the keys scripts
bind, for the profile editor.

**Library service for the Scripts page (P2).** The shell owns one
`ScriptLibrary` (`shell.scripts`; also `ChromeServices.scripts`) and
hands it to the cockpit App. Everything is in memory after `init()`;
reads are synchronous, writes are serial (each sees the previous one)
and go to IndexedDB before memory.

```ts
await lib.init();                        // idempotent; the others wait for it
lib.list(): ScriptInfo[]                 // sorted by name, cached until a change
lib.get(name): ScriptInfo | null
lib.subscribe(fn): () => void            // after every change, incl. errors
lib.enabledNames(): string[]
lib.settingsOf(name): Record<string, number | string | boolean>
await lib.create(name?, source?)          // disabled; template when no source
await lib.save(name, source)              // → { name, warnings }; may rename
await lib.rename(from, to); await lib.remove(name)   // user scripts only
await lib.duplicate(name)                 // → `<name>-copy`, settings copied
await lib.importFile(fileName, text)      // → ScriptInfo, disabled
lib.exportFile(name)                      // → { fileName: '<name>.lua', text }
await lib.setEnabled(name, on)            // global; the host follows
await lib.setSetting(name, setting, text) // → { ok, value } | { ok: false, reason }
```

`ScriptInfo`: `name`, `bundled`, `readonly` (= bundled), `source`,
`header` (`name`, `summary`, `api`, `aliases[{name,text}]`,
`keys[{key,text}]`, `settings[{name,type,default,label}]`,
`help[]`), `problems` (bad header lines), `loadProblem` (`@api`),
`enabled`, `lastError` (`<script>:<line>: <message>`, memory only),
`settings` (current values, defaults filled in), `created`, `updated`.
Errors the UI should show come as `ScriptError` (user-facing message).
`scriptNameError`, `uniqueScriptName` and `scriptTemplate` are exported
for the name prompt and *New*. `App.scriptHost()` resolves to the
running host (`isRunning(name)`, `running()`, `reload(name)`) for a
"running" mark; P2 should not need more.

**Decisions.**

- *Names.* A letter, then letters, digits, `_` or `-`; at most 32;
  unique across bundled and user scripts. The header's `@name` is the
  name: `save` renames to a new valid, free `@name` (else keeps the name
  and returns a warning); `rename`, `duplicate` and `importFile` rewrite
  the `@name` line (`withHeaderName`). A user script whose name a later
  release's bundled script takes is renamed `_2` at `init`.
- *Header.* The leading run of `--` lines (blank lines allowed, a
  `--[[` block ends it). Unknown tags are ignored; `@help`, `@alias`,
  `@key` repeat. `@setting name type default ["label"]`; booleans take
  true/false/on/off/yes/no/1/0. A bad `@setting` line is a `problem`
  and skipped.
- *Load policy.* A script with a missing or other `@api`, a syntax
  error or an error in its main chunk stays enabled, is not running, and
  shows `lastError` (UI message too). It is tried again when its source
  changes or on `#script reload`. A budget or memory abort while loading
  turns it off.
- *Error policy.* Every failed call → UI error message and
  `lastError`. A budget or memory abort, a call slower than 1 s
  (`SLOW_CALL_MS`), or 5 errors within 10 s → the script is unloaded at
  once and turned off in the library, with a warn message. An error
  message without a line (a tail call into the pattern guard) gets
  `<script>:` in front.
- *Rule store `scripts`.* Triggers and aliases are native rules with a
  `CompiledPattern` built in `patterns.ts` (`RuleStore.defineCompiled`,
  key `<script>#<id>`): `tempTrigger` is a literal substring,
  `tempRegexTrigger`/`tempAlias` a JavaScript RegExp (Mudlet uses
  PCRE). A regex keeps a literal for the gates when one is certain
  (longest plain run, none with `|` or a negative lookaround). Aliases
  are not anchored for you (Mudlet). `ruleOrder` puts script rules after
  system and profile rules of the same priority, so a profile alias or
  macro wins a tie however the two were loaded; script rules use the
  default priority 5. Keys are one `macro` rule per key in the store,
  dispatching to the newest script binding; engine order is user,
  scripts, system. Scripts cannot bind keys that type text (profile
  macros can, ADR 0026), nor keys `keyBindability` refuses.
- *Line edits.* While a line runs its actions, handlers write into
  `engine.lineEdit()`: `deleteLine` gags, `replaceLine(text)` (cecho
  colours) replaces the displayed text, and the profile's substitutes,
  gags and highlights then apply to the new text; `highlight(colour[,
  text])` colours the whole line or each occurrence of `text`, applied
  last. Outside a line (timer, key) they do nothing. `echo`/`cecho`/
  `print` during a line are shown after it; elsewhere at once. Echoes
  are `text.display` with `local: true`: no actions, not captured.
- *Handlers.* `matches` (Mudlet: `matches[1]` the whole match, then the
  groups; '' for an unmatched group) and `line` are set in the script's
  own environment before each trigger call (`LuaScript.setEnv`, two
  rawsets). Aliases also get `command` (= `line`, the typed command).
  An alias consumes the command unless its handler returns `false`;
  then the next alias may take it, else it is sent.
- *API details.* `send` goes to the game without aliases; `expandAlias`
  runs the text like a rule body (profile and script aliases, `;`, `#`
  commands). `print` echoes its arguments tab-separated (nil, booleans
  and tables by type name). `uiMessage(source, text)` is an `event`
  line `▶ SOURCE: text`. `getVariable` returns nil when unset;
  `setVariable` sets a profile variable like an action does (write-back
  of declared variables only). `export(name, fn)` + `#lua {script}
  {name} {args…}` calls `fn(args)` with the arguments joined by spaces
  (none: no argument). `tempTimer(seconds, fn, true)` repeats (50 ms
  minimum), else fires once; timers are the store's tickers and
  delays.
- *Events.* `registerAnonymousEventHandler(name, fn)`; names match
  case-insensitively. `gmcp.<Package>.<Message>` handlers get the event
  name twice (Mudlet); `sysLoadEvent` fires once for the script right
  after it loads; `sysConnectionEvent` on login after connecting,
  `sysDisconnectionEvent` (with the reason) on a disconnect; the
  curated `#event` names (`SESSION CONNECTED`, `IAC SB GMCP <Pkg>` …)
  come from the engine's event tap with the `#event` arguments. Any
  other name is accepted and never fires (no `raiseEvent` in API 1).
- *`gmcp` and `state` are read-only views* (`LuaRuntime.defineView`):
  the host writes into a hidden data table with `setData`; scripts see
  deep read-only proxies (cached per table), so no script can change
  another's view. GMCP objects merge key by key into the last value of
  their package (MUME sends partial `Char.Vitals`), a JSON `null`
  removes a key; other values replace. `gmcp` is cleared on each new
  connection. Messages before the runtime is up are kept and filled in.
  `state.char` = `{ name, fullname, vitals, status }` from the
  character tracker, `state.group` = members `{ id, type, name, label,
  hp, mana, mp }` (each `{ value, max, word }`), `state.room` = the
  merged `Room.Info`.
- *`settings`* is a frozen per-script environment value, replaced when
  `#script set` changes it. *`store`* is a read-only table of two host
  functions; values are deep-copied in and out, `store.set(k, nil)`
  removes; written to `scriptData` about 1 s later and on page hide.
- *`#script` / `#lua`.* `scriptCommandArgs` (commands.ts) decides the
  forms: `#script` with `list|help|set|enable|disable|reload`, `#lua`
  with at least two arguments. Others stay inert with the hint, also in
  the editor's syntax hints. Neither runs while a profile loads (a
  warning). The output of `list` and `help` is styled rows in the game
  pane, like `#help`.
- *Pattern guard* (sandbox): `string.find/match/gmatch/gsub` refuse a
  search with k ≥ 2 `.`-items quantified by `*`, `+` or `-` when
  n^k/k! > 1e8 for an n-byte subject (n ≥ 64); plain `find` never.
  Ordinary patterns (`(.-) tells you '(.-)'` on any game line) are never
  refused; `("a"):rep(3000):find(".-.-.-b")` is refused at once instead
  of running for a minute.
- *Hang guard* (`guard.ts`): a `localStorage` marker
  `wc.scripts.running` with the running script's name. Calls write it
  when the first call of a task starts (and when another script's call
  starts) and remove it in a microtask, so a task costs one `setItem`
  and one `removeItem`. Loads pin the marker and yield a task first,
  which makes the mark durable even where storage commits at the end of
  a task (Firefox), so a script whose main chunk or `sysLoadEvent` hangs
  is caught everywhere. A call that hangs inside a later task is caught
  only where the write leaves the page at once (expected in Chromium,
  not verified in a real hang); in Firefox, which commits at the end of
  a task, only the slow-call check (after the browser's "Stop script")
  covers it. On the
  next start the named script is turned off with a UI message; the
  others load.

**Measured** (`node bench/script-bench.ts`, 93 883 lines of a real
log, 500 profile rules + system rules): 14.4–14.5 µs per line without
scripts (unchanged from before P1), 15.3–15.5 µs with a script of five
triggers, a regex alias and a gag (8 421 Lua calls per pass, 9 % of
lines): +0.8–1.0 µs per line, budget 200 µs. Key path unchanged
(macro → alias → send 1.0 µs).

**For P2 / later.**

- Panes (`createPane`) are stage 11: the seam is the API definition in
  `ScriptHost.defineApi` and an owner's registry (add `panes` to
  `Owner` and release them in `release`).
- `#script` output is plain styled rows; P2's help view can reuse
  `helpRows` from `command-rows.ts` or build its own from `ScriptInfo`.
