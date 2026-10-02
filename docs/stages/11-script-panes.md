# Stage 11 — Script panes

> Status: In progress (started 2026-10-02).
> Source: intent Goal 10, spec §2.10 (panes, runs, mercenaries),
> ADR 0051.

## Goal

A script draws its own TUI pane that docks, floats and toggles like the
built-in panes: text, gauges, and clickable rows or single characters
with tooltips. The bundled mercenaries script shows the mercenaries'
state in such a pane, with clickable orders. Script panes appear in the
log player and the HTML replay as the player saw them.

## Scope

In:

- `createPane` and the pane methods in spec §2.10;
- placement remembered per script and pane id;
- run capture of pane content (ADR 0051);
- rendering in the log player and the HTML replay;
- the bundled mercenaries script.

Out: key manager (stage 12).

## Starting points

- Script API seam: add a `panes` entry to the host's per-script owner
  registry and release it in `release()` (ADR 0051, P1 notes).
- Behaviour reference for mercenaries (read only, never copy):
  `/home/ole/MUME/lua/scripts/mercenaries.lua` and
  `/home/ole/MUME/docs/scripts.md`.
- Every new API name goes into `src/editor/lua-api.ts` (params, returns,
  example). Completion, hover, signature help and the manual reference
  are generated from it, and a test checks it against `host.ts`.
- Carried over from stage 10:
  - the Scripts help view hides below about 70 columns;
  - the in-call hang marker is untested with a real hang in Firefox;
  - user scripts live only in IndexedDB. There is per-file export but
    no "export all" or backup; consider adding it to the runs backup
    archive or as an "export all scripts" action.

## Owner decisions

- 2026-10-01: panes have text, gauges, clickable rows and clickable
  single characters. TUI only.
- 2026-10-01: script panes are part of runs and replays.

## Plan

Four packages. P0 first; P2 and P3 run in parallel after it. Technical
decisions go into ADR 0053 (script panes), package notes per package.

- **P0 — Script panes and the API.** The docking engine, settings and
  Options learn dynamic pane ids; a `ScriptPane` draws a content model
  (styled lines, gauges, link ranges, tooltips) with the existing frame
  and cell-grid code; `createPane` and the pane methods in `host.ts`,
  owned per script and released on disable/reload; `lua-api.ts` entries
  and a manual section.
- **P1 — Runs.** A client record for script pane content (snapshots,
  coalesced per frame), the VIEW snapshot carrying script pane
  placement, and drawing in the log player and the HTML replay without
  Lua (links inert, tooltips kept).
- **P2 — Mercenaries.** Bundled `mercenaries.lua`: hire, label, group,
  contract timer, tap/pay/renew/leave, autopay, a pane with a row per
  mercenary (time gauge, state) and clickable orders. Behaviour from
  Cockpit's script and real logs, written fresh.
- **P3 — Verify.** Typecheck, unit, e2e in both browsers, bench; the
  carried-over "export all scripts"; test guide.

Main-session decisions (details in ADR 0053):

- A script pane's id is `<script>/<pane id>`. Its placement and on/off
  stay in the settings when the script stops, so it returns where it
  was; it is shown only while its script runs and has created it.
- First creation places it per `dock` (end of that dock, or an
  automatic float) with `rows`/`cols` as the wanted size.
- Running script panes appear in Options → Panes under the built-in
  panes (on/off, colour, border) and have the frame's close cross.
- API additions beyond spec §2.10: `:show()`, `:hide()`, `:visible()`
  (a script alias can toggle its pane), and `:setTitle(text)`.

## Tasks

- [x] Plan the packages (above).
- [x] P0. Script panes on the docking engine and the pane API
  (ADR 0053, package notes P0).
- [x] P1. Run capture, log player and HTML replay (ADR 0053,
  package notes P1).
- [x] P2. Bundled mercenaries (ADR 0053, package notes P2).
- [ ] P3. Verify; export all scripts; test guide; owner test.

## Test guide

Filled in when the stage is built.

## Owner feedback

None yet.
