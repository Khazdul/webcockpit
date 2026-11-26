# Stage 80 — Looks: portraits you choose, tokens on the map and in Group

This stage is not a spec §5 row. The owner asked for it (2026-11-26): a
player picks the picture of their character, the picture shows as a small
token on the map and in the Group pane, and group members get tokens too.
The creator of a set of MUME token pictures asked for them to be
integrated. This file is the spec and the brief for the build.

**Status: approved for building** (2026-11-26). The brainstorm and two
mockup rounds are held and every point is decided (below). It is built in
one unattended night run (the owner's wish), parts A–F in order, without
stopping for the owner between parts. Nothing is built yet.

## How to read this file (for the session that builds it)

1. "Night run" says what you may and may not do, and what must exist in
   the morning. Read it first.
2. "The owner's decisions" are fixed. Do not reopen them.
3. "The design" is what to build. Where it gives numbers, they are the
   numbers. Where it says "your call", decide and write an ADR.
4. "Parts" gives the order, and for each part what must be true and
   tested before the next part starts.
5. The mockup `notes/research/token-mockups/round2.html` is the source
   for the look
   (<https://claude.ai/artifact/JFxTxh2v35UDhktAcJMye7>). It is a test
   page with inline scripts: port the look and do not link the page. Where
   the mockup and this file differ, this file wins (the differences are
   listed under "Where the mockup is not the truth").

## Night run

### The goal in the morning

The owner opens the client, picks a look, sees tokens on the map and in
Group, and can test shared looks with two browsers on staging. A test
guide in this file tells him what to open and try. If not everything got
done, what is done works, and the log says plainly what is missing.

### What you may do

- Commit to `main` in small conventional commits and push `main`.
- Deploy to **staging** (the owner, 2026-11-26):
  `gh workflow run deploy.yml -f environment=staging -f action=deploy`.
  It applies staging's D1 migrations. Then `npm run test:prod` against
  staging as earlier stages did (stage 66, part E, shows how).
- Run the unit tests, the e2e, the worker tests and the benches as often
  as needed.
- Download the token set from GitHub (see §2) into the scratchpad.
- Decide technical details and record them as ADRs. Improvise the phone
  and tablet look (§10).

### What you must not do

- **No production.** No version tag, no production deploy, no production
  migration, no change of a production flag to on. The release is the
  owner's, after his test.
- **No login to MUME** and no connection to the real game. Test with the
  test server and recorded GMCP (`tests/fixtures`, `bench/ws-server.ts`).
- Nothing under `/home/ole/MUME` is changed (CLAUDE.md).
- Do not touch the owner's dev server on port 5173, and do not run e2e
  against it: use a port of your own (`WC_E2E_PORT`).
- Do not reopen the owner's decisions, and do not add features that are
  under "Not in this stage".
- No question to the owner stops the work: he is asleep. Take the choice
  that is easiest to change later, write it under "Decided in the night"
  at the end of this file, and go on.

### How to work

- The main session plans, delegates to subagents and verifies
  (CLAUDE.md). One part at a time. A part is done when its "Done when"
  list is true, its tests are green and it is committed. Only then the
  next part starts.
- Building agents do not run the full e2e at the same time as each
  other or as the main session (CLAUDE.md, "Tests and worktrees"). A
  building agent runs the unit tests and the e2e files of its own area.
  The main session runs the full e2e alone, at 5 workers, after each part.
  A failing file is rerun alone before it is called a regression.
- A full e2e run rewrites screenshots under `docs/stages/img/`: restore
  them (`git checkout -- docs/stages/img`).
- If Chromium starts crashing, look at `df -h /tmp` first.
- Verify what an agent reports before building on it: read the diff, run
  the tests yourself, look at a screenshot of the real client. An agent's
  "done" is a claim.
- Look at the result as the owner will: after parts A, C, D and F take
  screenshots of the real client (Playwright, the test server's group
  fixture) and compare them with the mockup. Fix what does not match
  before going on.
- `main` is never left red. If a part cannot be finished, back it out or
  leave it behind its setting turned off by default, and say so in the
  log.
- Keep this file's task list current as you go, so that an interrupted
  night can be continued from it.

### If time or trouble stops you

The parts are ordered so that each is worth having alone. Do not start a
part you cannot finish and test. Stopping after any part is acceptable;
half a part on `main` is not.

### What must exist at the end

- The test guide in this file, filled in for what was built.
- "Decided in the night" in this file, with every choice the owner
  should know of.
- The ADRs (see "Documents").
- The session log entry and the stage table in `progress.md`
  (CLAUDE.md, "Sessions and traceability").
- A note in the log: the owner's dev server on 5173 must be restarted to
  show the new version.
- No release. `CHANGELOG`/release notes for the next version are drafted
  where the project keeps them, not published.

## Words

- **Look**: which picture a character has. One look gives both sizes.
- **Portrait**: the look, large, in the Character pane's frame.
- **Token**: the look, small and round, on the map and in the Group pane.
- **Library**: the token pictures shipped with the client.
- **Directory**: the server's public table of name → race, subrace, sex
  and library token.

## The owner's decisions (2026-11-26)

From the brainstorm:

1. **Our engraved drawings stay the default** (ADR 0166 addendum 12),
   chosen by race, subrace and sex. The library and own images are
   choices on top.
2. **The library works for everyone. Own images need an account.**
3. **Looks are shared from the start.** Every client reports its
   character's race, subrace and sex to the service, also when the player
   chose nothing, so that group members who use WebCockpit get the right
   picture with the right sex automatically.
4. **An HP arc round the map token.**
5. **Tokens for group members can be switched off.**
6. A click on a group member's token changes that member's look, from
   the library or from the player's own images.

From mockup round 1:

7. **The HP arc is variant C**: outside the ring, only when the member
   is hurt, in Group's colours (green, orange from 45 %, red from 25 %).
8. **Several in one room: the fan.** Your token whole in the centre, the
   others small along the room's lower edge, at most three and then `+n`.
9. **One-line Group rows get the small token.**
10. **Group tokens are round.**
11. **Group rows follow the pane's height**, so that the pane is filled
    and tokens grow when there is room.
12. **The directory is approved as §9 describes it**: reporting is the
    default with a switch, and players without an account report too.
13. **The permission for the token set**: the creator's Discord message
    asking the owner to add the set is the written permission. The owner
    keeps a copy of it.
14. **50 own images per account**, each with a size limit (§3).
15. **Tokens are on by default**, in Group and on the map, each with its
    switch in the pane's gear.

From mockup round 2:

16. **The ring is R3**: 1 px, the member's hue muted 25 % toward grey,
    with the dark outline kept. In Group and on the map, and for your own
    yellow ring.
17. **Free scaling of Group rows** (not fixed modes), with the bars as
    three full lines with numbers at the larger sizes. "Det ser bra ut."
18. **The largest token is 68 px.**
19. **No red dot for a member of an enemy race.** The NPC tag stays.
    Nothing else replaces the marker icon.
20. The Automatic tab has no hint line under the card for your own
    character ("This is the default…" was removed).

For the night run:

21. **Staging may be deployed by the night run. Production may not.**
22. **Phone and tablet are in**: the basics, and the session may
    improvise a design that fits the phone's and the tablet's look, for
    the owner to judge afterwards (§10).
23. **No login to MUME in the night.** Test data only.
24. **One-line rows grow with the height too** (§8), so that the pane
    is filled at every height. Confirmed by the owner.

## What exists today (checked 2026-11-26)

- The Character pane shows a portrait: an `<img class="wc-cc-photo">`
  baked from an SVG drawing to a PNG `data:` URL, picked by
  `portraitOf(race, subrace)` and `game.sex` (`src/panes/portrait.ts`,
  `portraits/`, `character-dom.ts`, `character.ts` near line 396). A
  raster override path exists (`public/portraits/<id>-<sex>.webp`) and no
  file uses it. The portrait has no click today. Portraits are off in
  replays (`__WC_REPLAY__`).
- The player's race and subrace come from `Char.StatusVars`
  (`src/gmcp/char.ts`, kinds in `src/gmcp/race.ts`). The sex comes from
  the `info` line and is remembered per character in `localStorage`
  (`src/gmcp/sex.ts`); it is `game.sex`.
- **A group member has no race, class, level or sex in GMCP**
  (`notes/research/gmcp-group.md`): only id, type, name, label, vitals
  (`{value, max, word}`), position, ride, room, mapid and flags
  (`src/gmcp/group.ts`). The directory is the only source for race and
  sex. Yourself is not a row in Group.
- The Group pane: `src/panes/group.ts`, `group-model.ts`, `group.css`
  (ADR 0122, ADR 0120). `groupLayout` picks two lines per member when
  `2n ≤ rows`, else one line, else one line and `↓ n more`. Rows are
  keyed DOM elements patched in place. No click listeners.
- The map: WebGL2 on an OffscreenCanvas in a worker (ADR 0020).
  `src/map/render/characters.ts` draws the player and each group member
  as a quad tinted with a hue (`src/map/group.ts`, MMapper's golden
  angle). `pxPerRoom(zoom, z)` is 44 CSS px at zoom 1, layer 0. The far
  style starts at zoom 0.4 (17.6 px). Textures load through an
  `AssetSource` and `createImageBitmap`.
- Settings: `src/settings/types.ts`, `migrate.ts`, setters in
  `src/chrome/pane-options-model.ts`, gear popups in
  `src/chrome/popups/pane-settings.tsx`, the phone's copy in
  `src/phone/settings-page.tsx`. The tileset picker
  (`popups/mapper-settings.tsx`, ADR 0118) is the nearest thing to an
  image picker. Dialogs: the look kit (`src/chrome/kit/look-overlay.tsx`).
  Pane popups: `src/panes/popup-menu.ts`.
- The app's CSP has `img-src 'self' data:` and `connect-src 'self'`
  (`scripts/csp.ts`). `blob:` image URLs are not allowed. There is no
  service worker.
- The cloud: one Worker with D1 and R2 (`worker/`, `wrangler.jsonc`,
  spec §7). Sync items are encrypted, at most 1 MB each, 2 MB and 2 000
  items per account; the kinds are a closed list (`SYNC_KINDS`,
  `shared/cloud/api.ts`); the limits are `DEFAULT_ACCOUNT_LIMITS` and a
  per-account column. The heartbeat (`src/cloud/beat.ts`) shows how an
  anonymous call with the device id is made. Flags are `FLAG_*` vars
  served by `GET /api/config`.

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

- The resolver is one pure module with unit tests for every row and
  every fallback. The Character pane, the Group pane and the map all ask
  it; none of them has rules of its own.
- An unknown sex is male, as today.
- Bear form: with the automatic look the picture follows the race, so a
  Beorning who changes shape gets the bear (whatever `portraitOf` gives
  for it today; if there is no engraved bear, the library's `bear-m` or
  `bear-f`). A chosen look does not change with the form.
- A missing or broken image falls back one row down, silently.
- Replays and shared replays show no looks (as portraits today).
- An own image that is chosen while logged in is not available logged
  out: the look then falls to row 3 until the player logs in again. The
  choice itself is kept.

### 2. The library

- Source: <https://github.com/Sunnyl75/Character-Tokens-v3.0>, folder
  `Tokens/`, 125 PNG files of 256×256 with alpha (counted 2026-11-26:
  Men 20, Elves 13, Dwarves 4, Hobbits 15, Orcs 15, Trolls 8, other 13,
  mounts 15, mobs 22). Names: `Race-Sex-Class-Variant`, `Mount-…`,
  `Mob-…`, and a few singles (`Eye-of-Sauron`, `Gondor-Shield`, …). `BN`
  is Black Númenórean. One name has a space, one has underscores. Made by
  prompting ChatGPT (the README says so).
- **Permission** (decision 13): the repository has no licence file. The
  creator asked the owner on Discord to add the set, and the owner takes
  that message as the written permission. It covers use in WebCockpit.
  Credit the set in About (the credits page of stage 47) and in
  `THIRD_PARTY_NOTICES.md`, which says that these pictures are not under
  the client's GPL and names the source and the creator's GitHub name.
- The downloaded files are untrusted data: keep them in a directory of
  their own in the scratchpad, and read them only with the image tool.
- `scripts/tokens.ts` builds `public/tokens/` from a checkout of the set
  (ImageMagick is installed as `magick`; `cwebp` is not; `sharp` is not
  a dependency: add nothing heavy for a script that runs by hand):
  - `p/<id>.webp`, 256 px, for the portrait frame;
  - `t/<id>.webp`, 96 px, for tokens and the picker's grid;
  - `tokens.json`: id, label, group (`character`, `mount`, `mob`,
    `other`), race (a `RaceKind` or null), sex, tags, and for mounts and
    mobs the name words they match.
  The built files are committed; the script and a short README beside it
  say how to rebuild. Ids are lower case with hyphens and never change
  once shipped: the directory stores them. A unit test checks that every
  manifest entry has both files and that ids are unique and well formed.
- Nothing of it is in the start bundle. The manifest loads when the
  picker opens or when a look needs it. A picture loads when it is shown.
  Because of the CSP, pictures are `'self'` URLs or `data:`, never
  `blob:`.
- Budget: `public/tokens/` under 3 MB, the manifest under 25 KB.
- Dwarves are the thin side (4 pictures). A new file is a new id.
- A library token is a cut-out bust on transparency. In the portrait
  frame and in a token it sits on the backing the mockup uses (a
  grey-brown, so that dark figures like the horse and the black wolf
  hold).

### 3. Own images

- Account only (decision 2). Logged out, the "My images" tab says so and
  links to the login.
- The player picks a file. The browser shows a square crop with pan and
  zoom and a circle that marks the token's cut. The result is encoded to
  WebP 256×256, the quality stepped down until it is at most 30 KB (if
  the browser cannot encode WebP, JPEG on a dark ground). The original
  never leaves the browser. Formats: what the browser decodes; an
  animated file gives its first frame. A file that cannot be decoded
  gives a plain message in the dialog.
- **One shelf of at most 50 images per account** (decision 14;
  `lookImages` = 50 and `lookImageMaxBytes` = 30 720 in the account
  limits, so the owner can change them per account and in general).
- An image on the shelf can be the look of your own character or of any
  group member. A full shelf asks the player to remove an image first.
  Removing an image that is in use puts those characters back on
  automatic, after the dialog has said how many use it.
- Worst case 50 × 30 KB = 1.5 MB. That would eat the account's 2 MB for
  small items, so own images get **a budget of their own** (`lookBytes`,
  1.5 MB) and do not count against the 2 MB or the 2 000 items. The
  server checks the count, the size of each and the budget (413
  `too_many_items`, `item_too_large`, `storage_full`, as for other
  items), and the client says which it was.
- **An own image is never shown to anyone else.** No moderation is
  needed. Others see row 3 of the table.
- An own image is shown from a `data:` URL made from the decrypted bytes
  (the CSP), cached in memory per session.

### 4. Storage and sync

Two new sync kinds (the server treats them like the others, encrypted;
both are added to `SYNC_KINDS`):

| Kind | Items | Content |
|---|---|---|
| `lookImage` | one per own image | the WebP bytes and a label |
| `looks` | one per account | `{ names: { [name]: { look: LookRef, at: number } } }` |

- `looks` holds your own characters and the members you assigned, all by
  character name (lower case). Merged per name, the newest `at` wins; a
  reset to automatic is an entry too (so that it wins over an older
  choice on another device). At most 500 names; the oldest member
  assignments go first, your own characters never.
- Logged out, `looks` lives in the device's space (ADR 0150) with library
  and automatic looks only. The two spaces never mix (§7.0 rule 7).
- The sync engine's rules hold (ADR 0146, 0151, 0152): follow how
  `timers` and `scriptData` were added in stage 62.
- New settings, each added to the type, the defaults and `migrate.ts`:
  `character.shareLook` (on), `group.tokens` (on), `mapper.tokens` (on),
  `mapper.tokenHp` (on).

### 5. The picker

One dialog (the look kit's `Dialog`), opened by a click on the portrait in
the Character pane or on a token in the Group pane.

- Title `Look for <Name>`.
- A preview column: the portrait in its frame, the token on a piece of
  map, the token in a Group row. It follows the selection live.
- Tabs: **Automatic** (one card with the engraved drawing and "Follows
  your race and sex (<race line>, <sex>)"; no hint line under it for
  your own character, decision 20), **Library** (chips for people, sex,
  mounts, mobs, with counts; a search field), **My images** (the shelf
  as a scrolling grid, `n of 50`, Add image, the crop step, remove).
- For your own character: the switch "Show my look to other WebCockpit
  players", with the note that an own image is never sent.
- For a member: "Reset to automatic", a line that says where the current
  look comes from (your choice, shared by the player, automatic from the
  player's race, unknown player, matched by name), and under the
  Automatic card the hint the mockup has for members.
- Cancel puts back the look the dialog opened with; "Use this look"
  keeps the selection. The selection shows live in the pane meanwhile.
- The dialog is usable by keyboard (tabs, grid by arrows, Esc closes),
  and the game input has the focus again after it closes.
- The click on the portrait is new: the portrait gets a pointer cursor
  and a tooltip line "Click to choose a look".

### 6. The Character pane

The portrait frame shows the chosen look. A library or own image is drawn
with `object-fit: cover` in the frame, a library token on its backing.
Nothing else in the card changes. The compact card (no portrait) has no
portrait to click: the gear's popup gets a "Look…" row that opens the
picker, in every size.

### 7. The map

- With `mapper.tokens` on and a room at least 20 CSS px wide, the player
  and each group member are drawn as a round token of 0.8 room, with the
  R3 ring (decision 16): 1 px, the member's hue muted 25 % toward grey,
  and the dark outline outside it as in the mockup. Your own ring is
  today's marker colour, muted the same way. Below 20 px and in the far
  style, today's boxes are drawn, unchanged.
- The off-screen arrows, the layer arrows, the prespam line and the name
  labels of away members stay as they are.
- **HP arc** (`mapper.tokenHp`, decision 7): a thin arc outside the ring
  that follows the member's HP, starting at 12 o'clock, in Group's
  colours and thresholds (one shared function with the Group pane, so
  they cannot drift). About 3.5 % of the picture wide, at least 1 px.
  Drawn only below full HP, and not when the HP is unknown. Your own HP
  comes from `Char.Vitals`.
- **Several in one room** (decision 8): the fan. Your own token is whole
  and on top; the others are small discs along the lower edge in group
  order, at most three, then a `+n` disc. A room without you shows its
  first member whole and the others the same way. Sizes as the mockup.
- **Renderer** (your call in the details; these are the rules): one
  atlas texture (1024×1024 with 128 px cells gives 64 looks, the least
  recently used leaves). All tokens of a frame are drawn in one draw
  call; the circle, the ring, the outline and the arc are made in the
  fragment shader, with edges smoothed by the pixel's size so that they
  hold at every zoom and device scale. Images are decoded in the worker
  with `createImageBitmap`; the main thread sends library URLs or the
  bytes of an own image, and never anything per frame. Engraved drawings
  are baked once on the main thread (they need the DOM) and sent as
  bitmaps. The atlas has mipmaps or the draw picks a fitting size: a
  256 px picture shown at 20 px must not shimmer when the map moves.
- **Cost rule** (intent Goal 1, spec §1.3): with tokens on, a map frame
  has at most one more draw call than today and allocates nothing per
  frame. Add a token scene (you and eight members, five in one room) to
  the map bench, run it before and after, and write both numbers in the
  ADR. The existing benches must not move beyond their noise.
- The phone lens follows the same pixel rule.

### 8. The Group pane

- With `group.tokens` on, the token takes the marker icon's place at the
  start of a row, round, with the R3 ring in the member's hue. The hue
  is the map's: one source for both (move or share `src/map/group.ts`'s
  hue so that the pane and the worker cannot disagree).
- **Rows follow the pane's height** (decisions 11, 17, 18, 24). Every
  row has the same height `h` = the pane's free height shared between
  the members, held to the steps below. What is left over stays empty at
  the bottom. The fight card and the overflow row keep their heights and
  are taken off first. The text keeps the terminal's font size.

  | Row height | Layout | Token |
  |---|---|---|
  | under 17 px a member | one-line rows of 17 px, then `↓ n more` (today's rule) | 13 px |
  | 17–33 px | one line, growing: name, icons, mini bars | `h` − 4 px |
  | 34–55 px | two lines: the name line, then the three bars side by side (today's two-line row), the bars 5 → 8 px thick | `h` − 8 px |
  | 56–76 px | the name line, then HP, mana and moves as three full lines with `value/max` to the right; a member with no mana has two lines | `h` − 8 px |
  | above 76 px | the row stops at 76 px | 68 px |

  The mockup switches to three lines at 52 px, which was tight; 56 px is
  the number. A bar whose `max` is unknown shows no numbers.
- Heights are in CSS px from the pane's content box, not in whole
  terminal rows: the rows no longer sit on the cell grid, the frame and
  the text size still do. This replaces `groupLayout`'s two fixed
  layouts. Write an addendum to ADR 0122. With `group.tokens` off the
  rows scale the same way, with the marker icon at its normal size.
- No layout shift while playing: a row's height changes only when the
  member count or the pane's size changes, never with a vitals update.
- A click on a token opens the picker for that member. The token is a
  button (focusable, with a label). The row's tooltip stays. Nothing else
  in a row becomes clickable.
- The NPC tag stays where two lines or more are shown (decision 19). No
  other mark replaces the marker icon.
- NPC members match the library by name words (`tokens.json`): "a
  trained horse" → `mount-trained-horse`. The match with the most words
  wins; a tie goes to the first in the manifest. Unit tests with the NPC
  names in `tests/fixtures` and `notes/research/gmcp-group.md`.

### 9. The directory (shared looks)

The only part where something readable leaves the browser.

**What is stored**, one row per character name:

```
look_dir(name PK,            -- lower case, as MUME writes it
         race, subrace, sex, -- kinds from src/gmcp/race.ts; 'male'|'female'|null
         token,              -- a library id or null
         owner,              -- hash of the account id, or of the device id when logged out
         updated)
```

- **Report**: `PUT /api/look` `{name, race, subrace, sex, token}` with
  the device id (as the heartbeat) and the session when logged in. Sent
  when the character's name and race are known after login to the game,
  and again when the race, the sex or the look changes (the sex may come
  later, from the info poll). At most once per character and session
  unless something changed. The token is sent only for a library look;
  automatic and own images send `null`. Race and subrace are sent as
  kinds, never as MUME's text.
- **Everyone reports, accounts or not** (decision 12), unless
  `character.shareLook` is off. Turning it off sends `DELETE /api/look`,
  which removes the owner's rows. Never in dev, e2e or replays.
- **Ask**: `POST /api/look/find` `{names: [...]}`, at most 40 names,
  answers the rows it has. Sent when the group gets a name the client has
  no fresh answer for, gathered for a moment so that a `Group.Set` is one
  call. Answers are cached in memory and in `localStorage` for 24 hours,
  a miss for 1 hour, at most 300 names. NPC members are never asked for.
  The server keeps no log of who asked for whom, and the answer has no
  `owner`.
- **Whose row it is**: the first reporter owns a name. Another owner's
  report is refused (409) while the row is fresher than 30 days, so a
  name cannot be taken over to show a wrong picture. A player who logs
  in to an account takes the device's rows over to the account. A row
  not refreshed for 180 days is removed by the nightly Cron.
- **Validation**: the name is 2–20 letters; every other field is checked
  against the known kinds and the manifest's ids (the worker has the id
  list from the build). Free text is never stored, so the directory
  cannot carry a message or a link.
- **Limits**: report 30 an hour per device and address, at most 20 names
  per owner; find 60 a minute per address. In `/api/config` like the
  others, with the rate limiting binding.
- **Admin**: the count of rows on `/admin`, and removal of a row by name
  (audit log, ADR 0157).
- **Flag**: `FLAG_LOOKS` (§7.0 rule 5): on in staging, **off in
  production** until the owner opens it. Off: no report, no ask, and
  members follow rows 1, 4 and 5 of the table. Everything else in this
  stage works with the flag off and with the service down (§7.0 rule 2).
- **Never in the game path** (§7.0 rule 1): both calls run on idle time,
  and a failure is silent and retried later, not in a loop.

**What this changes, to be said plainly** (intent: "Privacy by
construction"):

- The service learns that a character name uses WebCockpit, and its race
  and sex. Until now it knew no character name.
- Anyone who knows a name can ask for its race. Race tells the side in
  the war. A name is normally known only to those who met the character.
- The service sees which names a client asks for, that is, who is in a
  group with whom, for the moment of the request. It is not stored.
- The owner approved this (decisions 3 and 12). `intent.md` has the goal
  (Goal 16) and the constraint's wording since 2026-11-26. The privacy
  text (`/privacy`) and "What the site knows" in About say what is sent,
  what is stored, for how long, and how to turn it off and remove it.
  The switch is in the picker and in Settings.

### 10. Phone and tablet

Decision 22: the basics are in, and the design is yours to propose.

- The rules are the same everywhere: the resolver, the token in the
  lens by the pixel rule, tokens in the phone's and the tablet's group
  view, the HP arc.
- The picker on the phone is a page in the phone's look, not the desktop
  dialog made small: read how the phone's settings pages and the phone
  Character card are built (`src/phone/`, stages 51–56, ADR 0166's phone
  addenda) and make it belong there. Touch targets of at least 44 px,
  the library as a grid that scrolls, the crop step by touch (drag and
  pinch).
- Intent Goal 12 asks that phone changes are put to the owner: take
  screenshots of every new phone and tablet view (`scripts/phone-shots.ts`
  and `tablet-shots.ts` show how), put them in the test guide, and say
  under "Decided in the night" what you chose and why. The owner judges
  them in the morning; do them well enough that he can say yes at once.
- If the phone work threatens the rest of the night, it is part F and
  comes last.

### 11. Not in this stage

- Sharing own images with others (needs moderation).
- A separate look for bear form, looks from Lua, looks in replays.
- Tokens for enemies or for characters outside the group.
- Class in the automatic choice (`subclass` in `Char.StatusVars` is not
  read today).
- New engraved drawings.

### Where the mockup is not the truth

- The three-line bar step is at 56 px, not 52 (§8).
- One-line rows grow from 17 to 33 px (§8); the mockup keeps them at
  17 px.
- The red dot for an enemy race is not built (decision 19).
- The mockup's map is a canvas stand-in, its Character card is static,
  and its numbers in the bars are invented.
- The mockup offers R1–R4 and the three fixed row modes for comparison:
  only R3 and free scaling are built.
- Round 1 (`round1.html`) is history: arcs A and B, the grid and the
  rounded square lost.

## Parts

In this order. Each part is finished, tested and committed before the
next starts.

### A. The library, the look model, the picker, the Character pane

- `scripts/tokens.ts`, `public/tokens/`, the manifest and its test; the
  notices and the credit.
- `LookRef`, the resolver, the store for looks in the device's space.
- The picker with Automatic and Library (My images shows the logged-out
  card for now), the click on the portrait, the gear's "Look…" row.
- The new settings with migration.

Done when: a library look chosen logged out shows in the Character pane
and is still there after a reload; Cancel puts the old look back; the
compact card reaches the picker through the gear; nothing loads from
`public/tokens/` before a look or the picker needs it (a test checks the
requests of a normal start); unit tests for the resolver and the
manifest; an e2e file for the picker (open, filter, search, pick,
cancel, keyboard, focus back in the input); the existing Character e2e
is green.

### B. Map tokens

- The atlas, the shader, the token draw, the fan, the HP arc, the 20 px
  rule, the switches in the map's gear and in Settings → Mapper.
- The hue shared between the worker and the main thread.
- The bench scene and its numbers.

Done when: with the group fixture, you and the members are tokens at
zoom 1 and boxes below 20 px a room; five in one room is a fan with
`+1`; a hurt member has an arc and a healthy one none; the switch turns
both off and the map is pixel-equal to before the stage with tokens off
(compare against the existing map screenshots/tests); the bench numbers
are in the ADR and within the rule; `map-render.spec` and the other map
e2e are green, with a new file for tokens.

### C. Group tokens and the scaling rows

- Tokens in the rows, the R3 ring, the click to the picker for a member,
  member assignments, NPC matching.
- The row scaling of §8 and the ADR 0122 addendum.

Done when: for 1, 3, 6, 10 and 20 members and pane heights from the
smallest to a tall one, the rows follow the table in §8 (unit tests on
the pure layout function for every step and its edges; e2e screenshots
at a few sizes); no row height changes on a vitals update; a click on a
token opens the picker for that name and the assignment shows in the
pane and on the map; "a trained horse" gets the horse; with
`group.tokens` off the pane has marker icons and scaled rows;
`group-pane.spec` is green or updated where the layout rule changed on
purpose (say which tests changed and why).

### D. Own images

- The crop step, the encode, the shelf, the two sync kinds, the limits
  in the worker, the migration if the limits need one.

Done when: with the local worker (`scripts/dev-cloud.ts`,
`test:sync-worker`), an image added in one browser context shows in a
second one logged in to the same account, as the portrait and as a
token; the 51st image and an image over the size are refused with a
plain message; removing an image in use resets the looks that used it;
logged out the tab shows the login card and no own image is shown; the
worker's tests cover the count, the size and the budget; the sync tests
are green.

### E. The directory

- The table and its migration, the three routes, validation, the owner
  rule, limits, the Cron's pruning, the admin count and removal, the
  flag.
- The client: report, ask, the cache, the switch, the take-over at
  login.
- The privacy text, "What the site knows", the spec §7 section.
- Deploy to staging and `test:prod` there.

Done when: worker tests for every route, the owner rule (first owner,
refusal, the 30 days, the take-over), validation of every field,
the limits and the pruning; an e2e with two browser contexts and two
characters in one group in which each sees the other's reported look
and library token, and sees the neutral silhouette for a third name;
with the flag off no call is made (a test checks the requests); with
`shareLook` off nothing is reported and the rows are removed; nothing
is awaited in the game path; staging is deployed with the migration
applied and `test:prod` is green there; production's flag is off in
`wrangler.jsonc`.

### F. Phone and tablet

§10. Done when: tokens show in the lens and in the phone's and tablet's
group views; the picker page works by touch in the phone and tablet e2e
projects; the screenshots are in the test guide; the existing phone and
tablet e2e are green.

### At the end

- The full unit, e2e (5 workers, alone), worker and `test:prod` runs,
  and `npm run typecheck`, all green; the benches run and compared.
- `npm run build:site` passes (it has the checks and the smoke test).
- A last look at the real client against the mockup, on desktop, phone
  and tablet sizes, in Chromium and in Firefox.
- The documents below, the test guide, the log.

## Documents

- **ADRs** (new numbers from 0169): the look model and the order of its
  sources; the library (the build, the ids, the permission); own images
  and the shelf (the limits, the budget of their own); map tokens in the
  renderer (the atlas, the shader, the bench numbers); the directory
  (what it stores, the owner rule, the privacy reasoning above). An
  addendum to ADR 0122 for the scaling rows.
- **`spec.md`**: a section §7.14 "Shared looks" (the routes, the table
  in §7.11, the limits in §7.10, the flag), the two sync kinds in §7.4,
  and a short section for looks and tokens where the panes are specified.
- **`intent.md`**: Goal 16 and the constraint's sentence are already in
  (2026-11-26). Do not change the intent further.
- **The privacy text and About**, the manual or help pages that describe
  the Character, Group and Map panes, and `README.md` only if a sentence
  there became wrong (the pictures in it are the owner's to renew).
- **`THIRD_PARTY_NOTICES.md`** and the credits page.
- **`progress.md`**: the stage table and the session log.

## Tasks

- [x] Brainstorm, mockup rounds 1 and 2, the owner's decisions 1–24.
- [ ] A. The library, the look model, the picker, the Character pane
- [ ] B. Map tokens
- [ ] C. Group tokens and the scaling rows
- [ ] D. Own images
- [ ] E. The directory, staging
- [ ] F. Phone and tablet
- [ ] The end checks, the documents, the test guide, the log

## Test guide

Written by the night run for what was built. It must say: what to
restart (the dev server on 5173), what to open, the steps for each part,
how to test shared looks with two browsers on staging, the phone and
tablet screenshots, and what feedback is wanted.

## Decided in the night

(the night run writes here)

## Owner feedback

(none yet)

## The kickoff prompt

Paste this into a new session (Opus 5.5) in `/home/ole/proj/webcockpit`:

> Bygg steg 80 i natt, utan att stanna för mig. Läs `CLAUDE.md`,
> `progress.md` och `docs/stages/80-character-tokens.md`: stegfilen är
> specen och dina regler för natten ("Night run"). Bygg delarna A–F i
> ordning med subagenter, verifiera varje del själv (tester, skärmbilder
> av den riktiga klienten mot mockupen) innan nästa börjar, och håll
> stegfilens uppgiftslista aktuell. Du får pusha `main` och driftsätta
> till staging, aldrig produktion, och du loggar inte in i MUME. Fråga
> mig ingenting: välj det som är lättast att ändra, skriv det under
> "Decided in the night" och fortsätt. Sluta med testguiden, ADR:erna och
> sessionsloggen, så att jag kan testa när jag vaknar.
