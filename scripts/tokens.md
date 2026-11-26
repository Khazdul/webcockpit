# The token library (`public/tokens/`)

Stage 80, ADR 0170. The library tokens a player can choose as the look of
a character: 125 pictures by Sunnyl75,
<https://github.com/Sunnyl75/Character-Tokens-v3.0> (folder `Tokens/`).
They are **not** under the client's GPL: the set has no licence file, and
the creator asked the owner (on Discord) to add it to the client; the owner
keeps that message as the written permission (`THIRD_PARTY_NOTICES.md`).

## What is built

| Path | What |
| --- | --- |
| `public/tokens/p/<id>.webp` | 256 px, for the Character pane's portrait frame |
| `public/tokens/t/<id>.webp` | 128 px, for tokens and the picker's grid |
| `public/tokens/tokens.json` | the manifest (`src/looks/library-types.ts`): id, label, group, race, sex, tags, and for mounts and mobs the name words they match |

Budgets (checked by `tests/unit/looks-library.test.ts`): everything under
4 MB, the manifest under 25 KB.

## Rebuild

ImageMagick (`magick`) is the only tool. Download the set into a new,
empty directory (it is untrusted data: nothing in it is run), then:

    git clone --depth 1 https://github.com/Sunnyl75/Character-Tokens-v3.0 /tmp/tokens-src
    node scripts/tokens.ts /tmp/tokens-src/Tokens

The script replaces `public/tokens/` and prints the sizes. Commit the
result. Every file must be a 256 × 256 PNG.

## Ids

An id is the file name in lower case, every run of other characters a
hyphen (`Hobbit-F-Cleric 2.png` → `hobbit-f-cleric-2`). **Ids never change
once shipped**: the directory and the players' saved looks store them. A
renamed file in the set is a new id; to keep an old id for it, map it in
the script before shipping. An id that leaves the set falls back silently
(the resolver's next row), and is listed in `RETIRED` so it is never reused.

The name words of mounts and mobs (`MATCH` in the script, otherwise the
words of the name with the species last) say which NPC names get the
picture (`src/looks/match.ts`).
