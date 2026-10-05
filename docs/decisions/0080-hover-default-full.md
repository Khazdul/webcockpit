# 0080 — Room info on hover defaults to Full

- Status: Accepted
- Date: 2026-10-06
- Amends ADR 0077 (hover default Minimal)

## Context

ADR 0077 made Options → Mapper *Room info on hover* default to Minimal
(name and note). After 0.1.49 the owner (2026-10-06): the default should
be Full, MMapper's room preview.

## Decision

- `defaultSettings().mapper.hover` is `'full'`.
- `SETTINGS_VERSION` goes from 1 to 2. A stored record below version 2
  (or without one) with `mapper.hover: 'minimal'` loads as `'full'` once;
  the next save writes version 2, and a chosen Minimal then stays.
  Off is kept as stored.

## Consequences

- Everyone who had the old default gets Full, including the few who
  picked Minimal on purpose during the hours 0.1.49 was live; they set it
  again once.
- An older tab still open may write a v1 record back; the next load moves
  a Minimal in it to Full again. Harmless, and it ends with the reload.
