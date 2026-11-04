# GMCP `Group.*`: what MUME actually sends

Research note, 2026-11-04. Written ahead of the owner's review of the
Group pane and other panes. It corrects an assumption inherited from
Cockpit (its ADR 0096 "room-scoped membership"). That assumption had
spread to the inventory, the spec, code comments and the in-app script
manual.

## Sources

1. **MUME's own help**, `help gmcp group`
   (<https://mume.org/help/gmcp_group>, read 2026-11-04). This is the
   authoritative list of fields and `type` values.
2. **The owner's WebCockpit run exports**:
   `~/Downloads/webcockpit-runs-2026-09-28.jsonl.gz` and
   `webcockpit-runs-2026-10-07.jsonl.gz`, characters Rasta and Gittan. They
   hold 29 `Group.Set`, 7 `Group.Add`, 4 `Group.Remove` and 257
   `Group.Update`. The members seen are one player (Orord, `ally`), a
   labeled warg (`MIN`) and two pack horses.
3. The owner's live checks. In stage 9 a group mate showed on the map
   (`mapid` confirmed). On 2026-11-04 the owner said that group members
   appear on the map in other rooms, players only.

`tests/fixtures/gmcp-demo.log` is synthetic and is not evidence.

## Messages

| Message | Body | Meaning (MUME help) |
|---|---|---|
| `Group.Set` | array of member objects | Replace the whole set. |
| `Group.Add` | one member object | A new member joins the set. |
| `Group.Update` | `{id, …changed fields}` | Only the fields that changed. |
| `Group.Remove` | bare integer `id` | The member leaves the set. |

Members are tracked by `id`. Only `id` is mandatory; every other field
is optional.

## Member fields

| Field | Type | Notes |
|---|---|---|
| `id` | number | Key for Update and Remove. |
| `type` | string | `you`, `npc`, `ally`, `enemy`, `neutral`. See below. |
| `name` | string | Player name (`"Orord"`) or the NPC's short name without its article (`"hungry warg"`, `"pack horse"`). |
| `label` | string or `0` | `0` when there is no label, else the label (`"MIN"`). Players had `0`. |
| `room` | string | Room name. |
| `mapid` | number | MUME's server room id (the same id space as `Room.Info.id`). |
| `position` | string | Seen: `standing`, `fighting`. Probably the same words as `Char.Vitals.position`. |
| `hp`, `maxhp`, `mana`, `maxmana`, `mp`, `maxmp` | number | **Players only** in the captures. NPCs carried no numbers. |
| `hp-string`, `mana-string`, `mp-string` | string (or `0`) | Band words: `healthy`, `fine`, `wounded`; `full`; `unwearied`, `steadfast`. Animals sent `mana-string: 0`. |
| `ride`, `blind`, `bashed`, `waiting`, `poison`, `slept`, `wound`, `snared`, `hungry`, `thirsty`, `sanctuary` | boolean | Status flags. Every flag except `ride` was present (`false`) on every Set/Add member. `ride` is listed by MUME but never appeared in the captures. |

### `type`

From MUME's help:

- `you`: yourself. Set/Add carried only `id`, `type` and the flags: no
  name and no vitals (those come from `Char.*`). Updates seen: `waiting`
  (92), `hungry`, `thirsty`.
- `npc`: any NPC (mount, pet, charmie, mercenary, key NPC).
- `ally`: a player of an allied (sub)race.
- `enemy`: a player of an enemy (sub)race.
- `neutral`: any other player.

Only `you`, `npc` and `ally` appear in the captures. **A player is
therefore `ally`, `enemy` or `neutral`, not just `ally`.**

### Not in GMCP

The member object has no race, class, level, leader, alignment or sex.
For another player, `type` (player or not, and the race relation) and
`name` are all you get. `Char.StatusVars` (race, level and so on) only
describes yourself.

## Which members are in the set

**NPCs: only those in your room.** In the 09-28 capture a labeled
warg (`MIN`) was fighting in "A Steep Tunnel" when Rasta fled south. The
same moment brought `Group.Remove 2`. When Rasta walked back north,
`Group.Add` re-added it with no `group` command, and it now carried
`hp-string: wounded`. While an NPC follows you, every step sends a
`Group.Update {id, mapid[, room]}` with your new room (153 such updates,
all matching your own `Room.Info.id`).

**Players: the whole group, wherever they are.** In the 09-28 capture
Rasta ran `gro orord` in "Orc Sleeping Warrens". `Group.Add` brought
Orord with full vitals and `mapid: 15653542`. Rasta then walked 4 rooms
away and back. No `Group.Remove` came, and nothing at all came for
Orord. Orord stood still, so his `mapid` stayed correct. This matches the
owner's observation that the map shows group mates in other rooms,
players only, and it matches MMapper drawing group members on rooms
other than yours.

Cockpit's ADR 0096 says the room scoping is "uniform across ally and
npc" and that ids change on every re-add. The capture above contradicts
the first claim for players. The second could not be checked: every
re-add in the captures was the only member, so it always got id 2.

### Still open (needs a capture)

- A player member moving while not in your room. We expect
  `Group.Update {id, mapid, room}`, but it has not been observed.
- When a player leaves the group, dies or quits: is it a `Group.Remove`?
- Whether an NPC that comes back gets a new id when other members exist.
- Whether `Group.Update` for a player carries numbers, band words or
  both (Cockpit's ADR 0052 assumes either half can arrive alone).
- `ride`, `enemy`, `neutral` and positions other than standing/fighting.

A capture where a player group mate walks a few rooms away (and back)
and someone then leaves the group would answer most of these.

## Consequences for WebCockpit

The code behaviour was not changed by this note. These are inputs for
the Group pane review.

- **Group pane** (`src/gmcp/group.ts`). It keeps whatever MUME sends, so
  in practice it shows players anywhere in the group and NPCs only when
  they are in your room. Its header comment said "room-scoped" (now
  corrected).
- **Show players**: `displayed()` tests `type === 'ally'` for the Show
  players option. A group mate of type `enemy` or `neutral` is therefore
  always shown and is not hidden by Show players off. The run log
  composition and other `ally` checks have the same gap. Candidate fix:
  treat every type other than `you` and `npc` as a player.
- **Unused data** worth considering in the review: the status flags
  (blind, poison, bashed, slept, snared, wound, sanctuary, hungry,
  thirsty), `position` and `room`. A player mate's room could be shown
  when it is not yours. Today only `bashed` on `you` is read (weather
  stun, owner item 116).
- **Map** (`src/map/group.ts`). Already reads `mapid` for every
  member, which is why players show in other rooms. Confirmed working.
- **Mercenaries script**. Its "away, not gone" logic is right, since
  mercenaries are NPCs and so are room-scoped.

## Where this was corrected (2026-11-04)

`notes/research/cockpit-inventory.md` §2.3 and §8.2,
`spec.md` §2.4, `notes/research/mmapper-rendering.md` §7,
`src/gmcp/group.ts` (header), `src/editor/script-manual.ts` and
`src/editor/lua-api.ts` (the in-app manual), and
`src/scripts/bundled/mercenaries.lua` (help text). ADR 0120 records the
correction. Older ADRs (0018, 0020, 0053) and stage files are historical
and still say "room-scoped". This note and ADR 0120 supersede them on
this point.
