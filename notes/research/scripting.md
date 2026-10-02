# User scripts — brainstorm outcome

Date: 2026-10-01. Source: conversation with the owner. Not authoritative;
the spec section and ADRs written from this note are.

## Why

Cockpit (`/home/ole/MUME/lua/scripts/`) had opt-in Lua scripts: autostab,
autobow, coinlooter, keymanager, mercenaries. Lessons from them:

- Scripts built tt++ command strings that called back into Lua
  (`#action {...} {#lua {scripts.x.on_y()}}`): fragile and hard to read.
- Every script cleaned up its own triggers, delays and subscriptions;
  forgetting one leaked rules.
- No sandbox: full `io`/`os`.
- Good idea worth keeping: metadata in a comment header (`@summary`,
  `@alias`, `@help`).

Mudlet is the better model: triggers, aliases, timers and keys are
registered as Lua functions, events via `registerAnonymousEventHandler`,
packages are shareable.

## Owner decisions (2026-10-01)

1. **In scope**, after v1, as its own stage. Requires an intent change
   (scripts were a non-goal).
2. **Panes:** text lines, gauges, clickable rows and clickable single
   cells (characters). TUI only, no HTML.
3. **Library:** scripts are a separate library beside the profile.
   - Menu: *Scripts* directly under *Profile*.
   - Scripts page: list on the left (name, enable/disable toggle, *Edit*
     button). The right side shows the selected script's help
     (description), like Cockpit's launcher Scripts view but nicer.
   - *Edit* opens the script editor full screen (like the profile's
     EDITOR view).
   - Testing a script against a recorded run: interesting, not a
     priority.
4. **Bundled scripts:** equivalents of keymanager, coinlooter and
   mercenaries. Keymanager and mercenaries use panes. Keymanager draws
   on a Mudlet reference script the owner will share. Scripts are
   exported and imported as files, like profiles.
   - A. Enable/disable is **global** (not per profile).
   - B. Bundled scripts are read-only and update with each release;
     *Duplicate* makes an own copy that is never overwritten.
   - C. Script panes are recorded in runs and appear in the log player
     and HTML export like other panes.
   - D. API takes inspiration from Mudlet names and syntax where
     relevant and nothing is lost by it. No Geyser.
   - E. Settings: declared in the header (`@setting name type default
     "label"`), changed by command (`#script set <script> <name>
     <value>`), stored apart from the code so bundled scripts keep
     updating. No settings form.
   - F. Help: `@help` is shown on the Scripts page and printed in game
     by `#script help <name>`, so new players can use scripts without
     reading code.

## Technical direction (to be fixed in ADRs)

- **Language:** Lua 5.4 via WebAssembly (wasmoon), lazy-loaded only when
  a script is enabled. Synchronous on the main thread, so gag and
  substitute decisions from Lua stay in the line pipeline.
- **Sandbox by construction:** only the exposed API exists. No storage,
  network, DOM or password access. Instruction budget aborts runaway
  loops. The remaining risk is `send()`; import shows the code and a
  warning.
- **Matching stays in TypeScript.** Lua is called only on a match, so
  non-matching lines cost nothing extra.
- **Ownership:** everything a script registers (triggers, aliases, keys,
  timers, event handlers, panes) belongs to it and is torn down on
  disable or save. Hot reload follows.
- One file is one script; no `require` between scripts at first.
- `@api 1` in the header versions the API contract.
- Script and profile rules share the priority model and fan out.
- Errors go to UI messages with script name and line; a script that
  keeps failing is disabled.
- Script keys appear in the profile editor's macro conflict warning.
- `#lua {…}` (today inert) can become a bridge from the profile.

## API sketch (not final)

```lua
-- @name     autostab
-- @summary  Backstab-and-escape loop
-- @api      1
-- @setting  timeout number 10 "Seconds idle before stopping"
-- @help     ...

alias("^as([nesudw])$", function(m) ... end)
trigger("^You failed to escape the fight!$", function(line) ... end)
key("F5", function() ... end)
on("gmcp.Char.Vitals", function(v) ... end)
timer.after(settings.timeout, fn)
send("flee"); echo("<F9AA8B7>## AUTOSTAB:<099> ...")
local p = pane { id = "mercs", title = "Mercenaries", dock = "right" }
p:line(...); p:gauge(...); p:on_click(row, col, fn)
```

## Open

- Spike: wasmoon size, startup and call cost against spec §1.3.
- Keymanager waits for the owner's Mudlet reference script.
