# Stage 56 — Phone and tablet: loose ends

Status: **In progress** (started 2026-11-13).

## Goal

The second and last of the stages that finish phone and tablet (order
agreed 2026-11-13, `docs/stages/55-scrap-old-phone-layout.md`): what
stage 52 left as loose ends (its D list), the menu pages at tablet
width, which nobody has reviewed, and what stage 55 left on purpose.

## Scope

Fixed (decided 2026-11-13):

1. **The menu's status line carries the update and storage notice**
   (stage 52 D7; today it shows only in the command row).
2. **Contrast of disabled controls** (D9): "A−" at the smallest size
   and "Not connected" in Comm's reply are under 4.5:1.
3. **A refused hold on a K key still folds the keyboard** with our
   keyboard and Comm both open in portrait (stage 53e, left). Check
   what the lower box of stage 55 changed first.
4. **The menu pages at tablet width** (820 × 1180 and 1180 × 820, the
   phone's layout by ADR 0140): start page, Profile (Lite, Editor,
   Help), Import, Export, Scripts (page, editor, manual), History, run
   log, Spotlights, Credits, About, and the game's menu sheet and
   settings pages. Screenshots, obvious faults fixed, questions of
   taste listed for the owner.
5. **MUME's `opponent-hits` words** (stage 52 B1): from the owner's
   Cockpit logs under `/home/ole/MUME` (read-only), against
   `src/gmcp/bands.ts`.

Looked at, to decide in the stage:

6. The password field swap in `src/ui/input-pane.ts` (ADR 0142 §5):
   removable only if the phone's input is built with our keyboard from
   the start. A behaviour change in password handling: investigate,
   build only if clearly safe.
7. `MapPane.forwardHidden` (ADR 0142 §5).

Closed without work (2026-11-13): stage 52 D1–D4, D8, D11, D12
(accepted limits), D5 and D6 (the owner: not needed), D10 (went with
stage 55).

## Tasks

- [ ] 56a small fixes: 1, 2, 3
- [ ] 56b tablet-width review of the menu pages: 4
- [x] 5 `opponent-hits` words (not confirmable from logs; see Built)
- [ ] 6 and 7 looked at
- [ ] Closing test guide for phone and iPad, session log

## Built

### 5. `opponent-hits` words (2026-11-13): not confirmed from logs

`/home/ole/MUME` holds no session log with GMCP payloads (`logs/` has
only `debug.log` and `ui.log`; no file but docs and Lua mentions the
field). What it does show: Cockpit's `lua/core/group_collector.lua`
applies `opponent-hits` and `buffer-hits` straight onto a group
member's `hp_string`, and `docs/gmcp.md` gives them as `"healthy"`,
`"fine"`, …: the same words as `hp-string`, which is what
`src/gmcp/bands.ts` has (dying, awful, bad, wounded, hurt, fine,
healthy). That has worked in the owner's own play in Cockpit. So the
list is very likely right, but no raw packet was seen. Left as it is;
a wrong word would show as a fight card bar that does not move.

## Test guide (for the owner)

## Owner feedback
