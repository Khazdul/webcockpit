# Stage 11 — Script panes

> Status: Next (after stage 10).
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

## Tasks

- [ ] Plan the packages once stage 10 is done; API changes from
      stage 10 feedback.
- [ ] Script panes on the docking engine (spans, gauges, links,
      tooltips, resize).
- [ ] Run capture, log player and HTML replay.
- [ ] Bundled mercenaries.
- [ ] Verify; test guide; owner test.

## Test guide

Filled in when the stage is built.

## Owner feedback

None yet.
