# Stage 12 — Key manager

> Status: Next (after stage 11). Blocked on the owner's Mudlet
> reference script.
> Source: intent Goal 10, spec §2.10 (bundled scripts), ADR 0051.

## Goal

The bundled key manager script keeps track of keys and doors in a pane
and is at least as good as Cockpit's key manager, drawing on the owner's
Mudlet reference script. It is polished over as many owner test rounds
as it needs.

## Scope

In: the key manager script and any script API additions it needs.

## Starting points

- Behaviour reference (read only, never copy):
  `/home/ole/MUME/lua/scripts/keymanager.lua` and
  `/home/ole/MUME/docs/keymanager.md`.
- The owner's Mudlet reference script goes into `notes/research/` when
  it is shared.
- Builds on the stage 11 pane API.

## Owner decisions

- 2026-10-01: key manager uses a pane and takes inspiration from the
  owner's Mudlet reference script.
- 2026-10-01: its own stage, so it can be polished over several rounds
  without holding back stages 10 and 11.

## Tasks

- [ ] Receive and study the Mudlet reference script
      (`notes/research/`).
- [ ] Plan and build; test guide; owner test rounds.

## Test guide

Filled in when the stage is built.

## Owner feedback

None yet.
