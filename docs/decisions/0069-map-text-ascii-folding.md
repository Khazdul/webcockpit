# 0069 — Map text is compared ASCII-folded

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0020 ("Locating the player": text normalisation)

## Context

The owner saw the map lose the player in the Grey Havens (Forlond) while
Cockpit (MMapper) kept tracking on the same `arda.mm2`. MUME sends room
names and descriptions in UTF-8 (`Lhûn Street`, `Círdan`), in GMCP
`Room.Info` and in the text stream. MMapper folds incoming text to ASCII
and saves its map that way: `arda.mm2` holds no non-ASCII character in
any of its 30 074 rooms (`Lhun Street`).

The locator compared names and descriptions after whitespace
normalisation only. Rooms with a server id were unaffected, but the
Grey Havens rooms have none in the map, so both the direction match
(name) and the text match (name + description) failed on every room
whose text has an accent. A learned id was also dropped there, its name
check failing the same way. Once a match failed, the next move was
tried from the stale room and failed too, until a room with an id or
plain-ASCII text was reached.

## Decision

`normalizeText` (and `hashNormalized`, which must agree with it for the
`byNameDesc` index) fold to ASCII first: NFD, combining marks
U+0300–U+036F removed, and `Æ æ Ø ø Œ œ ß Ð ð Þ þ` spelled out. ASCII
input takes a fast path. The fold applies to both sides, so a map saved
with accented text still matches, and the map search (`query.ts`) finds
`Lhun` when the user types `Lhûn`.

## Consequences

- Rooms whose text differs from the map's only by accents are located
  by direction and by text again.
- Two rooms that differ only by an accent would now share a text match;
  MMapper maps cannot hold such a pair, since they are ASCII.
