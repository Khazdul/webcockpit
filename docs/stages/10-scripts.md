# Stage 10 — Scripts

> Status: Owner testing (moved ahead of v1 by owner request 2026-10-01).
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
- [x] P2. Scripts page and editor (ADR 0051 "Package notes — P2"):
  - menu entry under *Profile* (start page and ESC menu);
  - list with toggle, *Edit*, lock mark, *New*, *Import* and *Export*;
  - help view;
  - full-screen CodeMirror Lua editor with API completion and hover;
  - save and reload;
  - import warning; *Duplicate*;
  - errors on the row.
- [x] P3. Bundled coin looter (ADR 0051 "Package notes — P3").
- [x] Verify: typecheck, unit, e2e (page, editor, `#script`), and
      bench within spec §1.3 with coin looter and a test script enabled.
- [x] Test guide filled in.
- [ ] Owner test.
- [x] Feedback round 1 (2026-10-02):
  - [x] drop the `#script help` note from the help view;
  - [x] `#help script` (also `scripts`, `lua`, `#script`, `#lua`);
  - [x] Ctrl+F find and replace (script editor and EDITOR view);
  - [x] live errors: header and compile-only syntax checks while
        typing, runtime errors on their line, syntax check of scripts
        that are off on the Scripts page;
  - [x] MANUAL replaces CLOSE; script manual (guide and A–Z API
        reference) from the editor (MANUAL, F1) and the Scripts page;
  - [x] native pixel scrolling in the HELP view and the manual;
  - [x] native scrolling on About, History/Profiles tables, Statistics,
        the Scripts list, help and import view, the LITE list and the
        export editor. Left (owner decision): the log player's paused
        wheel cursor (Inv §7.5);
  - [x] native pixel scrolling in the Comm, UI and Timers panes (owner
        decision 2026-10-02, ADR 0052; amends Inv §2.4, §2.6.1, §2.7.5).

## Test guide

**Start:** `cd ~/proj/webcockpit && npm run dev` (restart it if it was
already running), then open http://localhost:5173/. Firefox and
Chromium.

1. **Find the page:** start page → *Scripts* (the row under *Profile*);
   also ESC in game → *Scripts*. Is the place and the layout right? The
   list sits left of the help, and the block is centred like the Profile
   page. Say if you want it pinned to the far left instead.
2. **Read the help:** select `coinlooter` (lock mark = bundled). The
   right side shows summary, alias, help text and each setting with its
   `#script set` command. Would a new player understand it? Is anything
   missing or too much?
3. **Coin looter in play:** toggle it on (`[X]`), log in, kill
   something. It should send `get coins all.corpse` (or `get all.coins`
   after an undead) and hide "You can't find any coins". Kills by
   players outside your group are left alone. Try `cl`, `cl off`,
   `cl on`, `cl now`. `cl off` should still be off after a reload.
   `#script help coinlooter` prints the help in the game output.
4. **Settings:** `#script set coinlooter delay 0.5`, then
   `#script set coinlooter quiet off`. Check that the help view shows the
   new values.
5. **Your own script:** *NEW*, give it a name, and the editor opens full
   screen with a template. Try something like:

   ```lua
   tempTrigger("You are hungry.", function() send("eat bread") end)
   tempAlias("^hi$", function() send("say hello!") end)
   registerAnonymousEventHandler("gmcp.Char.Vitals", function()
     -- runs on every vitals update; gmcp.Char.Vitals.hp etc.
   end)
   tempKey("F9", function() cecho("<green>F9 from Lua<reset>") end)
   ```

   Ctrl+S saves. Toggle it on from the list (or `#script enable
   <name>`). Completion: type `temp` and wait, or press Ctrl+Space.
   Hover over a function name for its help and an example. F1 opens
   the MANUAL at the function under the cursor; the MANUAL button (in
   the editor and on the Scripts page) opens it at the start. ESC goes
   back to the editor as you left it.
6. **Find:** Ctrl+F in the editor opens the find panel at the bottom:
   Enter/F3 next, Shift+Enter/Shift+F3 previous, Ctrl+H to the replace
   field (Enter replaces, ALL replaces all), Alt+C/W/R case, word,
   regex. ESC closes the panel; a second ESC leaves the editor. The
   profile editor's EDITOR view has the same panel.
7. **Errors while typing:** delete a `)` or an `end`. About 0.3 s
   later the line gets a red dot, a red band and an underline; hover
   for the message; the status row shows it. Fix it and the mark goes,
   without saving. Remove the `-- @api 1` line: a header error. A
   script that is off with a syntax error shows it in red under its row
   on the Scripts page.
8. **Runtime errors:** put a typo in a call (`sendd("x")`), save, and
   trigger it. The error shows on the script's row, in UI messages and,
   in the editor, on its line (dashed, "Runtime error (saved
   version)"). It goes when you edit that line or save. `while true do
   end` in a trigger is stopped, and the script is turned off.
9. **`#help script`** in game explains `#script` and `#lua`.
10. **Scrolling:** the wheel and the touchpad scroll HELP, the MANUAL,
    About, History, Profiles, Statistics, the Scripts page and the export
    editor smoothly, by pixels, like the EDITOR. The side panes and the
    paused log player still step by rows (tell us if they should change).
11. **Duplicate:** EDIT on `coinlooter` opens read-only; DUPLICATE gives
   an editable `coinlooter-copy`. Export and import a script as `.lua`
   (import shows a warning first).

**Feedback wanted:** layout and look of the page and the editor; the
help text of coin looter; whether coin looter behaves right in real
play; anything about the API that felt odd while writing your own
script.

## Owner feedback

Round 1 (2026-10-02):

1. The help view's "#script help <name> shows this in the game" note is
   not needed.
2. `#help script` is missing.
3. Ctrl+F in the script editor should open our own find (and replace),
   not the browser's, which cannot search the editor.
4. Errors should show live in the editor while typing (syntax and
   header), for scripts that are on and off; runtime errors of the
   running script on their line; code still applies only on Ctrl+S.
5. Remove CLOSE from the script editor (ESC closes); a MANUAL button in
   its place.
6. A full script manual in the spirit of Mudlet's, in the HELP view's
   layout, from the editor and the Scripts page; richer hover and
   completion; F1 at the name under the cursor; `#help script` points to
   it.
7. Scrolling with the wheel or touchpad should feel like the EDITOR
   everywhere (native pixels, no row steps); HELP was the example.
   Decision 2026-10-02: the Comm, UI messages and Timers panes too
   (ADR 0052); the log player's paused wheel cursor stays.
