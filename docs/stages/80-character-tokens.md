# Stage 80 — Looks: portraits you choose, tokens on the map and in Group

This stage is not a spec §5 row. The owner asked for it (2026-11-26): a
player picks the picture of their character, the picture shows as a small
token on the map and in the Group pane, and group members get tokens too.
The creator of a set of MUME token pictures asked for them to be
integrated. This file is the spec. Nothing is built yet.

**Status: proposed** (2026-11-26). The brainstorm is held and the
direction is decided (below). The mockup
`notes/research/token-mockups/round1.html`
(<https://claude.ai/artifact/To2Mc4dySwQQv9MtUa76R8>) is waiting for the
owner. The
points under "Open, the owner's" are decided from it. Building starts in
a new session after the owner's go, part by part, each part stopping for
the owner.

## Words

- **Look**: which picture a character has. One look gives both sizes.
- **Portrait**: the look, large, in the Character pane's frame.
- **Token**: the look, small and round, on the map and in the Group pane.
- **Library**: the token pictures shipped with the client.
- **Directory**: the server's public table of name → race, subrace, sex
  and library token.

## The owner's decisions (2026-11-26)

1. **Our engraved drawings stay the default** (ADR 0166 addendum 12),
   chosen by race, subrace and sex. The library and own images are
   choices on top.
2. **The library works for everyone. Own images need an account.**
3. **Looks are shared from the start.** Every client reports its
   character's race, subrace and sex to the service, also when the player
   chose nothing, so that group members who use WebCockpit get the right
   picture with the right sex automatically.
4. **An HP arc round the map token**, to be approved from the mockup.
5. **Tokens for group members can be switched off.**
6. A click on a group member's token changes that member's look, from
   the library or from the player's own images.

## What exists today (checked 2026-11-26)

- The Character pane shows a portrait: an `<img>` baked from an SVG
  drawing, picked by `portraitOf(race, subrace)` and `game.sex`
  (`src/panes/portrait.ts`, `portraits/`). A raster override path exists
  (`public/portraits/<id>-<sex>.webp`) and no file uses it.
- The player's own race and subrace come from `Char.StatusVars`. The sex
  comes from the `info` line and is remembered per character in
  `localStorage` (`src/gmcp/sex.ts`).
- **A group member has no race, class, level or sex in GMCP**
  (`notes/research/gmcp-group.md`): only id, type, name, label, vitals,
  position, room and flags. The directory is the only source for them.
- The map draws the player and every group member as a tinted box, each
  member in a hue of its own (`src/map/render/characters.ts`,
  `src/map/group.ts`). It is WebGL2 in a worker. A room is 44 CSS px at
  zoom 1 and the far style starts at 17.6 px.
- Group rows are not clickable today. Panes have `PopupMenu` and the look
  kit's `Dialog`; the tileset picker is the nearest thing to an image
  picker.
- The app's CSP has `img-src 'self' data:`. There is no service worker.
- Sync stores encrypted items of at most 1 MB in D1, 2 MB and 2 000 items
  per account. Kinds are a closed list in `shared/cloud/api.ts`.

## The design

### 1. A look and where it comes from

```ts
type LookRef =
  | { src: 'auto' }                 // the engraved drawing for race, subrace, sex
  | { src: 'lib'; id: string }      // a library token, e.g. "elf-f-noldor"
  | { src: 'own'; id: string };     // one of the player's own images
```

Which look a character gets, the first that applies:

| # | For yourself | For a group member |
|---|---|---|
| 1 | Your choice for this character | Your assignment for that name |
| 2 | — | The directory's library token for the name |
| 3 | The engraved drawing for your race, subrace, sex | The engraved drawing for the directory's race, subrace, sex |
| 4 | The neutral silhouette (race unknown yet) | An NPC: the library picture its name matches (mounts, mobs) |
| 5 | — | The neutral silhouette (a player), the type icon (an NPC with no match) |

- An unknown sex is male, as today.
- Bear form: with the automatic look the picture follows the race, so a
  Beorning who changes shape gets the bear. A chosen look does not change.
- A missing or broken image falls back one row down, silently.
- Replays and shared replays show no looks (as portraits today).

### 2. The library

- Source: <https://github.com/Sunnyl75/Character-Tokens-v3.0>, 125 PNG
  files (counted 2026-11-26: Men 20, Elves 13, Dwarves 4, Hobbits 15,
  Orcs 15, Trolls 8, other 13, mounts 15, mobs 22) of 256×256 with alpha, named `Race-Sex-Class-Variant`,
  `Mount-…`, `Mob-…`. Made by prompting ChatGPT (the README says so).
- **Before it ships: a licence.** The repository has none. The creator
  asked for the integration; the owner asks them to add a licence file
  (CC BY 4.0 is the suggestion) or to give the permission in writing. The
  set is credited in About and in `THIRD_PARTY_NOTICES.md`.
- `scripts/tokens.ts` builds `public/tokens/` from a checkout of the set:
  - `p/<id>.webp`, 256 px, for the portrait frame;
  - `t/<id>.webp`, 96 px, for tokens and the picker's grid;
  - `tokens.json`: id, group (character, mount, mob, other), race, sex,
    tags, and for mounts and mobs the name words they match.
  The built files are committed. Ids are lower case with hyphens and
  never change once shipped: the directory stores them.
- Nothing of it is in the start bundle. The manifest loads when the
  picker opens or when a look needs it. A picture loads when it is shown.
- Budget: under 2.5 MB in all, the manifest under 20 KB.
- Dwarves are the thin side (4 pictures). The creator may add more: a
  new file is a new id.

### 3. Own images

- Account only (decision 2). Logged out, the "My images" tab says so and
  links to the login.
- The player picks a file. The browser shows a square crop with pan and
  zoom and a circle that marks the token's cut. The result is encoded to
  WebP 256×256, quality stepped down until it is at most 40 KB. The
  original never leaves the browser. Formats: what the browser decodes.
- **One shelf of at most 12 images per account** (`looks.ownImages`
  in the account limits, so the owner can change it). An image on the
  shelf can be the look of your own character or of any group member. A
  full shelf asks the player to remove an image first. Removing an image
  that is in use puts those characters back on automatic.
- Worst case 12 × 40 KB = 480 KB of the account's 2 MB.
- **An own image is never shown to anyone else.** No moderation is
  needed. Others see row 3 of the table.

### 4. Storage and sync

Two new sync kinds (the server treats them like the others, encrypted):

| Kind | Items | Content |
|---|---|---|
| `lookImage` | one per own image | the WebP bytes and a label |
| `looks` | one per account | `{ names: { [name]: { look: LookRef, at: number } } }` |

- `looks` holds your own characters and the members you assigned, all by
  character name (lower case). Merged per name, the newest `at` wins. At
  most 500 names; the oldest assignments of members go first.
- Logged out, `looks` lives in the device's space (ADR 0150) with library
  and automatic looks only. The two spaces never mix (§7.0 rule 7).
- The switches are ordinary settings: `character.shareLook` (on),
  `group.tokens`, `mapper.tokens` (on), `mapper.tokenHp`.

### 5. The picker

One dialog (the look kit's `Dialog`), opened by a click on the portrait in
the Character pane or on a token in the Group pane. On the phone it is a
page.

- Title `Look for <Name>`.
- A preview column: the portrait in its frame, the token on a piece of
  map, the token in a Group row. It follows the selection live.
- Tabs: **Automatic**, **Library** (chips for people, sex, mounts, mobs;
  a search field), **My images** (the shelf, `n of 12`, Add image, the
  crop step).
- For your own character: the switch "Show my look to other WebCockpit
  players", with the note that an own image is never sent.
- For a member: "Reset to automatic", and a line that says where the
  current look comes from (your choice, shared by the player, automatic,
  unknown player).
- The portrait keeps its hover and focus rules; the click is new. The
  game input keeps the focus after the dialog closes.

### 6. The Character pane

The portrait frame shows the chosen look. A library or own image is drawn
with `object-fit: cover` in the frame. Nothing else in the card changes.
The compact card (no portrait) has no entry to the picker; the gear's
popup gets a "Look…" row for that case.

### 7. The map

- With `mapper.tokens` on and a room at least 20 CSS px wide, the player
  and each group member are drawn as a round token of 0.8 room with a
  ring in the member's hue (your own: today's marker colour). Below 20 px
  and in the far style, today's boxes are drawn.
- The off-screen arrows, the layer arrows, the prespam line and the name
  labels of away members stay as they are.
- **HP arc** (`mapper.tokenHp`): a thin arc round the token that follows
  the member's HP, your own from `Char.Vitals`. Variants A, B and C are in
  the mockup. No arc when the HP is unknown.
- **Several in one room**: variants A (fan) and B (grid) are in the
  mockup. Your own token is always whole and on top.
- **Renderer**: one atlas texture of 1024×1024 with 128 px cells (64
  looks, the least recently used leaves). All tokens are drawn as
  instanced quads in one call; the circle, the ring and the arc are made
  in the fragment shader. Images are decoded in the worker with
  `createImageBitmap`; the main thread sends library URLs or the bytes of
  an own image and never a decoded bitmap per frame. Engraved drawings
  are baked once on the main thread (they need the DOM) and sent as
  bitmaps.
- **Cost rule**: a frame with tokens costs at most one draw call and no
  per-frame allocation more than a frame without. The map benchmarks of
  §1.3 must not move; a token frame is added to the bench.
- The phone lens follows the same pixel rule.

### 8. The Group pane

- With `group.tokens` on, the token takes the marker icon's place at the
  start of a row: two rows high in the two-line layout, with the member's
  hue ring (new in Group: the same hue as on the map, sent from the map's
  table so both agree).
- The one-line layout: see the open points.
- A click on a token opens the picker for that member. The row's tooltip
  stays. Nothing else in a row becomes clickable.
- NPC members match the library by name words (`tokens.json`): "a trained
  horse" → `mount-trained-horse`. The longest match wins.

### 9. The directory (shared looks)

The only part where something readable leaves the browser.

**What is stored**, one row per character name:

```
look_dir(name PK,            -- lower case, as MUME writes it
         race, subrace, sex, -- ids from src/gmcp/race.ts; 'male'|'female'|null
         token,              -- a library id or null
         owner,              -- hash of the account id, or of the device id when logged out
         updated)
```

- **Report**: `PUT /api/look` `{name, race, subrace, sex, token}` with
  the device id (as the heartbeat) and the session when logged in. Sent
  when the character's name, race and sex are known after login, and when
  any of them or the look changes. At most once per character and session
  unless something changed. The token is sent only for a library look;
  automatic and own images send `null`.
- **Everyone reports, accounts or not** (decision 3), unless
  `character.shareLook` is off. Turning it off sends `DELETE /api/look`
  for the device's or account's rows.
- **Ask**: `POST /api/look/find` `{names: [...]}`, at most 40 names,
  answers the rows it has. Sent when the group gets a name the client has
  no fresh answer for. Answers are cached in memory and in
  `localStorage` for 24 hours, a miss for 1 hour. Nothing is asked while
  logged out of the game. The server keeps no log of who asked for whom.
- **Whose row it is**: the first reporter owns a name. Another owner's
  report is refused while the row is fresher than 30 days, so a name
  cannot be taken over by someone else to show a wrong picture. A row not
  refreshed for 180 days is removed by the nightly Cron.
- **Validation**: every field is checked against the known ids and the
  manifest. Free text is never stored, so the directory cannot carry a
  message or a link.
- **Limits**: report 30 an hour per device and address, at most 20 names
  per owner; find 60 a minute. In `/api/config` like the others.
- **Admin**: the count of rows on `/admin`, and removal of a row by name
  (audit log, ADR 0157).
- **Flag**: `FLAG_LOOKS` (§7.0 rule 5). Off: no report, no ask, and
  members follow rows 1, 4 and 5 of the table.
- **Never in the game path** (§7.0 rule 1): both calls run on idle time,
  and a failure is silent.

**What this changes, to be said plainly** (intent: "Privacy by
construction"):

- The service learns that a character name uses WebCockpit, and its race
  and sex. Until now it knew no character name.
- Anyone who knows a name can ask for its race. Race tells the side in
  the war. A name is normally known only to those who met the character.
- The service sees which names a client asks for, that is, who is in a
  group with whom, for the moment of the request. It is not stored.
- The owner's decision 3 makes reporting the default with a switch to
  turn it off. The privacy text (`/privacy`), "What the site knows" in
  About and the release note say what is sent. `intent.md` gets a goal
  line for shared looks with the owner's decision date, and the
  constraint's wording is checked against it.

### 10. What is not in this stage

- Sharing own images with others (needs moderation).
- A separate look for bear form, looks from Lua, looks in replays.
- Tokens for enemies or for characters outside the group.
- Class in the automatic choice (`subclass` in `Char.StatusVars` is not
  read today).

## Parts

Each part ends with something the owner tests, and stops for the go.

| Part | What | The owner tests |
|---|---|---|
| A | The library build script and files, `LookRef`, the resolver, the picker with Automatic and Library, the Character pane, the device space | Pick a library look logged out; it stays after a reload |
| B | Own images: crop, encode, the shelf, the two sync kinds, the limit | Upload on one device, see it on another |
| C | Map tokens: atlas, shader, stacking, the HP arc, the switch, the bench | Walk with a group; zoom through the 20 px limit |
| D | Group tokens: the hue ring, the click, NPC matching, member assignments | Assign a look to a member; a mount gets its picture |
| E | The directory: the worker's routes and table, report and ask, the cache, the switch, admin, the privacy text, the intent line; on staging first | Two browsers with two characters in one group see each other's looks |

Order: A, C, D can be tested with the owner's own character. B and E need
the worker. E is last so that everything it feeds is already visible.

ADRs to write while building: the look model and its order of sources;
own images and the shelf; map tokens in the renderer; the directory and
what it stores (with the privacy reasoning above).

## Open, the owner's

From the mockup:

1. The HP arc: variant A (outside the ring), B (the ring is the HP), C
   (only when hurt), or none.
2. Several in one room: A (fan) or B (grid).
3. One-line Group rows: a small token or today's marker icon.
4. The token's shape in Group: round as on the map, or a rounded square
   as the portrait frame.
5. `group.tokens` on or off by default.

What the mockup showed, to weigh with the points above:

- Five in one room at the default 44 px leaves 9 px (fan) or 13 px
  (grid) of picture for the others. Below about 12 px only the ring's
  colour reads. Pictures in a shared room need about 64 px a room.
- Arc A takes 4–5 px of radius at every size, and a green or orange arc
  beside a ring of the same hue is hard to tell apart. Arc B keeps the
  largest picture; its lost part is weak on dark ground.
- The arc's colours follow Group's thresholds (green, orange from 45 %,
  red from 25 %), so the map and the pane agree.
- In a Group row the token takes the marker icon's place, so the row no
  longer shows player or NPC, and ally, neutral or enemy, by its marker.
  Something else has to carry that if it matters.
- A one-line row's token is 12 px: a coloured dot that ties the row to
  the map, not a picture.
- Library tokens are cut-out busts: in the portrait frame they sit on a
  backing and do not fill it as the engraved drawing does. The two
  styles are visibly different side by side.

From the spec:

6. The directory's three privacy points in §9. In particular: is it
   right that players without an account report too?
7. The licence: the owner asks the creator.
8. Twelve own images per account: enough?

## Tasks

- [ ] The owner looks at the mockup and decides the open points.
- [ ] The licence of the token set.
- [ ] Parts A–E, each with its task list when it starts.

## Test guide

Written per part when it is built.

## Owner feedback

(none yet)
