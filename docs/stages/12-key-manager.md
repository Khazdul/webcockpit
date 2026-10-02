# Stage 12 — Key manager

> Status: In progress (round 1 built 2026-10-02).
> Source: intent Goal 10, spec §2.10 (bundled scripts), ADR 0051,
> ADR 0053, ADR 0054.

## Goal

The bundled key manager script captures, stores and uses port keys
(the keys `locate life` gives for `teleport`, `portal`, `scry` and
`watch room`) in a pane. It follows the owner's Mudlet "Port Key
Library", is at least as good as Cockpit's key manager, and is polished
over as many owner test rounds as it needs.

## Scope

In: the key manager script (library, locate capture, pick list, casts,
safe key, `$name` in commands) and any script API additions it needs.

Later round (owner, 2026-10-02): the TV view of `scry` and `watch room`
output, as temporary panes, once the rest is verified.

## Starting points

- Mudlet reference (read only, never copy):
  `notes/research/mudlet-portkeys/extracted.md` (triggers, aliases and
  scripts of Port Key Library v1.1.1, extracted from the package in the
  same folder).
- Cockpit reference (read only, never copy):
  `/home/ole/MUME/lua/scripts/keymanager.lua`,
  `/home/ole/MUME/docs/keymanager.md`, Cockpit ADRs 0131 and 0132.
- Real locate output: `/home/ole/MUME/data/runs/Gittan/2026-09-19T21-35-58.log`
  (lines 618–627, 5572–5577):

  ```
  > locatel
  [cast n 'locate l']
  You start to concentrate...

  Gittan - On a hill  Very near  key: 'uxevjobve'

  !( Mana:Burning>
  ```

  and `Your mind fails to locate any such creature.` for no match.
- The bundled mercenaries script and its tests are the pattern for a
  bundled script with a pane (`src/scripts/bundled/mercenaries.lua`,
  `tests/unit/scripts-mercenaries.test.ts`, `tests/e2e/mercenaries.spec.ts`).

## Owner decisions

- 2026-10-01: key manager uses a pane and takes inspiration from the
  owner's Mudlet reference script.
- 2026-10-01: its own stage, so it can be polished over several rounds
  without holding back stages 10 and 11.
- 2026-10-02: build on the Mudlet script rather than Cockpit's, and make
  it better.
- 2026-10-02: the key library is **per character**: in MUME a key is
  unique to the character that located it, and it stops working after
  12 hours.
- 2026-10-02: Ctrl+S teleports to the safe key, Alt+S teleports quickly
  (`cast q`), as in Mudlet.
- 2026-10-02: several locate hits open a pick list in a temporary pane
  (click a row, or Alt+arrows and Alt+Enter).
- 2026-10-02: TV (scry and watch room output) waits for a later round,
  as temporary panes.

## Design (round 1)

Details and reasons in ADR 0054.

- **Commands** keep the Mudlet names:
  - `keys` shows or hides the Keys pane;
  - `locatel <name>` casts `locate life` on yourself and stores the
    room's key as `<name>`;
  - `locatel <target> <name>` casts it on a target: one hit is stored,
    several open the pick list;
  - `kpick` reopens the last pick list; `kpick <n> <name>` stores hit
    `n` of the last locate (also one cast by hand);
  - `nkey <name> <key>` adds a key by hand;
  - `rkey <name> <new>` (also `krename`) renames, `dkey <name>` deletes,
    `skey <name>` sets the safe key (`skey` alone names it);
  - `teleport <name>`, `portal <name>`, `scry <name>`, `watchr <name>`;
  - `tsafe`, `qtsafe`, `psafe` cast teleport, quick teleport and portal
    to the safe key; Ctrl+S and Alt+S are `tsafe` and `qtsafe`.
- **`$name`** in any typed command is replaced by that key, e.g.
  `cast 'teleport' $home`. Unknown names pass through untouched.
- **Keys** are per character, live 12 hours (setting), names at most 10
  characters. The first key becomes the safe key; when the safe key
  expires or is deleted the freshest live key takes over, announced
  once.
- **Pane:** a row per key with the safe marker, name, room type, key and
  time left, and clickable letters for teleport, portal, scry, watch and
  delete. Clicking the marker makes a key the safe key.
- **Pick list:** a temporary pane listing mob, room type, distance and
  key; the stored or already-known keys are marked.

## Tasks

- [x] Receive and study the Mudlet reference script
      (`notes/research/mudlet-portkeys/`).
- [x] Owner decisions for round 1.
- [ ] Build `keymanager.lua` and any API additions (ADR 0054).
- [ ] Unit and e2e tests; full verification.
- [ ] Test guide; owner test round 1.
- [ ] Later round: TV for scry and watch room.

## Test guide

Filled in when round 1 is built.

## Owner feedback

None yet.
