# 0170 — The token library: the build, the ids, the permission

Date: 2026-11-26. Status: accepted (stage 80 part A). Related: ADR 0169
(looks), ADR 0144 (the CSP and `_headers`), ADR 0118 (the tileset
previews, the nearest earlier asset build), `scripts/tokens.md`.

## Context

The creator of a set of MUME token pictures, Sunnyl75
(<https://github.com/Sunnyl75/Character-Tokens-v3.0>, 125 PNGs of 256 ×
256 with alpha), asked the owner to integrate them. The repository has no
licence file.

## Decision

- **Permission**: the creator's Discord message asking the owner to add
  the set is the written permission (the owner keeps a copy; decision
  13). It covers use in WebCockpit. The pictures are **not** under the
  client's GPL: `THIRD_PARTY_NOTICES.md` says so and names the source and
  the creator; About's CREDITS has a Tokens row.
- **The build** (`scripts/tokens.ts`, run by hand): ImageMagick
  (`magick`, an argument list, no shell) reads each PNG of a checkout
  kept in a directory of its own (untrusted data; nothing in it is run),
  checks it is 256 × 256, and writes `public/tokens/p/<id>.webp` (256 px,
  quality 72) and `t/<id>.webp` (128 px, Lanczos, quality 74), alpha
  kept. 2.9 MB in all, the manifest 15 KB (budgets 4 MB and 25 KB, held
  by `tests/unit/looks-library.test.ts`, which reads the committed files
  only: CI needs no ImageMagick).
- **Ids** are the file names in lower case, every run of other
  characters a hyphen (`Hobbit-F-Cleric 2.png` → `hobbit-f-cleric-2`).
  They never change once shipped (the directory and saved looks store
  them): a renamed file in the set is a new id, a dropped one is listed
  in `RETIRED`. The label is the set's own name.
- **The manifest** (`tokens.json`, `src/looks/library-types.ts`): id,
  label, group (`character` by the name's race word, `other` for the six
  singles, `mount`, `mob`), race (a `RaceKind`: BN → `numenorean`, Bear →
  `beorning`; null outside `character`), sex, tags (the descriptor words
  and a subrace kind), and for mounts and mobs the name words they match
  (species last; a few are set by hand in `MATCH`). The four named
  singles (Bladorfat, Newman, Sunny, Tarannon) are `other` with no race
  or sex: they are the creator's portraits of real characters, and a
  guess would be wrong half the time.
- **Loading**: nothing on a normal start (an e2e checks the requests).
  The manifest loads when the picker opens or a look needs it
  (`loadLibrary`, once a page), a picture when it is shown, by a
  `'self'` URL (the CSP has no `blob:`). The replay bundle never fetches.
- **Caching**: `/tokens/*` is `public, max-age=31536000, immutable`
  (`public/_headers`). The pictures never change under an id; the
  manifest grows with new pictures, so the client asks for
  `tokens.json?v=<release>`, a new URL with each release.

## Consequences

- A new picture is a rebuild and a commit; it appears with the next
  release. A changed picture under an old id would be cached for a year:
  give it a new id instead.
- Dwarves are the thin side (4 pictures).
