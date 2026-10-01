# Stage 10 — Scripts

> Status: In progress (moved ahead of v1 by owner request 2026-10-01).
> Source: intent Goal 10, spec §2.10, ADR 0051. Brainstorm:
> `notes/research/scripting.md`. Spike: wasmoon 1.16.0 (numbers in
> ADR 0051).

## Goal

The owner opens *Scripts* under *Profile*, turns on the bundled coin
looter and plays with it. A new player understands it from its help
without reading code. The owner writes a small script of their own
(a trigger, an alias, a timer) in the full-screen editor, saves it, and
it works at once. A broken or runaway script is stopped and reported
without affecting play or latency.

## Scope

In: spec §2.10 except script panes, the mercenaries and key manager
scripts.

Out (stage 11): `createPane` and everything about script panes, run
capture of script panes, mercenaries. Out (stage 12): key manager.
Out for now: testing a script against a recorded run, multi-file
packages, Mudlet API compatibility beyond the names in §2.10.

## Owner decisions

- 2026-10-01: scripts are in scope (intent Goal 10), in Lua.
- 2026-10-01: panes have text, gauges, clickable rows and clickable
  single characters.
- 2026-10-01: a separate library beside the profile; *Scripts* sits
  under *Profile*.
  - The page has a list (toggle and *Edit*) on the left and help on the
    right.
  - *Edit* opens a full-screen editor.
- 2026-10-01: enable is global. Bundled scripts are read-only, with
  *Duplicate*. Script panes are part of runs and replays. The API uses
  Mudlet names where they fit.
- 2026-10-01: settings are changed with `#script set`, never in forms.
  Help is shown on the page and via `#script help`.
- 2026-10-01: bundled scripts are coin looter, mercenaries (with a pane)
  and key manager (with a pane, based on the owner's Mudlet reference
  script).

## Tasks

- [x] Brainstorm, intent Goal 10, wasmoon spike, ADR 0051, spec §2.10,
      stage file.
- [x] P0. Runtime (`src/lua/`):
  - lazy loader with the self-hosted `glue.wasm`;
  - one engine with stdlib whitelist, read-only library proxies and a
    per-script `_ENV`;
  - raw C API bridge: pcall with count hook and poison, memory cap,
    error mapping;
  - unit tests for the sandbox escapes, runaway loop, memory bomb and
    errors;
  - benchmark added to `npm run bench`.
- [x] P1. API and integration (ADR 0051 "Package notes — P1"):
  - the `scripts` rule store in the engine;
  - triggers, aliases, keys, timers and events with owner registries;
  - `gmcp` table and `state`;
  - `send`, `expandAlias`, `echo`, `cecho`, `uiMessage`;
  - `deleteLine`, `replaceLine`, `highlight`;
  - `getVariable` and `setVariable`;
  - `export` and `#lua`;
  - `settings` and `store`;
  - `#script` subcommands;
  - header parser; DB stores `scripts` and `scriptData`.
- [ ] P2. Scripts page and editor:
  - menu entry under *Profile* (start page and ESC menu);
  - list with toggle, *Edit*, lock mark, *New*, *Import* and *Export*;
  - help view;
  - full-screen CodeMirror Lua editor with API completion and hover;
  - save and reload;
  - import warning; *Duplicate*;
  - errors on the row.
- [x] P3. Bundled coin looter (ADR 0051 "Package notes — P3").
- [ ] Verify: typecheck, unit, e2e (page, editor, `#script`), and
      bench within spec §1.3 with coin looter and a test script enabled.
- [ ] Test guide filled in; owner test.

## Test guide

Filled in when the stage is built.

## Owner feedback

None yet.
