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
- 2026-10-02 (feedback round 1): renaming is done in the pane, so
  `dkey`, `rkey` and `krename` go; script panes scroll; temporary panes
  remember their place per device.

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
- **Port keys pane:** the key count and `?` (help) on top, then a row
  per key with the safe star, name, room type, key, time left, and
  clickable letters `t p s w` (teleport, portal, scry, watch room) and
  `x` (delete, click twice). Clicking a star makes that key the safe
  key; clicking a name renames it in place. A new key is highlighted for
  a few seconds. A long list scrolls.
- **Messages:** what changes in the library (stored, renewed, replaced,
  deleted, renamed, expired, safe key) is in the UI messages; casts and
  errors are `KEYS` lines in the game text.

## Plan (round 4): TV

Scry and watch room output in temporary panes, after the owner approved
round 3. Line formats come only from the Mudlet script (no MUME log has
them) and are unverified: `You feel aware of this place.` starts a
watch, its lines arrive as `[<name>] <text>`, `[<name>] Your awareness
decreases.` ends it; a scry prints `You let your inner eye find the
area... and you see:`, the room, and a blank line.

- One TV pane per key (`TV $name`), in four slots placed in the game
  pane's corners (new generic `at` values), the oldest ended one replaced
  first. Status (watching with time left, scried N ago, ended) in the
  title; the lines below, newest at the bottom, bright for 10 s then dim,
  in the game's colours (new `copy2cecho()`).
- Watch lines and the scry block are hidden from the game text (setting
  `tvgag`); the start, end and scry header become short `KEYS` lines.
- A TV closes by itself a while after its watch ends or its scry (setting
  `tvclose`); the last 250 lines per key stay in memory for `tv <name>`.
- The watch duration is learnt per character (average of the last five).
- Port keys pane: a watched key shows a red ● and the watch's time left;
  a key with TV history a dim ●; clicking it opens the TV, and `w` on a
  watched key opens its TV instead of casting again.
- Commands: `tv` (show or hide the TVs), `tv <name>`, `kecho <name>
  [rows]`.

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
- [x] Owner test rounds 1–3 (round 3 approved 2026-10-02).
- [ ] Round 4: TV for scry and watch room (plan below, ADR 0054).
- [ ] Owner test round 4.

## Test guide

### Round 3

What changed: the rename field is opaque and readable; clicking outside
it cancels the rename; `x`, the star and the letters work while a name
is being edited; `skey` is gone (click the star); safe key messages
are short ("Safe key: $home.", "Safe key is now $home ($old expired).").

Try: click a name, type, click in the game text (the row is whole
again), then `x` twice. Click a name, then click another key's star or
`t`. Rename in a light and a dark pane colour. `keys list` shows ★ on the
safe key.

Feedback wanted: is the field easy to read, and does cancelling on a
click elsewhere feel right?

### Round 2

What changed: library changes show in the UI messages; the pane is
"Port keys" without your name; click a key's name to rename it; `dkey`,
`rkey`, `krename` are gone; `#script set keymanager hours 10` redraws at
once; long panes scroll; the pick window opens at the top and remembers
where you move it.

Try:

1. Store, renew, rename and delete keys; watch the UI messages pane.
2. Click a name, type a new one, Enter; try a taken or bad name; Esc.
3. `#script set keymanager hours 10`: the times change at once.
4. Store enough keys that the pane overflows: scroll it with the wheel
   or touchpad; click the `↓ N more rows` / `↑ N rows above` row.
5. Move the pick window, close it, cast another locate: it opens where
   you put it. Options → Panes → General → Reset layout puts it back.
6. The mercenaries pane still follows `#script set mercenaries cost 20`.

Feedback wanted: are the UI messages the right ones (too many, too
few)? Does renaming in place feel right? Is the pick window's default
place (top of the game text) good?

### Round 1

Open WebCockpit, connect to MUME, log in, and type
`#script enable keymanager`. The Keys pane appears on the right.

Try:

1. `locatel home` where you stand. The key is stored at once,
   highlighted in the pane, and is your safe key (★).
2. `cast n 'locate life'` by hand. The pick window opens with a
   suggested name selected: type a name, press Enter.
3. `locatel <someone> <name>`, or a locate of a creature with several
   hits: Up/Down, Enter; also click a row, double click, `[ OK ]`, Esc.
   Type a name that exists and see `replaces`.
4. Point at and click the pane's letters `t p s w`, the `x` (twice), a
   star. `teleport <name>`, `scry <name>`, `watchr <name>`.
5. Ctrl+S and Alt+S (safe teleport, quickly). `cast 'teleport' $home`.
6. Log in another character: its keys are separate.
7. `keys help`, `skey`, `nkey`.

## Owner feedback

### Round 1 (2026-10-02)

1. UI messages are missing: a key added (stored, renewed, replaced),
   deleted, renamed or expired, and a safe key change, should show in
   the UI messages.
2. The pane title should be "Port keys".
3. Clicking a key's name in the pane renames it inline: the name becomes
   a text field, prefilled and selected; Enter validates and renames
   (error inline, field kept), Esc cancels. Hint: "Click to rename".
4. No hint on the time-left column.
5. `#script set keymanager hours 10` does not update the pane until the
   next locate: a setting change must redraw at once.
6. Script panes cannot be scrolled when the content does not fit: make
   them scroll like the built-in panes, with a `createPane` option for
   where the view sticks (bottom like a console, or top like a list).
7. Remove `dkey`, `rkey` and `krename`: the pane does this now. Keep
   `nkey`.
8. Remove the character name at the top left of the pane.

9. (2026-10-02, approved) Temporary panes remember where the user puts
   them, per device; a script can give a default place (`at`); they
   stay floating.

The owner started a thought about the pick window but did not finish
it; the pick window is otherwise unchanged for now.

Done in round 2 (ADR 0054 "Feedback round 1", ADR 0053 addendum):
library changes are UI messages; the pane is "Port keys", lists from the
top and scrolls; a click on a name renames it in place; no hint on the
time left; `sysSettingChanged` redraws at once (mercenaries too);
`dkey`, `rkey` and `krename` are gone; no character name in the header;
temporary panes open at `at` and remember their place per device (Reset
layout forgets it); the pick window opens at the top.

### Round 2 (2026-10-02)

1. The rename field shows the old name through it (`$deerpopop` over
   `$deer`), hard to read. Generic: a field must be opaque, the cells
   under it not drawn, its text clearly readable with a visible caret,
   in light and dark tints.
2. Clicking outside a rename field leaves the row stuck (grey text on
   another background, the key cannot be deleted). Generic: `onBlur` for
   fields, never a half state; the key manager cancels the rename on
   blur, and the row's other actions always work (cancelling a rename
   first).
3. Remove `skey`: the safe key is set only with the star in the pane.
4. A safe key change in the UI messages names only the key, no keys to
   press: "Safe key: $home.", or after an expiry or a delete "Safe key
   is now $home ($old expired)."

### Round 3 (2026-10-02)

Approved ("ser bra ut"). Next: round 4, the TV.

Verified by the owner in live MUME (2026-10-02): `cast q 'teleport'` is
accepted, and long creature and room names cause no problems. The
failure lines that cancel a cast are still unverified.
