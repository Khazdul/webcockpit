# 0120 — GMCP Group.*: NPCs are room-scoped, players are not

- Status: Accepted
- Date: 2026-11-04
- Supersedes: the "room-scoped" statements about `Group.*` in ADR 0018
  (run log composition), ADR 0020 ("Unverified without live GMCP"), ADR
  0053 and the stage 4 and 9 files, all inherited from Cockpit's ADR 0096.
- Related: `notes/research/gmcp-group.md` (evidence and open questions),
  Inv §2.3 and §8.2.

## Context

From stage 4 on, WebCockpit's docs said that MUME's `Group.*` reports
only the group members in your room, players and NPCs alike, and the
in-app script manual taught script authors the same. The owner's run
exports and MUME's `help gmcp group` show otherwise:

- A grouped NPC gets `Group.Remove` when you leave its room and
  `Group.Add` when you meet again.
- A grouped player stayed in the set while the owner walked four rooms
  away and back: no Remove, no Add. Every member carries `mapid` and
  `room`, which is how the map shows player group mates in other rooms
  (owner-confirmed).
- MUME's help lists fields our docs left out (`position`, `room`,
  `mapid`, eleven status flags) and two more player types, `enemy` and
  `neutral`, besides `ally`.

## Decision

- The docs describe `Group.*` as: **NPC members only while they are in
  your room; player members wherever they are.** `mapid` gives where.
  The full field list and the open questions live in
  `notes/research/gmcp-group.md`.
- A player is any member whose `type` is not `you` or `npc`.
- No code behaviour changes now. The Group pane and the map already
  keep whatever MUME sends. The `type === 'ally'` tests (Show players,
  run log composition) and the unused fields are inputs for the owner's
  Group pane review.

## Consequences

- The inventory, spec §2.4, the MMapper research note, the `group.ts`
  header, the script manual and the API reference now say this.
- The older ADRs and stage files are left as written (append-only). This
  ADR supersedes them on this point.
- The still-open points (player movement updates while apart, leaving
  the group, id reuse, `ride`, `enemy`/`neutral`) need a live capture.
