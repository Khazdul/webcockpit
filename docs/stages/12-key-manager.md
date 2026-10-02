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
- 2026-10-02: the script catches every locate life, however it was cast;
  `kpick <n> <name>` is dropped.
- 2026-10-02: the key's name is typed in the pick window, which opens
  for every locate (except a `locatel` with a name and a single hit).
  Script panes get text fields for it (ADR 0055).

## Design (round 1)

Details and reasons in ADR 0054 (key manager) and ADR 0055 (pane text
fields).

- **Capture:** every `locate life` block, however it was cast, is gagged
  and opens the **pick window**: `Name: $[field]`, a status row and the
  hits (mob, room type, distance, key; a stored key marked `= $name`).
  The field holds the `locatel` name or a suggestion (`$hill` from the
  room type of your own room, `$warg` from the creature, or the name a
  stored key already has), selected so that typing replaces it. Up/Down
  choose the hit, Enter stores it, Esc closes; a click selects a row, a
  double click or `[ OK ]` stores. The status row says `stores`,
  `renews` or `replaces $name`, or why a name is not valid.
- `locatel <name>` / `locatel <target> <name>` cast locate life with the
  name ready; with a single hit the key is stored at once.
- **Commands** keep the Mudlet names:
  - `keys` shows or hides the Keys pane (`keys list`, `keys help`);
  - `kpick` opens the last pick window again;
  - `nkey <name> <key>` adds a key by hand;
  - `rkey <name> <new>` (also `krename`) renames, `dkey <name>` deletes,
    `skey <name>` sets the safe key (`skey` alone names it);
  - `teleport <name>`, `portal <name>`, `scry <name>`, `watchr <name>`;
  - `tsafe`, `qtsafe`, `psafe` cast teleport, quick teleport and portal
    to the safe key; Ctrl+S and Alt+S are `tsafe` and `qtsafe`.
- **`$name`** in any typed command is replaced by that key, e.g.
  `cast 'teleport' $home`. Unknown names pass through untouched; a
  profile variable of the same name wins.
- **Keys** are per character, live 12 hours (setting `hours`), names at
  most 10 characters. The first key becomes the safe key; when the safe
  key expires or is deleted the freshest live key takes over, announced
  once.
- **Keys pane:** a row per key with the safe star, name, room type, key,
  time left, and clickable letters `t p s w` (teleport, portal, scry,
  watch room) and `x` (delete, click twice). Clicking a star makes that
  key the safe key. A new key is highlighted for a few seconds.

## Tasks

- [x] Receive and study the Mudlet reference script
      (`notes/research/mudlet-portkeys/`).
- [x] Owner decisions for round 1.
- [x] Build `keymanager.lua` (ADR 0054).
- [x] Capture every locate; drop `kpick <n> <name>` (owner).
- [x] Script pane text fields, `pane:setInput` (ADR 0055); the name is
      typed in the pick window (owner).
- [x] Unit and e2e tests; full verification.
- [x] Test guide.
- [ ] Owner test round 1.
- [ ] Later round: TV for scry and watch room.

## Test guide

Round 1. Open WebCockpit, connect to MUME, log in, and type
`#script enable keymanager`. The Keys pane appears on the right.

Try:

1. `locatel home` where you stand. The key is stored at once (`KEYS
   Stored $home …`), highlighted in the pane, and is your safe key (★).
2. `cast n 'locate life'` by hand. The pick window opens with a
   suggested name selected: type a name, press Enter.
3. `locatel <someone> <name>`, or a locate of a creature with several
   hits: Up/Down, Enter; also click a row, double click, `[ OK ]`, Esc.
   Type a name that exists and see `replaces`.
4. Point at and click the pane's letters `t p s w`, the `x` (twice), a
   star. `teleport <name>`, `scry <name>`, `watchr <name>`.
5. Ctrl+S and Alt+S (safe teleport, quickly). `cast 'teleport' $home`.
6. Log in another character: its keys are separate.
7. `keys help`, `skey`, `rkey`, `dkey`, `nkey`.

Feedback wanted: does the capture catch all your locates (and nothing
else)? Is typing the name in the window quick enough, and are the
suggested names good? Is anything in the pane too cramped in your dock
width? Do the failure messages and timings match what MUME does?

## Owner feedback

None yet.
